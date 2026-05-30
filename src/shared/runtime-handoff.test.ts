import { describe, expect, it } from 'vitest';
import {
  buildRuntimeHandoffPreview,
  buildRuntimeResumePlan,
  evaluateRuntimeHandoff,
} from './runtime-handoff.js';
import type { TaskCloseoutEvaluation } from './task-closeout-evaluator.js';
import type { TaskListItemRecord } from './types/task.js';

const now = '2026-01-01T00:00:00.000Z';

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

function task(overrides: Partial<TaskListItemRecord> = {}): TaskListItemRecord {
  return {
    id: overrides.id ?? 'child-1',
    title: overrides.title ?? '子任务 A',
    summary: overrides.summary ?? null,
    taskType: overrides.taskType,
    taskFacets: overrides.taskFacets,
    parentTaskId: overrides.parentTaskId ?? 'parent-1',
    childTaskIds: overrides.childTaskIds,
    state: overrides.state ?? 'planned',
    nextStep: overrides.nextStep ?? '继续推进',
    waitingReason: overrides.waitingReason ?? null,
    riskLevel: overrides.riskLevel ?? 'none',
    riskNote: overrides.riskNote ?? null,
    activeWaitingItem: overrides.activeWaitingItem ?? null,
    activeBlocker: overrides.activeBlocker ?? null,
    activeDependency: overrides.activeDependency ?? null,
    dependencyReevaluation: overrides.dependencyReevaluation ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
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
    expect(result.handoffType).toBe('ephemeral_session_handoff');
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
    expect(result.autoContextClear).toMatchObject({
      outcome: 'safe_to_clear',
      shouldAutoClear: true,
    });
  });

  it('blocks context refresh when task memory guidance is still pending', () => {
    const result = evaluateRuntimeHandoff({
      intent: 'context_refresh',
      fromTaskId: 'task-1',
      messageCount: 3,
      hasSpecificHandoffSignal: true,
      archived: true,
      hasPendingRecoveryGuidance: true,
    });

    expect(result.canProceed).toBe(false);
    expect(result.action).toBe('block');
    expect(result.autoContextClear).toMatchObject({
      outcome: 'needs_memory_write',
      shouldAsk: true,
    });
  });

  it('blocks context refresh from structured pending memory guidance state', () => {
    const result = evaluateRuntimeHandoff({
      intent: 'context_refresh',
      fromTaskId: 'task-1',
      messageCount: 3,
      hasSpecificHandoffSignal: true,
      archived: true,
      taskMemoryGuidance: {
        latestGuidanceAt: '2026-05-15T01:00:00.000Z',
        outcome: 'pending',
        pendingTargets: ['task_record'],
        reason: '最新任务记忆建议仍缺少对应写入：Task Record。',
        targets: ['task_record'],
      },
    });

    expect(result.canProceed).toBe(false);
    expect(result.autoContextClear).toMatchObject({
      outcome: 'needs_memory_write',
      reason: '最新任务记忆建议仍缺少对应写入：Task Record。',
    });
  });

  it('blocks context refresh while short-term reasoning is active', () => {
    const result = evaluateRuntimeHandoff({
      intent: 'context_refresh',
      fromTaskId: 'task-1',
      messageCount: 3,
      hasSpecificHandoffSignal: true,
      archived: true,
      shortTermReasoningActive: true,
    });

    expect(result.canProceed).toBe(false);
    expect(result.autoContextClear).toMatchObject({
      outcome: 'keep_context',
      shouldKeep: true,
    });
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

  it('blocks task switch when task memory guidance is still pending', () => {
    const result = evaluateRuntimeHandoff({
      intent: 'switch_task',
      fromTaskId: 'task-1',
      toTaskId: 'task-2',
      messageCount: 1,
      hasSpecificHandoffSignal: false,
      archived: true,
      taskMemoryGuidance: {
        latestGuidanceAt: '2026-05-15T01:00:00.000Z',
        outcome: 'pending',
        pendingTargets: ['task_record'],
        reason: '最新任务记忆建议仍缺少对应写入：Task Record。',
        targets: ['task_record'],
      },
    });

    expect(result.canProceed).toBe(false);
    expect(result.action).toBe('block');
    expect(result.autoContextClear).toMatchObject({
      outcome: 'needs_memory_write',
      reason: '最新任务记忆建议仍缺少对应写入：Task Record。',
    });
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
    expect(result.handoffType).toBe('next_action_handoff');
    expect(result.toTaskId).toBe('child-1');
    expect(buildRuntimeResumePlan(result).source).toBe('handoff');
  });

  it('blocks phase closeout handoff when task memory guidance is still pending', () => {
    const result = evaluateRuntimeHandoff({
      intent: 'phase_closeout',
      fromTaskId: 'parent-1',
      closeout: closeout(),
      recordPath: 'Task Records/phase.md',
      taskMemoryGuidance: {
        latestGuidanceAt: '2026-05-15T01:00:00.000Z',
        outcome: 'pending',
        pendingTargets: ['task_md'],
        reason: '最新任务记忆建议仍缺少对应写入：Task.md。',
        targets: ['task_md'],
      },
    });

    expect(result.canProceed).toBe(false);
    expect(result.action).toBe('block');
    expect(result.handoffType).toBe('next_action_handoff');
    expect(result.autoContextClear).toMatchObject({
      outcome: 'needs_memory_write',
      reason: '最新任务记忆建议仍缺少对应写入：Task.md。',
    });
  });

  it('blocks run resume when a pending user decision still owns the boundary', () => {
    const result = evaluateRuntimeHandoff({
      intent: 'resume_run',
      fromTaskId: 'task-1',
      hasOpenDecision: true,
    });

    expect(result.canProceed).toBe(false);
    expect(result.action).toBe('block');
    expect(result.handoffType).toBe('runtime_or_subagent_handoff');
    expect(result.autoContextClear).toMatchObject({
      outcome: 'needs_user_decision',
      shouldAsk: true,
    });
  });

  it('blocks run resume when the task still has an active blocker', () => {
    const result = evaluateRuntimeHandoff({
      intent: 'resume_run',
      fromTaskId: 'task-1',
      hasBlocker: true,
    });

    expect(result.canProceed).toBe(false);
    expect(result.action).toBe('block');
    expect(result.autoContextClear).toMatchObject({
      outcome: 'keep_context',
      shouldKeep: true,
    });
  });

  it('can attach subtask start readiness to a handoff resume plan', () => {
    const handoff = evaluateRuntimeHandoff({
      intent: 'phase_closeout',
      fromTaskId: 'parent-1',
      closeout: closeout(),
      recordPath: 'Task Records/phase.md',
    });

    const plan = buildRuntimeResumePlan(handoff, {
      subtaskStartInput: {
        targetTask: task({ id: 'child-1', parentTaskId: 'parent-1' }),
        parentTask: task({ id: 'parent-1', parentTaskId: null, title: '父任务' }),
        expectedParentTaskId: 'parent-1',
        contextSignals: { activeTaskId: 'child-1' },
        availableContext: {
          taskState: true,
          taskMd: true,
          completionCriteria: true,
          nextStep: true,
          parentConstraints: true,
        },
      },
    });

    expect(plan).toMatchObject({
      taskId: 'child-1',
      source: 'handoff',
      subtaskStart: {
        canProceed: true,
        label: '子任务启动检查通过',
        suggestedNextAction: 'continue',
      },
      nextAction: '进入目标任务并重新装配上下文。',
    });
  });

  it('keeps handoff resume blocked when the target subtask start context is stale', () => {
    const handoff = evaluateRuntimeHandoff({
      intent: 'phase_closeout',
      fromTaskId: 'parent-1',
      closeout: closeout(),
      recordPath: 'Task Records/phase.md',
    });

    const plan = buildRuntimeResumePlan(handoff, {
      subtaskStartInput: {
        targetTask: task({ id: 'child-1', parentTaskId: 'parent-1' }),
        expectedParentTaskId: 'parent-1',
        contextSignals: { activeTaskId: 'parent-1', inputPromptTaskId: 'parent-1' },
        availableContext: {
          taskState: true,
          taskMd: true,
          completionCriteria: true,
          nextStep: true,
        },
      },
    });

    expect(plan).toMatchObject({
      taskId: 'child-1',
      subtaskStart: {
        canProceed: false,
        label: '子任务启动前需刷新上下文',
        suggestedNextAction: 'inspect',
      },
      nextAction: '先处理子任务启动检查，再进入目标任务。',
    });
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

  it('does not clear phase closeout when the closeout result still has a blocker handoff', () => {
    const result = evaluateRuntimeHandoff({
      intent: 'phase_closeout',
      fromTaskId: 'task-1',
      closeout: closeout({
        outcome: 'pause_with_handoff',
        nextTaskId: undefined,
        reason: '当前仍有阻塞项：等待评审。',
      }),
      recordPath: 'Task Records/phase.md',
    });

    expect(result).toMatchObject({
      canProceed: false,
      action: 'block',
      requiresUserConfirmation: false,
      shouldClearMessages: false,
      recordPath: 'Task Records/phase.md',
    });
  });

  it('does not clear phase closeout when user confirmation is required', () => {
    const result = evaluateRuntimeHandoff({
      intent: 'phase_closeout',
      fromTaskId: 'task-1',
      closeout: closeout({
        outcome: 'needs_user_confirmation',
        nextTaskId: undefined,
        reason: '任务风险为 medium，完成或交接前需要用户确认。',
      }),
      recordPath: 'Task Records/phase.md',
    });

    expect(result).toMatchObject({
      canProceed: false,
      action: 'block',
      requiresUserConfirmation: true,
      shouldClearMessages: false,
      recordPath: 'Task Records/phase.md',
    });
  });

  it('blocks run resume when task memory guidance is still pending', () => {
    const result = evaluateRuntimeHandoff({
      intent: 'resume_run',
      fromTaskId: 'task-1',
      taskMemoryGuidance: {
        latestGuidanceAt: '2026-05-15T01:00:00.000Z',
        outcome: 'pending',
        pendingTargets: ['task_md'],
        reason: '最新任务记忆建议仍缺少对应写入：Task.md。',
        targets: ['task_md'],
      },
    });

    expect(result.canProceed).toBe(false);
    expect(result.action).toBe('block');
    expect(result.autoContextClear).toMatchObject({
      outcome: 'needs_memory_write',
      reason: '最新任务记忆建议仍缺少对应写入：Task.md。',
    });
  });

  it('builds a reusable context refresh preview from the handoff result', () => {
    const handoff = evaluateRuntimeHandoff({
      intent: 'context_refresh',
      fromTaskId: 'task-1',
      messageCount: 2,
      hasSpecificHandoffSignal: true,
      archived: true,
    });

    expect(buildRuntimeHandoffPreview(handoff, {
      archived: true,
      messageCount: 2,
      recentFocus: ['确认方案 A', '遗留风险 B'],
      recordPath: 'Task Records/context-refresh.md',
    })).toEqual({
      canPreview: true,
      title: '已刷新当前任务会话。',
      detail: '归档摘要：用户消息 2 条；最近关注：确认方案 A / 遗留风险 B。 记录：Task Records/context-refresh.md',
      nextAction: '刷新当前任务上下文。',
    });
  });

  it('explains why a blocked handoff cannot be previewed as ready', () => {
    const handoff = evaluateRuntimeHandoff({
      intent: 'context_refresh',
      fromTaskId: 'task-1',
      messageCount: 2,
      hasSpecificHandoffSignal: true,
      archived: false,
    });

    expect(buildRuntimeHandoffPreview(handoff, {
      archived: false,
      messageCount: 2,
    })).toMatchObject({
      canPreview: false,
      title: '上下文暂不能安全交接。',
    });
  });
});
