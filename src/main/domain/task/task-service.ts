import type {
  ApplyProcessTemplateInput,
  CreateProcessTemplateInput,
  UpdateProcessTemplateInput,
} from '../../../shared/types/process-template.js';
import type {
  CreateTaskInput,
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
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { ProcessTemplateRepository } from '../../db/repositories/process-template-repository.js';
import { SourceContextRepository } from '../../db/repositories/source-context-repository.js';
import { TaskProcessBindingRepository } from '../../db/repositories/task-process-binding-repository.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';
import { WaitingItemRepository } from '../../db/repositories/waiting-item-repository.js';
import {
  buildTaskResumeLatestChange,
  deriveNextSuggestedMove,
  getCurrentMethodSelectionReason,
  getKeySourcePriorityReason,
} from '../working-context/assembler.js';

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

    return {
      ...task,
      activeWaitingItem,
    };
  }

  private async attachDetailWaitingItem(detail: TaskDetailBase): Promise<TaskDetailBase> {
    const activeWaitingItem = await this.waitingItemRepository.getActiveForTask(detail.id);

    return {
      ...detail,
      activeWaitingItem,
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

  private buildResumeCard(detail: TaskDetailBase): TaskResumeCardRecord {
    const keySource = detail.sourceContexts.find((item) => item.isKey) ?? detail.sourceContexts[0] ?? null;
    const currentMethod = detail.processTemplates[0] ?? null;
    const latestArtifact = detail.artifacts[0] ?? null;
    const waitingReason = detail.activeWaitingItem?.reason ?? detail.waitingReason;

    const currentStateParts = [`状态：${detail.state}`];

    if (waitingReason) {
      currentStateParts.push(`等待：${waitingReason}`);
    }

    if (detail.riskLevel !== 'none') {
      currentStateParts.push(
        `风险：${detail.riskLevel}${detail.riskNote ? ` · ${detail.riskNote}` : ''}`,
      );
    }

    const latestChange = buildTaskResumeLatestChange(detail.timeline);
    const nextSuggestedMove = deriveNextSuggestedMove({
      explicitNextStep: detail.nextStep,
      taskTitle: detail.title,
      waitingReason,
      riskLevel: detail.riskLevel,
      riskNote: detail.riskNote,
      keySourceTitle: keySource?.title ?? null,
      latestArtifactTitle: latestArtifact?.title ?? null,
      recentChange: latestChange.recentChange,
    });

    const summaryParts = [
      `这条任务目前处于 ${detail.state}${waitingReason ? `，正在等待“${waitingReason}”` : ''}${detail.riskLevel === 'high' && detail.riskNote ? `，且存在高风险“${detail.riskNote}”` : ''}。`,
      latestChange.summary,
      keySource ? `当前最关键的来源材料是“${keySource.title}”。` : null,
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
      keySource: keySource
        ? {
            sourceContextId: keySource.id,
            title: keySource.title,
            detail: keySource.note ?? keySource.uri,
            priorityReason: getKeySourcePriorityReason({
              timeline: detail.timeline,
              keySource,
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
    };
  }

  async list(): Promise<TaskListItemRecord[]> {
    const tasks = await this.repository.list();

    return Promise.all(tasks.map((task) => this.attachActiveWaitingItem(task)));
  }

  async create(input: CreateTaskInput): Promise<TaskListItemRecord> {
    const created = await this.repository.create(input);
    return this.attachActiveWaitingItem(created);
  }

  async getDetail(taskId: string): Promise<TaskDetail | null> {
    const detail = await this.repository.getDetail(taskId);

    if (!detail) {
      return null;
    }

    const enriched = await this.attachProcessTemplates(
      await this.attachSourceContexts(
        await this.attachArtifacts(await this.attachDetailWaitingItem(detail)),
      ),
    );

    return {
      ...enriched,
      resumeCard: this.buildResumeCard(enriched),
    };
  }

  async update(input: UpdateTaskInput): Promise<TaskListItemRecord> {
    const detail = await this.getExistingTaskOrThrow(input.id);
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
      riskNote: nextRiskNote,
    });

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

  async annotateRunCompleted(
    taskId: string,
    runType: 'draft' | 'summarize',
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

    const created = await this.sourceContextRepository.create(input);

    await this.repository.appendTimelineEvent(input.taskId, 'source_context.created', {
      sourceContextId: created.id,
      title: created.title,
      kind: created.kind,
      isKey: created.isKey,
      uri: created.uri,
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
