import type { DecisionRecord } from '../../../shared/types/decision.js';
import type { BlockerRecord } from '../../../shared/types/blocker.js';
import type { SourceContextRecord } from '../../../shared/types/source-context.js';
import type { TaskListItemRecord } from '../../../shared/types/task.js';
import type { TaskFileRecord } from '../../../shared/types/task-file.js';
import type { TaskplaneWritebackApplyPlan } from '../../../shared/taskplane-writeback-apply-plan.js';
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
  'createBlocker' | 'createSourceContext' | 'recordTimelineEvent' | 'update'
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
}

function getPlanTargetTaskId(plan: TaskplaneWritebackApplyPlan): string | null | undefined {
  if (plan.action === 'task.update_next_step') return plan.input.id;
  if (plan.action === 'task_file.update') return plan.taskId;
  return plan.input.taskId;
}
