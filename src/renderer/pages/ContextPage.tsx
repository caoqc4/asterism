import { useState, useEffect } from 'react';
import type { TaskListItemRecord } from '@shared/types/task';
import {
  createManualWorkHabit,
  deleteWorkHabit,
  describeWorkHabitStorageBoundary,
  findWorkHabitConflict,
  getPersistedWorkHabitStorageSnapshot,
  loadWorkHabits,
  resolveWorkHabitConflict,
  updateWorkHabit,
  type WorkHabitRecord,
  type WorkHabitScope,
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

function priorityLabel(scope: WorkHabitScope): string {
  if (scope === 'project') return '最高 · 项目规则优先';
  if (scope === 'task_type') return '中 · 任务类型规则';
  return '基础 · 全局规则';
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
  const [showNewHabit, setShowNewHabit] = useState(false);
  const storageBoundary = describeWorkHabitStorageBoundary();
  const [newHabitDraft, setNewHabitDraft] = useState({
    rule: '',
    scope: 'global' as WorkHabitScope,
    scopeLabel: '全局',
    examples: '',
  });

  useEffect(() => {
    void refreshHabits();
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

  async function refreshHabits() {
    const snapshot = await getPersistedWorkHabitStorageSnapshot().catch(() => null);
    if (snapshot) {
      setHabits(snapshot.habits);
      return;
    }
    setHabits(loadWorkHabits());
  }

  async function updateHabitStatus(id: string, status: WorkHabitStatus) {
    if (window.api?.updateWorkHabit) {
      setHabits(await window.api.updateWorkHabit({ id, status }));
      return;
    }
    setHabits(updateWorkHabit(id, { status }));
  }

  async function resolveHabitConflict(id: string, decision: 'accept_candidate' | 'keep_confirmed') {
    if (window.api?.resolveWorkHabitConflict) {
      setHabits(await window.api.resolveWorkHabitConflict({ candidateId: id, decision }));
    } else {
      setHabits(resolveWorkHabitConflict(id, decision));
    }
    setExpandedHabit((current) => current === id ? null : current);
  }

  async function deleteHabit(id: string) {
    if (window.api?.deleteWorkHabit) {
      setHabits(await window.api.deleteWorkHabit(id));
    } else {
      setHabits(deleteWorkHabit(id));
    }
    setExpandedHabit((current) => current === id ? null : current);
  }

  function startEditingHabit(habit: WorkHabitRecord) {
    setEditingHabit(habit.id);
    setHabitDraft(habit.rule);
  }

  async function saveHabitEdit(id: string) {
    const rule = habitDraft.trim();
    if (!rule) return;
    if (window.api?.updateWorkHabit) {
      setHabits(await window.api.updateWorkHabit({ id, rule }));
    } else {
      setHabits(updateWorkHabit(id, { rule }));
    }
    setEditingHabit(null);
    setHabitDraft('');
  }

  function updateNewHabitScope(scope: WorkHabitScope) {
    const label = scope === 'global' ? '全局' : scope === 'project' ? '项目' : '任务类型';
    setNewHabitDraft((draft) => ({ ...draft, scope, scopeLabel: label }));
  }

  async function createHabit() {
    const rule = newHabitDraft.rule.trim();
    if (!rule) return;
    if (window.api?.createManualWorkHabit) {
      setHabits(await window.api.createManualWorkHabit(newHabitDraft));
    } else {
      setHabits(createManualWorkHabit(newHabitDraft));
    }
    setNewHabitDraft({
      rule: '',
      scope: 'global',
      scopeLabel: '全局',
      examples: '',
    });
    setShowNewHabit(false);
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
          <button className="btn sm ghost" onClick={() => setShowNewHabit((value) => !value)}>
            {showNewHabit ? '收起' : '新增规则'}
          </button>
        </div>

        <div className="ctx-list">
          <div className="ctx-storage-boundary">
            {storageBoundary.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
          {showNewHabit && (
            <div className="ctx-habit-new">
              <input
                className="settings-input"
                value={newHabitDraft.rule}
                onChange={(e) => setNewHabitDraft((draft) => ({ ...draft, rule: e.target.value }))}
                placeholder="例如：代码合入前先跑完整测试"
              />
              <div className="ctx-habit-new-row">
                <select
                  className="settings-input ctx-habit-scope"
                  value={newHabitDraft.scope}
                  onChange={(e) => updateNewHabitScope(e.target.value as WorkHabitScope)}
                >
                  <option value="global">全局</option>
                  <option value="task_type">任务类型</option>
                  <option value="project">项目</option>
                </select>
                <input
                  className="settings-input"
                  value={newHabitDraft.scopeLabel}
                  onChange={(e) => setNewHabitDraft((draft) => ({ ...draft, scopeLabel: e.target.value }))}
                  placeholder="适用范围"
                />
              </div>
              <input
                className="settings-input"
                value={newHabitDraft.examples}
                onChange={(e) => setNewHabitDraft((draft) => ({ ...draft, examples: e.target.value }))}
                placeholder="例子或触发场景"
              />
              <div className="ctx-habit-new-actions">
                <button className="btn sm primary" onClick={() => void createHabit()}>保存规则</button>
                <button className="btn sm ghost" onClick={() => setShowNewHabit(false)}>取消</button>
              </div>
            </div>
          )}
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
                        if (e.key === 'Enter') void saveHabitEdit(h.id);
                        if (e.key === 'Escape') setEditingHabit(null);
                      }}
                    />
                  ) : (
                    <div className="ctx-habit-obs">{h.rule}</div>
                  )}
                  {h.examples.includes('观察窗口') && (
                    <div className="ctx-habit-observation">跨任务观察窗口 · 累计 {h.applicationCount} 次</div>
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
                      <div>优先级：{priorityLabel(h.scope)}</div>
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
                          <button className="btn sm primary" onClick={() => void resolveHabitConflict(h.id, 'accept_candidate')}>采用新规则</button>
                          <button className="btn sm ghost" onClick={() => void resolveHabitConflict(h.id, 'keep_confirmed')}>保留旧规则</button>
                        </>
                      ) : (
                        <>
                          <button className="btn sm primary" onClick={() => void updateHabitStatus(h.id, 'confirmed')}>确认</button>
                          <button className="btn sm ghost" onClick={() => void updateHabitStatus(h.id, 'disabled')}>不准确</button>
                        </>
                      )}
                    </div>
                  )}
                  {h.status !== 'pending' && (
                    <button className="btn sm ghost" onClick={() => void updateHabitStatus(h.id, h.status === 'disabled' ? 'confirmed' : 'disabled')}>
                      {h.status === 'disabled' ? '启用' : '停用'}
                    </button>
                  )}
                </div>
                {isEditing ? (
                  <button className="btn sm ghost" onClick={() => void saveHabitEdit(h.id)}>保存</button>
                ) : (
                  <button className="btn sm ghost" onClick={() => startEditingHabit(h)}>编辑</button>
                )}
                <button className="ctx-habit-del icon-btn" onClick={() => void deleteHabit(h.id)} title="删除">
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
