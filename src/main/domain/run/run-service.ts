import { TextExecutor } from '../../executors/text-executor.js';
import { AiConfigService } from '../../keychain/ai-config-service.js';
import type {
  CreateRunInput,
  RunDetailRecord,
  RunRecord,
} from '../../../shared/types/run.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { RunRepository } from '../../db/repositories/run-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { TaskService } from '../task/task-service.js';
import { AgentToolRegistry } from './agent-tool-registry.js';
import { ProcessTemplateSelector } from './process-template-selector.js';
import { RunOrchestrator, type RunOrchestrationResult } from './run-orchestrator.js';

export class RunService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly taskService: TaskService,
    private readonly artifactRepository: ArtifactRepository,
    private readonly aiConfigService: AiConfigService,
    private readonly textExecutor: TextExecutor,
    private readonly processTemplateSelector: ProcessTemplateSelector = new ProcessTemplateSelector(),
    private readonly runStepRepository: RunStepRepository = new RunStepRepository(),
    private readonly agentToolRegistry: AgentToolRegistry | null = null,
    private readonly runOrchestrator: RunOrchestrator = new RunOrchestrator(
      aiConfigService,
      textExecutor,
      processTemplateSelector,
      runStepRepository,
      agentToolRegistry,
    ),
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
    const result =
      input.type === 'agent'
        ? await this.runOrchestrator.executeAgentRun({
            run: created,
            task: taskForExecution,
            input,
          })
        : await this.runOrchestrator.executeTextRun({
            run: created,
            task: taskForExecution,
            input,
          });

    await this.annotateProcessTemplateSelection(input.taskId, created.id, taskForExecution, result);

    if (result.status === 'completed') {
      const completed = await this.runRepository.updateResult(created.id, 'completed', result.output, 'ai');
      if (result.output?.trim()) {
        await this.artifactRepository.createFromRun({
          taskId: input.taskId,
          runId: completed.id,
          runType: input.type,
          content: result.output,
        });
      }
      await this.taskService.annotateRunCompleted(
        input.taskId,
        input.type,
        Boolean(result.output?.trim()),
        completed.id,
      );
      return completed;
    }

    const failed = await this.runRepository.updateResult(
      created.id,
      'failed',
      result.message,
      'system',
      result.message,
    );
    await this.taskService.annotateRunFailed(input.taskId, result.message, failed.id);
    return failed;
  }

  private async annotateProcessTemplateSelection(
    taskId: string,
    runId: string,
    taskForExecution: Awaited<ReturnType<TaskService['getDetail']>>,
    result: RunOrchestrationResult,
  ) {
    if (!taskForExecution || !result.selection) {
      return;
    }

    if (result.selection.shouldUse) {
      await this.taskService.annotateProcessTemplateSelected(
        taskId,
        'run',
        runId,
        result.selection.selectedTemplates.map((item) => item.id),
        result.selection.selectedTemplates.map((item) => item.title),
        result.selection.reason,
      );
      return;
    }

    await this.taskService.annotateProcessTemplateSkipped(
      taskId,
      'run',
      runId,
      result.selection.reason,
      taskForExecution.processTemplates.length,
    );
  }
}
