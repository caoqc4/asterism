import { describe, expect, it } from 'vitest';

import { evaluateAutoContextClearReadiness } from './auto-context-clear-readiness.js';

describe('auto context clear readiness', () => {
  it('treats global context as not applicable', () => {
    expect(evaluateAutoContextClearReadiness({
      hasTaskContext: false,
      chatMessageCount: 12,
    })).toMatchObject({
      outcome: 'not_applicable',
      shouldAutoClear: false,
      shouldAsk: false,
      shouldKeep: false,
    });
  });

  it('uses business owner coverage instead of treating business-line chat as global', () => {
    expect(evaluateAutoContextClearReadiness({
      owner: { kind: 'business_line', businessLineId: 'business_1' },
      hasTaskContext: false,
      chatMessageCount: 1,
      hasBusinessLineState: true,
      hasBusinessLineContextPack: true,
      hasNextSafeAction: true,
      hasSpecificHandoffSignal: true,
    })).toMatchObject({
      outcome: 'needs_memory_write',
      shouldAsk: true,
      businessMemoryCoverage: {
        ownerSummary: 'business_line:business_1',
        requiredWrites: ['business_record'],
        status: 'needs_memory_write',
      },
      contextTransition: {
        handoffType: 'durable_business_handoff',
      },
    });
  });

  it('allows business owner clear after business memory coverage passes', () => {
    expect(evaluateAutoContextClearReadiness({
      owner: { kind: 'business_line', businessLineId: 'business_1' },
      hasTaskContext: false,
      chatMessageCount: 1,
      hasBusinessLineState: true,
      hasBusinessLineContextPack: true,
      hasNextSafeAction: true,
      hasRelevantBusinessRecord: true,
      hasSpecificHandoffSignal: true,
    })).toMatchObject({
      outcome: 'safe_to_clear',
      shouldAutoClear: true,
      businessMemoryCoverage: {
        canClearContext: true,
        status: 'pass',
      },
    });
  });

  it('does not let next-action owners bypass task-memory gates when task context flag is false', () => {
    expect(evaluateAutoContextClearReadiness({
      owner: {
        actionId: 'action_1',
        businessLineId: 'business_1',
        kind: 'next_action',
        taskId: 'task_1',
      },
      hasTaskContext: false,
      chatMessageCount: 3,
      hasBusinessLineState: true,
      hasBusinessLineContextPack: true,
      hasCurrentNextAction: true,
      hasNextSafeAction: true,
      hasRelevantBusinessRecord: true,
      hasSpecificHandoffSignal: false,
    })).toMatchObject({
      outcome: 'keep_context',
      taskMemoryCoverage: {
        outcome: 'needs_user_clarification',
      },
      businessMemoryCoverage: {
        ownerSummary: 'next_action:business_1:action=action_1:task=task_1',
        status: 'needs_user_clarification',
        taskMemoryCoverage: {
          outcome: 'needs_user_clarification',
        },
      },
    });
  });

  it('does not let legacy-task owners bypass task-memory gates when task context flag is false', () => {
    expect(evaluateAutoContextClearReadiness({
      owner: { kind: 'legacy_task', taskId: 'task_1' },
      hasTaskContext: false,
      chatMessageCount: 3,
      hasSpecificHandoffSignal: true,
      memoryWriteCompleted: false,
    })).toMatchObject({
      outcome: 'needs_memory_write',
      shouldAsk: true,
      taskMemoryCoverage: {
        outcome: 'needs_memory_write',
      },
      businessMemoryCoverage: {
        ownerSummary: 'legacy_task:task_1',
        status: 'needs_memory_write',
        taskMemoryCoverage: {
          outcome: 'needs_memory_write',
        },
      },
    });
  });

  it('does not clear low-signal task chat just because message count is high', () => {
    expect(evaluateAutoContextClearReadiness({
      hasTaskContext: true,
      chatMessageCount: 48,
      hasSpecificHandoffSignal: false,
    })).toMatchObject({
      outcome: 'keep_context',
      shouldAutoClear: false,
      shouldAsk: false,
      shouldKeep: true,
    });
  });

  it('requires memory write before clearing recoverable task chat', () => {
    expect(evaluateAutoContextClearReadiness({
      hasTaskContext: true,
      chatMessageCount: 2,
      hasSpecificHandoffSignal: true,
      memoryWriteCompleted: false,
    })).toMatchObject({
      outcome: 'needs_memory_write',
      shouldAutoClear: false,
      shouldAsk: true,
      shouldKeep: false,
    });
  });

  it('uses preservation signals from messages instead of only message-count heuristics', () => {
    expect(evaluateAutoContextClearReadiness({
      hasTaskContext: true,
      chatMessageCount: 2,
      messages: [
        { role: 'user', text: '目标是做 Codex 基础教程站，下一步先调研官方文档。' },
      ],
    })).toMatchObject({
      outcome: 'needs_memory_write',
      shouldAsk: true,
      contextTransition: {
        action: 'preserve_and_reset',
        preservation: {
          status: 'needs_write',
          hasValuableSignals: true,
        },
      },
    });
  });

  it('allows auto clear after recoverable signals are written', () => {
    expect(evaluateAutoContextClearReadiness({
      hasTaskContext: true,
      chatMessageCount: 2,
      hasSpecificHandoffSignal: true,
      memoryWriteCompleted: true,
    })).toMatchObject({
      outcome: 'safe_to_clear',
      shouldAutoClear: true,
      shouldAsk: false,
      shouldKeep: false,
    });
  });

  it('asks for user decision before clearing when a decision is pending', () => {
    expect(evaluateAutoContextClearReadiness({
      hasTaskContext: true,
      chatMessageCount: 2,
      hasSpecificHandoffSignal: true,
      memoryWriteCompleted: true,
      hasOpenDecision: true,
    })).toMatchObject({
      outcome: 'needs_user_decision',
      shouldAutoClear: false,
      shouldAsk: true,
    });
  });

  it('keeps context when blocker state is still active', () => {
    expect(evaluateAutoContextClearReadiness({
      hasTaskContext: true,
      chatMessageCount: 2,
      hasSpecificHandoffSignal: true,
      memoryWriteCompleted: true,
      hasBlocker: true,
    })).toMatchObject({
      outcome: 'keep_context',
      shouldKeep: true,
    });
  });

  it('keeps context while short-term reasoning is active', () => {
    expect(evaluateAutoContextClearReadiness({
      hasTaskContext: true,
      chatMessageCount: 2,
      hasSpecificHandoffSignal: true,
      memoryWriteCompleted: true,
      shortTermReasoningActive: true,
    })).toMatchObject({
      outcome: 'keep_context',
      shouldAutoClear: false,
      shouldKeep: true,
    });
  });

  it('asks before clearing when task memory guidance is still pending', () => {
    expect(evaluateAutoContextClearReadiness({
      hasTaskContext: true,
      chatMessageCount: 2,
      hasSpecificHandoffSignal: true,
      memoryWriteCompleted: true,
      hasPendingRecoveryGuidance: true,
    })).toMatchObject({
      outcome: 'needs_memory_write',
      shouldAsk: true,
    });
  });

  it('uses structured task memory guidance state when available', () => {
    expect(evaluateAutoContextClearReadiness({
      hasTaskContext: true,
      chatMessageCount: 2,
      hasSpecificHandoffSignal: true,
      memoryWriteCompleted: true,
      taskMemoryGuidance: {
        latestGuidanceAt: '2026-05-15T01:00:00.000Z',
        outcome: 'pending',
        pendingTargets: ['task_md'],
        reason: '最新任务记忆建议仍缺少对应写入：Task.md。',
        targets: ['task_md'],
      },
    })).toMatchObject({
      outcome: 'needs_memory_write',
      reason: '最新任务记忆建议仍缺少对应写入：Task.md。',
    });
  });
});
