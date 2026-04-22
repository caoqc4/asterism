import { TextExecutor } from '../../executors/text-executor.js';
import { AiConfigService } from '../../keychain/ai-config-service.js';
import type { CreateRunInput, RunRecord } from '../../../shared/types/run.js';
import { RunRepository } from '../../db/repositories/run-repository.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';

export class RunService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly taskRepository: TaskRepository,
    private readonly aiConfigService: AiConfigService,
    private readonly textExecutor: TextExecutor,
  ) {}

  list(): Promise<RunRecord[]> {
    return this.runRepository.list();
  }

  getDetail(runId: string): Promise<RunRecord | null> {
    return this.runRepository.getDetail(runId);
  }

  async trigger(input: CreateRunInput): Promise<RunRecord> {
    const task = await this.taskRepository.getDetail(input.taskId);

    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }

    const created = await this.runRepository.create(input);

    try {
      const runtimeConfig = await this.aiConfigService.resolveRuntimeConfig();
      const output = await this.textExecutor.execute(task, input, runtimeConfig);
      return await this.runRepository.updateResult(created.id, 'completed', output, 'ai');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown executor error';
      return this.runRepository.updateResult(created.id, 'failed', message, 'system', message);
    }
  }
}
