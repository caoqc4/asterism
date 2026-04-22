import type {
  CreateTaskInput,
  TaskDetail,
  TaskRecord,
  TaskState,
  TransitionTaskInput,
  UpdateTaskInput,
} from '../../../shared/types/task.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';

const allowedTransitions: Record<TaskState, TaskState[]> = {
  captured: ['triaged', 'planned', 'archived'],
  triaged: ['planned', 'archived'],
  planned: ['running', 'waiting_external', 'completed', 'archived'],
  running: ['waiting_external', 'completed', 'archived'],
  waiting_external: ['planned', 'running', 'completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

export class TaskService {
  constructor(private readonly repository: TaskRepository) {}

  private async getExistingTaskOrThrow(taskId: string): Promise<TaskDetail> {
    const detail = await this.repository.getDetail(taskId);

    if (!detail) {
      throw new Error(`Task not found: ${taskId}`);
    }

    return detail;
  }

  list(): Promise<TaskRecord[]> {
    return this.repository.list();
  }

  create(input: CreateTaskInput): Promise<TaskRecord> {
    return this.repository.create(input);
  }

  getDetail(taskId: string): Promise<TaskDetail | null> {
    return this.repository.getDetail(taskId);
  }

  async update(input: UpdateTaskInput): Promise<TaskRecord> {
    const detail = await this.getExistingTaskOrThrow(input.id);
    const nextRiskLevel = input.riskLevel ?? detail.riskLevel;
    const nextRiskNote =
      input.riskNote === undefined ? detail.riskNote : input.riskNote?.trim() || null;

    if (nextRiskLevel === 'high' && !nextRiskNote) {
      throw new Error('Risk note is required when setting task risk to high');
    }

    return this.repository.update(input);
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

    return this.repository.transition({
      ...input,
      waitingReason:
        input.nextState === 'waiting_external'
          ? input.waitingReason ?? detail.waitingReason
          : null,
    });
  }

  async transitionIfAllowed(id: string, nextState: TaskState): Promise<TaskRecord | null> {
    const detail = await this.getExistingTaskOrThrow(id);

    if (detail.state === nextState) {
      return {
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
    }

    const nextStates = allowedTransitions[detail.state];

    if (!nextStates.includes(nextState)) {
      return null;
    }

    return this.repository.transition({
      id,
      nextState,
      waitingReason: nextState === 'waiting_external' ? detail.waitingReason : null,
    });
  }

  async annotateDecisionCancelled(taskId: string, decisionTitle: string): Promise<TaskRecord> {
    const detail = await this.getExistingTaskOrThrow(taskId);

    return this.repository.update({
      id: taskId,
      nextStep: '确认该任务是否还需要继续推进，或改走无需拍板的路径。',
      waitingReason: null,
      riskLevel: detail.riskLevel === 'high' ? 'high' : 'medium',
      riskNote: `相关决策已取消：${decisionTitle}`,
    });
  }

  async annotateRunFailed(taskId: string, failureReason: string): Promise<TaskRecord> {
    await this.getExistingTaskOrThrow(taskId);

    return this.repository.update({
      id: taskId,
      nextStep: '检查失败原因，修正输入或上下文后再决定是否重试。',
      riskLevel: 'high',
      riskNote: failureReason,
    });
  }
}
