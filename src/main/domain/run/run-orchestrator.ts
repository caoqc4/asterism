import type { CreateRunInput, RunRecord, RunStepRecord } from '../../../shared/types/run.js';
import type { TaskDetail } from '../../../shared/types/task.js';
import type {
  AgentRuntimeCapabilities,
  AgentSessionEvent,
  AgentSessionResult,
  ProviderToolCallNormalizationResult,
} from '../../../shared/types/agent-execution.js';
import { AgentSessionRepository } from '../../db/repositories/agent-session-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { TextExecutor } from '../../executors/text-executor.js';
import type { RuntimeTextResult } from '../../executors/text-generation.js';
import { AiConfigService } from '../../keychain/ai-config-service.js';
import { observeProviderNativeToolCalls } from '../../../shared/provider-tool-call-shadow.js';
import { normalizeProviderNativeToolCalls } from '../../../shared/provider-native-tool-call-adapter.js';
import {
  formatLocalAgentSessionMetadata,
  formatProviderNativeAgentSessionMetadata,
} from '../../../shared/agent-session-metadata.js';
import { AgentRunLoop } from './agent-run-loop.js';
import { LocalAgentExecutor, type AgentExecutor } from './agent-executor.js';
import type { AgentToolRegistry } from './agent-tool-registry.js';
import { evaluateProviderNativeSessionGate } from './provider-native-session-gate.js';
import { buildProviderNativeToolSchemas } from './provider-native-tool-schema.js';
import {
  ProcessTemplateSelector,
  type ProcessTemplateSelectionResult,
} from './process-template-selector.js';
import {
  buildAgentRunRequest,
  formatAgentRunRequestForStep,
  LOCAL_AGENT_TOOL_POLICY,
} from './agent-working-context.js';
import {
  mapAgentRuntimeEventToRunStep,
  type AgentRuntimeRunStepDraft,
} from './agent-runtime-event-step-mapper.js';

export type RunOrchestrationResult =
  | {
      status: 'completed';
      output: string;
      selection: ProcessTemplateSelectionResult;
      runtimeConfig?: Awaited<ReturnType<AiConfigService['resolveRuntimeConfig']>>;
      textResult?: RuntimeTextResult;
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

    await this.createRunStepFromAgentEvent({
      type: 'plan.proposed',
      runId: run.id,
      summary: '已读取任务上下文，并准备进入模型执行。',
      source: 'fallback',
    }, {
      title: '准备执行上下文',
      input: formatAgentRunRequestForStep(request),
    });

    let modelStep: RunStepRecord | null = null;
    let selection: ProcessTemplateSelectionResult | null = null;

    try {
      const runtimeConfig = await this.aiConfigService.resolveRuntimeConfig();
      selection = await this.selectProcessTemplates(task, input, runtimeConfig);

      modelStep = await this.createRunStepFromAgentEvent({
        type: 'model.completed',
        runId: run.id,
        output: '模型执行中。',
        provider: runtimeConfig.provider,
        model: runtimeConfig.model,
      }, {
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

      const providerNativeToolSchemas = this.buildProviderNativeToolSchemas({
        input,
        runtimeConfig,
      });
      const textResult = await this.executeRuntimeText(task, input, runtimeConfig, {
        selectedTemplates: selection.shouldUse ? selection.selectedTemplates : [],
        ...(providerNativeToolSchemas.length
          ? { providerNativeToolSchemas }
          : {}),
      });
      const output = textResult.text;

      await this.runStepRepository.update(modelStep.id, {
        status: 'completed',
        output: output || '模型执行完成，但没有产生正文输出。',
      });
      await this.recordProviderNativeShadowStep({
        model: runtimeConfig.model,
        provider: runtimeConfig.provider,
        runId: run.id,
        textResult,
        enabled: Boolean(runtimeConfig.featureFlags?.enableProviderNativeToolCalls),
      });
      await this.createRunStepFromAgentEvent({
        type: 'session.completed',
        runId: run.id,
        output: output?.trim()
          ? 'Run 执行已完成，输出可由服务层保存为任务产物并写入任务时间线。'
          : 'Run 执行已完成，但没有可保存的输出产物。',
      }, {
        title: '完成 Run 执行',
      });

      return {
        status: 'completed',
        output,
        selection,
        runtimeConfig,
        textResult,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown executor error';

      if (modelStep) {
        await this.runStepRepository.update(modelStep.id, {
          status: 'failed',
          error: message,
        });
      }

      await this.createRunStepFromAgentEvent({
        type: 'session.failed',
        runId: run.id,
        failureKind: 'model',
        message,
      }, {
        title: 'Run 执行失败',
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
      (!result.output.trim() && !result.textResult?.providerPayload)
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
        allowTaskMutationTools: Boolean(input.allowTaskMutationTools),
      },
    });

    if (request.policy.confirmationRequiredRisks.includes('local_write')) {
      return result;
    }

    const providerNativeResult = await this.tryExecuteProviderNativeAgentSession({
      input,
      request,
      result,
      runtimeConfig: result.runtimeConfig,
      run: params.run,
      selection: result.selection,
      taskTitle: params.task.title,
    });

    if (providerNativeResult) {
      return providerNativeResult;
    }

    if (!result.output.trim()) {
      return result;
    }

    const agentSession = await this.agentSessionRepository.create({
      runId: params.run.id,
      mode: 'agent',
      capabilities: getLocalAgentRuntimeCapabilities({
        allowLocalWorkspaceRead: Boolean(input.allowLocalWorkspaceRead),
        allowTaskMutationTools: Boolean(input.allowTaskMutationTools),
      }),
      metadata: formatLocalAgentSessionMetadata(),
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
    await this.recordAgentSessionResultEvent(params.run.id, sessionResult);

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

  private async tryExecuteProviderNativeAgentSession(params: {
    input: CreateRunInput;
    request: ReturnType<typeof buildAgentRunRequest>;
    result: Extract<RunOrchestrationResult, { status: 'completed' }>;
    runtimeConfig?: Awaited<ReturnType<AiConfigService['resolveRuntimeConfig']>>;
    run: RunRecord;
    selection: ProcessTemplateSelectionResult;
    taskTitle: string;
  }): Promise<RunOrchestrationResult | null> {
    if (!this.agentExecutor || !this.agentSessionRepository || !params.runtimeConfig) {
      return null;
    }

    const textResult = params.result.textResult;
    const providerPayload = textResult?.providerPayload;
    const normalization: ProviderToolCallNormalizationResult | null = providerPayload
      ? normalizeProviderNativeToolCalls({
          provider: params.runtimeConfig.provider,
          model: params.runtimeConfig.model,
          payload: providerPayload.payload,
        })
      : null;

    const gate = evaluateProviderNativeSessionGate({
      input: params.input,
      provider: params.runtimeConfig.provider,
      featureFlags: {
        ...params.runtimeConfig.featureFlags,
        enableScheduler: params.runtimeConfig.featureFlags?.enableScheduler ?? false,
        enableProviderNativeToolCalls:
          params.runtimeConfig.featureFlags?.enableProviderNativeToolCalls ?? false,
      },
      textResult: textResult ?? {
        text: params.result.output,
        providerPayload: null,
      },
      normalization,
    });

    if (!gate.allowed || normalization?.status !== 'normalized') {
      return null;
    }

    const executor = this.agentExecutor as AgentExecutor & {
      executeProviderNativeSession?: AgentExecutor['executeProviderNativeSession'];
    };

    if (typeof executor.executeProviderNativeSession !== 'function') {
      return null;
    }

    const agentSession = await this.agentSessionRepository.create({
      runId: params.run.id,
      mode: 'agent',
      capabilities: getProviderNativeAgentRuntimeCapabilities({
        allowLocalWorkspaceRead: Boolean(params.input.allowLocalWorkspaceRead),
        allowTaskMutationTools: Boolean(params.input.allowTaskMutationTools),
      }),
      metadata: formatProviderNativeAgentSessionMetadata(normalization.plan),
    });

    let sessionResult: Awaited<ReturnType<AgentExecutor['executeProviderNativeSession']>>;

    try {
      sessionResult = await executor.executeProviderNativeSession({
        request: params.request,
        modelOutput: params.result.output,
        providerPlan: normalization.plan,
        taskTitle: params.taskTitle,
      });
    } catch (error) {
      await this.agentSessionRepository.updateStatus(agentSession.id, 'failed');
      throw error;
    }

    await this.agentSessionRepository.updateStatus(agentSession.id, sessionResult.status);
    await this.recordAgentSessionResultEvent(params.run.id, sessionResult);

    if (sessionResult.status === 'needs_confirmation') {
      return {
        status: 'needs_confirmation',
        message: sessionResult.message,
        checkpointId: sessionResult.checkpointId,
        selection: params.selection,
      };
    }

    if (sessionResult.status === 'failed') {
      return {
        status: 'failed',
        message: sessionResult.message,
        selection: params.selection,
      };
    }

    if (sessionResult.status === 'paused') {
      return {
        status: 'paused',
        message: sessionResult.message,
        checkpointId: sessionResult.checkpointId,
        selection: params.selection,
      };
    }

    return {
      ...params.result,
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

  private async executeRuntimeText(
    task: TaskDetail,
    input: CreateRunInput,
    runtimeConfig: Awaited<ReturnType<AiConfigService['resolveRuntimeConfig']>>,
    options: Parameters<TextExecutor['execute']>[3],
  ): Promise<RuntimeTextResult> {
    const executor = this.textExecutor as TextExecutor & {
      executeWithResult?: TextExecutor['executeWithResult'];
    };

    if (typeof executor.executeWithResult === 'function') {
      return executor.executeWithResult(task, input, runtimeConfig, options);
    }

    return {
      text: await this.textExecutor.execute(task, input, runtimeConfig, options),
      providerPayload: null,
    };
  }

  private buildProviderNativeToolSchemas(params: {
    input: CreateRunInput;
    runtimeConfig: Awaited<ReturnType<AiConfigService['resolveRuntimeConfig']>>;
  }) {
    if (
      params.input.type !== 'agent' ||
      !params.runtimeConfig.featureFlags?.enableProviderNativeToolCalls ||
      !this.agentToolRegistry ||
      typeof this.agentToolRegistry.list !== 'function'
    ) {
      return [];
    }

    return buildProviderNativeToolSchemas({
      definitions: this.agentToolRegistry.list(),
      policy: {
        ...LOCAL_AGENT_TOOL_POLICY,
        allowLocalWorkspaceRead: Boolean(params.input.allowLocalWorkspaceRead),
        allowTaskMutationTools: Boolean(params.input.allowTaskMutationTools),
      },
    });
  }

  private async recordProviderNativeShadowStep(params: {
    enabled: boolean;
    model: string;
    provider: Awaited<ReturnType<AiConfigService['resolveRuntimeConfig']>>['provider'];
    runId: string;
    textResult: RuntimeTextResult;
  }): Promise<void> {
    const providerPayload = params.textResult.providerPayload;

    if (!params.enabled || !providerPayload) {
      return;
    }

    const shadow = observeProviderNativeToolCalls({
      enabled: true,
      provider: params.provider,
      model: params.model,
      payload: providerPayload.payload,
    });

    await this.runStepRepository.create({
      runId: params.runId,
      kind: 'model',
      status: shadow.status === 'observed' ? 'completed' : 'skipped',
      title: 'Provider 原生工具调用影子观察',
      input: [
        `provider=${params.provider}`,
        `model=${params.model}`,
        `payload=${providerPayload.rawSummary}`,
      ].join('\n'),
      output: shadow.status === 'observed'
        ? [
            '影子观察已识别 provider 原生工具调用，但未执行任何工具。',
            `providerCallCount=${shadow.providerCallCount}`,
            `stopReason=${shadow.stopReason ?? 'unknown'}`,
            `rawSummary=${shadow.rawSummary}`,
          ].join('\n')
        : shadow.status === 'failed'
          ? `影子观察解析失败，Run 执行结果不受影响：${shadow.error}`
          : `影子观察已跳过，Run 执行结果不受影响：${shadow.reason}`,
    });
  }

  private async createRunStepFromAgentEvent(
    event: AgentSessionEvent,
    overrides: Partial<Omit<AgentRuntimeRunStepDraft, 'runId'>> = {},
  ): Promise<RunStepRecord> {
    const draft = mapAgentRuntimeEventToRunStep(event);

    return this.runStepRepository.create({
      ...draft,
      ...overrides,
      runId: draft.runId,
    });
  }

  private async recordAgentSessionResultEvent(
    runId: string,
    sessionResult: AgentSessionResult,
  ): Promise<void> {
    if (sessionResult.status === 'completed') {
      await this.createRunStepFromAgentEvent({
        type: 'session.completed',
        runId,
        output: sessionResult.output || 'Agent session 已完成。',
      }, {
        title: '完成 Agent session',
      });
      return;
    }

    if (sessionResult.status === 'failed') {
      await this.createRunStepFromAgentEvent({
        type: 'session.failed',
        runId,
        failureKind: sessionResult.failureKind,
        message: sessionResult.message,
      }, {
        title: 'Agent session 执行失败',
      });
      return;
    }

    await this.createRunStepFromAgentEvent({
      type: 'session.paused',
      runId,
      checkpointId: sessionResult.checkpointId,
      message: sessionResult.message,
    }, {
      title: sessionResult.status === 'needs_confirmation'
        ? 'Agent session 等待确认'
        : 'Agent session 已暂停',
    });
  }
}

function getLocalAgentRuntimeCapabilities(params: {
  allowLocalWorkspaceRead: boolean;
  allowTaskMutationTools: boolean;
}): AgentRuntimeCapabilities {
  return {
    structuredToolCalls: false,
    textOnlyPlanning: true,
    streaming: false,
    fileContext: params.allowLocalWorkspaceRead,
    taskMutationTools: params.allowTaskMutationTools,
    longRunningSessions: false,
  };
}

function getProviderNativeAgentRuntimeCapabilities(params: {
  allowLocalWorkspaceRead: boolean;
  allowTaskMutationTools: boolean;
}): AgentRuntimeCapabilities {
  return {
    structuredToolCalls: true,
    textOnlyPlanning: false,
    streaming: false,
    fileContext: params.allowLocalWorkspaceRead,
    taskMutationTools: params.allowTaskMutationTools,
    longRunningSessions: false,
  };
}
