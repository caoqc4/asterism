export type WorkHabitSource = 'silent' | 'proposal' | 'sop' | 'manual';
export type WorkHabitScope = 'global' | 'task_type' | 'project';
export type WorkHabitStatus = 'pending' | 'confirmed' | 'disabled';

export type WorkHabitRecord = {
  id: string;
  rule: string;
  source: WorkHabitSource;
  scope: WorkHabitScope;
  scopeLabel: string;
  status: WorkHabitStatus;
  examples: string;
  createdAt: string;
  lastAppliedAt: string | null;
  applicationCount: number;
};

const STORAGE_KEY = 'taskplane.workHabits.v1';

const SEED_HABITS: WorkHabitRecord[] = [
  {
    id: 'habit_seed_review_before_send',
    rule: '数据报告初稿完成后先内部评审再对外发送',
    source: 'silent',
    scope: 'global',
    scopeLabel: '全局',
    status: 'confirmed',
    examples: 'Q1 财报、用户调研报告',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastAppliedAt: '2026-04-28T00:00:00.000Z',
    applicationCount: 2,
  },
  {
    id: 'habit_seed_sync_before_reply',
    rule: '回复合作邮件前先确认外部沟通渠道是否已有同步',
    source: 'proposal',
    scope: 'task_type',
    scopeLabel: '外部合作',
    status: 'pending',
    examples: '品牌合作来信、投资人跟进',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastAppliedAt: null,
    applicationCount: 0,
  },
];

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeParse(value: string | null): WorkHabitRecord[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as WorkHabitRecord[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadWorkHabits(): WorkHabitRecord[] {
  if (!canUseLocalStorage()) return SEED_HABITS;
  const stored = safeParse(window.localStorage.getItem(STORAGE_KEY));
  if (stored) return stored;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_HABITS));
  return SEED_HABITS;
}

export function saveWorkHabits(habits: WorkHabitRecord[]): void {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
}

export function updateWorkHabit(
  id: string,
  patch: Partial<Pick<WorkHabitRecord, 'rule' | 'scopeLabel' | 'status'>>,
): WorkHabitRecord[] {
  const next = loadWorkHabits().map((habit) => habit.id === id ? { ...habit, ...patch } : habit);
  saveWorkHabits(next);
  return next;
}

export function deleteWorkHabit(id: string): WorkHabitRecord[] {
  const next = loadWorkHabits().filter((habit) => habit.id !== id);
  saveWorkHabits(next);
  return next;
}

export function recordCompletionOverrideLearningSignal(params: {
  taskId: string;
  taskTitle: string;
  reason: string;
}): void {
  if (!canUseLocalStorage()) return;

  const now = new Date().toISOString();
  const id = `habit_completion_override_${params.taskId}`;
  const existing = loadWorkHabits();
  const nextHabit: WorkHabitRecord = {
    id,
    rule: `完成「${params.taskTitle}」时允许覆盖未满足的完成检查`,
    source: 'proposal',
    scope: 'task_type',
    scopeLabel: '任务完成',
    status: 'pending',
    examples: params.reason,
    createdAt: now,
    lastAppliedAt: now,
    applicationCount: 1,
  };

  const next: WorkHabitRecord[] = existing.some((habit) => habit.id === id)
    ? existing.map((habit) => habit.id === id
      ? {
          ...habit,
          examples: params.reason,
          lastAppliedAt: now,
          applicationCount: habit.applicationCount + 1,
          status: habit.status === 'disabled' ? habit.status : 'pending' as WorkHabitStatus,
        }
      : habit)
    : [nextHabit, ...existing];

  saveWorkHabits(next);
}

export function recordSopTemplateHabit(params: {
  taskId: string;
  taskTitle: string;
  steps: string[];
}): WorkHabitRecord[] {
  if (!canUseLocalStorage()) return loadWorkHabits();

  const now = new Date().toISOString();
  const id = `habit_sop_${params.taskId}`;
  const existing = loadWorkHabits();
  const examples = params.steps.length
    ? params.steps.map((step, index) => `${index + 1}. ${step}`).join(' / ')
    : '从当前任务提取的流程模板';

  const nextHabit: WorkHabitRecord = {
    id,
    rule: `「${params.taskTitle}」流程模板`,
    source: 'sop',
    scope: 'task_type',
    scopeLabel: params.taskTitle,
    status: 'confirmed',
    examples,
    createdAt: now,
    lastAppliedAt: now,
    applicationCount: 1,
  };

  const next = existing.some((habit) => habit.id === id)
    ? existing.map((habit) => habit.id === id
      ? {
          ...habit,
          rule: nextHabit.rule,
          examples,
          lastAppliedAt: now,
          applicationCount: habit.applicationCount + 1,
          status: 'confirmed' as WorkHabitStatus,
        }
      : habit)
    : [nextHabit, ...existing];

  saveWorkHabits(next);
  return next;
}

export function selectApplicableWorkHabits(params: {
  taskTitle?: string | null;
  limit?: number;
} = {}): WorkHabitRecord[] {
  const normalizedTitle = params.taskTitle?.trim().toLowerCase() ?? '';
  const confirmed = loadWorkHabits().filter((habit) => habit.status === 'confirmed');
  const sorted = confirmed.sort((a, b) => {
    const aMatches = normalizedTitle && a.scopeLabel.toLowerCase().includes(normalizedTitle) ? 1 : 0;
    const bMatches = normalizedTitle && b.scopeLabel.toLowerCase().includes(normalizedTitle) ? 1 : 0;
    if (aMatches !== bMatches) return bMatches - aMatches;
    return b.applicationCount - a.applicationCount;
  });
  return sorted.slice(0, params.limit ?? 5);
}

export function summarizeWorkHabitsForPrompt(habits: WorkHabitRecord[]): string[] {
  return habits.map((habit) => {
    const scope = habit.scopeLabel || habit.scope;
    const examples = habit.examples ? `；例：${habit.examples}` : '';
    return `${habit.rule}（范围：${scope}${examples}）`;
  });
}
