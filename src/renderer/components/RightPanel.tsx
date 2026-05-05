import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage } from '@shared/types/ipc';
import { selectApplicableWorkHabits as selectApplicableWorkHabitsFromList } from '@shared/work-habit-rules';
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
    text: `已切换到任务上下文：**${taskTitle}**。\n\n有什么需要讨论或推进的？`,
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

function normalizeUserMessage(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[，。！？、,.!?；;：:\s]/g, '');
}

function shouldSuggestSessionRefresh(messages: Message[]): boolean {
  const userMessages = messages
    .filter((message) => message.role === 'user')
    .map((message) => normalizeUserMessage(message.text))
    .filter(Boolean);
  if (userMessages.length >= 5) return true;

  const counts = new Map<string, number>();
  for (const message of userMessages) {
    const next = (counts.get(message) ?? 0) + 1;
    if (userMessages.length >= 3 && next >= 3) return true;
    counts.set(message, next);
  }
  return false;
}

interface RightPanelProps {
  taskId: string | null;
  onClose: () => void;
  onClearTask: () => void;
}

export function RightPanel({ taskId, onClose, onClearTask }: RightPanelProps) {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(taskId);
  const [titleCache, setTitleCache] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingSwitch, setPendingSwitch] = useState<PendingCtxSwitch | null>(null);
  const [sessionRefreshDismissed, setSessionRefreshDismissed] = useState(false);
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

  function startFreshSession() {
    const taskName = title ?? (activeTaskId ? titleCache[activeTaskId] ?? activeTaskId : null);
    setMessages(taskName ? [makeWelcomeMessage(taskName)] : []);
    setSessionRefreshDismissed(false);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
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
  const shouldSuggestRefresh = Boolean(
    activeTaskId
    && !sessionRefreshDismissed
    && shouldSuggestSessionRefresh(messages),
  );
  const projectDecompositionPrompt = activeAttrs?.type === 'project' && title
    ? buildProjectDecompositionPrompt(title)
    : null;
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
        { label: '帮我整理一下待办', prompt: '帮我整理一下待办' },
        { label: '最近有什么需要跟进的？', prompt: '最近有什么需要跟进的？' },
      ];

  return (
    <div className="right-panel">
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
          <button className="icon-btn" title="历史记录">
            <IconHistory />
          </button>
          <button className="icon-btn" onClick={onClose} title="关闭面板">
            <IconClose />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="panel-messages">
        {messages.length === 0 && (
          <div className="panel-empty">
            <p>说点什么开始对话…</p>
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
            <div className="panel-ctx-switch-actions">
              <button className="btn sm primary" onClick={confirmSwitch}>切换到此任务</button>
              <button className="btn sm ghost" onClick={dismissSwitch}>保持全局</button>
            </div>
          </div>
        )}

        {shouldSuggestRefresh && (
          <div className="panel-refresh-suggestion">
            <div className="panel-refresh-text">
              这个任务的讨论已经有点长了，重要信息会从任务记忆继续带入。建议开始一段新会话，让后续判断更清楚。
            </div>
            <div className="panel-refresh-actions">
              <button className="btn sm primary" onClick={startFreshSession}>开始新会话</button>
              <button className="btn sm ghost" onClick={() => setSessionRefreshDismissed(true)}>继续当前会话</button>
            </div>
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
        {activeTaskId && projectDecompositionPrompt && !input.trim() && (
          <div className="panel-inline-prompts">
            <button
              className="panel-prompt-chip"
              onClick={() => { setInput(projectDecompositionPrompt); textareaRef.current?.focus(); }}
            >
              拆解项目结构
            </button>
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="panel-input"
          placeholder={activeTaskId ? `关于「${title}」…` : '搜索、提问或捕获想法…'}
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
