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

  it('does not duplicate equivalent confirmed habits through the service boundary', async () => {
    const service = new WorkHabitService(new FakeWorkHabitRepository([workHabit({
      rule: '以后所有任务都先做第一性原理评估',
      scope: 'global',
      scopeLabel: '全局',
      status: 'confirmed',
    })]) as never);

    const habits = await service.propose({
      rule: '以后所有任务都先做第一性原理评估',
      scope: 'global',
      scopeLabel: '全局',
    });

    expect(habits).toHaveLength(1);
    expect(habits[0]).toMatchObject({
      source: 'manual',
      status: 'confirmed',
      applicationCount: 1,
    });
  });

  it('does not duplicate equivalent manually created habits through the service boundary', async () => {
    const service = new WorkHabitService(new FakeWorkHabitRepository() as never);

    await service.createManual({
      rule: '董事会材料发出前先更新现金流页',
      scope: 'task_type',
      scopeLabel: '董事会材料',
    });
    const habits = await service.createManual({
      rule: '董事会材料发出前先更新现金流页',
      scope: 'task_type',
      scopeLabel: '董事会材料',
    });

    expect(habits.filter((habit) => habit.rule.includes('董事会材料发出前'))).toHaveLength(1);
  });

  it('does not let manual Work Habit creation store task-specific corrections', async () => {
    const service = new WorkHabitService(new FakeWorkHabitRepository() as never);

    const habits = await service.createManual({
      rule: '这个任务以后都按当前验收口径处理',
      scope: 'global',
      scopeLabel: '全局',
    });

    expect(habits.some((habit) => habit.rule.includes('当前验收口径'))).toBe(false);
  });

  it('does not let Work Habit edits turn confirmed rules into task-specific corrections', async () => {
    const service = new WorkHabitService(new FakeWorkHabitRepository([workHabit()]) as never);

    const habits = await service.update({
      id: 'habit_1',
      rule: '这个任务应该用刚才确认的方案',
    });

    expect(habits.find((habit) => habit.id === 'habit_1')).toMatchObject({
      rule: '以后所有任务都先做第一性原理评估',
    });
  });

  it('persists conflicting proposals so the retained conflict resolver can decide', async () => {
    const repository = new FakeWorkHabitRepository([workHabit({
      id: 'habit_confirmed',
      rule: '代码合入前先跑完整测试',
      scope: 'task_type',
      scopeLabel: '代码合入',
      status: 'confirmed',
    })]);
    const service = new WorkHabitService(repository as never);

    const proposed = await service.propose({
      rule: '以后代码合入前只跑快速冒烟测试',
      scope: 'task_type',
      scopeLabel: '代码合入',
    });
    const candidate = proposed.find((habit) => habit.status === 'pending');
    expect(candidate).toBeTruthy();

    const resolved = await service.resolveConflict({
      candidateId: candidate!.id,
      decision: 'keep_confirmed',
    });

    expect(resolved.find((habit) => habit.id === candidate!.id)).toMatchObject({
      status: 'disabled',
    });
    expect(resolved.find((habit) => habit.id === 'habit_confirmed')).toMatchObject({
      status: 'confirmed',
    });
  });

  it('deduplicates equivalent SOP step shapes through the service boundary', async () => {
    const service = new WorkHabitService(new FakeWorkHabitRepository() as never);

    await service.recordSopTemplate({
      taskId: 'task_release',
      taskTitle: 'Release',
      steps: ['检查上下文', '执行验证', '记录收尾'],
    });
    const habits = await service.recordSopTemplate({
      taskId: 'task_launch',
      taskTitle: 'Launch',
      steps: ['检查上下文', '执行验证', '记录收尾'],
    });

    const sopHabits = habits.filter((habit) => habit.source === 'sop');
    expect(sopHabits).toHaveLength(1);
    expect(sopHabits[0]).toMatchObject({
      id: 'habit_sop_task_release',
      status: 'confirmed',
      applicationCount: 2,
    });
  });

  it('does not import task-specific legacy habits into cross-task memory', async () => {
    const service = new WorkHabitService(new FakeWorkHabitRepository() as never);

    const snapshot = await service.importLegacy({
      habits: [
        workHabit({
          id: 'legacy_task_bound',
          rule: '这个任务应该以用户刚刚确认的范围为准',
        }),
        workHabit({
          id: 'legacy_global',
          rule: '以后所有任务都先做第一性原理评估',
        }),
      ],
    });

    expect(snapshot.habits.some((habit) => habit.id === 'legacy_task_bound')).toBe(false);
    expect(snapshot.habits.some((habit) => habit.id === 'legacy_global')).toBe(true);
  });
});

function workHabit(partial: Partial<WorkHabitRecord> = {}): WorkHabitRecord {
  return {
    id: partial.id ?? 'habit_1',
    rule: partial.rule ?? '以后所有任务都先做第一性原理评估',
    source: partial.source ?? 'manual',
    scope: partial.scope ?? 'global',
    scopeLabel: partial.scopeLabel ?? '全局',
    status: partial.status ?? 'confirmed',
    examples: partial.examples ?? '用户明确确认的工作习惯',
    createdAt: partial.createdAt ?? '2026-05-17T00:00:00.000Z',
    lastAppliedAt: partial.lastAppliedAt ?? null,
    applicationCount: partial.applicationCount ?? 1,
  };
}
