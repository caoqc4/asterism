import { TextExecutor } from '../../executors/text-executor.js';
import { AiConfigService } from '../../keychain/ai-config-service.js';
import type { CreateRunInput, RunRecord } from '../../../shared/types/run.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { RunRepository } from '../../db/repositories/run-repository.js';
import { TaskService } from '../task/task-service.js';

export class RunService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly taskService: TaskService,
    private readonly artifactRepository: ArtifactRepository,
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
    const task = await this.taskService.getDetail(input.taskId);

    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }

    let taskForExecution = task;

    if (task.state === 'planned') {
      const transitioned = await this.taskService.transitionIfAllowed(task.id, 'running');

      if (transitioned) {
        taskForExecution = {
          ...task,
          state: transitioned.state,
          updatedAt: transitioned.updatedAt,
        };
      }
    }

    const created = await this.runRepository.create(input);

    try {
      const runtimeConfig = await this.aiConfigService.resolveRuntimeConfig();
      const output = await this.textExecutor.execute(taskForExecution, input, runtimeConfig);
      const completed = await this.runRepository.updateResult(created.id, 'completed', output, 'ai');
      if (output?.trim()) {
        await this.artifactRepository.createFromRun({
          taskId: input.taskId,
          runId: completed.id,
          runType: input.type,
          content: output,
        });
      }
      await this.taskService.annotateRunCompleted(input.taskId, input.type, Boolean(output?.trim()));
      return completed;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown executor error';
      const failed = await this.runRepository.updateResult(
        created.id,
        'failed',
        message,
        'system',
        message,
      );
      await this.taskService.annotateRunFailed(input.taskId, message);
      return failed;
    }
  }
}
