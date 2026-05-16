import { isTaskMdPath, isTaskRecordPath } from './task-memory-path.js';

export type TaskMemoryCoverageAction =
  | 'task_start'
  | 'subtask_start'
  | 'phase_closeout'
  | 'task_switch'
  | 'context_clear'
  | 'task_completion'
  | 'run_start';

export type TaskMemoryCoverageOutcome =
  | 'pass'
  | 'needs_memory_write'
  | 'needs_user_clarification'
  | 'blocked'
  | 'not_applicable';

export type TaskMemoryRecommendedWrite =
  | 'task_md'
  | 'task_record'
  | 'decision'
  | 'run'
  | 'source_digest'
  | 'artifact_reference';

export type TaskMemoryCoverageEvaluation = {
  action: TaskMemoryCoverageAction;
  outcome: TaskMemoryCoverageOutcome;
  canProceed: boolean;
  canClearContext: boolean;
  canStartExecution: boolean;
  requiresUserClarification: boolean;
  recommendedWrites: TaskMemoryRecommendedWrite[];
  missing: string[];
  reason: string;
};

export type TaskMemoryCoverageInput = {
  action: TaskMemoryCoverageAction;
  hasTaskContext: boolean;
  hasTaskMd?: boolean;
  hasEquivalentRecoverySummary?: boolean;
  hasRelevantTaskRecord?: boolean;
  hasNextStep?: boolean;
  hasCompletionCriteria?: boolean;
  hasOpenDecision?: boolean;
  hasBlocker?: boolean;
  hasRecentRunEvidence?: boolean;
  hasImportantFilesOrSources?: boolean;
  hasSpecificHandoffSignal?: boolean;
  memoryWriteCompleted?: boolean;
  chatMessageCount?: number;
};

export function buildTaskMemoryCoverageInputForTask(
  action: TaskMemoryCoverageAction,
  task: TaskDetail | TaskDetailBase,
  overrides: Partial<Omit<TaskMemoryCoverageInput, 'action' | 'hasTaskContext'>> = {},
): TaskMemoryCoverageInput {
  const taskFiles = task.taskFiles ?? [];
  const hasTaskMd = taskFiles.some((file) => file.kind === 'file' && isTaskMdPath(file.path));
  const hasRelevantTaskRecord = taskFiles.some((file) => file.kind === 'file' && isTaskRecordPath(file.path));
  const resumeCard = 'resumeCard' in task ? task.resumeCard : null;
  const hasEquivalentRecoverySummary = Boolean(task.summary?.trim() || resumeCard?.summary?.trim());
  const hasNextStep = Boolean(task.nextStep?.trim() || resumeCard?.nextSuggestedMove?.trim());
  const sourceContexts = task.sourceContexts ?? [];
  const artifacts = task.artifacts ?? [];
  const timeline = task.timeline ?? [];
  const hasNonMemoryTaskFile = taskFiles.some((file) => (
    file.kind === 'file' && !isTaskMdPath(file.path) && !isTaskRecordPath(file.path)
  ));
  const hasImportantFilesOrSources = hasNonMemoryTaskFile || sourceContexts.length > 0 || artifacts.length > 0;
  const hasRecentRunEvidence = timeline.some((event) => event.type.startsWith('run.'));

  return {
    action,
    hasTaskContext: true,
    hasTaskMd,
    hasRelevantTaskRecord,
    hasEquivalentRecoverySummary,
    hasNextStep,
    hasCompletionCriteria: (task.completionCriteria ?? []).length > 0,
    hasBlocker: Boolean(
      task.activeBlocker
      || task.activeDependency
      || task.activeWaitingItem
      || task.waitingReason
      || task.state === 'waiting_external'
    ),
    hasImportantFilesOrSources,
    hasRecentRunEvidence,
    ...overrides,
  };
}

export function evaluateTaskMemoryCoverage(input: TaskMemoryCoverageInput): TaskMemoryCoverageEvaluation {
  const messageCount = input.chatMessageCount ?? 0;
  const hasActiveTaskDiscussion = input.hasTaskContext && messageCount > 0;
  const hasRecoverySummary = Boolean(input.hasTaskMd || input.hasEquivalentRecoverySummary || input.hasRelevantTaskRecord);
  const hasSpecificHandoffSignal = Boolean(input.hasSpecificHandoffSignal);
  const memoryWriteCompleted = Boolean(input.memoryWriteCompleted);

  if (!input.hasTaskContext) {
    return result(input.action, 'not_applicable', {
      reason: '全局或未绑定任务的上下文不需要任务记忆覆盖检查。',
    });
  }

  if (input.hasOpenDecision) {
    return result(input.action, 'blocked', {
      missing: ['存在待处理的用户判断或授权。'],
      reason: '任务仍有待拍板事项，不能用记忆覆盖检查绕过判断边界。',
    });
  }

  if (input.hasBlocker) {
    return result(input.action, 'blocked', {
      missing: ['存在阻塞、依赖或等待条件。'],
      reason: '任务仍有阻塞或依赖，不能安全开始执行、完成或清理为已恢复状态。',
    });
  }

  if (input.action === 'context_clear') {
    if (!hasActiveTaskDiscussion) {
      return result(input.action, 'pass', {
        reason: '当前任务没有需要保全的活跃讨论，可以清理或切换上下文。',
      });
    }

    if (!hasSpecificHandoffSignal) {
      return result(input.action, 'needs_user_clarification', {
        missing: ['缺少可恢复的结论、候选方案、未决问题、约束或下一步。'],
        reason: '任务会话已有内容，但缺少具体可恢复信号，暂不应清理。',
      });
    }

    if (!memoryWriteCompleted) {
      return result(input.action, 'needs_memory_write', {
        missing: ['需要先把可恢复信号写入 Task Record、Task.md、Decision 或其他正确任务记忆表面。'],
        recommendedWrites: ['task_record'],
        reason: '清理任务会话前需要先保全关键恢复上下文。',
      });
    }

    return result(input.action, 'pass', {
      reason: '关键恢复信号已保全，可以清理或刷新当前任务会话。',
    });
  }

  if (input.action === 'task_start' || input.action === 'subtask_start' || input.action === 'run_start') {
    const missing: string[] = [];
    if (!hasRecoverySummary) missing.push('缺少 Task.md、相关 Task Record 或等价恢复摘要。');
    if (!input.hasNextStep) missing.push('缺少明确下一步。');

    if (missing.length > 0) {
      return result(input.action, 'needs_user_clarification', {
        missing,
        reason: '任务开始前的恢复信息不足，应先补齐最小上下文再执行。',
      });
    }

    return result(input.action, 'pass', {
      reason: '任务恢复摘要和下一步已具备，可以开始执行。',
    });
  }

  if (input.action === 'phase_closeout') {
    if (hasSpecificHandoffSignal && !memoryWriteCompleted) {
      return result(input.action, 'needs_memory_write', {
        missing: ['阶段交接或收尾信号尚未写入任务记忆。'],
        recommendedWrites: ['task_record'],
        reason: '阶段收尾前应先保全有恢复价值的交接、风险或下一步。',
      });
    }

    return result(input.action, 'pass', {
      reason: '阶段收尾没有缺失的关键任务记忆写入。',
    });
  }

  if (input.action === 'task_switch') {
    if (hasActiveTaskDiscussion && hasSpecificHandoffSignal && !memoryWriteCompleted) {
      return result(input.action, 'needs_memory_write', {
        missing: ['切换前需要保全当前任务的可恢复信号。'],
        recommendedWrites: ['task_record'],
        reason: '任务切换前应先保存有价值的交接上下文。',
      });
    }

    return result(input.action, 'pass', {
      reason: '当前任务上下文可以安全切换。',
    });
  }

  if (input.action === 'task_completion') {
    if (!input.hasCompletionCriteria) {
      return result(input.action, 'needs_user_clarification', {
        missing: ['缺少完成标准或明确的完成边界。'],
        reason: '任务完成前需要可核对的完成标准或用户确认边界。',
      });
    }
    if (!input.hasRecentRunEvidence && !input.hasImportantFilesOrSources) {
      return result(input.action, 'needs_memory_write', {
        missing: ['缺少近期执行证据、重要输出或来源引用。'],
        recommendedWrites: ['run', 'source_digest', 'artifact_reference'],
        reason: '任务完成前应保留足够的完成证据或输出引用。',
      });
    }
    return result(input.action, 'pass', {
      reason: '完成边界和恢复证据已具备。',
    });
  }

  return result(input.action, 'not_applicable', {
    reason: '当前动作没有适用的任务记忆覆盖检查。',
  });
}

function result(
  action: TaskMemoryCoverageAction,
  outcome: TaskMemoryCoverageOutcome,
  options: {
    missing?: string[];
    reason: string;
    recommendedWrites?: TaskMemoryRecommendedWrite[];
  },
): TaskMemoryCoverageEvaluation {
  const canProceed = outcome === 'pass' || outcome === 'not_applicable';
  return {
    action,
    outcome,
    canProceed,
    canClearContext: canProceed && action === 'context_clear',
    canStartExecution: canProceed && (action === 'task_start' || action === 'subtask_start' || action === 'run_start'),
    requiresUserClarification: outcome === 'needs_user_clarification',
    recommendedWrites: options.recommendedWrites ?? [],
    missing: options.missing ?? [],
    reason: options.reason,
  };
}
import type { TaskDetail, TaskDetailBase } from './types/task.js';
