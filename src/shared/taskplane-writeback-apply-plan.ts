import type { CreateBlockerInput } from './types/blocker.js';
import type { CreateDecisionInput } from './types/decision.js';
import type { CreateSourceContextInput } from './types/source-context.js';
import type { UpdateTaskInput } from './types/task.js';
import type { PanelRuntimeTimelineEventType } from './runtime-panel-events.js';
import type {
  TaskplaneSourceContextWritebackProposal,
  TaskplaneStructuredWritebackProposal,
} from './taskplane-writeback-proposal.js';

export type TaskplaneWritebackTimelineDraft = {
  payload: Record<string, unknown>;
  type: PanelRuntimeTimelineEventType;
};

export type TaskplaneSourceContextWritebackApplyPlan = {
  action: 'source_context.create';
  input: CreateSourceContextInput;
  successMessage: string;
  timeline: TaskplaneWritebackTimelineDraft;
};

export type TaskplaneStructuredWritebackApplyPlan =
  | {
      action: 'decision.create';
      input: CreateDecisionInput;
      requiredApi: 'createDecision';
      successMessage: string;
    }
  | {
      action: 'task.update_next_step';
      input: UpdateTaskInput;
      nextStep: string;
      requiredApi: 'updateTask';
      successMessage: string;
      timeline: TaskplaneWritebackTimelineDraft;
    }
  | {
      action: 'blocker.create';
      input: CreateBlockerInput;
      requiredApi: 'createBlocker';
      successMessage: string;
    }
  | {
      action: 'completion_decision.create';
      input: CreateDecisionInput;
      requiredApi: 'createDecision';
      successMessage: string;
    };

export type TaskplaneWritebackApplyPlan =
  | TaskplaneSourceContextWritebackApplyPlan
  | TaskplaneStructuredWritebackApplyPlan;

export function buildSourceContextWritebackApplyPlan(params: {
  capturedAt?: string;
  proposal: TaskplaneSourceContextWritebackProposal;
  taskId: string;
}): TaskplaneSourceContextWritebackApplyPlan {
  const { proposal } = params;
  return {
    action: 'source_context.create',
    input: {
      content: proposal.uri
        ? `Source: ${proposal.uri}\n\n${proposal.note}`
        : proposal.note,
      credibility: proposal.credibility ?? 'unknown',
      capturedAt: params.capturedAt ?? new Date().toISOString(),
      isKey: true,
      kind: proposal.uri ? 'link' : 'note',
      note: proposal.note,
      runId: proposal.evidenceRunId,
      sourceRole: proposal.uri ? 'raw' : 'digest',
      taskId: params.taskId,
      title: proposal.title,
      uri: proposal.uri ?? null,
    },
    successMessage: `已确认并保存来源上下文：${proposal.title}。`,
    timeline: {
      type: 'panel.source_updated',
      payload: {
        evidenceRunId: proposal.evidenceRunId,
        source: 'taskplane_write_intent',
        title: proposal.title,
        uri: proposal.uri ?? null,
      },
    },
  };
}

export function buildStructuredWritebackApplyPlan(params: {
  proposal: TaskplaneStructuredWritebackProposal;
  taskId: string;
}): TaskplaneStructuredWritebackApplyPlan {
  const { intent } = params.proposal;
  if (intent.type === 'decision.create') {
    return {
      action: 'decision.create',
      input: {
        context: {
          whyNow: intent.rationale,
          impact: intent.proposedOutcome ? `建议结果：${intent.proposedOutcome}` : null,
        },
        kind: 'direction_choice',
        options: intent.options?.map((label, index) => ({
          id: `option_${index + 1}`,
          label,
        })),
        recommendation: intent.proposedOutcome
          ? {
              label: intent.proposedOutcome,
              reason: intent.rationale,
            }
          : null,
        scope: 'task',
        sourceId: intent.evidenceRunId,
        sourceLabel: 'Agent CLI Write Intent',
        sourceType: 'run',
        taskId: params.taskId,
        title: intent.title,
      },
      requiredApi: 'createDecision',
      successMessage: `已确认并创建 Decision：${intent.title}。`,
    };
  }
  if (intent.type === 'task.update_next_step') {
    return {
      action: 'task.update_next_step',
      input: {
        id: params.taskId,
        nextStep: intent.nextStep,
      },
      nextStep: intent.nextStep,
      requiredApi: 'updateTask',
      successMessage: `已确认并更新下一步：${intent.nextStep}`,
      timeline: {
        type: 'panel.task_goal_updated',
        payload: {
          evidenceRunId: intent.evidenceRunId,
          nextStep: intent.nextStep,
          reason: intent.reason,
          source: 'taskplane_write_intent',
        },
      },
    };
  }
  if (intent.type === 'task.mark_blocked') {
    return {
      action: 'blocker.create',
      input: {
        detail: intent.unblockCondition ? `解除条件：${intent.unblockCondition}` : intent.reason,
        kind: 'other',
        taskId: params.taskId,
        title: intent.reason,
      },
      requiredApi: 'createBlocker',
      successMessage: `已确认并记录阻塞项：${intent.reason}`,
    };
  }
  return {
    action: 'completion_decision.create',
    input: {
      context: {
        whyNow: intent.evidence,
        impact: '确认后再由任务完成流程变更状态。',
      },
      kind: 'completion_acceptance',
      recommendation: {
        label: '确认完成',
        reason: intent.evidence,
      },
      scope: 'task',
      sourceId: intent.evidenceRunId,
      sourceLabel: 'Agent CLI Write Intent',
      sourceType: 'run',
      taskId: params.taskId,
      title: '确认任务是否完成',
    },
    requiredApi: 'createDecision',
    successMessage: '已确认并创建完成验收 Decision。',
  };
}
