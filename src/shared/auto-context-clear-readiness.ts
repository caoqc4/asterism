import {
  evaluateTaskMemoryCoverage,
  type TaskMemoryCoverageEvaluation,
  type TaskMemoryCoverageInput,
} from './task-memory-coverage.js';
import {
  evaluateContextTransition,
  type ContextTransitionEvaluation,
} from './context-transition.js';
import {
  evaluateBusinessMemoryCoverage,
  type BusinessMemoryCoverageEvaluation,
} from './business-memory-coverage.js';
import type { ContextPreservationMessage } from './context-preservation.js';
import {
  contextOwnerHasBusinessLine,
  contextOwnerHasTaskCarrier,
  type ContextOwner,
} from './context-owner.js';
import type { TaskMemoryGuidanceState } from './task-memory-guidance-state.js';

export type AutoContextClearOutcome =
  | 'safe_to_clear'
  | 'needs_memory_write'
  | 'needs_user_decision'
  | 'keep_context'
  | 'not_applicable';

export type AutoContextClearInput = {
  hasTaskContext: boolean;
  chatMessageCount: number;
  owner?: ContextOwner;
  hasBusinessLineState?: boolean;
  hasBusinessLineContextPack?: boolean;
  hasCurrentNextAction?: boolean;
  hasNextSafeAction?: boolean;
  hasRelevantBusinessRecord?: boolean;
  hasRelevantReview?: boolean;
  hasImportantFilesOrSources?: boolean;
  hasRecentRunEvidence?: boolean;
  hasSpecificHandoffSignal?: boolean;
  memoryWriteCompleted?: boolean;
  hasOpenDecision?: boolean;
  hasBlocker?: boolean;
  hasPendingRecoveryGuidance?: boolean;
  messages?: ContextPreservationMessage[];
  taskMemoryCoverage?: TaskMemoryCoverageEvaluation | TaskMemoryCoverageInput | null;
  taskMemoryGuidance?: TaskMemoryGuidanceState | null;
  shortTermReasoningActive?: boolean;
};

export type AutoContextClearEvaluation = {
  outcome: AutoContextClearOutcome;
  shouldAutoClear: boolean;
  shouldAsk: boolean;
  shouldKeep: boolean;
  reason: string;
  businessMemoryCoverage?: BusinessMemoryCoverageEvaluation | null;
  contextTransition: ContextTransitionEvaluation;
  taskMemoryCoverage: TaskMemoryCoverageEvaluation;
};

export function evaluateAutoContextClearReadiness(
  input: AutoContextClearInput,
): AutoContextClearEvaluation {
  const hasPendingRecoveryGuidance = Boolean(
    input.hasPendingRecoveryGuidance
    || input.taskMemoryGuidance?.outcome === 'pending',
  );
  const owner = input.owner ?? null;
  const ownerHasTaskCarrier = owner ? contextOwnerHasTaskCarrier(owner) : false;
  const ownerHasBusinessLine = owner ? contextOwnerHasBusinessLine(owner) : false;
  const effectiveHasTaskContext = input.hasTaskContext || ownerHasTaskCarrier;
  const contextTransition = evaluateContextTransition({
    intent: 'context_refresh',
    ...input,
    hasBusinessLineContext: ownerHasBusinessLine,
    hasTaskContext: effectiveHasTaskContext,
  });
  const hasRecoverableSignal = Boolean(
    input.hasSpecificHandoffSignal
    || contextTransition.preservation.hasValuableSignals,
  );
  const coverage = evaluateTaskMemoryCoverage({
    action: 'context_clear',
    hasTaskContext: effectiveHasTaskContext,
    chatMessageCount: input.chatMessageCount,
    hasSpecificHandoffSignal: hasRecoverableSignal,
    memoryWriteCompleted: input.memoryWriteCompleted,
    hasOpenDecision: input.hasOpenDecision,
    hasBlocker: input.hasBlocker,
  });
  const businessCoverage = owner
    ? evaluateBusinessMemoryCoverage({
        action: 'context_clear',
        chatMessageCount: input.chatMessageCount,
        hasBlocker: input.hasBlocker,
        hasBusinessLineContextPack: input.hasBusinessLineContextPack,
        hasBusinessLineState: input.hasBusinessLineState,
        hasCurrentNextAction: input.hasCurrentNextAction,
        hasImportantFilesOrSources: input.hasImportantFilesOrSources,
        hasNextSafeAction: input.hasNextSafeAction,
        hasOpenDecision: input.hasOpenDecision,
        hasRecentRunEvidence: input.hasRecentRunEvidence,
        hasRelevantBusinessRecord: input.hasRelevantBusinessRecord,
        hasRelevantReview: input.hasRelevantReview,
        hasSpecificHandoffSignal: hasRecoverableSignal,
        memoryWriteCompleted: input.memoryWriteCompleted,
        owner,
        taskMemoryCoverage: input.taskMemoryCoverage ?? coverage,
      })
    : null;

  if (input.hasOpenDecision) {
    return result('needs_user_decision', {
      businessCoverage,
      contextTransition,
      coverage,
      reason: '当前任务存在待拍板事项，不能通过会话整理掩盖判断边界。',
    });
  }

  if (input.hasBlocker) {
    return result('keep_context', {
      businessCoverage,
      contextTransition,
      coverage,
      reason: '当前任务存在阻塞、依赖或等待条件，应保留上下文直到阻塞状态被处理。',
    });
  }

  if (input.shortTermReasoningActive) {
    return result('keep_context', {
      businessCoverage,
      contextTransition,
      coverage,
      reason: '当前对话仍是短期推理现场，刷新会话可能降低执行质量。',
    });
  }

  if (hasPendingRecoveryGuidance) {
    return result('needs_memory_write', {
      businessCoverage,
      contextTransition,
      coverage,
      reason: input.taskMemoryGuidance?.outcome === 'pending'
        ? input.taskMemoryGuidance.reason
        : '当前存在尚未处理的任务记忆建议，应先确认是否写入 Task.md 或 Task Record。',
    });
  }

  if (businessCoverage) {
    const ownerResult = resultFromBusinessCoverage(businessCoverage, {
      contextTransition,
      coverage,
    });
    if (ownerResult) return ownerResult;
  }

  if (!effectiveHasTaskContext) {
    return result('not_applicable', {
      businessCoverage,
      contextTransition,
      coverage,
      reason: '当前是全局或未绑定任务上下文，不需要整理任务会话。',
    });
  }

  if (coverage.outcome === 'needs_memory_write') {
    return result('needs_memory_write', {
      businessCoverage,
      contextTransition,
      coverage,
      reason: coverage.reason,
    });
  }

  if (coverage.outcome === 'needs_user_clarification') {
    return result('keep_context', {
      businessCoverage,
      contextTransition,
      coverage,
      reason: '当前任务对话缺少明确可恢复信号，刷新会话没有收益，应继续保留上下文。',
    });
  }

  if (coverage.outcome === 'blocked') {
    return result('keep_context', {
      businessCoverage,
      contextTransition,
      coverage,
      reason: coverage.reason,
    });
  }

  return result('safe_to_clear', {
    businessCoverage,
    contextTransition,
    coverage,
    reason: coverage.reason,
  });
}

function result(
  outcome: AutoContextClearOutcome,
  params: {
    businessCoverage?: BusinessMemoryCoverageEvaluation | null;
    contextTransition: ContextTransitionEvaluation;
    coverage: TaskMemoryCoverageEvaluation;
    reason: string;
  },
): AutoContextClearEvaluation {
  return {
    outcome,
    shouldAutoClear: outcome === 'safe_to_clear',
    shouldAsk: outcome === 'needs_memory_write' || outcome === 'needs_user_decision',
    shouldKeep: outcome === 'keep_context',
    reason: params.reason,
    businessMemoryCoverage: params.businessCoverage ?? null,
    contextTransition: params.contextTransition,
    taskMemoryCoverage: params.coverage,
  };
}

function resultFromBusinessCoverage(
  businessCoverage: BusinessMemoryCoverageEvaluation,
  params: {
    contextTransition: ContextTransitionEvaluation;
    coverage: TaskMemoryCoverageEvaluation;
  },
): AutoContextClearEvaluation | null {
  if (businessCoverage.status === 'not_applicable') {
    return result('not_applicable', {
      businessCoverage,
      contextTransition: params.contextTransition,
      coverage: params.coverage,
      reason: businessCoverage.reason,
    });
  }
  if (businessCoverage.status === 'blocked') {
    return result(businessCoverage.requiredWrites.includes('decision') ? 'needs_user_decision' : 'keep_context', {
      businessCoverage,
      contextTransition: params.contextTransition,
      coverage: params.coverage,
      reason: businessCoverage.reason,
    });
  }
  if (businessCoverage.status === 'needs_memory_write') {
    return result('needs_memory_write', {
      businessCoverage,
      contextTransition: params.contextTransition,
      coverage: params.coverage,
      reason: businessCoverage.reason,
    });
  }
  if (businessCoverage.status === 'needs_user_clarification') {
    return result('keep_context', {
      businessCoverage,
      contextTransition: params.contextTransition,
      coverage: params.coverage,
      reason: businessCoverage.reason,
    });
  }
  if (businessCoverage.status === 'pass') {
    return result('safe_to_clear', {
      businessCoverage,
      contextTransition: params.contextTransition,
      coverage: params.coverage,
      reason: businessCoverage.reason,
    });
  }
  return null;
}
