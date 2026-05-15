import type {
  ApplyProcessTemplateInput,
  CreateProcessTemplateInput,
  UpdateProcessTemplateInput,
} from '../../../shared/types/process-template.js';
import type {
  BlockerRecord,
  CreateBlockerInput,
  UpdateBlockerInput,
} from '../../../shared/types/blocker.js';
import type {
  CompletionCriteriaRecord,
  CreateCompletionCriteriaInput,
  UpdateCompletionCriteriaInput,
} from '../../../shared/types/completion-criteria.js';
import type {
  CreateTaskDependencyInput,
  TaskDependencyRecord,
  UpdateTaskDependencyInput,
} from '../../../shared/types/task-dependency.js';
import type {
  CreateTaskInput,
  RecordTaskCompletionCheckInput,
  RecordTaskTimelineEventInput,
  TaskDetail,
  TaskDetailBase,
  TaskListItemRecord,
  TaskRecord,
  TaskResumeCardRecord,
  TaskState,
  TransitionTaskInput,
  UpdateTaskInput,
} from '../../../shared/types/task.js';
import type {
  CreateSourceContextInput,
  SourceContextRecord,
  UpdateSourceContextInput,
} from '../../../shared/types/source-context.js';
import { evaluateRuntimeTaskCapture } from '../../../shared/runtime-task-capture-evaluator.js';
import {
  buildTaskHierarchyRepairPlan,
  evaluateTaskHierarchyConsistency,
  type AppliedTaskHierarchyRepairResult,
  type TaskHierarchyConsistencyEvaluation,
} from '../../../shared/task-hierarchy-consistency.js';
import { normalizeCreateSourceContextInput } from '../../../shared/runtime-surface-routing.js';
import { assertKnownPanelRuntimeTimelineEventType } from '../../../shared/runtime-panel-events.js';
import type { RunType } from '../../../shared/types/run.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { BlockerRepository } from '../../db/repositories/blocker-repository.js';
import { CompletionCriteriaRepository } from '../../db/repositories/completion-criteria-repository.js';
import { ProcessTemplateRepository } from '../../db/repositories/process-template-repository.js';
import { SourceContextRepository } from '../../db/repositories/source-context-repository.js';
import { TaskFileRepository } from '../../db/repositories/task-file-repository.js';
import { TaskDependencyRepository } from '../../db/repositories/task-dependency-repository.js';
import { TaskProcessBindingRepository } from '../../db/repositories/task-process-binding-repository.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';
import { WaitingItemRepository } from '../../db/repositories/waiting-item-repository.js';
import {
  buildTaskResumeLatestChange,
  deriveNextSuggestedMove,
  getCurrentBlockerAgeLabel,
  getCurrentDependencyAgeLabel,
  getCurrentDependencyPriorityReason,
  getCurrentBlockerPriorityReason,
  getCurrentMethodSelectionReason,
  getKeySourcePriorityReason,
} from '../working-context/assembler.js';
import { getResponsibilitySummary } from '../../../shared/working-context/responsibility.js';

const allowedTransitions: Record<TaskState, TaskState[]> = {
  captured: ['triaged', 'planned', 'archived'],
  triaged: ['planned', 'archived'],
  planned: ['running', 'waiting_external', 'completed', 'archived'],
  running: ['planned', 'waiting_external', 'completed', 'archived'],
  waiting_external: ['planned', 'running', 'completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

export class TaskService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly waitingItemRepository: WaitingItemRepository,
    private readonly artifactRepository: ArtifactRepository | null = null,
    private readonly sourceContextRepository: SourceContextRepository | null = null,
    private readonly processTemplateRepository: ProcessTemplateRepository | null = null,
    private readonly taskProcessBindingRepository: TaskProcessBindingRepository | null = null,
    private readonly blockerRepository: BlockerRepository | null = null,
    private readonly taskDependencyRepository: TaskDependencyRepository | null = null,
    private readonly completionCriteriaRepository: CompletionCriteriaRepository | null = null,
    private readonly taskFileRepository: TaskFileRepository | null = null,
  ) {}

  private async syncWaitingItem(
    taskId: string,
    state: TaskState,
    waitingReason: string | null,
  ): Promise<void> {
    if (state === 'waiting_external' && waitingReason?.trim()) {
      const result = await this.waitingItemRepository.upsertActive(taskId, waitingReason);
      await this.repository.appendTimelineEvent(
        taskId,
        result.action === 'created' ? 'waiting_item.created' : 'waiting_item.updated',
        {
          waitingItemId: result.item.id,
          reason: result.item.reason,
          status: result.item.status,
        },
      );
      return;
    }

    const resolved = await this.waitingItemRepository.resolveActive(taskId);

    if (resolved) {
      await this.repository.appendTimelineEvent(taskId, 'waiting_item.resolved', {
        waitingItemId: resolved.id,
        reason: resolved.reason,
        resolvedAt: resolved.resolvedAt,
        nextState: state,
      });
    }
  }

  private async attachActiveWaitingItem(task: TaskRecord): Promise<TaskListItemRecord> {
    const activeWaitingItem = await this.waitingItemRepository.getActiveForTask(task.id);
    const activeBlocker = this.blockerRepository
      ? await this.blockerRepository.getActiveForTask(task.id)
      : null;
    const activeDependency = this.taskDependencyRepository
      ? await this.taskDependencyRepository.getActiveForTask(task.id)
      : null;

    return {
      ...task,
      activeWaitingItem,
      activeBlocker,
      activeDependency,
      dependencyReevaluation: null,
    };
  }

  private async attachDependencyReevaluations(
    tasks: TaskListItemRecord[],
  ): Promise<TaskListItemRecord[]> {
    const upstreamTaskIds = [...new Set(
      tasks
        .map((task) => task.activeDependency?.blockedByTaskId)
        .filter((taskId): taskId is string => Boolean(taskId)),
    )];

    if (upstreamTaskIds.length === 0) {
      return tasks;
    }

    const upstreamDetails = await Promise.all(
      upstreamTaskIds.map(async (taskId) => this.repository.getDetail(taskId)),
    );
    const upstreamById = new Map(
      upstreamDetails
        .filter((detail): detail is NonNullable<typeof detail> => Boolean(detail))
        .map((detail) => [detail.id, detail]),
    );

    return tasks.map((task) => {
      const dependency = task.activeDependency;

      if (!dependency?.blockedByTaskId) {
        return task;
      }

      const upstreamTask = upstreamById.get(dependency.blockedByTaskId);

      if (!upstreamTask) {
        return task;
      }

      const latestResolvedBlocker = upstreamTask.timeline
        .filter((event) => event.type === 'blocker.resolved')
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

      const candidates: NonNullable<TaskListItemRecord['dependencyReevaluation']>[] = [];

      if (upstreamTask.state === 'completed') {
        candidates.push({
          dependencyId: dependency.id,
          upstreamTaskId: upstreamTask.id,
          upstreamTaskTitle: upstreamTask.title,
          status: 'upstream_ready',
          updatedAt: upstreamTask.updatedAt,
        });
      }

      if (latestResolvedBlocker) {
        candidates.push({
          dependencyId: dependency.id,
          upstreamTaskId: upstreamTask.id,
          upstreamTaskTitle: upstreamTask.title,
          status: 'upstream_unblocked',
          updatedAt: latestResolvedBlocker.createdAt,
        });
      }

      const dependencyReevaluation = candidates
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 1)[0] ?? null;

      return {
        ...task,
        dependencyReevaluation,
      };
    });
  }

  private async attachDetailWaitingItem(detail: TaskDetailBase): Promise<TaskDetailBase> {
    const activeWaitingItem = await this.waitingItemRepository.getActiveForTask(detail.id);
    const activeBlocker = this.blockerRepository
      ? await this.blockerRepository.getActiveForTask(detail.id)
      : null;
    const activeDependency = this.taskDependencyRepository
      ? await this.taskDependencyRepository.getActiveForTask(detail.id)
      : null;

    return {
      ...detail,
      activeWaitingItem,
      activeBlocker,
      activeDependency,
    };
  }

  private async attachDetailDependencyReevaluation(detail: TaskDetailBase): Promise<TaskDetailBase> {
    const dependency = detail.activeDependency;

    if (!dependency?.blockedByTaskId) {
      return {
        ...detail,
        dependencyReevaluation: null,
      };
    }

    const upstreamTask = await this.repository.getDetail(dependency.blockedByTaskId);

    if (!upstreamTask) {
      return {
        ...detail,
        dependencyReevaluation: null,
      };
    }

    const latestResolvedBlocker = upstreamTask.timeline
      .filter((event) => event.type === 'blocker.resolved')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

    const candidates: NonNullable<TaskDetailBase['dependencyReevaluation']>[] = [];

    if (upstreamTask.state === 'completed') {
      candidates.push({
        dependencyId: dependency.id,
        upstreamTaskId: upstreamTask.id,
        upstreamTaskTitle: upstreamTask.title,
        status: 'upstream_ready',
        updatedAt: upstreamTask.updatedAt,
      });
    }

    if (latestResolvedBlocker) {
      candidates.push({
        dependencyId: dependency.id,
        upstreamTaskId: upstreamTask.id,
        upstreamTaskTitle: upstreamTask.title,
        status: 'upstream_unblocked',
        updatedAt: latestResolvedBlocker.createdAt,
      });
    }

    return {
      ...detail,
      dependencyReevaluation:
        candidates.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null,
    };
  }

  private async attachArtifacts(detail: TaskDetailBase): Promise<TaskDetailBase> {
    const artifacts = this.artifactRepository
      ? await this.artifactRepository.listRecentForTask(detail.id)
      : [];

    return {
      ...detail,
      artifacts,
    };
  }

  private async attachSourceContexts(detail: TaskDetailBase): Promise<TaskDetailBase> {
    const sourceContexts = this.sourceContextRepository
      ? await this.sourceContextRepository.listActiveForTask(detail.id)
      : [];

    return {
      ...detail,
      sourceContexts,
    };
  }

  private async attachTaskFiles(detail: TaskDetailBase): Promise<TaskDetailBase> {
    const taskFiles = this.taskFileRepository
      ? await this.taskFileRepository.listForTask(detail.id)
      : [];

    return {
      ...detail,
      taskFiles,
    };
  }

  private async attachProcessTemplates(detail: TaskDetailBase): Promise<TaskDetailBase> {
    const applied = this.taskProcessBindingRepository
      ? await this.taskProcessBindingRepository.listActiveForTask(detail.id)
      : [];
    const available = this.processTemplateRepository
      ? await this.processTemplateRepository.listActive()
      : [];
    const appliedIds = new Set(applied.map((item) => item.id));

    return {
      ...detail,
      processTemplates: applied,
      availableProcessTemplates: available.filter((item) => !appliedIds.has(item.id)),
    };
  }

  private async attachCompletionCriteria(detail: TaskDetailBase): Promise<TaskDetailBase> {
    const completionCriteria = this.completionCriteriaRepository
      ? await this.completionCriteriaRepository.listForTask(detail.id)
      : [];

    return {
      ...detail,
      completionCriteria,
    };
  }

  private buildResumeCard(detail: TaskDetailBase): TaskResumeCardRecord {
    const keySource = detail.sourceContexts.find((item) => item.isKey) ?? null;
    const recentSource = keySource ?? detail.sourceContexts[0] ?? null;
    const currentMethod = detail.processTemplates[0] ?? null;
    const latestArtifact = detail.artifacts[0] ?? null;
    const waitingReason = detail.activeWaitingItem?.reason ?? detail.waitingReason;
    const blockerTitle = detail.activeBlocker?.title ?? null;
    const dependencyTitle = detail.activeDependency?.blockedByTaskTitle ?? null;
    const dependencyReevaluationReason = detail.dependencyReevaluation
      ? detail.dependencyReevaluation.status === 'upstream_ready'
        ? `上游任务“${detail.dependencyReevaluation.upstreamTaskTitle}”已完成，可重新判断是否解除依赖。`
        : `上游任务“${detail.dependencyReevaluation.upstreamTaskTitle}”刚解除关键阻塞，可重新判断是否解除依赖。`
      : null;
    const satisfiedCriteriaCount = detail.completionCriteria.filter(
      (criteria) => criteria.status === 'satisfied',
    ).length;
    const satisfiedCriteriaHighlights = detail.completionCriteria
      .filter((criteria) => criteria.status === 'satisfied')
      .slice(0, 2)
      .map((criteria) => criteria.text);
    const nextOpenCriterion =
      detail.completionCriteria.find((criteria) => criteria.status === 'open')?.text ?? null;
    const nextOpenCriteriaRecord =
      detail.completionCriteria.find((criteria) => criteria.status === 'open') ?? null;
    const completionStatus = {
      total: detail.completionCriteria.length,
      satisfied: satisfiedCriteriaCount,
      open: detail.completionCriteria.length - satisfiedCriteriaCount,
      summary:
        detail.completionCriteria.length === 0
          ? '尚未定义完成标准'
          : `已满足 ${satisfiedCriteriaCount}/${detail.completionCriteria.length} 条完成标准`,
      satisfiedCriteriaHighlights,
      nextOpenCriterion,
      nextOpenResponsibilitySummary: nextOpenCriteriaRecord
        ? getResponsibilitySummary({
            kind: nextOpenCriteriaRecord.verificationResponsibility,
            label: nextOpenCriteriaRecord.verificationResponsibilityLabel,
            audience: 'task',
            subject: 'completion',
          })
        : null,
    };

    const currentStateParts = [`状态：${detail.state}`];

    if (waitingReason) {
      currentStateParts.push(`等待：${waitingReason}`);
    }

    if (blockerTitle) {
      currentStateParts.push(`阻塞：${blockerTitle}`);
    }

    if (dependencyTitle) {
      currentStateParts.push(`依赖：${dependencyTitle}`);
    }

    if (detail.riskLevel !== 'none') {
      currentStateParts.push(
        `风险：${detail.riskLevel}${detail.riskNote ? ` · ${detail.riskNote}` : ''}`,
      );
    }

    const latestChange = buildTaskResumeLatestChange(
      detail.timeline,
      detail.state,
      detail.dependencyReevaluation,
      detail.activeDependency
        ? {
            blockedByTaskTitle: detail.activeDependency.blockedByTaskTitle,
            createdAt: detail.activeDependency.createdAt,
          }
        : null,
      completionStatus,
    );
    const nextSuggestedMove = deriveNextSuggestedMove({
      explicitNextStep: detail.nextStep,
      taskTitle: detail.title,
      taskState: detail.state,
      taskSummary: detail.summary,
      waitingReason,
      riskLevel: detail.riskLevel,
      riskNote: detail.riskNote,
      blockerTitle,
      blockerCreatedAt: detail.activeBlocker?.createdAt ?? null,
      dependencyTitle,
      dependencyCreatedAt: detail.activeDependency?.createdAt ?? null,
      keySourceTitle: recentSource?.title ?? null,
      latestArtifactTitle: latestArtifact?.title ?? null,
      completionStatus,
      recentChange: latestChange.recentChange,
    });

    const summaryParts = [
      `这条任务目前处于 ${detail.state}${waitingReason ? `，正在等待“${waitingReason}”` : ''}${blockerTitle ? `，当前阻塞项是“${blockerTitle}”` : ''}${detail.riskLevel === 'high' && detail.riskNote ? `，且存在高风险“${detail.riskNote}”` : ''}。`,
      dependencyReevaluationReason
        ? `当前依赖已具备恢复推进条件：${dependencyReevaluationReason}`
        : detail.activeDependency && getCurrentDependencyPriorityReason(detail.activeDependency, 'task')?.includes('建议优先推动上游任务或重新判断是否解除依赖')
          ? `当前依赖链已持续较久：上游任务“${dependencyTitle}”仍未打通，值得优先升级处理。`
        : dependencyTitle
          ? `当前依赖上游任务“${dependencyTitle}”。`
          : null,
      detail.completionCriteria.length
        ? `完成标准进度：${completionStatus.summary}。`
        : null,
      latestChange.summary,
      keySource
        ? `当前最关键的来源材料是“${keySource.title}”。`
        : recentSource
          ? `当前最近更新的来源材料是“${recentSource.title}”。`
          : null,
      currentMethod ? `当前采用的方法模板是“${currentMethod.title}”。` : null,
      `建议先做：${nextSuggestedMove}`,
    ].filter(Boolean);

    return {
      summary: summaryParts.join(' '),
      currentState: currentStateParts.join(' · '),
      latestChange: {
        summary: latestChange.summary,
        action: latestChange.action,
      },
      completionStatus,
      currentBlocker: detail.activeBlocker
        ? {
            blockerId: detail.activeBlocker.id,
            title: detail.activeBlocker.title,
            detail:
              detail.activeBlocker.detail ??
              (detail.activeBlocker.owner
                ? `当前卡在 ${detail.activeBlocker.owner}`
                : detail.activeBlocker.kind),
            ageLabel: getCurrentBlockerAgeLabel(detail.activeBlocker),
            priorityReason: getCurrentBlockerPriorityReason({
              blocker: detail.activeBlocker,
              audience: 'task',
            }),
            responsibilitySummary: getResponsibilitySummary({
              kind: detail.activeBlocker.responsibility,
              label: detail.activeBlocker.responsibilityLabel ?? detail.activeBlocker.owner,
              audience: 'task',
              subject: 'blocker',
            }),
          }
        : {
            blockerId: null,
            title: '暂无当前阻塞项',
            detail: null,
            ageLabel: null,
            priorityReason: null,
            responsibilitySummary: null,
          },
      currentDependency: detail.activeDependency
        ? {
            dependencyId: detail.activeDependency.id,
            title: detail.activeDependency.blockedByTaskTitle ?? '上游任务',
            detail:
              dependencyReevaluationReason ??
              detail.activeDependency.reason ??
              '当前等待上游任务完成后再继续推进。',
            priorityReason:
              dependencyReevaluationReason ??
              getCurrentDependencyPriorityReason(detail.activeDependency, 'task'),
            ageLabel: getCurrentDependencyAgeLabel(detail.activeDependency),
            responsibilitySummary: getResponsibilitySummary({
              kind: 'upstream_task',
              label: detail.activeDependency.blockedByTaskTitle,
              audience: 'task',
              subject: 'dependency',
            }),
          }
        : {
            dependencyId: null,
            title: '暂无任务依赖',
            detail: null,
            priorityReason: null,
            ageLabel: null,
            responsibilitySummary: null,
          },
      keySource: recentSource
        ? {
            sourceContextId: recentSource.id,
            title: recentSource.title,
            detail: recentSource.note ?? recentSource.uri,
            priorityReason: getKeySourcePriorityReason({
              timeline: detail.timeline,
              keySource: recentSource,
              audience: 'task',
            }),
          }
        : {
            sourceContextId: null,
            title: '暂无关键来源',
            detail: null,
            priorityReason: null,
          },
      currentMethod: currentMethod
        ? {
            templateId: currentMethod.id,
            title: currentMethod.title,
            detail: currentMethod.summary ?? currentMethod.kind,
            selectionReason: getCurrentMethodSelectionReason({
              timeline: detail.timeline,
              currentMethod,
              audience: 'task',
            }),
          }
        : {
            templateId: null,
            title: '暂无方法模板',
            detail: null,
            selectionReason: null,
          },
      nextSuggestedMove,
    };
  }

  private async getExistingTaskOrThrow(taskId: string): Promise<TaskDetailBase> {
    const detail = await this.repository.getDetail(taskId);

    if (!detail) {
      throw new Error(`Task not found: ${taskId}`);
    }

    return detail;
  }

  private findTaskInList(tasks: TaskRecord[], taskId: string): TaskRecord | null {
    return tasks.find((task) => task.id === taskId) ?? null;
  }

  private async addChildLinkToParent(
    parentTaskId: string | null | undefined,
    childTaskId: string,
    existingTasks: TaskRecord[],
  ): Promise<void> {
    if (!parentTaskId) return;
    const parent = this.findTaskInList(existingTasks, parentTaskId);
    if (!parent) {
      throw new Error(`Parent task not found: ${parentTaskId}`);
    }
    const childTaskIds = parent.childTaskIds ?? [];
    if (childTaskIds.includes(childTaskId)) return;
    await this.repository.update({
      id: parentTaskId,
      childTaskIds: [...childTaskIds, childTaskId],
    });
  }

  private async removeChildLinkFromParent(
    parentTaskId: string | null | undefined,
    childTaskId: string,
    existingTasks: TaskRecord[],
  ): Promise<void> {
    if (!parentTaskId) return;
    const parent = this.findTaskInList(existingTasks, parentTaskId);
    if (!parent) return;
    const childTaskIds = parent.childTaskIds ?? [];
    if (!childTaskIds.includes(childTaskId)) return;
    await this.repository.update({
      id: parentTaskId,
      childTaskIds: childTaskIds.filter((id) => id !== childTaskId),
    });
  }

  private async syncParentChildLinksAfterMove(params: {
    taskId: string;
    previousParentTaskId: string | null | undefined;
    nextParentTaskId: string | null | undefined;
    existingTasks: TaskRecord[];
  }): Promise<void> {
    const previousParentTaskId = params.previousParentTaskId ?? null;
    const nextParentTaskId = params.nextParentTaskId ?? null;
    if (previousParentTaskId === nextParentTaskId) return;
    if (nextParentTaskId && !this.findTaskInList(params.existingTasks, nextParentTaskId)) {
      throw new Error(`Parent task not found: ${nextParentTaskId}`);
    }
    await this.removeChildLinkFromParent(previousParentTaskId, params.taskId, params.existingTasks);
    await this.addChildLinkToParent(nextParentTaskId, params.taskId, params.existingTasks);
  }

  private normalizeChildTaskIds(childTaskIds: string[]): string[] {
    return [...new Set(childTaskIds.map((id) => id.trim()).filter(Boolean))];
  }

  private validateChildTaskIds(parentTaskId: string, childTaskIds: string[], existingTasks: TaskRecord[]): void {
    for (const childTaskId of childTaskIds) {
      if (childTaskId === parentTaskId) {
        throw new Error('A task cannot be its own child');
      }
      if (!this.findTaskInList(existingTasks, childTaskId)) {
        throw new Error(`Child task not found: ${childTaskId}`);
      }
    }
  }

  private async syncChildParentLinksAfterParentUpdate(params: {
    parentTaskId: string;
    previousChildTaskIds: string[];
    nextChildTaskIds: string[];
    existingTasks: TaskRecord[];
  }): Promise<void> {
    const previousIds = new Set(params.previousChildTaskIds);
    const nextIds = new Set(params.nextChildTaskIds);
    const addedIds = params.nextChildTaskIds.filter((id) => !previousIds.has(id));
    const removedIds = params.previousChildTaskIds.filter((id) => !nextIds.has(id));

    for (const childTaskId of addedIds) {
      const child = this.findTaskInList(params.existingTasks, childTaskId);
      if (!child) continue;
      if (child.parentTaskId && child.parentTaskId !== params.parentTaskId) {
        await this.removeChildLinkFromParent(child.parentTaskId, childTaskId, params.existingTasks);
      }
      if (child.parentTaskId !== params.parentTaskId) {
        await this.repository.update({
          id: childTaskId,
          parentTaskId: params.parentTaskId,
        });
      }
    }

    for (const childTaskId of removedIds) {
      const child = this.findTaskInList(params.existingTasks, childTaskId);
      if (child?.parentTaskId === params.parentTaskId) {
        await this.repository.update({
          id: childTaskId,
          parentTaskId: null,
        });
      }
    }
  }

  private async restoreTaskAfterRun(detail: TaskDetailBase): Promise<TaskDetailBase> {
    if (detail.state !== 'running') {
      return detail;
    }

    const transitioned = await this.repository.transition({
      id: detail.id,
      nextState: 'planned',
      waitingReason: null,
    });

    await this.syncWaitingItem(transitioned.id, transitioned.state, transitioned.waitingReason);

    return {
      ...detail,
      state: transitioned.state,
      waitingReason: transitioned.waitingReason,
      updatedAt: transitioned.updatedAt,
      activeWaitingItem: null,
      activeBlocker: detail.activeBlocker,
    };
  }

  async list(): Promise<TaskListItemRecord[]> {
    const tasks = await this.repository.list();
    const taskSlices = await Promise.all(tasks.map((task) => this.attachActiveWaitingItem(task)));

    return this.attachDependencyReevaluations(taskSlices);
  }

  async getHierarchyConsistency(): Promise<TaskHierarchyConsistencyEvaluation> {
    return evaluateTaskHierarchyConsistency(await this.repository.list());
  }

  async applySafeHierarchyRepairs(): Promise<AppliedTaskHierarchyRepairResult> {
    const currentTasks = await this.repository.list();
    const before = buildTaskHierarchyRepairPlan(currentTasks);
    const tasksById = new Map(currentTasks.map((task) => [task.id, task]));
    let appliedActionCount = 0;

    for (const action of before.actions) {
      if (!action.safeToApply || !action.relatedTaskId) continue;

      if (action.kind === 'add_parent_child_link') {
        const parent = tasksById.get(action.taskId);
        const child = tasksById.get(action.relatedTaskId);
        if (!parent || !child || child.parentTaskId !== parent.id) continue;
        const childTaskIds = parent.childTaskIds ?? [];
        if (childTaskIds.includes(child.id)) continue;
        const nextParent = {
          ...parent,
          childTaskIds: [...childTaskIds, child.id],
        };
        await this.repository.update({
          id: parent.id,
          childTaskIds: nextParent.childTaskIds,
        });
        tasksById.set(parent.id, nextParent);
        appliedActionCount += 1;
        continue;
      }

      if (action.kind === 'set_child_parent') {
        const child = tasksById.get(action.taskId);
        const parent = tasksById.get(action.relatedTaskId);
        if (!child || !parent || child.parentTaskId || !(parent.childTaskIds ?? []).includes(child.id)) continue;
        const nextChild = {
          ...child,
          parentTaskId: parent.id,
        };
        await this.repository.update({
          id: child.id,
          parentTaskId: parent.id,
        });
        tasksById.set(child.id, nextChild);
        appliedActionCount += 1;
      }
    }

    const after = buildTaskHierarchyRepairPlan(await this.repository.list());

    return {
      before,
      after,
      appliedActionCount,
      skippedManualReviewCount: before.manualReviewCount,
      summary: `已应用 ${appliedActionCount} 项安全层级修复，保留 ${before.manualReviewCount} 项人工确认。`,
    };
  }

  async create(input: CreateTaskInput): Promise<TaskListItemRecord> {
    const existingTasks = await this.repository.list() ?? [];
    if (input.parentTaskId && !this.findTaskInList(existingTasks, input.parentTaskId)) {
      throw new Error(`Parent task not found: ${input.parentTaskId}`);
    }
    const captureEvaluation = evaluateRuntimeTaskCapture({
      title: input.title,
      summary: input.summary,
      existingTasks,
      parentTaskId: input.parentTaskId ?? null,
    });
    if (!captureEvaluation.allowed) {
      throw new Error(captureEvaluation.summary);
    }

    const created = await this.repository.create(input);
    await this.addChildLinkToParent(input.parentTaskId, created.id, existingTasks);
    return this.attachActiveWaitingItem(created);
  }

  async getDetail(taskId: string): Promise<TaskDetail | null> {
    const detail = await this.repository.getDetail(taskId);

    if (!detail) {
      return null;
    }

    const enriched = await this.attachProcessTemplates(
      await this.attachTaskFiles(
        await this.attachSourceContexts(
          await this.attachCompletionCriteria(
            await this.attachArtifacts(
              await this.attachDetailDependencyReevaluation(await this.attachDetailWaitingItem(detail)),
            ),
          ),
        ),
      ),
    );

    return {
      ...enriched,
      resumeCard: this.buildResumeCard(enriched),
    };
  }

  async update(input: UpdateTaskInput): Promise<TaskListItemRecord> {
    const detail = await this.getExistingTaskOrThrow(input.id);
    let existingTasks: TaskRecord[] | null = null;
    let normalizedChildTaskIds: string[] | undefined;
    if (input.childTaskIds !== undefined) {
      normalizedChildTaskIds = this.normalizeChildTaskIds(input.childTaskIds);
    }
    if (input.title !== undefined || input.parentTaskId !== undefined || input.childTaskIds !== undefined) {
      existingTasks = await this.repository.list() ?? [];
      if (
        input.parentTaskId !== undefined
        && input.parentTaskId
        && !this.findTaskInList(existingTasks, input.parentTaskId)
      ) {
        throw new Error(`Parent task not found: ${input.parentTaskId}`);
      }
      const captureEvaluation = evaluateRuntimeTaskCapture({
        title: input.title ?? detail.title,
        summary: input.summary === undefined ? detail.summary : input.summary,
        existingTasks: existingTasks.filter((task) => task.id !== input.id),
        parentTaskId: input.parentTaskId === undefined ? detail.parentTaskId ?? null : input.parentTaskId ?? null,
      });
      if (!captureEvaluation.allowed) {
        throw new Error(captureEvaluation.summary);
      }
      if (normalizedChildTaskIds !== undefined) {
        this.validateChildTaskIds(input.id, normalizedChildTaskIds, existingTasks);
      }
    }

    const nextRiskLevel = input.riskLevel ?? detail.riskLevel;
    const providedRiskNote = input.riskNote?.trim() || null;
    const nextRiskNote =
      input.riskNote === undefined
        ? nextRiskLevel === 'high'
          ? detail.riskNote
          : detail.riskLevel === 'high'
            ? null
            : detail.riskNote
        : providedRiskNote;

    if (nextRiskLevel === 'high' && !nextRiskNote) {
      throw new Error('Risk note is required when setting task risk to high');
    }

    const updated = await this.repository.update({
      ...input,
      childTaskIds: normalizedChildTaskIds ?? input.childTaskIds,
      riskNote: nextRiskNote,
    });

    if (input.parentTaskId !== undefined) {
      await this.syncParentChildLinksAfterMove({
        taskId: input.id,
        previousParentTaskId: detail.parentTaskId,
        nextParentTaskId: input.parentTaskId,
        existingTasks: existingTasks ?? await this.repository.list(),
      });
    }

    if (normalizedChildTaskIds !== undefined) {
      await this.syncChildParentLinksAfterParentUpdate({
        parentTaskId: input.id,
        previousChildTaskIds: detail.childTaskIds ?? [],
        nextChildTaskIds: normalizedChildTaskIds,
        existingTasks: existingTasks ?? await this.repository.list(),
      });
    }

    if (input.waitingReason !== undefined || detail.state === 'waiting_external') {
      await this.syncWaitingItem(updated.id, detail.state, updated.waitingReason);
    }

    return this.attachActiveWaitingItem(updated);
  }

  async transition(input: TransitionTaskInput): Promise<TaskListItemRecord> {
    const detail = await this.getExistingTaskOrThrow(input.id);

    const nextStates = allowedTransitions[detail.state];

    if (!nextStates.includes(input.nextState)) {
      throw new Error(`Invalid transition: ${detail.state} -> ${input.nextState}`);
    }

    if (
      input.nextState === 'waiting_external' &&
      !(input.waitingReason?.trim() || detail.waitingReason?.trim())
    ) {
      throw new Error('Waiting reason is required when transitioning to waiting_external');
    }

    const updated = await this.repository.transition({
      ...input,
      waitingReason:
        input.nextState === 'waiting_external'
          ? input.waitingReason ?? detail.waitingReason
          : null,
    });

    await this.syncWaitingItem(updated.id, updated.state, updated.waitingReason);

    return this.attachActiveWaitingItem(updated);
  }

  async recordCompletionCheck(input: RecordTaskCompletionCheckInput): Promise<void> {
    await this.getExistingTaskOrThrow(input.taskId);

    await this.repository.appendTimelineEvent(input.taskId, 'task.completion_check', {
      action: input.action,
      criteriaTotal: input.criteriaTotal,
      criteriaSatisfied: input.criteriaSatisfied,
      criteriaOpen: input.criteriaOpen,
      reason: input.reason?.trim() || null,
      runVerificationTone: input.runVerificationTone ?? null,
      runVerificationLabel: input.runVerificationLabel?.trim() || null,
      runVerificationDetail: input.runVerificationDetail?.trim() || null,
      source: input.source ?? 'task_completion_modal',
      checkedAt: input.checkedAt ?? new Date().toISOString(),
    });
  }

  async recordTimelineEvent(input: RecordTaskTimelineEventInput): Promise<void> {
    await this.getExistingTaskOrThrow(input.taskId);
    assertKnownPanelRuntimeTimelineEventType(input.type);
    await this.repository.appendTimelineEvent(input.taskId, input.type, input.payload ?? {});
  }

  async transitionIfAllowed(id: string, nextState: TaskState): Promise<TaskListItemRecord | null> {
    const detail = await this.getExistingTaskOrThrow(id);

    if (detail.state === nextState) {
      return this.attachActiveWaitingItem({
        id: detail.id,
        title: detail.title,
        summary: detail.summary,
        state: detail.state,
        nextStep: detail.nextStep,
        waitingReason: detail.waitingReason,
        riskLevel: detail.riskLevel,
        riskNote: detail.riskNote,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
      });
    }

    const nextStates = allowedTransitions[detail.state];

    if (!nextStates.includes(nextState)) {
      return null;
    }

    const updated = await this.repository.transition({
      id,
      nextState,
      waitingReason: nextState === 'waiting_external' ? detail.waitingReason : null,
    });

    await this.syncWaitingItem(updated.id, updated.state, updated.waitingReason);

    return this.attachActiveWaitingItem(updated);
  }

  async annotateDecisionCancelled(
    taskId: string,
    decisionTitle: string,
    decisionId?: string,
  ): Promise<TaskListItemRecord> {
    const detail = await this.getExistingTaskOrThrow(taskId);

    const updated = await this.repository.update({
      id: taskId,
      nextStep: '确认该任务是否还需要继续推进，或改走无需拍板的路径。',
      waitingReason: null,
      riskLevel: detail.riskLevel === 'high' ? 'high' : 'medium',
      riskNote: `相关决策已取消：${decisionTitle}`,
    });

    await this.syncWaitingItem(updated.id, detail.state, updated.waitingReason);

    await this.repository.appendTimelineEvent(taskId, 'task.decision_cancelled', {
      decisionId,
      decisionTitle,
      suggestedAction: '创建新的 Decision，或改走无需拍板的路径',
    });

    return this.attachActiveWaitingItem(updated);
  }

  async annotateDecisionApproved(
    taskId: string,
    decisionTitle: string,
    decisionId?: string,
  ): Promise<TaskListItemRecord> {
    const detail = await this.getExistingTaskOrThrow(taskId);
    const nextState =
      detail.state === 'waiting_external'
        ? 'planned'
        : detail.state === 'running'
          ? 'running'
          : 'planned';

    const transitioned =
      detail.state !== nextState
        ? await this.repository.transition({
            id: taskId,
            nextState,
            waitingReason: null,
          })
        : {
            id: detail.id,
            title: detail.title,
            summary: detail.summary,
            state: detail.state,
            nextStep: detail.nextStep,
            waitingReason: detail.waitingReason,
            riskLevel: detail.riskLevel,
            riskNote: detail.riskNote,
            createdAt: detail.createdAt,
            updatedAt: detail.updatedAt,
          };

    await this.syncWaitingItem(transitioned.id, transitioned.state, transitioned.waitingReason);

    const updated = await this.repository.update({
      id: taskId,
      nextStep: `已获批准：${decisionTitle}，继续推进下一步。`,
      waitingReason: null,
    });

    await this.repository.appendTimelineEvent(taskId, 'task.decision_approved', {
      decisionId,
      decisionTitle,
      nextState: transitioned.state,
      suggestedAction: '基于已批准决策继续推进任务',
    });

    return this.attachActiveWaitingItem(updated);
  }

  async annotateDecisionDeferred(
    taskId: string,
    decisionTitle: string,
    decisionId?: string,
  ): Promise<TaskListItemRecord> {
    await this.getExistingTaskOrThrow(taskId);

    const waitingReason = `等待重新拍板：${decisionTitle}`;
    const transitioned = await this.repository.transition({
      id: taskId,
      nextState: 'waiting_external',
      waitingReason,
    });

    await this.syncWaitingItem(transitioned.id, transitioned.state, transitioned.waitingReason);

    const updated = await this.repository.update({
      id: taskId,
      nextStep: '跟进该决策是否可以恢复拍板，或准备替代推进路径。',
      waitingReason,
    });

    await this.repository.appendTimelineEvent(taskId, 'task.decision_deferred', {
      decisionId,
      decisionTitle,
      waitingReason,
      suggestedAction: '跟进拍板时机，或准备替代路径',
    });

    return this.attachActiveWaitingItem(updated);
  }

  async annotateRunFailed(
    taskId: string,
    failureReason: string,
    runId?: string,
  ): Promise<TaskListItemRecord> {
    const detail = await this.restoreTaskAfterRun(await this.getExistingTaskOrThrow(taskId));

    const updated = await this.repository.update({
      id: taskId,
      nextStep: '检查失败原因，修正输入或上下文后再决定是否重试。',
      riskLevel: 'high',
      riskNote: failureReason,
    });

    await this.syncWaitingItem(updated.id, detail.state, updated.waitingReason);

    await this.repository.appendTimelineEvent(taskId, 'task.run_failed', {
      runId,
      failureReason,
      suggestedAction: '检查失败原因并准备重试 Run',
    });

    return this.attachActiveWaitingItem(updated);
  }

  async annotateRunPaused(
    taskId: string,
    pauseReason: string,
    runId?: string,
  ): Promise<TaskListItemRecord> {
    const detail = await this.restoreTaskAfterRun(await this.getExistingTaskOrThrow(taskId));

    const updated = await this.repository.update({
      id: taskId,
      nextStep: '先处理 Run 暂停原因，再决定是否继续或重试。',
      riskLevel: 'medium',
      riskNote: pauseReason,
    });

    await this.syncWaitingItem(updated.id, detail.state, updated.waitingReason);

    await this.repository.appendTimelineEvent(taskId, 'task.run_paused', {
      runId,
      pauseReason,
      suggestedAction: '处理暂停原因后继续 Run',
    });

    return this.attachActiveWaitingItem(updated);
  }

  async annotateRunCompleted(
    taskId: string,
    runType: RunType,
    hasOutput: boolean,
    runId?: string,
  ): Promise<TaskListItemRecord> {
    const detail = await this.restoreTaskAfterRun(await this.getExistingTaskOrThrow(taskId));
    const nextStep = hasOutput
      ? `审阅最新 ${runType} 产物，并决定是否继续推进。`
      : `确认这次 ${runType} 执行结果，并决定是否需要补充新的输入。`;

    const updated = await this.repository.update({
      id: taskId,
      nextStep,
    });

    await this.syncWaitingItem(updated.id, detail.state, updated.waitingReason);

    await this.repository.appendTimelineEvent(taskId, 'task.run_completed', {
      runId,
      runType,
      nextState: detail.state,
      hasOutput,
      suggestedAction: hasOutput ? '审阅最新产物并继续推进' : '确认执行结果并补充下一步',
    });

    return this.attachActiveWaitingItem(updated);
  }

  async annotateProcessTemplateSelected(
    taskId: string,
    sourceType: 'run' | 'decision_draft',
    sourceId: string,
    templateIds: string[],
    titles: string[],
    reason: string,
  ): Promise<void> {
    await this.repository.appendTimelineEvent(taskId, 'process_template.selected', {
      sourceType,
      sourceId,
      templateIds,
      titles,
      reason,
    });
  }

  async annotateProcessTemplateSkipped(
    taskId: string,
    sourceType: 'run' | 'decision_draft',
    sourceId: string,
    reason: string,
    candidateCount: number,
  ): Promise<void> {
    await this.repository.appendTimelineEvent(taskId, 'process_template.skipped', {
      sourceType,
      sourceId,
      reason,
      candidateCount,
    });
  }

  async createSourceContext(input: CreateSourceContextInput): Promise<SourceContextRecord> {
    await this.getExistingTaskOrThrow(input.taskId);

    if (!this.sourceContextRepository) {
      throw new Error('Source context repository is not configured');
    }

    const normalizedInput = normalizeCreateSourceContextInput(input);
    const created = await this.sourceContextRepository.create(normalizedInput);

    await this.repository.appendTimelineEvent(normalizedInput.taskId, 'source_context.created', {
      sourceContextId: created.id,
      title: created.title,
      kind: created.kind,
      isKey: created.isKey,
      uri: created.uri,
      capturedAt: created.capturedAt,
      runId: created.runId ?? null,
      batchId: created.batchId ?? null,
      sourceRole: created.sourceRole ?? 'raw',
    });

    return created;
  }

  async updateSourceContext(input: UpdateSourceContextInput): Promise<SourceContextRecord> {
    if (!this.sourceContextRepository) {
      throw new Error('Source context repository is not configured');
    }

    const updated = await this.sourceContextRepository.update(input);

    await this.repository.appendTimelineEvent(updated.taskId, 'source_context.updated', {
      sourceContextId: updated.id,
      title: updated.title,
      kind: updated.kind,
      isKey: updated.isKey,
      uri: updated.uri,
      capturedAt: updated.capturedAt,
      runId: updated.runId ?? null,
      batchId: updated.batchId ?? null,
      sourceRole: updated.sourceRole ?? 'raw',
    });

    return updated;
  }

  async archiveSourceContext(id: string): Promise<SourceContextRecord> {
    if (!this.sourceContextRepository) {
      throw new Error('Source context repository is not configured');
    }

    const archived = await this.sourceContextRepository.archive(id);

    await this.repository.appendTimelineEvent(archived.taskId, 'source_context.archived', {
      sourceContextId: archived.id,
      title: archived.title,
      kind: archived.kind,
      isKey: archived.isKey,
    });

    return archived;
  }

  async createBlocker(input: CreateBlockerInput): Promise<BlockerRecord> {
    await this.getExistingTaskOrThrow(input.taskId);

    if (!this.blockerRepository) {
      throw new Error('Blocker repository is not configured');
    }

    const existing = await this.blockerRepository.getActiveForTask(input.taskId);
    const blocker = existing
      ? await this.blockerRepository.update({
          id: existing.id,
          title: input.title,
          kind: input.kind,
          detail: input.detail,
          owner: input.owner,
          sourceContextId: input.sourceContextId,
        })
      : await this.blockerRepository.create(input);

    await this.repository.appendTimelineEvent(
      input.taskId,
      existing ? 'blocker.updated' : 'blocker.created',
      {
        blockerId: blocker.id,
        title: blocker.title,
        kind: blocker.kind,
        detail: blocker.detail,
        owner: blocker.owner,
        sourceContextId: blocker.sourceContextId,
        status: blocker.status,
      },
    );

    return blocker;
  }

  async updateBlocker(input: UpdateBlockerInput): Promise<BlockerRecord> {
    if (!this.blockerRepository) {
      throw new Error('Blocker repository is not configured');
    }

    const blocker = await this.blockerRepository.update(input);

    await this.repository.appendTimelineEvent(blocker.taskId, 'blocker.updated', {
      blockerId: blocker.id,
      title: blocker.title,
      kind: blocker.kind,
      detail: blocker.detail,
      owner: blocker.owner,
      sourceContextId: blocker.sourceContextId,
      status: blocker.status,
    });

    return blocker;
  }

  async resolveBlocker(id: string): Promise<BlockerRecord> {
    if (!this.blockerRepository) {
      throw new Error('Blocker repository is not configured');
    }

    const blocker = await this.blockerRepository.resolve(id);

    await this.repository.appendTimelineEvent(blocker.taskId, 'blocker.resolved', {
      blockerId: blocker.id,
      title: blocker.title,
      kind: blocker.kind,
      detail: blocker.detail,
      owner: blocker.owner,
      sourceContextId: blocker.sourceContextId,
      status: blocker.status,
      resolvedAt: blocker.resolvedAt,
    });

    return blocker;
  }

  async createCompletionCriteria(
    input: CreateCompletionCriteriaInput,
  ): Promise<CompletionCriteriaRecord> {
    await this.getExistingTaskOrThrow(input.taskId);

    if (!this.completionCriteriaRepository) {
      throw new Error('Completion criteria repository is not configured');
    }

    const created = await this.completionCriteriaRepository.create(input);

    await this.repository.appendTimelineEvent(input.taskId, 'completion_criteria.created', {
      completionCriteriaId: created.id,
      text: created.text,
      status: created.status,
    });

    return created;
  }

  async updateCompletionCriteria(
    input: UpdateCompletionCriteriaInput,
  ): Promise<CompletionCriteriaRecord> {
    if (!this.completionCriteriaRepository) {
      throw new Error('Completion criteria repository is not configured');
    }

    const updated = await this.completionCriteriaRepository.update(input);

    await this.repository.appendTimelineEvent(updated.taskId, 'completion_criteria.updated', {
      completionCriteriaId: updated.id,
      text: updated.text,
      status: updated.status,
    });

    return updated;
  }

  async satisfyCompletionCriteria(id: string): Promise<CompletionCriteriaRecord> {
    if (!this.completionCriteriaRepository) {
      throw new Error('Completion criteria repository is not configured');
    }

    const satisfied = await this.completionCriteriaRepository.satisfy(id);

    await this.repository.appendTimelineEvent(
      satisfied.taskId,
      'completion_criteria.satisfied',
      {
        completionCriteriaId: satisfied.id,
        text: satisfied.text,
        status: satisfied.status,
        satisfiedAt: satisfied.satisfiedAt,
      },
    );

    return satisfied;
  }

  async reopenCompletionCriteria(id: string): Promise<CompletionCriteriaRecord> {
    if (!this.completionCriteriaRepository) {
      throw new Error('Completion criteria repository is not configured');
    }

    const reopened = await this.completionCriteriaRepository.reopen(id);

    await this.repository.appendTimelineEvent(
      reopened.taskId,
      'completion_criteria.reopened',
      {
        completionCriteriaId: reopened.id,
        text: reopened.text,
        status: reopened.status,
      },
    );

    return reopened;
  }

  async createTaskDependency(input: CreateTaskDependencyInput): Promise<TaskDependencyRecord> {
    await this.getExistingTaskOrThrow(input.taskId);
    await this.getExistingTaskOrThrow(input.blockedByTaskId);

    if (!this.taskDependencyRepository) {
      throw new Error('Task dependency repository is not configured');
    }

    const existing = await this.taskDependencyRepository.getActiveForTask(input.taskId);
    const dependency = existing
      ? await this.taskDependencyRepository.update({
          id: existing.id,
          blockedByTaskId: input.blockedByTaskId,
          reason: input.reason,
        })
      : await this.taskDependencyRepository.create(input);

    await this.repository.appendTimelineEvent(
      input.taskId,
      existing ? 'task_dependency.updated' : 'task_dependency.created',
      {
        dependencyId: dependency.id,
        blockedByTaskId: dependency.blockedByTaskId,
        blockedByTaskTitle: dependency.blockedByTaskTitle,
        reason: dependency.reason,
        status: dependency.status,
      },
    );

    return dependency;
  }

  async updateTaskDependency(input: UpdateTaskDependencyInput): Promise<TaskDependencyRecord> {
    if (!this.taskDependencyRepository) {
      throw new Error('Task dependency repository is not configured');
    }

    if (input.blockedByTaskId) {
      await this.getExistingTaskOrThrow(input.blockedByTaskId);
    }

    const dependency = await this.taskDependencyRepository.update(input);

    await this.repository.appendTimelineEvent(dependency.taskId, 'task_dependency.updated', {
      dependencyId: dependency.id,
      blockedByTaskId: dependency.blockedByTaskId,
      blockedByTaskTitle: dependency.blockedByTaskTitle,
      reason: dependency.reason,
      status: dependency.status,
    });

    return dependency;
  }

  async resolveTaskDependency(id: string): Promise<TaskDependencyRecord> {
    if (!this.taskDependencyRepository) {
      throw new Error('Task dependency repository is not configured');
    }

    const dependency = await this.taskDependencyRepository.resolve(id);

    await this.repository.appendTimelineEvent(dependency.taskId, 'task_dependency.resolved', {
      dependencyId: dependency.id,
      blockedByTaskId: dependency.blockedByTaskId,
      blockedByTaskTitle: dependency.blockedByTaskTitle,
      reason: dependency.reason,
      status: dependency.status,
      resolvedAt: dependency.resolvedAt,
    });

    return dependency;
  }

  async createProcessTemplate(input: CreateProcessTemplateInput) {
    if (!this.processTemplateRepository) {
      throw new Error('Process template repository not configured');
    }

    return this.processTemplateRepository.create(input);
  }

  async updateProcessTemplate(input: UpdateProcessTemplateInput) {
    if (!this.processTemplateRepository) {
      throw new Error('Process template repository not configured');
    }

    return this.processTemplateRepository.update(input);
  }

  async archiveProcessTemplate(id: string) {
    if (!this.processTemplateRepository) {
      throw new Error('Process template repository not configured');
    }

    return this.processTemplateRepository.archive(id);
  }

  async applyProcessTemplate(input: ApplyProcessTemplateInput) {
    if (!this.taskProcessBindingRepository) {
      throw new Error('Task process binding repository not configured');
    }

    const result = await this.taskProcessBindingRepository.apply(input);

    if (result.action !== 'existing') {
      await this.repository.appendTimelineEvent(input.taskId, 'process_template.applied', {
        templateId: result.binding.id,
        bindingId: result.binding.bindingId,
        title: result.binding.title,
        kind: result.binding.kind,
      });
    }

    return result.binding;
  }

  async removeProcessTemplate(bindingId: string) {
    if (!this.taskProcessBindingRepository) {
      throw new Error('Task process binding repository not configured');
    }

    const removed = await this.taskProcessBindingRepository.remove(bindingId);
    await this.repository.appendTimelineEvent(removed.taskId, 'process_template.removed', {
      templateId: removed.id,
      bindingId: removed.bindingId,
      title: removed.title,
      kind: removed.kind,
    });

    return removed;
  }
}
