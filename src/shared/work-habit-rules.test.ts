import { describe, expect, it } from 'vitest';

import {
  createWorkHabitProposalInList,
  findWorkHabitConflict,
  recordSopTemplateHabitInList,
  recordWorkHabitApplicationsInList,
  selectApplicableWorkHabitMatches,
  selectApplicableWorkHabits,
  summarizeWorkHabitMatchesForPrompt,
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

  it('selects confirmed habits by project, task type, then global priority', () => {
    const habits: WorkHabitRecord[] = [
      { ...baseHabit, id: 'habit_global', scope: 'global', scopeLabel: '全局', applicationCount: 12 },
      { ...baseHabit, id: 'habit_type', scope: 'task_type', scopeLabel: '定时任务', applicationCount: 4 },
      { ...baseHabit, id: 'habit_project', scope: 'project', scopeLabel: '官网改版', applicationCount: 1 },
      { ...baseHabit, id: 'habit_pending_project', scope: 'project', scopeLabel: '官网改版', status: 'pending', applicationCount: 30 },
      { ...baseHabit, id: 'habit_disabled_global', scope: 'global', scopeLabel: '全局', status: 'disabled', applicationCount: 40 },
      { ...baseHabit, id: 'habit_other_project', scope: 'project', scopeLabel: '投资人路演', applicationCount: 50 },
    ];

    const selected = selectApplicableWorkHabits(habits, {
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

  it('explains why selected work habits apply to the current task', () => {
    const matches = selectApplicableWorkHabitMatches([
      { ...baseHabit, id: 'habit_global', scope: 'global', scopeLabel: '全局', applicationCount: 12 },
      { ...baseHabit, id: 'habit_type', scope: 'task_type', scopeLabel: '定时任务', applicationCount: 4 },
      { ...baseHabit, id: 'habit_project', scope: 'project', scopeLabel: '官网改版', applicationCount: 1 },
    ], {
      taskTitle: '官网改版周会',
      taskTypeLabel: '定时任务',
      projectLabel: '官网改版',
    });

    expect(matches.map((match) => [match.habit.id, match.reason])).toEqual([
      ['habit_project', 'project match: 官网改版'],
      ['habit_type', 'task type match: 定时任务'],
      ['habit_global', 'global confirmed habit'],
    ]);
    expect(summarizeWorkHabitMatchesForPrompt(matches)[0]).toContain('适用原因：project match: 官网改版');
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

  it('creates pending work habit proposals without confirming them', () => {
    const habits = createWorkHabitProposalInList([], {
      rule: '类似任务以后先内部评审再对外发送',
      scope: 'task_type',
      scopeLabel: '外部沟通',
      examples: '用户在任务讨论中反复纠正发送前要评审',
    }, '2026-05-14T00:00:00.000Z');

    expect(habits[0]).toMatchObject({
      source: 'proposal',
      status: 'pending',
      scope: 'task_type',
      scopeLabel: '外部沟通',
      applicationCount: 1,
    });
  });

  it('does not create a duplicate proposal when the same confirmed habit already exists', () => {
    const habits = createWorkHabitProposalInList([baseHabit], {
      rule: baseHabit.rule,
      scope: baseHabit.scope,
      scopeLabel: baseHabit.scopeLabel,
      examples: '运行时再次观察到同一规则',
    }, '2026-05-14T00:00:00.000Z');

    expect(habits).toHaveLength(1);
    expect(habits[0]).toMatchObject({
      id: 'habit_1',
      status: 'confirmed',
      applicationCount: 2,
    });
  });

  it('deduplicates SOP habits by equivalent step shape across tasks', () => {
    const first = recordSopTemplateHabitInList([], {
      taskId: 'task_release',
      taskTitle: 'Release',
      steps: ['检查上下文', '执行验证', '记录收尾'],
    }, '2026-05-14T00:00:00.000Z');

    const second = recordSopTemplateHabitInList(first, {
      taskId: 'task_launch',
      taskTitle: 'Launch',
      steps: ['检查上下文', '执行验证', '记录收尾'],
    }, '2026-05-15T00:00:00.000Z');

    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      id: 'habit_sop_task_release',
      source: 'sop',
      status: 'confirmed',
      applicationCount: 2,
      lastAppliedAt: '2026-05-15T00:00:00.000Z',
    });
  });
});
