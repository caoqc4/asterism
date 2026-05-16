import { describe, expect, it } from 'vitest';

import { evaluateRuntimeVerification } from './runtime-verification.js';
import { evaluateRuntimeAction } from './runtime-action-evaluator.js';
import { buildRuntimeCapabilitySnapshot } from './runtime-capability-snapshot.js';
import type { RunRecord, RunStepRecord } from './types/run.js';
import type { TaskDetail, TaskListItemRecord } from './types/task.js';

const now = '2026-01-01T00:00:00.000Z';

function buildRun(partial: Partial<RunRecord> = {}): RunRecord {
  return {
    id: partial.id ?? 'run_1',
    taskId: partial.taskId ?? 'task_1',
    type: partial.type ?? 'agent',
    status: partial.status ?? 'completed',
    instructions: partial.instructions ?? null,
    output: partial.output ?? 'Run completed.',
    outputSource: partial.outputSource ?? 'ai',
    failureReason: partial.failureReason ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function buildStep(partial: Partial<RunStepRecord> = {}): RunStepRecord {
  return {
    id: partial.id ?? 'step_1',
    runId: partial.runId ?? 'run_1',
    index: partial.index ?? 1,
    kind: partial.kind ?? 'tool_result',
    status: partial.status ?? 'completed',
    title: partial.title ?? '生成报告',
    input: partial.input ?? null,
    output: 'output' in partial ? partial.output ?? null : 'report.md created',
    error: 'error' in partial ? partial.error ?? null : null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function buildTask(partial: Partial<TaskListItemRecord> = {}): TaskListItemRecord {
  return {
    id: partial.id ?? 'task_1',
    title: partial.title ?? '开发小程序',
    summary: partial.summary ?? null,
    taskType: partial.taskType,
    taskFacets: partial.taskFacets,
    parentTaskId: partial.parentTaskId,
    childTaskIds: partial.childTaskIds,
    state: partial.state ?? 'planned',
    nextStep: partial.nextStep ?? null,
    waitingReason: partial.waitingReason ?? null,
    riskLevel: partial.riskLevel ?? 'none',
    riskNote: partial.riskNote ?? null,
    activeWaitingItem: partial.activeWaitingItem ?? null,
    activeBlocker: partial.activeBlocker ?? null,
    activeDependency: partial.activeDependency ?? null,
    dependencyReevaluation: partial.dependencyReevaluation ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function buildDetail(partial: Partial<TaskDetail> = {}): TaskDetail {
  const base = buildTask(partial);
  return {
    ...base,
    artifacts: partial.artifacts ?? [],
    availableProcessTemplates: partial.availableProcessTemplates ?? [],
    completionCriteria: partial.completionCriteria ?? [],
    processTemplates: partial.processTemplates ?? [],
    sourceContexts: partial.sourceContexts ?? [],
    taskFiles: partial.taskFiles ?? [],
    timeline: partial.timeline ?? [],
    resumeCard: partial.resumeCard ?? {
      summary: '当前任务摘要',
      currentState: '推进中',
      latestChange: { summary: '最近更新', action: { label: null, targetType: null, targetId: null } },
      completionStatus: { total: 0, satisfied: 0, open: 0, summary: '尚未定义完成标准' },
      currentBlocker: { blockerId: null, title: '无', detail: null },
      keySource: { sourceContextId: null, title: '无', detail: null, priorityReason: null },
      currentMethod: { templateId: null, title: '无', detail: null, selectionReason: null },
      nextSuggestedMove: '继续推进',
    },
  };
}

describe('runtime verification', () => {
  it('normalizes run checks into runtime verification results', () => {
    expect(evaluateRuntimeVerification({
      mode: 'run',
      run: buildRun(),
      detail: { ...buildRun(), steps: [buildStep()] },
    })).toMatchObject({
      mode: 'run',
      tone: 'pass',
      canProceed: true,
      suggestedNextAction: 'continue',
    });
  });

  it('warns when a completed run still has pending task memory guidance', () => {
    expect(evaluateRuntimeVerification({
      mode: 'run',
      run: buildRun(),
      detail: {
        ...buildRun(),
        steps: [buildStep()],
        taskMemoryGuidance: {
          latestGuidanceAt: '2026-05-15T01:00:00.000Z',
          outcome: 'pending',
          pendingTargets: ['task_md'],
          reason: '最新任务记忆建议仍缺少对应写入：Task.md。',
          targets: ['task_md'],
        },
      },
    })).toMatchObject({
      mode: 'run',
      tone: 'warn',
      label: 'Run 任务记忆待处理',
      detail: '最新任务记忆建议仍缺少对应写入：Task.md。',
      canProceed: true,
      requiresUserConfirmation: true,
      suggestedNextAction: 'confirm',
    });
  });

  it('normalizes failed run steps into confirmation-oriented verification results', () => {
    expect(evaluateRuntimeVerification({
      mode: 'run_step',
      step: buildStep({ status: 'failed', error: '命令失败' }),
    })).toMatchObject({
      mode: 'run_step',
      tone: 'fail',
      canProceed: false,
      requiresUserConfirmation: true,
      shouldPersistTaskRecord: true,
      suggestedNextAction: 'confirm',
    });
  });

  it('blocks pre-step execution when the runtime action is not allowed', () => {
    expect(evaluateRuntimeVerification({
      mode: 'pre_step',
      action: evaluateRuntimeAction({
        action: 'run_start',
        fromTaskId: null,
      }),
    })).toMatchObject({
      mode: 'pre_step',
      tone: 'fail',
      canProceed: false,
      suggestedNextAction: 'inspect',
    });
  });

  it('requires confirmation before pre-step execution with pending decisions', () => {
    expect(evaluateRuntimeVerification({
      mode: 'pre_step',
      action: evaluateRuntimeAction({
        action: 'run_start',
        fromTaskId: 'task_1',
      }),
      hasPendingDecision: true,
    })).toMatchObject({
      mode: 'pre_step',
      tone: 'warn',
      canProceed: false,
      requiresUserConfirmation: true,
      suggestedNextAction: 'confirm',
    });
  });

  it('blocks pre-step execution when task memory coverage is insufficient', () => {
    expect(evaluateRuntimeVerification({
      mode: 'pre_step',
      action: evaluateRuntimeAction({
        action: 'run_start',
        fromTaskId: 'task_1',
      }),
      taskMemoryCoverage: {
        action: 'run_start',
        outcome: 'needs_user_clarification',
        canProceed: false,
        canClearContext: false,
        canStartExecution: false,
        requiresUserClarification: true,
        recommendedWrites: [],
        missing: ['缺少明确下一步。'],
        reason: '任务开始前的恢复信息不足，应先补齐最小上下文再执行。',
      },
    })).toMatchObject({
      mode: 'pre_step',
      tone: 'warn',
      label: '执行前任务记忆不足',
      canProceed: false,
      requiresUserConfirmation: true,
      suggestedNextAction: 'confirm',
      taskMemoryCoverage: {
        outcome: 'needs_user_clarification',
      },
    });
  });

  it('blocks pre-step execution when task memory guidance is still pending', () => {
    expect(evaluateRuntimeVerification({
      mode: 'pre_step',
      action: evaluateRuntimeAction({
        action: 'run_start',
        fromTaskId: 'task_1',
      }),
      taskMemoryGuidance: {
        latestGuidanceAt: '2026-05-15T01:00:00.000Z',
        outcome: 'pending',
        pendingTargets: ['task_record'],
        reason: '最新任务记忆建议仍缺少对应写入：Task Record。',
        targets: ['task_record'],
      },
    })).toMatchObject({
      mode: 'pre_step',
      tone: 'warn',
      label: '执行前任务记忆待处理',
      canProceed: false,
      shouldPersistTaskRecord: true,
      suggestedNextAction: 'handoff',
    });
  });

  it('blocks model-required pre-step execution when model capability is missing', () => {
    expect(evaluateRuntimeVerification({
      mode: 'pre_step',
      action: evaluateRuntimeAction({
        action: 'run_start',
        fromTaskId: 'task_1',
      }),
      capabilities: buildRuntimeCapabilitySnapshot({
        aiStatus: {
          configured: false,
          apiKeyStored: false,
          apiKeySource: null,
          provider: null,
          model: null,
          baseUrl: null,
          workspaceRoot: null,
          updatedAt: null,
          configPath: null,
          featureFlags: { enableScheduler: false },
        },
      }),
      requiresModelExecution: true,
    })).toMatchObject({
      mode: 'pre_step',
      tone: 'fail',
      label: '执行前缺少模型能力',
      canProceed: false,
      suggestedNextAction: 'inspect',
    });
  });

  it('requires confirmation when workspace verification capability is missing', () => {
    expect(evaluateRuntimeVerification({
      mode: 'pre_step',
      action: evaluateRuntimeAction({
        action: 'run_start',
        fromTaskId: 'task_1',
      }),
      capabilities: buildRuntimeCapabilitySnapshot({
        aiStatus: {
          configured: true,
          apiKeyStored: true,
          apiKeySource: 'env',
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-latest',
          baseUrl: null,
          workspaceRoot: '/repo',
          updatedAt: '2026-01-01T00:00:00.000Z',
          configPath: '/config.json',
          featureFlags: { enableScheduler: false },
          codeAgentWorkspaceChecks: {
            lint: { available: false, reason: 'missing' },
            test: { available: false, reason: 'missing' },
          },
        },
      }),
      requiresWorkspaceVerification: true,
    })).toMatchObject({
      mode: 'pre_step',
      tone: 'warn',
      label: '执行前缺少工作区校验能力',
      canProceed: false,
      requiresUserConfirmation: true,
      suggestedNextAction: 'confirm',
    });
  });

  it('allows confirmation-gated pre-step execution after explicit confirmation', () => {
    expect(evaluateRuntimeVerification({
      mode: 'pre_step',
      action: evaluateRuntimeAction({
        action: 'task_file_write_proposal',
        fromTaskId: 'task_1',
        messageCount: 1,
      }),
      confirmationSatisfied: true,
    })).toMatchObject({
      mode: 'pre_step',
      tone: 'pass',
      canProceed: true,
      requiresUserConfirmation: false,
      suggestedNextAction: 'continue',
    });
  });

  it('requires a task record after durable post-step changes without recovery notes', () => {
    expect(evaluateRuntimeVerification({
      mode: 'post_step',
      step: buildStep({ status: 'completed', output: 'updated Task.md' }),
      producedDurableChange: true,
      hasTaskRecord: false,
    })).toMatchObject({
      mode: 'post_step',
      tone: 'warn',
      canProceed: false,
      shouldPersistTaskRecord: true,
      suggestedNextAction: 'handoff',
    });
  });

  it('normalizes subtask-start readiness into runtime verification', () => {
    expect(evaluateRuntimeVerification({
      mode: 'subtask_start',
      targetTask: buildTask({ id: 'child_1', parentTaskId: 'parent_1' }),
      parentTask: buildTask({ id: 'parent_1', title: '开发小程序' }),
      expectedParentTaskId: 'parent_1',
      contextSignals: {
        activeTaskId: 'child_1',
        inputPromptTaskId: 'child_1',
      },
      availableContext: {
        taskState: true,
        taskMd: true,
        completionCriteria: true,
        nextStep: true,
        parentConstraints: true,
      },
    })).toMatchObject({
      mode: 'subtask_start',
      tone: 'pass',
      canProceed: true,
      suggestedNextAction: 'continue',
      subtaskStart: {
        outcome: 'ready_to_start',
        contextClean: true,
        contextSufficient: true,
      },
    });
  });

  it('requires context refresh before a subtask starts from stale runtime state', () => {
    expect(evaluateRuntimeVerification({
      mode: 'subtask_start',
      targetTask: buildTask({ id: 'child_1', parentTaskId: 'parent_1' }),
      expectedParentTaskId: 'parent_1',
      contextSignals: {
        activeTaskId: 'parent_1',
        inputPromptTaskId: 'parent_1',
      },
      availableContext: {
        taskState: true,
        taskMd: true,
        completionCriteria: true,
        nextStep: true,
      },
    })).toMatchObject({
      mode: 'subtask_start',
      tone: 'fail',
      canProceed: false,
      suggestedNextAction: 'inspect',
      subtaskStart: {
        outcome: 'needs_context_refresh',
        contextClean: false,
      },
    });
  });

  it('maps phase closeout with an existing child to a handoff action', () => {
    expect(evaluateRuntimeVerification({
      mode: 'task_closeout',
      intent: 'phase_closeout',
      task: buildDetail(),
      childTasks: [buildTask({ id: 'child_1', title: '需求分析' })],
    })).toMatchObject({
      mode: 'task_closeout',
      tone: 'pass',
      canProceed: true,
      suggestedNextAction: 'handoff',
      taskCloseout: {
        outcome: 'handoff_to_existing_child',
        nextTaskId: 'child_1',
      },
    });
  });

  it('maps phase closeout with an existing successor to a handoff action', () => {
    expect(evaluateRuntimeVerification({
      mode: 'task_closeout',
      intent: 'phase_closeout',
      task: buildDetail(),
      successorTasks: [buildTask({ id: 'task_2', title: '发布准备' })],
    })).toMatchObject({
      mode: 'task_closeout',
      tone: 'pass',
      canProceed: true,
      suggestedNextAction: 'handoff',
      taskCloseout: {
        outcome: 'handoff_to_existing_successor',
        nextTaskId: 'task_2',
      },
    });
  });

  it('requires confirmation before closeout can create proposed follow-up tasks', () => {
    expect(evaluateRuntimeVerification({
      mode: 'task_closeout',
      intent: 'phase_closeout',
      task: buildDetail(),
      proposedFollowUpTasks: [{ title: '继续优化' }],
    })).toMatchObject({
      mode: 'task_closeout',
      tone: 'warn',
      canProceed: false,
      requiresUserConfirmation: true,
      suggestedNextAction: 'confirm',
      taskCloseout: {
        outcome: 'needs_follow_up_confirmation',
        followUpProposalAllowed: false,
      },
    });
  });

  it('blocks context clearing when active task discussion has no handoff signal', () => {
    expect(evaluateRuntimeVerification({
      mode: 'context_clear',
      hasTaskContext: true,
      messageCount: 3,
      hasSpecificHandoffSignal: false,
    })).toMatchObject({
      tone: 'warn',
      canProceed: false,
      requiresUserConfirmation: true,
      shouldPersistTaskRecord: false,
      suggestedNextAction: 'wait',
    });
  });

  it('flags projects without child structure before execution', () => {
    expect(evaluateRuntimeVerification({
      mode: 'project',
      task: buildDetail({ taskType: 'project' }),
      childTasks: [],
    })).toMatchObject({
      tone: 'pending',
      canProceed: false,
      suggestedNextAction: 'continue',
      project: {
        outcome: 'missing_structure',
        childTotal: 0,
      },
    });
  });

  it('keeps projects open while child tasks remain unfinished', () => {
    expect(evaluateRuntimeVerification({
      mode: 'project',
      task: buildDetail({ taskType: 'project' }),
      childTasks: [
        buildTask({ id: 'child_1', title: '需求分析', state: 'completed' }),
        buildTask({ id: 'child_2', title: '实现开发', state: 'planned' }),
      ],
    })).toMatchObject({
      tone: 'pending',
      canProceed: false,
      project: {
        outcome: 'continue_children',
        childCompleted: 1,
        childOpen: 1,
      },
    });
  });

  it('blocks project completion when child tasks are waiting or blocked', () => {
    expect(evaluateRuntimeVerification({
      mode: 'project',
      task: buildDetail({ taskType: 'project' }),
      childTasks: [
        buildTask({
          id: 'child_1',
          title: '安全评审',
          state: 'waiting_external',
          waitingReason: '等待安全确认',
        }),
      ],
    })).toMatchObject({
      tone: 'warn',
      canProceed: false,
      requiresUserConfirmation: true,
      suggestedNextAction: 'wait',
      project: {
        outcome: 'blocked_or_waiting',
        waitingCount: 1,
      },
    });
  });

  it('allows project completion when children and parent criteria are done', () => {
    expect(evaluateRuntimeVerification({
      mode: 'project',
      task: buildDetail({
        taskType: 'project',
        resumeCard: {
          ...buildDetail().resumeCard,
          completionStatus: { total: 1, satisfied: 1, open: 0, summary: '完成' },
        },
      }),
      childTasks: [
        buildTask({ id: 'child_1', title: '需求分析', state: 'completed' }),
        buildTask({ id: 'child_2', title: '实现开发', state: 'completed' }),
      ],
    })).toMatchObject({
      tone: 'pass',
      canProceed: true,
      suggestedNextAction: 'complete',
      project: {
        outcome: 'ready_to_complete',
        childCompleted: 2,
        criteriaOpen: 0,
      },
    });
  });

  it('requires confirmation when completed projects have no evidence counts', () => {
    expect(evaluateRuntimeVerification({
      mode: 'project',
      task: buildDetail({
        taskType: 'project',
        resumeCard: {
          ...buildDetail().resumeCard,
          completionStatus: { total: 1, satisfied: 1, open: 0, summary: '完成' },
        },
      }),
      childTasks: [
        buildTask({ id: 'child_1', title: '需求分析', state: 'completed' }),
      ],
      artifactCount: 0,
      keySourceCount: 0,
    })).toMatchObject({
      tone: 'warn',
      canProceed: false,
      requiresUserConfirmation: true,
      suggestedNextAction: 'confirm',
      project: {
        outcome: 'needs_user_confirmation',
        artifactCount: 0,
        keySourceCount: 0,
      },
    });
  });

  it('includes pending decision counts in project verification', () => {
    expect(evaluateRuntimeVerification({
      mode: 'project',
      task: buildDetail({
        taskType: 'project',
        resumeCard: {
          ...buildDetail().resumeCard,
          completionStatus: { total: 1, satisfied: 1, open: 0, summary: '完成' },
        },
      }),
      childTasks: [
        buildTask({ id: 'child_1', title: '需求分析', state: 'completed' }),
      ],
      artifactCount: 1,
      keySourceCount: 1,
      pendingDecisionCount: 2,
    })).toMatchObject({
      tone: 'warn',
      project: {
        outcome: 'needs_user_confirmation',
        pendingDecisionCount: 2,
      },
    });
  });
});
