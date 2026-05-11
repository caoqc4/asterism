import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage } from '@shared/types/ipc';
import { selectApplicableWorkHabits as selectApplicableWorkHabitsFromList } from '@shared/work-habit-rules';
import { CONTEXT_COMPRESSION_THRESHOLD } from '@shared/settings-defaults';
import { PANEL_CAPTURE_SUMMARY_PREFIX } from '@shared/panel-capture';
import {
  selectApplicableWorkHabits,
  getPersistedWorkHabitStorageSnapshot,
  recordWorkHabitApplications,
  summarizeWorkHabitsForPrompt,
} from '../lib/workHabits';
import { buildTaskPlanningPrompt, getTaskAttributes, type TaskExecutionType } from '../lib/taskAttributes';

type MessageRole = 'user' | 'assistant';
type ContextStrategy = 'auto' | 'manual' | 'reminder';

interface Message {
  id: string;
  role: MessageRole;
  text: string;
  ts: string;
}

interface PendingCtxSwitch {
  taskId: string;
  taskTitle: string;
}

interface ManualRefreshReady {
  taskName: string | null;
}

interface TaskFileWriteProposal {
  path: string;
  summary: string;
  content: string;
}

function taskTitle(taskId: string | null, cache: Record<string, string>): string | null {
  if (!taskId) return null;
  return cache[taskId] ?? null;
}

function makeWelcomeMessage(taskTitle: string): Message {
  return {
    id: 'm0',
    role: 'assistant',
    text: `已切换到任务上下文：**${taskTitle}**。\n\n我会从任务记忆、执行记录、关键来源和工作习惯重新组装上下文。有什么需要讨论或推进的？`,
    ts: now(),
  };
}

function now() {
  return new Date().toLocaleTimeString('zh', { hour: '2-digit', minute: '2-digit' });
}

let msgCounter = 1;
function nextId() { return `m${msgCounter++}`; }

const TASK_TYPE_HABIT_LABELS: Record<TaskExecutionType, string> = {
  simple:    '一次性',
  project:   '项目型',
  scheduled: '定时任务',
  event:     '事件触发',
};

const MIN_SESSION_REFRESH_MESSAGE_LIMIT = 3;
const REFRESH_MESSAGE_LIMIT_THRESHOLD_STEP = 10;
const GENERIC_ASSISTANT_REPLY_PATTERNS = [
  /基于.*任务上下文/,
  /结合.*任务.*上下文/,
  /重点关注.*方向/,
  /建议下一步/,
  /当前任务处于正常推进中/,
  /需要我展开.*部分/,
];
const USER_CORRECTION_PATTERNS = [
  /不对/,
  /不是/,
  /刚才.*说错/,
  /前面.*错/,
  /改成/,
  /别.*要/,
  /不要.*要/,
];
const GENERIC_HANDOFF_PATTERNS = [
  /^下一步怎么推进$/,
  /^怎么推进$/,
  /^总结一下现在的状态$/,
  /^有什么风险需要注意$/,
  /^先看风险$/,
  /^再看来源$/,
  /^最后看下一步$/,
];

function buildTaskTypeReviewPrompt(taskName: string): string {
  return [
    `请判断「${taskName}」更适合哪种任务类型：一次性 / 定时重复 / 事件触发 / 项目型。`,
    '请先说明判断理由，再给出建议类型。',
    '如果是项目型，请只给高层级拆解方向，不要直接生成真实子任务；如果不是项目型，请说明下一步需要补齐什么上下文。',
  ].join('\n');
}

function normalizeUserMessage(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[，。！？、,.!?；;：:\s]/g, '');
}

function looksGenericAssistantReply(text: string): boolean {
  const normalized = text.replace(/\s+/g, '');
  return GENERIC_ASSISTANT_REPLY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function looksLikeUserCorrection(text: string): boolean {
  return USER_CORRECTION_PATTERNS.some((pattern) => pattern.test(text));
}

function deriveSessionRefreshMessageLimit(
  compressionThreshold: number = CONTEXT_COMPRESSION_THRESHOLD.default,
): number {
  return Math.max(
    MIN_SESSION_REFRESH_MESSAGE_LIMIT,
    Math.round(compressionThreshold / REFRESH_MESSAGE_LIMIT_THRESHOLD_STEP),
  );
}

function shouldSuggestSessionRefresh(
  messages: Message[],
  compressionThreshold: number = CONTEXT_COMPRESSION_THRESHOLD.default,
): { reason: string } | null {
  const userMessages = messages
    .filter((message) => message.role === 'user')
    .map((message) => normalizeUserMessage(message.text))
    .filter(Boolean);
  const messageLimit = deriveSessionRefreshMessageLimit(compressionThreshold);

  const counts = new Map<string, number>();
  for (const message of userMessages) {
    const next = (counts.get(message) ?? 0) + 1;
    if (userMessages.length >= 3 && next >= 3) {
      return { reason: '触发原因：同一个问题已重复出现 3 次。' };
    }
    counts.set(message, next);
  }
  if (userMessages.length >= messageLimit) {
    return { reason: `触发原因：当前会话已有 ${userMessages.length} 条用户消息，达到刷新阈值 ${messageLimit}。` };
  }

  const recentCorrectionCount = userMessages
    .slice(-4)
    .filter((message) => looksLikeUserCorrection(message)).length;
  if (userMessages.length >= 3 && recentCorrectionCount >= 2) {
    return { reason: '触发原因：最近多次出现改口或纠正，建议刷新任务会话。' };
  }

  const recentAssistantMessages = messages
    .filter((message) => message.role === 'assistant')
    .slice(-3);
  if (
    userMessages.length >= 3
    && recentAssistantMessages.length >= 3
    && recentAssistantMessages.every((message) => looksGenericAssistantReply(message.text))
  ) {
    return { reason: '触发原因：最近 3 次回复都偏泛化，建议刷新任务会话。' };
  }
  return null;
}

async function preserveSessionRefreshMemory(params: {
  taskId: string;
  taskTitle: string;
  messages: Message[];
}): Promise<boolean> {
  const userMessages = params.messages
    .filter((message) => message.role === 'user')
    .map((message) => message.text.trim())
    .filter(Boolean);
  if (userMessages.length === 0 || !hasSpecificHandoffSignal(userMessages)) return false;

  const recentFocus = userMessages.slice(-3).map((message) => truncateMemoryLine(message));
  const preferenceSignals = userMessages
    .filter((message) => /不要|别|希望|以后|默认|必须|尽量|偏好|习惯/.test(message))
    .slice(-2)
    .map((message) => truncateMemoryLine(message));
  const lastQuestion = recentFocus.at(-1) ?? '暂无';
  const content = [
    '# Record: 会话刷新前保全',
    '',
    '## Trigger',
    '刷新任务会话前，AI 判断当前讨论包含足够具体的可恢复信号。',
    '',
    '## Summary',
    `任务：${params.taskTitle}`,
    `用户消息数：${userMessages.length}`,
    `最近关注：${recentFocus.join(' / ')}`,
    '',
    '## Confirmed',
    `- 偏好变化候选：${preferenceSignals.length ? preferenceSignals.join(' / ') : '暂无明显候选'}`,
    '',
    '## Open',
    `- 未解决问题候选：${lastQuestion}`,
    '',
    '## Next',
    '- 刷新后继续围绕当前任务推进，避免依赖长聊天窗口恢复上下文。',
    '',
    '## Links',
    '- 用途：刷新会话前的保全式学习提取，只保存精选信号，不保存完整聊天全文。',
  ].join('\n');

  const sourceWritten = window.api?.createSourceContext
    ? await window.api.createSourceContext({
      taskId: params.taskId,
      title: '会话刷新前保全',
      kind: 'note',
      isKey: false,
      content,
      note: '自学习观察：会话刷新前保全关键决策、偏好变化和未解决问题。',
    }).then(() => true).catch(() => false)
    : false;
  const fileWritten = await writeTaskRecordFile({
    taskId: params.taskId,
    title: 'context-refresh-handoff',
    content,
  });
  return sourceWritten || fileWritten;
}

function hasSpecificHandoffSignal(userMessages: string[]): boolean {
  const recent = userMessages.slice(-5).map((message) => truncateMemoryLine(message, 160));
  const normalized = recent
    .map(normalizeUserMessage)
    .filter(Boolean)
    .filter((message) => !GENERIC_HANDOFF_PATTERNS.some((pattern) => pattern.test(message)));
  const unique = new Set(normalized);
  const combined = recent.join(' ');

  return unique.size >= 2
    || combined.length >= 48
    || /[A-Za-z]{3,}|[0-9]|\.md|\.ts|\.tsx|Playwright|MCP|API|RAG|任务拆解|验收|实现|优化文档/.test(combined);
}

async function preservePhaseCloseoutRecord(params: {
  taskId: string;
  taskTitle: string;
  messages: Message[];
}): Promise<void> {
  const meaningfulMessages = params.messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      text: truncateMemoryLine(message.text, 120),
    }))
    .filter((message) => message.text);
  if (meaningfulMessages.length === 0) return;

  const userMessages = meaningfulMessages.filter((message) => message.role === 'user');
  const assistantMessages = meaningfulMessages.filter((message) => message.role === 'assistant');
  const confirmed = userMessages.slice(-3).map((message) => `- ${message.text}`);
  const open = userMessages
    .filter((message) => /？|\?|怎么|是否|需要|风险|下一步/.test(message.text))
    .slice(-3)
    .map((message) => `- ${message.text}`);
  const next = assistantMessages.slice(-2).map((message) => `- ${message.text}`);
  const content = [
    '# Record: 阶段收尾',
    '',
    '## Trigger',
    '用户或 AI 判断当前任务讨论已形成可持久化阶段记录。',
    '',
    '## Summary',
    `任务：${params.taskTitle}`,
    `消息数：${meaningfulMessages.length}`,
    '',
    '## Confirmed',
    confirmed.length ? confirmed.join('\n') : '- 暂无明确确认项。',
    '',
    '## Open',
    open.length ? open.join('\n') : '- 暂无明确未解决问题。',
    '',
    '## Next',
    next.length ? next.join('\n') : '- 可继续拆解下一步执行任务、实现任务和验收任务。',
    '',
    '## Links',
    '- 来自右侧任务讨论面板的阶段收尾动作。',
  ].join('\n');

  await window.api?.createSourceContext?.({
    taskId: params.taskId,
    title: '阶段收尾记录',
    kind: 'note',
    isKey: false,
    content,
    note: '任务记录：阶段收尾、后续拆解和执行交接。',
  }).catch(() => undefined);
  await writeTaskRecordFile({
    taskId: params.taskId,
    title: 'phase-closeout',
    content,
  });
}

function truncateMemoryLine(value: string, limit = 80): string {
  const singleLine = value.replace(/\s+/g, ' ').trim();
  return singleLine.length > limit ? `${singleLine.slice(0, limit)}...` : singleLine;
}

function slugFilePart(value: string): string {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii.slice(0, 36) || 'task';
}

function normalizeTaskFilePath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

function buildTaskFileWriteProposal(params: {
  taskTitle: string;
  messages: Message[];
  selectedFilePath?: string | null;
}): TaskFileWriteProposal {
  const today = new Date().toISOString().slice(0, 10);
  const recent = params.messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .filter((message) => message.id !== 'm0')
    .slice(-8);
  const userFocus = recent
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => truncateMemoryLine(message.text, 120));
  const path = `${today}-${slugFilePart(params.taskTitle)}-discussion.md`;
  const content = [
    `# ${params.taskTitle} Discussion Notes`,
    '',
    '## Source',
    '- Created from the right-panel task discussion after user confirmation.',
    params.selectedFilePath ? `- Selected file context: ${params.selectedFilePath}` : null,
    '',
    '## Summary',
    userFocus.length ? userFocus.map((item) => `- ${item}`).join('\n') : '- No focused user message captured yet.',
    '',
    '## Conversation Notes',
    ...recent.map((message) => `- ${message.role === 'user' ? 'User' : 'AI'}: ${truncateMemoryLine(message.text, 180)}`),
    '',
    '## Next',
    '- Review this draft and decide whether it should become a task record, working document, or implementation input.',
    '',
  ].filter((line): line is string => line !== null).join('\n');
  return {
    path,
    summary: userFocus[0] ?? '从当前任务讨论生成 Markdown 草稿。',
    content,
  };
}

function buildMinimalTaskRecord(taskName: string, importantFilePath: string): string {
  return [
    '# Task',
    '',
    '## Goal',
    taskName,
    '',
    '## Current Progress',
    'No summary recorded yet.',
    '',
    '## Key Context',
    'No key files or sources linked yet.',
    '',
    '## Decisions',
    'No durable decisions recorded in this task file yet.',
    '',
    '## Constraints',
    'No active constraint recorded.',
    '',
    '## Open Questions',
    'No open questions recorded yet.',
    '',
    '## Next Step',
    'Clarify the next step.',
    '',
    '## Important Files',
    `- ${importantFilePath}`,
    '',
    '## Recent Records',
    'Task Records/ is ready for durable handoffs and milestone notes.',
    '',
  ].join('\n');
}

function appendImportantFileToTaskRecord(content: string, filePath: string): string {
  if (content.includes(filePath)) return content;
  const marker = '## Important Files';
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => line.trim() === marker);
  if (start === -1) {
    return [
      content.trimEnd(),
      '',
      marker,
      `- ${filePath}`,
      '',
    ].join('\n');
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index]?.trim() ?? '')) {
      end = index;
      break;
    }
  }
  const before = lines.slice(0, end);
  const after = lines.slice(end);
  const existingSection = lines.slice(start + 1, end).map((line) => line.trim()).filter(Boolean);
  const placeholders = new Set(['No important files linked yet.', '暂无']);
  const cleanedBefore = placeholders.has(existingSection.join('\n'))
    ? lines.slice(0, start + 1)
    : before;
  return [
    ...cleanedBefore,
    `- ${filePath}`,
    ...after,
  ].join('\n');
}

async function referenceTaskFileFromTaskRecord(params: {
  taskId: string;
  taskName: string;
  filePath: string;
}): Promise<void> {
  if (!window.api?.listTaskFiles || !window.api.createTaskFile || !window.api.updateTaskFile) return;
  const files = await window.api.listTaskFiles(params.taskId).catch(() => []);
  const taskRecord = files.find((file) => file.path === 'Task.md');
  if (taskRecord) {
    await window.api.updateTaskFile({
      id: taskRecord.id,
      content: appendImportantFileToTaskRecord(taskRecord.content, params.filePath),
    }).catch(() => undefined);
    return;
  }
  await window.api.createTaskFile({
    taskId: params.taskId,
    name: 'Task.md',
    path: 'Task.md',
    kind: 'file',
    content: buildMinimalTaskRecord(params.taskName, params.filePath),
  }).catch(() => undefined);
}

async function writeTaskRecordFile(params: {
  taskId: string;
  title: string;
  content: string;
}): Promise<boolean> {
  if (!window.api?.createTaskFile) return false;
  const today = new Date().toISOString().slice(0, 10);
  const name = `${today}-${params.title}.md`;
  return window.api.createTaskFile({
    taskId: params.taskId,
    name,
    path: `Task Records/${name}`,
    kind: 'file',
    content: params.content,
  }).then(() => true).catch(() => false);
}

interface RightPanelProps {
  taskId: string | null;
  taskTitleHint?: string | null;
  draftPrompt?: string | null;
  selectedFile?: {
    path: string;
    kind: string;
    dirty?: boolean;
    contentPreview: string | null;
  } | null;
  hidden?: boolean;
  onTaskCaptured?: (taskId: string) => void;
  onClose: (hasSession: boolean) => void;
  onClearTask: () => void;
}

export function RightPanel({ taskId, taskTitleHint = null, draftPrompt = null, selectedFile = null, hidden = false, onTaskCaptured, onClose, onClearTask }: RightPanelProps) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(taskId);
  const [titleCache, setTitleCache] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingSwitch, setPendingSwitch] = useState<PendingCtxSwitch | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessionRefreshDismissed, setSessionRefreshDismissed] = useState(false);
  const [contextStrategy, setContextStrategy] = useState<ContextStrategy>('auto');
  const [manualRefreshReady, setManualRefreshReady] = useState<ManualRefreshReady | null>(null);
  const [compressionThreshold, setCompressionThreshold] = useState<number>(
    CONTEXT_COMPRESSION_THRESHOLD.default,
  );
  const [capturingTask, setCapturingTask] = useState(false);
  const [confirmingCapturedTask, setConfirmingCapturedTask] = useState(false);
  const [pendingCapturedTaskId, setPendingCapturedTaskId] = useState<string | null>(null);
  const [abandonConfirmOpen, setAbandonConfirmOpen] = useState(false);
  const [abandoningCapturedTask, setAbandoningCapturedTask] = useState(false);
  const [phaseCloseoutSaved, setPhaseCloseoutSaved] = useState(false);
  const [savingPhaseCloseout, setSavingPhaseCloseout] = useState(false);
  const [creatingFollowupTasks, setCreatingFollowupTasks] = useState(false);
  const [followupTasksCreated, setFollowupTasksCreated] = useState(false);
  const [taskFileProposal, setTaskFileProposal] = useState<TaskFileWriteProposal | null>(null);
  const [savingTaskFileProposal, setSavingTaskFileProposal] = useState(false);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch task title and seed welcome message when panel first opens with a task
  useEffect(() => {
    if (!taskId) return;
    if (taskTitleHint) {
      setTitleCache((prev) => ({ ...prev, [taskId]: taskTitleHint }));
      setMessages([makeWelcomeMessage(taskTitleHint)]);
      return;
    }
    if (titleCache[taskId]) {
      setMessages([makeWelcomeMessage(titleCache[taskId])]);
      return;
    }
    window.api?.getTaskDetail(taskId).then((d) => {
      if (!d) return;
      setTitleCache((prev) => ({ ...prev, [taskId]: d.title }));
      setMessages([makeWelcomeMessage(d.title)]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    window.api?.getAiConfigStatus().then((status) => {
      setCompressionThreshold(
        status.featureFlags.contextCompressionThreshold ?? CONTEXT_COMPRESSION_THRESHOLD.default,
      );
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!draftPrompt || !taskId || taskId !== activeTaskId) return;
    setInput(draftPrompt);
    textareaRef.current?.focus();
  }, [activeTaskId, draftPrompt, taskId]);

  // When taskId changes from outside (e.g. clicking a different task)
  useEffect(() => {
    if (taskId === activeTaskId) return;
    if (taskId === null) {
      setActiveTaskId(null);
      setPendingSwitch(null);
      setManualRefreshReady(null);
      return;
    }
    // Fetch title if not cached, then propose soft context switch
    const fetchAndPropose = async () => {
      let title = taskTitleHint ?? titleCache[taskId];
      if (taskTitleHint) {
        setTitleCache((prev) => ({ ...prev, [taskId]: taskTitleHint }));
      }
      if (!title && window.api) {
        const d = await window.api.getTaskDetail(taskId).catch(() => null);
      if (d) {
          title = d.title;
          setTitleCache((prev) => ({ ...prev, [taskId]: title }));
        }
      }
      if (title) setPendingSwitch({ taskId, taskTitle: title });
    };
    void fetchAndPropose();
  }, [taskId]);

  function confirmSwitch() {
    if (!pendingSwitch) return;
    setActiveTaskId(pendingSwitch.taskId);
    setPendingSwitch(null);
    setSessionRefreshDismissed(false);
    setManualRefreshReady(null);
    setPhaseCloseoutSaved(false);
    setFollowupTasksCreated(false);
    setTaskFileProposal(null);
    appendSysMsg(`已切换到任务：**${pendingSwitch.taskTitle}**`);
  }

  function dismissSwitch() {
    setPendingSwitch(null);
    onClearTask();
  }

  function appendSysMsg(text: string) {
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'assistant', text, ts: now() },
    ]);
  }

  async function archiveTaskConversationIfNeeded() {
    const taskName = title ?? (activeTaskId ? titleCache[activeTaskId] ?? activeTaskId : null);
    const userMessages = messages
      .filter((message) => message.role === 'user')
      .map((message) => message.text.trim())
      .filter(Boolean);
    let archived = false;
    if (activeTaskId && userMessages.length > 0) {
      archived = await preserveSessionRefreshMemory({
        taskId: activeTaskId,
        taskTitle: taskName ?? activeTaskId,
        messages,
      });
    }
    return {
      taskName,
      archived,
      userMessageCount: userMessages.length,
      recentFocus: userMessages.slice(-3).map((message) => truncateMemoryLine(message, 80)),
    };
  }

  function clearTaskSessionAfterArchive(taskName: string | null) {
    setMessages(taskName ? [makeWelcomeMessage(taskName)] : []);
    setHistoryOpen(false);
    setSessionRefreshDismissed(false);
    setManualRefreshReady(null);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleMissingRefreshArchive() {
    if (activeTaskId) {
      appendSysMsg('这次刷新前的保全信息还不够具体，暂不清理当前任务会话。请先补充已确认结论、候选方案、未解决问题或下一步动作。');
      setSessionRefreshDismissed(true);
    }
  }

  async function refreshTaskSession() {
    const { taskName, archived } = await archiveTaskConversationIfNeeded();
    if (activeTaskId && !archived) {
      handleMissingRefreshArchive();
      return;
    }
    clearTaskSessionAfterArchive(taskName);
  }

  async function prepareManualTaskSessionRefresh() {
    const { taskName, archived, userMessageCount, recentFocus } = await archiveTaskConversationIfNeeded();
    if (activeTaskId && !archived) {
      handleMissingRefreshArchive();
      return;
    }
    setManualRefreshReady({ taskName });
    appendSysMsg([
      '已整理并归档当前任务讨论的关键记录。',
      `归档摘要：用户消息 ${userMessageCount} 条；最近关注：${recentFocus.length ? recentFocus.join(' / ') : '暂无' }。`,
      '请检查是否还要补充事实；确认无误后再刷新任务会话。',
    ].join('\n'));
  }

  async function startNewConversation() {
    await archiveTaskConversationIfNeeded();
    setMessages([]);
    setActiveTaskId(null);
    setPendingSwitch(null);
    setPendingCapturedTaskId(null);
    setAbandonConfirmOpen(false);
    setHistoryOpen(false);
    setSessionRefreshDismissed(false);
    setManualRefreshReady(null);
    setPhaseCloseoutSaved(false);
    setFollowupTasksCreated(false);
    setTaskFileProposal(null);
    setInput('');
    onClearTask();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function getLastUserMessage(): string | null {
    const last = [...messages].reverse().find((message) => message.role === 'user');
    return last?.text.trim() || null;
  }

  function deriveCapturedTaskTitle(text: string): string {
    const firstLine = text.split('\n').find((line) => line.trim())?.trim() ?? text.trim();
    return firstLine.length > 42 ? `${firstLine.slice(0, 42)}…` : firstLine;
  }

  async function captureGlobalConversationAsTask() {
    const lastUserText = getLastUserMessage();
    if (!lastUserText || capturingTask || !window.api?.createTask) return;
    setCapturingTask(true);
    try {
      const created = await window.api.createTask({
        title: deriveCapturedTaskTitle(lastUserText),
        summary: `${PANEL_CAPTURE_SUMMARY_PREFIX}${lastUserText}`,
      });
      setActiveTaskId(created.id);
      setPendingCapturedTaskId(created.id);
      setAbandonConfirmOpen(false);
      setTitleCache((prev) => ({ ...prev, [created.id]: created.title }));
      onTaskCaptured?.(created.id);
      appendSysMsg(`已捕获为任务：**${created.title}**（待确认）。接下来先让 AI 判断任务类型，必要时补齐上下文或拆解；确认后才进入 Tasks，真实子任务仍需你确认。`);
    } catch {
      appendSysMsg('捕获任务失败，请稍后再试。');
    } finally {
      setCapturingTask(false);
    }
  }

  async function confirmCapturedTask() {
    if (!activeTaskId || pendingCapturedTaskId !== activeTaskId || confirmingCapturedTask) return;
    setConfirmingCapturedTask(true);
    try {
      await window.api?.transitionTask({ id: activeTaskId, nextState: 'planned' });
      setPendingCapturedTaskId(null);
      setAbandonConfirmOpen(false);
      appendSysMsg('已确认加入 Tasks。你可以继续在这里规划，也可以回到任务列表推进。');
    } catch {
      appendSysMsg('确认任务失败，请稍后再试。');
    } finally {
      setConfirmingCapturedTask(false);
    }
  }

  async function closeoutCurrentPhase() {
    if (!activeTaskId || savingPhaseCloseout) return;
    const taskName = title ?? titleCache[activeTaskId] ?? activeTaskId;
    setSavingPhaseCloseout(true);
    try {
      await preservePhaseCloseoutRecord({
        taskId: activeTaskId,
        taskTitle: taskName,
        messages,
      });
      setPhaseCloseoutSaved(true);
      setFollowupTasksCreated(false);
      appendSysMsg('已保存阶段收尾记录到任务记忆。是否要根据这次收尾拆解下一步执行任务、实现任务和验收任务？');
    } finally {
      setSavingPhaseCloseout(false);
    }
  }

  async function createFollowupTasksFromCloseout() {
    if (!activeTaskId || creatingFollowupTasks || !window.api?.createTask) return;
    const taskName = title ?? titleCache[activeTaskId] ?? activeTaskId;
    setCreatingFollowupTasks(true);
    try {
      const drafts = [
        {
          title: `拆解下一步：${taskName}`,
          summary: `基于「${taskName}」的阶段收尾记录，梳理下一阶段执行任务、边界、依赖和验收口径。`,
        },
        {
          title: `实现调整：${taskName}`,
          summary: `基于「${taskName}」的阶段收尾记录，执行已确认的产品和实现调整。`,
        },
        {
          title: `验收回归：${taskName}`,
          summary: `基于「${taskName}」的阶段收尾记录，完成验收、回归测试和残余风险记录。`,
        },
      ];
      const created = await Promise.all(drafts.map(async (draft) => {
        const task = await window.api!.createTask(draft);
        await window.api?.transitionTask({ id: task.id, nextState: 'planned' }).catch(() => undefined);
        const sourceContent = [
          '# Record: 后续任务来源',
          '',
          '## Trigger',
          '由父任务阶段收尾后，经用户确认创建。',
          '',
          '## Summary',
          `父任务：${taskName}`,
          `后续任务：${draft.title}`,
          '',
          '## Confirmed',
          '- 该任务应读取父任务的阶段收尾记录、相关任务文件和产出文档后再执行。',
          '',
          '## Open',
          '- 执行前仍需确认范围、验收口径和是否需要拆成更小步骤。',
          '',
          '## Next',
          '- 先完成任务范围确认，再进入执行或验收。',
          '',
          '## Links',
          '- 来源：父任务阶段收尾记录。',
        ].join('\n');
        await window.api?.createSourceContext?.({
          taskId: task.id,
          title: '后续任务来源',
          kind: 'note',
          isKey: true,
          content: sourceContent,
          note: `由「${taskName}」阶段收尾创建。`,
        }).catch(() => undefined);
        await writeTaskRecordFile({
          taskId: task.id,
          title: 'followup-source',
          content: sourceContent,
        });
        return task;
      }));
      setFollowupTasksCreated(true);
      appendSysMsg(`已创建 ${created.length} 条后续任务：拆解下一步、实现调整、验收回归。它们已进入 Tasks，执行前仍应逐条确认范围。`);
    } finally {
      setCreatingFollowupTasks(false);
    }
  }

  function proposeTaskFileWrite() {
    if (!activeTaskId) return;
    const taskName = title ?? titleCache[activeTaskId] ?? activeTaskId;
    setTaskFileProposal(buildTaskFileWriteProposal({
      taskTitle: taskName,
      messages,
      selectedFilePath: selectedFile?.path ?? null,
    }));
  }

  async function confirmTaskFileWrite() {
    if (!activeTaskId || !taskFileProposal || savingTaskFileProposal || !window.api?.createTaskFile) return;
    const path = normalizeTaskFilePath(taskFileProposal.path);
    if (!path || !/\.(md|txt)$/i.test(path)) {
      appendSysMsg('任务文件写入已暂停：当前 v1 只允许新建 .md 或 .txt 文件。');
      return;
    }
    setSavingTaskFileProposal(true);
    try {
      const existing = window.api.listTaskFiles
        ? await window.api.listTaskFiles(activeTaskId).catch(() => [])
        : [];
      if (existing.some((file) => file.path === path)) {
        appendSysMsg(`任务文件写入已暂停：\`${path}\` 已存在。请换一个文件名后再确认写入。`);
        return;
      }
      const name = path.split('/').filter(Boolean).at(-1) ?? path;
      await window.api.createTaskFile({
        taskId: activeTaskId,
        name,
        path,
        kind: 'file',
        content: taskFileProposal.content,
      });
      await referenceTaskFileFromTaskRecord({
        taskId: activeTaskId,
        taskName: title ?? titleCache[activeTaskId] ?? activeTaskId,
        filePath: path,
      });
      setTaskFileProposal(null);
      appendSysMsg(`已写入任务文件：\`${path}\`。`);
    } finally {
      setSavingTaskFileProposal(false);
    }
  }

  async function abandonCapturedTask() {
    if (!activeTaskId || pendingCapturedTaskId !== activeTaskId || abandoningCapturedTask) return;
    if (!abandonConfirmOpen) {
      setAbandonConfirmOpen(true);
      return;
    }
    setAbandoningCapturedTask(true);
    try {
      await window.api?.transitionTask({ id: activeTaskId, nextState: 'archived' });
      setPendingCapturedTaskId(null);
      setAbandonConfirmOpen(false);
      setActiveTaskId(null);
      setManualRefreshReady(null);
      onClearTask();
      appendSysMsg('已放弃这条待确认任务，当前会话已回到全局。');
    } catch {
      appendSysMsg('放弃任务失败，请稍后再试。');
    } finally {
      setAbandoningCapturedTask(false);
    }
  }

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, thinking]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || thinking) return;
    setManualRefreshReady(null);
    setTaskFileProposal(null);

    const userMsg: Message = { id: nextId(), role: 'user', text, ts: now() };
    const historyForAI: ChatMessage[] = [
      ...messages.map((m) => ({ role: m.role, content: m.text })),
      { role: 'user', content: text },
    ];

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setThinking(true);

    let replyText: string;
    try {
      if (window.api?.chatWithAI) {
        const habitParams = {
          taskTitle: titleCache[activeTaskId ?? ''] ?? null,
          taskTypeLabel: activeAttrs ? TASK_TYPE_HABIT_LABELS[activeAttrs.type] : null,
          projectLabel: activeAttrs?.type === 'project' ? titleCache[activeTaskId ?? ''] ?? null : null,
        };
        const snapshot = await getPersistedWorkHabitStorageSnapshot().catch(() => null);
        const selectedHabits = snapshot
          ? selectApplicableWorkHabitsFromList(snapshot.habits, habitParams)
          : selectApplicableWorkHabits(habitParams);
        const appliedHabits = summarizeWorkHabitsForPrompt(selectedHabits);
        const res = await window.api.chatWithAI({
          messages: historyForAI,
          taskId: activeTaskId,
          workHabits: appliedHabits,
          selectedFile,
        });
        if (selectedHabits.length > 0) {
          const habitIds = selectedHabits.map((habit) => habit.id);
          if (window.api.recordWorkHabitApplications) {
            void window.api.recordWorkHabitApplications({ habitIds });
          } else {
            recordWorkHabitApplications(habitIds);
          }
        }
        replyText = res.text;
      } else {
        await new Promise((r) => setTimeout(r, 900 + Math.random() * 600));
        replyText = generateReply(text, activeTaskId);
      }
    } catch {
      replyText = generateReply(text, activeTaskId);
    }

    setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: replyText, ts: now() }]);
    setThinking(false);
  }

  const title = taskTitle(activeTaskId, titleCache);
  const activeAttrs = activeTaskId ? getTaskAttributes(activeTaskId) : null;
  const sessionRefreshSuggestion = activeTaskId && !sessionRefreshDismissed
    ? shouldSuggestSessionRefresh(messages, compressionThreshold)
    : null;
  const canManuallyRefreshTaskSession = Boolean(
    activeTaskId
    && contextStrategy === 'manual'
    && messages.some((message) => message.role === 'user')
  );
  const canCaptureGlobalConversation = Boolean(
    !activeTaskId
    && messages.some((message) => message.role === 'user')
  );
  const canCloseoutActiveTaskPhase = Boolean(
    activeTaskId
    && !phaseCloseoutSaved
    && messages.some((message) => message.role === 'user')
  );
  const canProposeTaskFileWrite = Boolean(
    activeTaskId
    && !taskFileProposal
    && messages.some((message) => message.role === 'user')
  );
  const taskPlanningPrompt = activeAttrs?.type && title
    ? buildTaskPlanningPrompt(title, activeAttrs.type, 'panel')
    : null;
  const taskTypeReviewPrompt = activeTaskId && title ? buildTaskTypeReviewPrompt(title) : null;
  const quickPrompts = activeTaskId
    ? [
        ...(taskPlanningPrompt
          ? [taskPlanningPrompt]
          : []),
        { label: '总结一下现在的状态', prompt: '总结一下现在的状态' },
        { label: '下一步怎么推进？', prompt: '下一步怎么推进？' },
        { label: '有什么风险需要注意？', prompt: '有什么风险需要注意？' },
      ]
    : [
        { label: '今天重点处理什么？', prompt: '今天重点处理什么？' },
        { label: '把待办整理成任务', prompt: '把这些待办整理成任务' },
        { label: '最近有什么需要跟进的？', prompt: '最近有什么需要跟进的？' },
      ];
  const hasSessionActivity = Boolean(activeTaskId || messages.length > 0 || input.trim());

  return (
    <div className={`right-panel${fullScreen ? ' fullscreen' : ''}${hidden ? ' hidden' : ''}`}>
      {/* Header */}
      <div className="panel-header">
        <div className="panel-header-ctx">
          {activeTaskId ? (
            <button className="panel-ctx-tag" onClick={onClearTask} title="离开任务上下文">
              <IconTask />
              <span>{title ?? activeTaskId}</span>
              <span className="ctx-tag-x">×</span>
            </button>
          ) : (
            <span className="panel-ctx-global">
              <IconGlobe />
              全局
            </span>
          )}
        </div>
        <div className="panel-header-actions">
          <button
            className={`icon-btn${historyOpen ? ' active' : ''}`}
            onClick={() => setHistoryOpen((value) => !value)}
            title="历史记录"
          >
            <IconHistory />
          </button>
          <button
            className="icon-btn"
            onClick={() => setFullScreen((value) => !value)}
            title={fullScreen ? '退出全屏' : '全屏显示'}
          >
            {fullScreen ? <IconMinimize /> : <IconMaximize />}
          </button>
          <button className="icon-btn" onClick={() => onClose(hasSessionActivity)} title="关闭面板">
            <IconClose />
          </button>
          {historyOpen && (
            <div className="panel-history-popover">
              <div className="panel-history-title">当前会话</div>
              <div className="panel-history-row">
                <span>上下文</span>
                <strong>{title ?? '全局'}</strong>
              </div>
              <div className="panel-history-row">
                <span>消息</span>
                <strong>{messages.length}</strong>
              </div>
              <div className="panel-history-note">
                当前会话只是临时工作内存；开始新会话会先归档有用任务信号，然后回到全局讨论。
              </div>
              <button className="btn sm ghost" onClick={() => void startNewConversation()}>
                开始新会话
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="panel-messages">
        {messages.length === 0 && (
          <div className="panel-empty">
            <p>围绕任务或想法说一句…</p>
            <span className="muted">重要内容会进入任务记忆，不依赖聊天窗口长期保存。</span>
            <div className="panel-prompts">
              {quickPrompts.map((p) => (
                <button key={p.label} className="panel-prompt-chip" onClick={() => { setInput(p.prompt); textareaRef.current?.focus(); }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Soft context switch banner */}
        {pendingSwitch && (
          <div className="panel-ctx-switch">
            <div className="panel-ctx-switch-text">
              <IconTask style={{ width: 12, height: 12 }} />
              <strong>{pendingSwitch.taskTitle}</strong> 上下文已可用
            </div>
            <div className="panel-ctx-switch-note">
              不会中断当前对话；上下文切换由你确认。
            </div>
            <div className="panel-ctx-switch-actions">
              <button className="btn sm primary" onClick={confirmSwitch}>切换到此任务</button>
              <button className="btn sm ghost" onClick={dismissSwitch}>保持全局</button>
            </div>
          </div>
        )}

        {sessionRefreshSuggestion && contextStrategy !== 'manual' && (
          <div className="panel-refresh-suggestion">
            <div className="panel-refresh-text">
              {contextStrategy === 'reminder'
                ? '这个任务的讨论已经有点长了。当前为仅提醒模式，不会提供会话刷新动作；需要清理时可切回自动检查或手动确认。'
                : '这个任务的讨论已经有点长了，可以刷新当前任务会话。刷新前会先保全关键决策、偏好变化和未解决问题；只保存精选信号，不保存完整聊天全文。'}
            </div>
            <div className="panel-refresh-reason">{sessionRefreshSuggestion.reason}</div>
            <div className="panel-refresh-actions">
              {contextStrategy === 'auto' && (
                <button className="btn sm primary" onClick={() => void refreshTaskSession()}>刷新任务会话</button>
              )}
              <button className="btn sm ghost" onClick={() => setSessionRefreshDismissed(true)}>继续当前会话</button>
            </div>
          </div>
        )}

        {canCaptureGlobalConversation && (
          <div className="panel-capture-suggestion">
            <div className="panel-capture-text">
              这段讨论可以先捕获为任务，之后再由 AI 判断类型、补齐上下文或拆解；不会直接执行。
            </div>
            <button
              className={`btn sm primary${capturingTask ? ' disabled' : ''}`}
              onClick={() => void captureGlobalConversationAsTask()}
              disabled={capturingTask}
            >
              {capturingTask ? '捕获中…' : '捕获为任务'}
            </button>
          </div>
        )}

        {canCloseoutActiveTaskPhase && (
          <div className="panel-capture-suggestion">
            <div className="panel-capture-text">
              这段任务讨论可以收成阶段记录，后续可基于记录继续拆解执行任务。
            </div>
            <button
              className={`btn sm primary${savingPhaseCloseout ? ' disabled' : ''}`}
              onClick={() => void closeoutCurrentPhase()}
              disabled={savingPhaseCloseout}
            >
              {savingPhaseCloseout ? '保存中…' : '收尾本阶段'}
            </button>
          </div>
        )}

        {canProposeTaskFileWrite && (
          <div className="panel-capture-suggestion">
            <div className="panel-capture-text">
              这段讨论可以先生成任务文件写入提案，确认后再新建 Markdown 文件。
            </div>
            <button className="btn sm ghost" onClick={proposeTaskFileWrite}>
              生成文件提案
            </button>
          </div>
        )}

        {taskFileProposal && (
          <div className="panel-file-proposal">
            <div className="panel-file-proposal-head">
              <strong>任务文件写入提案</strong>
              <span>新建文件，不覆盖现有文件</span>
            </div>
            <input
              className="panel-file-proposal-path"
              value={taskFileProposal.path}
              onChange={(event) => setTaskFileProposal((proposal) => (
                proposal ? { ...proposal, path: event.target.value } : proposal
              ))}
              aria-label="任务文件路径"
            />
            <div className="panel-refresh-reason">{taskFileProposal.summary}</div>
            <textarea
              className="panel-file-proposal-content"
              value={taskFileProposal.content}
              onChange={(event) => setTaskFileProposal((proposal) => (
                proposal ? { ...proposal, content: event.target.value } : proposal
              ))}
              aria-label="任务文件内容"
            />
            <div className="panel-refresh-actions">
              <button className="btn sm ghost" onClick={() => setTaskFileProposal(null)}>
                放弃
              </button>
              <button
                className={`btn sm primary${savingTaskFileProposal ? ' disabled' : ''}`}
                onClick={() => void confirmTaskFileWrite()}
                disabled={savingTaskFileProposal}
              >
                {savingTaskFileProposal ? '写入中…' : '确认写入文件'}
              </button>
            </div>
          </div>
        )}

        {activeTaskId && phaseCloseoutSaved && !followupTasksCreated && (
          <div className="panel-capture-suggestion">
            <div className="panel-capture-text">
              阶段记录已保存。可以基于这份记录创建三条后续任务：拆解下一步、实现调整、验收回归。
            </div>
            <button
              className={`btn sm primary${creatingFollowupTasks ? ' disabled' : ''}`}
              onClick={() => void createFollowupTasksFromCloseout()}
              disabled={creatingFollowupTasks}
            >
              {creatingFollowupTasks ? '创建中…' : '创建后续任务'}
            </button>
          </div>
        )}

        {activeTaskId && pendingCapturedTaskId === activeTaskId && (
          <div className="panel-capture-suggestion">
            <div className="panel-capture-text">
              这是待确认任务，确认后才会进入 Tasks 主列表；放弃需要二次确认，放弃后会归档这条捕获记录。
            </div>
            <button
              className={`btn sm primary${confirmingCapturedTask ? ' disabled' : ''}`}
              onClick={() => void confirmCapturedTask()}
              disabled={confirmingCapturedTask || abandoningCapturedTask}
            >
              {confirmingCapturedTask ? '确认中…' : '确认加入 Tasks'}
            </button>
            <button
              className={`btn sm ghost${abandoningCapturedTask ? ' disabled' : ''}`}
              onClick={() => void abandonCapturedTask()}
              disabled={confirmingCapturedTask || abandoningCapturedTask}
            >
              {abandoningCapturedTask ? '放弃中…' : abandonConfirmOpen ? '确认放弃' : '放弃'}
            </button>
          </div>
        )}

        {/* Thinking indicator */}
        {thinking && (
          <div className="panel-thinking">
            <span className="thinking-dot" />
            <span className="thinking-dot" />
            <span className="thinking-dot" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="panel-input-wrap">
        {activeTaskId && (
          <div className="panel-task-chip">
            <IconTask style={{ width: 10, height: 10 }} />
            {title ?? activeTaskId}
          </div>
        )}
        <div className="panel-context-strategy" aria-label="上下文策略">
          {([
            ['auto', '自动检查'],
            ['manual', '手动确认'],
            ['reminder', '仅提醒'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`panel-context-strategy-btn${contextStrategy === value ? ' active' : ''}`}
              onClick={() => {
                setContextStrategy(value);
                setSessionRefreshDismissed(false);
                setManualRefreshReady(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {canManuallyRefreshTaskSession && (
          <div className="panel-manual-refresh">
            <span>
              {manualRefreshReady
                ? '已归档关键记录；可以继续补充，或确认刷新当前任务会话。'
                : '手动确认模式：先整理归档，再由你确认是否清理会话。'}
            </span>
            <button
              className="btn sm ghost"
              onClick={() => {
                if (manualRefreshReady) {
                  clearTaskSessionAfterArchive(manualRefreshReady.taskName);
                  return;
                }
                void prepareManualTaskSessionRefresh();
              }}
            >
              {manualRefreshReady ? '确认刷新' : '整理归档'}
            </button>
          </div>
        )}
        {activeTaskId && !input.trim() && (taskTypeReviewPrompt || taskPlanningPrompt) && (
          <div className="panel-inline-prompts">
            {taskTypeReviewPrompt && (
              <button
                className="panel-prompt-chip"
                onClick={() => { setInput(taskTypeReviewPrompt); textareaRef.current?.focus(); }}
              >
                判断任务类型
              </button>
            )}
            {taskPlanningPrompt && (
              <button
                className="panel-prompt-chip"
                onClick={() => { setInput(taskPlanningPrompt.prompt); textareaRef.current?.focus(); }}
              >
                {taskPlanningPrompt.label}
              </button>
            )}
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="panel-input"
          placeholder={activeTaskId ? `关于「${title ?? activeTaskId}」…` : '搜索、提问或捕获任务想法…'}
          value={input}
          rows={1}
          onChange={(e) => { setInput(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
        />
        <div className="panel-input-foot">
          <span className="panel-hint muted">⏎ 发送  ⇧⏎ 换行</span>
          <button
            className={`btn sm primary${!input.trim() || thinking ? ' disabled' : ''}`}
            onClick={send}
            disabled={!input.trim() || thinking}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Message bubble ─── */

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const lines = message.text.split('\n').filter(Boolean);
  return (
    <div className={`msg${isUser ? ' msg-user' : ' msg-ai'}`}>
      {!isUser && (
        <div className="msg-avatar-ai">AI</div>
      )}
      <div className="msg-body">
        {lines.map((line, i) => {
          // Basic bold markdown: **text**
          const parts = line.split(/(\*\*[^*]+\*\*)/g);
          return (
            <p key={i}>
              {parts.map((part, j) =>
                part.startsWith('**') && part.endsWith('**')
                  ? <strong key={j}>{part.slice(2, -2)}</strong>
                  : part
              )}
            </p>
          );
        })}
        <span className="msg-ts">{message.ts}</span>
      </div>
    </div>
  );
}

/* ─── Mock reply generator ─── */

function generateReply(input: string, taskId: string | null): string {
  const lower = input.toLowerCase();
  if (lower.includes('状态') || lower.includes('情况')) {
    return taskId
      ? `当前任务处于正常推进中。根据最近的活动记录，上一次 Run 已完成主要步骤，等待你的进一步指令。\n\n建议下一步：确认输出方向后启动新 Run。`
      : `从全局来看，今日有 3 件高优先级事项待处理，其中 1 件已在 Running 状态。`;
  }
  if (lower.includes('风险') || lower.includes('问题')) {
    return `注意到以下潜在风险：\n\n1. 对方已等待超过 48 小时，回复优先级高\n2. 数据口径未确认，影响后续分析质量\n\n建议优先处理第 1 项。`;
  }
  if (lower.includes('下一步') || lower.includes('怎么')) {
    return taskId
      ? `建议下一步：\n\n1. 确认目标方向（5 分钟）\n2. 启动 Run，让 AI 完成初稿\n3. 审核输出后决策下一步行动`
      : `建议按 Tasks 默认排序处理：先解决 Escalate 任务，再处理 Unblock 项。`;
  }
  if (lower.includes('总结') || lower.includes('摘要')) {
    return `好的，我来整理一下当前任务的关键信息：\n\n**目标**：完成核心交付物\n**当前阻塞**：等待用户决策\n**下次行动**：拍板后可立即继续\n\n需要我展开某个部分吗？`;
  }
  return `明白了。${taskId ? '我会结合这个任务的上下文来帮你分析。' : '让我从全局视角来看这个问题。'}\n\n你希望我重点关注哪个方向？`;
}

/* ─── Icons ─── */

function IconClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="3" y1="3" x2="11" y2="11" />
      <line x1="11" y1="3" x2="3" y2="11" />
    </svg>
  );
}

function IconTask({ style }: { style?: React.CSSProperties }) {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <rect x="1.5" y="1.5" width="11" height="11" rx="2" />
      <polyline points="4,7 6,9 10,5" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7" cy="7" r="5.5" />
      <path d="M7 1.5C7 1.5 5 4 5 7s2 5.5 2 5.5M7 1.5C7 1.5 9 4 9 7s-2 5.5-2 5.5M1.5 7h11" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 7a5.5 5.5 0 1 0 1-3.2" />
      <polyline points="1.5,2 1.5,5 4.5,5" />
      <path d="M7 4.5v3l2 1.5" />
    </svg>
  );
}

function IconMaximize() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="5,2 2,2 2,5" />
      <polyline points="9,2 12,2 12,5" />
      <polyline points="5,12 2,12 2,9" />
      <polyline points="9,12 12,12 12,9" />
    </svg>
  );
}

function IconMinimize() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,5 5,5 5,2" />
      <polyline points="12,5 9,5 9,2" />
      <polyline points="2,9 5,9 5,12" />
      <polyline points="12,9 9,9 9,12" />
    </svg>
  );
}
