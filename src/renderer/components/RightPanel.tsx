import { useState, useRef, useEffect, useCallback, useReducer } from 'react';
import type { ChatMessage } from '@shared/types/ipc';
import type { RunStepRecord } from '@shared/types/run';
import {
  selectBlockingTaskMemoryGuidance,
  type TaskMemoryGuidanceState,
} from '@shared/task-memory-guidance-state';
import {
  buildTaskMemoryWriteApplyPlan,
  type TaskMemoryWriteProposal,
} from '@shared/task-memory-write-proposal';
import type { TaskDetail, TaskListItemRecord } from '@shared/types/task';
import { selectApplicableWorkHabits as selectApplicableWorkHabitsFromList } from '@shared/work-habit-rules';
import { CONTEXT_COMPRESSION_THRESHOLD } from '@shared/settings-defaults';
import { PANEL_CAPTURE_SUMMARY_PREFIX } from '@shared/panel-capture';
import { evaluateRuntimeAction } from '@shared/runtime-action-evaluator';
import {
  evaluateRuntimeIntake,
  type RuntimeIntakeEvaluation,
} from '@shared/runtime-intake-evaluator';
import {
  buildRuntimeContextAssemblyPolicy,
  buildRuntimeContextManifest,
  buildRuntimeContextSnapshot,
} from '@shared/runtime-context';
import {
  buildRuntimeHandoffPreview,
  buildRuntimeResumePlan,
  evaluateRuntimeHandoff,
} from '@shared/runtime-handoff';
import type { PanelRuntimeTimelineEventType } from '@shared/runtime-panel-events';
import {
  evaluateTaskRecordWorthiness,
  type TaskRecordWorthinessReason,
} from '@shared/task-record-worthiness';
import { evaluateTaskMemoryCoverage } from '@shared/task-memory-coverage';
import { evaluateTaskMdUpdateNeed } from '@shared/task-md-update-need';
import { isTaskMdPath, isTaskRecordPath } from '@shared/task-memory-path';
import { evaluateRuntimeVerification } from '@shared/runtime-verification';
import {
  classifyCreateTaskFileSurface,
  normalizeCreateTaskFileInput,
  type RuntimeSurfaceKind,
} from '@shared/runtime-surface-routing';
import {
  selectApplicableWorkHabits,
  getPersistedWorkHabitStorageSnapshot,
  recordWorkHabitApplications,
  summarizeWorkHabitsForPrompt,
} from '../lib/workHabits';
import {
  buildTaskPlanningPrompt,
  getTaskAttributes,
  type TaskExecutionType,
} from '../lib/taskAttributes';
import {
  guardDurablePanelAction,
  guardTaskCapture,
  guardTaskStateTransition,
  verifyDurablePanelActionCompleted,
} from '../lib/runtimeActionGuards';
import { orderedChildRecordsForTask } from '../lib/taskHierarchyAdapter';

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
  surface: RuntimeSurfaceKind;
  surfaceLabel: string;
  taskMemoryProposal?: TaskMemoryWriteProposal | null;
}

interface PanelSessionState {
  abandonConfirmOpen: boolean;
  activeTaskId: string | null;
  input: string;
  manualRefreshReady: ManualRefreshReady | null;
  pendingCapturedTaskId: string | null;
  pendingSwitch: PendingCtxSwitch | null;
  phaseCloseoutNotice: string | null;
  phaseCloseoutSaved: boolean;
  sessionRefreshDismissed: boolean;
  taskFileProposal: TaskFileWriteProposal | null;
}

type PanelSessionPatch = Partial<PanelSessionState>;

type PanelSessionAction =
  | { type: 'patch'; patch: PanelSessionPatch }
  | { type: 'apply_task_context'; taskId: string }
  | { type: 'clear_task_context' }
  | { type: 'reset_task_transients' };

function createPanelSessionState(taskId: string | null): PanelSessionState {
  return {
    abandonConfirmOpen: false,
    activeTaskId: taskId,
    input: '',
    manualRefreshReady: null,
    pendingCapturedTaskId: null,
    pendingSwitch: null,
    phaseCloseoutNotice: null,
    phaseCloseoutSaved: false,
    sessionRefreshDismissed: false,
    taskFileProposal: null,
  };
}

function clearTaskScopedTransients(state: PanelSessionState): PanelSessionState {
  return {
    ...state,
    abandonConfirmOpen: false,
    input: '',
    manualRefreshReady: null,
    pendingCapturedTaskId: null,
    pendingSwitch: null,
    phaseCloseoutNotice: null,
    phaseCloseoutSaved: false,
    sessionRefreshDismissed: false,
    taskFileProposal: null,
  };
}

function panelSessionReducer(state: PanelSessionState, action: PanelSessionAction): PanelSessionState {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    case 'apply_task_context':
      return {
        ...clearTaskScopedTransients(state),
        activeTaskId: action.taskId,
      };
    case 'clear_task_context':
      return {
        ...clearTaskScopedTransients(state),
        activeTaskId: null,
      };
    case 'reset_task_transients':
      return clearTaskScopedTransients(state);
  }
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

function makeTaskSessionRefreshedMessage(taskTitle: string): Message {
  return {
    id: nextId(),
    role: 'assistant',
    text: `已自动整理并刷新「${taskTitle}」的任务会话。关键恢复信息已写入任务记忆，接下来会从任务记忆重新组装上下文。`,
    ts: now(),
  };
}

function now() {
  return new Date().toLocaleTimeString('zh', { hour: '2-digit', minute: '2-digit' });
}

let msgCounter = 1;
function nextId() { return `m${msgCounter++}`; }

function buildPanelRuntimeStep(params: {
  title: string;
  output?: string | null;
  error?: string | null;
}): RunStepRecord {
  const timestamp = new Date().toISOString();
  return {
    id: `panel_step_${timestamp}`,
    runId: 'panel_lightweight',
    index: 1,
    kind: 'final',
    status: params.error ? 'failed' : 'completed',
    title: params.title,
    input: null,
    output: params.output ?? null,
    error: params.error ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const TASK_TYPE_HABIT_LABELS: Record<TaskExecutionType, string> = {
  simple:    '一次性',
  project:   '项目型',
  scheduled: '定时任务',
  event:     '事件触发',
  routine:   '常设任务',
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

function hasTaskMdFile(task: TaskDetail | null): boolean | undefined {
  if (!task?.taskFiles) return undefined;
  return task.taskFiles.some((file) => isTaskMdPath(file.path));
}

function hasRelevantTaskRecordFile(task: TaskDetail | null): boolean | undefined {
  if (!task?.taskFiles) return undefined;
  return task.taskFiles.some((file) => isTaskRecordPath(file.path));
}

function hasKnownCompletionOrNextStep(task: TaskDetail | TaskListItemRecord | null): boolean | undefined {
  if (!task) return undefined;
  if ('completionCriteria' in task && task.completionCriteria.length > 0) return true;
  if (task.nextStep?.trim()) return true;
  if ('completionCriteria' in task) return false;
  return undefined;
}
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
    `请判断「${taskName}」更适合哪种任务类型：一次性 / 定时重复 / 事件触发 / 项目型 / 常设任务。`,
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
    return { reason: `触发原因：当前会话已有 ${userMessages.length} 条用户消息，达到会话检查阈值 ${messageLimit}。` };
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

  const canWriteSource = guardDurablePanelAction({ taskId: params.taskId, confirmed: true }).allowed;
  const sourceWritten = canWriteSource && window.api?.createSourceContext
    ? await window.api.createSourceContext({
      taskId: params.taskId,
      title: '会话刷新前保全',
      kind: 'note',
      isKey: false,
      content,
      note: '自学习观察：会话刷新前保全关键决策、偏好变化和未解决问题。',
      sourceRole: 'digest',
    }).then(() => true).catch(() => false)
    : false;
  if (sourceWritten) {
    verifyDurablePanelActionCompleted({
      title: '保存会话刷新来源',
      output: '已保存会话刷新前保全。',
    });
  }
  const fileWritten = await writeTaskRecordFile({
    taskId: params.taskId,
    title: 'context-refresh-handoff',
    content,
    reasonHint: 'context_clear_archive',
  });
  if (sourceWritten || fileWritten) {
    await recordPanelTimelineEvent(params.taskId, 'panel.context_refreshed', {
      sourceWritten,
      fileWritten,
      userMessageCount: userMessages.length,
    });
  }
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
}): Promise<{ recordPath: string | null }> {
  const meaningfulMessages = params.messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      text: truncateMemoryLine(message.text, 120),
    }))
    .filter((message) => message.text);
  if (meaningfulMessages.length === 0) return { recordPath: null };

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
    next.length ? next.join('\n') : '- 先执行阶段质量检查，再交接到已存在的下一项子任务；如无子任务，再回到规划入口补齐。',
    '',
    '## Links',
    '- 来自右侧任务讨论面板的阶段收尾动作。',
  ].join('\n');

  if (guardDurablePanelAction({ taskId: params.taskId, confirmed: true }).allowed) {
    const sourceWritten = await window.api?.createSourceContext?.({
      taskId: params.taskId,
      title: '阶段收尾记录',
      kind: 'note',
      isKey: false,
      content,
      note: '任务记录：阶段收尾、质量检查和执行交接。',
      sourceRole: 'digest',
    }).then(() => true).catch(() => false);
    if (sourceWritten) {
      verifyDurablePanelActionCompleted({
        title: '保存阶段收尾来源',
        output: '已保存阶段收尾记录。',
      });
    }
  }
  const recordWritten = await writeTaskRecordFile({
    taskId: params.taskId,
    title: 'phase-closeout',
    content,
    reasonHint: 'phase_closeout',
  });
  if (recordWritten) {
    await recordPanelTimelineEvent(params.taskId, 'panel.phase_closeout', {
      recordPath: `Task Records/${new Date().toISOString().slice(0, 10)}-phase-closeout.md`,
      messageCount: meaningfulMessages.length,
    });
  }
  return {
    recordPath: recordWritten ? `Task Records/${new Date().toISOString().slice(0, 10)}-phase-closeout.md` : null,
  };
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

function taskFileProposalSurfaceLabel(surface: RuntimeSurfaceKind): string {
  if (surface === 'task_state') return '任务说明';
  if (surface === 'task_record') return '任务记录';
  if (surface === 'artifact') return '产物';
  if (surface === 'ai_output') return 'AI 产出';
  return '任务文件';
}

function classifyTaskFileProposal(path: string): Pick<TaskFileWriteProposal, 'surface' | 'surfaceLabel'> {
  const normalizedPath = normalizeTaskFilePath(path);
  const name = normalizedPath.split('/').filter(Boolean).at(-1) ?? normalizedPath;
  const surface = classifyCreateTaskFileSurface({
    taskId: 'proposal',
    name,
    path: normalizedPath,
    kind: 'file',
  });
  return {
    surface,
    surfaceLabel: taskFileProposalSurfaceLabel(surface),
  };
}

function buildTaskFileProposalPath(params: {
  taskTitle: string;
  userFocus: string[];
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const titleSlug = slugFilePart(params.taskTitle);
  const focus = params.userFocus.join(' ');
  if (/记录|收尾|复盘|交接|保全|checkpoint|handoff|record/i.test(focus)) {
    return `Task Records/${today}-${titleSlug}-discussion.md`;
  }
  return `${today}-${titleSlug}-discussion.md`;
}

function buildTaskFileWriteProposal(params: {
  taskTitle: string;
  messages: Message[];
  selectedFilePath?: string | null;
}): TaskFileWriteProposal {
  const recent = params.messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .filter((message) => message.id !== 'm0')
    .slice(-8);
  const userFocus = recent
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => truncateMemoryLine(message.text, 120));
  const path = buildTaskFileProposalPath({
    taskTitle: params.taskTitle,
    userFocus,
  });
  const surface = classifyTaskFileProposal(path);
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
    ...surface,
  };
}

function taskMemoryProposalToFileProposal(proposal: TaskMemoryWriteProposal): TaskFileWriteProposal {
  const surface = proposal.target === 'task_md' ? 'task_state' : 'task_record';
  return {
    path: proposal.path,
    summary: proposal.reason,
    content: proposal.contentTemplate,
    surface,
    surfaceLabel: taskFileProposalSurfaceLabel(surface),
    taskMemoryProposal: proposal,
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
  if (!guardDurablePanelAction({ taskId: params.taskId, confirmed: true }).allowed) return;
  const files = await window.api.listTaskFiles(params.taskId).catch(() => []);
  const taskRecord = files.find((file) => isTaskMdPath(file.path));
  if (taskRecord) {
    const updateNeed = evaluateTaskMdUpdateNeed({
      hasTaskContext: true,
      existingTaskMdContent: taskRecord.content,
      importantFilePath: params.filePath,
      reasonHint: 'important_file',
    });
    if (!updateNeed.shouldUpdateTaskMd) return;
    const updated = await window.api.updateTaskFile({
      id: taskRecord.id,
      content: appendImportantFileToTaskRecord(taskRecord.content, params.filePath),
    }).catch(() => null);
    if (updated) {
      verifyDurablePanelActionCompleted({
        title: '更新任务说明引用',
        output: `已在 Task.md 引用 ${params.filePath}。`,
      });
    }
    return;
  }
  const createNeed = evaluateTaskMdUpdateNeed({
    hasTaskContext: true,
    importantFilePath: params.filePath,
    reasonHint: 'important_file',
  });
  if (!createNeed.shouldUpdateTaskMd) return;
  const created = await window.api.createTaskFile({
    taskId: params.taskId,
    name: 'Task.md',
    path: 'Task.md',
    kind: 'file',
    content: buildMinimalTaskRecord(params.taskName, params.filePath),
  }).catch(() => null);
  if (created) {
    verifyDurablePanelActionCompleted({
      title: '创建任务说明引用',
      output: `已创建 Task.md 并引用 ${params.filePath}。`,
    });
  }
}

async function writeTaskRecordFile(params: {
  taskId: string;
  title: string;
  content: string;
  reasonHint: TaskRecordWorthinessReason;
}): Promise<boolean> {
  if (!window.api?.createTaskFile) return false;
  if (!guardDurablePanelAction({ taskId: params.taskId, confirmed: true }).allowed) return false;
  const worthiness = evaluateTaskRecordWorthiness({
    text: params.content,
    hasTaskContext: true,
    reasonHint: params.reasonHint,
  });
  if (!worthiness.shouldCreateTaskRecord) return false;
  const today = new Date().toISOString().slice(0, 10);
  const name = `${today}-${params.title}.md`;
  const created = await window.api.createTaskFile({
    taskId: params.taskId,
    name,
    path: `Task Records/${name}`,
    kind: 'file',
    content: params.content,
  }).then(() => true).catch(() => false);
  if (created) {
    verifyDurablePanelActionCompleted({
      title: '写入任务记录',
      output: `已写入 Task Records/${name}。`,
    });
  }
  return created;
}

async function recordPanelTimelineEvent(
  taskId: string,
  type: PanelRuntimeTimelineEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  await window.api?.recordTaskTimelineEvent?.({
    taskId,
    type,
    payload,
  }).catch(() => undefined);
}

interface RightPanelProps {
  taskId: string | null;
  taskTitleHint?: string | null;
  draftPrompt?: string | null;
  autoSendDraftPrompt?: boolean;
  selectedFile?: {
    path: string;
    kind: string;
    dirty?: boolean;
    contentPreview: string | null;
  } | null;
  hidden?: boolean;
  onTaskCaptured?: (taskId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onClose: (hasSession: boolean) => void;
  onClearTask: () => void;
}

export function RightPanel({
  taskId,
  taskTitleHint = null,
  draftPrompt = null,
  autoSendDraftPrompt = false,
  selectedFile = null,
  hidden = false,
  onTaskCaptured,
  onOpenTask,
  onClose,
  onClearTask,
}: RightPanelProps) {
  const [sessionState, dispatchSession] = useReducer(panelSessionReducer, taskId, createPanelSessionState);
  const [titleCache, setTitleCache] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [fullScreen, setFullScreen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextStrategy, setContextStrategy] = useState<ContextStrategy>('auto');
  const [compressionThreshold, setCompressionThreshold] = useState<number>(
    CONTEXT_COMPRESSION_THRESHOLD.default,
  );
  const [capturingTask, setCapturingTask] = useState(false);
  const [confirmingCapturedTask, setConfirmingCapturedTask] = useState(false);
  const [abandoningCapturedTask, setAbandoningCapturedTask] = useState(false);
  const [savingPhaseCloseout, setSavingPhaseCloseout] = useState(false);
  const [savingTaskFileProposal, setSavingTaskFileProposal] = useState(false);
  const [thinking, setThinking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastAutoSentDraftPromptRef = useRef<string | null>(null);
  const lastAutoRefreshKeyRef = useRef<string | null>(null);
  const autoRefreshInFlightRef = useRef(false);
  const {
    abandonConfirmOpen,
    activeTaskId,
    input,
    manualRefreshReady,
    pendingCapturedTaskId,
    pendingSwitch,
    phaseCloseoutNotice,
    phaseCloseoutSaved,
    sessionRefreshDismissed,
    taskFileProposal,
  } = sessionState;
  const activeTaskIdRef = useRef(activeTaskId);

  useEffect(() => {
    activeTaskIdRef.current = activeTaskId;
  }, [activeTaskId]);

  function patchSession(patch: PanelSessionPatch) {
    dispatchSession({ type: 'patch', patch });
  }

  function setSessionInput(value: string) {
    patchSession({ input: value });
  }

  function updateTaskFileProposal(
    updater: TaskFileWriteProposal | null | ((current: TaskFileWriteProposal | null) => TaskFileWriteProposal | null),
  ) {
    patchSession({
      taskFileProposal: typeof updater === 'function'
        ? updater(taskFileProposal)
        : updater,
    });
  }

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
    if (!autoSendDraftPrompt || !draftPrompt || taskId !== activeTaskId) return;
    const key = `${taskId ?? 'global'}:${draftPrompt}`;
    if (lastAutoSentDraftPromptRef.current === key) return;
    lastAutoSentDraftPromptRef.current = key;
    void send(draftPrompt);
  }, [activeTaskId, autoSendDraftPrompt, draftPrompt, taskId]);

  // When taskId changes from outside (e.g. clicking a different task)
  useEffect(() => {
    if (taskId === activeTaskId) {
      if (pendingSwitch) patchSession({ pendingSwitch: null });
      return;
    }
    if (taskId === null) {
      dispatchSession({ type: 'clear_task_context' });
      return;
    }
    // Fetch title if not cached, then propose soft context switch
    const fetchAndPropose = async () => {
      let title = taskTitleHint ?? titleCache[taskId];
      if (taskTitleHint) {
        setTitleCache((prev) => (
          prev[taskId] === taskTitleHint ? prev : { ...prev, [taskId]: taskTitleHint }
        ));
      }
      if (!title && window.api) {
        const d = await window.api.getTaskDetail(taskId).catch(() => null);
      if (d) {
          title = d.title;
          setTitleCache((prev) => ({ ...prev, [taskId]: title }));
        }
      }
      if (title && (pendingSwitch?.taskId !== taskId || pendingSwitch.taskTitle !== title)) {
        patchSession({ pendingSwitch: { taskId, taskTitle: title } });
      }
    };
    void fetchAndPropose();
  }, [activeTaskId, pendingSwitch, taskId, taskTitleHint, titleCache]);

  function applyTaskContext(nextTaskId: string, nextTitle: string, options: { addMessage?: boolean } = {}) {
    setTitleCache((current) => ({ ...current, [nextTaskId]: nextTitle }));
    dispatchSession({ type: 'apply_task_context', taskId: nextTaskId });
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    if (options.addMessage !== false) {
      appendSysMsg(`已切换到任务：**${nextTitle}**`);
    }
  }

  async function confirmSwitch() {
    if (!pendingSwitch) return;
    const fromTaskId = activeTaskId;
    const targetSwitch = pendingSwitch;
    const { archived, hasSpecificSignal, userMessageCount } = await archiveTaskConversationIfNeeded();
    const taskMemoryGuidance = await getBlockingTaskMemoryGuidance(fromTaskId);
    const handoff = evaluateRuntimeHandoff({
      intent: 'switch_task',
      fromTaskId,
      toTaskId: targetSwitch.taskId,
      messageCount: userMessageCount,
      hasSpecificHandoffSignal: hasSpecificSignal,
      archived,
      taskMemoryGuidance,
    });
    if (!handoff.canProceed) {
      handleMissingRefreshArchive(handoff.reason);
      return;
    }
    if (fromTaskId) {
      await recordPanelTimelineEvent(fromTaskId, 'panel.context_switch_accepted', {
        toTaskId: targetSwitch.taskId,
        toTaskTitle: targetSwitch.taskTitle,
        archived,
        messageCount: userMessageCount,
        reason: handoff.reason,
      });
    }
    applyTaskContext(targetSwitch.taskId, targetSwitch.taskTitle);
  }

  async function dismissSwitch() {
    const dismissedSwitch = pendingSwitch;
    if (activeTaskId && dismissedSwitch) {
      await recordPanelTimelineEvent(activeTaskId, 'panel.context_switch_dismissed', {
        toTaskId: dismissedSwitch.taskId,
        toTaskTitle: dismissedSwitch.taskTitle,
        reason: '用户选择保留当前上下文。',
      });
    }
    patchSession({ pendingSwitch: null });
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
    const hasSpecificSignal = hasSpecificHandoffSignal(userMessages);
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
      hasSpecificSignal,
      userMessageCount: userMessages.length,
      recentFocus: userMessages.slice(-3).map((message) => truncateMemoryLine(message, 80)),
    };
  }

  async function getBlockingTaskMemoryGuidance(taskId: string | null): Promise<TaskMemoryGuidanceState | null> {
    if (!taskId || !window.api?.listRuns || !window.api?.getRunDetail) return null;
    const runs = await window.api.listRuns().catch(() => []);
    const taskRuns = runs
      .filter((run) => run.taskId === taskId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (taskRuns.length === 0) return null;
    const details = await Promise.all(
      taskRuns.map((run) => window.api!.getRunDetail(run.id).catch(() => null)),
    );
    const proposal = details
      .flatMap((detail) => detail?.taskMemoryWriteProposals ?? [])
      .find(Boolean);
    if (proposal) {
      updateTaskFileProposal((current) => current ?? taskMemoryProposalToFileProposal(proposal));
    }
    return selectBlockingTaskMemoryGuidance(details.map((detail) => detail?.taskMemoryGuidance));
  }

  function clearTaskSessionAfterArchive(taskName: string | null, options: { auto?: boolean } = {}) {
    setMessages(taskName
      ? [
          makeWelcomeMessage(taskName),
          ...(options.auto ? [makeTaskSessionRefreshedMessage(taskName)] : []),
        ]
      : []);
    setHistoryOpen(false);
    patchSession({
      input: '',
      manualRefreshReady: null,
      sessionRefreshDismissed: false,
    });
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleMissingRefreshArchive(reason?: string | null) {
    if (activeTaskId) {
      appendSysMsg([
        '这次刷新前的保全信息还不够具体，暂不清理当前任务会话。',
        reason && reason !== '任务会话缺少可恢复信号，暂不应清理。' ? reason : null,
        '请先补充已确认结论、候选方案、未解决问题或下一步动作。',
      ].filter(Boolean).join(' '));
      patchSession({ sessionRefreshDismissed: true });
    }
  }

  async function refreshTaskSession() {
    const { taskName, archived, hasSpecificSignal, userMessageCount } = await archiveTaskConversationIfNeeded();
    const taskMemoryGuidance = await getBlockingTaskMemoryGuidance(activeTaskId);
    const handoff = evaluateRuntimeHandoff({
      intent: 'context_refresh',
      fromTaskId: activeTaskId,
      messageCount: userMessageCount,
      hasSpecificHandoffSignal: hasSpecificSignal,
      archived,
      taskMemoryGuidance,
    });
    if (!handoff.canProceed) {
      handleMissingRefreshArchive(handoff.reason);
      return;
    }
    clearTaskSessionAfterArchive(taskName);
  }

  async function autoRefreshTaskSession(reason: string) {
    if (!activeTaskId || autoRefreshInFlightRef.current) return;
    autoRefreshInFlightRef.current = true;
    const autoTaskId = activeTaskId;
    try {
      const { taskName, archived, hasSpecificSignal, userMessageCount } = await archiveTaskConversationIfNeeded();
      const taskMemoryGuidance = await getBlockingTaskMemoryGuidance(autoTaskId);
      const handoff = evaluateRuntimeHandoff({
        intent: 'context_refresh',
        fromTaskId: autoTaskId,
        messageCount: userMessageCount,
        hasSpecificHandoffSignal: hasSpecificSignal,
        archived,
        taskMemoryGuidance,
      });
      if (activeTaskIdRef.current !== autoTaskId) return;
      if (!handoff.canProceed) {
        appendSysMsg(`自动刷新已暂停：${reason} ${handoff.reason}`);
        patchSession({ sessionRefreshDismissed: true });
        return;
      }
      if (!handoff.autoContextClear?.shouldAutoClear) {
        appendSysMsg(`自动刷新已保留当前会话：${reason} ${handoff.autoContextClear?.reason ?? handoff.reason}`);
        patchSession({ sessionRefreshDismissed: true });
        return;
      }
      clearTaskSessionAfterArchive(taskName, { auto: true });
    } finally {
      autoRefreshInFlightRef.current = false;
    }
  }

  async function prepareManualTaskSessionRefresh() {
    const {
      taskName,
      archived,
      hasSpecificSignal,
      userMessageCount,
      recentFocus,
    } = await archiveTaskConversationIfNeeded();
    const taskMemoryGuidance = await getBlockingTaskMemoryGuidance(activeTaskId);
    const handoff = evaluateRuntimeHandoff({
      intent: 'manual_context_refresh',
      fromTaskId: activeTaskId,
      messageCount: userMessageCount,
      hasSpecificHandoffSignal: hasSpecificSignal,
      archived,
      taskMemoryGuidance,
    });
    if (!handoff.canProceed) {
      handleMissingRefreshArchive(handoff.reason);
      return;
    }
    const preview = buildRuntimeHandoffPreview(handoff, {
      archived,
      messageCount: userMessageCount,
      recentFocus,
    });
    patchSession({ manualRefreshReady: { taskName } });
    appendSysMsg([
      preview.title,
      preview.detail,
      preview.nextAction,
    ].join('\n'));
  }

  async function startNewConversation() {
    const { archived, hasSpecificSignal, userMessageCount } = await archiveTaskConversationIfNeeded();
    const taskMemoryGuidance = await getBlockingTaskMemoryGuidance(activeTaskId);
    const handoff = evaluateRuntimeHandoff({
      intent: 'start_global_conversation',
      fromTaskId: activeTaskId,
      messageCount: userMessageCount,
      hasSpecificHandoffSignal: hasSpecificSignal,
      archived,
      taskMemoryGuidance,
    });
    if (!handoff.canProceed) {
      handleMissingRefreshArchive(handoff.reason);
      return;
    }
    setMessages([]);
    setHistoryOpen(false);
    dispatchSession({ type: 'clear_task_context' });
    onClearTask();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  async function leaveTaskContext() {
    const { archived, hasSpecificSignal, userMessageCount } = await archiveTaskConversationIfNeeded();
    const taskMemoryGuidance = await getBlockingTaskMemoryGuidance(activeTaskId);
    const handoff = evaluateRuntimeHandoff({
      intent: 'leave_task_context',
      fromTaskId: activeTaskId,
      messageCount: userMessageCount,
      hasSpecificHandoffSignal: hasSpecificSignal,
      archived,
      taskMemoryGuidance,
    });
    if (!handoff.canProceed) {
      handleMissingRefreshArchive(handoff.reason);
      return;
    }
    dispatchSession({ type: 'clear_task_context' });
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

  function describeIntakeRedirect(evaluation: RuntimeIntakeEvaluation): string {
    switch (evaluation.outcome) {
      case 'create_task_record':
        return '这更像当前任务记录/交接信息，应写入任务记录，而不是新建任务。';
      case 'propose_task_file':
        return '这更像任务文件或输出写入请求，应先生成写入提案，而不是直接捕获为任务。';
      case 'surface_decision':
        return '这更像需要拍板的事项，先不要直接捕获为任务。可以进入 Decisions 确认，或继续补充判断上下文。';
      case 'propose_work_habit':
        return '这更像跨任务工作习惯，应走工作习惯确认，而不是创建任务。';
      case 'continue_discussion':
        return evaluation.reason;
      case 'create_task':
        return evaluation.reason;
    }
  }

  async function captureGlobalConversationAsTask() {
    const lastUserText = getLastUserMessage();
    if (!lastUserText || capturingTask || !window.api?.createTask) return;
    const intakeEvaluation = evaluateRuntimeIntake({
      text: lastUserText,
      hasTaskContext: Boolean(activeTaskId),
      source: activeTaskId ? 'task_chat' : 'global_chat',
    });
    if (intakeEvaluation.outcome !== 'create_task' || !intakeEvaluation.allowed) {
      appendSysMsg(describeIntakeRedirect(intakeEvaluation));
      return;
    }
    const candidateTitle = intakeEvaluation.title ?? deriveCapturedTaskTitle(lastUserText);
    const existingTasks = await (window.api?.listTasks?.().catch(() => []) ?? Promise.resolve([]));
    const captureGuard = guardTaskCapture({
      fromTaskId: activeTaskId,
      messageCount: 1,
      confirmationSatisfied: true,
      candidateTitle,
      candidateSummary: lastUserText,
      existingTasks,
    });
    if (!captureGuard.allowed) {
      appendSysMsg(`捕获任务已暂停：${captureGuard.reason}`);
      return;
    }
    const actionEvaluation = evaluateRuntimeAction({
      action: 'task_capture',
      fromTaskId: activeTaskId,
      messageCount: 1,
    });
    const preStepVerification = evaluateRuntimeVerification({
      mode: 'pre_step',
      action: actionEvaluation,
      hasRequiredContext: true,
      confirmationSatisfied: true,
    });
    if (!preStepVerification.canProceed) {
      appendSysMsg(`捕获任务已暂停：${preStepVerification.detail}`);
      return;
    }
    setCapturingTask(true);
    try {
      const created = await window.api.createTask({
        title: candidateTitle,
        summary: `${PANEL_CAPTURE_SUMMARY_PREFIX}${lastUserText}`,
      });
      verifyDurablePanelActionCompleted({
        title: '捕获任务',
        output: `已捕获任务：${created.title}`,
      });
      patchSession({
        abandonConfirmOpen: false,
        activeTaskId: created.id,
        pendingCapturedTaskId: created.id,
      });
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
    const guard = guardTaskStateTransition({
      taskId: activeTaskId,
      nextState: 'planned',
      confirmationSatisfied: true,
    });
    if (!guard.allowed) {
      appendSysMsg(`确认任务已暂停：${guard.reason}`);
      return;
    }
    setConfirmingCapturedTask(true);
    try {
      await window.api?.transitionTask({ id: activeTaskId, nextState: 'planned' });
      patchSession({
        abandonConfirmOpen: false,
        pendingCapturedTaskId: null,
      });
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
    const closeoutTaskId = activeTaskId;
    const userMessageCount = messages.filter((message) => message.role === 'user').length;
    const actionEvaluation = evaluateRuntimeAction({
      action: 'phase_closeout',
      fromTaskId: closeoutTaskId,
      messageCount: userMessageCount,
    });
    const preStepVerification = evaluateRuntimeVerification({
      mode: 'pre_step',
      action: actionEvaluation,
      hasRequiredContext: true,
    });
    if (!preStepVerification.canProceed) {
      appendSysMsg(`阶段收尾已暂停：${preStepVerification.detail}`);
      return;
    }
    setSavingPhaseCloseout(true);
    try {
      const preserved = await preservePhaseCloseoutRecord({
        taskId: closeoutTaskId,
        taskTitle: taskName,
        messages,
      });
      const phaseCloseoutMemory = evaluateTaskMemoryCoverage({
        action: 'phase_closeout',
        hasTaskContext: true,
        chatMessageCount: messages.filter((message) => message.role === 'user' || message.role === 'assistant').length,
        hasSpecificHandoffSignal: hasSpecificHandoffSignal(
          messages
            .filter((message) => message.role === 'user')
            .map((message) => message.text),
        ),
        memoryWriteCompleted: Boolean(preserved.recordPath),
      });
      if (!phaseCloseoutMemory.canProceed) {
        patchSession({ phaseCloseoutNotice: `阶段收尾已暂停：${phaseCloseoutMemory.reason}` });
        appendSysMsg(`阶段收尾已暂停：${phaseCloseoutMemory.reason}`);
        return;
      }
      const postStepVerification = evaluateRuntimeVerification({
        mode: 'post_step',
        step: buildPanelRuntimeStep({
          title: '阶段收尾记录',
          output: preserved.recordPath ? `已写入任务记录：${preserved.recordPath}` : null,
          error: preserved.recordPath ? null : '阶段收尾任务记录写入失败。',
        }),
        producedDurableChange: true,
        hasTaskRecord: Boolean(preserved.recordPath),
        hasRecoveryNote: Boolean(preserved.recordPath),
      });
      if (!postStepVerification.canProceed) {
        patchSession({ phaseCloseoutNotice: `阶段收尾已暂停：${postStepVerification.detail}` });
        appendSysMsg(`阶段收尾已暂停：${postStepVerification.detail}`);
        return;
      }
      if (preserved.recordPath) {
        await referenceTaskFileFromTaskRecord({
          taskId: closeoutTaskId,
          taskName,
          filePath: preserved.recordPath,
        });
      }
      const [taskDetail, tasks] = await Promise.all([
        window.api?.getTaskDetail?.(closeoutTaskId).catch(() => null) ?? Promise.resolve(null),
        window.api?.listTasks?.().catch(() => []) ?? Promise.resolve([]),
      ]);
      if (!taskDetail) {
        patchSession({
          phaseCloseoutNotice: '阶段记录已保存，但暂时没有读取到完整任务详情。请回到任务详情确认状态后再继续交接。',
          phaseCloseoutSaved: true,
        });
        setMessages([
          {
            id: nextId(),
            role: 'assistant',
            text: `已保存「${taskName}」的阶段收尾记录，但暂时没有读取到完整任务详情。请回到任务详情确认状态后再继续交接。`,
            ts: now(),
          },
        ]);
        return;
      }
      const taskListRecord = tasks.find((task) => task.id === closeoutTaskId) ?? taskDetail;
      const orderedChildren = orderedChildRecordsForTask(taskListRecord, tasks, {});
      const evaluation = evaluateRuntimeVerification({
        mode: 'task_closeout',
        intent: 'phase_closeout',
        task: taskDetail,
        childTaskIds: taskListRecord.childTaskIds ?? [],
        childTasks: orderedChildren,
      }).taskCloseout;
      if (!evaluation) {
        throw new Error('阶段收尾检查未返回任务收尾结论。');
      }
      const taskMemoryGuidance = await getBlockingTaskMemoryGuidance(closeoutTaskId);
      const handoff = evaluateRuntimeHandoff({
        intent: 'phase_closeout',
        fromTaskId: closeoutTaskId,
        closeout: evaluation,
        recordPath: preserved.recordPath,
        taskMemoryGuidance,
      });
      if (!handoff.canProceed) {
        patchSession({ phaseCloseoutNotice: `阶段收尾已暂停：${handoff.reason}` });
        appendSysMsg(`阶段收尾已暂停：${handoff.reason}`);
        return;
      }
      await window.api?.recordTaskCompletionCheck?.({
        taskId: closeoutTaskId,
        action: 'passed',
        criteriaTotal: evaluation.criteriaTotal,
        criteriaSatisfied: evaluation.criteriaSatisfied,
        criteriaOpen: evaluation.criteriaOpen,
        reason: `阶段收尾自动检查：${evaluation.reason}`,
        runVerificationTone: evaluation.runVerificationTone,
        runVerificationLabel: evaluation.runVerificationLabel,
        runVerificationDetail: evaluation.runVerificationDetail,
        source: 'lightweight_rule_engine',
      }).catch(() => undefined);
      patchSession({
        phaseCloseoutNotice: `阶段记录已保存，质量检查已记录，会话已刷新。${evaluation.reason}`,
        phaseCloseoutSaved: true,
      });
      const nextTask = evaluation.nextTaskId
        ? tasks.find((task) => task.id === evaluation.nextTaskId) ?? null
        : null;
      const nextTaskDetail = nextTask
        ? await window.api?.getTaskDetail?.(nextTask.id).catch(() => null) ?? null
        : null;
      const nextTaskStartRecord = nextTask
        ? {
          ...(nextTaskDetail ?? nextTask),
          parentTaskId: (nextTaskDetail ?? nextTask).parentTaskId
            ?? (evaluation.nextTaskKind === 'existing_child' ? closeoutTaskId : null),
        }
        : null;
      const resumePlan = buildRuntimeResumePlan(handoff, handoff.action === 'handoff_to_task' && nextTask
        ? {
          subtaskStartInput: {
            targetTask: nextTaskStartRecord,
            parentTask: taskDetail,
            expectedParentTaskId: evaluation.nextTaskKind === 'existing_child' ? closeoutTaskId : null,
            previousTask: taskListRecord,
            requiresPreviousHandoff: true,
            previousHandoffAvailable: Boolean(preserved.recordPath),
            contextSignals: {
              targetTaskId: nextTask.id,
            },
            availableContext: {
              taskState: true,
              taskMd: hasTaskMdFile(nextTaskDetail),
              relevantTaskRecords: hasRelevantTaskRecordFile(nextTaskDetail),
              completionCriteria: hasKnownCompletionOrNextStep(nextTaskDetail ?? nextTask),
              nextStep: Boolean((nextTaskDetail ?? nextTask).nextStep?.trim()),
              parentConstraints: true,
              handoffNotes: Boolean(preserved.recordPath),
              sourceMaterials: nextTaskDetail ? nextTaskDetail.sourceContexts.length > 0 : undefined,
              decisions: true,
              files: nextTaskDetail?.taskFiles ? nextTaskDetail.taskFiles.length > 0 : undefined,
            },
          },
        }
        : {});
      if (handoff.action === 'handoff_to_task' && nextTask) {
        if (resumePlan.subtaskStart && !resumePlan.subtaskStart.canProceed) {
          patchSession({ phaseCloseoutNotice: `阶段收尾已保存，但进入下一任务前需要处理：${resumePlan.subtaskStart.detail}` });
          setMessages([
            {
              id: nextId(),
              role: 'assistant',
              text: `已完成「${taskName}」的阶段收尾：阶段记录已保存，质量检查已记录。进入「${nextTask.title}」前需要先处理：${resumePlan.subtaskStart.detail}`,
              ts: now(),
            },
          ]);
          return;
        }
        applyTaskContext(nextTask.id, nextTask.title, { addMessage: false });
        setMessages([
          makeWelcomeMessage(nextTask.title),
          {
            id: nextId(),
            role: 'assistant',
            text: `已完成「${taskName}」的阶段收尾：阶段记录已保存，质量检查已记录，本阶段会话已刷新。现在进入第一项子任务：**${nextTask.title}**。${resumePlan.nextAction}`,
            ts: now(),
          },
        ]);
        if (nextTask.state === 'captured' || nextTask.state === 'triaged') {
          await window.api?.transitionTask?.({ id: nextTask.id, nextState: 'planned' }).catch(() => undefined);
        }
        if (nextTask.state !== 'running' && nextTask.state !== 'waiting_external') {
          await window.api?.transitionTask?.({ id: nextTask.id, nextState: 'running' }).catch(() => undefined);
        }
        onOpenTask?.(nextTask.id);
        return;
      }
      setMessages([
        {
          id: nextId(),
          role: 'assistant',
          text: `已完成「${taskName}」的阶段收尾：阶段记录已保存，质量检查已记录，本阶段会话已刷新。${resumePlan.summary}`,
          ts: now(),
        },
      ]);
    } finally {
      setSavingPhaseCloseout(false);
    }
  }

  function proposeTaskFileWrite() {
    if (!activeTaskId) return;
    const taskName = title ?? titleCache[activeTaskId] ?? activeTaskId;
    updateTaskFileProposal(buildTaskFileWriteProposal({
      taskTitle: taskName,
      messages,
      selectedFilePath: selectedFile?.path ?? null,
    }));
  }

  async function confirmTaskFileWrite() {
    if (!activeTaskId || !taskFileProposal || savingTaskFileProposal || !window.api?.createTaskFile) return;
    const normalizedInput = normalizeCreateTaskFileInput({
      taskId: activeTaskId,
      name: normalizeTaskFilePath(taskFileProposal.path).split('/').filter(Boolean).at(-1) ?? taskFileProposal.path,
      path: taskFileProposal.path,
      kind: 'file',
      content: taskFileProposal.content,
    });
    const path = normalizedInput.path ?? normalizedInput.name;
    const memoryApplyPlan = taskFileProposal.taskMemoryProposal
      ? buildTaskMemoryWriteApplyPlan({
        proposal: {
          ...taskFileProposal.taskMemoryProposal,
          contentTemplate: taskFileProposal.content,
          path,
        },
        taskId: activeTaskId,
      })
      : null;
    if (memoryApplyPlan?.status === 'blocked') {
      appendSysMsg(`任务记忆写入已暂停：${memoryApplyPlan.reason}`);
      return;
    }
    if (!path || (!taskFileProposal.taskMemoryProposal && !/\.(md|txt)$/i.test(path))) {
      appendSysMsg('任务文件写入已暂停：当前 v1 只允许新建 .md 或 .txt 文件。');
      return;
    }
    const actionEvaluation = evaluateRuntimeAction({
      action: 'task_file_write_proposal',
      fromTaskId: activeTaskId,
      messageCount: messages.filter((message) => message.role === 'user').length,
    });
    const preStepVerification = evaluateRuntimeVerification({
      mode: 'pre_step',
      action: actionEvaluation,
      hasRequiredContext: true,
      confirmationSatisfied: true,
    });
    if (!preStepVerification.canProceed) {
      appendSysMsg(`任务文件写入已暂停：${preStepVerification.detail}`);
      return;
    }
    setSavingTaskFileProposal(true);
    try {
      const existing = window.api.listTaskFiles
        ? await window.api.listTaskFiles(activeTaskId).catch(() => [])
        : [];
      if (
        (!taskFileProposal.taskMemoryProposal || memoryApplyPlan?.status === 'ready' && memoryApplyPlan.action === 'create')
        && existing.some((file) => file.path === path)
      ) {
        appendSysMsg(`任务文件写入已暂停：\`${path}\` 已存在。请换一个文件名后再确认写入。`);
        return;
      }
      if (memoryApplyPlan?.status === 'ready') {
        if (memoryApplyPlan.action === 'update') {
          if (!window.api.updateTaskFile) {
            appendSysMsg('任务记忆写入已暂停：当前环境不支持更新任务文件。');
            return;
          }
          await window.api.updateTaskFile(memoryApplyPlan.input);
        } else {
          await window.api.createTaskFile(memoryApplyPlan.input);
        }
      } else {
        await window.api.createTaskFile({
          ...normalizedInput,
          taskId: activeTaskId,
        });
        await referenceTaskFileFromTaskRecord({
          taskId: activeTaskId,
          taskName: title ?? titleCache[activeTaskId] ?? activeTaskId,
          filePath: path,
        });
      }
      const postStepVerification = evaluateRuntimeVerification({
        mode: 'post_step',
        step: buildPanelRuntimeStep({
          title: taskFileProposal.taskMemoryProposal ? '任务记忆写入' : '任务文件写入',
          output: taskFileProposal.taskMemoryProposal
            ? `已补写任务记忆：${path}`
            : `已写入任务文件：${path}`,
        }),
        producedDurableChange: true,
        hasRecoveryNote: true,
      });
      if (!postStepVerification.canProceed) {
        appendSysMsg(`任务文件已写入，但后置检查提示：${postStepVerification.detail}`);
      }
      await recordPanelTimelineEvent(activeTaskId, 'panel.task_file_written', {
        path,
        surface: taskFileProposal.surface,
        surfaceLabel: taskFileProposal.surfaceLabel,
        source: taskFileProposal.taskMemoryProposal ? 'task_memory_write_proposal' : 'right_panel_file_proposal',
      });
      updateTaskFileProposal(null);
      appendSysMsg(taskFileProposal.taskMemoryProposal
        ? `已补写任务记忆：\`${path}\`。`
        : `已写入任务文件：\`${path}\`。`);
    } finally {
      setSavingTaskFileProposal(false);
    }
  }

  async function abandonCapturedTask() {
    if (!activeTaskId || pendingCapturedTaskId !== activeTaskId || abandoningCapturedTask) return;
    if (!abandonConfirmOpen) {
      patchSession({ abandonConfirmOpen: true });
      return;
    }
    const guard = guardTaskStateTransition({
      taskId: activeTaskId,
      nextState: 'archived',
      confirmationSatisfied: true,
    });
    if (!guard.allowed) {
      appendSysMsg(`放弃任务已暂停：${guard.reason}`);
      return;
    }
    setAbandoningCapturedTask(true);
    try {
      await window.api?.transitionTask({ id: activeTaskId, nextState: 'archived' });
      dispatchSession({ type: 'clear_task_context' });
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

  async function send(forcedText?: string) {
    const text = (forcedText ?? input).trim();
    if (!text || thinking) return;
    patchSession({
      manualRefreshReady: null,
      taskFileProposal: null,
    });

    const userMsg: Message = { id: nextId(), role: 'user', text, ts: now() };
    const historyForAI: ChatMessage[] = [
      ...messages.map((m) => ({ role: m.role, content: m.text })),
      { role: 'user', content: text },
    ];

    setMessages((prev) => [...prev, userMsg]);
    setSessionInput('');
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
  const userMessageTexts = messages
    .filter((message) => message.role === 'user')
    .map((message) => message.text.trim())
    .filter(Boolean);
  const latestUserMessageText = getLastUserMessage();
  const latestIntakeEvaluation = latestUserMessageText
    ? evaluateRuntimeIntake({
        text: latestUserMessageText,
        hasTaskContext: Boolean(activeTaskId),
        source: activeTaskId ? 'task_chat' : 'global_chat',
      })
    : null;
  const hasSpecificConversationSignal = hasSpecificHandoffSignal(userMessageTexts);
  const runtimeContextManifest = buildRuntimeContextManifest({
    task: activeTaskId
      ? {
          id: activeTaskId,
          title: title ?? activeTaskId,
        }
      : null,
    selectedFile,
  });
  const runtimeContextSnapshot = buildRuntimeContextSnapshot({
    task: activeTaskId
      ? {
          id: activeTaskId,
          title: title ?? activeTaskId,
        }
      : null,
    selectedFile,
  });
  const runtimeContextAssemblyPolicy = buildRuntimeContextAssemblyPolicy({
    manifest: runtimeContextManifest,
  });
  const sessionRefreshSuggestion = activeTaskId && !sessionRefreshDismissed
    ? shouldSuggestSessionRefresh(messages, compressionThreshold)
    : null;
  const canManuallyRefreshTaskSession = Boolean(
    activeTaskId
    && contextStrategy === 'manual'
    && messages.some((message) => message.role === 'user')
  );
  const canCaptureGlobalConversation = Boolean(
    evaluateRuntimeAction({
      action: 'task_capture',
      fromTaskId: activeTaskId,
      messageCount: userMessageTexts.length,
    }).allowed
    && latestIntakeEvaluation?.outcome === 'create_task'
    && latestIntakeEvaluation.allowed
  );
  const phaseCloseoutEvaluation = evaluateRuntimeAction({
    action: 'phase_closeout',
    fromTaskId: activeTaskId,
    messageCount: userMessageTexts.length,
  });
  const phaseCloseoutPreStep = evaluateRuntimeVerification({
    mode: 'pre_step',
    action: phaseCloseoutEvaluation,
    hasRequiredContext: Boolean(activeTaskId),
  });
  const taskFileWriteEvaluation = evaluateRuntimeAction({
    action: 'task_file_write_proposal',
    fromTaskId: activeTaskId,
    messageCount: userMessageTexts.length,
  });
  const contextSwitchEvaluation = pendingSwitch
    ? evaluateRuntimeAction({
        action: 'context_switch',
        fromTaskId: activeTaskId,
        targetTaskId: pendingSwitch.taskId,
        messageCount: userMessageTexts.length,
        hasSpecificHandoffSignal: hasSpecificConversationSignal,
      })
    : null;
  const canCloseoutActiveTaskPhase = Boolean(!phaseCloseoutSaved && phaseCloseoutPreStep.canProceed);
  const canProposeTaskFileWrite = Boolean(!taskFileProposal && taskFileWriteEvaluation.allowed);
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

  useEffect(() => {
    if (
      !activeTaskId
      || contextStrategy !== 'auto'
      || !sessionRefreshSuggestion
      || sessionRefreshDismissed
      || thinking
    ) {
      return;
    }
    const userSignal = userMessageTexts.join('\n');
    const refreshKey = `${activeTaskId}:${sessionRefreshSuggestion.reason}:${userSignal}`;
    if (!userSignal || lastAutoRefreshKeyRef.current === refreshKey) return;
    lastAutoRefreshKeyRef.current = refreshKey;
    void autoRefreshTaskSession(sessionRefreshSuggestion.reason);
  }, [
    activeTaskId,
    contextStrategy,
    sessionRefreshDismissed,
    sessionRefreshSuggestion,
    thinking,
    userMessageTexts,
  ]);

  return (
    <div className={`right-panel${fullScreen ? ' fullscreen' : ''}${hidden ? ' hidden' : ''}`}>
      {/* Header */}
      <div className="panel-header">
        <div className="panel-header-ctx">
          {activeTaskId ? (
            <button className="panel-ctx-tag" onClick={() => void leaveTaskContext()} title="离开任务上下文">
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
                <button key={p.label} className="panel-prompt-chip" onClick={() => { setSessionInput(p.prompt); textareaRef.current?.focus(); }}>
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
              {contextSwitchEvaluation?.reason ? ` ${contextSwitchEvaluation.reason}` : ''}
            </div>
            <div className="panel-ctx-switch-actions">
              <button className="btn sm primary" onClick={confirmSwitch}>切换到此任务</button>
              <button className="btn sm ghost" onClick={() => void dismissSwitch()}>保持全局</button>
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
              <button className="btn sm ghost" onClick={() => patchSession({ sessionRefreshDismissed: true })}>继续当前会话</button>
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
              这段任务讨论可以收成阶段记录，用于质量检查、完成判断和上下文清理。
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
              <strong>{taskFileProposal.taskMemoryProposal ? '任务记忆写入提案' : '任务文件写入提案'}</strong>
              <span>
                {taskFileProposal.taskMemoryProposal
                  ? taskFileProposal.taskMemoryProposal.operation === 'update'
                    ? '确认后更新现有任务记忆'
                    : '确认后创建任务记忆'
                  : '新建文件，不覆盖现有文件'}
              </span>
            </div>
            <input
              className="panel-file-proposal-path"
              value={taskFileProposal.path}
              onChange={(event) => updateTaskFileProposal((proposal) => (
                proposal
                  ? {
                      ...proposal,
                      path: event.target.value,
                      ...classifyTaskFileProposal(event.target.value),
                    }
                  : proposal
              ))}
              aria-label="任务文件路径"
            />
            <div className="panel-file-proposal-surface">
              建议归类：{taskFileProposal.surfaceLabel}
            </div>
            <div className="panel-refresh-reason">{taskFileProposal.summary}</div>
            <textarea
              className="panel-file-proposal-content"
              value={taskFileProposal.content}
              onChange={(event) => updateTaskFileProposal((proposal) => (
                proposal ? { ...proposal, content: event.target.value } : proposal
              ))}
              aria-label="任务文件内容"
            />
            <div className="panel-refresh-actions">
              <button className="btn sm ghost" onClick={() => updateTaskFileProposal(null)}>
                放弃
              </button>
              <button
                className={`btn sm primary${savingTaskFileProposal ? ' disabled' : ''}`}
                onClick={() => void confirmTaskFileWrite()}
                disabled={savingTaskFileProposal}
              >
                {savingTaskFileProposal ? '写入中…' : taskFileProposal.taskMemoryProposal ? '确认补写记忆' : '确认写入文件'}
              </button>
            </div>
          </div>
        )}

        {activeTaskId && phaseCloseoutSaved && (
          <div className="panel-capture-suggestion">
            <div className="panel-capture-text">
              {phaseCloseoutNotice ?? '阶段记录已保存，质量检查已记录，会话已刷新。'}
            </div>
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
        <div
          className="panel-context-manifest"
          title={`${runtimeContextSnapshot.summary} / ${runtimeContextAssemblyPolicy.summary}`}
        >
          {runtimeContextManifest.userFacingSummary}
        </div>
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
                patchSession({
                  manualRefreshReady: null,
                  sessionRefreshDismissed: false,
                });
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
                onClick={() => { setSessionInput(taskTypeReviewPrompt); textareaRef.current?.focus(); }}
              >
                判断任务类型
              </button>
            )}
            {taskPlanningPrompt && (
              <button
                className="panel-prompt-chip"
                onClick={() => { setSessionInput(taskPlanningPrompt.prompt); textareaRef.current?.focus(); }}
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
          onChange={(e) => { setSessionInput(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
        />
        <div className="panel-input-foot">
          <span className="panel-hint muted">⏎ 发送  ⇧⏎ 换行</span>
          <button
            className={`btn sm primary${!input.trim() || thinking ? ' disabled' : ''}`}
            onClick={() => void send()}
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
      ? `当前任务处于正常推进中。根据最近的任务动态，上一次 Run 已完成主要步骤，等待你的进一步指令。\n\n建议下一步：确认输出方向后启动新 Run。`
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
