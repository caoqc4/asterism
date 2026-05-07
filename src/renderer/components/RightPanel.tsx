import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage } from '@shared/types/ipc';
import { selectApplicableWorkHabits as selectApplicableWorkHabitsFromList } from '@shared/work-habit-rules';
import { CONTEXT_COMPRESSION_THRESHOLD } from '@shared/settings-defaults';
import { PANEL_CAPTURE_SUMMARY_PREFIX } from '@shared/panel-capture';
import {
  selectApplicableWorkHabits,
  getPersistedWorkHabitStorageSnapshot,
  summarizeWorkHabitsForPrompt,
} from '../lib/workHabits';
import { buildProjectDecompositionPrompt, getTaskAttributes, type TaskExecutionType } from '../lib/taskAttributes';

type MessageRole = 'user' | 'assistant';

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

function taskTitle(taskId: string | null, cache: Record<string, string>): string | null {
  if (!taskId) return null;
  return cache[taskId] ?? null;
}

function makeWelcomeMessage(taskTitle: string): Message {
  return {
    id: 'm0',
    role: 'assistant',
    text: `已切换到任务上下文：**${taskTitle}**。\n\n我会从任务记忆、执行记录和工作习惯重新组装上下文。有什么需要讨论或推进的？`,
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
}): Promise<void> {
  if (!window.api?.createSourceContext) return;
  const userMessages = params.messages
    .filter((message) => message.role === 'user')
    .map((message) => message.text.trim())
    .filter(Boolean);
  if (userMessages.length === 0) return;

  const recentFocus = userMessages.slice(-3).map((message) => truncateMemoryLine(message));
  const preferenceSignals = userMessages
    .filter((message) => /不要|别|希望|以后|默认|必须|尽量|偏好|习惯/.test(message))
    .slice(-2)
    .map((message) => truncateMemoryLine(message));
  const lastQuestion = recentFocus.at(-1) ?? '暂无';

  await window.api.createSourceContext({
    taskId: params.taskId,
    title: '会话刷新前保全',
    kind: 'note',
    isKey: false,
    content: [
      `任务：${params.taskTitle}`,
      `用户消息数：${userMessages.length}`,
      `最近关注：${recentFocus.join(' / ')}`,
      `偏好变化候选：${preferenceSignals.length ? preferenceSignals.join(' / ') : '暂无明显候选'}`,
      `未解决问题候选：${lastQuestion}`,
      '用途：刷新会话前的保全式学习提取，只保存精选信号，不保存完整聊天全文。',
    ].join('\n'),
    note: '自学习观察：会话刷新前保全关键决策、偏好变化和未解决问题。',
  }).catch(() => undefined);
}

function truncateMemoryLine(value: string): string {
  const singleLine = value.replace(/\s+/g, ' ').trim();
  return singleLine.length > 80 ? `${singleLine.slice(0, 80)}...` : singleLine;
}

interface RightPanelProps {
  taskId: string | null;
  draftPrompt?: string | null;
  hidden?: boolean;
  onTaskCaptured?: (taskId: string) => void;
  onClose: (hasSession: boolean) => void;
  onClearTask: () => void;
}

export function RightPanel({ taskId, draftPrompt = null, hidden = false, onTaskCaptured, onClose, onClearTask }: RightPanelProps) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(taskId);
  const [titleCache, setTitleCache] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingSwitch, setPendingSwitch] = useState<PendingCtxSwitch | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessionRefreshDismissed, setSessionRefreshDismissed] = useState(false);
  const [compressionThreshold, setCompressionThreshold] = useState<number>(
    CONTEXT_COMPRESSION_THRESHOLD.default,
  );
  const [capturingTask, setCapturingTask] = useState(false);
  const [confirmingCapturedTask, setConfirmingCapturedTask] = useState(false);
  const [pendingCapturedTaskId, setPendingCapturedTaskId] = useState<string | null>(null);
  const [abandonConfirmOpen, setAbandonConfirmOpen] = useState(false);
  const [abandoningCapturedTask, setAbandoningCapturedTask] = useState(false);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch task title and seed welcome message when panel first opens with a task
  useEffect(() => {
    if (!taskId) return;
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
      return;
    }
    // Fetch title if not cached, then propose soft context switch
    const fetchAndPropose = async () => {
      let title = titleCache[taskId];
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

  async function startFreshSession() {
    const taskName = title ?? (activeTaskId ? titleCache[activeTaskId] ?? activeTaskId : null);
    if (activeTaskId && messages.some((message) => message.role === 'user')) {
      await preserveSessionRefreshMemory({
        taskId: activeTaskId,
        taskTitle: taskName ?? activeTaskId,
        messages,
      });
    }
    setMessages(taskName ? [makeWelcomeMessage(taskName)] : []);
    setHistoryOpen(false);
    setSessionRefreshDismissed(false);
    setInput('');
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
        const appliedHabits = summarizeWorkHabitsForPrompt(snapshot
          ? selectApplicableWorkHabitsFromList(snapshot.habits, habitParams)
          : selectApplicableWorkHabits(habitParams));
        const res = await window.api.chatWithAI({
          messages: historyForAI,
          taskId: activeTaskId,
          workHabits: appliedHabits,
        });
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
  const canCaptureGlobalConversation = Boolean(
    !activeTaskId
    && messages.some((message) => message.role === 'user')
  );
  const projectDecompositionPrompt = activeAttrs?.type === 'project' && title
    ? buildProjectDecompositionPrompt(title)
    : null;
  const taskTypeReviewPrompt = activeTaskId && title ? buildTaskTypeReviewPrompt(title) : null;
  const quickPrompts = activeTaskId
    ? [
        ...(projectDecompositionPrompt
          ? [{ label: '拆解项目结构', prompt: projectDecompositionPrompt }]
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
            <button className="panel-ctx-tag" onClick={onClearTask} title="清除任务上下文">
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
                当前会话只是临时工作内存；开始新会话会从任务记忆种子继续，不默认加载旧聊天。
              </div>
              <button className="btn sm ghost" onClick={() => void startFreshSession()}>
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

        {sessionRefreshSuggestion && (
          <div className="panel-refresh-suggestion">
            <div className="panel-refresh-text">
              这个任务的讨论已经有点长了，重要信息会从任务记忆继续带入。开始新会话前会先保全关键决策、偏好变化和未解决问题，让后续判断更清楚。
            </div>
            <div className="panel-refresh-reason">{sessionRefreshSuggestion.reason}</div>
            <div className="panel-refresh-actions">
              <button className="btn sm primary" onClick={() => void startFreshSession()}>开始新会话</button>
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

        {activeTaskId && pendingCapturedTaskId === activeTaskId && (
          <div className="panel-capture-suggestion">
            <div className="panel-capture-text">
              这是待确认任务，确认后才会进入 Tasks 主列表。
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
            {title}
          </div>
        )}
        {activeTaskId && !input.trim() && (taskTypeReviewPrompt || projectDecompositionPrompt) && (
          <div className="panel-inline-prompts">
            {taskTypeReviewPrompt && (
              <button
                className="panel-prompt-chip"
                onClick={() => { setInput(taskTypeReviewPrompt); textareaRef.current?.focus(); }}
              >
                判断任务类型
              </button>
            )}
            {projectDecompositionPrompt && (
            <button
              className="panel-prompt-chip"
              onClick={() => { setInput(projectDecompositionPrompt); textareaRef.current?.focus(); }}
            >
              拆解项目结构
            </button>
            )}
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="panel-input"
          placeholder={activeTaskId ? `关于「${title}」…` : '搜索、提问或捕获任务想法…'}
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
      : `建议按 Priority Lane 顺序处理：先解决 Escalate 任务，再处理 Unblock 项。`;
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
