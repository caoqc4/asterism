import type { CreateRunInput, RunRecord, RunStepRecord } from '../../../shared/types/run.js';
import type { TaskDetail } from '../../../shared/types/task.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { TextExecutor } from '../../executors/text-executor.js';
import { AiConfigService } from '../../keychain/ai-config-service.js';
import { AgentRunLoop } from './agent-run-loop.js';
import type { AgentToolRegistry } from './agent-tool-registry.js';
import {
  ProcessTemplateSelector,
  type ProcessTemplateSelectionResult,
} from './process-template-selector.js';
import {
  buildAgentRunRequest,
  formatAgentRunRequestForStep,
  LOCAL_AGENT_TOOL_POLICY,
} from './agent-working-context.js';

export type RunOrchestrationResult =
  | {
      status: 'completed';
      output: string;
      selection: ProcessTemplateSelectionResult;
    }
  | {
      status: 'failed';
      message: string;
      selection: ProcessTemplateSelectionResult | null;
    }
  | {
      status: 'needs_confirmation';
      message: string;
      checkpointId: string;
      selection: ProcessTemplateSelectionResult;
    };

export class RunOrchestrator {
  constructor(
    private readonly aiConfigService: AiConfigService,
    private readonly textExecutor: TextExecutor,
    private readonly processTemplateSelector: ProcessTemplateSelector = new ProcessTemplateSelector(),
    private readonly runStepRepository: RunStepRepository = new RunStepRepository(),
    private readonly agentToolRegistry: AgentToolRegistry | null = null,
    private readonly agentRunLoop: AgentRunLoop | null = agentToolRegistry
      ? new AgentRunLoop(agentToolRegistry, runStepRepository)
      : null,
  ) {}

  async executeTextRun(params: {
    run: RunRecord;
    task: TaskDetail;
    input: CreateRunInput;
  }): Promise<RunOrchestrationResult> {
    const { input, run, task } = params;
    const request = buildAgentRunRequest({ run, task, input });

    await this.runStepRepository.create({
      runId: run.id,
      kind: 'plan',
      status: 'completed',
      title: '准备执行上下文',
      input: formatAgentRunRequestForStep(request),
      output: '已读取任务上下文，并准备进入模型执行。',
    });

    let modelStep: RunStepRecord | null = null;
    let selection: ProcessTemplateSelectionResult | null = null;

    try {
      const runtimeConfig = await this.aiConfigService.resolveRuntimeConfig();
      selection = await this.selectProcessTemplates(task, input, runtimeConfig);

      modelStep = await this.runStepRepository.create({
        runId: run.id,
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

      const output = await this.textExecutor.execute(task, input, runtimeConfig, {
        selectedTemplates: selection.shouldUse ? selection.selectedTemplates : [],
      });

      await this.runStepRepository.update(modelStep.id, {
        status: 'completed',
        output: output || '模型执行完成，但没有产生正文输出。',
      });
      await this.runStepRepository.create({
        runId: run.id,
        kind: 'final',
        status: 'completed',
        title: '完成 Run 执行',
        output: output?.trim()
          ? 'Run 执行已完成，输出可由服务层保存为任务产物并写入任务时间线。'
          : 'Run 执行已完成，但没有可保存的输出产物。',
      });

      return {
        status: 'completed',
        output,
        selection,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown executor error';

      if (modelStep) {
        await this.runStepRepository.update(modelStep.id, {
          status: 'failed',
          error: message,
        });
      }

      await this.runStepRepository.create({
        runId: run.id,
        kind: 'final',
        status: 'failed',
        title: 'Run 执行失败',
        error: message,
      });

      return {
        status: 'failed',
        message,
        selection,
      };
    }
  }

  async executeAgentRun(params: {
    run: RunRecord;
    task: TaskDetail;
    input: CreateRunInput;
  }): Promise<RunOrchestrationResult> {
    const input: CreateRunInput = {
      ...params.input,
      type: 'agent',
    };
    const result = await this.executeTextRun({
      ...params,
      input,
    });

    if (result.status !== 'completed' || !this.agentRunLoop || !result.output.trim()) {
      return result;
    }

    const request = buildAgentRunRequest({
      run: params.run,
      task: params.task,
      input,
      policy: LOCAL_AGENT_TOOL_POLICY,
    });

    if (request.policy.confirmationRequiredRisks.includes('local_write')) {
      return result;
    }

    const loopResult = await this.agentRunLoop.executeLocalNoteLoop({
      request,
      modelOutput: result.output,
      taskTitle: params.task.title,
    });

    if (loopResult.status === 'needs_confirmation') {
      return {
        status: 'needs_confirmation',
        message: loopResult.message,
        checkpointId: loopResult.checkpointId,
        selection: result.selection,
      };
    }

    if (loopResult.status === 'failed') {
      return {
        status: 'failed',
        message: loopResult.message,
        selection: result.selection,
      };
    }

    return result;
  }

  private async selectProcessTemplates(
    task: TaskDetail,
    input: CreateRunInput,
    runtimeConfig: Awaited<ReturnType<AiConfigService['resolveRuntimeConfig']>>,
  ): Promise<ProcessTemplateSelectionResult> {
    try {
      return await this.processTemplateSelector.select(task, input, runtimeConfig);
    } catch (error) {
      return {
        shouldUse: false,
        selectedTemplates: [],
        reason:
          error instanceof Error
            ? `process template selector 不可用：${error.message}`
            : 'process template selector 不可用。',
      };
    }
  }
}
