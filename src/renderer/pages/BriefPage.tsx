import { useState, useRef, useEffect } from 'react';
import type { HomeBriefData } from '@shared/types/brief';
import { TaskCompletionCheckModal } from '../components/TaskCompletionCheckModal';
import { loadTaskAttributes } from '../lib/taskAttributes';

type Lane = 'escalate' | 'unblock' | 'continue' | 'clarify' | 'steady';

interface FocusTask {
  id: string;
  title: string;
  lane: Lane;
  whyNow: string;
  action: string;
  state?: HomeBriefData['recentTasks'][number]['state'];
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

const DEFER_OPTIONS = [
  { label: '明天', value: 'tomorrow' },
  { label: '本周末', value: 'weekend' },
  { label: '下周一', value: 'next-monday' },
  { label: '选日期…', value: 'custom' },
];

function deferLabel(value: string): string {
  return DEFER_OPTIONS.find((opt) => opt.value === value)?.label ?? value;
}

interface BriefPageProps {
  onOpenTask: (id: string) => void;
  onOpenDecision: () => void;
  onOpenPanel: (taskId: string, draftPrompt?: string) => void;
}

function laneFromPriorityLane(lane: string | undefined): Lane {
  if (lane === 'escalate_now') return 'escalate';
  if (lane === 'unblock_or_decide') return 'unblock';
  if (lane === 'continue_or_review') return 'continue';
  if (lane === 'clarify') return 'clarify';
  return 'steady';
}

function statusFromBriefTask(task: HomeBriefData['recentTasks'][number] | undefined): FocusTask['status'] {
  if (!task) return undefined;
  if (task.state === 'running') return 'running';
  if (task.state === 'waiting_external') return 'waiting';
  if (task.activeBlocker) return 'blocked';
  return undefined;
}

function actionLabelFromStatus(
  status: FocusTask['status'],
  fallback: string,
): string {
  if (status === 'running') return '查看 Run';
  if (status === 'waiting') return '起草跟进';
  if (status === 'blocked') return '解除阻塞';
  return fallback;
}

function actionPromptFromTask(task: FocusTask): string | undefined {
  if (task.status === 'waiting') {
    return `请基于当前任务状态，帮我起草一条跟进等待项的消息，并说明是否应该继续等待或升级处理。\n\n任务：${task.title}\n为什么现在：${task.whyNow}`;
  }
  if (task.status === 'blocked') {
    return `请基于当前任务状态，帮我判断阻塞点怎么解除，并给出 1-2 个可执行选项。\n\n任务：${task.title}\n为什么现在：${task.whyNow}`;
  }
  return undefined;
}

function focusTasksFromBriefData(data: HomeBriefData): FocusTask[] {
  const seen = new Set<string>();
  return data.recommendedActions
    .filter((a) => {
      if (!a.taskId || seen.has(a.taskId)) return false;
      seen.add(a.taskId);
      return true;
    })
    .slice(0, 5)
    .map((a) => {
      const task = data.recentTasks.find((t) => t.id === a.taskId);
      const status = statusFromBriefTask(task);
      return {
        id: a.taskId!,
        title: task?.title ?? a.taskId!,
        lane: laneFromPriorityLane(a.lane),
        whyNow: a.reason,
        action: actionLabelFromStatus(status, a.label),
        state: task?.state,
        status,
      };
    });
}

export function BriefPage({ onOpenTask, onOpenDecision, onOpenPanel }: BriefPageProps) {
  const [tasks, setTasks] = useState<FocusTask[]>([]);
  const [signals, setSignals] = useState<ExternalSignal[]>([]);
  const [briefData, setBriefData] = useState<HomeBriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [completionCheckTask, setCompletionCheckTask] = useState<FocusTask | null>(null);
  const [orderAdjusted, setOrderAdjusted] = useState(false);
  const [showBriefHistory, setShowBriefHistory] = useState(false);

  useEffect(() => {
    if (!window.api) { setLoading(false); return; }
    window.api.getHomeBrief().then((data) => {
      setBriefData(data);
      setTasks(focusTasksFromBriefData(data));
      setOrderAdjusted(false);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deferOpenId, setDeferOpenId] = useState<string | null>(null);
  const [conflictState, setConflictState] = useState<{
    task: FocusTask;
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
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [item] = next.splice(fromIdx, 1);
      if (!item) return prev;
      next.splice(toIdx, 0, item);
      return next;
    });
    setOrderAdjusted(true);
    dragId.current = null;
    dragOverId.current = null;
  }

  function handleDefer(task: FocusTask, option: string) {
    setDeferOpenId(null);
    const simulatedCount = option === 'next-monday' ? 4 : 1;
    if (simulatedCount >= 3) {
      setConflictState({ task, option, count: simulatedCount });
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    transitionFocusTask(task, 'waiting_external', `延后处理：${deferLabel(option)}`).catch(() => {
      window.api?.getHomeBrief().then((data) => {
        setTasks(focusTasksFromBriefData(data));
        setBriefData(data);
      }).catch(() => {});
    });
  }

  function confirmDefer(task: FocusTask, targetLabel = deferLabel(conflictState?.option ?? 'next-monday')) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    transitionFocusTask(task, 'waiting_external', `延后处理：${targetLabel}`).catch(() => {});
    setConflictState(null);
  }

  async function transitionFocusTask(task: FocusTask, nextState: 'completed' | 'waiting_external', waitingReason?: string) {
    if (!window.api) return;
    if (task.state === 'captured' || task.state === 'triaged') {
      await window.api.transitionTask({ id: task.id, nextState: 'planned' });
    }
    await window.api.transitionTask({
      id: task.id,
      nextState,
      waitingReason,
    });
  }

  function completeTask(task: FocusTask) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    transitionFocusTask(task, 'completed').catch(() => {});
  }

  function markWaitingAfterCompletionCheck(task: FocusTask, reason: string) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    transitionFocusTask(task, 'waiting_external', reason).catch(() => {});
  }

  function dismissSignal(id: string) {
    setSignals((prev) => prev.filter((s) => s.id !== id));
  }

  const runningCount = tasks.filter((t) => t.status === 'running').length;
  const waitingCount = tasks.filter((t) => t.status === 'waiting').length;
  const taskAttributes = loadTaskAttributes();
  const committedTaskCount = briefData
    ? briefData.recentTasks.filter((task) => taskAttributes[task.id]?.commitment).length
    : 0;
  const recentBriefSnapshots = briefData?.recentBriefSnapshots ?? [];

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
        <button
          className="btn ghost sm"
          disabled={recentBriefSnapshots.length === 0}
          title={recentBriefSnapshots.length === 0 ? '暂无历史总结' : '查看最近 Brief 总结'}
          onClick={() => setShowBriefHistory(true)}
        >
          昨日总结
        </button>
      </div>

      {/* Loading */}
      {loading && <div className="brief-loading muted">加载中…</div>}

      {/* Stats strip */}
      <div className="brief-stats">
        {(briefData?.recentRunCount ?? runningCount) > 0 && (
          <div className="stat-chip">
            <span className="dot running" />
            Running: {briefData?.recentRunCount ?? runningCount}
          </div>
        )}
        {(briefData?.waitingTaskCount ?? waitingCount) > 0 && (
          <div className="stat-chip">
            <span className="dot waiting" />
            等待中: {briefData?.waitingTaskCount ?? waitingCount}
          </div>
        )}
        {committedTaskCount > 0 && (
          <div className="stat-chip">
            <span className="dot" />
            本周承诺: {committedTaskCount}
          </div>
        )}
        {(briefData?.activeTaskCount ?? 0) > 0 && (
          <div className="stat-chip">
            <span className="dot" />
            进行中: {briefData?.activeTaskCount}
          </div>
        )}
      </div>

      {/* Focus cards */}
      <div className="brief-section">
        <div className="brief-section-label">内部信息</div>
        <div className="brief-section-note">
          按共享 Priority Lane 排序；这里不是单独看板，拖拽只调整今日顺序。
        </div>
        <div className="focus-list">
          {orderAdjusted && (
            <div className="focus-order-note">
              今日顺序已调整，仅今天有效；Priority Lane 不会被改写。
            </div>
          )}
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
              onAction={() => {
                if (task.status === 'running') onOpenTask(task.id);
                else onOpenPanel(task.id, actionPromptFromTask(task));
              }}
              onDeferToggle={() =>
                setDeferOpenId((prev) => (prev === task.id ? null : task.id))
              }
              onDeferSelect={(opt) => handleDefer(task, opt)}
              onComplete={() => setCompletionCheckTask(task)}
              onClick={() => onOpenPanel(task.id)}
            />
          ))}
          {!loading && tasks.length === 0 && (
            <div className="brief-empty">
              <p>今天没有待关注的高优先级事项。</p>
              <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>在 Tasks 创建任务后，AI 会在这里汇总需要你处理的内容。</p>
            </div>
          )}
        </div>
      </div>

      {/* External signals — always visible */}
      {!loading && (
        <div className="brief-section">
          <div className="brief-section-label">外部信号</div>
          {signals.length > 0 ? (
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
          ) : (
            <div className="brief-empty">
              <p>暂无外部信号。</p>
              <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                在 Connections 连接邮件或日历后，AI 会提取需要跟进的信号，并等待你确认是否长成任务。
              </p>
            </div>
          )}
        </div>
      )}

      {/* Pending decisions footer */}
      {(briefData?.pendingDecisionCount ?? 0) > 0 && (
        <button className="brief-decisions-link" onClick={onOpenDecision}>
          等你拍板 {briefData!.pendingDecisionCount} ›
        </button>
      )}

      {showBriefHistory && (
        <div className="modal-backdrop" onClick={() => setShowBriefHistory(false)}>
          <div className="modal brief-history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>昨日总结</h3>
            </div>
            <div className="modal-body">
              {recentBriefSnapshots.slice(0, 3).map((snapshot) => (
                <div key={snapshot.id} className="brief-history-item">
                  <div className="brief-history-meta">
                    <span>{new Date(snapshot.createdAt).toLocaleString('zh')}</span>
                    <span>{snapshot.source === 'ai' ? 'AI 生成' : '本地兜底'}</span>
                  </div>
                  <p>{snapshot.payload}</p>
                  {snapshot.fallbackReason && (
                    <small>兜底原因：{snapshot.fallbackReason}</small>
                  )}
                </div>
              ))}
            </div>
            <div className="modal-foot">
              <button className="btn sm primary" onClick={() => setShowBriefHistory(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

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
                onClick={() => confirmDefer(conflictState.task)}
              >
                周一
              </button>
              <button
                className="btn sm primary"
                onClick={() => confirmDefer(conflictState.task, '周二')}
              >
                周二
              </button>
              <button
                className="btn sm ghost"
                onClick={() => {
                  const taskId = conflictState.task.id;
                  setConflictState(null);
                  setDeferOpenId(taskId);
                }}
              >
                我来选
              </button>
            </div>
          </div>
        </div>
      )}

      {completionCheckTask && (
        <TaskCompletionCheckModal
          taskId={completionCheckTask.id}
          taskTitle={completionCheckTask.title}
          onCancel={() => setCompletionCheckTask(null)}
          onCompleteAnyway={() => {
            const task = completionCheckTask;
            if (!task) return;
            setCompletionCheckTask(null);
            completeTask(task);
          }}
          onMarkWaiting={(reason) => {
            const task = completionCheckTask;
            if (!task) return;
            setCompletionCheckTask(null);
            markWaitingAfterCompletionCheck(task, reason);
          }}
        />
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
          {task.status === 'blocked' && (
            <span className="dot risk" style={{ marginLeft: 6 }} />
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
