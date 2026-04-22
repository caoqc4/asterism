import type {
  CreateDecisionInput,
  DecisionActionInput,
  DecisionRecord,
} from '../../../shared/types/decision.js';
import { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { TaskService } from '../task/task-service.js';

export class DecisionService {
  constructor(
    private readonly decisionRepository: DecisionRepository,
    private readonly taskService: TaskService,
  ) {}

  list(): Promise<DecisionRecord[]> {
    return this.decisionRepository.list();
  }

  async create(input: CreateDecisionInput): Promise<DecisionRecord> {
    const task = await this.taskService.getDetail(input.taskId);

    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }

    return this.decisionRepository.create(input);
  }

  async act(input: DecisionActionInput): Promise<DecisionRecord> {
    const updated = await this.decisionRepository.act(input);

    if (input.action === 'approve') {
      await this.taskService.annotateDecisionApproved(updated.taskId, updated.title);
    }

    if (input.action === 'defer') {
      await this.taskService.annotateDecisionDeferred(updated.taskId, updated.title);
    }

    if (input.action === 'cancel') {
      await this.taskService.annotateDecisionCancelled(updated.taskId, updated.title);
    }

    return updated;
  }
}
