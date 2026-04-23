import { useEffect, useState } from 'react';

import type { RecommendedActionIntent } from '@shared/types/brief';
import type { CreateDecisionInput, DecisionDraftRecord, DecisionRecord } from '@shared/types/decision';
import type { TaskDetail, TaskListItemRecord, TimelineEventRecord } from '@shared/types/task';
import {
  getTaskTimelineFollowUpActionLabel,
  interpretTaskTimelineEvent,
} from '@shared/working-context/timeline';

const RELATED_TIMELINE_PREVIEW_COUNT = 4;

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

function formatRelatedTimelineSummary(event: TimelineEventRecord): string {
  if (
    event.type === 'task.decision_approved' ||
    event.type === 'task.decision_deferred' ||
    event.type === 'task.decision_cancelled' ||
    event.type === 'task.risk_changed' ||
    event.type === 'task.next_step_changed'
  ) {
    return interpretTaskTimelineEvent(event).summary;
  }

  const payload = safeParsePayload(event.payload);
  return `等待原因调整为“${String(payload?.to ?? '未填写')}”`;
}

function getRelatedTimelineActionLabel(event: TimelineEventRecord): string | null {
  return getTaskTimelineFollowUpActionLabel(event.type);
}

function getRelatedTimelineObjectLabel(event: TimelineEventRecord): string | null {
  return interpretTaskTimelineEvent(event).objectAction.label;
}

function getRelatedTimeline(events: TimelineEventRecord[], decisionTitle: string): TimelineEventRecord[] {
  return events
    .filter((event) => {
      if (
        event.type === 'task.decision_approved' ||
        event.type === 'task.decision_deferred' ||
        event.type === 'task.decision_cancelled'
      ) {
        const payload = safeParsePayload(event.payload);
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
    })
    .slice(0, RELATED_TIMELINE_PREVIEW_COUNT);
}

type DecisionsPageProps = {
  decisions: DecisionRecord[];
  focusedDecisionId: string | null;
  tasks: TaskListItemRecord[];
  onOpenTask: (taskId: string, intent: RecommendedActionIntent) => void;
  onCreateDecision: (input: CreateDecisionInput) => Promise<void>;
  onDraftDecision: (taskId: string, note?: string | null) => Promise<DecisionDraftRecord>;
  onAct: (id: string, action: 'approve' | 'defer' | 'cancel') => Promise<void>;
  onDecisionFocusConsumed: () => void;
};

export function DecisionsPage({
  decisions,
  focusedDecisionId,
  tasks,
  onOpenTask,
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
    const objectAction = interpretTaskTimelineEvent(event).objectAction;

    if (objectAction.targetType === 'decision' && objectAction.targetId) {
      setSelectedDecisionId(objectAction.targetId);
    }
  }

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
                <p className="meta">这里负责确认这次拍板本身是否应该推进、延后或取消，不承载整条任务的全部上下文。</p>
              </div>
              <div className="task-card detail-card-group">
                <p className="eyebrow">Focus Moves</p>
                <strong>先处理这条拍板</strong>
                <p className="meta">只保留当前最值钱的局部动作；更完整的推进和上下文恢复仍然回到任务页处理。</p>
                <div className="chip-row">
                  <button
                    className="ghost-button"
                    onClick={() =>
                      onOpenTask(detail.taskId, {
                        type:
                          detail.status === 'deferred'
                            ? 'focus_waiting_follow_up'
                            : detail.status === 'cancelled'
                              ? 'focus_risk_review'
                              : 'focus_next_step',
                        focusArea: 'detail',
                        prefillNextStep:
                          detail.status === 'approved'
                            ? `已获批准，继续推进：${detail.title}`
                            : detail.status === 'deferred'
                              ? `跟进该决策是否可以恢复拍板：${detail.title}`
                              : `重新评估该决策并确定替代推进路径：${detail.title}`,
                      })
                    }
                    type="button"
                  >
                    回到任务推进
                  </button>
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
              </div>
              <div className="task-card detail-card-group detail-card-wide">
                <p className="eyebrow">Related Task Timeline</p>
                <strong>这条拍板如何改变了任务</strong>
                <p className="meta">这里只截取最能解释当前 decision 的最近任务变化，帮助你判断处理完后该如何回流到主任务。</p>
                <div className="timeline-list">
                  {getRelatedTimeline(relatedTaskDetail?.timeline ?? [], detail.title).length ? (
                    getRelatedTimeline(relatedTaskDetail?.timeline ?? [], detail.title).map((event) => (
                      <div className="timeline-item" key={event.id}>
                        <div className="task-row">
                          <strong>{event.type}</strong>
                          <span className="status">{event.createdAt}</span>
                        </div>
                        <p className="meta">{formatRelatedTimelineSummary(event)}</p>
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
