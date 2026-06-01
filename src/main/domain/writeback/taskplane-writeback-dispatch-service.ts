import type { DecisionRecord } from '../../../shared/types/decision.js';
import type {
  BusinessLineRecord,
  BusinessLineSkillRevision,
  BusinessLineWorkspace,
} from '../../../shared/types/business-line.js';
import type { BlockerRecord } from '../../../shared/types/blocker.js';
import type { SourceContextRecord } from '../../../shared/types/source-context.js';
import type { TaskExecutionType, TaskListItemRecord } from '../../../shared/types/task.js';
import type { TaskFileRecord } from '../../../shared/types/task-file.js';
import type { ArtifactRecord } from '../../../shared/types/artifact.js';
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
import { evaluateTaskAdvancement } from '../../../shared/task-advancement-orchestrator.js';
import type { PanelRuntimeTimelineEventType } from '../../../shared/runtime-panel-events.js';
import type { TaskService } from '../task/task-service.js';
import type { DecisionService } from '../decision/decision-service.js';
import type { BusinessLineService } from '../business-line/business-line-service.js';
import type { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import type { TaskFileRepository } from '../../db/repositories/task-file-repository.js';
import type {
  BusinessLineOwnershipInput,
  BusinessLineOwnershipResolution,
} from '../../../shared/types/business-line.js';

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
export type TaskplaneWritebackArtifactRepositoryPort = Pick<ArtifactRepository, 'createNoteFromRun' | 'createPatchFromRun'>;
export type TaskplaneWritebackBusinessLineOwnershipResolverPort = {
  resolveOwnership(input: BusinessLineOwnershipInput): Promise<BusinessLineOwnershipResolution>;
};
export type TaskplaneWritebackBusinessLineServicePort = Pick<
  BusinessLineService,
  | 'createBusinessLineNextAction'
  | 'createQueuedBusinessLineNextAction'
  | 'createBusinessLineRecord'
  | 'proposeBusinessLineSopRevision'
  | 'recordReview'
  | 'resolveOwnership'
>;

export class TaskplaneWritebackDispatchService {
  constructor(
    private readonly taskService: TaskplaneWritebackTaskServicePort,
    private readonly decisionService: TaskplaneWritebackDecisionServicePort,
    private readonly taskFileRepository: TaskplaneWritebackTaskFileRepositoryPort,
    private readonly artifactRepository: TaskplaneWritebackArtifactRepositoryPort,
    private readonly businessLineOwnershipResolver: TaskplaneWritebackBusinessLineOwnershipResolverPort | null = null,
    private readonly businessLineService: TaskplaneWritebackBusinessLineServicePort | null = null,
  ) {}

  async dispatch(params: {
    plan: TaskplaneWritebackApplyPlan;
    taskId: string;
  }): Promise<TaskplaneWritebackDispatchResult> {
    const advancement = evaluateTaskAdvancement({
      entrypoint: 'writeback_dispatch',
      hasTaskContext: true,
      prompt: `writeback:${params.plan.action}`,
      task: { title: params.taskId },
    });
    if (advancement.route === 'blocked') {
      return {
        action: params.plan.action,
        message: advancement.userMessage,
        status: 'blocked',
      };
    }

    const targetTaskId = getPlanTargetTaskId(params.plan);
    if (targetTaskId && targetTaskId !== params.taskId) {
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
    const ownershipBlock = await this.evaluateBusinessLineOwnershipBoundary({
      plan: params.plan,
      taskId: params.taskId,
    });
    if (ownershipBlock) return ownershipBlock;

    return dispatchTaskplaneWritebackApplyPlan({
      plan: params.plan,
      taskId: params.taskId,
      ports: {
        createArtifact: (input): Promise<ArtifactRecord> => this.artifactRepository.createNoteFromRun(input),
        createPatchArtifact: (input): Promise<ArtifactRecord> => this.artifactRepository.createPatchFromRun(input),
        createBlocker: (input): Promise<BlockerRecord> => this.taskService.createBlocker(input),
        createBusinessLineNextAction: (input): Promise<TaskListItemRecord> => {
          if (!this.businessLineService) throw new Error('Business line service unavailable.');
          if (input.queuePolicy) {
            return this.businessLineService.createQueuedBusinessLineNextAction({
              ...input,
              currentRunStatus: input.queuePolicy.currentRunStatus,
              interruptCurrentRun: input.queuePolicy.interruptCurrentRun,
              operatorConfirmed: true,
              riskLevel: input.queuePolicy.riskLevel,
              riskNote: input.queuePolicy.riskNote,
            });
          }
          return this.businessLineService.createBusinessLineNextAction(input);
        },
        createBusinessLineRecord: (input): Promise<BusinessLineRecord> => {
          if (!this.businessLineService) throw new Error('Business line service unavailable.');
          return this.businessLineService.createBusinessLineRecord(input);
        },
        createBusinessLineReview: (input): Promise<BusinessLineWorkspace> => {
          if (!this.businessLineService) throw new Error('Business line service unavailable.');
          return this.businessLineService.recordReview(input);
        },
        createDecision: (input): Promise<DecisionRecord> => this.decisionService.create(input),
        createSourceContext: (input): Promise<SourceContextRecord> => this.taskService.createSourceContext(input),
        createSubtasks: (input): Promise<TaskplaneSubtaskCreateManyResult> => this.createSubtasks(input),
        createTaskFile: (input): Promise<TaskFileRecord> => this.taskFileRepository.create(input),
        proposeBusinessLineSopRevision: (input): Promise<BusinessLineSkillRevision> => {
          if (!this.businessLineService) throw new Error('Business line service unavailable.');
          return this.businessLineService.proposeBusinessLineSopRevision(input);
        },
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

  private async evaluateBusinessLineOwnershipBoundary(params: {
    plan: TaskplaneWritebackApplyPlan;
    taskId: string;
  }): Promise<TaskplaneWritebackDispatchResult | null> {
    if (!this.businessLineOwnershipResolver) return null;
    const explicitBusinessLineId = getPlanBusinessLineId(params.plan);
    const businessLineNative = isBusinessLineNativePlan(params.plan);
    const ownership = await this.businessLineOwnershipResolver.resolveOwnership({
      explicitBusinessLineId,
      taskId: params.taskId,
      ...(params.plan.action === 'task_file.update' ? { taskFileId: params.plan.input.id } : {}),
      allowOneOff: !businessLineNative && !explicitBusinessLineId,
    });
    if (ownership.status === 'mismatch') {
      return {
        action: params.plan.action,
        message: 'Write Intent 已暂停：业务线目标与当前任务归属不一致。',
        status: 'blocked',
      };
    }
    if (ownership.status === 'missing' && explicitBusinessLineId) {
      return {
        action: params.plan.action,
        message: 'Write Intent 已暂停：业务线不存在。',
        status: 'blocked',
      };
    }
    if (ownership.status === 'missing' && businessLineNative) {
      return {
        action: params.plan.action,
        message: 'Write Intent 已暂停：业务线写入缺少可解析的业务线归属。',
        status: 'blocked',
      };
    }
    return null;
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
      || Boolean(input.parentSummary?.trim())
      || Boolean(input.nextStep?.trim());
    if (shouldUpdateParent) {
      updatedTask = await this.taskService.update({
        id: input.parentTaskId,
        nextStep: input.nextStep?.trim() || parent.nextStep,
        ...(input.parentSummary?.trim() ? { summary: input.parentSummary.trim() } : {}),
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
        await Promise.resolve(this.taskService.createCompletionCriteria({
          taskId: planned.id,
          text: subtask.acceptanceCriteria,
          verificationResponsibility: 'unknown',
        })).catch(() => null);
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
      return Promise.resolve(this.taskService.createTaskDependency({
        taskId: child.id,
        blockedByTaskId: dependency.id,
        reason: subtask.dependency ?? null,
      })).catch(() => null);
    }));

    await Promise.resolve(this.taskService.createCompletionCriteria({
      taskId: input.parentTaskId,
      text: `完成并验收 ${input.subtasks.length} 个项目子任务。`,
      verificationResponsibility: 'unknown',
    })).catch(() => null);

    const recordContent = buildProjectDecompositionRecordContent(input);
    let taskRecordPath: string | null = null;
    if (recordContent) {
      const record = await Promise.resolve(this.taskFileRepository.create({
        taskId: input.parentTaskId,
        name: 'AI 项目拆解自检.md',
        path: 'Task Records/AI 项目拆解自检.md',
        kind: 'file',
        content: recordContent,
      })).catch(() => null);
      taskRecordPath = record?.path ?? null;
    }

    return {
      createdTasks,
      taskRecordPath,
      updatedTask,
    };
  }
}

function buildProjectDecompositionRecordContent(
  input: TaskplaneSubtaskCreateManyInput,
): string | null {
  const review = input.review?.trim();
  const nextStep = input.nextStep?.trim();
  if (!review && !nextStep) return null;

  return [
    '# Record: AI 项目拆解自检',
    '',
    '## Trigger',
    '用户确认创建项目拆解子任务。',
    '',
    '## Summary',
    review ?? `已创建 ${input.subtasks.length} 个子任务。`,
    '',
    '## Confirmed',
    `- 已创建 ${input.subtasks.length} 个子任务。`,
    '',
    '## Next',
    `- ${nextStep || '进入第一个可执行子任务。'}`,
    '',
  ].join('\n');
}

function getPlanTargetTaskId(plan: TaskplaneWritebackApplyPlan): string | null | undefined {
  if (isBusinessLineNativePlan(plan)) return null;
  if (plan.action === 'task.update_next_step') return plan.input.id;
  if (plan.action === 'task_file.update') return plan.taskId;
  if (plan.action === 'subtask.create_many') return plan.input.parentTaskId;
  return plan.input.taskId;
}

function getPlanBusinessLineId(plan: TaskplaneWritebackApplyPlan): string | null {
  if (isBusinessLineNativePlan(plan)) return plan.input.businessLineId?.trim() || null;
  if (plan.action === 'subtask.create_many') return null;
  if (plan.action === 'task_file.update') {
    const timelineBusinessLineId = plan.timeline.payload.businessLineId;
    return typeof timelineBusinessLineId === 'string' && timelineBusinessLineId.trim()
      ? timelineBusinessLineId
      : null;
  }
  if ('businessLineId' in plan.input) {
    return plan.input.businessLineId?.trim() || null;
  }
  return null;
}

function isBusinessLineNativePlan(plan: TaskplaneWritebackApplyPlan): plan is Extract<
  TaskplaneWritebackApplyPlan,
  {
    action:
      | 'business_record.create'
      | 'business_review.record'
      | 'business_next_action.create'
      | 'business_sop_revision.propose'
      | 'business_handoff.record';
  }
> {
  return plan.action === 'business_record.create'
    || plan.action === 'business_review.record'
    || plan.action === 'business_next_action.create'
    || plan.action === 'business_sop_revision.propose'
    || plan.action === 'business_handoff.record';
}
