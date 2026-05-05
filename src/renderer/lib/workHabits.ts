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

export type WorkHabitStorageSnapshot = {
  version: 2;
  storage: 'renderer_local';
  privacyBoundary: {
    locality: 'device_only';
    contains: string[];
    excludes: string[];
  };
  habits: WorkHabitRecord[];
};

export type WorkHabitConflict = {
  candidate: WorkHabitRecord;
  confirmed: WorkHabitRecord;
};

const STORAGE_KEY = 'taskplane.workHabits.v1';
const STORAGE_VERSION = 2;
const COMPLETION_OVERRIDE_PATTERN_ID = 'habit_pattern_completion_override';
const PATTERN_CONFIRMATION_THRESHOLD = 3;
const PRIVACY_BOUNDARY: WorkHabitStorageSnapshot['privacyBoundary'] = {
  locality: 'device_only',
  contains: [
    '规则描述',
    '来源类型',
    '适用范围',
    '确认状态',
    '创建与最近应用时间',
    '应用次数',
    '用户填写的例子或触发场景',
  ],
  excludes: [
    '聊天消息全文',
    '任务产物正文',
    '外部连接凭据',
    '未明确写入的后台行为记录',
  ],
};

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

function safeParseSnapshot(value: string | null): WorkHabitStorageSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as WorkHabitStorageSnapshot | WorkHabitRecord[];
    if (Array.isArray(parsed)) return buildStorageSnapshot(parsed);
    if (
      parsed
      && typeof parsed === 'object'
      && Array.isArray((parsed as WorkHabitStorageSnapshot).habits)
    ) {
      return buildStorageSnapshot((parsed as WorkHabitStorageSnapshot).habits);
    }
    return null;
  } catch {
    return null;
  }
}

function buildStorageSnapshot(habits: WorkHabitRecord[]): WorkHabitStorageSnapshot {
  return {
    version: STORAGE_VERSION,
    storage: 'renderer_local',
    privacyBoundary: PRIVACY_BOUNDARY,
    habits,
  };
}

export function getWorkHabitStorageSnapshot(): WorkHabitStorageSnapshot {
  if (!canUseLocalStorage()) return buildStorageSnapshot(SEED_HABITS);
  const stored = safeParseSnapshot(window.localStorage.getItem(STORAGE_KEY));
  if (stored) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return stored;
  }
  const seeded = buildStorageSnapshot(SEED_HABITS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

export function loadWorkHabits(): WorkHabitRecord[] {
  return getWorkHabitStorageSnapshot().habits;
}

export function saveWorkHabits(habits: WorkHabitRecord[]): void {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(buildStorageSnapshot(habits)));
}

export function describeWorkHabitStorageBoundary(): string[] {
  return [
    '工作习惯记录仅保存在本机 Taskplane 数据中。',
    `保存：${PRIVACY_BOUNDARY.contains.join('、')}。`,
    `不保存：${PRIVACY_BOUNDARY.excludes.join('、')}。`,
  ];
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

export function createManualWorkHabit(params: {
  rule: string;
  scope: WorkHabitScope;
  scopeLabel: string;
  examples?: string;
}): WorkHabitRecord[] {
  const rule = params.rule.trim();
  if (!rule) return loadWorkHabits();

  const now = new Date().toISOString();
  const habit: WorkHabitRecord = {
    id: `habit_manual_${Date.now()}`,
    rule,
    source: 'manual',
    scope: params.scope,
    scopeLabel: params.scopeLabel.trim() || scopeFallbackLabel(params.scope),
    status: 'confirmed',
    examples: params.examples?.trim() || '用户手动创建',
    createdAt: now,
    lastAppliedAt: null,
    applicationCount: 0,
  };
  const next = [habit, ...loadWorkHabits()];
  saveWorkHabits(next);
  return next;
}

function scopeFallbackLabel(scope: WorkHabitScope): string {
  if (scope === 'project') return '项目';
  if (scope === 'task_type') return '任务类型';
  return '全局';
}

function normalizeRule(value: string): string {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

function sharesLearningScope(a: WorkHabitRecord, b: WorkHabitRecord): boolean {
  return a.scope === b.scope && a.scopeLabel.trim() === b.scopeLabel.trim();
}

export function findWorkHabitConflict(
  candidate: WorkHabitRecord,
  habits: WorkHabitRecord[] = loadWorkHabits(),
): WorkHabitConflict | null {
  if (candidate.status !== 'pending') return null;
  const candidateRule = normalizeRule(candidate.rule);
  const confirmed = habits.find((habit) => (
    habit.id !== candidate.id
    && habit.status === 'confirmed'
    && sharesLearningScope(candidate, habit)
    && normalizeRule(habit.rule) !== candidateRule
  ));

  return confirmed ? { candidate, confirmed } : null;
}

export function resolveWorkHabitConflict(
  candidateId: string,
  decision: 'accept_candidate' | 'keep_confirmed',
): WorkHabitRecord[] {
  const habits = loadWorkHabits();
  const candidate = habits.find((habit) => habit.id === candidateId);
  const conflict = candidate ? findWorkHabitConflict(candidate, habits) : null;
  if (!candidate || !conflict) return habits;

  const next = habits.map((habit) => {
    if (habit.id === candidate.id) {
      return {
        ...habit,
        status: decision === 'accept_candidate' ? 'confirmed' as WorkHabitStatus : 'disabled' as WorkHabitStatus,
      };
    }
    if (habit.id === conflict.confirmed.id && decision === 'accept_candidate') {
      return { ...habit, status: 'disabled' as WorkHabitStatus };
    }
    return habit;
  });

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

  const withTaskHabit: WorkHabitRecord[] = existing.some((habit) => habit.id === id)
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

  saveWorkHabits(recordCompletionOverridePattern(withTaskHabit, {
    now,
    taskTitle: params.taskTitle,
    reason: params.reason,
  }));
}

function recordCompletionOverridePattern(
  habits: WorkHabitRecord[],
  params: { now: string; taskTitle: string; reason: string },
): WorkHabitRecord[] {
  const existing = habits.find((habit) => habit.id === COMPLETION_OVERRIDE_PATTERN_ID);
  const example = `观察窗口：${params.taskTitle} / ${params.reason}`;
  if (!existing) {
    return [
      {
        id: COMPLETION_OVERRIDE_PATTERN_ID,
        rule: '多次任务完成时覆盖未满足的完成检查',
        source: 'proposal',
        scope: 'task_type',
        scopeLabel: '任务完成',
        status: 'pending',
        examples: example,
        createdAt: params.now,
        lastAppliedAt: params.now,
        applicationCount: 1,
      },
      ...habits,
    ];
  }

  const nextCount = existing.applicationCount + 1;
  return habits.map((habit) => habit.id === COMPLETION_OVERRIDE_PATTERN_ID
    ? {
        ...habit,
        rule: nextCount >= PATTERN_CONFIRMATION_THRESHOLD
          ? '跨任务观察：你经常会在完成检查未全部满足时主动确认够用'
          : habit.rule,
        examples: `${existing.examples} / ${example}`,
        lastAppliedAt: params.now,
        applicationCount: nextCount,
        status: habit.status === 'disabled' ? habit.status : 'pending' as WorkHabitStatus,
      }
    : habit);
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
  taskTypeLabel?: string | null;
  projectLabel?: string | null;
  limit?: number;
} = {}): WorkHabitRecord[] {
  const context = {
    taskTitle: normalizeComparable(params.taskTitle),
    taskTypeLabel: normalizeComparable(params.taskTypeLabel),
    projectLabel: normalizeComparable(params.projectLabel),
  };
  const confirmed = loadWorkHabits().filter((habit) => (
    habit.status === 'confirmed' && habitAppliesToContext(habit, context)
  ));
  const sorted = confirmed.sort((a, b) => {
    const priorityDelta = scopePriority(b.scope) - scopePriority(a.scope);
    if (priorityDelta !== 0) return priorityDelta;
    return b.applicationCount - a.applicationCount;
  });
  return sorted.slice(0, params.limit ?? 5);
}

function normalizeComparable(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function scopePriority(scope: WorkHabitScope): number {
  if (scope === 'project') return 3;
  if (scope === 'task_type') return 2;
  return 1;
}

function labelMatches(label: string, ...candidates: string[]): boolean {
  const normalized = normalizeComparable(label);
  return candidates.some((candidate) => (
    Boolean(candidate)
    && (normalized.includes(candidate) || candidate.includes(normalized))
  ));
}

function habitAppliesToContext(
  habit: WorkHabitRecord,
  context: { taskTitle: string; taskTypeLabel: string; projectLabel: string },
): boolean {
  if (habit.scope === 'global') return true;
  if (habit.scope === 'project') {
    return labelMatches(habit.scopeLabel, context.projectLabel, context.taskTitle);
  }
  return labelMatches(habit.scopeLabel, context.taskTypeLabel, context.taskTitle);
}

export function summarizeWorkHabitsForPrompt(habits: WorkHabitRecord[]): string[] {
  return habits.map((habit) => {
    const scope = habit.scopeLabel || habit.scope;
    const examples = habit.examples ? `；例：${habit.examples}` : '';
    return `${habit.rule}（范围：${scope}${examples}）`;
  });
}
