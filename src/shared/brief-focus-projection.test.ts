import { describe, expect, it } from 'vitest';

import { projectBriefFocusTasks } from './brief-focus-projection.js';
import type {
  HomeTaskSliceRecord,
  PriorityLane,
  RecommendedAction,
} from './types/brief.js';

describe('brief focus projection', () => {
  it('keeps the shared recommended action order while deduplicating tasks', () => {
    const focusTasks = projectBriefFocusTasks({
      tasks: [
        task({ id: 'task_1', title: 'First task', state: 'planned' }),
        task({ id: 'task_2', title: 'Second task', state: 'waiting_external' }),
      ],
      recommendedActions: [
        action({ id: 'next-step:task_1', taskId: 'task_1', label: '继续推进：First task' }),
        action({ id: 'artifact:task_1', taskId: 'task_1', label: '查看产物：First task' }),
        action({ id: 'waiting:task_2', taskId: 'task_2', label: '跟进等待：Second task' }),
      ],
    });

    expect(focusTasks.map((item) => item.id)).toEqual(['task_1', 'task_2']);
    expect(focusTasks[0]).toMatchObject({
      sourceActionId: 'next-step:task_1',
      rank: 1,
      attentionLane: 'continue_next_step',
    });
    expect(focusTasks[1]).toMatchObject({
      id: 'task_2',
      status: 'waiting',
      action: '起草跟进',
      rank: 2,
      attentionReason: expect.stringContaining('Shared priority order'),
    });
  });

  it('filters a project parent when a visible child carries the same attention unless the parent is urgent', () => {
    const tasks = [
      task({
        id: 'parent',
        title: 'Parent project',
        taskType: 'project',
        childTaskIds: ['child'],
      }),
      task({
        id: 'child',
        title: 'Child task',
        parentTaskId: 'parent',
      }),
    ];

    expect(projectBriefFocusTasks({
      tasks,
      recommendedActions: [
        action({ id: 'next-step:parent', taskId: 'parent', label: '继续推进：Parent project' }),
        action({ id: 'next-step:child', taskId: 'child', label: '继续推进：Child task' }),
      ],
    }).map((item) => item.id)).toEqual(['child']);

    expect(projectBriefFocusTasks({
      tasks,
      recommendedActions: [
        action({
          id: 'decision:parent',
          taskId: 'parent',
          label: '尽快拍板：Parent project',
          lane: 'unblock_or_decide',
          priority: 'high',
        }),
        action({ id: 'next-step:child', taskId: 'child', label: '继续推进：Child task' }),
      ],
    }).map((item) => item.id)).toEqual(['parent', 'child']);
  });

  it('caps Brief focus tasks at five items without mutating the full queue', () => {
    const ids = ['task_1', 'task_2', 'task_3', 'task_4', 'task_5', 'task_6'];
    const focusTasks = projectBriefFocusTasks({
      tasks: ids.map((id) => task({ id, title: id })),
      recommendedActions: ids.map((id, index) =>
        action({
          id: `next-step:${id}`,
          taskId: id,
          label: `继续推进：${id}`,
          reason: `reason ${index + 1}`,
        }),
      ),
    });

    expect(focusTasks.map((item) => item.id)).toEqual([
      'task_1',
      'task_2',
      'task_3',
      'task_4',
      'task_5',
    ]);
  });
});

function task(partial: Partial<HomeTaskSliceRecord>): HomeTaskSliceRecord {
  return {
    id: 'task_1',
    title: 'Task',
    summary: null,
    taskType: undefined,
    taskFacets: undefined,
    parentTaskId: null,
    childTaskIds: [],
    state: 'planned',
    nextStep: 'Continue',
    waitingReason: null,
    riskLevel: 'none',
    riskNote: null,
    activeWaitingItem: null,
    activeBlocker: null,
    activeDependency: null,
    ...partial,
  };
}

function action(partial: Partial<RecommendedAction> & {
  id: string;
  taskId: string | null;
}): RecommendedAction {
  return {
    ...partial,
    id: partial.id,
    label: partial.label ?? `继续推进：${partial.taskId ?? partial.id}`,
    reason: partial.reason ?? 'Shared order says this task deserves attention.',
    taskId: partial.taskId,
    priority: partial.priority ?? 'medium',
    lane: (partial.lane as PriorityLane | undefined) ?? 'continue_or_review',
  };
}
