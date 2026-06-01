import type { CreateBlockerInput } from './types/blocker.js';
import type { CreateDecisionInput, DecisionSourceType } from './types/decision.js';
import type { CreateSourceContextInput } from './types/source-context.js';
import type { TaskListItemRecord, UpdateTaskInput } from './types/task.js';
import type { CreateTaskFileInput, UpdateTaskFileInput } from './types/task-file.js';
import type { PanelRuntimeTimelineEventType } from './runtime-panel-events.js';
import { planBusinessLineRunControl, type BusinessLineRunQueuePolicy } from './business-line-run-control.js';
import type {
  BusinessLineRecordType,
  RecordBusinessLineReviewInput,
} from './types/business-line.js';
import type { RunStatus } from './types/run.js';
import type {
  TaskplaneArtifactWritebackProposal,
  TaskplaneBusinessLineWritebackProposal,
  TaskplaneSourceContextWritebackProposal,
  TaskplaneStructuredWritebackProposal,
} from './taskplane-writeback-proposal.js';

export type TaskplaneWritebackTimelineDraft = {
  payload: Record<string, unknown>;
  type: PanelRuntimeTimelineEventType;
};

export type TaskplaneSubtaskDraftInput = {
  acceptanceCriteria: string;
  dependency?: string | null;
  rationale?: string | null;
  summary: string;
  title: string;
};

export type TaskplaneSubtaskCreateManyInput = {
  evidenceRunId?: string | null;
  nextStep?: string | null;
  parentSummary?: string | null;
  parentTaskId: string;
  review?: string | null;
  source: 'agent_api_decomposition' | 'agent_cli_decomposition' | 'taskplane_write_intent';
  subtasks: TaskplaneSubtaskDraftInput[];
};

export type TaskplaneSubtaskCreateManyRuntimeContract = {
  evidenceRunId?: string | null;
  invocationLayer: 'api_runtime' | 'selected_runtime';
  parentTaskId?: string | null;
  phase: 'decomposition_draft';
  provider?: string | null;
  runtimeLabel?: string | null;
  runtimeMode: 'api' | 'codex' | 'claude';
};

export type TaskplaneSubtaskCreateManyConfirmationSurface =
  | 'right_panel_decomposition_confirmation'
  | 'tasks_project_decomposition_confirmation'
  | 'taskplane_writeback_approval_queue'
  | 'readiness_smoke_operator_confirmation';

export type TaskplaneSchedulerDecisionConfirmationSurface =
  | 'task_dynamics_scheduler_decision_approval_queue'
  | 'readiness_smoke_task_dynamics_scheduler_decision_approval_queue';

export type TaskplaneDurableWritebackConfirmationSurface =
  | 'right_panel_writeback_confirmation'
  | 'taskplane_writeback_approval_queue'
  | 'readiness_smoke_operator_confirmation';

export type TaskplaneSubtaskCreateManyResult = {
  createdTasks: TaskListItemRecord[];
  taskRecordPath?: string | null;
  updatedTask?: TaskListItemRecord | null;
};

export type TaskplaneSourceContextWritebackApplyPlan = {
  action: 'source_context.create';
  confirmationSurface: TaskplaneDurableWritebackConfirmationSurface;
  input: CreateSourceContextInput;
  successMessage: string;
  timeline: TaskplaneWritebackTimelineDraft;
};

type TaskplaneArtifactWritebackInput = {
  businessLineId?: string | null;
  content: string;
  runId: string;
  taskId: string;
  title: string;
};

export type TaskplaneArtifactWritebackApplyPlan =
  | {
      action: 'artifact.create_note_from_run';
      input: TaskplaneArtifactWritebackInput;
      successMessage: string;
      timeline: TaskplaneWritebackTimelineDraft;
    }
  | {
      action: 'artifact.create_patch_from_run';
      input: TaskplaneArtifactWritebackInput;
      successMessage: string;
      timeline: TaskplaneWritebackTimelineDraft;
    };

export type TaskplaneSubtaskWritebackApplyPlan = {
  action: 'subtask.create_many';
  input: TaskplaneSubtaskCreateManyInput;
  successMessage: string;
  timeline: TaskplaneWritebackTimelineDraft;
};

export type TaskplaneTaskFileWritebackApplyPlan =
  | {
      action: 'task_file.create';
      input: CreateTaskFileInput;
      requiredApi: 'createTaskFile';
      successMessage: string;
      taskId: string;
      timeline: TaskplaneWritebackTimelineDraft;
    }
  | {
      action: 'task_file.update';
      input: UpdateTaskFileInput;
      requiredApi: 'updateTaskFile';
      successMessage: string;
      taskId: string;
      timeline: TaskplaneWritebackTimelineDraft;
    };

export type TaskplaneStructuredWritebackApplyPlan =
  | {
      action: 'decision.create';
      confirmationBoundary?: 'task_dynamics_scheduler_decision_confirmed';
      confirmationSurface?: TaskplaneSchedulerDecisionConfirmationSurface;
      draftOnlyBeforeConfirmation?: true;
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

export type TaskplaneBusinessLineRecordCreateInput = {
  businessLineId: string | null;
  confidence?: number;
  linkedActionId?: string | null;
  linkedDecisionId?: string | null;
  shouldAffectFutureContext?: boolean;
  source: string;
  sourceActionId?: string | null;
  summary: string;
  type: BusinessLineRecordType;
};

export type TaskplaneBusinessNextActionCreateInput = {
  businessLineId: string | null;
  currentRunStatus?: RunStatus | null;
  evidenceRunId?: string | null;
  interruptCurrentRun?: boolean;
  nextStep?: string | null;
  operatorConfirmed?: boolean;
  queuePolicy?: BusinessLineRunQueuePolicy | null;
  riskLevel?: 'none' | 'low' | 'medium' | 'high' | null;
  riskNote?: string | null;
  sourceActionId?: string | null;
  summary?: string | null;
  title: string;
};

export type TaskplaneBusinessSopRevisionProposeInput = {
  businessLineId: string | null;
  changeReason: string;
  evidenceItems?: string[];
  evidenceRunId?: string | null;
  nextContent: string;
  requiresDecision?: boolean;
  reviewAfterAt?: string | null;
  scopePath?: string | null;
  sourceActionId?: string | null;
};

export type TaskplaneBusinessLineWritebackApplyPlan =
  | {
      action: 'business_record.create';
      input: TaskplaneBusinessLineRecordCreateInput;
      successMessage: string;
      timeline: TaskplaneWritebackTimelineDraft;
    }
  | {
      action: 'business_review.record';
      input: RecordBusinessLineReviewInput;
      successMessage: string;
      timeline: TaskplaneWritebackTimelineDraft;
    }
  | {
      action: 'business_next_action.create';
      confirmationBoundary: 'taskplane_writeback_approval_queue';
      confirmationSurface: TaskplaneDurableWritebackConfirmationSurface;
      draftOnlyBeforeConfirmation: true;
      input: TaskplaneBusinessNextActionCreateInput;
      successMessage: string;
      timeline: TaskplaneWritebackTimelineDraft;
    }
  | {
      action: 'business_sop_revision.propose';
      input: TaskplaneBusinessSopRevisionProposeInput;
      successMessage: string;
      timeline: TaskplaneWritebackTimelineDraft;
    }
  | {
      action: 'business_handoff.record';
      input: TaskplaneBusinessLineRecordCreateInput;
      successMessage: string;
      timeline: TaskplaneWritebackTimelineDraft;
    };

export type TaskplaneWritebackApplyPlan =
  | TaskplaneArtifactWritebackApplyPlan
  | TaskplaneBusinessLineWritebackApplyPlan
  | TaskplaneSourceContextWritebackApplyPlan
  | TaskplaneSubtaskWritebackApplyPlan
  | TaskplaneTaskFileWritebackApplyPlan
  | TaskplaneStructuredWritebackApplyPlan;

export function buildSubtaskCreateManyWritebackApplyPlan(params: {
  confirmationSurface: TaskplaneSubtaskCreateManyConfirmationSurface;
  evidenceRunId?: string | null;
  nextStep?: string | null;
  parentSummary?: string | null;
  parentTaskId: string;
  review?: string | null;
  runtimeContract?: TaskplaneSubtaskCreateManyRuntimeContract | null;
  source?: 'agent_api_decomposition' | 'agent_cli_decomposition' | 'taskplane_write_intent';
  subtasks: TaskplaneSubtaskDraftInput[];
}): TaskplaneSubtaskWritebackApplyPlan {
  const runtimeContract = params.runtimeContract
    ? {
        evidenceRunId: params.runtimeContract.evidenceRunId ?? null,
        invocationLayer: params.runtimeContract.invocationLayer,
        parentTaskId: params.runtimeContract.parentTaskId ?? null,
        phase: params.runtimeContract.phase,
        provider: params.runtimeContract.provider ?? null,
        runtimeLabel: params.runtimeContract.runtimeLabel,
        runtimeMode: params.runtimeContract.runtimeMode,
      }
    : null;
  return {
    action: 'subtask.create_many',
    input: {
      evidenceRunId: params.evidenceRunId ?? null,
      nextStep: params.nextStep ?? null,
      parentSummary: params.parentSummary ?? null,
      parentTaskId: params.parentTaskId,
      review: params.review ?? null,
      source: params.source ?? 'agent_cli_decomposition',
      subtasks: params.subtasks,
    },
    successMessage: `已根据拆解草案创建 ${params.subtasks.length} 个子任务。`,
    timeline: {
      type: 'panel.project_decomposed',
      payload: {
        confirmationBoundary: 'operator_confirmed_subtask_create_many',
        confirmationSurface: params.confirmationSurface,
        draftOnlyBeforeConfirmation: true,
        evidenceRunId: params.evidenceRunId ?? null,
        nextStep: params.nextStep ?? null,
        review: params.review ?? null,
        runtimeContract,
        source: params.source ?? 'agent_cli_decomposition',
        subtaskCount: params.subtasks.length,
      },
    },
  };
}

export function formatSubtaskDraftSummary(subtask: TaskplaneSubtaskDraftInput): string {
  return [
    subtask.summary,
    subtask.acceptanceCriteria ? `验收：${subtask.acceptanceCriteria}` : null,
    subtask.dependency ? `依赖：${subtask.dependency}` : null,
    subtask.rationale ? `理由：${subtask.rationale}` : null,
  ].filter(Boolean).join('\n');
}

export function buildTaskFileWritebackApplyPlan(params: {
  evidenceRunId?: string | null;
  input: CreateTaskFileInput;
  source: 'right_panel_file_proposal' | 'task_memory_write_proposal' | 'taskplane_write_intent';
  surface: string;
  surfaceLabel: string;
  taskId: string;
}): TaskplaneTaskFileWritebackApplyPlan {
  const businessLineId = params.input.businessLineId ?? null;
  const path = params.input.path ?? params.input.name;
  return {
    action: 'task_file.create',
    input: params.input,
    requiredApi: 'createTaskFile',
    successMessage: `已确认并写入任务文件：${path}。`,
    taskId: params.taskId,
    timeline: {
      type: 'panel.task_file_written',
      payload: {
        evidenceRunId: params.evidenceRunId ?? null,
        businessLineId,
        path,
        source: params.source,
        surface: params.surface,
        surfaceLabel: params.surfaceLabel,
      },
    },
  };
}

export function buildTaskFileUpdateWritebackApplyPlan(params: {
  businessLineId?: string | null;
  evidenceRunId?: string | null;
  input: UpdateTaskFileInput;
  path: string;
  source: 'right_panel_file_proposal' | 'task_memory_write_proposal' | 'taskplane_write_intent';
  surface: string;
  surfaceLabel: string;
  taskId: string;
}): TaskplaneTaskFileWritebackApplyPlan {
  const businessLineId = params.businessLineId ?? null;
  return {
    action: 'task_file.update',
    input: params.input,
    requiredApi: 'updateTaskFile',
    successMessage: `已确认并更新任务文件：${params.path}。`,
    taskId: params.taskId,
    timeline: {
      type: 'panel.task_file_written',
      payload: {
        evidenceRunId: params.evidenceRunId ?? null,
        businessLineId,
        path: params.path,
        source: params.source,
        surface: params.surface,
        surfaceLabel: params.surfaceLabel,
      },
    },
  };
}

export function buildSourceContextWritebackApplyPlan(params: {
  capturedAt?: string;
  confirmationSurface?: TaskplaneDurableWritebackConfirmationSurface;
  proposal: TaskplaneSourceContextWritebackProposal;
  taskId: string;
}): TaskplaneSourceContextWritebackApplyPlan {
  const { proposal } = params;
  const confirmationSurface = params.confirmationSurface ?? 'right_panel_writeback_confirmation';
  return {
    action: 'source_context.create',
    confirmationSurface,
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
      businessLineId: proposal.businessLineId ?? null,
      taskId: params.taskId,
      title: proposal.title,
      uri: proposal.uri ?? null,
    },
    successMessage: `已确认并保存来源上下文：${proposal.title}。`,
    timeline: {
      type: 'panel.source_updated',
      payload: {
        confirmationSurface,
        evidenceRunId: proposal.evidenceRunId,
        businessLineId: proposal.businessLineId ?? null,
        source: 'taskplane_write_intent',
        title: proposal.title,
        uri: proposal.uri ?? null,
      },
    },
  };
}

export function buildArtifactWritebackApplyPlan(params: {
  proposal: TaskplaneArtifactWritebackProposal;
  taskId: string;
}): TaskplaneArtifactWritebackApplyPlan {
  const { proposal } = params;
  return {
    action: proposal.kind === 'patch' ? 'artifact.create_patch_from_run' : 'artifact.create_note_from_run',
    input: {
      content: proposal.content,
      runId: proposal.evidenceRunId,
      businessLineId: proposal.businessLineId ?? null,
      taskId: params.taskId,
      title: proposal.title,
    },
    successMessage: `已确认并保存任务产物：${proposal.title}。`,
    timeline: {
      type: 'panel.artifact_written',
      payload: {
        evidenceRunId: proposal.evidenceRunId,
        businessLineId: proposal.businessLineId ?? null,
        kind: proposal.kind,
        source: 'taskplane_write_intent',
        title: proposal.title,
      },
    },
  };
}

export function buildBusinessLineWritebackApplyPlan(params: {
  confirmationSurface?: TaskplaneDurableWritebackConfirmationSurface;
  proposal: TaskplaneBusinessLineWritebackProposal;
  runStatus?: RunStatus | null;
}): TaskplaneBusinessLineWritebackApplyPlan {
  const { intent } = params.proposal;
  const businessLineId = params.proposal.businessLineId ?? null;
  const confirmationSurface = params.confirmationSurface ?? 'right_panel_writeback_confirmation';
  const basePayload = {
    businessLineId,
    confirmationSurface,
    evidenceRunId: params.proposal.evidenceRunId,
    source: 'taskplane_write_intent',
  };
  if (intent.type === 'business_record.create') {
    return {
      action: 'business_record.create',
      input: {
        businessLineId,
        confidence: intent.confidence,
        shouldAffectFutureContext: intent.shouldAffectFutureContext ?? true,
        source: intent.source ?? `run:${intent.evidenceRunId}`,
        sourceActionId: intent.taskId ?? null,
        summary: intent.summary,
        type: intent.recordType ?? 'signal',
      },
      successMessage: '已确认并保存业务记录。',
      timeline: {
        type: 'panel.business_record_written',
        payload: {
          ...basePayload,
          recordType: intent.recordType ?? 'signal',
        },
      },
    };
  }
  if (intent.type === 'business_review.record') {
    return {
      action: 'business_review.record',
      input: {
        businessLineId: businessLineId ?? '',
        confidence: intent.confidence,
        evidenceItems: intent.evidenceItems ?? [`run:${intent.evidenceRunId}`],
        hypothesisChange: intent.hypothesisChange ?? null,
        nextActionSuggestions: intent.nextActionSuggestions ?? [],
        requiresDecision: intent.requiresDecision ?? false,
        resultSummary: intent.resultSummary,
        skillUpdateSuggestions: intent.skillUpdateSuggestions ?? [],
        sourceActionId: intent.sourceActionId ?? intent.taskId ?? null,
        sourceRunId: intent.evidenceRunId,
      },
      successMessage: '已确认并保存业务复盘。',
      timeline: {
        type: 'panel.business_review_written',
        payload: basePayload,
      },
    };
  }
  if (intent.type === 'business_next_action.create') {
    const queuePlan = planBusinessLineRunControl({
      businessLineId,
      evidenceRunId: intent.evidenceRunId,
      interruptCurrentRun: false,
      kind: 'queue_next_action',
      nextActionNextStep: intent.nextStep ?? intent.title,
      nextActionSummary: intent.summary ?? null,
      nextActionTitle: intent.title,
      operatorConfirmed: false,
      riskLevel: intent.riskLevel ?? null,
      riskNote: intent.riskNote ?? null,
      runId: intent.evidenceRunId,
      runStatus: params.runStatus ?? null,
      sourceActionId: intent.sourceActionId ?? intent.taskId ?? null,
    });
    const queuePolicy = queuePlan.status === 'ready' && queuePlan.kind === 'queue_next_action'
      ? queuePlan.queuePolicy
      : null;
    return {
      action: 'business_next_action.create',
      confirmationBoundary: 'taskplane_writeback_approval_queue',
      confirmationSurface,
      draftOnlyBeforeConfirmation: true,
      input: {
        businessLineId,
        currentRunStatus: params.runStatus ?? null,
        evidenceRunId: intent.evidenceRunId,
        interruptCurrentRun: false,
        nextStep: intent.nextStep ?? intent.title,
        operatorConfirmed: true,
        queuePolicy,
        riskLevel: intent.riskLevel ?? queuePolicy?.riskLevel ?? null,
        riskNote: intent.riskNote ?? queuePolicy?.riskNote ?? null,
        sourceActionId: intent.sourceActionId ?? intent.taskId ?? null,
        summary: intent.summary ?? null,
        title: intent.title,
      },
      successMessage: `已确认并创建业务线 Next Action：${intent.title}。`,
      timeline: {
        type: 'panel.business_next_action_written',
        payload: {
          ...basePayload,
          confirmationBoundary: 'taskplane_writeback_approval_queue',
          draftOnlyBeforeConfirmation: true,
          queuePolicy,
          title: intent.title,
        },
      },
    };
  }
  if (intent.type === 'business_sop_revision.propose') {
    return {
      action: 'business_sop_revision.propose',
      input: {
        businessLineId,
        changeReason: intent.changeReason,
        evidenceItems: intent.evidenceItems ?? [`run:${intent.evidenceRunId}`],
        evidenceRunId: intent.evidenceRunId,
        nextContent: intent.nextContent,
        requiresDecision: intent.requiresDecision ?? false,
        reviewAfterAt: intent.reviewAfterAt ?? null,
        scopePath: intent.scopePath ?? 'Learning / SOP',
        sourceActionId: intent.sourceActionId ?? intent.taskId ?? null,
      },
      successMessage: '已确认并提出业务线 SOP revision。',
      timeline: {
        type: 'panel.business_sop_revision_proposed',
        payload: {
          ...basePayload,
          requiresDecision: intent.requiresDecision ?? false,
          scopePath: intent.scopePath ?? 'Learning / SOP',
        },
      },
    };
  }
  return {
    action: 'business_handoff.record',
    input: {
      businessLineId,
      confidence: 75,
      linkedActionId: intent.sourceActionId ?? intent.taskId ?? null,
      shouldAffectFutureContext: intent.shouldAffectFutureContext ?? true,
      source: `handoff:${intent.evidenceRunId}`,
      sourceActionId: intent.sourceActionId ?? intent.taskId ?? null,
      summary: [
        `Current: ${intent.currentState}`,
        `Next: ${intent.nextSafeAction}`,
        `Reason: ${intent.reason}`,
        ...(intent.evidenceItems ?? []).map((item) => `Evidence: ${item}`),
      ].join('\n'),
      type: 'review',
    },
    successMessage: '已确认并保存业务交接记录。',
    timeline: {
      type: 'panel.business_handoff_written',
      payload: basePayload,
    },
  };
}

export function buildStructuredWritebackApplyPlan(params: {
  proposal: TaskplaneStructuredWritebackProposal;
  sourceId?: string;
  sourceLabel?: string;
  sourceType?: DecisionSourceType;
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
        scope: params.proposal.businessLineId ? 'business_line' : 'task',
        sourceId: params.sourceId ?? intent.evidenceRunId,
        sourceLabel: params.sourceLabel ?? 'Agent CLI Write Intent',
        sourceType: params.sourceType ?? 'run',
        businessLineId: params.proposal.businessLineId ?? null,
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
        businessLineId: params.proposal.businessLineId ?? null,
        nextStep: intent.nextStep,
      },
      nextStep: intent.nextStep,
      requiredApi: 'updateTask',
      successMessage: `已确认并更新下一步：${intent.nextStep}`,
      timeline: {
        type: 'panel.task_goal_updated',
        payload: {
          evidenceRunId: intent.evidenceRunId,
          businessLineId: params.proposal.businessLineId ?? null,
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
      sourceLabel: params.sourceLabel ?? 'Agent CLI Write Intent',
      sourceType: 'run',
      businessLineId: params.proposal.businessLineId ?? null,
      taskId: params.taskId,
      title: '确认任务是否完成',
    },
    requiredApi: 'createDecision',
    successMessage: '已确认并创建完成验收 Decision。',
  };
}
