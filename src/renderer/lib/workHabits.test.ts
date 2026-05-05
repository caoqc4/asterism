// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import {
  findWorkHabitConflict,
  loadWorkHabits,
  resolveWorkHabitConflict,
  saveWorkHabits,
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
});
