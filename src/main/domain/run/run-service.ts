import { TextExecutor } from '../../executors/text-executor.js';
import { AiConfigService } from '../../keychain/ai-config-service.js';
import type { CreateRunInput, RunRecord } from '../../../shared/types/run.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { RunRepository } from '../../db/repositories/run-repository.js';
import { TaskService } from '../task/task-service.js';
import {
  ProcessTemplateSelector,
  type ProcessTemplateSelectionResult,
} from './process-template-selector.js';

export class RunService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly taskService: TaskService,
    private readonly artifactRepository: ArtifactRepository,
    private readonly aiConfigService: AiConfigService,
    private readonly textExecutor: TextExecutor,
    private readonly processTemplateSelector: ProcessTemplateSelector = new ProcessTemplateSelector(),
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
      let selection: ProcessTemplateSelectionResult = {
        shouldUse: false,
        selectedTemplates: [],
        reason: '当前未评估 process template。',
      };

      try {
        selection = await this.processTemplateSelector.select(
          taskForExecution,
          input,
          runtimeConfig,
        );
      } catch (error) {
        selection = {
          shouldUse: false,
          selectedTemplates: [],
          reason:
            error instanceof Error
              ? `process template selector 不可用：${error.message}`
              : 'process template selector 不可用。',
        };
      }

      if (selection.shouldUse) {
        await this.taskService.annotateProcessTemplateSelected(
          input.taskId,
          created.id,
          selection.selectedTemplates.map((item) => item.id),
          selection.selectedTemplates.map((item) => item.title),
          selection.reason,
        );
      } else {
        await this.taskService.annotateProcessTemplateSkipped(
          input.taskId,
          created.id,
          selection.reason,
          taskForExecution.processTemplates.length,
        );
      }

      const output = await this.textExecutor.execute(taskForExecution, input, runtimeConfig, {
        selectedTemplates: selection.shouldUse ? selection.selectedTemplates : [],
      });
      const completed = await this.runRepository.updateResult(created.id, 'completed', output, 'ai');
      if (output?.trim()) {
        await this.artifactRepository.createFromRun({
          taskId: input.taskId,
          runId: completed.id,
          runType: input.type,
          content: output,
        });
      }
      await this.taskService.annotateRunCompleted(
        input.taskId,
        input.type,
        Boolean(output?.trim()),
        completed.id,
      );
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
      await this.taskService.annotateRunFailed(input.taskId, message, failed.id);
      return failed;
    }
  }
}
