// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import {
  createManualWorkHabit,
  findWorkHabitConflict,
  loadWorkHabits,
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
