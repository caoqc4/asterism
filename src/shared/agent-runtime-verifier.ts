import type { RunGoalContract } from './agent-runtime-goal.js';

export type AgentRuntimeVerifierVerdict = 'pass' | 'warn' | 'fail';
export type AgentRuntimeVerifierDecision = 'accept_for_review' | 'needs_evidence' | 'failed';
export type AgentRuntimeVerifierNextAction = 'review_memory_proposal' | 'rerun_with_evidence' | 'inspect_failure';

export type AgentRuntimeVerifierResult = {
  evaluator: 'taskplane.verifier.lightweight';
  verdict: AgentRuntimeVerifierVerdict;
  decision: AgentRuntimeVerifierDecision;
  reason: string;
  evidence: string[];
  missingEvidence: string[];
  nextAction: AgentRuntimeVerifierNextAction;
  userConfirmationRequired: boolean;
  canMarkTaskComplete: boolean;
  shouldProposeTaskMemory: boolean;
  contract: {
    runId: string;
    runtimeLabel: string;
    taskId: string;
    taskGoalStatus: string;
    objective: string;
    completionConditionCount: number;
  };
};

export function verifyRunGoalContractEvidence(params: {
  contract: RunGoalContract;
  failureReason?: string | null;
  stdout: string;
  terminalStatus: 'completed' | 'failed';
}): AgentRuntimeVerifierResult {
  const output = params.stdout.trim();
  const hasOutput = Boolean(output);
  const failed = params.terminalStatus === 'failed';
  const missingEvidence = [
    failed ? params.failureReason || 'Runtime terminal step failed.' : null,
    !failed && !hasOutput ? 'Runtime completed without stdout evidence.' : null,
  ].filter((item): item is string => Boolean(item));
  const verdict: AgentRuntimeVerifierVerdict = failed
    ? 'fail'
    : hasOutput
      ? 'pass'
      : 'warn';
  const decision: AgentRuntimeVerifierDecision = failed
    ? 'failed'
    : hasOutput
      ? 'accept_for_review'
      : 'needs_evidence';
  const nextAction: AgentRuntimeVerifierNextAction = failed
    ? 'inspect_failure'
    : hasOutput
      ? 'review_memory_proposal'
      : 'rerun_with_evidence';

  return {
    evaluator: 'taskplane.verifier.lightweight',
    verdict,
    decision,
    reason: failed
      ? 'Runtime execution failed before acceptance evidence could be trusted.'
      : hasOutput
        ? 'Runtime produced terminal output that can be reviewed against the run goal contract.'
        : 'Runtime completed, but no terminal output was available for acceptance review.',
    evidence: [
      `runtime=${params.contract.runtimeLabel}`,
      `taskGoal=${params.contract.taskGoal.status}`,
      `objective=${params.contract.objective}`,
      `completionConditions=${params.contract.completionConditions.length}`,
      `stdout=${hasOutput ? 'present' : 'missing'}`,
    ],
    missingEvidence,
    nextAction,
    userConfirmationRequired: true,
    canMarkTaskComplete: false,
    shouldProposeTaskMemory: decision === 'accept_for_review',
    contract: {
      completionConditionCount: params.contract.completionConditions.length,
      objective: params.contract.objective,
      runId: params.contract.id,
      runtimeLabel: params.contract.runtimeLabel,
      taskId: params.contract.taskId,
      taskGoalStatus: params.contract.taskGoal.status,
    },
  };
}

export function formatAgentRuntimeVerifierResult(result: AgentRuntimeVerifierResult): string {
  return [
    `Verdict: ${result.verdict}`,
    `Decision: ${result.decision}`,
    `Evaluator: bounded lightweight verifier; API verifier subagent can reuse this result and the persisted Run Goal Contract later.`,
    `Reason: ${result.reason}`,
    `Answered request evidence: ${result.evidence.some((item) => item === 'stdout=present') ? 'present' : 'missing'}`,
    `Task Goal status: ${result.contract.taskGoalStatus}`,
    `Runtime: ${result.contract.runtimeLabel}`,
    `Run: ${result.contract.runId}`,
    result.missingEvidence.length ? `Missing evidence: ${result.missingEvidence.join(' ')}` : null,
    `Task completion criteria available: ${result.contract.completionConditionCount}`,
    `User confirmation required: ${result.userConfirmationRequired ? 'yes' : 'no'}`,
    `Can mark task complete: ${result.canMarkTaskComplete ? 'yes' : 'no'}`,
    `Should propose task memory: ${result.shouldProposeTaskMemory ? 'yes' : 'no'}`,
    `Next action: ${result.nextAction}`,
  ].filter((line): line is string => line !== null).join('\n');
}
