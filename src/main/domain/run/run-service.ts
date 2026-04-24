import { TextExecutor } from '../../executors/text-executor.js';
import { AiConfigService } from '../../keychain/ai-config-service.js';
import type {
  CreateRunInput,
  RunDetailRecord,
  RunRecord,
  RunStepRecord,
} from '../../../shared/types/run.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { RunRepository } from '../../db/repositories/run-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
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
    private readonly runStepRepository: RunStepRepository = new RunStepRepository(),
  ) {}

  list(): Promise<RunRecord[]> {
    return this.runRepository.list();
  }

  async getDetail(runId: string): Promise<RunDetailRecord | null> {
    const run = await this.runRepository.getDetail(runId);

    if (!run) {
      return null;
    }

    return {
      ...run,
      steps: await this.runStepRepository.listForRun(runId),
    };
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
    await this.runStepRepository.create({
      runId: created.id,
      kind: 'plan',
      status: 'completed',
      title: '准备执行上下文',
      input: [
        `Run 类型：${input.type}`,
        input.instructions?.trim() ? `附加要求：${input.instructions.trim()}` : '附加要求：无',
        `任务状态：${taskForExecution.state}`,
      ].join('\n'),
      output: '已读取任务上下文，并准备进入模型执行。',
    });
    let modelStep: RunStepRecord | null = null;

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
          'run',
          created.id,
          selection.selectedTemplates.map((item) => item.id),
          selection.selectedTemplates.map((item) => item.title),
          selection.reason,
        );
      } else {
        await this.taskService.annotateProcessTemplateSkipped(
          input.taskId,
          'run',
          created.id,
          selection.reason,
          taskForExecution.processTemplates.length,
        );
      }

      modelStep = await this.runStepRepository.create({
        runId: created.id,
        kind: 'model',
        status: 'running',
        title: `${input.type} 模型执行`,
        input: [
          `provider=${runtimeConfig.provider}`,
          `model=${runtimeConfig.model}`,
          selection.shouldUse
            ? `process templates=${selection.selectedTemplates.map((item) => item.title).join(', ')}`
            : `process templates skipped=${selection.reason}`,
        ].join('\n'),
      });

      const output = await this.textExecutor.execute(taskForExecution, input, runtimeConfig, {
        selectedTemplates: selection.shouldUse ? selection.selectedTemplates : [],
      });
      await this.runStepRepository.update(modelStep.id, {
        status: 'completed',
        output: output || '模型执行完成，但没有产生正文输出。',
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
      await this.runStepRepository.create({
        runId: created.id,
        kind: 'final',
        status: 'completed',
        title: '完成 Run 并回写任务',
        output: output?.trim()
          ? 'Run 已完成，输出已保存为任务产物并写入任务时间线。'
          : 'Run 已完成，但没有可保存的输出产物。',
      });
      return completed;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown executor error';
      if (modelStep) {
        await this.runStepRepository.update(modelStep.id, {
          status: 'failed',
          error: message,
        });
      }
      const failed = await this.runRepository.updateResult(
        created.id,
        'failed',
        message,
        'system',
        message,
      );
      await this.taskService.annotateRunFailed(input.taskId, message, failed.id);
      await this.runStepRepository.create({
        runId: created.id,
        kind: 'final',
        status: 'failed',
        title: 'Run 执行失败并回写任务',
        error: message,
      });
      return failed;
    }
  }
}
