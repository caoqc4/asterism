import { describe, expect, it } from 'vitest';

import {
  findWorkHabitConflict,
  recordWorkHabitApplicationsInList,
} from './work-habit-rules.js';
import type { WorkHabitRecord } from './types/work-habit.js';

const baseHabit: WorkHabitRecord = {
  id: 'habit_1',
  rule: '发布前先做事实核对',
  source: 'manual',
  scope: 'global',
  scopeLabel: '全局',
  status: 'confirmed',
  examples: '公告初稿',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastAppliedAt: null,
  applicationCount: 2,
};

describe('work habit rules', () => {
  it('records application count and last applied time for selected habits', () => {
    const habits = recordWorkHabitApplicationsInList([
      baseHabit,
      { ...baseHabit, id: 'habit_2', applicationCount: 7 },
    ], ['habit_1'], '2026-05-07T00:00:00.000Z');

    expect(habits.find((habit) => habit.id === 'habit_1')).toMatchObject({
      applicationCount: 3,
      lastAppliedAt: '2026-05-07T00:00:00.000Z',
    });
    expect(habits.find((habit) => habit.id === 'habit_2')).toMatchObject({
      applicationCount: 7,
      lastAppliedAt: null,
    });
  });

  it('does not record applications for pending or disabled habits', () => {
    const habits = recordWorkHabitApplicationsInList([
      { ...baseHabit, id: 'habit_confirmed', status: 'confirmed', applicationCount: 2 },
      { ...baseHabit, id: 'habit_pending', status: 'pending', applicationCount: 4, lastAppliedAt: null },
      { ...baseHabit, id: 'habit_disabled', status: 'disabled', applicationCount: 6, lastAppliedAt: null },
    ], ['habit_confirmed', 'habit_pending', 'habit_disabled'], '2026-05-07T00:00:00.000Z');

    expect(habits.find((habit) => habit.id === 'habit_confirmed')).toMatchObject({
      applicationCount: 3,
      lastAppliedAt: '2026-05-07T00:00:00.000Z',
    });
    expect(habits.find((habit) => habit.id === 'habit_pending')).toMatchObject({
      applicationCount: 4,
      lastAppliedAt: null,
    });
    expect(habits.find((habit) => habit.id === 'habit_disabled')).toMatchObject({
      applicationCount: 6,
      lastAppliedAt: null,
    });
  });

  it('does not mark unrelated pending rules as conflicts only because scope matches', () => {
    const pending: WorkHabitRecord = {
      ...baseHabit,
      id: 'habit_pending',
      rule: '周报任务每周五 17:00 前完成',
      source: 'proposal',
      status: 'pending',
      applicationCount: 0,
    };

    expect(findWorkHabitConflict(pending, [baseHabit, pending])).toBeNull();
  });

  it('flags pending rules that overlap with an existing confirmed rule in the same scope', () => {
    const confirmed: WorkHabitRecord = {
      ...baseHabit,
      rule: '代码合入前先跑完整测试',
    };
    const pending: WorkHabitRecord = {
      ...baseHabit,
      id: 'habit_pending',
      rule: '代码合入前只跑快速冒烟测试',
      source: 'proposal',
      status: 'pending',
      applicationCount: 0,
    };

    expect(findWorkHabitConflict(pending, [confirmed, pending])).toMatchObject({
      candidate: { id: 'habit_pending' },
      confirmed: { id: 'habit_1' },
    });
  });
});
