import type { TaskListItemRecord } from './types/task.js';

export type SubtaskStartOutcome =
  | 'ready_to_start'
  | 'wrong_task_boundary'
  | 'blocked_by_dependency'
  | 'needs_parent_decision'
  | 'needs_handoff_review'
  | 'needs_context_refresh'
  | 'insufficient_context';

export type SubtaskStartContextSignals = {
  activeTaskId?: string | null;
  targetTaskId?: string | null;
  selectedFileTaskId?: string | null;
  inputPromptTaskId?: string | null;
  staleInputPrompt?: boolean;
};

export type SubtaskStartAvailableContext = {
  taskState?: boolean;
  taskMd?: boolean;
  relevantTaskRecords?: boolean;
  completionCriteria?: boolean;
  nextStep?: boolean;
  parentConstraints?: boolean;
  handoffNotes?: boolean;
  sourceMaterials?: boolean;
  decisions?: boolean;
  files?: boolean;
  workHabits?: boolean;
};

export type SubtaskStartEvaluationInput = {
  targetTask: TaskListItemRecord | null;
  parentTask?: TaskListItemRecord | null;
  expectedParentTaskId?: string | null;
  previousTask?: TaskListItemRecord | null;
  directSiblingDependencies?: TaskListItemRecord[];
  pendingDecisionCount?: number;
  requiresPreviousHandoff?: boolean;
  previousHandoffAvailable?: boolean;
  previousCloseoutContradictory?: boolean;
  contextSignals?: SubtaskStartContextSignals;
  availableContext?: SubtaskStartAvailableContext;
};

export type SubtaskStartEvaluation = {
  outcome: SubtaskStartOutcome;
  canStart: boolean;
  contextClean: boolean;
  contextSufficient: boolean;
  reason: string;
  missingContext: string[];
};

function isOpenTask(task: TaskListItemRecord): boolean {
  return task.state !== 'completed' && task.state !== 'archived';
}

function firstBlockedDependency(tasks: TaskListItemRecord[]): TaskListItemRecord | null {
  return tasks.find((task) => task.activeBlocker || task.activeDependency || task.state === 'waiting_external') ?? null;
}

function contextClean(input: SubtaskStartEvaluationInput): boolean {
  const targetId = input.targetTask?.id ?? null;
  const signals = input.contextSignals ?? {};
  if (!targetId) return false;
  if (signals.staleInputPrompt) return false;
  if (signals.activeTaskId && signals.activeTaskId !== targetId) return false;
  if (signals.targetTaskId && signals.targetTaskId !== targetId) return false;
  if (signals.inputPromptTaskId && signals.inputPromptTaskId !== targetId) return false;
  if (signals.selectedFileTaskId && signals.selectedFileTaskId !== targetId) return false;
  return true;
}

function missingRequiredContext(input: SubtaskStartEvaluationInput): string[] {
  const available = input.availableContext ?? {};
  const missing: string[] = [];

  if (available.taskState === false) missing.push('task_state');
  if (available.taskMd === false && available.relevantTaskRecords !== true) missing.push('task_md');
  if (available.completionCriteria === false && available.nextStep === false) {
    missing.push('completion_criteria_or_next_step');
  }
  if (input.parentTask && available.parentConstraints === false) missing.push('parent_constraints');
  if ((input.requiresPreviousHandoff || input.previousTask) && available.handoffNotes === false) {
    missing.push('handoff_notes');
  }
  if (available.decisions === false) missing.push('decisions');
  if (available.files === false) missing.push('files');
  if (available.workHabits === false) missing.push('work_habits');

  return missing;
}

export function evaluateSubtaskStart(input: SubtaskStartEvaluationInput): SubtaskStartEvaluation {
  const target = input.targetTask;
  const clean = contextClean(input);
  const missingContext = missingRequiredContext(input);
  const sufficient = missingContext.length === 0;

  if (!target) {
    return {
      outcome: 'wrong_task_boundary',
      canStart: false,
      contextClean: false,
      contextSufficient: false,
      reason: '缺少目标子任务，不能开始执行。',
      missingContext: ['target_task'],
    };
  }

  if (!isOpenTask(target)) {
    return {
      outcome: 'wrong_task_boundary',
      canStart: false,
      contextClean: clean,
      contextSufficient: sufficient,
      reason: `目标任务「${target.title}」已完成或已归档，不能作为待开始子任务。`,
      missingContext,
    };
  }

  if (input.expectedParentTaskId && target.parentTaskId !== input.expectedParentTaskId) {
    return {
      outcome: 'wrong_task_boundary',
      canStart: false,
      contextClean: clean,
      contextSufficient: sufficient,
      reason: `目标任务「${target.title}」不属于预期父任务。`,
      missingContext,
    };
  }

  if (target.activeBlocker || target.activeDependency || target.state === 'waiting_external') {
    return {
      outcome: 'blocked_by_dependency',
      canStart: false,
      contextClean: clean,
      contextSufficient: sufficient,
      reason: `目标任务「${target.title}」仍有阻塞、依赖或等待状态。`,
      missingContext,
    };
  }

  const blockedSibling = firstBlockedDependency(input.directSiblingDependencies ?? []);
  if (blockedSibling) {
    return {
      outcome: 'blocked_by_dependency',
      canStart: false,
      contextClean: clean,
      contextSufficient: sufficient,
      reason: `直接依赖任务「${blockedSibling.title}」尚未解除阻塞或等待。`,
      missingContext,
    };
  }

  if ((input.pendingDecisionCount ?? 0) > 0) {
    return {
      outcome: 'needs_parent_decision',
      canStart: false,
      contextClean: clean,
      contextSufficient: sufficient,
      reason: `开始前仍有 ${input.pendingDecisionCount} 项待决策事项。`,
      missingContext,
    };
  }

  if (input.previousCloseoutContradictory || (input.requiresPreviousHandoff && !input.previousHandoffAvailable)) {
    return {
      outcome: 'needs_handoff_review',
      canStart: false,
      contextClean: clean,
      contextSufficient: sufficient,
      reason: input.previousCloseoutContradictory
        ? '前序任务收尾结果存在矛盾，需要先复核交接信息。'
        : '缺少前序任务的明确交接信息，需要先补齐 handoff。',
      missingContext,
    };
  }

  if (!clean) {
    return {
      outcome: 'needs_context_refresh',
      canStart: false,
      contextClean: false,
      contextSufficient: sufficient,
      reason: '当前运行时上下文不干净，应先刷新或重建目标子任务上下文。',
      missingContext,
    };
  }

  if (!sufficient) {
    return {
      outcome: 'insufficient_context',
      canStart: false,
      contextClean: true,
      contextSufficient: false,
      reason: '当前运行时上下文不足以安全开始目标子任务。',
      missingContext,
    };
  }

  return {
    outcome: 'ready_to_start',
    canStart: true,
    contextClean: true,
    contextSufficient: true,
    reason: `可以开始子任务「${target.title}」。`,
    missingContext: [],
  };
}
