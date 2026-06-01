import { useState, useRef, useEffect } from 'react';
import { projectBriefFocusTasksFromHomeData } from '@shared/brief-focus-projection';
import type {
  BriefFocusLane,
  HomeBriefData,
  HomeBriefFocusTask,
} from '@shared/types/brief';
import { TaskCompletionCheckModal } from '../components/TaskCompletionCheckModal';
import { guardTaskStateTransition } from '../lib/runtimeActionGuards';
import {
  recordBriefRecommendationOrderAdjustment,
  recordBriefRecommendationSnapshot,
} from '../lib/briefRecommendationRecords';

type Lane = BriefFocusLane;
type FocusTask = HomeBriefFocusTask;

interface ExternalSignal {
  id: string;
  source: 'email' | 'calendar';
  summary: string;
  suggestion: string;
}

const LANE_LABELS: Record<Lane, string> = {
  escalate: '优先处理',
  unblock:  '解除阻塞',
  continue: '继续推进',
  clarify:  '待明确',
  steady:   '平稳推进',
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
  onOpenBusinessLine: (id: string) => void;
  onOpenDecision: () => void;
  onOpenPanel: (taskId: string, draftPrompt?: string) => void;
  onOpenBusinessLinePanel: (
    businessLineId: string,
    businessLineTitle: string,
    draftPrompt?: string,
    taskId?: string | null,
  ) => void;
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

function focusStatusLabel(task: FocusTask): string {
  if (task.status === 'blocked') return '有阻塞';
  if (task.status === 'waiting') return '等待中';
  if (task.status === 'clarify' || task.lane === 'clarify') return '待明确';
  if (task.status === 'running' || task.status === 'progressing') return '推进中';
  if (task.lane === 'steady') return '平稳推进';
  return LANE_LABELS[task.lane];
}

function focusStatusTone(task: FocusTask): Lane {
  if (task.status === 'blocked') return 'unblock';
  if (task.status === 'waiting' || task.status === 'clarify' || task.lane === 'clarify') return 'clarify';
  if (task.lane === 'steady') return 'steady';
  if (task.lane === 'escalate') return 'escalate';
  return 'continue';
}

function focusTasksFromBriefData(data: HomeBriefData): FocusTask[] {
  return data.briefFocusTasks ?? projectBriefFocusTasksFromHomeData(data);
}

function briefDisplaySummary(data: HomeBriefData | null, visibleCount: number): string {
  const attention = data?.briefAttention;
  if (!attention) {
    return `显示 ${visibleCount} 件；与业务线 Next Actions 共用优先处理信号，拖拽只调整今日顺序。`;
  }
  const prefix = attention.truncated
    ? `显示前 ${attention.displayedCount}/${attention.totalCount} 件`
    : `显示 ${attention.displayedCount} 件`;
  return `${prefix}；与业务线 Next Actions 共用同一排序，Today 只做今日注意力摘要。`;
}

function schedulerSweepLabel(data: HomeBriefData | null): string | null {
  const status = data?.schedulerStatus;
  if (!status?.enabled) return null;
  const summary = status.lastScheduledEventAgentSweepSummary ?? '';
  if (summary.includes('status=completed')) return [
    '自动巡检: 已运行',
    schedulerSweepCountLabel(summary),
    schedulerSweepBlockReasonLabel(summary),
    schedulerSweepFailureLabel(summary),
    schedulerSweepAutomationReadinessLabel(summary),
    schedulerSweepTerminalEvidenceGapLabel(summary),
    schedulerSweepEvidenceLabel(summary),
  ]
    .filter(Boolean)
    .join(' · ');
  if (summary.includes('reason=waiting_for_first_tick')) return '自动巡检: 已接线';
  if (summary.includes('reason=ports_not_connected')) return ['自动巡检: 未接线', schedulerSweepMissingPortsLabel(summary)]
    .filter(Boolean)
    .join(' · ');
  if (summary.includes('reason=in_flight')) return '自动巡检: 运行中';
  if (summary.includes('reason=sweep_failed')) return [
    '自动巡检: 异常',
    schedulerSweepCountLabel(summary),
    schedulerSweepBlockReasonLabel(summary),
    schedulerSweepAutomationReadinessLabel(summary),
    schedulerSweepTerminalEvidenceGapLabel(summary),
    schedulerSweepEvidenceLabel(summary),
  ]
    .filter(Boolean)
    .join(' · ');
  if (summary.includes('status=skipped')) return '自动巡检: 已跳过';
  if (status.lastScheduledEventAgentSweepAt) return '自动巡检: 已运行';
  if (status.running && status.scheduledEventAgentSweepJobConnected) return '自动巡检: 已接线';
  if (status.running && !status.scheduledEventAgentSweepJobConnected) return '自动巡检: 未接线';
  if (status.running) return '自动巡检: 等待首次运行';
  return '自动巡检: 已启用';
}

function schedulerRecoveryLabel(data: HomeBriefData | null): string | null {
  const summary = data?.schedulerStatus.lastRunSweepSummary ?? '';
  if (!summary) return null;
  const checked = summary.match(/(?:^| \/ )checked=(\d+)(?: \/|$)/)?.[1];
  const recovered = summary.match(/(?:^| \/ )recovered=(\d+)(?: \/|$)/)?.[1];
  return [
    '运行恢复: 已检查',
    checked !== undefined ? `检查 ${checked}` : null,
    recovered !== undefined ? `恢复 ${recovered}` : null,
  ].filter(Boolean).join(' · ');
}

function schedulerSweepCountLabel(summary: string): string | null {
  const checked = summary.match(/(?:^| \/ )checked=(\d+)(?: \/|$)/)?.[1];
  const started = summary.match(/(?:^| \/ )started=(\d+)(?: \/|$)/)?.[1];
  const startedRunIds = summary.match(/(?:^| \/ )startedRunIds=([^/]+?)(?: \/|$)/)?.[1]?.trim();
  const startedFromRunIds = startedRunIds && startedRunIds !== 'none'
    ? String(startedRunIds.split(',').filter((runId) => runId.trim().length > 0).length)
    : undefined;
  const blocked = summary.match(/(?:^| \/ )blocked=(\d+)(?: \/|$)/)?.[1];
  return [
    checked !== undefined ? `检查 ${checked}` : null,
    started !== undefined ? `启动 ${started}` : startedFromRunIds !== undefined ? `启动 ${startedFromRunIds}` : null,
    blocked !== undefined ? `阻塞 ${blocked}` : null,
  ].filter(Boolean).join(' · ') || null;
}

function schedulerSweepEvidenceLabel(summary: string): string | null {
  const triggerRunEvidenceStatus = summary.match(/(?:^| \/ )triggerRunEvidenceStatus=([^ /]+)(?: \/|$)/)?.[1];
  if (triggerRunEvidenceStatus === 'ready_for_terminal_review') return '证据可复核';
  if (triggerRunEvidenceStatus === 'pending_terminal_run_evidence') return '证据待终态';
  return null;
}

function schedulerSweepTerminalEvidenceGapLabel(summary: string): string | null {
  const missingRunIds = summary.match(/(?:^| \/ )terminalRunEvidenceMissingRunIds=([^/]+?)(?: \/|$)/)?.[1]?.trim();
  if (!missingRunIds || missingRunIds === 'none') return null;
  const count = missingRunIds.split(',').filter((runId) => runId.trim().length > 0).length;
  return count > 0 ? `终态缺 ${count}` : null;
}

function schedulerSweepBlockReasonLabel(summary: string): string | null {
  return /daily run limit reached/i.test(summary) ? '限额' : null;
}

function schedulerSweepAutomationReadinessLabel(summary: string): string | null {
  const missing = summary.match(/(?:^| \/ )automationMissingRequirements=([^/]+?)(?: \/|$)/)?.[1]?.trim();
  if (!missing || missing === 'none') return null;
  const count = missing.split(',').filter((requirement) => requirement.trim().length > 0).length;
  return count > 0 ? `准备缺 ${count}` : null;
}

function schedulerSweepFailureLabel(summary: string): string | null {
  const runFailureReasons = summary.match(/(?:^| \/ )runFailureReasons=([^/]+?)(?: \/|$)/)?.[1]?.trim();
  if (!runFailureReasons || runFailureReasons === 'none') return null;
  const count = runFailureReasons.split(';').filter((reason) => reason.trim().length > 0).length;
  return count > 0 ? `失败 ${count}` : null;
}

function schedulerSweepMissingPortsLabel(summary: string): string | null {
  const missingPorts = summary.match(/(?:^| \/ )missingPorts=([^ /]+)(?: \/|$)/)?.[1];
  if (!missingPorts || missingPorts === 'none') return null;
  const count = missingPorts.split(',').filter(Boolean).length;
  return count > 0 ? `缺 ${count} 口` : null;
}

function focusAttentionLabel(task: FocusTask): string {
  if (task.attentionLane === 'unblock_or_decide') return '需要先解除阻塞、拍板或确认依赖。';
  if (task.attentionLane === 'review_evidence') return '有新的来源或产出可能影响下一步。';
  if (task.attentionLane === 'external_signal') return '外部信号需要确认后才进入业务线 Records 或 Next Action 上下文。';
  if (task.attentionLane === 'recent_outcome') return '近期结果或接近完成状态需要复核。';
  return '这是共享优先队列中的下一项可行动任务。';
}

export function BriefPage({ onOpenTask, onOpenBusinessLine, onOpenDecision, onOpenPanel, onOpenBusinessLinePanel }: BriefPageProps) {
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
      const focusTasks = focusTasksFromBriefData(data);
      recordBriefRecommendationSnapshot({
        recommendedTasks: focusTasks.map((task) => ({ id: task.id, title: task.title })),
        reasonCount: data.briefAttention?.displayedCount ?? focusTasks.length,
        source: 'brief_open',
      });
      setBriefData(data);
      setTasks(focusTasks);
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
      recordBriefRecommendationOrderAdjustment({
        fromTaskId: from,
        toTaskId: to,
        orderedTasks: next.map((task) => ({ id: task.id, title: task.title })),
      });
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
    const guard = guardTaskStateTransition({
      taskId: task.id,
      nextState,
      confirmationSatisfied: nextState === 'completed',
    });
    if (!guard.allowed) return;
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
  const recentBriefSnapshots = briefData?.recentBriefSnapshots ?? [];
  const scheduledSweepLabel = schedulerSweepLabel(briefData);
  const scheduledRecoveryLabel = schedulerRecoveryLabel(briefData);

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
            运行中: {briefData?.recentRunCount ?? runningCount}
          </div>
        )}
        {(briefData?.waitingTaskCount ?? waitingCount) > 0 && (
          <div className="stat-chip">
            <span className="dot waiting" />
            等待中: {briefData?.waitingTaskCount ?? waitingCount}
          </div>
        )}
        {(briefData?.activeTaskCount ?? 0) > 0 && (
          <div className="stat-chip">
            <span className="dot" />
            进行中: {briefData?.activeTaskCount}
          </div>
        )}
        {scheduledSweepLabel && (
          <div
            className="stat-chip"
            title={briefData?.schedulerStatus.lastScheduledEventAgentSweepSummary
              ?? briefData?.schedulerStatus.lastScheduledEventAgentSweepAt
              ?? (briefData?.schedulerStatus.scheduledEventAgentSweepJobConnected ? 'scheduled/event Agent sweep job connected' : undefined)}
          >
            <span className={briefData?.schedulerStatus.running ? 'dot running' : 'dot'} />
            {scheduledSweepLabel}
          </div>
        )}
        {scheduledRecoveryLabel && (
          <div
            className="stat-chip"
            title={briefData?.schedulerStatus.lastRunSweepSummary
              ?? briefData?.schedulerStatus.lastRunSweepAt
              ?? undefined}
          >
            <span className="dot" />
            {scheduledRecoveryLabel}
          </div>
        )}
      </div>

      {/* Focus cards */}
      {(briefData?.businessLineSuggestions?.length ?? 0) > 0 && (
        <div className="brief-section">
          <div className="brief-section-label">业务线建议</div>
          <div className="brief-section-note">
            优先显示能形成学习闭环的下一步。
          </div>
          <div className="business-today-list">
            {briefData!.businessLineSuggestions!.map((suggestion) => (
              <div key={suggestion.id} className="business-today-card">
                <div className="business-today-top">
                  <button className="link-button" onClick={() => onOpenBusinessLine(suggestion.businessLineId)}>
                    {suggestion.businessLineTitle}
                  </button>
                  <span className="tag">{suggestion.type}</span>
                  <span className={`risk-pill risk-${suggestion.risk.level}`}>{suggestion.risk.level}</span>
                  {suggestion.requiresDecision && <span className="risk-pill risk-medium">Decision</span>}
                </div>
                <h3>{suggestion.nextStep}</h3>
                <p>{suggestion.whyNow}</p>
                <small>
                  Impact: {suggestion.expectedImpact}
                  {' · '}
                  Effort: {suggestion.effort.level}
                  {suggestion.effort.note ? ` (${suggestion.effort.note})` : ''}
                  {' · '}
                  Confidence {suggestion.confidence}
                </small>
                <div className="business-source-list">
                  {(suggestion.sourceRecords.length > 0 ? suggestion.sourceRecords : ['missing-context']).map((source) => (
                    <span key={source}>{source}</span>
                  ))}
                </div>
                <div className="business-today-actions">
                  <button className="btn sm" onClick={() => onOpenBusinessLine(suggestion.businessLineId)}>
                    查看业务线
                  </button>
                  <button
                    className="btn sm primary"
                    onClick={() => onOpenBusinessLinePanel(
                      suggestion.businessLineId,
                      suggestion.businessLineTitle,
                      `请围绕这个业务线建议推进下一步。\n\n业务线：${suggestion.businessLineTitle}\n为什么现在：${suggestion.whyNow}\n预期影响：${suggestion.expectedImpact}\n工作量：${suggestion.effort.level}${suggestion.effort.note ? ` - ${suggestion.effort.note}` : ''}\n信心：${suggestion.confidence}\n来源：${suggestion.sourceRecords.join(' / ') || 'missing context'}\n来源 ID：${suggestion.sourceRecordIds.join(' / ') || 'none'}\n风险：${suggestion.risk.level}${suggestion.risk.note ? ` - ${suggestion.risk.note}` : ''}`,
                      suggestion.taskId,
                    )}
                  >
                    AI 协助
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Focus cards */}
      <div className="brief-section">
        <div className="brief-section-label">内部信息</div>
        <div className="brief-section-note">
          {briefDisplaySummary(briefData, tasks.length)}
        </div>
        <div className="focus-list">
          {orderAdjusted && (
            <div className="focus-order-note">
              今日顺序已调整，仅今天有效；Tasks 默认排序不会被改写。
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
                在 External Access 授权邮件或日历后，AI 会提取需要跟进的信号，并等待你确认是否长成任务。
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
          <span className={`tag lane-${focusStatusTone(task)}`}>
            {focusStatusLabel(task)}
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
        {task.parentTitle && (
          <div className="focus-parent">所属项目：{task.parentTitle}</div>
        )}
        <div className={whyNowClass}>{task.whyNow}</div>
        <div className="focus-explain">
          {typeof task.rank === 'number' && <span>#{task.rank}</span>}
          <span>入选依据：{focusAttentionLabel(task)}</span>
        </div>
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
