import { useEffect, useRef, useState } from 'react';

import type { CreateDecisionInput, DecisionRecord } from '@shared/types/decision';
import type { CreateRunInput, RunRecord } from '@shared/types/run';
import type {
  CreateTaskInput,
  TaskDetail,
  TaskRiskLevel,
  TaskRecord,
  TaskState,
  TimelineEventRecord,
  UpdateTaskInput,
} from '@shared/types/task';

const riskOptions: TaskRiskLevel[] = ['none', 'low', 'medium', 'high'];

const transitionOptions: Record<TaskState, TaskState[]> = {
  captured: ['triaged', 'planned', 'archived'],
  triaged: ['planned', 'archived'],
  planned: ['running', 'waiting_external', 'completed', 'archived'],
  running: ['waiting_external', 'completed', 'archived'],
  waiting_external: ['planned', 'running', 'completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

const TIMELINE_PREVIEW_COUNT = 5;

function getTaskCardTone(task: TaskRecord): string {
  if (task.riskLevel === 'high') {
    return 'task-card-danger';
  }

  if (task.state === 'waiting_external' || task.waitingReason) {
    return 'task-card-warning';
  }

  if (!task.nextStep && !['completed', 'archived'].includes(task.state)) {
    return 'task-card-muted';
  }

  return '';
}

function buildTaskBadges(task: TaskRecord): string[] {
  const badges: string[] = [];

  if (task.riskLevel !== 'none') {
    badges.push(`risk:${task.riskLevel}`);
  }

  if (task.state === 'waiting_external' || task.waitingReason) {
    badges.push('waiting');
  }

  if (!task.nextStep && !['completed', 'archived'].includes(task.state)) {
    badges.push('next-step?');
  }

  return badges;
}

function safeParsePayload(payload: string | null): Record<string, unknown> | null {
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '未填写';
  }

  return String(value);
}

function formatTimelineBadge(type: string): string {
  switch (type) {
    case 'task.created':
      return '创建';
    case 'task.decision_cancelled':
      return '决策取消';
    case 'task.run_failed':
      return '执行失败';
    case 'task.transitioned':
      return '状态';
    case 'task.next_step_changed':
      return '下一步';
    case 'task.waiting_changed':
      return '等待';
    case 'waiting_item.created':
      return '等待项';
    case 'waiting_item.updated':
      return '等待项';
    case 'waiting_item.resolved':
      return '等待项';
    case 'task.risk_changed':
      return '风险';
    case 'task.updated':
      return '更新';
    default:
      return type;
  }
}

function getTimelineToneClass(type: string): string {
  switch (type) {
    case 'task.decision_cancelled':
    case 'task.run_failed':
    case 'task.risk_changed':
      return 'timeline-item-risk';
    case 'task.waiting_changed':
    case 'waiting_item.created':
    case 'waiting_item.updated':
    case 'waiting_item.resolved':
      return 'timeline-item-waiting';
    case 'task.transitioned':
      return 'timeline-item-state';
    case 'task.next_step_changed':
      return 'timeline-item-next-step';
    default:
      return 'timeline-item-default';
  }
}

function formatTimelineSummary(event: TimelineEventRecord): string {
  const payload = safeParsePayload(event.payload);

  switch (event.type) {
    case 'task.created':
      return `创建任务：${formatValue(payload?.title)}`;
    case 'task.decision_cancelled':
      return `相关决策已取消：${formatValue(payload?.decisionTitle)}`;
    case 'task.run_failed':
      return `执行失败：${formatValue(payload?.failureReason)}`;
    case 'task.transitioned':
      return `状态从 ${formatValue(payload?.from)} 变更为 ${formatValue(payload?.to)}`;
    case 'task.next_step_changed':
      return `下一步从“${formatValue(payload?.from)}”调整为“${formatValue(payload?.to)}”`;
    case 'task.waiting_changed':
      return `等待原因从“${formatValue(payload?.from)}”调整为“${formatValue(payload?.to)}”`;
    case 'waiting_item.created':
      return `创建等待项：${formatValue(payload?.reason)}`;
    case 'waiting_item.updated':
      return `更新等待项：${formatValue(payload?.reason)}`;
    case 'waiting_item.resolved':
      return `解除等待项：${formatValue(payload?.reason)}`;
    case 'task.risk_changed': {
      const from = (payload?.from as Record<string, unknown> | undefined) ?? {};
      const to = (payload?.to as Record<string, unknown> | undefined) ?? {};
      return `风险从 ${formatValue(from.level)}（${formatValue(from.note)}）调整为 ${formatValue(to.level)}（${formatValue(to.note)}）`;
    }
    case 'task.updated':
      return '任务字段已更新';
    default:
      return event.type;
  }
}

function getTimelineActionLabel(type: string): string | null {
  switch (type) {
    case 'task.decision_cancelled':
      return '生成新的 Decision';
    case 'task.run_failed':
      return '准备重试 Run';
    case 'task.waiting_changed':
      return '补跟进动作';
    case 'task.risk_changed':
      return '处理风险';
    default:
      return null;
  }
}

type TasksPageProps = {
  decisions: DecisionRecord[];
  focusedTaskId: string | null;
  runs: RunRecord[];
  tasks: TaskRecord[];
  onCreateDecision: (input: CreateDecisionInput) => Promise<void>;
  onRefresh: () => Promise<void>;
  onCreateTask: (input: CreateTaskInput) => Promise<void>;
  onTriggerRun: (input: CreateRunInput) => Promise<void>;
  onUpdateTask: (input: UpdateTaskInput) => Promise<TaskRecord>;
  onTransitionTask: (
    taskId: string,
    nextState: TaskState,
    waitingReason?: string,
  ) => Promise<TaskRecord>;
  onTaskFocusConsumed: () => void;
};

export function TasksPage({
  decisions,
  focusedTaskId,
  runs,
  tasks,
  onCreateDecision,
  onRefresh,
  onCreateTask,
  onTriggerRun,
  onUpdateTask,
  onTransitionTask,
  onTaskFocusConsumed,
}: TasksPageProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(tasks[0]?.id ?? null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSummary, setDraftSummary] = useState('');
  const [draftNextStep, setDraftNextStep] = useState('');
  const [draftWaitingReason, setDraftWaitingReason] = useState('');
  const [draftRiskLevel, setDraftRiskLevel] = useState<TaskRiskLevel>('none');
  const [draftRiskNote, setDraftRiskNote] = useState('');
  const [quickDecisionTitle, setQuickDecisionTitle] = useState('');
  const [quickRunType, setQuickRunType] = useState<CreateRunInput['type']>('draft');
  const [quickRunInstructions, setQuickRunInstructions] = useState('');
  const [transitionWaitingReason, setTransitionWaitingReason] = useState('');
  const [detailError, setDetailError] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [showAllTimeline, setShowAllTimeline] = useState(false);
  const detailFormRef = useRef<HTMLFormElement | null>(null);
  const quickActionsRef = useRef<HTMLDivElement | null>(null);

  function updateDraftRiskLevel(nextRiskLevel: TaskRiskLevel) {
    setDraftRiskLevel(nextRiskLevel);

    if (detailError) {
      setDetailError(null);
    }

    if (
      nextRiskLevel !== 'high' &&
      detail?.riskLevel === 'high' &&
      draftRiskNote === (detail.riskNote ?? '')
    ) {
      setDraftRiskNote('');
    }
  }

  useEffect(() => {
    if (!selectedTaskId && tasks[0]) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    if (!focusedTaskId) {
      return;
    }

    const taskExists = tasks.some((task) => task.id === focusedTaskId);

    if (taskExists) {
      setSelectedTaskId(focusedTaskId);
      onTaskFocusConsumed();
    }
  }, [focusedTaskId, onTaskFocusConsumed, tasks]);

  useEffect(() => {
    let mounted = true;

    async function loadDetail() {
      if (!selectedTaskId) {
        setDetail(null);
        return;
      }

      const nextDetail = await window.api.getTaskDetail(selectedTaskId);

      if (mounted) {
        setDetail(nextDetail);
        setDraftTitle(nextDetail?.title ?? '');
        setDraftSummary(nextDetail?.summary ?? '');
        setDraftNextStep(nextDetail?.nextStep ?? '');
        setDraftWaitingReason(nextDetail?.waitingReason ?? '');
        setDraftRiskLevel(nextDetail?.riskLevel ?? 'none');
        setDraftRiskNote(nextDetail?.riskNote ?? '');
        setTransitionWaitingReason(nextDetail?.waitingReason ?? '');
        setDetailError(null);
        setTransitionError(null);
        setShowAllTimeline(false);
        setQuickDecisionTitle(
          nextDetail ? `${nextDetail.title} 需要拍板` : '',
        );
        setQuickRunInstructions(nextDetail?.nextStep ?? nextDetail?.summary ?? '');
      }
    }

    void loadDetail();

    return () => {
      mounted = false;
    };
  }, [selectedTaskId, tasks]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newTaskTitle.trim()) {
      return;
    }

    await onCreateTask({ title: newTaskTitle.trim() });
    setNewTaskTitle('');
    await onRefresh();
  }

  async function handleSaveDetail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detail) {
      return;
    }

    if (draftRiskLevel === 'high' && !draftRiskNote.trim()) {
      setDetailError('将风险等级设为 high 前，请先填写风险说明。');
      return;
    }

    setDetailError(null);

    await onUpdateTask({
      id: detail.id,
      title: draftTitle,
      summary: draftSummary,
      nextStep: draftNextStep,
      waitingReason: draftWaitingReason,
      riskLevel: draftRiskLevel,
      riskNote: draftRiskNote,
    });

    await onRefresh();
    const nextDetail = await window.api.getTaskDetail(detail.id);
    setDetail(nextDetail);
  }

  async function handleTransition(nextState: TaskState) {
    if (!detail) {
      return;
    }

    if (nextState === 'waiting_external' && !transitionWaitingReason.trim()) {
      setTransitionError('转入 waiting_external 前，请先填写等待原因。');
      return;
    }

    setTransitionError(null);

    await onTransitionTask(detail.id, nextState, nextState === 'waiting_external' ? transitionWaitingReason : undefined);
    await onRefresh();
    const nextDetail = await window.api.getTaskDetail(detail.id);
    setDetail(nextDetail);
  }

  async function handleQuickDecision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detail || !quickDecisionTitle.trim()) {
      return;
    }

    await onCreateDecision({
      taskId: detail.id,
      title: quickDecisionTitle.trim(),
    });
    await onRefresh();
  }

  async function handleQuickRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!detail) {
      return;
    }

    await onTriggerRun({
      taskId: detail.id,
      type: quickRunType,
      instructions: quickRunInstructions.trim(),
    });
    await onRefresh();
  }

  function handleTimelineAction(event: TimelineEventRecord) {
    if (!detail) {
      return;
    }

    const payload = safeParsePayload(event.payload);

    if (event.type === 'task.decision_cancelled') {
      setQuickDecisionTitle(`${detail.title} 重新拍板`);
    }

    if (event.type === 'task.run_failed') {
      setQuickRunType('draft');
      setQuickRunInstructions(
        `请先处理这个失败原因，再准备新的执行内容：${formatValue(payload?.failureReason)}`,
      );
    }

    if (event.type === 'task.waiting_changed') {
      setDraftNextStep(`跟进并确认是否解除等待：${formatValue(payload?.to)}`);
    }

    if (event.type === 'task.risk_changed') {
      const nextRisk = (payload?.to as Record<string, unknown> | undefined) ?? {};
      const nextRiskLevel = nextRisk.level;
      const nextRiskNote = formatValue(nextRisk.note);

      if (nextRiskLevel && ['none', 'low', 'medium', 'high'].includes(String(nextRiskLevel))) {
        setDraftRiskLevel(nextRiskLevel as TaskRiskLevel);
      }

      setDraftRiskNote(nextRiskNote === '未填写' ? '' : nextRiskNote);
      setDraftNextStep(
        `处理当前风险并确认是否需要降级：${nextRiskNote === '未填写' ? '补充风险说明' : nextRiskNote}`,
      );
    }

    const focusTarget =
      event.type === 'task.waiting_changed' || event.type === 'task.risk_changed'
        ? detailFormRef.current
        : quickActionsRef.current;

    if (typeof focusTarget?.scrollIntoView === 'function') {
      focusTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  const relatedDecisions = detail
    ? decisions
        .filter((decision) => decision.taskId === detail.id)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 5)
    : [];

  const relatedRuns = detail
    ? runs
        .filter((run) => run.taskId === detail.id)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 5)
    : [];

  const visibleTimeline = detail
    ? showAllTimeline
      ? detail.timeline
      : detail.timeline.slice(0, TIMELINE_PREVIEW_COUNT)
    : [];

  return (
    <section className="tasks-layout">
      <article className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Tasks</p>
            <h2>任务列表</h2>
          </div>
        </div>
        <form className="stack" onSubmit={handleCreate}>
          <label>
            新任务标题
            <input value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} />
          </label>
          <button type="submit">创建任务</button>
        </form>
        <div className="task-list">
          {tasks.length === 0 ? (
            <p className="meta">还没有任务，先创建一条开始流转。</p>
          ) : (
            tasks.map((task) => (
              <button
                className={`task-card task-card-button ${getTaskCardTone(task)} ${
                  task.id === selectedTaskId ? 'task-card-active' : ''
                }`}
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                type="button"
              >
                <div className="task-row">
                  <strong>{task.title}</strong>
                  <span className="status">{task.state}</span>
                </div>
                <p className="meta">{task.summary || task.id}</p>
                {buildTaskBadges(task).length ? (
                  <div className="signal-row">
                    {buildTaskBadges(task).map((badge) => (
                      <span className="signal-pill" key={badge}>
                        {badge}
                      </span>
                    ))}
                  </div>
                ) : null}
                {task.nextStep ? <p className="meta">下一步：{task.nextStep}</p> : null}
                {task.waitingReason ? <p className="meta">等待：{task.waitingReason}</p> : null}
              </button>
            ))
          )}
        </div>
      </article>

      <article className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Task Detail</p>
            <h2>{detail?.title ?? '选择一个任务'}</h2>
          </div>
        </div>
        {detail ? (
          <>
            <form className="stack" onSubmit={handleSaveDetail} ref={detailFormRef}>
              <label>
                标题
                <input
                  value={draftTitle}
                  onChange={(event) => {
                    setDraftTitle(event.target.value);
                    if (detailError) {
                      setDetailError(null);
                    }
                  }}
                />
              </label>
              <label>
                Summary
                <textarea
                  rows={4}
                  value={draftSummary}
                  onChange={(event) => {
                    setDraftSummary(event.target.value);
                    if (detailError) {
                      setDetailError(null);
                    }
                  }}
                />
              </label>
              <label>
                Next Step
                <input
                  value={draftNextStep}
                  onChange={(event) => {
                    setDraftNextStep(event.target.value);
                    if (detailError) {
                      setDetailError(null);
                    }
                  }}
                />
              </label>
              <label>
                Waiting Reason
                <input
                  value={draftWaitingReason}
                  onChange={(event) => {
                    setDraftWaitingReason(event.target.value);
                    if (detailError) {
                      setDetailError(null);
                    }
                  }}
                />
              </label>
              <label>
                Risk Level
                <select
                  value={draftRiskLevel}
                  onChange={(event) => updateDraftRiskLevel(event.target.value as TaskRiskLevel)}
                >
                  {riskOptions.map((riskLevel) => (
                    <option key={riskLevel} value={riskLevel}>
                      {riskLevel}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Risk Note
                <textarea
                  rows={3}
                  value={draftRiskNote}
                  onChange={(event) => {
                    setDraftRiskNote(event.target.value);
                    if (detailError) {
                      setDetailError(null);
                    }
                  }}
                />
              </label>
              {detailError ? <p className="meta">{detailError}</p> : null}
              <button type="submit">保存详情</button>
            </form>

            <div className="transition-group">
              <h3>Task Signals</h3>
              <div className="timeline-list">
                <div className="timeline-item">
                  <strong>Next Step</strong>
                  <p className="meta">{detail.nextStep ?? '未填写'}</p>
                </div>
                <div className="timeline-item">
                  <strong>Waiting Reason</strong>
                  <p className="meta">{detail.activeWaitingItem?.reason ?? detail.waitingReason ?? '未填写'}</p>
                  {detail.activeWaitingItem ? (
                    <p className="meta">
                      waiting item · {detail.activeWaitingItem.status} · since {detail.activeWaitingItem.createdAt}
                    </p>
                  ) : null}
                </div>
                <div className="timeline-item">
                  <strong>Risk</strong>
                  <p className="meta">
                    {detail.riskLevel}
                    {detail.riskNote ? ` · ${detail.riskNote}` : ''}
                  </p>
                </div>
              </div>
            </div>

            <div className="transition-group">
              <h3>Quick Actions</h3>
              <div className="quick-actions-grid" ref={quickActionsRef}>
                <form className="stack task-card quick-action-card" onSubmit={handleQuickDecision}>
                  <strong>创建 Decision</strong>
                  <label>
                    决策标题
                    <input
                      value={quickDecisionTitle}
                      onChange={(event) => setQuickDecisionTitle(event.target.value)}
                    />
                  </label>
                  <button type="submit">提交 Decision</button>
                </form>

                <form className="stack task-card quick-action-card" onSubmit={handleQuickRun}>
                  <strong>触发 Run</strong>
                  <label>
                    Run 类型
                    <select
                      value={quickRunType}
                      onChange={(event) =>
                        setQuickRunType(event.target.value as CreateRunInput['type'])
                      }
                    >
                      <option value="draft">draft</option>
                      <option value="summarize">summarize</option>
                    </select>
                  </label>
                  <label>
                    附加要求
                    <textarea
                      rows={3}
                      value={quickRunInstructions}
                      onChange={(event) => setQuickRunInstructions(event.target.value)}
                    />
                  </label>
                  <button type="submit">触发 Run</button>
                </form>
              </div>
            </div>

            <div className="transition-group">
              <h3>Related Activity</h3>
              <div className="related-grid">
                <div className="timeline-list">
                  <strong>Decisions</strong>
                  {relatedDecisions.length ? (
                    relatedDecisions.map((decision) => (
                      <div className="timeline-item" key={decision.id}>
                        <div className="task-row">
                          <strong>{decision.title}</strong>
                          <span className="status">{decision.status}</span>
                        </div>
                        <p className="meta">{decision.updatedAt}</p>
                      </div>
                    ))
                  ) : (
                    <p className="meta">当前任务还没有关联 decision。</p>
                  )}
                </div>

                <div className="timeline-list">
                  <strong>Recent Runs</strong>
                  {relatedRuns.length ? (
                    relatedRuns.map((run) => (
                      <div className="timeline-item" key={run.id}>
                        <div className="task-row">
                          <strong>{run.type}</strong>
                          <span className="status">{run.status}</span>
                        </div>
                        <p className="meta">
                          {run.outputSource ? `来源：${run.outputSource}` : '来源：尚未产生'}
                        </p>
                        <p className="meta">{run.updatedAt}</p>
                      </div>
                    ))
                  ) : (
                    <p className="meta">当前任务还没有关联 run。</p>
                  )}
                </div>
              </div>
            </div>

            <div className="transition-group">
              <h3>状态流转</h3>
              <div className="stack">
                <label>
                  Waiting Transition Reason
                  <input
                    placeholder="例如：等待外部审批 / 客户回复 / 法务确认"
                    value={transitionWaitingReason}
                    onChange={(event) => {
                      setTransitionWaitingReason(event.target.value);
                      if (transitionError) {
                        setTransitionError(null);
                      }
                    }}
                  />
                </label>
                {transitionError ? <p className="meta">{transitionError}</p> : null}
              </div>
              <div className="chip-row">
                {transitionOptions[detail.state].length === 0 ? (
                  <p className="meta">当前状态没有可用的下一步。</p>
                ) : (
                  transitionOptions[detail.state].map((nextState) => (
                    <button
                      className="ghost-button"
                      key={nextState}
                      onClick={() => void handleTransition(nextState)}
                      type="button"
                    >
                      转到 {nextState}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="transition-group">
              <div className="task-row">
                <h3>Timeline</h3>
                {detail.timeline.length > TIMELINE_PREVIEW_COUNT ? (
                  <button
                    className="ghost-button timeline-toggle"
                    onClick={() => setShowAllTimeline((current) => !current)}
                    type="button"
                  >
                    {showAllTimeline ? '收起旧事件' : `展开全部 (${detail.timeline.length})`}
                  </button>
                ) : null}
              </div>
              <div className="timeline-list">
                {visibleTimeline.map((event) => (
                  <div className={`timeline-item ${getTimelineToneClass(event.type)}`} key={event.id}>
                    <div className="task-row">
                      <strong>{formatTimelineSummary(event)}</strong>
                      <span
                        className={`signal-pill timeline-badge ${getTimelineToneClass(event.type)}`}
                      >
                        {formatTimelineBadge(event.type)}
                      </span>
                    </div>
                    <p className="meta">{event.createdAt}</p>
                    {getTimelineActionLabel(event.type) ? (
                      <button
                        className="ghost-button timeline-action"
                        onClick={() => handleTimelineAction(event)}
                        type="button"
                      >
                        {getTimelineActionLabel(event.type)}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="meta">先在左侧创建或选择一个任务。</p>
        )}
      </article>
    </section>
  );
}
