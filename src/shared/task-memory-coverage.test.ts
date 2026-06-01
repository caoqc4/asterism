import { describe, expect, it } from 'vitest';

import { evaluateBusinessMemoryCoverage } from './business-memory-coverage.js';
import { contextOwnerFromTaskContext, formatContextOwnerForSummary } from './context-owner.js';
import { buildTaskMemoryCoverageInputForTask, evaluateTaskMemoryCoverage } from './task-memory-coverage.js';

describe('task memory coverage', () => {
  it('detects Task.md from normalized task file paths', () => {
    expect(buildTaskMemoryCoverageInputForTask('run_start', {
      id: 'task-1',
      title: 'Task',
      summary: null,
      state: 'running',
      nextStep: null,
      waitingReason: null,
      riskLevel: 'none',
      riskNote: null,
      createdAt: '2026-05-15T01:00:00.000Z',
      updatedAt: '2026-05-15T01:00:00.000Z',
      activeWaitingItem: null,
      activeBlocker: null,
      artifacts: [],
      completionCriteria: [],
      sourceContexts: [],
      processTemplates: [],
      availableProcessTemplates: [],
      timeline: [],
      taskFiles: [{
        id: 'file-1',
        taskId: 'task-1',
        name: 'Task.md',
        path: ' Task.md ',
        kind: 'file',
        content: '# Task',
        createdAt: '2026-05-15T01:00:00.000Z',
        updatedAt: '2026-05-15T01:00:00.000Z',
      }],
    }).hasTaskMd).toBe(true);
  });

  it('detects relevant Task Records from normalized task file paths', () => {
    expect(buildTaskMemoryCoverageInputForTask('run_start', {
      id: 'task-1',
      title: 'Task',
      summary: null,
      state: 'running',
      nextStep: 'Continue',
      waitingReason: null,
      riskLevel: 'none',
      riskNote: null,
      createdAt: '2026-05-15T01:00:00.000Z',
      updatedAt: '2026-05-15T01:00:00.000Z',
      activeWaitingItem: null,
      activeBlocker: null,
      artifacts: [],
      completionCriteria: [],
      sourceContexts: [],
      processTemplates: [],
      availableProcessTemplates: [],
      timeline: [],
      taskFiles: [{
        id: 'file-1',
        taskId: 'task-1',
        name: 'handoff.md',
        path: ' Task Records\\handoff.md ',
        kind: 'file',
        content: '# Handoff',
        createdAt: '2026-05-15T01:00:00.000Z',
        updatedAt: '2026-05-15T01:00:00.000Z',
      }],
    })).toMatchObject({
      hasTaskMd: false,
      hasRelevantTaskRecord: true,
    });
  });

  it('does not count Task.md or Task Records as completion evidence files', () => {
    const input = buildTaskMemoryCoverageInputForTask('task_completion', {
      id: 'task-1',
      title: 'Task',
      summary: 'Ready to complete',
      state: 'running',
      nextStep: 'Complete',
      waitingReason: null,
      riskLevel: 'none',
      riskNote: null,
      createdAt: '2026-05-15T01:00:00.000Z',
      updatedAt: '2026-05-15T01:00:00.000Z',
      activeWaitingItem: null,
      activeBlocker: null,
      artifacts: [],
      completionCriteria: [{
        id: 'criteria-1',
        taskId: 'task-1',
        text: 'Done',
        verificationResponsibility: null,
        verificationResponsibilityLabel: null,
        status: 'satisfied',
        createdAt: '2026-05-15T01:00:00.000Z',
        updatedAt: '2026-05-15T01:00:00.000Z',
        satisfiedAt: '2026-05-15T01:00:00.000Z',
      }],
      sourceContexts: [],
      processTemplates: [],
      availableProcessTemplates: [],
      timeline: [],
      taskFiles: [
        {
          id: 'file-1',
          taskId: 'task-1',
          name: 'Task.md',
          path: 'Task.md',
          kind: 'file',
          content: '# Task',
          createdAt: '2026-05-15T01:00:00.000Z',
          updatedAt: '2026-05-15T01:00:00.000Z',
        },
        {
          id: 'file-2',
          taskId: 'task-1',
          name: 'handoff.md',
          path: 'Task Records/handoff.md',
          kind: 'file',
          content: '# Handoff',
          createdAt: '2026-05-15T01:00:00.000Z',
          updatedAt: '2026-05-15T01:00:00.000Z',
        },
      ],
    });

    expect(input).toMatchObject({
      hasImportantFilesOrSources: false,
      hasTaskMd: true,
      hasRelevantTaskRecord: true,
    });
    expect(evaluateTaskMemoryCoverage(input)).toMatchObject({
      outcome: 'needs_memory_write',
      recommendedWrites: ['run', 'source_digest', 'artifact_reference'],
    });
  });

  it('counts completed run events, but not failed run events, as completion evidence', () => {
    const baseTask = {
      id: 'task-1',
      title: 'Task',
      summary: 'Ready to complete',
      state: 'running' as const,
      nextStep: 'Complete',
      waitingReason: null,
      riskLevel: 'none' as const,
      riskNote: null,
      createdAt: '2026-05-15T01:00:00.000Z',
      updatedAt: '2026-05-15T01:00:00.000Z',
      activeWaitingItem: null,
      activeBlocker: null,
      artifacts: [],
      completionCriteria: [],
      sourceContexts: [],
      processTemplates: [],
      availableProcessTemplates: [],
      taskFiles: [],
    };

    expect(buildTaskMemoryCoverageInputForTask('task_completion', {
      ...baseTask,
      timeline: [{
        id: 'event-1',
        taskId: 'task-1',
        type: 'run.failed',
        payload: null,
        createdAt: '2026-05-15T01:00:00.000Z',
      }],
    })).toMatchObject({
      hasRecentRunEvidence: false,
    });
    expect(buildTaskMemoryCoverageInputForTask('task_completion', {
      ...baseTask,
      timeline: [{
        id: 'event-2',
        taskId: 'task-1',
        type: 'task.run_completed',
        payload: null,
        createdAt: '2026-05-15T01:01:00.000Z',
      }],
    })).toMatchObject({
      hasRecentRunEvidence: true,
    });
  });

  it('does not count stale run completion evidence older than completion criteria updates', () => {
    expect(buildTaskMemoryCoverageInputForTask('task_completion', {
      id: 'task-1',
      title: 'Task',
      summary: 'Ready to complete',
      state: 'running',
      nextStep: 'Complete',
      waitingReason: null,
      riskLevel: 'none',
      riskNote: null,
      createdAt: '2026-05-15T01:00:00.000Z',
      updatedAt: '2026-05-15T01:00:00.000Z',
      activeWaitingItem: null,
      activeBlocker: null,
      artifacts: [],
      completionCriteria: [{
        id: 'criteria-1',
        taskId: 'task-1',
        text: 'Done',
        verificationResponsibility: null,
        verificationResponsibilityLabel: null,
        status: 'satisfied',
        createdAt: '2026-05-15T01:00:00.000Z',
        updatedAt: '2026-05-15T01:03:00.000Z',
        satisfiedAt: '2026-05-15T01:03:00.000Z',
      }],
      sourceContexts: [],
      processTemplates: [],
      availableProcessTemplates: [],
      taskFiles: [],
      timeline: [{
        id: 'event-1',
        taskId: 'task-1',
        type: 'task.run_completed',
        payload: null,
        createdAt: '2026-05-15T01:01:00.000Z',
      }],
    })).toMatchObject({
      hasRecentRunEvidence: false,
    });
  });

  it('counts passed or overridden completion checks as completion evidence', () => {
    const baseTask = {
      id: 'task-1',
      title: 'Task',
      summary: 'Ready to complete',
      state: 'running' as const,
      nextStep: 'Complete',
      waitingReason: null,
      riskLevel: 'none' as const,
      riskNote: null,
      createdAt: '2026-05-15T01:00:00.000Z',
      updatedAt: '2026-05-15T01:00:00.000Z',
      activeWaitingItem: null,
      activeBlocker: null,
      artifacts: [],
      completionCriteria: [{
        id: 'criteria-1',
        taskId: 'task-1',
        text: 'Done',
        verificationResponsibility: null,
        verificationResponsibilityLabel: null,
        status: 'satisfied' as const,
        createdAt: '2026-05-15T01:00:00.000Z',
        updatedAt: '2026-05-15T01:00:00.000Z',
        satisfiedAt: '2026-05-15T01:00:00.000Z',
      }],
      sourceContexts: [],
      processTemplates: [],
      availableProcessTemplates: [],
      taskFiles: [],
    };

    const input = buildTaskMemoryCoverageInputForTask('task_completion', {
      ...baseTask,
      timeline: [{
        id: 'event-1',
        taskId: 'task-1',
        type: 'task.completion_check',
        payload: JSON.stringify({ action: 'override_completed' }),
        createdAt: '2026-05-15T01:01:00.000Z',
      }],
    });

    expect(input).toMatchObject({
      hasCompletionCheckEvidence: true,
    });
    expect(evaluateTaskMemoryCoverage(input)).toMatchObject({
      outcome: 'pass',
      canProceed: true,
    });
  });

  it('does not count stale completion checks older than completion criteria updates', () => {
    const input = buildTaskMemoryCoverageInputForTask('task_completion', {
      id: 'task-1',
      title: 'Task',
      summary: 'Ready to complete',
      state: 'running',
      nextStep: 'Complete',
      waitingReason: null,
      riskLevel: 'none',
      riskNote: null,
      createdAt: '2026-05-15T01:00:00.000Z',
      updatedAt: '2026-05-15T01:00:00.000Z',
      activeWaitingItem: null,
      activeBlocker: null,
      artifacts: [],
      completionCriteria: [{
        id: 'criteria-1',
        taskId: 'task-1',
        text: 'Done',
        verificationResponsibility: null,
        verificationResponsibilityLabel: null,
        status: 'satisfied',
        createdAt: '2026-05-15T01:00:00.000Z',
        updatedAt: '2026-05-15T01:03:00.000Z',
        satisfiedAt: '2026-05-15T01:03:00.000Z',
      }],
      sourceContexts: [],
      processTemplates: [],
      availableProcessTemplates: [],
      taskFiles: [],
      timeline: [{
        id: 'event-1',
        taskId: 'task-1',
        type: 'task.completion_check',
        payload: JSON.stringify({ action: 'passed' }),
        createdAt: '2026-05-15T01:01:00.000Z',
      }],
    });

    expect(input).toMatchObject({
      hasCompletionCheckEvidence: false,
    });
    expect(evaluateTaskMemoryCoverage(input)).toMatchObject({
      outcome: 'needs_memory_write',
      canProceed: false,
    });
  });

  it('treats global context as not applicable', () => {
    expect(evaluateTaskMemoryCoverage({
      action: 'context_clear',
      hasTaskContext: false,
      chatMessageCount: 4,
    })).toMatchObject({
      outcome: 'not_applicable',
      canProceed: true,
      canClearContext: true,
    });
  });

  it('requires user clarification before clearing low-signal task chat', () => {
    expect(evaluateTaskMemoryCoverage({
      action: 'context_clear',
      hasTaskContext: true,
      chatMessageCount: 3,
      hasSpecificHandoffSignal: false,
    })).toMatchObject({
      outcome: 'needs_user_clarification',
      canProceed: false,
      requiresUserClarification: true,
      recommendedWrites: [],
    });
  });

  it('requires a memory write before clearing recoverable task chat', () => {
    expect(evaluateTaskMemoryCoverage({
      action: 'context_clear',
      hasTaskContext: true,
      chatMessageCount: 3,
      hasSpecificHandoffSignal: true,
      memoryWriteCompleted: false,
    })).toMatchObject({
      outcome: 'needs_memory_write',
      canProceed: false,
      recommendedWrites: ['task_record'],
    });
  });

  it('allows context clearing after recoverable chat has been archived', () => {
    expect(evaluateTaskMemoryCoverage({
      action: 'context_clear',
      hasTaskContext: true,
      chatMessageCount: 3,
      hasSpecificHandoffSignal: true,
      memoryWriteCompleted: true,
    })).toMatchObject({
      outcome: 'pass',
      canProceed: true,
      canClearContext: true,
    });
  });

  it('requires recovery context and next step before task execution', () => {
    expect(evaluateTaskMemoryCoverage({
      action: 'run_start',
      hasTaskContext: true,
      hasTaskMd: false,
      hasNextStep: false,
    })).toMatchObject({
      outcome: 'needs_user_clarification',
      canStartExecution: false,
      missing: [
        '缺少 Task.md、相关 Task Record 或等价恢复摘要。',
        '缺少明确下一步。',
      ],
    });
  });

  it('allows task execution with a relevant Task Record and next step when Task.md is absent', () => {
    expect(evaluateTaskMemoryCoverage({
      action: 'run_start',
      hasTaskContext: true,
      hasTaskMd: false,
      hasRelevantTaskRecord: true,
      hasNextStep: true,
    })).toMatchObject({
      outcome: 'pass',
      canStartExecution: true,
    });
  });

  it('does not treat a title alone as an equivalent recovery summary', () => {
    expect(evaluateTaskMemoryCoverage({
      action: 'task_start',
      hasTaskContext: true,
      hasTaskMd: false,
      hasEquivalentRecoverySummary: false,
      hasNextStep: true,
    })).toMatchObject({
      outcome: 'needs_user_clarification',
      missing: ['缺少 Task.md、相关 Task Record 或等价恢复摘要。'],
    });
  });

  it('blocks execution when a pending decision exists', () => {
    expect(evaluateTaskMemoryCoverage({
      action: 'run_start',
      hasTaskContext: true,
      hasTaskMd: true,
      hasNextStep: true,
      hasOpenDecision: true,
    })).toMatchObject({
      outcome: 'blocked',
      canProceed: false,
      missing: ['存在待处理的用户判断或授权。'],
    });
  });
});

describe('business memory coverage', () => {
  it('normalizes global, business-line, next-action, and legacy-task owners', () => {
    expect(contextOwnerFromTaskContext({})).toEqual({ kind: 'global' });
    expect(contextOwnerFromTaskContext({ businessLineId: 'business_1' })).toEqual({
      businessLineId: 'business_1',
      kind: 'business_line',
    });
    expect(contextOwnerFromTaskContext({ businessLineId: 'business_1', taskId: 'task_1' })).toEqual({
      actionId: 'task_1',
      businessLineId: 'business_1',
      kind: 'next_action',
      taskId: 'task_1',
    });
    expect(contextOwnerFromTaskContext({ taskId: 'task_1' })).toEqual({
      kind: 'legacy_task',
      taskId: 'task_1',
    });
  });

  it('passes business-line coverage when durable business memory can recover the transition', () => {
    expect(evaluateBusinessMemoryCoverage({
      action: 'context_clear',
      owner: { kind: 'business_line', businessLineId: 'business_1' },
      chatMessageCount: 1,
      hasBusinessLineState: true,
      hasBusinessLineContextPack: true,
      hasNextSafeAction: true,
      hasRelevantBusinessRecord: true,
      hasSpecificHandoffSignal: true,
    })).toMatchObject({
      canClearContext: true,
      ownerSummary: 'business_line:business_1',
      preservationProofReady: true,
      status: 'pass',
    });
  });

  it('answers compact and reset readiness with action-specific flags', () => {
    const covered = {
      owner: { kind: 'business_line' as const, businessLineId: 'business_1' },
      hasBusinessLineState: true,
      hasBusinessLineContextPack: true,
      hasNextSafeAction: true,
      hasRelevantBusinessRecord: true,
    };

    expect(evaluateBusinessMemoryCoverage({
      ...covered,
      action: 'context_compact',
    })).toMatchObject({
      canCompact: true,
      canReset: false,
      status: 'pass',
    });
    expect(evaluateBusinessMemoryCoverage({
      ...covered,
      action: 'context_reset',
    })).toMatchObject({
      canCompact: false,
      canReset: true,
      status: 'pass',
    });
  });

  it('requires a Business Record when business-line chat has an uncovered recovery signal', () => {
    expect(evaluateBusinessMemoryCoverage({
      action: 'context_clear',
      owner: { kind: 'business_line', businessLineId: 'business_1' },
      chatMessageCount: 1,
      hasBusinessLineState: true,
      hasBusinessLineContextPack: true,
      hasNextSafeAction: true,
      hasRelevantBusinessRecord: false,
      hasSpecificHandoffSignal: true,
    })).toMatchObject({
      canClearContext: false,
      preservationProofReady: false,
      requiredWrites: ['business_record'],
      status: 'needs_memory_write',
    });
  });

  it('keeps low-signal business-line chat out of durable write requirements', () => {
    expect(evaluateBusinessMemoryCoverage({
      action: 'context_clear',
      owner: { kind: 'business_line', businessLineId: 'business_1' },
      chatMessageCount: 3,
      hasBusinessLineState: true,
      hasBusinessLineContextPack: true,
      hasNextSafeAction: true,
      hasRelevantBusinessRecord: false,
      hasSpecificHandoffSignal: false,
    })).toMatchObject({
      missing: ['Active business-line discussion has no specific recoverable signal yet.'],
      preservationProofReady: false,
      requiredWrites: [],
      status: 'needs_user_clarification',
    });
  });

  it('blocks business coverage when a Decision is pending', () => {
    expect(evaluateBusinessMemoryCoverage({
      action: 'context_reset',
      owner: { kind: 'business_line', businessLineId: 'business_1' },
      hasBusinessLineState: true,
      hasBusinessLineContextPack: true,
      hasNextSafeAction: true,
      hasOpenDecision: true,
      hasRelevantBusinessRecord: true,
    })).toMatchObject({
      canReset: false,
      missing: ['A pending Decision must be resolved before context transition.'],
      requiredWrites: ['decision'],
      status: 'blocked',
    });
  });

  it('covers a Next Action carrier with business memory plus execution carrier state', () => {
    const result = evaluateBusinessMemoryCoverage({
      action: 'handoff',
      owner: {
        actionId: 'action_1',
        businessLineId: 'business_1',
        kind: 'next_action',
        taskId: 'task_1',
      },
      hasBusinessLineState: true,
      hasBusinessLineContextPack: true,
      hasCurrentNextAction: true,
      hasNextSafeAction: true,
      hasRelevantReview: true,
    });

    expect(result).toMatchObject({
      canHandoff: true,
      ownerSummary: 'next_action:business_1:action=action_1:task=task_1',
      preservationProofReady: true,
      status: 'pass',
    });
    expect(formatContextOwnerForSummary(result.owner)).toBe(result.ownerSummary);
  });

  it('delegates legacy task coverage to existing task-memory gates', () => {
    expect(evaluateBusinessMemoryCoverage({
      action: 'run_start',
      owner: { kind: 'legacy_task', taskId: 'task_1' },
      taskMemoryCoverage: {
        action: 'run_start',
        hasTaskContext: true,
        hasTaskMd: false,
        hasNextStep: false,
      },
    })).toMatchObject({
      missing: [
        '缺少 Task.md、相关 Task Record 或等价恢复摘要。',
        '缺少明确下一步。',
      ],
      status: 'needs_user_clarification',
      taskMemoryCoverage: {
        outcome: 'needs_user_clarification',
      },
    });
  });

  it('treats global owner coverage as not applicable', () => {
    expect(evaluateBusinessMemoryCoverage({
      action: 'context_clear',
      owner: { kind: 'global' },
      chatMessageCount: 3,
    })).toMatchObject({
      canProceed: true,
      ownerSummary: 'global',
      status: 'not_applicable',
    });
  });
});
