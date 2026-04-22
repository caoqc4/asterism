import { useEffect, useState } from 'react';

import type {
  CreateTaskInput,
  TaskDetail,
  TaskRiskLevel,
  TaskRecord,
  TaskState,
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

type TasksPageProps = {
  tasks: TaskRecord[];
  onRefresh: () => Promise<void>;
  onCreateTask: (input: CreateTaskInput) => Promise<void>;
  onUpdateTask: (input: UpdateTaskInput) => Promise<TaskRecord>;
  onTransitionTask: (taskId: string, nextState: TaskState) => Promise<TaskRecord>;
};

export function TasksPage({
  tasks,
  onRefresh,
  onCreateTask,
  onUpdateTask,
  onTransitionTask,
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

  useEffect(() => {
    if (!selectedTaskId && tasks[0]) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [selectedTaskId, tasks]);

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

    await onTransitionTask(detail.id, nextState);
    await onRefresh();
    const nextDetail = await window.api.getTaskDetail(detail.id);
    setDetail(nextDetail);
  }

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
                className={`task-card task-card-button ${
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
            <form className="stack" onSubmit={handleSaveDetail}>
              <label>
                标题
                <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
              </label>
              <label>
                Summary
                <textarea
                  rows={4}
                  value={draftSummary}
                  onChange={(event) => setDraftSummary(event.target.value)}
                />
              </label>
              <label>
                Next Step
                <input
                  value={draftNextStep}
                  onChange={(event) => setDraftNextStep(event.target.value)}
                />
              </label>
              <label>
                Waiting Reason
                <input
                  value={draftWaitingReason}
                  onChange={(event) => setDraftWaitingReason(event.target.value)}
                />
              </label>
              <label>
                Risk Level
                <select
                  value={draftRiskLevel}
                  onChange={(event) => setDraftRiskLevel(event.target.value as TaskRiskLevel)}
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
                  onChange={(event) => setDraftRiskNote(event.target.value)}
                />
              </label>
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
                  <p className="meta">{detail.waitingReason ?? '未填写'}</p>
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
              <h3>状态流转</h3>
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
              <h3>Timeline</h3>
              <div className="timeline-list">
                {detail.timeline.map((event) => (
                  <div className="timeline-item" key={event.id}>
                    <strong>{event.type}</strong>
                    <p className="meta">{event.createdAt}</p>
                    <p className="meta">{event.payload ?? '无 payload'}</p>
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
