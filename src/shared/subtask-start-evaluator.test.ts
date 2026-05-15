import { describe, expect, it } from 'vitest';

import { evaluateSubtaskStart } from './subtask-start-evaluator.js';
import type { TaskListItemRecord } from './types/task.js';

const now = '2026-01-01T00:00:00.000Z';

function buildTask(partial: Partial<TaskListItemRecord> = {}): TaskListItemRecord {
  return {
    id: partial.id ?? 'child_1',
    title: partial.title ?? '小程序需求分析与功能设计',
    summary: partial.summary ?? null,
    taskType: partial.taskType,
    taskFacets: partial.taskFacets,
    parentTaskId: partial.parentTaskId ?? 'parent_1',
    childTaskIds: partial.childTaskIds,
    state: partial.state ?? 'planned',
    nextStep: partial.nextStep ?? '继续推进',
    waitingReason: partial.waitingReason ?? null,
    riskLevel: partial.riskLevel ?? 'none',
    riskNote: partial.riskNote ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    activeWaitingItem: partial.activeWaitingItem ?? null,
    activeBlocker: partial.activeBlocker ?? null,
    activeDependency: partial.activeDependency ?? null,
    dependencyReevaluation: partial.dependencyReevaluation ?? null,
  };
}

describe('evaluateSubtaskStart', () => {
  it('allows a clean and sufficient child task to start', () => {
    expect(evaluateSubtaskStart({
      targetTask: buildTask(),
      parentTask: buildTask({ id: 'parent_1', parentTaskId: null, title: '开发小程序' }),
      expectedParentTaskId: 'parent_1',
      contextSignals: {
        activeTaskId: 'child_1',
        inputPromptTaskId: 'child_1',
        selectedFileTaskId: 'child_1',
      },
      availableContext: {
        taskState: true,
        taskMd: true,
        completionCriteria: true,
        nextStep: true,
        parentConstraints: true,
        decisions: true,
        files: true,
        workHabits: true,
      },
    })).toMatchObject({
      outcome: 'ready_to_start',
      canStart: true,
      contextClean: true,
      contextSufficient: true,
    });
  });

  it('rejects a task outside the expected parent boundary', () => {
    expect(evaluateSubtaskStart({
      targetTask: buildTask({ parentTaskId: 'other_parent' }),
      expectedParentTaskId: 'parent_1',
    })).toMatchObject({
      outcome: 'wrong_task_boundary',
      canStart: false,
    });
  });

  it('blocks start when the target task itself has a dependency or waiting state', () => {
    expect(evaluateSubtaskStart({
      targetTask: buildTask({
        activeDependency: {
          id: 'dep_1',
          taskId: 'child_1',
          blockedByTaskId: 'upstream_1',
          blockedByTaskTitle: '数据准备',
          reason: null,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          resolvedAt: null,
        },
      }),
    })).toMatchObject({
      outcome: 'blocked_by_dependency',
      canStart: false,
    });
  });

  it('only reviews sibling tasks when they are direct dependencies', () => {
    expect(evaluateSubtaskStart({
      targetTask: buildTask(),
      directSiblingDependencies: [
        buildTask({
          id: 'sibling_1',
          title: '前置评审',
          state: 'waiting_external',
        }),
      ],
    })).toMatchObject({
      outcome: 'blocked_by_dependency',
      reason: expect.stringContaining('前置评审'),
    });
  });

  it('requires pending parent decisions before starting', () => {
    expect(evaluateSubtaskStart({
      targetTask: buildTask(),
      pendingDecisionCount: 2,
    })).toMatchObject({
      outcome: 'needs_parent_decision',
      canStart: false,
    });
  });

  it('requires handoff review when the previous closeout is missing or contradictory', () => {
    expect(evaluateSubtaskStart({
      targetTask: buildTask(),
      previousTask: buildTask({ id: 'previous_1', title: '父任务阶段收尾' }),
      requiresPreviousHandoff: true,
      previousHandoffAvailable: false,
    })).toMatchObject({
      outcome: 'needs_handoff_review',
      canStart: false,
    });
  });

  it('checks context cleanliness before context sufficiency', () => {
    expect(evaluateSubtaskStart({
      targetTask: buildTask(),
      contextSignals: {
        activeTaskId: 'parent_1',
        inputPromptTaskId: 'parent_1',
      },
      availableContext: {
        taskState: true,
        taskMd: false,
        completionCriteria: false,
        nextStep: false,
      },
    })).toMatchObject({
      outcome: 'needs_context_refresh',
      contextClean: false,
      contextSufficient: false,
      missingContext: ['task_md', 'completion_criteria_or_next_step'],
    });
  });

  it('reports insufficient context after the runtime context is clean', () => {
    expect(evaluateSubtaskStart({
      targetTask: buildTask(),
      contextSignals: { activeTaskId: 'child_1' },
      availableContext: {
        taskState: true,
        taskMd: false,
        completionCriteria: false,
        nextStep: false,
      },
    })).toMatchObject({
      outcome: 'insufficient_context',
      contextClean: true,
      contextSufficient: false,
      missingContext: ['task_md', 'completion_criteria_or_next_step'],
    });
  });
});
