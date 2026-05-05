import { useState, useEffect } from 'react';
import type { TaskListItemRecord } from '@shared/types/task';
import {
  deleteWorkHabit,
  findWorkHabitConflict,
  loadWorkHabits,
  resolveWorkHabitConflict,
  updateWorkHabit,
  type WorkHabitRecord,
  type WorkHabitSource,
  type WorkHabitStatus,
} from '../lib/workHabits';

function deriveLane(t: TaskListItemRecord): string {
  if (t.riskLevel === 'high') return 'escalate';
  if (t.activeBlocker || t.state === 'waiting_external') return 'unblock';
  if (t.state === 'running') return 'continue';
  if (t.state === 'captured') return 'clarify';
  return 'steady';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function sourceLabel(source: WorkHabitSource): string {
  if (source === 'silent') return '静默积累';
  if (source === 'proposal') return '提议确认';
  if (source === 'sop') return 'SOP 提取';
  return '用户创建';
}

function statusLabel(status: WorkHabitStatus): string {
  if (status === 'confirmed') return '已确认';
  if (status === 'disabled') return '已停用';
  return '待确认';
}

export function ContextPage() {
  const [tasks, setTasks] = useState<TaskListItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [taskMemoryDraft, setTaskMemoryDraft] = useState({
    summary: '',
    nextStep: '',
    waitingReason: '',
  });
  const [habits, setHabits] = useState<WorkHabitRecord[]>([]);
  const [expandedHabit, setExpandedHabit] = useState<string | null>(null);
  const [editingHabit, setEditingHabit] = useState<string | null>(null);
  const [habitDraft, setHabitDraft] = useState('');

  useEffect(() => {
    setHabits(loadWorkHabits());
    if (!window.api) { setLoading(false); return; }
    window.api.listTasks()
      .then((all) => {
        const withContext = all.filter(
          (t) => t.state !== 'archived' && (t.summary || t.nextStep || t.activeBlocker || t.waitingReason)
        );
        setTasks(withContext.slice(0, 12));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function updateHabitStatus(id: string, status: WorkHabitStatus) {
    setHabits(updateWorkHabit(id, { status }));
  }

  function resolveHabitConflict(id: string, decision: 'accept_candidate' | 'keep_confirmed') {
    setHabits(resolveWorkHabitConflict(id, decision));
    setExpandedHabit((current) => current === id ? null : current);
  }

  function deleteHabit(id: string) {
    setHabits(deleteWorkHabit(id));
    setExpandedHabit((current) => current === id ? null : current);
  }

  function startEditingHabit(habit: WorkHabitRecord) {
    setEditingHabit(habit.id);
    setHabitDraft(habit.rule);
  }

  function saveHabitEdit(id: string) {
    const rule = habitDraft.trim();
    if (!rule) return;
    setHabits(updateWorkHabit(id, { rule }));
    setEditingHabit(null);
    setHabitDraft('');
  }

  function startEditingTaskMemory(task: TaskListItemRecord) {
    setEditingTask(task.id);
    setExpandedTask(task.id);
    setTaskMemoryDraft({
      summary: task.summary ?? '',
      nextStep: task.nextStep ?? '',
      waitingReason: task.waitingReason ?? '',
    });
  }

  async function saveTaskMemory(taskId: string) {
    if (!window.api) return;
    const patch = {
      id: taskId,
      summary: taskMemoryDraft.summary.trim() || null,
      nextStep: taskMemoryDraft.nextStep.trim() || null,
      waitingReason: taskMemoryDraft.waitingReason.trim() || null,
    };
    const updated = await window.api.updateTask(patch);
    setTasks((current) => current.map((task) => task.id === taskId ? {
      ...task,
      summary: updated.summary,
      nextStep: updated.nextStep,
      waitingReason: updated.waitingReason,
      updatedAt: updated.updatedAt,
    } : task));
    setEditingTask(null);
  }

  async function clearTaskMemory(taskId: string) {
    if (!window.api) return;
    const updated = await window.api.updateTask({
      id: taskId,
      summary: null,
      nextStep: null,
      waitingReason: null,
    });
    setTasks((current) => current.map((task) => task.id === taskId ? {
      ...task,
      summary: updated.summary,
      nextStep: updated.nextStep,
      waitingReason: updated.waitingReason,
      updatedAt: updated.updatedAt,
    } : task));
    setEditingTask(null);
  }

  return (
    <div className="context-page">
      <div className="context-page-head">
        <h2 className="context-page-title">Context</h2>
        <p className="context-page-subtitle">AI 的记忆层 — 任务信息与工作习惯在会话间持续保留</p>
      </div>

      {/* Task memory */}
      <section className="ctx-section">
        <div className="ctx-section-header">
          <div>
            <div className="ctx-section-title">任务上下文记忆</div>
            <div className="ctx-section-desc">AI 对活跃任务掌握的关键信息，跨会话持续保留</div>
          </div>
        </div>

        <div className="ctx-list">
          {loading && (
            <div className="ctx-empty muted">加载中…</div>
          )}
          {!loading && tasks.length === 0 && (
            <div className="ctx-empty">暂无带有上下文的活跃任务。在 Tasks 创建任务并补充说明后，AI 将自动建立记忆。</div>
          )}
          {tasks.map((task) => {
            const lane = deriveLane(task);
            const isExpanded = expandedTask === task.id;
            const isEditing = editingTask === task.id;
            const items: string[] = [];
            if (task.summary) items.push(task.summary);
            if (task.nextStep) items.push(`下一步：${task.nextStep}`);
            if (task.waitingReason) items.push(`等待中：${task.waitingReason}`);
            if (task.activeBlocker) items.push(`阻塞：${task.activeBlocker.title}`);

            return (
              <div key={task.id} className="ctx-memory-row">
                <div
                  className="ctx-memory-head"
                  onClick={() => setExpandedTask((prev) => (prev === task.id ? null : task.id))}
                >
                  <span className={`tag lane-${lane}`} style={{ fontSize: 10 }}>{lane}</span>
                  <span className="ctx-memory-title">{task.title}</span>
                  <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>
                    {formatDate(task.updatedAt)}
                  </span>
                  <span className="ctx-chevron">{isExpanded ? '▴' : '▾'}</span>
                </div>
                {isExpanded && (
                  <div className="ctx-memory-body">
                    {isEditing ? (
                      <div className="ctx-memory-editor">
                        <label className="ctx-memory-edit-row">
                          <span>摘要</span>
                          <textarea
                            className="settings-input ctx-memory-textarea"
                            rows={3}
                            value={taskMemoryDraft.summary}
                            onChange={(e) => setTaskMemoryDraft((draft) => ({ ...draft, summary: e.target.value }))}
                          />
                        </label>
                        <label className="ctx-memory-edit-row">
                          <span>下一步</span>
                          <input
                            className="settings-input"
                            value={taskMemoryDraft.nextStep}
                            onChange={(e) => setTaskMemoryDraft((draft) => ({ ...draft, nextStep: e.target.value }))}
                          />
                        </label>
                        <label className="ctx-memory-edit-row">
                          <span>等待原因</span>
                          <input
                            className="settings-input"
                            value={taskMemoryDraft.waitingReason}
                            onChange={(e) => setTaskMemoryDraft((draft) => ({ ...draft, waitingReason: e.target.value }))}
                          />
                        </label>
                      </div>
                    ) : items.length > 0 ? (
                      items.map((item, i) => (
                        <div key={i} className="ctx-memory-item">
                          <span className="ctx-memory-bullet">·</span>
                          <span>{item}</span>
                        </div>
                      ))
                    ) : (
                      <div className="ctx-memory-item muted">暂无详细上下文。</div>
                    )}
                    <div className="ctx-memory-actions">
                      {isEditing ? (
                        <>
                          <button className="btn sm primary" onClick={() => void saveTaskMemory(task.id)}>保存</button>
                          <button className="btn sm ghost" onClick={() => setEditingTask(null)}>取消</button>
                        </>
                      ) : (
                        <>
                          <button className="btn sm ghost" onClick={() => startEditingTaskMemory(task)}>编辑</button>
                          <button className="btn sm ghost" onClick={() => void clearTaskMemory(task.id)} style={{ color: 'var(--accent)' }}>清除</button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Work habits */}
      <section className="ctx-section">
        <div className="ctx-section-header">
          <div>
            <div className="ctx-section-title">工作习惯记录</div>
            <div className="ctx-section-desc">AI 从你的工作模式中观察到的规律 — 可确认或纠正</div>
          </div>
        </div>

        <div className="ctx-list">
          {habits.map((h) => {
            const isExpanded = expandedHabit === h.id;
            const isEditing = editingHabit === h.id;
            const conflict = findWorkHabitConflict(h, habits);
            return (
              <div key={h.id} className={`ctx-habit-row${h.status === 'pending' ? ' unconfirmed' : ''}${conflict ? ' conflict' : ''}`}>
                <div
                  className="ctx-habit-main"
                  onClick={() => setExpandedHabit((current) => current === h.id ? null : h.id)}
                >
                  {isEditing ? (
                    <input
                      className="settings-input"
                      value={habitDraft}
                      autoFocus
                      onChange={(e) => setHabitDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveHabitEdit(h.id);
                        if (e.key === 'Escape') setEditingHabit(null);
                      }}
                    />
                  ) : (
                    <div className="ctx-habit-obs">{h.rule}</div>
                  )}
                  <div className="ctx-habit-examples muted">{h.examples}</div>
                  {conflict && (
                    <div className="ctx-habit-conflict">
                      与已确认规则冲突：{conflict.confirmed.rule}
                    </div>
                  )}
                  <div className="ctx-habit-meta">
                    <span className="habit-chip">{sourceLabel(h.source)}</span>
                    <span className="habit-chip">{h.scopeLabel}</span>
                    <span className={`habit-chip status-${h.status}`}>{statusLabel(h.status)}</span>
                    <span className="muted">应用 {h.applicationCount} 次</span>
                    <span className="muted">{formatDate(h.lastAppliedAt ?? h.createdAt)}</span>
                  </div>
                  {isExpanded && (
                    <div className="ctx-habit-detail">
                      <div>创建：{new Date(h.createdAt).toLocaleString('zh')}</div>
                      <div>最近应用：{h.lastAppliedAt ? new Date(h.lastAppliedAt).toLocaleString('zh') : '尚未应用'}</div>
                    </div>
                  )}
                </div>
                <div className="ctx-habit-verdict">
                  {h.status === 'confirmed' && <span className="habit-badge confirmed">已确认</span>}
                  {h.status === 'disabled' && <span className="habit-badge rejected">已停用</span>}
                  {h.status === 'pending' && (
                    <div className="habit-actions">
                      {conflict ? (
                        <>
                          <button className="btn sm primary" onClick={() => resolveHabitConflict(h.id, 'accept_candidate')}>采用新规则</button>
                          <button className="btn sm ghost" onClick={() => resolveHabitConflict(h.id, 'keep_confirmed')}>保留旧规则</button>
                        </>
                      ) : (
                        <>
                          <button className="btn sm primary" onClick={() => updateHabitStatus(h.id, 'confirmed')}>确认</button>
                          <button className="btn sm ghost" onClick={() => updateHabitStatus(h.id, 'disabled')}>不准确</button>
                        </>
                      )}
                    </div>
                  )}
                  {h.status !== 'pending' && (
                    <button className="btn sm ghost" onClick={() => updateHabitStatus(h.id, h.status === 'disabled' ? 'confirmed' : 'disabled')}>
                      {h.status === 'disabled' ? '启用' : '停用'}
                    </button>
                  )}
                </div>
                {isEditing ? (
                  <button className="btn sm ghost" onClick={() => saveHabitEdit(h.id)}>保存</button>
                ) : (
                  <button className="btn sm ghost" onClick={() => startEditingHabit(h)}>编辑</button>
                )}
                <button className="ctx-habit-del icon-btn" onClick={() => deleteHabit(h.id)} title="删除">
                  <IconTrash />
                </button>
              </div>
            );
          })}
          {habits.length === 0 && (
            <div className="ctx-empty">AI 还没有观察到明显的工作习惯规律。</div>
          )}
        </div>
      </section>
    </div>
  );
}

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,4 12,4" />
      <path d="M5 4V2.5h4V4" />
      <rect x="3" y="4" width="8" height="8" rx="1.5" />
    </svg>
  );
}
