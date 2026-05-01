import { Fragment, useEffect, useState } from 'react';

import type { RecommendedActionIntent } from '@shared/types/brief';
import type { CreateDecisionInput, DecisionDraftRecord, DecisionRecord } from '@shared/types/decision';
import type { AiConfigStatus } from '@shared/types/settings';
import type { TaskDetail, TaskListItemRecord, TimelineEventRecord } from '@shared/types/task';
import {
  formatTaskTimelineEventSummary,
  getTaskTimelineFollowUpActionLabel,
  getTaskTimelineLane,
  getTaskTimelineLaneLabel,
  getTaskTimelineObjectAction,
  getTaskTimelinePreviewEvents,
  getTaskTimelineResponsibilitySummary,
  groupTaskTimelineEventsByDateObjectAndPriority,
  parseTimelinePayload,
} from '@shared/working-context/timeline';

const RELATED_TIMELINE_PREVIEW_COUNT = 4;
const BROWSER_CONTROLLED_CHECKPOINT_LABELS = new Set([
  'browser.controlled_interaction',
  'Browser controlled checkpoint',
]);

const CHECKPOINT_ACTION_LABELS: Record<string, string> = {
  'artifact.create_note': '本地 note 产物写入',
  'source_context.create': '来源上下文创建',
  'task.create_completion_criterion': '完成标准创建',
  'task.update_next_step': '任务下一步更新',
  'workspace.run_command': '工作区命令运行',
  'workspace.write_patch': '工作区 patch 应用',
  'workspace.staged_patch': 'sandbox patch promotion',
};

function formatRelatedTimelineSummary(event: TimelineEventRecord): string {
  return formatTaskTimelineEventSummary(event);
}

function getRelatedTimelineActionLabel(event: TimelineEventRecord): string | null {
  return getTaskTimelineFollowUpActionLabel(event.type);
}

function getRelatedTimelineObjectLabel(event: TimelineEventRecord): string | null {
  return getTaskTimelineObjectAction(event).label;
}

function getRelatedTimeline(events: TimelineEventRecord[], decisionTitle: string): TimelineEventRecord[] {
  const relatedEvents = events.filter((event) => {
    if (
      event.type === 'task.decision_approved' ||
      event.type === 'task.decision_deferred' ||
      event.type === 'task.decision_cancelled'
    ) {
      const payload = parseTimelinePayload(event.payload);
      return payload?.decisionTitle === decisionTitle;
    }

    if (
      event.type === 'task.waiting_changed' ||
      event.type === 'task.risk_changed' ||
      event.type === 'task.next_step_changed'
    ) {
      return true;
    }

    return false;
  });

  return getTaskTimelinePreviewEvents(relatedEvents, RELATED_TIMELINE_PREVIEW_COUNT);
}

function getDecisionActionGuidance(status: DecisionRecord['status']): string {
  if (status === 'pending') {
    return '这条拍板仍待处理，可以批准、延后或取消；处理后会回写到关联任务。';
  }

  if (status === 'approved') {
    return '这条拍板已批准，正式动作已完成；下一步应回到任务继续推进。';
  }

  if (status === 'deferred') {
    return '这条拍板已延后，正式动作已完成；下一步应回到任务跟进恢复拍板或替代路径。';
  }

  return '这条拍板已取消，正式动作已完成；下一步应回到任务重新评估推进路径。';
}

function getCheckpointDecisionGuidance(
  decision: DecisionRecord,
  sandboxPatchPromotionApplyEnabled: boolean,
): string | null {
  if (decision.sourceType !== 'agent_checkpoint') {
    return null;
  }

  const sourceLabel = decision.sourceLabel ?? '等待中的 agent 工具调用';
  const isBrowserControlledCheckpoint = BROWSER_CONTROLLED_CHECKPOINT_LABELS.has(sourceLabel);
  const actionLabel = isBrowserControlledCheckpoint
    ? '受控浏览器单动作恢复'
    : CHECKPOINT_ACTION_LABELS[sourceLabel] ?? '本地工具调用';

  if (decision.status === 'pending') {
    if (isBrowserControlledCheckpoint) {
      return `来源：Agent checkpoint（${sourceLabel}）。批准后只会恢复 checkpoint 中记录的一个受控浏览器动作；不会授予通用浏览器会话、调度器启动、provider 调用或模型可见浏览器工具。延后或取消会终止本次 run 的该动作恢复。`;
    }

    if (sourceLabel === 'workspace.write_patch') {
      return `来源：Agent checkpoint（${sourceLabel}）。批准后会恢复等待中的${actionLabel}并写入受影响文件；延后或取消会终止本次 run，不会继续应用该 patch。`;
    }

    if (sourceLabel === 'workspace.run_command') {
      return `来源：Agent checkpoint（${sourceLabel}）。批准后会恢复等待中的${actionLabel}，且仅限 package.json 中的 test / lint 脚本；请先在 Runs 查看脚本、参数、超时和工作目录；延后或取消会终止本次 run，不会继续运行该命令。`;
    }

    if (sourceLabel === 'workspace.staged_patch') {
      return sandboxPatchPromotionApplyEnabled
        ? `来源：Agent checkpoint（${sourceLabel}）。这是 sandbox staged patch 的提升审查；请先查看 Run 证据与 promotion readiness；批准后会通过 promotion preflight/apply service 写入受影响文件；延后或取消不会写入工作区文件。`
        : `来源：Agent checkpoint（${sourceLabel}）。这是 sandbox staged patch 的提升审查；请先查看 Run 证据与 promotion readiness；当前版本批准后只会确认并关闭 promotion checkpoint，不会自动写入工作区文件。`;
    }

    return `来源：Agent checkpoint（${sourceLabel}）。批准后会进入等待中的${actionLabel}恢复路径，恢复结果以 Run 证据为准；延后或取消会终止本次 run。`;
  }

  if (decision.status === 'approved') {
    if (isBrowserControlledCheckpoint) {
      return `来源：Agent checkpoint（${sourceLabel}）。该确认已批准，系统只会尝试恢复 checkpoint 中记录的一个浏览器动作；Run 证据会记录恢复结果，不会开启通用浏览器会话。`;
    }

    if (sourceLabel === 'workspace.staged_patch') {
      return sandboxPatchPromotionApplyEnabled
        ? `来源：Agent checkpoint（${sourceLabel}）。该 promotion 已批准；若 apply service 通过预检，Run 证据会记录已写入或已应用状态。`
        : `来源：Agent checkpoint（${sourceLabel}）。该 promotion 已批准并记录，但当前版本不会自动写入工作区文件。`;
    }

    return `来源：Agent checkpoint（${sourceLabel}）。该确认已批准；等待中的${actionLabel}恢复结果以 Run 证据为准。`;
  }

  return `来源：Agent checkpoint（${sourceLabel}）。该确认未批准，本次 run 会作为不可续跑的执行记录收束。`;
}

function getDecisionTaskFollowUpIntent(
  decision: DecisionRecord,
  sandboxPatchPromotionApplyEnabled: boolean,
): RecommendedActionIntent {
  return {
    type:
      decision.status === 'deferred'
        ? 'focus_waiting_follow_up'
        : decision.status === 'cancelled'
          ? 'focus_risk_review'
          : 'focus_next_step',
    focusArea: 'detail',
    prefillNextStep: getDecisionTaskFollowUpNextStep(decision, sandboxPatchPromotionApplyEnabled),
  };
}

function getDecisionTaskFollowUpNextStep(
  decision: DecisionRecord,
  sandboxPatchPromotionApplyEnabled: boolean,
): string {
  if (decision.status === 'approved') {
    return `已获批准，继续推进：${decision.title}`;
  }

  if (decision.status === 'deferred') {
    return `跟进该决策是否可以恢复拍板：${decision.title}`;
  }

  if (decision.status === 'cancelled') {
    return `重新评估该决策并确定替代推进路径：${decision.title}`;
  }

  if (decision.sourceType === 'agent_checkpoint') {
    const sourceLabel = decision.sourceLabel ?? '等待中的 agent 工具调用';
    const isBrowserControlledCheckpoint = BROWSER_CONTROLLED_CHECKPOINT_LABELS.has(sourceLabel);

    if (isBrowserControlledCheckpoint) {
      return '先审查 browser.controlled_interaction checkpoint 的 URL、origin、目标元素和截图/文本证据；批准后只恢复一个记录动作，不开放浏览器会话。';
    }

    if (sourceLabel === 'workspace.write_patch') {
      return '先审查 workspace.write_patch checkpoint 的 diff 和受影响文件；批准后再回到任务确认 patch 是否已应用。';
    }

    if (sourceLabel === 'workspace.run_command') {
      return '先审查 workspace.run_command checkpoint 的脚本、参数、超时和工作目录；批准后再回到任务确认命令结果。';
    }

    if (
      sourceLabel === 'task.update_next_step' ||
      sourceLabel === 'task.create_completion_criterion' ||
      sourceLabel === 'source_context.create'
    ) {
      return `先审查 ${sourceLabel} checkpoint 的输入；批准后再回到任务确认${CHECKPOINT_ACTION_LABELS[sourceLabel]}结果。`;
    }

    if (sourceLabel === 'workspace.staged_patch') {
      return sandboxPatchPromotionApplyEnabled
        ? '先查看 Run 证据与 promotion readiness；批准后再确认 sandbox staged patch 是否通过预检并写入。'
        : '先查看 Run 证据与 promotion readiness；当前版本批准后只会关闭 checkpoint，不会自动写入工作区文件。';
    }

    return `先处理 ${sourceLabel} checkpoint / Decision，再决定是否继续执行任务。`;
  }

  return `先处理该待拍板事项，再回到任务推进：${decision.title}`;
}

type DecisionsPageProps = {
  aiStatus: AiConfigStatus | null;
  decisions: DecisionRecord[];
  focusedDecisionId: string | null;
  tasks: TaskListItemRecord[];
  onOpenTask: (taskId: string, intent: RecommendedActionIntent) => void;
  onOpenRunForCheckpoint: (checkpointId: string) => Promise<boolean>;
  onCreateDecision: (input: CreateDecisionInput) => Promise<void>;
  onDraftDecision: (taskId: string, note?: string | null) => Promise<DecisionDraftRecord>;
  onAct: (id: string, action: 'approve' | 'defer' | 'cancel') => Promise<void>;
  onDecisionFocusConsumed: () => void;
};

export function DecisionsPage({
  aiStatus,
  decisions,
  focusedDecisionId,
  tasks,
  onOpenTask,
  onOpenRunForCheckpoint,
  onCreateDecision,
  onDraftDecision,
  onAct,
  onDecisionFocusConsumed,
}: DecisionsPageProps) {
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(
    focusedDecisionId ?? decisions[0]?.id ?? null,
  );
  const [relatedTaskDetail, setRelatedTaskDetail] = useState<TaskDetail | null>(null);
  const [form, setForm] = useState<CreateDecisionInput>({
    taskId: tasks[0]?.id ?? '',
    title: '',
  });
  const [draftNote, setDraftNote] = useState('');
  const [draftRationale, setDraftRationale] = useState<string | null>(null);
  const [checkpointReviewError, setCheckpointReviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedDecisionId && decisions[0]) {
      setSelectedDecisionId(decisions[0].id);
    }
  }, [decisions, selectedDecisionId]);

  useEffect(() => {
    if (!focusedDecisionId) {
      return;
    }

    if (decisions.some((decision) => decision.id === focusedDecisionId)) {
      setSelectedDecisionId(focusedDecisionId);
      onDecisionFocusConsumed();
    }
  }, [decisions, focusedDecisionId, onDecisionFocusConsumed]);

  const detail = decisions.find((decision) => decision.id === selectedDecisionId) ?? null;
  const canOpenCheckpointRun = detail?.sourceType === 'agent_checkpoint' && Boolean(detail.sourceId);

  useEffect(() => {
    setCheckpointReviewError(null);
  }, [detail?.id]);

  useEffect(() => {
    let mounted = true;

    async function loadRelatedTaskDetail() {
      if (!detail?.taskId) {
        setRelatedTaskDetail(null);
        return;
      }

      const nextDetail = await window.api.getTaskDetail(detail.taskId);

      if (mounted) {
        setRelatedTaskDetail(nextDetail);
      }
    }

    void loadRelatedTaskDetail();

    return () => {
      mounted = false;
    };
  }, [detail?.id, detail?.taskId]);

  function handleRelatedTimelineObjectOpen(event: TimelineEventRecord) {
    const objectAction = getTaskTimelineObjectAction(event);

    if (objectAction.targetType === 'decision' && objectAction.targetId) {
      setSelectedDecisionId(objectAction.targetId);
    }
  }

  async function handleOpenCheckpointRun(): Promise<void> {
    if (!detail?.sourceId) {
      return;
    }

    const opened = await onOpenRunForCheckpoint(detail.sourceId);
    if (!opened) {
      setCheckpointReviewError('没有找到关联的 Run 证据；请从 Runs 队列手动查找这次 checkpoint。');
    }
  }

  const relatedTimeline = detail
    ? getRelatedTimeline(relatedTaskDetail?.timeline ?? [], detail.title)
    : [];
  const relatedTimelineDateGroups = groupTaskTimelineEventsByDateObjectAndPriority(relatedTimeline);
  const checkpointGuidance = detail
    ? getCheckpointDecisionGuidance(detail, Boolean(aiStatus?.featureFlags.enableSandboxPatchPromotionApply))
    : null;

  return (
    <section className="tasks-layout">
      <article className="panel">
        <article className="hero page-hero">
          <p className="eyebrow">Decisions</p>
          <h1>待拍板事项</h1>
          <p className="lede">这里是 Decision 的对象工作面：先看当前拍板焦点，再决定是否创建新的请求或处理队列。</p>
        </article>

        <div className="transition-group detail-stage">
          <div className="detail-stage-head">
            <div>
              <p className="eyebrow">Current Focus</p>
              <h3>{detail ? detail.title : '当前没有待拍板事项'}</h3>
            </div>
            <p className="meta">这里只承接当前这条拍板的局部判断：先看决策焦点，再决定是否处理，最后再回到任务继续推进。</p>
          </div>

          {detail ? (
            <div className="detail-cluster-grid">
              <div className="task-card detail-card-group">
                <p className="eyebrow">Decision Snapshot</p>
                <div className="task-row">
                  <strong>{detail.title}</strong>
                  <span className="status">{detail.status}</span>
                </div>
                <p className="meta">关联任务：{detail.taskId}</p>
                <p className="meta">更新时间：{detail.updatedAt}</p>
                {checkpointGuidance ? <p className="meta">{checkpointGuidance}</p> : null}
                <p className="meta">这里负责确认这次拍板本身是否应该推进、延后或取消，不承载整条任务的全部上下文。</p>
              </div>
              <div className="task-card detail-card-group">
                <p className="eyebrow">Focus Moves</p>
                <strong>先判断这条拍板如何回流到任务</strong>
                <p className="meta">这里先区分“回到任务继续推进”和“正式拍板动作”，避免 Decision 页重新长成第二套任务工作面。</p>
                <p className="meta">回流任务</p>
                <div className="chip-row">
                  <button
                    className="ghost-button"
                    onClick={() =>
                      onOpenTask(
                        detail.taskId,
                        getDecisionTaskFollowUpIntent(
                          detail,
                          Boolean(aiStatus?.featureFlags.enableSandboxPatchPromotionApply),
                        ),
                      )
                    }
                    type="button"
                  >
                    回到任务推进
                  </button>
                  {canOpenCheckpointRun ? (
                    <button
                      className="ghost-button"
                      onClick={() => void handleOpenCheckpointRun()}
                      type="button"
                    >
                      查看 Run 证据
                    </button>
                  ) : null}
                </div>
                {checkpointReviewError ? <p className="meta">{checkpointReviewError}</p> : null}
                <p className="meta">正式拍板</p>
                <p className="meta">{getDecisionActionGuidance(detail.status)}</p>
                {detail.status === 'pending' ? (
                  <div className="chip-row">
                    <button
                      className="ghost-button"
                      onClick={() => void onAct(detail.id, 'approve')}
                      type="button"
                    >
                      批准
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() => void onAct(detail.id, 'defer')}
                      type="button"
                    >
                      延后
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() => void onAct(detail.id, 'cancel')}
                      type="button"
                    >
                      取消
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="task-card detail-card-group detail-card-wide">
                <p className="eyebrow">Related Task Timeline</p>
                <strong>这条拍板如何改变了任务</strong>
                <p className="meta">这里只截取最能解释当前 decision 的最近任务变化，帮助你判断处理完后该如何回流到主任务。</p>
                <div className="timeline-list">
                  {relatedTimelineDateGroups.length ? (
                    relatedTimelineDateGroups.map((dateGroup) => (
                      <Fragment key={dateGroup.id}>
                        <div className="timeline-date-heading">
                          <span>{dateGroup.title}</span>
                          <span>{dateGroup.eventCount}</span>
                        </div>
                        {dateGroup.objectGroups.map((objectGroup) => (
                          <Fragment key={`${dateGroup.id}:${objectGroup.id}`}>
                            <div className="timeline-object-heading">
                              <span>{objectGroup.title}</span>
                              <span>{objectGroup.eventCount}</span>
                            </div>
                            {objectGroup.priorityGroups.map((group) => (
                              <Fragment key={`${dateGroup.id}:${objectGroup.id}:${group.id}`}>
                                <div className="timeline-group-heading">
                                  <span>{group.title}</span>
                                  <span>{group.events.length}</span>
                                </div>
                                {group.events.map((event) => (
                                  <div className="timeline-item" key={event.id}>
                                    <div className="task-row">
                                      <strong>{formatRelatedTimelineSummary(event)}</strong>
                                      <div className="task-row-compact">
                                        {getTaskTimelineLaneLabel(event.type) ? (
                                          <span className={`status lane-status lane-status-${getTaskTimelineLane(event.type)}`}>
                                            {getTaskTimelineLaneLabel(event.type)}
                                          </span>
                                        ) : null}
                                        <span className="status">{event.createdAt}</span>
                                      </div>
                                    </div>
                                    <p className="meta">{event.type}</p>
                                    {getTaskTimelineResponsibilitySummary(event) ? (
                                      <p className="meta">{getTaskTimelineResponsibilitySummary(event)}</p>
                                    ) : null}
                                    {getRelatedTimelineActionLabel(event) || getRelatedTimelineObjectLabel(event) ? (
                                      <div className="chip-row">
                                        {getRelatedTimelineActionLabel(event) ? (
                                          <button
                                            className="ghost-button"
                                            onClick={() =>
                                              onOpenTask(detail.taskId, {
                                                type:
                                                  event.type === 'task.decision_deferred'
                                                    ? 'focus_waiting_follow_up'
                                                    : event.type === 'task.decision_cancelled'
                                                      ? 'focus_risk_review'
                                                      : 'focus_next_step',
                                                focusArea: 'detail',
                                                prefillNextStep:
                                                  event.type === 'task.decision_approved'
                                                    ? `已获批准，继续推进：${detail.title}`
                                                    : event.type === 'task.decision_deferred'
                                                      ? `跟进该决策是否可以恢复拍板：${detail.title}`
                                                      : `重新评估该决策并确定替代推进路径：${detail.title}`,
                                              })
                                            }
                                            type="button"
                                          >
                                            {getRelatedTimelineActionLabel(event)}
                                          </button>
                                        ) : null}
                                        {getRelatedTimelineObjectLabel(event) ? (
                                          <button
                                            className="ghost-button"
                                            onClick={() => handleRelatedTimelineObjectOpen(event)}
                                            type="button"
                                          >
                                            {getRelatedTimelineObjectLabel(event)}
                                          </button>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </Fragment>
                            ))}
                          </Fragment>
                        ))}
                      </Fragment>
                    ))
                  ) : (
                    <p className="meta">当前没有和这条 decision 强相关的最近任务历史。</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="meta">当前没有待拍板事项。</p>
          )}
        </div>

        <div className="transition-group detail-stage">
          <div className="detail-stage-head">
            <div>
              <p className="eyebrow">Action Desk</p>
              <h3>创建新的 Decision</h3>
            </div>
            <p className="meta">这里保留最小创建入口，便于把新的拍板点正式立起来。</p>
          </div>
          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!form.taskId || !form.title.trim()) {
                return;
              }
              await onCreateDecision({ taskId: form.taskId, title: form.title.trim() });
              setForm((current) => ({ ...current, title: '' }));
            }}
          >
            <label>
              关联任务
              <select
                value={form.taskId}
                onChange={(event) => setForm((current) => ({ ...current, taskId: event.target.value }))}
              >
                <option value="">选择任务</option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              决策标题
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <label>
              拍板背景
              <textarea
                rows={3}
                value={draftNote}
                onChange={(event) => setDraftNote(event.target.value)}
              />
            </label>
            {draftRationale ? <p className="meta">{draftRationale}</p> : null}
            <button
              type="button"
              className="ghost-button"
              onClick={async () => {
                if (!form.taskId) {
                  return;
                }

                const draft = await onDraftDecision(form.taskId, draftNote.trim() || null);
                setForm((current) => ({ ...current, title: draft.title }));
                setDraftRationale(
                  `${draft.source === 'ai' ? 'AI 草拟' : 'Fallback 草拟'}：${draft.rationale}${
                    draft.selectedTemplateTitles.length
                      ? ` | 模板：${draft.selectedTemplateTitles.join('、')}`
                      : ''
                  }`,
                );
              }}
            >
              草拟 Decision
            </button>
            <button type="submit">创建 Decision</button>
          </form>
        </div>
      </article>

      <article className="panel">
        <p className="eyebrow">Decisions</p>
        <h2>Decision Queue</h2>
        <div className="task-list">
          {decisions.length === 0 ? (
            <p className="meta">还没有决策请求。</p>
          ) : (
            decisions.map((decision) => (
              <button
                className={`task-card task-card-button ${
                  decision.id === selectedDecisionId ? 'task-card-active' : ''
                }`}
                key={decision.id}
                onClick={() => setSelectedDecisionId(decision.id)}
                type="button"
              >
                <div className="task-row">
                  <strong>{decision.title}</strong>
                  <span className="status">{decision.status}</span>
                </div>
                <p className="meta">{decision.taskId}</p>
                <p className="meta">{decision.updatedAt}</p>
              </button>
            ))
          )}
        </div>
      </article>
    </section>
  );
}
