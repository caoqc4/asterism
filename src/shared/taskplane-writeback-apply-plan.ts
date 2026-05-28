import type { CreateBlockerInput } from './types/blocker.js';
import type { CreateDecisionInput } from './types/decision.js';
import type { CreateSourceContextInput } from './types/source-context.js';
import type { TaskListItemRecord, UpdateTaskInput } from './types/task.js';
import type { CreateTaskFileInput, UpdateTaskFileInput } from './types/task-file.js';
import type { PanelRuntimeTimelineEventType } from './runtime-panel-events.js';
import type {
  TaskplaneArtifactWritebackProposal,
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
  runtimeLabel?: string | null;
  runtimeMode: 'api' | 'codex' | 'claude';
};

export type TaskplaneSubtaskCreateManyResult = {
  createdTasks: TaskListItemRecord[];
  taskRecordPath?: string | null;
  updatedTask?: TaskListItemRecord | null;
};

export type TaskplaneSourceContextWritebackApplyPlan = {
  action: 'source_context.create';
  input: CreateSourceContextInput;
  successMessage: string;
  timeline: TaskplaneWritebackTimelineDraft;
};

type TaskplaneArtifactWritebackInput = {
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
  | TaskplaneArtifactWritebackApplyPlan
  | TaskplaneSourceContextWritebackApplyPlan
  | TaskplaneSubtaskWritebackApplyPlan
  | TaskplaneTaskFileWritebackApplyPlan
  | TaskplaneStructuredWritebackApplyPlan;

export function buildSubtaskCreateManyWritebackApplyPlan(params: {
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
        ...params.runtimeContract,
        evidenceRunId: params.runtimeContract.evidenceRunId ?? params.evidenceRunId ?? null,
        parentTaskId: params.runtimeContract.parentTaskId ?? params.parentTaskId,
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
        path,
        source: params.source,
        surface: params.surface,
        surfaceLabel: params.surfaceLabel,
      },
    },
  };
}

export function buildTaskFileUpdateWritebackApplyPlan(params: {
  evidenceRunId?: string | null;
  input: UpdateTaskFileInput;
  path: string;
  source: 'right_panel_file_proposal' | 'task_memory_write_proposal' | 'taskplane_write_intent';
  surface: string;
  surfaceLabel: string;
  taskId: string;
}): TaskplaneTaskFileWritebackApplyPlan {
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
      taskId: params.taskId,
      title: proposal.title,
    },
    successMessage: `已确认并保存任务产物：${proposal.title}。`,
    timeline: {
      type: 'panel.artifact_written',
      payload: {
        evidenceRunId: proposal.evidenceRunId,
        kind: proposal.kind,
        source: 'taskplane_write_intent',
        title: proposal.title,
      },
    },
  };
}

export function buildStructuredWritebackApplyPlan(params: {
  proposal: TaskplaneStructuredWritebackProposal;
  sourceLabel?: string;
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
        sourceLabel: params.sourceLabel ?? 'Agent CLI Write Intent',
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
      sourceLabel: params.sourceLabel ?? 'Agent CLI Write Intent',
      sourceType: 'run',
      taskId: params.taskId,
      title: '确认任务是否完成',
    },
    requiredApi: 'createDecision',
    successMessage: '已确认并创建完成验收 Decision。',
  };
}
