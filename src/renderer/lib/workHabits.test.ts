// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createManualWorkHabit,
  describeWorkHabitStorageBoundary,
  findWorkHabitConflict,
  getPersistedWorkHabitStorageSnapshot,
  getWorkHabitStorageSnapshot,
  loadWorkHabits,
  recordCompletionOverrideLearningSignal,
  resolveWorkHabitConflict,
  saveWorkHabits,
  selectApplicableWorkHabits,
  type WorkHabitRecord,
} from './workHabits';

const baseHabit: WorkHabitRecord = {
  id: 'habit_existing',
  rule: '代码合入前必须先跑完整测试',
  source: 'manual',
  scope: 'task_type',
  scopeLabel: '代码合入',
  status: 'confirmed',
  examples: '发布前检查',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastAppliedAt: null,
  applicationCount: 3,
};

const candidateHabit: WorkHabitRecord = {
  ...baseHabit,
  id: 'habit_candidate',
  rule: '代码合入前只需要跑受影响测试',
  source: 'proposal',
  status: 'pending',
  examples: '小范围样式调整',
  applicationCount: 1,
};

describe('work habit conflict handling', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: undefined,
    });
  });

  it('detects pending rules that conflict with confirmed rules in the same scope', () => {
    saveWorkHabits([candidateHabit, baseHabit]);

    expect(findWorkHabitConflict(candidateHabit)?.confirmed.id).toBe('habit_existing');
  });

  it('accepts a newer conflicting rule by confirming it and disabling the old rule', () => {
    saveWorkHabits([candidateHabit, baseHabit]);

    const habits = resolveWorkHabitConflict('habit_candidate', 'accept_candidate');

    expect(habits.find((habit) => habit.id === 'habit_candidate')?.status).toBe('confirmed');
    expect(habits.find((habit) => habit.id === 'habit_existing')?.status).toBe('disabled');
    expect(loadWorkHabits().find((habit) => habit.id === 'habit_existing')?.status).toBe('disabled');
  });

  it('keeps the existing rule by disabling the conflicting proposal', () => {
    saveWorkHabits([candidateHabit, baseHabit]);

    const habits = resolveWorkHabitConflict('habit_candidate', 'keep_confirmed');

    expect(habits.find((habit) => habit.id === 'habit_candidate')?.status).toBe('disabled');
    expect(habits.find((habit) => habit.id === 'habit_existing')?.status).toBe('confirmed');
  });

  it('creates user-authored habits as confirmed local rules', () => {
    const habits = createManualWorkHabit({
      rule: '董事会材料发出前先更新现金流页',
      scope: 'task_type',
      scopeLabel: '董事会材料',
      examples: '月度董事会包',
    });

    expect(habits[0]).toMatchObject({
      rule: '董事会材料发出前先更新现金流页',
      source: 'manual',
      scope: 'task_type',
      scopeLabel: '董事会材料',
      status: 'confirmed',
      examples: '月度董事会包',
      applicationCount: 0,
    });
    expect(loadWorkHabits()[0]?.source).toBe('manual');
  });

  it('selects applicable habits by project, task type, then global priority', () => {
    saveWorkHabits([
      buildHabit({
        id: 'habit_global',
        rule: '所有重要输出都先自查一遍',
        scope: 'global',
        scopeLabel: '全局',
        applicationCount: 20,
      }),
      buildHabit({
        id: 'habit_type',
        rule: '定时任务提前一天检查数据源',
        scope: 'task_type',
        scopeLabel: '定时任务',
        applicationCount: 2,
      }),
      buildHabit({
        id: 'habit_project',
        rule: '官网改版项目先同步视觉规范',
        scope: 'project',
        scopeLabel: '官网改版',
        applicationCount: 1,
      }),
      buildHabit({
        id: 'habit_irrelevant',
        rule: '品牌合作先查邮件线程',
        scope: 'task_type',
        scopeLabel: '外部合作',
        applicationCount: 99,
      }),
    ]);

    const selected = selectApplicableWorkHabits({
      taskTitle: '官网改版周会',
      taskTypeLabel: '定时任务',
      projectLabel: '官网改版',
    });

    expect(selected.map((habit) => habit.id)).toEqual([
      'habit_project',
      'habit_type',
      'habit_global',
    ]);
  });

  it('stores habits in a versioned main-db snapshot shape and migrates legacy arrays', () => {
    window.localStorage.setItem('taskplane.workHabits.v1', JSON.stringify([baseHabit]));

    const snapshot = getWorkHabitStorageSnapshot();

    expect(snapshot).toMatchObject({
      version: 3,
      storage: 'main_db',
      privacyBoundary: {
        locality: 'device_only',
      },
      habits: [expect.objectContaining({ id: 'habit_existing' })],
    });
    expect(snapshot.privacyBoundary.excludes).toContain('聊天消息全文');
    expect(JSON.parse(window.localStorage.getItem('taskplane.workHabits.v1') ?? '{}')).toMatchObject({
      version: 3,
      habits: [expect.objectContaining({ id: 'habit_existing' })],
    });
  });

  it('imports legacy local habits into the main-db snapshot once', async () => {
    window.localStorage.setItem('taskplane.workHabits.v1', JSON.stringify([baseHabit]));
    const importLegacyWorkHabits = vi.fn().mockResolvedValue({
      version: 3,
      storage: 'main_db',
      privacyBoundary: { locality: 'device_only', contains: [], excludes: [] },
      habits: [baseHabit],
    });
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getWorkHabitSnapshot: vi.fn().mockResolvedValue({
          version: 3,
          storage: 'main_db',
          privacyBoundary: { locality: 'device_only', contains: [], excludes: [] },
          habits: [],
        }),
        importLegacyWorkHabits,
      },
    });

    const snapshot = await getPersistedWorkHabitStorageSnapshot();
    const second = await getPersistedWorkHabitStorageSnapshot();

    expect(snapshot.habits[0]?.id).toBe('habit_existing');
    expect(second.storage).toBe('main_db');
    expect(importLegacyWorkHabits).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('taskplane.workHabits.mainDbMigration.v1')).toBe('done');
  });

  it('describes the work habit privacy boundary for Context', () => {
    expect(describeWorkHabitStorageBoundary().join('\n')).toContain('仅保存在本机');
    expect(describeWorkHabitStorageBoundary().join('\n')).toContain('不保存：聊天消息全文');
  });

  it('aggregates repeated completion overrides into a cross-task observation window', () => {
    recordCompletionOverrideLearningSignal({
      taskId: 'task_a',
      taskTitle: '董事会材料修订',
      reason: '完成检查未通过：仍有 1 条完成标准未满足',
    });
    recordCompletionOverrideLearningSignal({
      taskId: 'task_b',
      taskTitle: '官网改版方案',
      reason: '完成检查未通过：仍有 2 条完成标准未满足',
    });
    recordCompletionOverrideLearningSignal({
      taskId: 'task_c',
      taskTitle: '周报发送',
      reason: '完成检查需要补充完成标准',
    });

    const pattern = loadWorkHabits().find((habit) => habit.id === 'habit_pattern_completion_override');

    expect(pattern).toMatchObject({
      source: 'proposal',
      scope: 'task_type',
      scopeLabel: '任务完成',
      status: 'pending',
      applicationCount: 3,
    });
    expect(pattern?.rule).toContain('跨任务观察');
    expect(pattern?.examples).toContain('董事会材料修订');
    expect(pattern?.examples).toContain('周报发送');
  });

  it('waits for three distinct completion overrides before proposing a cross-task pattern', () => {
    recordCompletionOverrideLearningSignal({
      taskId: 'task_a',
      taskTitle: '董事会材料修订',
      reason: '完成检查未通过：仍有 1 条完成标准未满足',
    });
    recordCompletionOverrideLearningSignal({
      taskId: 'task_b',
      taskTitle: '官网改版方案',
      reason: '完成检查未通过：仍有 2 条完成标准未满足',
    });

    expect(loadWorkHabits().some((habit) => habit.id === 'habit_pattern_completion_override')).toBe(false);
  });

  it('does not promote same-task completion overrides as a cross-task pattern', () => {
    recordCompletionOverrideLearningSignal({
      taskId: 'task_override_same',
      taskTitle: '董事会材料修订',
      reason: '完成检查未通过：仍有 1 条完成标准未满足',
    });
    recordCompletionOverrideLearningSignal({
      taskId: 'task_override_same',
      taskTitle: '董事会材料修订',
      reason: '完成检查再次被覆盖',
    });
    recordCompletionOverrideLearningSignal({
      taskId: 'task_override_same',
      taskTitle: '董事会材料修订',
      reason: '完成检查第三次被覆盖',
    });

    const pattern = loadWorkHabits().find((habit) => habit.id === 'habit_pattern_completion_override');

    expect(pattern).toBeUndefined();
  });

  it('keeps run verification context on completion override learning signals', () => {
    recordCompletionOverrideLearningSignal({
      taskId: 'task_run_warn',
      taskTitle: '发布检查',
      reason: '完成检查提醒：最近 Run 需要补验证',
      runVerificationTone: 'warn',
      runVerificationLabel: 'Run 需补验证',
      runVerificationDetail: 'Run 已完成，但缺少可复核输出。',
    });

    const habit = loadWorkHabits().find((item) => item.id === 'habit_completion_override_task_run_warn');

    expect(habit?.examples).toContain('完成检查提醒：最近 Run 需要补验证');
    expect(habit?.examples).toContain('最近 Run 验证：Run 需补验证，Run 已完成，但缺少可复核输出。');
  });
});

function buildHabit(partial: Partial<WorkHabitRecord>): WorkHabitRecord {
  return {
    ...baseHabit,
    ...partial,
    id: partial.id ?? `habit_${partial.scope ?? 'global'}`,
    rule: partial.rule ?? baseHabit.rule,
    scope: partial.scope ?? 'global',
    scopeLabel: partial.scopeLabel ?? '全局',
    status: partial.status ?? 'confirmed',
  };
}
