import {
  evaluateTaskMemoryCoverage,
  type TaskMemoryCoverageEvaluation,
} from './task-memory-coverage.js';
import {
  evaluateContextTransition,
  type ContextTransitionEvaluation,
} from './context-transition.js';
import type { ContextPreservationMessage } from './context-preservation.js';
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
  hasSpecificHandoffSignal?: boolean;
  memoryWriteCompleted?: boolean;
  hasOpenDecision?: boolean;
  hasBlocker?: boolean;
  hasPendingRecoveryGuidance?: boolean;
  messages?: ContextPreservationMessage[];
  taskMemoryGuidance?: TaskMemoryGuidanceState | null;
  shortTermReasoningActive?: boolean;
};

export type AutoContextClearEvaluation = {
  outcome: AutoContextClearOutcome;
  shouldAutoClear: boolean;
  shouldAsk: boolean;
  shouldKeep: boolean;
  reason: string;
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
  const contextTransition = evaluateContextTransition({
    intent: 'context_refresh',
    ...input,
  });
  const hasRecoverableSignal = Boolean(
    input.hasSpecificHandoffSignal
    || contextTransition.preservation.hasValuableSignals,
  );
  const coverage = evaluateTaskMemoryCoverage({
    action: 'context_clear',
    hasTaskContext: input.hasTaskContext,
    chatMessageCount: input.chatMessageCount,
    hasSpecificHandoffSignal: hasRecoverableSignal,
    memoryWriteCompleted: input.memoryWriteCompleted,
    hasOpenDecision: input.hasOpenDecision,
    hasBlocker: input.hasBlocker,
  });

  if (!input.hasTaskContext) {
    return result('not_applicable', {
      contextTransition,
      coverage,
      reason: '当前是全局或未绑定任务上下文，不需要整理任务会话。',
    });
  }

  if (input.hasOpenDecision) {
    return result('needs_user_decision', {
      contextTransition,
      coverage,
      reason: '当前任务存在待拍板事项，不能通过会话整理掩盖判断边界。',
    });
  }

  if (input.hasBlocker) {
    return result('keep_context', {
      contextTransition,
      coverage,
      reason: '当前任务存在阻塞、依赖或等待条件，应保留上下文直到阻塞状态被处理。',
    });
  }

  if (input.shortTermReasoningActive) {
    return result('keep_context', {
      contextTransition,
      coverage,
      reason: '当前对话仍是短期推理现场，刷新会话可能降低执行质量。',
    });
  }

  if (hasPendingRecoveryGuidance) {
    return result('needs_memory_write', {
      contextTransition,
      coverage,
      reason: input.taskMemoryGuidance?.outcome === 'pending'
        ? input.taskMemoryGuidance.reason
        : '当前存在尚未处理的任务记忆建议，应先确认是否写入 Task.md 或 Task Record。',
    });
  }

  if (coverage.outcome === 'needs_memory_write') {
    return result('needs_memory_write', {
      contextTransition,
      coverage,
      reason: coverage.reason,
    });
  }

  if (coverage.outcome === 'needs_user_clarification') {
    return result('keep_context', {
      contextTransition,
      coverage,
      reason: '当前任务对话缺少明确可恢复信号，刷新会话没有收益，应继续保留上下文。',
    });
  }

  if (coverage.outcome === 'blocked') {
    return result('keep_context', {
      contextTransition,
      coverage,
      reason: coverage.reason,
    });
  }

  return result('safe_to_clear', {
    contextTransition,
    coverage,
    reason: coverage.reason,
  });
}

function result(
  outcome: AutoContextClearOutcome,
  params: {
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
    contextTransition: params.contextTransition,
    taskMemoryCoverage: params.coverage,
  };
}
