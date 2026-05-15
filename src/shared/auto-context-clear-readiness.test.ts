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
});
