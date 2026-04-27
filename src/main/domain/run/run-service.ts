import { TextExecutor } from '../../executors/text-executor.js';
import { AiConfigService } from '../../keychain/ai-config-service.js';
import { validateResumeCheckpointPayload } from '../../../shared/types/run-checkpoint-payload.js';
import type {
  CreateRunInput,
  RunDetailRecord,
  RunRecord,
} from '../../../shared/types/run.js';
import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { RunRepository } from '../../db/repositories/run-repository.js';
import { AgentSessionRepository } from '../../db/repositories/agent-session-repository.js';
import { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
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
    private readonly runCheckpointRepository: RunCheckpointRepository = new RunCheckpointRepository(),
    private readonly agentSessionRepository: AgentSessionRepository = new AgentSessionRepository(),
    private readonly runOrchestrator: RunOrchestrator = new RunOrchestrator(
      aiConfigService,
      textExecutor,
      processTemplateSelector,
      runStepRepository,
      agentToolRegistry,
      undefined,
      agentSessionRepository,
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
      artifacts: await this.artifactRepository.listForRun(runId),
      steps: await this.runStepRepository.listForRun(runId),
      checkpoints: await this.runCheckpointRepository.listForRun(runId),
      agentSessions: await this.agentSessionRepository.listForRun(runId),
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

    if (result.status === 'needs_confirmation') {
      return this.runRepository.updateResult(
        created.id,
        'needs_confirmation',
        result.message,
        'system',
      );
    }

    if (result.status === 'paused') {
      const paused = await this.runRepository.updateResult(
        created.id,
        'paused',
        result.message,
        'system',
        null,
      );
      await this.taskService.annotateRunPaused(input.taskId, result.message, paused.id);
      return paused;
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

  async continuePausedRun(runId: string): Promise<RunRecord> {
    const run = await this.getDetail(runId);

    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    if (run.status !== 'paused') {
      throw new Error(`Run is not paused: ${runId}`);
    }

    if (!this.agentToolRegistry) {
      throw new Error('Agent tool registry is required to continue paused runs.');
    }

    const checkpoint = run.checkpoints?.find((item) =>
      item.status === 'open' && item.kind === 'resume'
    );

    if (!checkpoint?.payload) {
      throw new Error(`Open resume checkpoint not found for run: ${runId}`);
    }

    const validation = validateResumeCheckpointPayload(checkpoint.payload, {
      runId,
      taskId: run.taskId,
    });

    if (validation.status === 'invalid') {
      throw new Error(validation.reason);
    }

    const { payload } = validation;

    if (payload.nextTool !== 'artifact.create_note') {
      throw new Error(`Unsupported resume tool: ${payload.nextTool}`);
    }

    const result = await this.agentToolRegistry.execute(
      payload.nextTool,
      payload.nextInput,
      {
        runId,
        taskId: run.taskId,
      },
      payload.policySnapshot,
    );

    if (!result.success) {
      const failed = await this.runRepository.updateResult(
        runId,
        'failed',
        result.error ?? result.summary,
        'system',
        result.error ?? result.summary,
      );
      await this.taskService.annotateRunFailed(run.taskId, result.error ?? result.summary, runId);
      return failed;
    }

    await this.runCheckpointRepository.updateStatus(checkpoint.id, 'resolved');
    await this.runStepRepository.create({
      runId,
      kind: 'final',
      status: 'completed',
      title: '完成 paused run 续跑',
      output: '已从 resume checkpoint 继续执行并完成 Run。',
    });

    const completed = await this.runRepository.updateResult(
      runId,
      'completed',
      result.output ?? result.summary,
      'system',
    );
    await this.taskService.annotateRunCompleted(
      run.taskId,
      run.type,
      Boolean((result.output ?? result.summary).trim()),
      runId,
    );

    return completed;
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
