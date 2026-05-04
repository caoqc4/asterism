import { useState, useRef } from 'react';

type Lane = 'escalate' | 'unblock' | 'continue' | 'clarify' | 'steady';

interface FocusTask {
  id: string;
  title: string;
  lane: Lane;
  whyNow: string;
  action: string;
  status?: 'running' | 'waiting' | 'blocked';
}

interface ExternalSignal {
  id: string;
  source: 'email' | 'calendar';
  summary: string;
  suggestion: string;
}

const LANE_LABELS: Record<Lane, string> = {
  escalate: 'Escalate now',
  unblock:  'Unblock or decide',
  continue: 'Continue or review',
  clarify:  'Clarify',
  steady:   'Steady',
};

const MOCK_FOCUS: FocusTask[] = [
  {
    id: 'task-001',
    title: '品牌合作来信回复',
    lane: 'escalate',
    whyNow: '对方已等待 48 小时，再不回复可能失去合作机会。',
    action: '起草回复',
  },
  {
    id: 'task-002',
    title: 'Q2 财报分析报告',
    lane: 'unblock',
    whyNow: '数据团队已送达原始数据，等你拍板核心指标口径后可以继续。',
    action: '拍板',
    status: 'waiting',
  },
  {
    id: 'task-003',
    title: '周例会纪要整理',
    lane: 'continue',
    whyNow: '上次 Run 完成 80%，剩余结论部分约 15 分钟可完成。',
    action: '查看 Run',
    status: 'running',
  },
];

const MOCK_SIGNALS: ExternalSignal[] = [
  {
    id: 'sig-001',
    source: 'email',
    summary: 'Re: 合作意向确认 — 对方希望本周内明确合作方向',
    suggestion: '合并到「品牌合作来信回复」',
  },
];

const DEFER_OPTIONS = [
  { label: '明天', value: 'tomorrow' },
  { label: '本周末', value: 'weekend' },
  { label: '下周一', value: 'next-monday' },
  { label: '选日期…', value: 'custom' },
];

interface BriefPageProps {
  onOpenTask: (id: string) => void;
  onOpenDecision: () => void;
  onOpenPanel: (taskId: string) => void;
}

export function BriefPage({ onOpenTask, onOpenDecision, onOpenPanel }: BriefPageProps) {
  const [tasks, setTasks] = useState<FocusTask[]>(MOCK_FOCUS);
  const [signals, setSignals] = useState<ExternalSignal[]>(MOCK_SIGNALS);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deferOpenId, setDeferOpenId] = useState<string | null>(null);
  const [conflictState, setConflictState] = useState<{
    taskId: string;
    option: string;
    count: number;
  } | null>(null);

  const dragId = useRef<string | null>(null);
  const dragOverId = useRef<string | null>(null);

  function handleDragStart(id: string) {
    dragId.current = id;
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    dragOverId.current = id;
  }

  function handleDrop() {
    const from = dragId.current;
    const to = dragOverId.current;
    if (!from || !to || from === to) return;
    setTasks((prev) => {
      const next = [...prev];
      const fromIdx = next.findIndex((t) => t.id === from);
      const toIdx = next.findIndex((t) => t.id === to);
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
    dragId.current = null;
    dragOverId.current = null;
  }

  function handleDefer(taskId: string, option: string) {
    setDeferOpenId(null);
    const simulatedCount = option === 'next-monday' ? 4 : 1;
    if (simulatedCount >= 3) {
      setConflictState({ taskId, option, count: simulatedCount });
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  function confirmDefer(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setConflictState(null);
  }

  function dismissSignal(id: string) {
    setSignals((prev) => prev.filter((s) => s.id !== id));
  }

  const runningCount = tasks.filter((t) => t.status === 'running').length;
  const waitingCount = tasks.filter((t) => t.status === 'waiting').length;

  return (
    <div className="brief-page">
      {/* Header */}
      <div className="brief-head">
        <div className="brief-head-left">
          <span className="brief-date-label">今天</span>
          <span className="brief-task-count">
            {tasks.length} 件最值得处理
          </span>
        </div>
        <button className="btn ghost sm">昨日总结</button>
      </div>

      {/* Stats strip */}
      <div className="brief-stats">
        {runningCount > 0 && (
          <div className="stat-chip">
            <span className="dot running" />
            Running: {runningCount}
          </div>
        )}
        {waitingCount > 0 && (
          <div className="stat-chip">
            <span className="dot waiting" />
            等待中: {waitingCount}
          </div>
        )}
        <div className="stat-chip">
          <span className="dot" />
          本周承诺: 4
        </div>
      </div>

      {/* Focus cards */}
      <div className="brief-section">
        <div className="brief-section-label">内部信息</div>
        <div className="focus-list">
          {tasks.map((task) => (
            <FocusCard
              key={task.id}
              task={task}
              hovered={hoveredId === task.id}
              deferOpen={deferOpenId === task.id}
              onMouseEnter={() => setHoveredId(task.id)}
              onMouseLeave={() => {
                setHoveredId(null);
                setDeferOpenId(null);
              }}
              onDragStart={() => handleDragStart(task.id)}
              onDragOver={(e) => handleDragOver(e, task.id)}
              onDrop={handleDrop}
              onAction={() => onOpenPanel(task.id)}
              onDeferToggle={() =>
                setDeferOpenId((prev) => (prev === task.id ? null : task.id))
              }
              onDeferSelect={(opt) => handleDefer(task.id, opt)}
              onComplete={() =>
                setTasks((prev) => prev.filter((t) => t.id !== task.id))
              }
              onClick={() => onOpenPanel(task.id)}
            />
          ))}
          {tasks.length === 0 && (
            <div className="brief-empty">今日焦点清空——休息一下，或者从 Tasks 拉入新的任务。</div>
          )}
        </div>
      </div>

      {/* External signals */}
      {signals.length > 0 && (
        <div className="brief-section">
          <div className="brief-section-label">外部信号</div>
          <div className="signal-list">
            {signals.map((sig) => (
              <SignalCard
                key={sig.id}
                signal={sig}
                onConfirm={() => dismissSignal(sig.id)}
                onDismiss={() => dismissSignal(sig.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pending decisions footer */}
      <button className="brief-decisions-link" onClick={onOpenDecision}>
        等你拍板 2 ›
      </button>

      {/* Conflict modal */}
      {conflictState && (
        <div className="modal-backdrop" onClick={() => setConflictState(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>目标日已比较饱满</h3>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                下周一已有 {conflictState.count} 件任务，继续安排到周一还是移到周二？
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn sm" onClick={() => setConflictState(null)}>
                取消
              </button>
              <button
                className="btn sm"
                onClick={() => confirmDefer(conflictState.taskId)}
              >
                周一
              </button>
              <button
                className="btn sm primary"
                onClick={() => confirmDefer(conflictState.taskId)}
              >
                周二
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Focus Card ─── */

interface FocusCardProps {
  task: FocusTask;
  hovered: boolean;
  deferOpen: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onAction: () => void;
  onDeferToggle: () => void;
  onDeferSelect: (opt: string) => void;
  onComplete: () => void;
  onClick: () => void;
}

function FocusCard({
  task,
  hovered,
  deferOpen,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  onDragOver,
  onDrop,
  onAction,
  onDeferToggle,
  onDeferSelect,
  onComplete,
  onClick,
}: FocusCardProps) {
  const whyNowClass = task.lane === 'escalate'
    ? 'why-now risk'
    : task.lane === 'unblock'
    ? 'why-now waiting'
    : 'why-now';

  return (
    <div
      className={`focus-card${hovered ? ' focus-card-hovered' : ''}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
    >
      {/* Drag handle */}
      <div
        className={`focus-drag${hovered ? ' visible' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        ⠿
      </div>

      {/* Card body */}
      <div className="focus-body">
        <div className="focus-top">
          <span className={`tag lane-${task.lane}`}>
            {LANE_LABELS[task.lane]}
          </span>
          {task.status === 'running' && (
            <span className="dot running" style={{ marginLeft: 6 }} />
          )}
          {task.status === 'waiting' && (
            <span className="dot waiting" style={{ marginLeft: 6 }} />
          )}
        </div>
        <div className="focus-title">{task.title}</div>
        <div className={whyNowClass}>{task.whyNow}</div>
      </div>

      {/* Actions */}
      <div
        className={`focus-actions${hovered ? ' visible' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Defer dropdown */}
        <div className="defer-wrap">
          <button className="btn sm ghost" onClick={onDeferToggle}>
            延后 ▾
          </button>
          {deferOpen && (
            <div className="defer-menu">
              {DEFER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className="defer-option"
                  onClick={() => onDeferSelect(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn sm" onClick={onComplete}>
          完成
        </button>
      </div>

      {/* Primary action */}
      <button
        className="focus-primary-action btn sm primary"
        onClick={(e) => {
          e.stopPropagation();
          onAction();
        }}
      >
        {task.action} →
      </button>
    </div>
  );
}

/* ─── Signal Card ─── */

interface SignalCardProps {
  signal: ExternalSignal;
  onConfirm: () => void;
  onDismiss: () => void;
}

function SignalCard({ signal, onConfirm, onDismiss }: SignalCardProps) {
  return (
    <div className="signal-card">
      <div className="signal-top">
        <span className="tag captured">
          {signal.source === 'email' ? 'EMAIL' : 'CALENDAR'}
        </span>
        <span className="signal-summary">{signal.summary}</span>
      </div>
      <div className="signal-bottom">
        <span className="signal-suggestion">建议：{signal.suggestion}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn sm primary" onClick={onConfirm}>
            确认 &amp; 长成任务
          </button>
          <button className="btn sm ghost" onClick={onDismiss}>
            忽略
          </button>
        </div>
      </div>
    </div>
  );
}
