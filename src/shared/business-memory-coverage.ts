import type { ContextOwner } from './context-owner.js';
import { formatContextOwnerForSummary } from './context-owner.js';
import {
  evaluateTaskMemoryCoverage,
  type TaskMemoryCoverageEvaluation,
  type TaskMemoryCoverageInput,
  type TaskMemoryCoverageOutcome,
  type TaskMemoryRecommendedWrite,
} from './task-memory-coverage.js';

export type BusinessMemoryCoverageAction =
  | 'context_clear'
  | 'context_compact'
  | 'context_reset'
  | 'handoff'
  | 'retrieval'
  | 'run_start';

export type BusinessMemoryCoverageStatus =
  | 'pass'
  | 'needs_memory_write'
  | 'needs_user_clarification'
  | 'blocked'
  | 'not_applicable';

export type BusinessMemoryRequiredWrite =
  | 'business_record'
  | 'business_review'
  | 'decision'
  | 'next_action'
  | 'sop_revision'
  | 'task_md'
  | 'task_record'
  | 'run_evidence'
  | 'source_context'
  | 'artifact_reference';

export type BusinessMemoryRecoveryQuestions = {
  canRecoverConstraints: boolean;
  canRecoverEvidence: boolean;
  canRecoverGoal: boolean;
  canRecoverNextStep: boolean;
  canRecoverState: boolean;
};

export type BusinessMemoryCoverageEvaluation = {
  action: BusinessMemoryCoverageAction;
  canClearContext: boolean;
  canCompact: boolean;
  canHandoff: boolean;
  canProceed: boolean;
  canReset: boolean;
  missing: string[];
  owner: ContextOwner;
  ownerSummary: string;
  preservationProofReady: boolean;
  reason: string;
  recoveryQuestions: BusinessMemoryRecoveryQuestions;
  requiredWrites: BusinessMemoryRequiredWrite[];
  requiresUserClarification: boolean;
  status: BusinessMemoryCoverageStatus;
  taskMemoryCoverage?: TaskMemoryCoverageEvaluation | null;
};

export type BusinessMemoryCoverageInput = {
  action: BusinessMemoryCoverageAction;
  chatMessageCount?: number;
  hasAcceptedSop?: boolean;
  hasBlocker?: boolean;
  hasBusinessLineContextPack?: boolean;
  hasBusinessLineState?: boolean;
  hasCurrentNextAction?: boolean;
  hasImportantFilesOrSources?: boolean;
  hasOpenDecision?: boolean;
  hasRecentRunEvidence?: boolean;
  hasRelevantBusinessRecord?: boolean;
  hasRelevantReview?: boolean;
  hasSpecificHandoffSignal?: boolean;
  hasNextSafeAction?: boolean;
  memoryWriteCompleted?: boolean;
  owner: ContextOwner;
  taskMemoryCoverage?: TaskMemoryCoverageEvaluation | TaskMemoryCoverageInput | null;
};

export function evaluateBusinessMemoryCoverage(
  input: BusinessMemoryCoverageInput,
): BusinessMemoryCoverageEvaluation {
  const taskMemoryCoverage = normalizeTaskCoverage(input.taskMemoryCoverage);

  if (input.owner.kind === 'global') {
    return result(input, 'not_applicable', {
      reason: 'Global or one-off context is not owned by a durable business memory surface.',
      taskMemoryCoverage,
    });
  }

  if (input.owner.kind === 'legacy_task') {
    return legacyTaskResult(input, taskMemoryCoverage);
  }

  if (input.hasOpenDecision) {
    return result(input, 'blocked', {
      missing: ['A pending Decision must be resolved before context transition.'],
      reason: 'Business memory coverage is blocked by a pending Decision.',
      requiredWrites: ['decision'],
      taskMemoryCoverage,
    });
  }

  if (input.hasBlocker) {
    return result(input, 'blocked', {
      missing: ['An active blocker, dependency, or waiting condition is still present.'],
      reason: 'Business memory coverage is blocked by active blocker or dependency state.',
      taskMemoryCoverage,
    });
  }

  if (taskMemoryCoverage && !taskMemoryCoverage.canProceed) {
    return result(input, taskMemoryCoverage.outcome, {
      missing: taskMemoryCoverage.missing,
      reason: taskMemoryCoverage.reason,
      requiredWrites: mapTaskRecommendedWrites(taskMemoryCoverage.recommendedWrites),
      taskMemoryCoverage,
    });
  }

  const missing: string[] = [];
  const requiredWrites: BusinessMemoryRequiredWrite[] = [];
  if (!input.hasBusinessLineState) missing.push('Missing current Business Line state and scope.');
  if (!input.hasBusinessLineContextPack) missing.push('Missing BusinessLineContextPack or equivalent compact business recovery summary.');
  if (input.owner.kind === 'next_action' && !input.hasCurrentNextAction) {
    missing.push('Missing current Next Action state for the active business-line carrier.');
  }
  if (expectsNextStep(input) && !input.hasNextSafeAction) {
    missing.push('Missing next safe action for recovery.');
  }

  const hasBusinessRecoveryRecord = Boolean(input.hasRelevantBusinessRecord || input.hasRelevantReview);
  if (requiresBusinessRecoveryRecord(input) && !hasBusinessRecoveryRecord) {
    missing.push('Missing relevant Business Record or Review for the current recoverable signal.');
    requiredWrites.push('business_record');
  }
  if (hasLowSignalActiveDiscussion(input)) {
    missing.push('Active business-line discussion has no specific recoverable signal yet.');
  }

  if (input.hasImportantFilesOrSources === false) {
    missing.push('Important files, sources, artifacts, or source digests are not linked for recovery.');
    requiredWrites.push('source_context', 'artifact_reference');
  }

  if (input.action === 'run_start' && input.hasRecentRunEvidence === false) {
    missing.push('Recent run evidence is not available for this continuation.');
    requiredWrites.push('run_evidence');
  }

  if (missing.length > 0) {
    const status: BusinessMemoryCoverageStatus = requiredWrites.length
      ? 'needs_memory_write'
      : 'needs_user_clarification';
    return result(input, status, {
      missing,
      reason: status === 'needs_memory_write'
        ? 'Business memory needs a small durable write before context can transition.'
        : 'Business memory is missing recovery context that is not yet represented in durable state.',
      requiredWrites,
      taskMemoryCoverage,
    });
  }

  return result(input, 'pass', {
    reason: 'Business memory coverage is sufficient for this owner and transition.',
    taskMemoryCoverage,
  });
}

function legacyTaskResult(
  input: BusinessMemoryCoverageInput,
  taskMemoryCoverage: TaskMemoryCoverageEvaluation | null,
): BusinessMemoryCoverageEvaluation {
  if (!taskMemoryCoverage) {
    return result(input, 'needs_user_clarification', {
      missing: ['Legacy task coverage requires the existing TaskMemoryCoverageEvaluation.'],
      reason: 'Legacy task recovery remains governed by task-memory coverage.',
      taskMemoryCoverage,
    });
  }
  return result(input, taskMemoryCoverage.outcome, {
    missing: taskMemoryCoverage.missing,
    reason: taskMemoryCoverage.reason,
    requiredWrites: mapTaskRecommendedWrites(taskMemoryCoverage.recommendedWrites),
    taskMemoryCoverage,
  });
}

function normalizeTaskCoverage(
  coverage: BusinessMemoryCoverageInput['taskMemoryCoverage'],
): TaskMemoryCoverageEvaluation | null {
  if (!coverage) return null;
  if ('outcome' in coverage) return coverage;
  return evaluateTaskMemoryCoverage(coverage);
}

function requiresBusinessRecoveryRecord(input: BusinessMemoryCoverageInput): boolean {
  if (input.memoryWriteCompleted) return false;
  if (input.hasSpecificHandoffSignal) return true;
  return false;
}

function hasLowSignalActiveDiscussion(input: BusinessMemoryCoverageInput): boolean {
  return Boolean(
    (input.chatMessageCount ?? 0) > 0
    && !input.hasSpecificHandoffSignal
    && input.action !== 'retrieval'
    && input.action !== 'run_start',
  );
}

function expectsNextStep(input: BusinessMemoryCoverageInput): boolean {
  return input.action === 'context_clear'
    || input.action === 'context_compact'
    || input.action === 'context_reset'
    || input.action === 'handoff'
    || input.action === 'run_start'
    || input.owner.kind === 'next_action';
}

function mapTaskRecommendedWrites(writes: TaskMemoryRecommendedWrite[]): BusinessMemoryRequiredWrite[] {
  const mapped = writes.map((write) => {
    switch (write) {
      case 'task_md': return 'task_md';
      case 'task_record': return 'task_record';
      case 'decision': return 'decision';
      case 'run': return 'run_evidence';
      case 'source_digest': return 'source_context';
      case 'artifact_reference': return 'artifact_reference';
    }
  });
  return uniqueWrites(mapped);
}

function result(
  input: BusinessMemoryCoverageInput,
  status: TaskMemoryCoverageOutcome | BusinessMemoryCoverageStatus,
  options: {
    missing?: string[];
    reason: string;
    requiredWrites?: BusinessMemoryRequiredWrite[];
    taskMemoryCoverage?: TaskMemoryCoverageEvaluation | null;
  },
): BusinessMemoryCoverageEvaluation {
  const normalizedStatus = status;
  const canProceed = normalizedStatus === 'pass' || normalizedStatus === 'not_applicable';
  const transitionAllowed = canProceed && normalizedStatus === 'pass';
  const missing = options.missing ?? [];
  const requiredWrites = uniqueWrites(options.requiredWrites ?? []);
  const recoveryQuestions = recoveryQuestionsFor(input, normalizedStatus, missing, requiredWrites);
  return {
    action: input.action,
    canClearContext: transitionAllowed && input.action === 'context_clear',
    canCompact: transitionAllowed && input.action === 'context_compact',
    canHandoff: transitionAllowed && input.action === 'handoff',
    canProceed,
    canReset: transitionAllowed && input.action === 'context_reset',
    missing,
    owner: input.owner,
    ownerSummary: formatContextOwnerForSummary(input.owner),
    preservationProofReady: canProceed && recoveryQuestions.canRecoverGoal
      && recoveryQuestions.canRecoverState
      && recoveryQuestions.canRecoverNextStep
      && recoveryQuestions.canRecoverConstraints
      && recoveryQuestions.canRecoverEvidence,
    reason: options.reason,
    recoveryQuestions,
    requiredWrites,
    requiresUserClarification: normalizedStatus === 'needs_user_clarification',
    status: normalizedStatus,
    taskMemoryCoverage: options.taskMemoryCoverage ?? null,
  };
}

function recoveryQuestionsFor(
  input: BusinessMemoryCoverageInput,
  status: BusinessMemoryCoverageStatus,
  missing: string[],
  requiredWrites: BusinessMemoryRequiredWrite[],
): BusinessMemoryRecoveryQuestions {
  if (status === 'not_applicable') {
    return {
      canRecoverConstraints: true,
      canRecoverEvidence: true,
      canRecoverGoal: true,
      canRecoverNextStep: true,
      canRecoverState: true,
    };
  }
  const blocked = status === 'blocked';
  const hasState = Boolean(input.hasBusinessLineState || input.owner.kind === 'legacy_task');
  const hasGoal = Boolean(input.hasBusinessLineContextPack || input.owner.kind === 'legacy_task');
  const hasNextStep = Boolean(input.hasNextSafeAction || input.action === 'retrieval');
  const hasConstraints = !blocked && !input.hasOpenDecision && !input.hasBlocker;
  const hasEvidence = requiredWrites.every((write) => write !== 'source_context' && write !== 'artifact_reference' && write !== 'run_evidence')
    && !missing.some((item) => /source|artifact|evidence|file/i.test(item));
  return {
    canRecoverConstraints: hasConstraints,
    canRecoverEvidence: hasEvidence,
    canRecoverGoal: hasGoal,
    canRecoverNextStep: hasNextStep,
    canRecoverState: hasState,
  };
}

function uniqueWrites(writes: BusinessMemoryRequiredWrite[]): BusinessMemoryRequiredWrite[] {
  return [...new Set(writes)];
}
