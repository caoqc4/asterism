import { describe, expect, it } from 'vitest';

import type { WorkHabitRecord } from '../../../shared/types/work-habit.js';
import { WorkHabitService } from './work-habit-service.js';

class FakeWorkHabitRepository {
  constructor(private habits: WorkHabitRecord[] = []) {}

  async list(): Promise<WorkHabitRecord[]> {
    return this.habits;
  }

  async replaceAll(habits: WorkHabitRecord[]): Promise<WorkHabitRecord[]> {
    this.habits = habits;
    return this.habits;
  }
}

describe('WorkHabitService learning boundary', () => {
  it('does not persist task-specific corrections as cross-task habit proposals', async () => {
    const service = new WorkHabitService(new FakeWorkHabitRepository() as never);

    const habits = await service.propose({
      rule: '这个任务应该以用户刚刚确认的范围为准',
      taskTitle: 'Scope check',
    });

    expect(habits.some((habit) => habit.rule.includes('用户刚刚确认'))).toBe(false);
  });

  it('persists cross-task preference proposals as pending work habits', async () => {
    const service = new WorkHabitService(new FakeWorkHabitRepository() as never);

    const habits = await service.propose({
      rule: '以后所有任务都先做第一性原理评估',
      taskTitle: 'Runtime design',
    });

    expect(habits[0]).toMatchObject({
      rule: '以后所有任务都先做第一性原理评估',
      source: 'proposal',
      status: 'pending',
      scope: 'global',
    });
  });

  it('requires SOP template writes to look like process-shaped learning', async () => {
    const service = new WorkHabitService(new FakeWorkHabitRepository() as never);

    const habits = await service.recordSopTemplate({
      taskId: 'task_1',
      taskTitle: 'Release',
      steps: ['先检查上下文', '再执行验证'],
    });

    expect(habits[0]).toMatchObject({
      id: 'habit_sop_task_1',
      source: 'sop',
      status: 'confirmed',
    });
  });
});
