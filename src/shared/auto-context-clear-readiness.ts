import {
  evaluateTaskMemoryCoverage,
  type TaskMemoryCoverageEvaluation,
} from './task-memory-coverage.js';

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
  shortTermReasoningActive?: boolean;
};

export type AutoContextClearEvaluation = {
  outcome: AutoContextClearOutcome;
  shouldAutoClear: boolean;
  shouldAsk: boolean;
  shouldKeep: boolean;
  reason: string;
  taskMemoryCoverage: TaskMemoryCoverageEvaluation;
};

export function evaluateAutoContextClearReadiness(
  input: AutoContextClearInput,
): AutoContextClearEvaluation {
  const coverage = evaluateTaskMemoryCoverage({
    action: 'context_clear',
    hasTaskContext: input.hasTaskContext,
    chatMessageCount: input.chatMessageCount,
    hasSpecificHandoffSignal: input.hasSpecificHandoffSignal,
    memoryWriteCompleted: input.memoryWriteCompleted,
    hasOpenDecision: input.hasOpenDecision,
    hasBlocker: input.hasBlocker,
  });

  if (!input.hasTaskContext) {
    return result('not_applicable', {
      coverage,
      reason: '当前是全局或未绑定任务上下文，不需要自动任务上下文清理。',
    });
  }

  if (input.hasOpenDecision) {
    return result('needs_user_decision', {
      coverage,
      reason: '当前任务存在待拍板事项，不能通过自动清理掩盖判断边界。',
    });
  }

  if (input.hasBlocker) {
    return result('keep_context', {
      coverage,
      reason: '当前任务存在阻塞、依赖或等待条件，应保留上下文直到阻塞状态被处理。',
    });
  }

  if (input.shortTermReasoningActive) {
    return result('keep_context', {
      coverage,
      reason: '当前对话仍是短期推理现场，自动清理可能降低执行质量。',
    });
  }

  if (input.hasPendingRecoveryGuidance) {
    return result('needs_memory_write', {
      coverage,
      reason: '当前存在尚未处理的任务记忆建议，应先确认是否写入 Task.md 或 Task Record。',
    });
  }

  if (coverage.outcome === 'needs_memory_write') {
    return result('needs_memory_write', {
      coverage,
      reason: coverage.reason,
    });
  }

  if (coverage.outcome === 'needs_user_clarification') {
    return result('keep_context', {
      coverage,
      reason: '当前任务对话缺少明确可恢复信号，自动清理没有收益，应继续保留上下文。',
    });
  }

  if (coverage.outcome === 'blocked') {
    return result('keep_context', {
      coverage,
      reason: coverage.reason,
    });
  }

  return result('safe_to_clear', {
    coverage,
    reason: coverage.reason,
  });
}

function result(
  outcome: AutoContextClearOutcome,
  params: {
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
    taskMemoryCoverage: params.coverage,
  };
}
