import { describe, expect, it } from 'vitest';

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
