import { evaluateRuntimeAction } from './runtime-action-evaluator.js';
import { evaluateRuntimeVerification, type RuntimeVerificationResult } from './runtime-verification.js';
import { evaluateTaskMemoryCoverage } from './task-memory-coverage.js';
import {
  evaluateAutoContextClearReadiness,
  type AutoContextClearEvaluation,
} from './auto-context-clear-readiness.js';
import type { TaskMemoryGuidanceState } from './task-memory-guidance-state.js';
import type { SubtaskStartEvaluationInput } from './subtask-start-evaluator.js';
import type { TaskCloseoutEvaluation } from './task-closeout-evaluator.js';

export type RuntimeHandoffIntent =
  | 'context_refresh'
  | 'manual_context_refresh'
  | 'start_global_conversation'
  | 'leave_task_context'
  | 'switch_task'
  | 'phase_closeout'
  | 'resume_run';

export type RuntimeHandoffAction =
  | 'stay'
  | 'block'
  | 'prompt_switch'
  | 'clear_same_task'
  | 'clear_global'
  | 'switch_task'
  | 'handoff_to_task'
  | 'resume_run';

export type RuntimeHandoff = {
  intent: RuntimeHandoffIntent;
  action: RuntimeHandoffAction;
  fromTaskId: string | null;
  toTaskId: string | null;
  requiresArchive: boolean;
  requiresUserConfirmation: boolean;
  shouldClearMessages: boolean;
  canProceed: boolean;
  reason: string;
  notice: string;
  autoContextClear?: AutoContextClearEvaluation | null;
  recordPath?: string | null;
};

export type RuntimeResumePlan = {
  taskId: string | null;
  source: 'handoff' | 'run_checkpoint' | 'context_refresh';
  contextMustBeReassembled: boolean;
  preservePreviousChat: boolean;
  subtaskStart?: Pick<RuntimeVerificationResult, 'canProceed' | 'detail' | 'label' | 'suggestedNextAction'> | null;
  nextAction: string;
  summary: string;
};

export type RuntimeResumePlanOptions = {
  subtaskStartInput?: SubtaskStartEvaluationInput | null;
};

export type RuntimeHandoffArchiveSnapshot = {
  archived: boolean;
  messageCount: number;
  recentFocus?: string[];
  recordPath?: string | null;
};

export type RuntimeHandoffPreview = {
  canPreview: boolean;
  title: string;
  detail: string;
  nextAction: string;
};

type BaseInput = {
  archived?: boolean;
  fromTaskId?: string | null;
  hasBlocker?: boolean;
  hasOpenDecision?: boolean;
  hasPendingRecoveryGuidance?: boolean;
  hasSpecificHandoffSignal?: boolean;
  messageCount?: number;
  recordPath?: string | null;
  shortTermReasoningActive?: boolean;
  taskMemoryGuidance?: TaskMemoryGuidanceState | null;
  toTaskId?: string | null;
};

export function evaluateRuntimeHandoff(input: BaseInput & {
  closeout?: TaskCloseoutEvaluation | null;
  intent: RuntimeHandoffIntent;
}): RuntimeHandoff {
  const fromTaskId = input.fromTaskId ?? null;
  const toTaskId = input.toTaskId ?? null;
  const messageCount = input.messageCount ?? 0;
  const archived = input.archived ?? false;
  const hasSpecificHandoffSignal = input.hasSpecificHandoffSignal ?? false;

  if (input.intent === 'switch_task') {
    if (!toTaskId) {
      return blocked(input, '没有可切换的目标任务。');
    }
    if (fromTaskId === toTaskId) {
      return {
        ...base(input, 'stay'),
        canProceed: true,
        reason: '目标任务已经是当前任务上下文。',
        notice: '已在当前任务上下文中。',
      };
    }
    if (
      input.hasOpenDecision
      || input.hasBlocker
      || input.hasPendingRecoveryGuidance
      || input.shortTermReasoningActive
      || input.taskMemoryGuidance?.outcome === 'pending'
    ) {
      const autoContextClear = evaluateAutoContextClearReadiness({
        hasTaskContext: Boolean(fromTaskId),
        chatMessageCount: messageCount,
        hasSpecificHandoffSignal,
        memoryWriteCompleted: archived,
        hasOpenDecision: input.hasOpenDecision,
        hasBlocker: input.hasBlocker,
        hasPendingRecoveryGuidance: input.hasPendingRecoveryGuidance,
        shortTermReasoningActive: input.shortTermReasoningActive,
        taskMemoryGuidance: input.taskMemoryGuidance,
      });
      if (!autoContextClear.shouldAutoClear && autoContextClear.outcome !== 'not_applicable') {
        return {
          ...blocked(input, autoContextClear.reason),
          autoContextClear,
        };
      }
    }
    const memoryCoverage = evaluateTaskMemoryCoverage({
      action: 'task_switch',
      hasTaskContext: Boolean(fromTaskId),
      chatMessageCount: messageCount,
      hasSpecificHandoffSignal,
      memoryWriteCompleted: archived,
    });
    if (!memoryCoverage.canProceed) {
      return blocked(input, memoryCoverage.reason);
    }
    if (fromTaskId && messageCount > 0 && !archived) {
      return {
        ...base(input, hasSpecificHandoffSignal ? 'block' : 'prompt_switch'),
        requiresArchive: hasSpecificHandoffSignal,
        requiresUserConfirmation: !hasSpecificHandoffSignal,
        canProceed: !hasSpecificHandoffSignal,
        reason: hasSpecificHandoffSignal
          ? '当前任务会话包含可恢复信号，切换前需要先保全上下文。'
          : '当前任务会话没有明确可恢复信号，可由用户确认后切换。',
        notice: hasSpecificHandoffSignal
          ? '切换前请先整理归档当前任务讨论。'
          : '目标任务上下文已可用，可确认切换或保持当前上下文。',
      };
    }
    return {
      ...base(input, 'switch_task'),
      canProceed: true,
      reason: '没有需要保全的当前任务会话，可以直接切换。',
      notice: '已切换到目标任务上下文。',
    };
  }

  if (input.intent === 'phase_closeout') {
    const closeout = input.closeout ?? null;
    if (!closeout) return blocked(input, '阶段收尾缺少任务检查结果。');
    if (input.taskMemoryGuidance?.outcome === 'pending' || input.hasPendingRecoveryGuidance) {
      const autoContextClear = evaluateAutoContextClearReadiness({
        hasTaskContext: Boolean(fromTaskId),
        chatMessageCount: messageCount,
        hasSpecificHandoffSignal: true,
        memoryWriteCompleted: Boolean(input.recordPath),
        hasPendingRecoveryGuidance: input.hasPendingRecoveryGuidance,
        taskMemoryGuidance: input.taskMemoryGuidance,
      });
      return {
        ...blocked(input, autoContextClear.reason),
        autoContextClear,
      };
    }
    if (
      (closeout.outcome === 'handoff_to_existing_child' || closeout.outcome === 'handoff_to_existing_successor')
      && closeout.nextTaskId
    ) {
      return {
        ...base({ ...input, toTaskId: closeout.nextTaskId }, 'handoff_to_task'),
        canProceed: true,
        reason: closeout.reason,
        notice: closeout.outcome === 'handoff_to_existing_child'
          ? '阶段收尾完成，准备交接到已有子任务。'
          : '阶段收尾完成，准备交接到已有后续任务。',
        recordPath: input.recordPath ?? null,
      };
    }
    return {
      ...base(input, 'clear_same_task'),
      canProceed: true,
      reason: closeout.reason,
      notice: '阶段收尾完成，刷新当前任务会话。',
      recordPath: input.recordPath ?? null,
      shouldClearMessages: true,
    };
  }

  if (input.intent === 'resume_run') {
    if (input.taskMemoryGuidance?.outcome === 'pending' || input.hasPendingRecoveryGuidance) {
      const autoContextClear = evaluateAutoContextClearReadiness({
        hasTaskContext: Boolean(fromTaskId),
        chatMessageCount: messageCount,
        hasSpecificHandoffSignal: true,
        memoryWriteCompleted: false,
        hasPendingRecoveryGuidance: input.hasPendingRecoveryGuidance,
        taskMemoryGuidance: input.taskMemoryGuidance,
      });
      return {
        ...blocked(input, autoContextClear.reason),
        autoContextClear,
      };
    }
    return {
      ...base(input, 'resume_run'),
      canProceed: true,
      reason: '恢复执行前需要重新装配任务上下文。',
      notice: '准备从持久上下文恢复执行。',
    };
  }

  const autoContextClear = evaluateAutoContextClearReadiness({
    hasTaskContext: Boolean(fromTaskId),
    chatMessageCount: messageCount,
    hasSpecificHandoffSignal,
    memoryWriteCompleted: archived,
    hasOpenDecision: input.hasOpenDecision,
    hasBlocker: input.hasBlocker,
    hasPendingRecoveryGuidance: input.hasPendingRecoveryGuidance,
    shortTermReasoningActive: input.shortTermReasoningActive,
    taskMemoryGuidance: input.taskMemoryGuidance,
  });
  if (!autoContextClear.shouldAutoClear && autoContextClear.outcome !== 'not_applicable') {
    return {
      ...blocked(input, autoContextClear.reason),
      autoContextClear,
    };
  }

  const actionEvaluation = evaluateRuntimeAction({
    action: 'context_clear',
    fromTaskId,
    messageCount,
    hasSpecificHandoffSignal,
  });
  if (!actionEvaluation.allowed) {
    return {
      ...blocked(input, actionEvaluation.reason),
      autoContextClear,
    };
  }

  const verification = evaluateRuntimeVerification({
    mode: 'context_clear',
    hasTaskContext: Boolean(fromTaskId),
    messageCount,
    hasSpecificHandoffSignal,
    memoryWriteCompleted: archived,
  });
  if (!verification.canProceed) {
    return {
      ...blocked(input, verification.detail),
      autoContextClear,
    };
  }

  if (actionEvaluation.shouldPersistTaskRecord && !archived) {
    return {
      ...blocked(input, '清理任务会话前需要先成功保全关键恢复上下文。'),
      autoContextClear,
    };
  }

  if (input.intent === 'start_global_conversation' || input.intent === 'leave_task_context') {
    return {
      ...base(input, 'clear_global'),
      autoContextClear,
      canProceed: true,
      reason: '任务会话已满足离开当前上下文的条件。',
      notice: '已离开任务上下文。',
      shouldClearMessages: true,
    };
  }

  return {
    ...base(input, 'clear_same_task'),
    autoContextClear,
    canProceed: true,
    reason: '任务会话已满足刷新条件。',
    notice: input.intent === 'manual_context_refresh'
      ? '已整理归档当前任务讨论，等待用户确认刷新。'
      : '已刷新当前任务会话。',
    shouldClearMessages: input.intent === 'context_refresh',
  };
}

export function buildRuntimeResumePlan(handoff: RuntimeHandoff, options: RuntimeResumePlanOptions = {}): RuntimeResumePlan {
  const subtaskStart = handoff.action === 'handoff_to_task' && options.subtaskStartInput
    ? evaluateRuntimeVerification({
      mode: 'subtask_start',
      ...options.subtaskStartInput,
    })
    : null;
  const subtaskStartSummary = subtaskStart
    ? {
      canProceed: subtaskStart.canProceed,
      detail: subtaskStart.detail,
      label: subtaskStart.label,
      suggestedNextAction: subtaskStart.suggestedNextAction,
    }
    : null;
  const blockedSubtaskStart = subtaskStartSummary && !subtaskStartSummary.canProceed;

  return {
    taskId: handoff.toTaskId ?? handoff.fromTaskId,
    source: handoff.action === 'resume_run' ? 'run_checkpoint' : handoff.action === 'handoff_to_task' ? 'handoff' : 'context_refresh',
    contextMustBeReassembled: true,
    preservePreviousChat: false,
    subtaskStart: subtaskStartSummary,
    nextAction: blockedSubtaskStart
      ? '先处理子任务启动检查，再进入目标任务。'
      : handoff.action === 'handoff_to_task'
      ? '进入目标任务并重新装配上下文。'
      : handoff.action === 'resume_run'
        ? '从 checkpoint 恢复前重新装配上下文。'
        : '刷新当前任务上下文。',
    summary: `${handoff.notice} ${handoff.reason}`.trim(),
  };
}

export function buildRuntimeHandoffPreview(
  handoff: RuntimeHandoff,
  snapshot: RuntimeHandoffArchiveSnapshot,
): RuntimeHandoffPreview {
  if (!handoff.canProceed) {
    return {
      canPreview: false,
      title: '上下文暂不能安全交接。',
      detail: handoff.reason,
      nextAction: handoff.requiresArchive
        ? '请先补充可恢复的结论、候选方案、未决问题或下一步动作。'
        : '请先处理阻断条件。',
    };
  }

  const focus = snapshot.recentFocus?.filter((item) => item.trim()) ?? [];
  const archiveSummary = snapshot.archived
    ? `归档摘要：用户消息 ${snapshot.messageCount} 条；最近关注：${focus.length ? focus.join(' / ') : '暂无'}。`
    : snapshot.messageCount > 0
      ? `本次没有形成需要归档的关键记录；用户消息 ${snapshot.messageCount} 条。`
      : '当前没有需要归档的任务讨论。';

  return {
    canPreview: true,
    title: handoff.intent === 'manual_context_refresh'
      ? '已整理并归档当前任务讨论的关键记录。'
      : handoff.notice,
    detail: snapshot.recordPath ? `${archiveSummary} 记录：${snapshot.recordPath}` : archiveSummary,
    nextAction: handoff.intent === 'manual_context_refresh'
      ? '请检查是否还要补充事实；确认无误后再刷新任务会话。'
      : buildRuntimeResumePlan(handoff).nextAction,
  };
}

function base(input: BaseInput & { intent: RuntimeHandoffIntent }, action: RuntimeHandoffAction): RuntimeHandoff {
  return {
    intent: input.intent,
    action,
    fromTaskId: input.fromTaskId ?? null,
    toTaskId: input.toTaskId ?? null,
    requiresArchive: false,
    requiresUserConfirmation: false,
    shouldClearMessages: false,
    canProceed: false,
    reason: '',
    notice: '',
    recordPath: input.recordPath ?? null,
  };
}

function blocked(input: BaseInput & { intent: RuntimeHandoffIntent }, reason: string | null | undefined): RuntimeHandoff {
  return {
    ...base(input, 'block'),
    requiresArchive: true,
    canProceed: false,
    reason: reason || '当前上下文不能安全交接。',
    notice: '交接已暂停。',
  };
}
