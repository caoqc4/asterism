import type {
  CreateDecisionInput,
  DecisionActionInput,
  DecisionRecord,
} from '../../../shared/types/decision.js';
import { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';

export class DecisionService {
  constructor(
    private readonly decisionRepository: DecisionRepository,
    private readonly taskRepository: TaskRepository,
  ) {}

  list(): Promise<DecisionRecord[]> {
    return this.decisionRepository.list();
  }

  async create(input: CreateDecisionInput): Promise<DecisionRecord> {
    const task = await this.taskRepository.getDetail(input.taskId);

    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }

    return this.decisionRepository.create(input);
  }

  act(input: DecisionActionInput): Promise<DecisionRecord> {
    return this.decisionRepository.act(input);
  }
}
