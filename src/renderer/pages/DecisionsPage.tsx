import { useEffect, useState } from 'react';

import type { CreateDecisionInput, DecisionRecord } from '@shared/types/decision';
import type { TaskRecord } from '@shared/types/task';

type DecisionsPageProps = {
  decisions: DecisionRecord[];
  focusedDecisionId: string | null;
  tasks: TaskRecord[];
  onCreateDecision: (input: CreateDecisionInput) => Promise<void>;
  onAct: (id: string, action: 'approve' | 'defer' | 'cancel') => Promise<void>;
  onDecisionFocusConsumed: () => void;
};

export function DecisionsPage({
  decisions,
  focusedDecisionId,
  tasks,
  onCreateDecision,
  onAct,
  onDecisionFocusConsumed,
}: DecisionsPageProps) {
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(
    focusedDecisionId ?? decisions[0]?.id ?? null,
  );
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
