import type { BlockerRecord } from './types/blocker.js';
import type { DecisionRecord } from './types/decision.js';
import type { SourceContextRecord } from './types/source-context.js';
import type { TaskListItemRecord } from './types/task.js';
import type { TaskFileRecord } from './types/task-file.js';
import type { ArtifactRecord } from './types/artifact.js';
import type { PanelRuntimeTimelineEventType } from './runtime-panel-events.js';
import type {
  TaskplaneSubtaskCreateManyResult,
  TaskplaneWritebackApplyPlan,
  TaskplaneWritebackTimelineDraft,
} from './taskplane-writeback-apply-plan.js';

export type TaskplaneWritebackDispatchPorts = {
  createArtifact?: TaskplaneWritebackPort<Extract<TaskplaneWritebackApplyPlan, { action: 'artifact.create_note_from_run' }>, ArtifactRecord>;
  createPatchArtifact?: TaskplaneWritebackPort<Extract<TaskplaneWritebackApplyPlan, { action: 'artifact.create_patch_from_run' }>, ArtifactRecord>;
  createBlocker?: TaskplaneWritebackPort<Extract<TaskplaneWritebackApplyPlan, { action: 'blocker.create' }>, BlockerRecord>;
  createDecision?: TaskplaneWritebackPort<
    Extract<TaskplaneWritebackApplyPlan, { action: 'decision.create' | 'completion_decision.create' }>,
    DecisionRecord
  >;
  createSourceContext?: TaskplaneWritebackPort<Extract<TaskplaneWritebackApplyPlan, { action: 'source_context.create' }>, SourceContextRecord>;
  createSubtasks?: TaskplaneWritebackPort<Extract<TaskplaneWritebackApplyPlan, { action: 'subtask.create_many' }>, TaskplaneSubtaskCreateManyResult>;
  createTaskFile?: TaskplaneWritebackPort<Extract<TaskplaneWritebackApplyPlan, { action: 'task_file.create' }>, TaskFileRecord>;
  recordTimelineEvent?: (
    taskId: string,
    type: PanelRuntimeTimelineEventType,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  updateTaskFile?: TaskplaneWritebackPort<Extract<TaskplaneWritebackApplyPlan, { action: 'task_file.update' }>, TaskFileRecord>;
  updateTask?: TaskplaneWritebackPort<Extract<TaskplaneWritebackApplyPlan, { action: 'task.update_next_step' }>, TaskListItemRecord>;
};

type TaskplaneWritebackPort<Plan extends TaskplaneWritebackApplyPlan, Result> = (
  input: Plan['input'],
) => Promise<Result>;

export type TaskplaneWritebackDispatchResult =
  | {
      action: TaskplaneWritebackApplyPlan['action'];
      status: 'blocked';
      message: string;
    }
  | {
      action: TaskplaneWritebackApplyPlan['action'];
      status: 'completed';
      createdTasks?: TaskListItemRecord[];
      successMessage: string;
      taskRecordPath?: string | null;
      updatedTask?: TaskListItemRecord | null;
    };

export async function dispatchTaskplaneWritebackApplyPlan(params: {
  plan: TaskplaneWritebackApplyPlan;
  ports: TaskplaneWritebackDispatchPorts;
  taskId: string;
}): Promise<TaskplaneWritebackDispatchResult> {
  const { plan, ports, taskId } = params;

  if (plan.action === 'artifact.create_note_from_run') {
    if (!ports.createArtifact) return blocked(plan.action, '产物提案已暂停：当前环境不支持保存任务产物。');
    await ports.createArtifact(plan.input);
    await recordTimeline(ports, taskId, plan.timeline);
    return completed(plan);
  }

  if (plan.action === 'artifact.create_patch_from_run') {
    if (!ports.createPatchArtifact) return blocked(plan.action, 'Patch 产物提案已暂停：当前环境不支持保存 patch 证据。');
    await ports.createPatchArtifact(plan.input);
    await recordTimeline(ports, taskId, plan.timeline);
    return completed(plan);
  }

  if (plan.action === 'source_context.create') {
    if (!ports.createSourceContext) return blocked(plan.action, '来源上下文提案已暂停：当前环境不支持保存来源上下文。');
    await ports.createSourceContext(plan.input);
    await recordTimeline(ports, taskId, plan.timeline);
    return completed(plan);
  }

  if (plan.action === 'task_file.create') {
    if (!ports.createTaskFile) return blocked(plan.action, '任务文件提案已暂停：当前环境不支持创建任务文件。');
    await ports.createTaskFile(plan.input);
    await recordTimeline(ports, taskId, plan.timeline);
    return completed(plan);
  }

  if (plan.action === 'task_file.update') {
    if (!ports.updateTaskFile) return blocked(plan.action, '任务文件提案已暂停：当前环境不支持更新任务文件。');
    await ports.updateTaskFile(plan.input);
    await recordTimeline(ports, taskId, plan.timeline);
    return completed(plan);
  }

  if (plan.action === 'subtask.create_many') {
    if (
      plan.timeline.payload.confirmationBoundary !== 'operator_confirmed_subtask_create_many'
      || plan.timeline.payload.draftOnlyBeforeConfirmation !== true
    ) {
      return blocked(plan.action, '子任务草案已暂停：缺少已确认的项目拆解写入边界。');
    }
    if (!ports.createSubtasks) return blocked(plan.action, '子任务草案已暂停：当前环境不支持创建项目子任务。');
    const result = await ports.createSubtasks(plan.input);
    await recordTimeline(ports, taskId, {
      ...plan.timeline,
      payload: {
        ...plan.timeline.payload,
        childTaskIds: result.createdTasks.map((task) => task.id),
        ...(result.taskRecordPath ? { recordPath: result.taskRecordPath } : {}),
      },
    });
    return completed(plan, result.updatedTask ?? null, result.createdTasks, result.taskRecordPath ?? null);
  }

  if (plan.action === 'decision.create') {
    if (!ports.createDecision) return blocked(plan.action, '决策提案已暂停：当前环境不支持创建 Decision。');
    await ports.createDecision(plan.input);
    return completed(plan);
  }

  if (plan.action === 'completion_decision.create') {
    if (!ports.createDecision) return blocked(plan.action, '完成确认提案已暂停：当前环境不支持创建 Decision。');
    await ports.createDecision(plan.input);
    return completed(plan);
  }

  if (plan.action === 'task.update_next_step') {
    if (!ports.updateTask) return blocked(plan.action, '下一步提案已暂停：当前环境不支持更新任务。');
    const updatedTask = await ports.updateTask(plan.input);
    await recordTimeline(ports, taskId, plan.timeline);
    return completed(plan, updatedTask);
  }

  if (!ports.createBlocker) return blocked(plan.action, '阻塞提案已暂停：当前环境不支持创建阻塞项。');
  await ports.createBlocker(plan.input);
  return completed(plan);
}

function completed(
  plan: TaskplaneWritebackApplyPlan,
  updatedTask: TaskListItemRecord | null = null,
  createdTasks?: TaskListItemRecord[],
  taskRecordPath?: string | null,
): Extract<TaskplaneWritebackDispatchResult, { status: 'completed' }> {
  return {
    action: plan.action,
    ...(createdTasks ? { createdTasks } : {}),
    status: 'completed',
    successMessage: plan.successMessage,
    ...(taskRecordPath ? { taskRecordPath } : {}),
    updatedTask,
  };
}

function blocked(
  action: TaskplaneWritebackApplyPlan['action'],
  message: string,
): Extract<TaskplaneWritebackDispatchResult, { status: 'blocked' }> {
  return {
    action,
    message,
    status: 'blocked',
  };
}

async function recordTimeline(
  ports: TaskplaneWritebackDispatchPorts,
  taskId: string,
  timeline: TaskplaneWritebackTimelineDraft,
): Promise<void> {
  await ports.recordTimelineEvent?.(taskId, timeline.type, timeline.payload).catch(() => undefined);
}
