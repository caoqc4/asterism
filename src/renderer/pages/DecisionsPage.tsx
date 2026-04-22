import { useEffect, useState } from 'react';

import type { RecommendedActionIntent } from '@shared/types/brief';
import type { CreateDecisionInput, DecisionRecord } from '@shared/types/decision';
import type { TaskDetail, TaskRecord, TimelineEventRecord } from '@shared/types/task';

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

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '未填写';
  }

  return String(value);
}

function formatRelatedTimelineSummary(event: TimelineEventRecord): string {
  const payload = safeParsePayload(event.payload);

  switch (event.type) {
    case 'task.decision_approved':
      return `决策已批准：${formatValue(payload?.decisionTitle)}`;
    case 'task.decision_deferred':
      return `决策已延后：${formatValue(payload?.decisionTitle)}，等待：${formatValue(payload?.waitingReason)}`;
    case 'task.decision_cancelled':
      return `决策已取消：${formatValue(payload?.decisionTitle)}`;
    case 'task.waiting_changed':
      return `等待原因调整为“${formatValue(payload?.to)}”`;
    case 'task.risk_changed': {
      const to = (payload?.to as Record<string, unknown> | undefined) ?? {};
      return `风险更新为 ${formatValue(to.level)}（${formatValue(to.note)}）`;
    }
    case 'task.next_step_changed':
      return `下一步调整为“${formatValue(payload?.to)}”`;
    default:
      return event.type;
  }
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
  tasks: TaskRecord[];
  onOpenTask: (taskId: string, intent: RecommendedActionIntent) => void;
  onCreateDecision: (input: CreateDecisionInput) => Promise<void>;
  onAct: (id: string, action: 'approve' | 'defer' | 'cancel') => Promise<void>;
  onDecisionFocusConsumed: () => void;
};

export function DecisionsPage({
  decisions,
  focusedDecisionId,
  tasks,
  onOpenTask,
  onCreateDecision,
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
            <p className="meta">优先查看当前选中的 Decision，再决定批准、延后还是取消。</p>
          </div>

          {detail ? (
            <div className="timeline-list">
              <div className="timeline-item">
                <div className="task-row">
                  <strong>{detail.title}</strong>
                  <span className="status">{detail.status}</span>
                </div>
                <p className="meta">关联任务：{detail.taskId}</p>
                <p className="meta">更新时间：{detail.updatedAt}</p>
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
              <div className="timeline-item">
                <strong>Related Task Timeline</strong>
                <div className="timeline-list">
                  {getRelatedTimeline(relatedTaskDetail?.timeline ?? [], detail.title).length ? (
                    getRelatedTimeline(relatedTaskDetail?.timeline ?? [], detail.title).map((event) => (
                      <div className="timeline-item" key={event.id}>
                        <div className="task-row">
                          <strong>{event.type}</strong>
                          <span className="status">{event.createdAt}</span>
                        </div>
                        <p className="meta">{formatRelatedTimelineSummary(event)}</p>
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
