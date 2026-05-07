import { describe, expect, it } from 'vitest';

import { recordWorkHabitApplicationsInList } from './work-habit-rules.js';
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
});
