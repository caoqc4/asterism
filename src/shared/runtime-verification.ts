import { evaluateRunSelfCheck, evaluateRunStepSelfCheck } from './run-self-check.js';
import {
  evaluateTaskCloseout,
  type TaskCloseoutEvaluation,
  type TaskCloseoutEvaluatorInput,
} from './task-closeout-evaluator.js';
import type { DecisionEffectSummary } from './decision-effect-evaluator.js';
import {
  type RuntimeCapabilitySnapshot,
} from './runtime-capability-snapshot.js';
import {
  buildCapabilityRegistry,
  capabilityRegistryAllowsModelExecution,
  capabilityRegistryAllowsWorkspaceVerification,
} from './capability-registry.js';
import type { RuntimeActionEvaluation } from './runtime-action-evaluator.js';
import {
  evaluateTaskMemoryCoverage,
  type TaskMemoryCoverageEvaluation,
} from './task-memory-coverage.js';
import type { TaskMemoryGuidanceState } from './task-memory-guidance-state.js';
import {
  evaluateSubtaskStart,
  type SubtaskStartEvaluation,
  type SubtaskStartEvaluationInput,
} from './subtask-start-evaluator.js';
import type { RunDetailRecord, RunRecord, RunStepRecord } from './types/run.js';
import type { TaskDetail, TaskListItemRecord } from './types/task.js';

export type RuntimeVerificationMode =
  | 'run'
  | 'run_step'
  | 'pre_step'
  | 'post_step'
  | 'subtask_start'
  | 'task_closeout'
  | 'project'
  | 'context_clear';

export type RuntimeVerificationTone = 'pass' | 'warn' | 'fail' | 'pending';
export type RuntimeVerificationSource = 'lightweight_rule_engine' | 'ai_verifier';

export type RuntimeVerificationResult = {
  mode: RuntimeVerificationMode;
  tone: RuntimeVerificationTone;
  label: string;
  detail: string;
  source: RuntimeVerificationSource;
  canProceed: boolean;
  requiresUserConfirmation: boolean;
  shouldPersistTaskRecord: boolean;
  suggestedNextAction:
    | 'continue'
    | 'confirm'
    | 'wait'
    | 'handoff'
    | 'complete'
    | 'inspect';
  taskCloseout?: TaskCloseoutEvaluation;
  subtaskStart?: SubtaskStartEvaluation;
  project?: RuntimeProjectVerification;
  taskMemoryCoverage?: TaskMemoryCoverageEvaluation;
};

export type RuntimeProjectVerification = {
  outcome:
    | 'missing_structure'
    | 'blocked_or_waiting'
    | 'continue_children'
    | 'continue_parent'
    | 'ready_to_complete'
    | 'needs_user_confirmation';
  childTotal: number;
  childCompleted: number;
  childOpen: number;
  blockerCount: number;
  waitingCount: number;
  criteriaOpen: number;
  artifactCount: number | null;
  keySourceCount: number | null;
  pendingDecisionCount: number;
  decisionEffect: DecisionEffectSummary | null;
  reason: string;
};

export type RuntimeVerificationInput =
  | {
      mode: 'run';
      run: RunRecord;
      detail?: RunDetailRecord | null;
      applicableWorkHabitCount?: number;
    }
  | {
      mode: 'run_step';
      step: RunStepRecord;
      applicableWorkHabitCount?: number;
    }
  | {
      mode: 'pre_step';
      action: RuntimeActionEvaluation;
      capabilities?: RuntimeCapabilitySnapshot | null;
      hasRequiredContext?: boolean;
      hasPendingDecision?: boolean;
      confirmationSatisfied?: boolean;
      taskMemoryCoverage?: TaskMemoryCoverageEvaluation | null;
      taskMemoryGuidance?: TaskMemoryGuidanceState | null;
      requiresModelExecution?: boolean;
      requiresWorkspaceVerification?: boolean;
    }
  | {
      mode: 'post_step';
      step: RunStepRecord;
      producedDurableChange?: boolean;
      hasTaskRecord?: boolean;
      hasRecoveryNote?: boolean;
      applicableWorkHabitCount?: number;
    }
  | ({
      mode: 'subtask_start';
    } & SubtaskStartEvaluationInput)
  | ({
      mode: 'task_closeout';
    } & TaskCloseoutEvaluatorInput)
  | {
      mode: 'project';
      task: TaskDetail;
      childTasks: TaskListItemRecord[];
      artifactCount?: number;
      keySourceCount?: number;
      pendingDecisionCount?: number;
      decisionEffect?: DecisionEffectSummary | null;
    }
  | {
      mode: 'context_clear';
      hasTaskContext: boolean;
      messageCount: number;
      hasSpecificHandoffSignal: boolean;
      memoryWriteCompleted?: boolean;
    };

export function evaluateRuntimeVerification(input: RuntimeVerificationInput): RuntimeVerificationResult {
  switch (input.mode) {
    case 'run': {
      const check = evaluateRunSelfCheck(input.run, input.detail, {
        applicableWorkHabitCount: input.applicableWorkHabitCount,
      });
      return {
        mode: input.mode,
        tone: check.tone,
        label: check.label,
        detail: check.detail,
        source: check.source,
        canProceed: check.tone === 'pass' || check.tone === 'warn',
        requiresUserConfirmation: check.tone === 'warn' || check.tone === 'fail',
        shouldPersistTaskRecord: check.tone === 'fail',
        suggestedNextAction: check.tone === 'pass'
          ? 'continue'
          : check.tone === 'pending'
            ? 'inspect'
            : 'confirm',
      };
    }
    case 'run_step': {
      const check = evaluateRunStepSelfCheck(input.step, {
        applicableWorkHabitCount: input.applicableWorkHabitCount,
      });
      return {
        mode: input.mode,
        tone: check.tone,
        label: check.label,
        detail: check.detail,
        source: check.source,
        canProceed: check.tone === 'pass' || check.tone === 'warn',
        requiresUserConfirmation: check.tone === 'warn' || check.tone === 'fail',
        shouldPersistTaskRecord: check.tone === 'fail',
        suggestedNextAction: check.tone === 'pass'
          ? 'continue'
          : check.tone === 'pending'
            ? 'inspect'
          : 'confirm',
      };
    }
    case 'pre_step': {
      if (!input.action.allowed) {
        return {
          mode: input.mode,
          tone: 'fail',
          label: '执行前检查未通过',
          detail: input.action.reason,
          source: 'lightweight_rule_engine',
          canProceed: false,
          requiresUserConfirmation: false,
          shouldPersistTaskRecord: input.action.shouldPersistTaskRecord,
          suggestedNextAction: 'inspect',
        };
      }
      if (input.hasRequiredContext === false) {
        return {
          mode: input.mode,
          tone: 'fail',
          label: '执行前缺少上下文',
          detail: '当前动作缺少必要任务上下文，应先重新组装上下文再执行。',
          source: 'lightweight_rule_engine',
          canProceed: false,
          requiresUserConfirmation: false,
          shouldPersistTaskRecord: false,
          suggestedNextAction: 'inspect',
        };
      }
      if (input.hasPendingDecision) {
        return {
          mode: input.mode,
          tone: 'warn',
          label: '执行前需拍板',
          detail: '当前任务仍有待决策事项，应先处理拍板再继续执行。',
          source: 'lightweight_rule_engine',
          canProceed: false,
          requiresUserConfirmation: true,
          shouldPersistTaskRecord: false,
          suggestedNextAction: 'confirm',
        };
      }
      if (input.taskMemoryCoverage && !input.taskMemoryCoverage.canProceed) {
        return {
          mode: input.mode,
          tone: input.taskMemoryCoverage.outcome === 'blocked' ? 'fail' : 'warn',
          label: input.taskMemoryCoverage.outcome === 'blocked'
            ? '执行前任务记忆阻塞'
            : '执行前任务记忆不足',
          detail: input.taskMemoryCoverage.reason,
          source: 'lightweight_rule_engine',
          canProceed: false,
          requiresUserConfirmation: input.taskMemoryCoverage.requiresUserClarification,
          shouldPersistTaskRecord: input.taskMemoryCoverage.recommendedWrites.includes('task_record'),
          suggestedNextAction: input.taskMemoryCoverage.outcome === 'needs_memory_write'
            ? 'handoff'
            : input.taskMemoryCoverage.outcome === 'blocked'
              ? 'inspect'
              : 'confirm',
          taskMemoryCoverage: input.taskMemoryCoverage,
        };
      }
      if (input.taskMemoryGuidance?.outcome === 'pending') {
        return {
          mode: input.mode,
          tone: 'warn',
          label: '执行前任务记忆待处理',
          detail: input.taskMemoryGuidance.reason,
          source: 'lightweight_rule_engine',
          canProceed: false,
          requiresUserConfirmation: false,
          shouldPersistTaskRecord: input.taskMemoryGuidance.pendingTargets.includes('task_record'),
          suggestedNextAction: 'handoff',
        };
      }
      if (input.requiresModelExecution && !input.capabilities) {
        return {
          mode: input.mode,
          tone: 'fail',
          label: '执行前缺少能力快照',
          detail: '当前动作需要模型执行，但运行时没有提供模型能力快照。',
          source: 'lightweight_rule_engine',
          canProceed: false,
          requiresUserConfirmation: false,
          shouldPersistTaskRecord: false,
          suggestedNextAction: 'inspect',
        };
      }
      if (
        input.requiresModelExecution
        && input.capabilities
        && !capabilityRegistryAllowsModelExecution(buildCapabilityRegistry({ snapshot: input.capabilities }))
      ) {
        const detail = input.capabilities.model.configured && input.capabilities.executionRuntime.kind !== 'agent_api'
          ? '当前动作需要 Agent API Runtime 模型执行，但当前选中的 AI Runtime 不是 Agent API。'
          : '当前动作需要模型执行，但模型或 API Key 尚未配置。';
        return {
          mode: input.mode,
          tone: 'fail',
          label: '执行前缺少模型能力',
          detail,
          source: 'lightweight_rule_engine',
          canProceed: false,
          requiresUserConfirmation: false,
          shouldPersistTaskRecord: false,
          suggestedNextAction: 'inspect',
        };
      }
      if (
        input.requiresWorkspaceVerification
        && !input.capabilities
      ) {
        return {
          mode: input.mode,
          tone: 'fail',
          label: '执行前缺少能力快照',
          detail: '当前动作需要工作区校验，但运行时没有提供工作区能力快照。',
          source: 'lightweight_rule_engine',
          canProceed: false,
          requiresUserConfirmation: false,
          shouldPersistTaskRecord: false,
          suggestedNextAction: 'inspect',
        };
      }
      if (
        input.requiresWorkspaceVerification
        && input.capabilities
        && !capabilityRegistryAllowsWorkspaceVerification(buildCapabilityRegistry({ snapshot: input.capabilities }))
      ) {
        return {
          mode: input.mode,
          tone: 'warn',
          label: '执行前缺少工作区校验能力',
          detail: '当前动作需要工作区校验，但 lint/test 检查不可用。',
          source: 'lightweight_rule_engine',
          canProceed: false,
          requiresUserConfirmation: true,
          shouldPersistTaskRecord: false,
          suggestedNextAction: 'confirm',
        };
      }
      return {
        mode: input.mode,
        tone: input.action.requiresConfirmation && !input.confirmationSatisfied ? 'warn' : 'pass',
        label: input.action.requiresConfirmation && !input.confirmationSatisfied ? '执行前需确认' : '执行前检查通过',
        detail: input.action.reason,
        source: 'lightweight_rule_engine',
        canProceed: !input.action.requiresConfirmation || Boolean(input.confirmationSatisfied),
        requiresUserConfirmation: input.action.requiresConfirmation && !input.confirmationSatisfied,
        shouldPersistTaskRecord: input.action.shouldPersistTaskRecord,
        suggestedNextAction: input.action.requiresConfirmation && !input.confirmationSatisfied ? 'confirm' : 'continue',
      };
    }
    case 'post_step': {
      const check = evaluateRunStepSelfCheck(input.step, {
        applicableWorkHabitCount: input.applicableWorkHabitCount,
      });
      if (check.tone === 'fail') {
        return {
          mode: input.mode,
          tone: 'fail',
          label: '执行后检查未通过',
          detail: check.detail,
          source: check.source,
          canProceed: false,
          requiresUserConfirmation: true,
          shouldPersistTaskRecord: true,
          suggestedNextAction: 'confirm',
        };
      }
      if (input.producedDurableChange && !(input.hasTaskRecord ?? input.hasRecoveryNote)) {
        return {
          mode: input.mode,
          tone: 'warn',
          label: '执行后需补记录',
          detail: '本步骤产生了 durable 变化，但还没有对应任务记录或可恢复摘要。',
          source: 'lightweight_rule_engine',
          canProceed: false,
          requiresUserConfirmation: false,
          shouldPersistTaskRecord: true,
          suggestedNextAction: 'handoff',
        };
      }
      return {
        mode: input.mode,
        tone: check.tone,
        label: check.tone === 'pass' ? '执行后检查通过' : check.label,
        detail: check.detail,
        source: check.source,
        canProceed: check.tone === 'pass',
        requiresUserConfirmation: check.tone === 'warn',
        shouldPersistTaskRecord: check.tone === 'warn',
        suggestedNextAction: check.tone === 'pass'
          ? 'continue'
          : check.tone === 'pending'
            ? 'inspect'
          : 'confirm',
      };
    }
    case 'subtask_start': {
      const subtaskStart = evaluateSubtaskStart(input);
      const tone: RuntimeVerificationTone = subtaskStart.outcome === 'ready_to_start'
        ? 'pass'
        : subtaskStart.outcome === 'blocked_by_dependency'
          || subtaskStart.outcome === 'needs_parent_decision'
          || subtaskStart.outcome === 'needs_handoff_review'
          ? 'warn'
          : 'fail';
      return {
        mode: input.mode,
        tone,
        label: subtaskStart.outcome === 'ready_to_start'
          ? '子任务启动检查通过'
          : subtaskStart.outcome === 'needs_context_refresh'
            ? '子任务启动前需刷新上下文'
            : subtaskStart.outcome === 'insufficient_context'
              ? '子任务启动前上下文不足'
              : subtaskStart.outcome === 'wrong_task_boundary'
                ? '子任务启动边界不正确'
                : subtaskStart.outcome === 'needs_parent_decision'
                  ? '子任务启动前需拍板'
                  : subtaskStart.outcome === 'needs_handoff_review'
                    ? '子任务启动前需复核交接'
                    : '子任务启动前仍有阻塞',
        detail: subtaskStart.reason,
        source: 'lightweight_rule_engine',
        canProceed: subtaskStart.canStart,
        requiresUserConfirmation: subtaskStart.outcome === 'needs_parent_decision'
          || subtaskStart.outcome === 'needs_handoff_review',
        shouldPersistTaskRecord: subtaskStart.outcome === 'needs_handoff_review',
        suggestedNextAction: subtaskStart.outcome === 'ready_to_start'
          ? 'continue'
          : subtaskStart.outcome === 'blocked_by_dependency'
            ? 'wait'
            : subtaskStart.outcome === 'needs_parent_decision'
              ? 'confirm'
              : subtaskStart.outcome === 'needs_handoff_review'
                ? 'handoff'
                : 'inspect',
        subtaskStart,
      };
    }
    case 'task_closeout': {
      const taskCloseout = evaluateTaskCloseout(input);
      return {
        mode: input.mode,
        tone: taskCloseout.runVerificationTone,
        label: taskCloseout.runVerificationLabel,
        detail: taskCloseout.runVerificationDetail,
        source: 'lightweight_rule_engine',
        canProceed: taskCloseout.outcome === 'ready_to_complete'
          || taskCloseout.outcome === 'handoff_to_existing_child'
          || taskCloseout.outcome === 'handoff_to_existing_successor',
        requiresUserConfirmation: taskCloseout.outcome === 'needs_user_confirmation'
          || taskCloseout.outcome === 'needs_follow_up_confirmation',
        shouldPersistTaskRecord: taskCloseout.recordNeeded,
        suggestedNextAction: taskCloseout.outcome === 'ready_to_complete'
          ? 'complete'
          : taskCloseout.outcome === 'handoff_to_existing_child' || taskCloseout.outcome === 'handoff_to_existing_successor'
            ? 'handoff'
            : taskCloseout.outcome === 'pause_with_handoff'
              ? 'wait'
              : taskCloseout.outcome === 'needs_user_confirmation' || taskCloseout.outcome === 'needs_follow_up_confirmation'
                ? 'confirm'
                : 'continue',
        taskCloseout,
      };
    }
    case 'project': {
      const project = evaluateProjectVerification({
        task: input.task,
        childTasks: input.childTasks,
        artifactCount: input.artifactCount,
        keySourceCount: input.keySourceCount,
        pendingDecisionCount: input.pendingDecisionCount ?? 0,
        decisionEffect: input.decisionEffect ?? null,
      });
      const tone: RuntimeVerificationTone = project.outcome === 'ready_to_complete'
        ? 'pass'
        : project.outcome === 'needs_user_confirmation' || project.outcome === 'blocked_or_waiting'
          ? 'warn'
          : 'pending';
      return {
        mode: input.mode,
        tone,
        label: project.outcome === 'ready_to_complete'
          ? '项目检查：可收尾'
          : project.outcome === 'missing_structure'
            ? '项目检查：缺少结构'
            : project.outcome === 'blocked_or_waiting'
              ? '项目检查：仍有阻塞或等待'
              : project.outcome === 'needs_user_confirmation'
                ? '项目检查：需要拍板'
                : '项目检查：仍需推进',
        detail: project.reason,
        source: 'lightweight_rule_engine',
        canProceed: project.outcome === 'ready_to_complete',
        requiresUserConfirmation: project.outcome === 'needs_user_confirmation' || project.outcome === 'blocked_or_waiting',
        shouldPersistTaskRecord: project.outcome !== 'missing_structure',
        suggestedNextAction: project.outcome === 'ready_to_complete'
          ? 'complete'
          : project.outcome === 'blocked_or_waiting'
            ? 'wait'
            : project.outcome === 'needs_user_confirmation'
              ? 'confirm'
              : 'continue',
        project,
      };
    }
    case 'context_clear': {
      const coverage = evaluateTaskMemoryCoverage({
        action: 'context_clear',
        hasTaskContext: input.hasTaskContext,
        chatMessageCount: input.messageCount,
        hasSpecificHandoffSignal: input.hasSpecificHandoffSignal,
        memoryWriteCompleted: input.memoryWriteCompleted,
      });
      const hasActiveDiscussion = input.hasTaskContext && input.messageCount > 0;
      const canProceed = coverage.canProceed;
      return {
        mode: input.mode,
        tone: canProceed ? 'pass' : 'warn',
        label: canProceed ? '上下文清理检查通过' : '上下文清理需保全',
        detail: coverage.reason,
        source: 'lightweight_rule_engine',
        canProceed,
        requiresUserConfirmation: hasActiveDiscussion,
        shouldPersistTaskRecord: coverage.recommendedWrites.includes('task_record'),
        suggestedNextAction: coverage.outcome === 'needs_memory_write'
          ? 'handoff'
          : canProceed
            ? 'continue'
            : 'wait',
        taskMemoryCoverage: coverage,
      };
    }
  }
}

function isCompletedTask(task: TaskListItemRecord): boolean {
  return task.state === 'completed' || task.state === 'archived';
}

function isBlockedOrWaitingTask(task: TaskListItemRecord): boolean {
  return Boolean(task.activeBlocker || task.activeDependency || task.activeWaitingItem || task.waitingReason || task.state === 'waiting_external');
}

function projectCriteriaOpen(task: TaskDetail): number {
  const resumeStatus = task.resumeCard?.completionStatus;
  if (resumeStatus) return resumeStatus.open;
  return task.completionCriteria.filter((criterion) => criterion.status !== 'satisfied').length;
}

function baseProjectVerification(params: {
  outcome: RuntimeProjectVerification['outcome'];
  childTotal: number;
  childCompleted: number;
  childOpen: number;
  blockerCount: number;
  waitingCount: number;
  criteriaOpen: number;
  artifactCount: number | null;
  keySourceCount: number | null;
  pendingDecisionCount: number;
  decisionEffect: DecisionEffectSummary | null;
  reason: string;
}): RuntimeProjectVerification {
  return params;
}

function evaluateProjectVerification(input: {
  task: TaskDetail;
  childTasks: TaskListItemRecord[];
  artifactCount?: number;
  keySourceCount?: number;
  pendingDecisionCount: number;
  decisionEffect?: DecisionEffectSummary | null;
}): RuntimeProjectVerification {
  const { task, childTasks } = input;
  const childTotal = childTasks.length;
  const childCompleted = childTasks.filter(isCompletedTask).length;
  const childOpen = childTotal - childCompleted;
  const blockerCount = childTasks.filter((child) => Boolean(child.activeBlocker || child.activeDependency)).length;
  const waitingCount = childTasks.filter((child) => Boolean(child.activeWaitingItem || child.waitingReason || child.state === 'waiting_external')).length;
  const criteriaOpen = projectCriteriaOpen(task);
  const artifactCount = input.artifactCount ?? null;
  const keySourceCount = input.keySourceCount ?? null;
  const decisionEffect = input.decisionEffect ?? null;
  const pendingDecisionCount = decisionEffect?.pendingCount ?? input.pendingDecisionCount;

  if (childTotal === 0) {
    return baseProjectVerification({
      outcome: 'missing_structure',
      childTotal,
      childCompleted,
      childOpen,
      blockerCount,
      waitingCount,
      criteriaOpen,
      artifactCount,
      keySourceCount,
      pendingDecisionCount,
      decisionEffect,
      reason: '项目还没有子任务结构，应先生成并确认项目拆解草稿。',
    });
  }

  if (blockerCount > 0 || waitingCount > 0) {
    return baseProjectVerification({
      outcome: 'blocked_or_waiting',
      childTotal,
      childCompleted,
      childOpen,
      blockerCount,
      waitingCount,
      criteriaOpen,
      artifactCount,
      keySourceCount,
      pendingDecisionCount,
      decisionEffect,
      reason: `项目仍有 ${blockerCount} 个阻塞/依赖子任务和 ${waitingCount} 个等待子任务，应先处理这些子任务。`,
    });
  }

  if (childOpen > 0) {
    return baseProjectVerification({
      outcome: 'continue_children',
      childTotal,
      childCompleted,
      childOpen,
      blockerCount,
      waitingCount,
      criteriaOpen,
      artifactCount,
      keySourceCount,
      pendingDecisionCount,
      decisionEffect,
      reason: `项目仍有 ${childOpen} 个未完成子任务，应继续推进子任务。`,
    });
  }

  if (criteriaOpen > 0) {
    return baseProjectVerification({
      outcome: 'continue_parent',
      childTotal,
      childCompleted,
      childOpen,
      blockerCount,
      waitingCount,
      criteriaOpen,
      artifactCount,
      keySourceCount,
      pendingDecisionCount,
      decisionEffect,
      reason: `所有子任务已完成，但父任务仍有 ${criteriaOpen} 条完成标准未满足。`,
    });
  }

  if (pendingDecisionCount > 0 || decisionEffect?.tone === 'deferred' || task.riskLevel === 'medium' || task.riskLevel === 'high') {
    return baseProjectVerification({
      outcome: 'needs_user_confirmation',
      childTotal,
      childCompleted,
      childOpen,
      blockerCount,
      waitingCount,
      criteriaOpen,
      artifactCount,
      keySourceCount,
      pendingDecisionCount,
      decisionEffect,
      reason: pendingDecisionCount > 0 || decisionEffect?.tone === 'deferred'
        ? decisionEffect?.effectDetail ?? `项目仍有 ${pendingDecisionCount} 个待决策事项，完成前需要用户拍板。`
        : `项目风险为 ${task.riskLevel}，完成前需要用户确认。`,
    });
  }

  if (artifactCount === 0 || keySourceCount === 0) {
    return baseProjectVerification({
      outcome: 'needs_user_confirmation',
      childTotal,
      childCompleted,
      childOpen,
      blockerCount,
      waitingCount,
      criteriaOpen,
      artifactCount,
      keySourceCount,
      pendingDecisionCount,
      decisionEffect,
      reason: artifactCount === 0 && keySourceCount === 0
        ? '所有子任务已完成，但项目缺少关键来源和产出证据，完成前需要用户确认。'
        : artifactCount === 0
          ? '所有子任务已完成，但项目缺少可复核产出证据，完成前需要用户确认。'
          : '所有子任务已完成，但项目缺少关键来源证据，完成前需要用户确认。',
    });
  }

  return baseProjectVerification({
    outcome: 'ready_to_complete',
    childTotal,
    childCompleted,
    childOpen,
    blockerCount,
    waitingCount,
    criteriaOpen,
    artifactCount,
    keySourceCount,
    pendingDecisionCount,
    decisionEffect,
    reason: '所有子任务已完成，父任务完成标准已满足，且没有阻塞、等待或待拍板事项。',
  });
}
