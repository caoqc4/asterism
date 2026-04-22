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

  list(): Promise<TaskRecord[]> {
    return this.repository.list();
  }

  create(input: CreateTaskInput): Promise<TaskRecord> {
    return this.repository.create(input);
  }

  getDetail(taskId: string): Promise<TaskDetail | null> {
    return this.repository.getDetail(taskId);
  }

  update(input: UpdateTaskInput): Promise<TaskRecord> {
    return this.repository.update(input);
  }

  async transition(input: TransitionTaskInput): Promise<TaskRecord> {
    const detail = await this.repository.getDetail(input.id);

    if (!detail) {
      throw new Error(`Task not found: ${input.id}`);
    }

    const nextStates = allowedTransitions[detail.state];

    if (!nextStates.includes(input.nextState)) {
      throw new Error(`Invalid transition: ${detail.state} -> ${input.nextState}`);
    }

    return this.repository.transition(input);
  }

  async transitionIfAllowed(id: string, nextState: TaskState): Promise<TaskRecord | null> {
    const detail = await this.repository.getDetail(id);

    if (!detail) {
      throw new Error(`Task not found: ${id}`);
    }

    if (detail.state === nextState) {
      return {
        id: detail.id,
        title: detail.title,
        summary: detail.summary,
        state: detail.state,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
      };
    }

    const nextStates = allowedTransitions[detail.state];

    if (!nextStates.includes(nextState)) {
      return null;
    }

    return this.repository.transition({ id, nextState });
  }
}
