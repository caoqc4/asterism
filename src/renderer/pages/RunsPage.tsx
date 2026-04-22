import { useEffect, useState } from 'react';

import type { RecommendedActionIntent } from '@shared/types/brief';
import type { CreateRunInput, RunRecord } from '@shared/types/run';
import type { TaskRecord } from '@shared/types/task';

type RunsPageProps = {
  focusedRunId: string | null;
  runs: RunRecord[];
  tasks: TaskRecord[];
  onOpenTask: (taskId: string, intent: RecommendedActionIntent) => void;
  onRefresh: () => Promise<void>;
  onRunFocusConsumed: () => void;
  onTriggerRun: (input: CreateRunInput) => Promise<void>;
};

export function RunsPage({
  focusedRunId,
  runs,
  tasks,
  onOpenTask,
  onRefresh,
  onRunFocusConsumed,
  onTriggerRun,
}: RunsPageProps) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(runs[0]?.id ?? null);
  const [detail, setDetail] = useState<RunRecord | null>(null);
  const [form, setForm] = useState<CreateRunInput>({
    taskId: tasks[0]?.id ?? '',
    type: 'draft',
    instructions: '',
  });

  useEffect(() => {
    if (!selectedRunId && runs[0]) {
      setSelectedRunId(runs[0].id);
    }
  }, [runs, selectedRunId]);

  useEffect(() => {
    if (!focusedRunId) {
      return;
    }

    if (runs.some((run) => run.id === focusedRunId)) {
      setSelectedRunId(focusedRunId);
      onRunFocusConsumed();
    }
  }, [focusedRunId, onRunFocusConsumed, runs]);

  useEffect(() => {
    let mounted = true;

    async function loadDetail() {
      if (!selectedRunId) {
        setDetail(null);
        return;
      }

      const nextDetail = await window.api.getRunDetail(selectedRunId);

      if (mounted) {
        setDetail(nextDetail);
      }
    }

    void loadDetail();

    return () => {
      mounted = false;
    };
  }, [selectedRunId, runs]);

  return (
    <section className="tasks-layout">
      <article className="panel">
        <article className="hero page-hero">
          <p className="eyebrow">Runs</p>
          <h1>执行记录</h1>
          <p className="lede">这里承接 Run 的对象视角：先看当前执行焦点，再决定是否发起新的 run 或切换到队列中的其他记录。</p>
        </article>

        <div className="transition-group detail-stage">
          <div className="detail-stage-head">
            <div>
              <p className="eyebrow">Current Focus</p>
              <h3>{detail ? `${detail.type} / ${detail.status}` : '选择一个 run'}</h3>
            </div>
            <p className="meta">优先查看当前 run 的输入、输出、失败原因和来源。</p>
          </div>
          {detail ? (
            <div className="chip-row">
              <button
                className="ghost-button"
                onClick={() =>
                  onOpenTask(detail.taskId, {
                    type: 'focus_next_step',
                    focusArea: 'detail',
                    prefillNextStep:
                      detail.status === 'failed'
                        ? `检查最近一次 ${detail.type} run 的失败原因，并决定是否重试。`
                        : `审阅最近一次 ${detail.type} run 的结果，并决定是否继续推进。`,
                  })
                }
                type="button"
              >
                回到任务推进
              </button>
            </div>
          ) : null}
        </div>
        {detail ? (
          <div className="stack">
            <div className="task-card">
              <strong>关联任务</strong>
              <p className="meta">{detail.taskId}</p>
            </div>
            <div className="task-card">
              <strong>附加要求</strong>
              <p className="meta">{detail.instructions || '无'}</p>
            </div>
            <div className="task-card">
              <strong>输出结果</strong>
              <p>{detail.output || '尚无输出'}</p>
            </div>
            <div className="task-card">
              <strong>结果来源</strong>
              <p className="meta">{detail.outputSource || '尚未产生'}</p>
            </div>
            <div className="task-card">
              <strong>失败原因</strong>
              <p className="meta">{detail.failureReason || '无'}</p>
            </div>
            <div className="task-card">
              <strong>时间</strong>
              <p className="meta">{detail.createdAt}</p>
            </div>
          </div>
        ) : (
          <p className="meta">先创建或选择一个 run。</p>
        )}

        <div className="transition-group detail-stage">
          <div className="detail-stage-head">
            <div>
              <p className="eyebrow">Action Desk</p>
              <h3>触发新的 Run</h3>
            </div>
            <p className="meta">这里保留最小的执行入口，方便基于当前任务重新发起 draft 或 summarize。</p>
          </div>
          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!form.taskId) {
                return;
              }
              await onTriggerRun(form);
              await onRefresh();
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
              Run 类型
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value as CreateRunInput['type'],
                  }))
                }
              >
                <option value="draft">draft</option>
                <option value="summarize">summarize</option>
              </select>
            </label>
            <label>
              附加要求
              <textarea
                rows={4}
                value={form.instructions}
                onChange={(event) =>
                  setForm((current) => ({ ...current, instructions: event.target.value }))
                }
              />
            </label>
            <button type="submit">触发 Run</button>
          </form>
        </div>
      </article>

      <article className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Runs</p>
            <h2>Run Queue</h2>
          </div>
        </div>
        <div className="task-list">
          {runs.length === 0 ? (
            <p className="meta">还没有执行记录。</p>
          ) : (
            runs.map((run) => (
              <button
                className={`task-card task-card-button ${
                  run.id === selectedRunId ? 'task-card-active' : ''
                }`}
                key={run.id}
                onClick={() => setSelectedRunId(run.id)}
                type="button"
              >
                <div className="task-row">
                  <strong>{run.type}</strong>
                  <span className="status">{run.status}</span>
                </div>
                <p className="meta">{run.taskId}</p>
                <p className="meta">
                  {run.outputSource ? `来源：${run.outputSource}` : '来源：尚未产生'}
                </p>
              </button>
            ))
          )}
        </div>
      </article>
    </section>
  );
}
