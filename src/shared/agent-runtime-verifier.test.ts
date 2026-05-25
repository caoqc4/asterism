import { describe, expect, it } from 'vitest';

import type { RunGoalContract } from './agent-runtime-goal.js';
import {
  formatAgentRuntimeVerifierResult,
  verifyRunGoalContractEvidence,
} from './agent-runtime-verifier.js';

describe('agent-runtime-verifier', () => {
  it('passes when terminal output is available for the run goal contract', () => {
    const result = verifyRunGoalContractEvidence({
      contract: buildContract(),
      stdout: 'Checked the implementation and found the next verification step.',
      terminalStatus: 'completed',
    });

    expect(result).toMatchObject({
      evaluator: 'taskplane.verifier.lightweight',
      verdict: 'pass',
      decision: 'accept_for_review',
      missingEvidence: [],
      nextAction: 'review_memory_proposal',
      userConfirmationRequired: true,
      canMarkTaskComplete: false,
      shouldProposeTaskMemory: true,
      contract: {
        completionConditionCount: 1,
        completionConditions: ['Output is reviewable.'],
        runId: 'run_1',
        objective: 'Finish runtime goal closure.',
      },
    });
    expect(formatAgentRuntimeVerifierResult(result)).toContain('Verdict: pass');
    expect(formatAgentRuntimeVerifierResult(result)).toContain('Decision: accept_for_review');
    expect(formatAgentRuntimeVerifierResult(result)).toContain('Completion conditions: Output is reviewable.');
    expect(formatAgentRuntimeVerifierResult(result)).toContain('Can mark task complete: no');
  });

  it('warns when a successful terminal run has no output evidence', () => {
    const result = verifyRunGoalContractEvidence({
      contract: buildContract(),
      stdout: '',
      terminalStatus: 'completed',
    });

    expect(result.verdict).toBe('warn');
    expect(result.decision).toBe('needs_evidence');
    expect(result.nextAction).toBe('rerun_with_evidence');
    expect(result.shouldProposeTaskMemory).toBe(false);
    expect(result.missingEvidence).toContain('Runtime completed without stdout evidence.');
    expect(formatAgentRuntimeVerifierResult(result)).toContain('Answered request evidence: missing');
  });

  it('fails when terminal execution fails', () => {
    const result = verifyRunGoalContractEvidence({
      contract: buildContract(),
      failureReason: 'Operator cancelled the run.',
      stdout: '',
      terminalStatus: 'failed',
    });

    expect(result.verdict).toBe('fail');
    expect(result.decision).toBe('failed');
    expect(result.nextAction).toBe('inspect_failure');
    expect(result.shouldProposeTaskMemory).toBe(false);
    expect(result.missingEvidence).toContain('Operator cancelled the run.');
    expect(formatAgentRuntimeVerifierResult(result)).toContain('Verdict: fail');
  });
});

function buildContract(): RunGoalContract {
  return {
    id: 'run_1',
    taskId: 'task_1',
    taskTitle: 'Runtime closure',
    taskGoal: {
      objective: 'Finish runtime goal closure.',
      completionConditions: [],
      previousObjective: null,
      source: '/goal',
      status: 'active',
      updatedAt: '2026-05-20T00:00:00.000Z',
    },
    executionKind: 'cli',
    runtimeId: 'codex',
    runtimeLabel: 'Codex CLI',
    sandboxMode: 'read-only',
    userRequest: 'Check next step.',
    objective: 'Finish runtime goal closure.',
    completionConditions: ['Output is reviewable.'],
    validationEvidence: ['Terminal output persisted.'],
    constraints: ['Do not modify files.'],
    runtimeCapabilities: ['workspace_write=unsupported'],
    contextManifestSummary: 'manifest ready',
    contextGateSummary: 'gate ready',
    expectedOutput: ['Key findings'],
  };
}
