import { useState } from 'react';

import type { CreateDecisionInput, DecisionRecord } from '@shared/types/decision';
import type { TaskRecord } from '@shared/types/task';

type DecisionsPageProps = {
  decisions: DecisionRecord[];
  tasks: TaskRecord[];
  onCreateDecision: (input: CreateDecisionInput) => Promise<void>;
  onAct: (id: string, action: 'approve' | 'defer' | 'cancel') => Promise<void>;
};

export function DecisionsPage({
  decisions,
  tasks,
  onCreateDecision,
  onAct,
}: DecisionsPageProps) {
  const [form, setForm] = useState<CreateDecisionInput>({
    taskId: tasks[0]?.id ?? '',
    title: '',
  });

  return (
    <section className="page-grid">
      <article className="panel page-hero">
        <p className="eyebrow">Decisions</p>
        <h1>待拍板事项</h1>
        <p className="lede">先把正式的 Decision Request 立起来，后面再补 why now 和推荐选项。</p>
      </article>

      <article className="panel">
        <h2>创建决策请求</h2>
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
      </article>

      <article className="panel">
        <h2>决策队列</h2>
        <div className="task-list">
          {decisions.length === 0 ? (
            <p className="meta">还没有决策请求。</p>
          ) : (
            decisions.map((decision) => (
              <div className="task-card" key={decision.id}>
                <div className="task-row">
                  <strong>{decision.title}</strong>
                  <span className="status">{decision.status}</span>
                </div>
                <p className="meta">{decision.taskId}</p>
                <div className="chip-row">
                  <button
                    className="ghost-button"
                    onClick={() => void onAct(decision.id, 'approve')}
                    type="button"
                  >
                    批准
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void onAct(decision.id, 'defer')}
                    type="button"
                  >
                    延后
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => void onAct(decision.id, 'cancel')}
                    type="button"
                  >
                    取消
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </article>
    </section>
  );
}
