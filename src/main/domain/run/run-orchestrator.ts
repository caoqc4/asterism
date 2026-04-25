import type { CreateRunInput, RunRecord, RunStepRecord } from '../../../shared/types/run.js';
import type { TaskDetail } from '../../../shared/types/task.js';
import type { AgentRuntimeCapabilities } from '../../../shared/types/agent-execution.js';
import { AgentSessionRepository } from '../../db/repositories/agent-session-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { TextExecutor } from '../../executors/text-executor.js';
import { AiConfigService } from '../../keychain/ai-config-service.js';
import { AgentRunLoop } from './agent-run-loop.js';
import { LocalAgentExecutor, type AgentExecutor } from './agent-executor.js';
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
      status: 'paused';
      message: string;
      checkpointId: string;
      selection: ProcessTemplateSelectionResult;
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
    private readonly agentExecutor: AgentExecutor | null = agentToolRegistry
      ? new LocalAgentExecutor(new AgentRunLoop(agentToolRegistry, runStepRepository))
      : null,
    private readonly agentSessionRepository: AgentSessionRepository | null = agentToolRegistry
      ? new AgentSessionRepository()
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

    if (
      result.status !== 'completed' ||
      !this.agentExecutor ||
      !this.agentSessionRepository ||
      !result.output.trim()
    ) {
      return result;
    }

    const request = buildAgentRunRequest({
      run: params.run,
      task: params.task,
      input,
      policy: {
        ...LOCAL_AGENT_TOOL_POLICY,
        allowLocalWorkspaceRead: Boolean(input.allowLocalWorkspaceRead),
      },
    });

    if (request.policy.confirmationRequiredRisks.includes('local_write')) {
      return result;
    }

    const agentSession = await this.agentSessionRepository.create({
      runId: params.run.id,
      mode: 'agent',
      capabilities: getLocalAgentRuntimeCapabilities({
        allowLocalWorkspaceRead: Boolean(input.allowLocalWorkspaceRead),
      }),
      metadata: [
        'executor=local_agent',
        'loop=local_note',
      ].join('\n'),
    });

    let sessionResult: Awaited<ReturnType<AgentExecutor['executeLocalNoteSession']>>;

    try {
      sessionResult = await this.agentExecutor.executeLocalNoteSession({
        request,
        modelOutput: result.output,
        taskTitle: params.task.title,
      });
    } catch (error) {
      await this.agentSessionRepository.updateStatus(agentSession.id, 'failed');
      throw error;
    }

    await this.agentSessionRepository.updateStatus(agentSession.id, sessionResult.status);

    if (sessionResult.status === 'needs_confirmation') {
      return {
        status: 'needs_confirmation',
        message: sessionResult.message,
        checkpointId: sessionResult.checkpointId,
        selection: result.selection,
      };
    }

    if (sessionResult.status === 'failed') {
      return {
        status: 'failed',
        message: sessionResult.message,
        selection: result.selection,
      };
    }

    if (sessionResult.status === 'paused') {
      return {
        status: 'paused',
        message: sessionResult.message,
        checkpointId: sessionResult.checkpointId,
        selection: result.selection,
      };
    }

    return {
      ...result,
      output: sessionResult.output,
    };
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

function getLocalAgentRuntimeCapabilities(params: {
  allowLocalWorkspaceRead: boolean;
}): AgentRuntimeCapabilities {
  return {
    structuredToolCalls: false,
    textOnlyPlanning: true,
    streaming: false,
    fileContext: params.allowLocalWorkspaceRead,
    longRunningSessions: false,
  };
}
