import type {
  CompletionOverrideLearningSignalInput,
  CreateManualWorkHabitInput,
  ResolveWorkHabitConflictInput,
  SopTemplateHabitInput,
  UpdateWorkHabitInput,
  WorkHabitConflict,
  WorkHabitRecord,
  WorkHabitScope,
  WorkHabitStatus,
  WorkHabitStorageSnapshot,
} from './types/work-habit.js';

const STORAGE_VERSION = 3;
const COMPLETION_OVERRIDE_PATTERN_ID = 'habit_pattern_completion_override';
const PATTERN_CONFIRMATION_THRESHOLD = 3;

export const WORK_HABIT_PRIVACY_BOUNDARY: WorkHabitStorageSnapshot['privacyBoundary'] = {
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

export const SEED_WORK_HABITS: WorkHabitRecord[] = [
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

export function buildWorkHabitStorageSnapshot(habits: WorkHabitRecord[]): WorkHabitStorageSnapshot {
  return {
    version: STORAGE_VERSION,
    storage: 'main_db',
    privacyBoundary: WORK_HABIT_PRIVACY_BOUNDARY,
    habits,
  };
}

export function describeWorkHabitStorageBoundary(): string[] {
  return [
    '工作习惯记录仅保存在本机 Taskplane 数据库中。',
    `保存：${WORK_HABIT_PRIVACY_BOUNDARY.contains.join('、')}。`,
    `不保存：${WORK_HABIT_PRIVACY_BOUNDARY.excludes.join('、')}。`,
  ];
}

export function updateWorkHabitInList(
  habits: WorkHabitRecord[],
  input: UpdateWorkHabitInput,
): WorkHabitRecord[] {
  return habits.map((habit) => habit.id === input.id ? {
    ...habit,
    rule: input.rule ?? habit.rule,
    scopeLabel: input.scopeLabel ?? habit.scopeLabel,
    status: input.status ?? habit.status,
  } : habit);
}

export function deleteWorkHabitFromList(habits: WorkHabitRecord[], id: string): WorkHabitRecord[] {
  return habits.filter((habit) => habit.id !== id);
}

export function createManualWorkHabitInList(
  habits: WorkHabitRecord[],
  input: CreateManualWorkHabitInput,
  now = new Date().toISOString(),
): WorkHabitRecord[] {
  const rule = input.rule.trim();
  if (!rule) return habits;

  return [
    {
      id: `habit_manual_${Date.now()}`,
      rule,
      source: 'manual',
      scope: input.scope,
      scopeLabel: input.scopeLabel.trim() || scopeFallbackLabel(input.scope),
      status: 'confirmed',
      examples: input.examples?.trim() || '用户手动创建',
      createdAt: now,
      lastAppliedAt: null,
      applicationCount: 0,
    },
    ...habits,
  ];
}

export function findWorkHabitConflict(
  candidate: WorkHabitRecord,
  habits: WorkHabitRecord[],
): WorkHabitConflict | null {
  if (candidate.status !== 'pending') return null;
  const candidateRule = normalizeRule(candidate.rule);
  const confirmed = habits.find((habit) => (
    habit.id !== candidate.id
    && habit.status === 'confirmed'
    && sharesLearningScope(candidate, habit)
    && normalizeRule(habit.rule) !== candidateRule
    && rulesLikelyConflict(candidate.rule, habit.rule)
  ));

  return confirmed ? { candidate, confirmed } : null;
}

export function resolveWorkHabitConflictInList(
  habits: WorkHabitRecord[],
  input: ResolveWorkHabitConflictInput,
): WorkHabitRecord[] {
  const candidate = habits.find((habit) => habit.id === input.candidateId);
  const conflict = candidate ? findWorkHabitConflict(candidate, habits) : null;
  if (!candidate || !conflict) return habits;

  return habits.map((habit) => {
    if (habit.id === candidate.id) {
      return {
        ...habit,
        status: input.decision === 'accept_candidate' ? 'confirmed' as WorkHabitStatus : 'disabled' as WorkHabitStatus,
      };
    }
    if (habit.id === conflict.confirmed.id && input.decision === 'accept_candidate') {
      return { ...habit, status: 'disabled' as WorkHabitStatus };
    }
    return habit;
  });
}

export function recordCompletionOverrideLearningSignalInList(
  habits: WorkHabitRecord[],
  input: CompletionOverrideLearningSignalInput,
  now = new Date().toISOString(),
): WorkHabitRecord[] {
  const id = `habit_completion_override_${input.taskId}`;
  const examples = formatCompletionOverrideExample(input);
  const nextHabit: WorkHabitRecord = {
    id,
    rule: `完成「${input.taskTitle}」时允许覆盖未满足的完成检查`,
    source: 'proposal',
    scope: 'task_type',
    scopeLabel: '任务完成',
    status: 'pending',
    examples,
    createdAt: now,
    lastAppliedAt: now,
    applicationCount: 1,
  };

  const withTaskHabit: WorkHabitRecord[] = habits.some((habit) => habit.id === id)
    ? habits.map((habit) => habit.id === id
      ? {
          ...habit,
          examples,
          lastAppliedAt: now,
          applicationCount: habit.applicationCount + 1,
          status: habit.status === 'disabled' ? habit.status : 'pending' as WorkHabitStatus,
        }
      : habit)
    : [nextHabit, ...habits];

  return recordCompletionOverridePattern(withTaskHabit, {
    now,
    taskTitle: input.taskTitle,
    reason: input.reason,
  });
}

function formatCompletionOverrideExample(input: CompletionOverrideLearningSignalInput): string {
  const label = input.runVerificationLabel?.trim();
  const detail = input.runVerificationDetail?.trim();
  const runVerification = label
    ? detail
      ? `最近 Run 验证：${label}，${detail}`
      : `最近 Run 验证：${label}`
    : null;

  return [input.reason, runVerification].filter(Boolean).join(' / ');
}

export function recordSopTemplateHabitInList(
  habits: WorkHabitRecord[],
  input: SopTemplateHabitInput,
  now = new Date().toISOString(),
): WorkHabitRecord[] {
  const id = `habit_sop_${input.taskId}`;
  const examples = input.steps.length
    ? input.steps.map((step, index) => `${index + 1}. ${step}`).join(' / ')
    : '从当前任务提取的流程模板';

  const nextHabit: WorkHabitRecord = {
    id,
    rule: `「${input.taskTitle}」流程模板`,
    source: 'sop',
    scope: 'task_type',
    scopeLabel: input.taskTitle,
    status: 'confirmed',
    examples,
    createdAt: now,
    lastAppliedAt: now,
    applicationCount: 1,
  };

  return habits.some((habit) => habit.id === id)
    ? habits.map((habit) => habit.id === id
      ? {
          ...habit,
          rule: nextHabit.rule,
          examples,
          lastAppliedAt: now,
          applicationCount: habit.applicationCount + 1,
          status: 'confirmed' as WorkHabitStatus,
        }
      : habit)
    : [nextHabit, ...habits];
}

export function selectApplicableWorkHabits(
  habits: WorkHabitRecord[],
  params: {
    taskTitle?: string | null;
    taskTypeLabel?: string | null;
    projectLabel?: string | null;
    limit?: number;
  } = {},
): WorkHabitRecord[] {
  const context = {
    taskTitle: normalizeComparable(params.taskTitle),
    taskTypeLabel: normalizeComparable(params.taskTypeLabel),
    projectLabel: normalizeComparable(params.projectLabel),
  };
  const confirmed = habits.filter((habit) => (
    habit.status === 'confirmed' && habitAppliesToContext(habit, context)
  ));
  const sorted = confirmed.sort((a, b) => {
    const priorityDelta = scopePriority(b.scope) - scopePriority(a.scope);
    if (priorityDelta !== 0) return priorityDelta;
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

export function recordWorkHabitApplicationsInList(
  habits: WorkHabitRecord[],
  habitIds: string[],
  now = new Date().toISOString(),
): WorkHabitRecord[] {
  const appliedIds = new Set(habitIds);
  if (!appliedIds.size) return habits;

  return habits.map((habit) => appliedIds.has(habit.id)
    ? {
        ...habit,
        lastAppliedAt: now,
        applicationCount: habit.applicationCount + 1,
      }
    : habit);
}

function recordCompletionOverridePattern(
  habits: WorkHabitRecord[],
  params: { now: string; taskTitle: string; reason: string },
): WorkHabitRecord[] {
  const existing = habits.find((habit) => habit.id === COMPLETION_OVERRIDE_PATTERN_ID);
  const example = `观察窗口：${params.taskTitle} / ${params.reason}`;
  const observedTaskHabits = habits.filter((habit) => (
    habit.id.startsWith('habit_completion_override_')
    && habit.id !== COMPLETION_OVERRIDE_PATTERN_ID
  ));
  const observedTaskCount = observedTaskHabits.length;

  if (!existing && observedTaskCount < PATTERN_CONFIRMATION_THRESHOLD) {
    return habits;
  }

  if (!existing) {
    return [
      {
        id: COMPLETION_OVERRIDE_PATTERN_ID,
        rule: '跨任务观察：你经常会在完成检查未全部满足时主动确认够用',
        source: 'proposal',
        scope: 'task_type',
        scopeLabel: '任务完成',
        status: 'pending',
        examples: observedTaskHabits.map((habit) => (
          habit.examples ? `${habit.rule}：${habit.examples}` : habit.rule
        )).join(' / ') || example,
        createdAt: params.now,
        lastAppliedAt: params.now,
        applicationCount: observedTaskCount,
      },
      ...habits,
    ];
  }

  return habits.map((habit) => habit.id === COMPLETION_OVERRIDE_PATTERN_ID
    ? {
        ...habit,
        rule: observedTaskCount >= PATTERN_CONFIRMATION_THRESHOLD
          ? '跨任务观察：你经常会在完成检查未全部满足时主动确认够用'
          : habit.rule,
        examples: `${existing.examples} / ${example}`,
        lastAppliedAt: params.now,
        applicationCount: observedTaskCount,
        status: habit.status === 'disabled' ? habit.status : 'pending' as WorkHabitStatus,
      }
    : habit);
}

function scopeFallbackLabel(scope: WorkHabitScope): string {
  if (scope === 'project') return '项目';
  if (scope === 'task_type') return '任务类型';
  return '全局';
}

function normalizeRule(value: string): string {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

function rulesLikelyConflict(left: string, right: string): boolean {
  const leftTerms = extractRuleTerms(left);
  const rightTerms = extractRuleTerms(right);
  if (leftTerms.size === 0 || rightTerms.size === 0) return false;

  let overlap = 0;
  for (const term of leftTerms) {
    if (rightTerms.has(term)) overlap += 1;
  }

  const smaller = Math.min(leftTerms.size, rightTerms.size);
  return overlap / smaller >= 0.35;
}

function extractRuleTerms(value: string): Set<string> {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[，。！？；：、,.!?;:()[\]【】"'“”‘’]/g, ' ')
    .replace(/\s+/g, ' ');
  const terms = new Set<string>();

  for (const word of normalized.match(/[a-z0-9_-]{2,}/g) ?? []) {
    terms.add(word);
  }

  const cjk = normalized.replace(/[^\u4e00-\u9fff]/g, '');
  for (let index = 0; index < cjk.length - 1; index += 1) {
    terms.add(cjk.slice(index, index + 2));
  }

  return terms;
}

function sharesLearningScope(a: WorkHabitRecord, b: WorkHabitRecord): boolean {
  return a.scope === b.scope && a.scopeLabel.trim() === b.scopeLabel.trim();
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
