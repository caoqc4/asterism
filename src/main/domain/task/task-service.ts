import type {
  CreateTaskInput,
  TaskDetail,
  TaskRecord,
  TaskState,
  TransitionTaskInput,
  UpdateTaskInput,
} from '../../../shared/types/task.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';
import { WaitingItemRepository } from '../../db/repositories/waiting-item-repository.js';

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

  private async attachActiveWaitingItem<T extends TaskRecord | TaskDetail>(task: T): Promise<T> {
    const activeWaitingItem = await this.waitingItemRepository.getActiveForTask(task.id);

    return {
      ...task,
      activeWaitingItem,
    };
  }

  private async attachArtifacts(detail: TaskDetail): Promise<TaskDetail> {
    const artifacts = this.artifactRepository
      ? await this.artifactRepository.listRecentForTask(detail.id)
      : [];

    return {
      ...detail,
      artifacts,
    };
  }

  private async getExistingTaskOrThrow(taskId: string): Promise<TaskDetail> {
    const detail = await this.repository.getDetail(taskId);

    if (!detail) {
      throw new Error(`Task not found: ${taskId}`);
    }

    return detail;
  }

  private async restoreTaskAfterRun(detail: TaskDetail): Promise<TaskDetail> {
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

  async list(): Promise<TaskRecord[]> {
    const tasks = await this.repository.list();

    return Promise.all(tasks.map((task) => this.attachActiveWaitingItem(task)));
  }

  async create(input: CreateTaskInput): Promise<TaskRecord> {
    const created = await this.repository.create(input);
    return this.attachActiveWaitingItem(created);
  }

  async getDetail(taskId: string): Promise<TaskDetail | null> {
    const detail = await this.repository.getDetail(taskId);

    if (!detail) {
      return null;
    }

    return this.attachArtifacts(await this.attachActiveWaitingItem(detail));
  }

  async update(input: UpdateTaskInput): Promise<TaskRecord> {
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

  async transition(input: TransitionTaskInput): Promise<TaskRecord> {
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

  async transitionIfAllowed(id: string, nextState: TaskState): Promise<TaskRecord | null> {
    const detail = await this.getExistingTaskOrThrow(id);

    if (detail.state === nextState) {
      return this.attachActiveWaitingItem({
        id: detail.id,
        title: detail.title,
        summary: detail.summary,
        state: detail.state,
        nextStep: detail.nextStep,
        waitingReason: detail.waitingReason,
        activeWaitingItem: detail.activeWaitingItem ?? null,
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

  async annotateDecisionCancelled(taskId: string, decisionTitle: string): Promise<TaskRecord> {
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
      decisionTitle,
      suggestedAction: '创建新的 Decision，或改走无需拍板的路径',
    });

    return this.attachActiveWaitingItem(updated);
  }

  async annotateRunFailed(taskId: string, failureReason: string): Promise<TaskRecord> {
    const detail = await this.restoreTaskAfterRun(await this.getExistingTaskOrThrow(taskId));

    const updated = await this.repository.update({
      id: taskId,
      nextStep: '检查失败原因，修正输入或上下文后再决定是否重试。',
      riskLevel: 'high',
      riskNote: failureReason,
    });

    await this.syncWaitingItem(updated.id, detail.state, updated.waitingReason);

    await this.repository.appendTimelineEvent(taskId, 'task.run_failed', {
      failureReason,
      suggestedAction: '检查失败原因并准备重试 Run',
    });

    return this.attachActiveWaitingItem(updated);
  }

  async annotateRunCompleted(
    taskId: string,
    runType: 'draft' | 'summarize',
    hasOutput: boolean,
  ): Promise<TaskRecord> {
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
      runType,
      nextState: detail.state,
      hasOutput,
      suggestedAction: hasOutput ? '审阅最新产物并继续推进' : '确认执行结果并补充下一步',
    });

    return this.attachActiveWaitingItem(updated);
  }
}
