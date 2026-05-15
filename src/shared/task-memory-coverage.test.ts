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

  it('requires recovery summary and next step before task execution', () => {
    expect(evaluateTaskMemoryCoverage({
      action: 'run_start',
      hasTaskContext: true,
      hasTaskMd: false,
      hasNextStep: false,
    })).toMatchObject({
      outcome: 'needs_user_clarification',
      canStartExecution: false,
      missing: [
        '缺少 Task.md 或等价恢复摘要。',
        '缺少明确下一步。',
      ],
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
      missing: ['缺少 Task.md 或等价恢复摘要。'],
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
