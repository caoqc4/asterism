import type { DecisionRecord } from '../../../shared/types/decision.js';
import type { BlockerRecord } from '../../../shared/types/blocker.js';
import type { SourceContextRecord } from '../../../shared/types/source-context.js';
import type { TaskExecutionType, TaskListItemRecord } from '../../../shared/types/task.js';
import type { TaskFileRecord } from '../../../shared/types/task-file.js';
import {
  formatSubtaskDraftSummary,
  type TaskplaneSubtaskCreateManyInput,
  type TaskplaneSubtaskCreateManyResult,
  type TaskplaneWritebackApplyPlan,
} from '../../../shared/taskplane-writeback-apply-plan.js';
import {
  dispatchTaskplaneWritebackApplyPlan,
  type TaskplaneWritebackDispatchResult,
} from '../../../shared/taskplane-writeback-dispatch.js';
import type { PanelRuntimeTimelineEventType } from '../../../shared/runtime-panel-events.js';
import type { TaskService } from '../task/task-service.js';
import type { DecisionService } from '../decision/decision-service.js';
import type { TaskFileRepository } from '../../db/repositories/task-file-repository.js';

export type TaskplaneWritebackTaskServicePort = Pick<
  TaskService,
  | 'create'
  | 'createBlocker'
  | 'createCompletionCriteria'
  | 'createSourceContext'
  | 'createTaskDependency'
  | 'getDetail'
  | 'recordTimelineEvent'
  | 'transition'
  | 'update'
>;

export type TaskplaneWritebackDecisionServicePort = Pick<DecisionService, 'create'>;

export type TaskplaneWritebackTaskFileRepositoryPort = Pick<TaskFileRepository, 'create' | 'findById' | 'update'>;

export class TaskplaneWritebackDispatchService {
  constructor(
    private readonly taskService: TaskplaneWritebackTaskServicePort,
    private readonly decisionService: TaskplaneWritebackDecisionServicePort,
    private readonly taskFileRepository: TaskplaneWritebackTaskFileRepositoryPort,
  ) {}

  async dispatch(params: {
    plan: TaskplaneWritebackApplyPlan;
    taskId: string;
  }): Promise<TaskplaneWritebackDispatchResult> {
    const targetTaskId = getPlanTargetTaskId(params.plan);
    if (targetTaskId !== params.taskId) {
      return {
        action: params.plan.action,
        message: 'Write Intent 已暂停：计划目标任务与当前任务不一致。',
        status: 'blocked',
      };
    }
    if (params.plan.action === 'task_file.update') {
      const existing = await this.taskFileRepository.findById(params.plan.input.id);
      if (!existing || existing.taskId !== params.taskId) {
        return {
          action: params.plan.action,
          message: 'Write Intent 已暂停：任务文件不属于当前任务。',
          status: 'blocked',
        };
      }
    }

    return dispatchTaskplaneWritebackApplyPlan({
      plan: params.plan,
      taskId: params.taskId,
      ports: {
        createBlocker: (input): Promise<BlockerRecord> => this.taskService.createBlocker(input),
        createDecision: (input): Promise<DecisionRecord> => this.decisionService.create(input),
        createSourceContext: (input): Promise<SourceContextRecord> => this.taskService.createSourceContext(input),
        createSubtasks: (input): Promise<TaskplaneSubtaskCreateManyResult> => this.createSubtasks(input),
        createTaskFile: (input): Promise<TaskFileRecord> => this.taskFileRepository.create(input),
        recordTimelineEvent: (
          taskId: string,
          type: PanelRuntimeTimelineEventType,
          payload: Record<string, unknown>,
        ): Promise<void> => this.taskService.recordTimelineEvent({
          payload,
          taskId,
          type,
        }),
        updateTaskFile: (input): Promise<TaskFileRecord> => this.taskFileRepository.update(input),
        updateTask: (input): Promise<TaskListItemRecord> => this.taskService.update(input),
      },
    });
  }

  private async createSubtasks(
    input: TaskplaneSubtaskCreateManyInput,
  ): Promise<TaskplaneSubtaskCreateManyResult> {
    const parent = await this.taskService.getDetail(input.parentTaskId);
    if (!parent) {
      throw new Error(`Parent task not found: ${input.parentTaskId}`);
    }

    let updatedTask: TaskListItemRecord | null = null;
    const previousType = parent.taskType ?? 'simple';
    const nextFacets: TaskExecutionType[] = Array.from(
      new Set<TaskExecutionType>([
        'project',
        previousType,
        ...(parent.taskFacets ?? []),
      ]),
    );
    const shouldUpdateParent =
      parent.taskType !== 'project'
      || Boolean(input.nextStep?.trim());
    if (shouldUpdateParent) {
      updatedTask = await this.taskService.update({
        id: input.parentTaskId,
        nextStep: input.nextStep?.trim() || parent.nextStep,
        taskFacets: nextFacets,
        taskType: 'project',
      });
    }

    const createdTasks: TaskListItemRecord[] = [];
    for (const subtask of input.subtasks) {
      const created = await this.taskService.create({
        title: subtask.title,
        summary: formatSubtaskDraftSummary(subtask),
        taskType: 'simple',
        taskFacets: ['simple'],
        parentTaskId: input.parentTaskId,
      });
      const planned = await this.taskService.transition({
        id: created.id,
        nextState: 'planned',
      });
      createdTasks.push(planned);
      if (subtask.acceptanceCriteria.trim()) {
        await this.taskService.createCompletionCriteria({
          taskId: planned.id,
          text: subtask.acceptanceCriteria,
          verificationResponsibility: 'unknown',
        }).catch(() => null);
      }
    }

    const createdByTitle = new Map(createdTasks.map((task) => [task.title.trim(), task]));
    await Promise.all(input.subtasks.map((subtask, index) => {
      const dependencyTitle = subtask.dependency?.trim();
      if (!dependencyTitle) return Promise.resolve(null);
      const dependency = createdByTitle.get(dependencyTitle)
        ?? createdTasks.find((task) => (
          dependencyTitle.includes(task.title.trim()) || task.title.trim().includes(dependencyTitle)
        ));
      const child = createdTasks[index];
      if (!child || !dependency || dependency.id === child.id) return Promise.resolve(null);
      return this.taskService.createTaskDependency({
        taskId: child.id,
        blockedByTaskId: dependency.id,
        reason: subtask.dependency ?? null,
      }).catch(() => null);
    }));

    return {
      createdTasks,
      updatedTask,
    };
  }
}

function getPlanTargetTaskId(plan: TaskplaneWritebackApplyPlan): string | null | undefined {
  if (plan.action === 'task.update_next_step') return plan.input.id;
  if (plan.action === 'task_file.update') return plan.taskId;
  if (plan.action === 'subtask.create_many') return plan.input.parentTaskId;
  return plan.input.taskId;
}
