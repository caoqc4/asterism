import { describe, expect, it } from 'vitest';
import { buildRuntimeResumePlan, evaluateRuntimeHandoff } from './runtime-handoff.js';
import type { TaskCloseoutEvaluation } from './task-closeout-evaluator.js';

function closeout(overrides: Partial<TaskCloseoutEvaluation> = {}): TaskCloseoutEvaluation {
  return {
    outcome: 'handoff_to_existing_child',
    reason: '阶段已收尾，下一项可执行子任务是：子任务 A。',
    recordNeeded: true,
    nextTaskId: 'child-1',
    criteriaTotal: 1,
    criteriaSatisfied: 1,
    criteriaOpen: 0,
    runVerificationTone: 'pass',
    runVerificationLabel: '阶段收尾检查：交接到子任务',
    runVerificationDetail: '已找到可交接子任务：子任务 A',
    ...overrides,
  };
}

describe('runtime handoff', () => {
  it('blocks context refresh when specific handoff signal was not archived', () => {
    const result = evaluateRuntimeHandoff({
      intent: 'context_refresh',
      fromTaskId: 'task-1',
      messageCount: 3,
      hasSpecificHandoffSignal: true,
      archived: false,
    });

    expect(result.canProceed).toBe(false);
    expect(result.action).toBe('block');
    expect(result.requiresArchive).toBe(true);
  });

  it('allows context refresh after archive', () => {
    const result = evaluateRuntimeHandoff({
      intent: 'context_refresh',
      fromTaskId: 'task-1',
      messageCount: 3,
      hasSpecificHandoffSignal: true,
      archived: true,
    });

    expect(result.canProceed).toBe(true);
    expect(result.action).toBe('clear_same_task');
    expect(result.shouldClearMessages).toBe(true);
  });

  it('prompts task switch when the old task has low-signal chat', () => {
    const result = evaluateRuntimeHandoff({
      intent: 'switch_task',
      fromTaskId: 'task-1',
      toTaskId: 'task-2',
      messageCount: 1,
      hasSpecificHandoffSignal: false,
    });

    expect(result.canProceed).toBe(true);
    expect(result.action).toBe('prompt_switch');
    expect(result.requiresUserConfirmation).toBe(true);
  });

  it('requires archive before replaying a high-signal task-to-task handoff', () => {
    const blocked = evaluateRuntimeHandoff({
      intent: 'switch_task',
      fromTaskId: 'task-a',
      toTaskId: 'task-b',
      messageCount: 4,
      hasSpecificHandoffSignal: true,
      archived: false,
    });

    expect(blocked.canProceed).toBe(false);
    expect(blocked.action).toBe('block');
    expect(blocked.requiresArchive).toBe(true);

    const replayable = evaluateRuntimeHandoff({
      intent: 'switch_task',
      fromTaskId: 'task-a',
      toTaskId: 'task-b',
      messageCount: 4,
      hasSpecificHandoffSignal: true,
      archived: true,
    });

    expect(replayable.canProceed).toBe(true);
    expect(replayable.action).toBe('switch_task');
    expect(buildRuntimeResumePlan(replayable)).toMatchObject({
      taskId: 'task-b',
      contextMustBeReassembled: true,
      preservePreviousChat: false,
    });
  });

  it('hands off phase closeout to an existing child task', () => {
    const result = evaluateRuntimeHandoff({
      intent: 'phase_closeout',
      fromTaskId: 'parent-1',
      closeout: closeout(),
      recordPath: 'Task Records/phase.md',
    });

    expect(result.canProceed).toBe(true);
    expect(result.action).toBe('handoff_to_task');
    expect(result.toTaskId).toBe('child-1');
    expect(buildRuntimeResumePlan(result).source).toBe('handoff');
  });

  it('hands off phase closeout to an existing successor task', () => {
    const result = evaluateRuntimeHandoff({
      intent: 'phase_closeout',
      fromTaskId: 'task-1',
      closeout: closeout({
        outcome: 'handoff_to_existing_successor',
        nextTaskId: 'task-2',
        nextTaskKind: 'existing_successor',
        reason: '阶段已收尾，下一项可交接到已有后续任务：发布准备。',
      }),
      recordPath: 'Task Records/phase.md',
    });

    expect(result.canProceed).toBe(true);
    expect(result.action).toBe('handoff_to_task');
    expect(result.toTaskId).toBe('task-2');
    expect(result.notice).toBe('阶段收尾完成，准备交接到已有后续任务。');
  });

  it('keeps phase closeout in the same task when no child handoff is available', () => {
    const result = evaluateRuntimeHandoff({
      intent: 'phase_closeout',
      fromTaskId: 'task-1',
      closeout: closeout({
        outcome: 'continue_current_task',
        nextTaskId: undefined,
        reason: '仍有 1 条完成标准未满足。',
      }),
    });

    expect(result.canProceed).toBe(true);
    expect(result.action).toBe('clear_same_task');
    expect(result.toTaskId).toBe(null);
  });
});
