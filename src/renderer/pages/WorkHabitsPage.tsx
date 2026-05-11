import { useEffect, useState } from 'react';
import {
  createManualWorkHabit,
  deleteWorkHabit,
  findWorkHabitConflict,
  getPersistedWorkHabitStorageSnapshot,
  loadWorkHabits,
  resolveWorkHabitConflict,
  updateWorkHabit,
  type WorkHabitRecord,
} from '../lib/workHabits';
import type { WorkHabitScope, WorkHabitStatus } from '@shared/types/work-habit';

function statusPriority(status: WorkHabitStatus): number {
  if (status === 'pending') return 0;
  if (status === 'confirmed') return 1;
  return 2;
}

function statusLabel(status: WorkHabitStatus): string {
  if (status === 'pending') return '待你确认';
  if (status === 'confirmed') return '已确认';
  return '已停用';
}

function sourceLabel(source: WorkHabitRecord['source']): string {
  if (source === 'manual') return '用户创建';
  if (source === 'proposal') return '提议确认';
  if (source === 'sop') return 'SOP 提取';
  return '静默观察';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh');
}

export function WorkHabitsPage() {
  const [habits, setHabits] = useState<WorkHabitRecord[]>([]);
  const [expandedHabit, setExpandedHabit] = useState<string | null>(null);
  const [editingHabit, setEditingHabit] = useState<string | null>(null);
  const [habitDraft, setHabitDraft] = useState('');
  const [showNewHabit, setShowNewHabit] = useState(false);
  const [newHabitDraft, setNewHabitDraft] = useState({
    rule: '',
    scope: 'global' as WorkHabitScope,
    scopeLabel: '全局',
    examples: '',
  });

  useEffect(() => {
    void refreshHabits();
  }, []);

  async function refreshHabits() {
    const snapshot = await getPersistedWorkHabitStorageSnapshot().catch(() => null);
    setHabits(snapshot ? snapshot.habits : loadWorkHabits());
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

  async function removeHabit(id: string) {
    if (window.api?.deleteWorkHabit) {
      setHabits(await window.api.deleteWorkHabit(id));
    } else {
      setHabits(deleteWorkHabit(id));
    }
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
    if (!newHabitDraft.rule.trim()) return;
    if (window.api?.createManualWorkHabit) {
      setHabits(await window.api.createManualWorkHabit(newHabitDraft));
    } else {
      setHabits(createManualWorkHabit(newHabitDraft));
    }
    setNewHabitDraft({ rule: '', scope: 'global', scopeLabel: '全局', examples: '' });
    setShowNewHabit(false);
  }

  const habitRows = habits
    .map((habit) => ({ habit, conflict: findWorkHabitConflict(habit, habits) }))
    .sort((a, b) => {
      if (Boolean(a.conflict) !== Boolean(b.conflict)) return a.conflict ? -1 : 1;
      const statusDelta = statusPriority(a.habit.status) - statusPriority(b.habit.status);
      if (statusDelta !== 0) return statusDelta;
      return (b.habit.lastAppliedAt ?? b.habit.createdAt).localeCompare(a.habit.lastAppliedAt ?? a.habit.createdAt);
    });

  return (
    <div className="context-page">
      <div className="context-page-head">
        <h2 className="context-page-title">Work Habits</h2>
        <p className="context-page-subtitle">跨任务工作习惯与 AI 行为偏好 — 确认后才会影响后续执行</p>
        <p className="context-page-boundary">任务文件和产物在 Tasks 中管理；这里仅沉淀跨任务规则、偏好和 SOP 习惯。</p>
      </div>

      <section className="ctx-section">
        <div className="ctx-section-header">
          <div>
            <div className="ctx-section-title">工作习惯记录</div>
            <div className="ctx-section-desc">AI 从你的工作模式中观察到的规律，可确认、停用或纠正</div>
          </div>
          <button className="btn sm ghost" onClick={() => setShowNewHabit((value) => !value)}>
            {showNewHabit ? '收起' : '新增规则'}
          </button>
        </div>

        <div className="ctx-list">
          <div className="ctx-learning-output-note">
            待确认规则只作为提议展示，不会自动改变后续执行流程。显著流程、步骤顺序和工具选择必须提议确认；SOP 模板只由你主动保存。停用、删除和覆盖已有规则都由你主动操作。只在 Step/Run/Task 完成、你编辑 AI 产物、或会话压缩前提取学习信号，不做持续行为监控。
          </div>
          <div className="ctx-learning-output-note">待确认规则只作为提议展示，不会自动改变后续执行流程。</div>
          <div className="ctx-habit-stats">
            <span>来源分布</span>
            <span>提议确认 {habits.filter((habit) => habit.source === 'proposal').length}</span>
            <span>用户创建 {habits.filter((habit) => habit.source === 'manual').length}</span>
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

          {habitRows.map(({ habit, conflict }) => {
            const isExpanded = expandedHabit === habit.id;
            const isEditing = editingHabit === habit.id;
            return (
              <div key={habit.id} className={`ctx-habit-row${habit.status === 'pending' ? ' unconfirmed' : ''}${conflict ? ' conflict' : ''}`}>
                <div className="ctx-habit-main" onClick={() => setExpandedHabit((current) => current === habit.id ? null : habit.id)}>
                  {isEditing ? (
                    <input
                      className="settings-input"
                      value={habitDraft}
                      autoFocus
                      onChange={(e) => setHabitDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveHabitEdit(habit.id);
                        if (e.key === 'Escape') setEditingHabit(null);
                      }}
                    />
                  ) : (
                    <div className="ctx-habit-obs">{habit.rule}</div>
                  )}
                  <div className="ctx-habit-examples muted">{habit.examples}</div>
                  {habit.id === 'habit_pattern_completion_override' && (
                    <div className="ctx-habit-examples muted">
                      跨任务观察窗口 · 累计 {habit.applicationCount} 次 · 达到 3 次才作为待确认提议，确认前不应用
                    </div>
                  )}
                  {conflict && <div className="ctx-habit-conflict">与已确认规则冲突：{conflict.confirmed.rule}</div>}
                  <div className="ctx-habit-meta">
                    <span className="habit-chip">{sourceLabel(habit.source)}</span>
                    <span className="habit-chip">{habit.scopeLabel}</span>
                    <span className={`habit-chip status-${habit.status}`}>{statusLabel(habit.status)}</span>
                    <span className="muted">应用 {habit.applicationCount} 次</span>
                    <span className="muted">{formatDate(habit.lastAppliedAt ?? habit.createdAt)}</span>
                  </div>
                  {isExpanded && (
                    <div className="ctx-habit-detail">
                      <div>优先级：中 · {habit.scope === 'task_type' ? '任务类型规则' : habit.scope === 'project' ? '项目规则' : '全局规则'}</div>
                      <div>创建：{new Date(habit.createdAt).toLocaleString('zh')}</div>
                      <div>最近应用：{habit.lastAppliedAt ? new Date(habit.lastAppliedAt).toLocaleString('zh') : '尚未应用'}</div>
                      {habit.examples && <div>{habit.examples}</div>}
                      {habit.status === 'pending' && <div>显著流程、步骤顺序或工具选择必须由你确认后才应用；待确认提议不会进入后续 AI 提示词。</div>}
                      {habit.status === 'disabled' && <div>已停用规则不会进入后续 AI 提示词。</div>}
                    </div>
                  )}
                </div>
                <div className="ctx-habit-verdict">
                  {habit.status === 'pending' && (
                    <div className="habit-actions">
                      {conflict ? (
                        <>
                          <button className="btn sm primary" onClick={() => void resolveHabitConflict(habit.id, 'accept_candidate')}>采用新规则</button>
                          <button className="btn sm ghost" onClick={() => void resolveHabitConflict(habit.id, 'keep_confirmed')}>保留旧规则</button>
                        </>
                      ) : (
                        <>
                          <button className="btn sm primary" onClick={() => void updateHabitStatus(habit.id, 'confirmed')}>确认</button>
                          <button className="btn sm ghost" onClick={() => void updateHabitStatus(habit.id, 'disabled')}>以后不再提示</button>
                        </>
                      )}
                    </div>
                  )}
                  {habit.status !== 'pending' && (
                    <button className="btn sm ghost" onClick={() => void updateHabitStatus(habit.id, habit.status === 'disabled' ? 'confirmed' : 'disabled')}>
                      {habit.status === 'disabled' ? '启用' : '停用'}
                    </button>
                  )}
                </div>
                {isEditing ? (
                  <button className="btn sm ghost" onClick={() => void saveHabitEdit(habit.id)}>保存</button>
                ) : (
                  <button className="btn sm ghost" onClick={() => { setEditingHabit(habit.id); setHabitDraft(habit.rule); }}>编辑</button>
                )}
                <button className="ctx-habit-del icon-btn" onClick={() => void removeHabit(habit.id)} title="删除">
                  <IconTrash />
                </button>
              </div>
            );
          })}

          {habitRows.length === 0 && (
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
