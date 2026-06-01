import { spawn } from 'node:child_process';
import fs from 'node:fs';

import { evaluateRuntimeAction } from '../../../shared/runtime-action-evaluator.js';
import { evaluateRuntimeContextAssemblyGate } from '../../../shared/runtime-context-assembly-gate.js';
import {
  evaluateRuntimeContextReadiness,
  formatRuntimeContextReadinessForStep,
} from '../../../shared/runtime-context-readiness.js';
import {
  buildRuntimeResearchIntentText,
  evaluateRuntimeResearchIntent,
} from '../../../shared/runtime-research-intent.js';
import { formatPilotDecisionBackendPlanForStep } from '../../../shared/pilot-decision-contract.js';
import {
  buildRuntimeContextAssemblyPolicy,
  buildRuntimeContextManifest,
  formatRuntimeContextManifestForStep,
  type RuntimeContextManifest,
} from '../../../shared/runtime-context.js';
import {
  buildNativeCliAdapterContract,
  formatNativeCliAdapterContractForStep,
} from '../../../shared/native-cli-adapter-contract.js';
import {
  buildRunGoalContract,
  formatRunGoalContractForPrompt,
  formatRunGoalContractForStep,
  type AgentRuntimeAdapterCapabilities,
  type RunGoalContract,
} from '../../../shared/agent-runtime-goal.js';
import {
  buildNativeGoalAuditReadinessEvidence,
  evaluateNativeGoalForwardingReadiness,
} from '../../../shared/native-goal-forwarding-readiness.js';
import {
  formatAgentRuntimeVerifierResult,
  type AgentRuntimeVerifierResult,
  verifyRunGoalContractEvidence,
} from '../../../shared/agent-runtime-verifier.js';
import { buildRuntimeCapabilitySnapshot } from '../../../shared/runtime-capability-snapshot.js';
import { evaluateRuntimeVerification } from '../../../shared/runtime-verification.js';
import {
  buildProductHarnessMemoryProposalInvocation,
  buildProductHarnessVerificationAssistInvocation,
} from '../../../shared/ai-runtime-invocation.js';
import { buildTaskMemoryCoverageInputForTask, evaluateTaskMemoryCoverage } from '../../../shared/task-memory-coverage.js';
import {
  buildTaskMemoryGuidanceStateForTaskFiles,
  type TaskMemoryGuidanceState,
} from '../../../shared/task-memory-guidance-state.js';
import { isTaskMdPath } from '../../../shared/task-memory-path.js';
import { classifyRunScope, runScopeRequiresBusinessLine } from '../../../shared/run-scope.js';
import {
  agentCliRuntimeCapabilities,
  type AgentCliRuntimeId,
} from '../../../shared/agent-cli-runtime-status.js';
import {
  appendBusinessLineContextPackToPrompt,
  formatBusinessLineContextPackForPrompt,
} from '../../../shared/business-line-context-pack.js';
import type {
  CancelAgentCliRunInput,
  CancelAgentCliRunResult,
  AgentCliRunSandboxMode,
  CreateAgentCliRunInput,
  RecordRuntimeNativeGoalRequestInput,
  RunOutputSource,
  RunRecord,
  RunScope,
  RunStepKind,
  RunStatus,
} from '../../../shared/types/run.js';
import type { PilotDecisionSnapshot } from '../../../shared/pilot-decision-contract.js';
import type { BusinessLineWorkspace } from '../../../shared/types/business-line.js';
import type { TaskDetail } from '../../../shared/types/task.js';
import type { RunRepository } from '../../db/repositories/run-repository.js';
import type { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import type { RunVerificationRepository } from '../../db/repositories/run-verification-repository.js';
import type { AiConfigService } from '../../keychain/ai-config-service.js';
import type { AgentCliCapabilityMode } from '../../../shared/types/settings.js';
import type { CreateSourceContextInput } from '../../../shared/types/source-context.js';
import type { TaskService } from '../task/task-service.js';
import { persistTerminalRunVerifications } from '../run/run-verification-service.js';
import {
  agentCliRuntimeWorkloadTracker,
  type AgentCliRuntimeWorkloadTracker,
} from './agent-cli-runtime-workload.js';

export type AgentCliExecutionResult = {
  exitCode: number | null;
  failureReason: string | null;
  status: 'completed' | 'failed';
  stderr: string;
  stdout: string;
  summary: string;
};

export type AgentCliExecutor = (params: {
  args: string[];
  command: string;
  cwd: string;
  input: string;
  onStdoutLine?: (line: string) => void | Promise<void>;
  outputLimitBytes: number;
  signal?: AbortSignal;
  timeoutMs: number;
}) => Promise<AgentCliExecutionResult>;

export type AgentCliRunTerminalListener = (run: RunRecord) => void | Promise<void>;

type AgentCliTaskService = Pick<TaskService, 'annotateRunCompleted' | 'annotateRunFailed' | 'getDetail'> & {
  createSourceContext?: (input: CreateSourceContextInput) => Promise<unknown>;
};

type AgentCliAiConfigService = Pick<AiConfigService, 'getStatus'> & {
  resolveOpenAiWebResearchConfig?: () => Promise<{
    apiKey: string;
    baseUrl?: string | null;
    model: string;
    provider: string;
  }>;
};

type BusinessLineContextProvider = {
  getWorkspace(businessLineId: string): Promise<BusinessLineWorkspace | null>;
};

type AgentCliRunAdapter = {
  acceptedLabel: string;
  buildExecution(params: {
    capabilityMode: AgentCliCapabilityMode;
    contextSummary: string;
    prompt: string;
    sandboxMode: AgentCliRunSandboxMode;
    task: TaskDetail;
    workspaceRoot: string;
  }): {
    args: string[];
    commandPreview: string;
    input: string;
  };
  completedStepTitle: string;
  failedStepTitle: string;
  runtimeLabel: string;
};

type AgentCliParsedEvent = {
  kind: RunStepKind;
  input: string | null;
  output: string;
  status: 'completed' | 'failed' | 'skipped';
  title: string;
};

type AgentCliParsedTranscript = {
  events: AgentCliParsedEvent[];
  finalText: string | null;
  rawJsonLineCount: number;
};

type AgentCliNativeTranscriptProjector = {
  acceptLine(line: string): void;
  drain(): Promise<void>;
  snapshot(): AgentCliParsedTranscript;
};

type AgentCliNativeCapability =
  | 'generic_tool'
  | 'hook'
  | 'mcp_tool'
  | 'shell_command'
  | 'web_search'
  | 'workspace_read'
  | 'workspace_write';

const DEFAULT_AGENT_CLI_TIMEOUT_MS = 120_000;
const DEFAULT_AGENT_CLI_OUTPUT_LIMIT_BYTES = 64_000;
const AGENT_CLI_TERMINATION_GRACE_MS = 1_500;

type NormalizedAgentCliRunInput = Required<Omit<CreateAgentCliRunInput, 'pilotDecision'>> & {
  pilotDecision: PilotDecisionSnapshot | null;
};

export class AgentCliRunService {
  constructor(
    private readonly taskService: AgentCliTaskService,
    private readonly aiConfigService: AgentCliAiConfigService,
    private readonly runRepository: Pick<RunRepository, 'create' | 'updateResult'>,
    private readonly runStepRepository: Pick<RunStepRepository, 'create' | 'listForRun' | 'listForTask'>,
    private readonly executor: AgentCliExecutor = executeAgentCliCommand,
    private readonly runVerificationRepository: Pick<RunVerificationRepository, 'upsert'> | null = null,
    private readonly workloadTracker: AgentCliRuntimeWorkloadTracker = agentCliRuntimeWorkloadTracker,
    private readonly onTerminalRun: AgentCliRunTerminalListener | null = null,
    private readonly businessLineContextProvider: BusinessLineContextProvider | null = null,
  ) {}

  async recordNativeGoalRequest(input: RecordRuntimeNativeGoalRequestInput): Promise<RunRecord> {
    const request = normalizeRuntimeNativeGoalRequestInput(input);
    let task = await this.taskService.getDetail(request.taskId);
    if (!task) {
      throw new Error(`Task not found: ${request.taskId}`);
    }
    if (!request.operatorConfirmed) {
      throw new Error('Runtime-native goal audit requires explicit operator confirmation.');
    }

    const run = await this.runRepository.create({
      instructions: `Runtime native goal request (${request.runtimeLabel}): ${request.objective}`,
      taskId: task.id,
      type: 'agent',
    });
    const readinessEvidence = buildNativeGoalAuditReadinessEvidence({
      adapterId: request.runtimeId,
      supportsNativeGoalMode: request.supportsNativeGoalMode,
    });
    const readiness = evaluateNativeGoalForwardingReadiness(readinessEvidence);
    const payload = {
      forwarded: request.forwarded,
      nativeGoalForwardingReadiness: {
        missingEvidence: readiness.missingEvidence,
        notes: readinessEvidence.notes ?? [],
        status: readiness.status,
        summary: readiness.summary,
      },
      objective: request.objective,
      reason: request.reason,
      runtimeId: request.runtimeId,
      runtimeLabel: request.runtimeLabel,
      supportsNativeGoalMode: request.supportsNativeGoalMode,
      taskId: task.id,
    };
    await this.runStepRepository.create({
      runId: run.id,
      kind: 'plan',
      status: 'skipped',
      title: 'Runtime Native Goal 请求审计',
      input: JSON.stringify(payload, null, 2),
      output: [
        `Runtime: ${request.runtimeLabel}`,
        `Objective: ${request.objective}`,
        'Forwarded: no',
        `Reason: ${request.reason}`,
        `Readiness: ${readiness.summary}`,
        `Missing evidence: ${readiness.missingEvidence.join(', ') || 'none'}`,
        'Taskplane kept this as audit evidence; no CLI command was executed.',
      ].join('\n'),
    });
    const updated = await this.updateRunResult(
      run.id,
      'completed',
      `Runtime-native goal request recorded without forwarding. Runtime: ${request.runtimeLabel}. Objective: ${request.objective}. Reason: ${request.reason}. Readiness: ${readiness.summary}`,
      'system',
    );
    await this.notifyTerminalRun(updated);
    return updated;
  }

  async trigger(input: CreateAgentCliRunInput): Promise<RunRecord> {
    const request = normalizeAgentCliRunInput(input);
    if (!request.taskId) {
      throw new Error('Agent CLI run requires a task id.');
    }
    if (!request.prompt) {
      throw new Error('Agent CLI run requires a prompt.');
    }
    let task = await this.taskService.getDetail(request.taskId);
    if (!task) {
      throw new Error(`Task not found: ${request.taskId}`);
    }
    if (!request.operatorConfirmed) {
      throw new Error('Agent CLI run requires explicit operator confirmation.');
    }

    const runtimeId = request.runtimeId ?? 'codex';
    const adapter = getAgentCliRunAdapter(runtimeId);
    if (!adapter) {
      throw new Error(`${runtimeId} CLI execution is not enabled in this version.`);
    }

    const aiStatus = await this.aiConfigService.getStatus();
    const runtime = aiStatus.agentCliRuntimeStatus?.runtimes.find((item) => item.id === runtimeId) ?? null;
    if (!runtime?.installed || runtime.executionSupport !== 'manual_run') {
      throw new Error(`${adapter.acceptedLabel} is not detected on PATH or is not enabled for manual runs.`);
    }
    if (runtime.authState !== 'ready') {
      throw new Error(runtime.missingReason ?? `${adapter.acceptedLabel} is not authenticated; use the official CLI login flow before execution.`);
    }
    const runtimeCapabilities = agentCliRuntimeCapabilities(runtime);
    const businessLineId = request.businessLineId ?? task.businessLineId ?? null;
    const runScope = classifyRunScope({
      businessLineId,
      taskBusinessLineId: task.businessLineId,
      taskFacets: task.taskFacets,
      taskId: task.id,
      taskType: task.taskType,
    });
    if (runScopeRequiresBusinessLine(runScope.kind) && !runScope.businessLineId) {
      throw new Error(`Business line scope requires an owner: ${runScope.kind}`);
    }
    const businessLineWorkspace = businessLineId && this.businessLineContextProvider
      ? await this.businessLineContextProvider.getWorkspace(businessLineId)
      : null;
    if (businessLineId && this.businessLineContextProvider && !businessLineWorkspace) {
      throw new Error(`Business line not found: ${businessLineId}`);
    }
    const runtimePrompt = appendBusinessLineContextPackToPrompt(request.prompt, businessLineWorkspace) ?? request.prompt;

    const startVerification = evaluateRuntimeVerification({
      mode: 'subtask_start',
      targetTask: task,
      contextSignals: {
        activeTaskId: task.id,
        targetTaskId: task.id,
      },
      availableContext: {
        taskState: true,
        decisions: true,
      },
    });
    if (!startVerification.canProceed) {
      throw new Error(startVerification.detail);
    }

    const taskMemoryGuidance = await this.buildTaskMemoryGuidanceForTask(task);
    const actionEvaluation = evaluateRuntimeAction({
      action: 'run_start',
      fromTaskId: task.id,
      targetTaskId: task.id,
    });
    const preStepVerification = evaluateRuntimeVerification({
      mode: 'pre_step',
      action: actionEvaluation,
      taskMemoryCoverage: evaluateTaskMemoryCoverage(buildTaskMemoryCoverageInputForTask('run_start', task, {
        hasNextStep: Boolean(task.nextStep?.trim() || task.resumeCard?.nextSuggestedMove?.trim() || runtimePrompt.trim()),
      })),
      taskMemoryGuidance,
    });
    const pendingMemoryWarning = taskMemoryGuidance.outcome === 'pending'
      ? taskMemoryGuidance.reason
      : null;
    if (!preStepVerification.canProceed) {
      if (pendingMemoryWarning && preStepVerification.label === '执行前任务记忆待处理') {
        // Pending Agent CLI memory proposals are surfaced to the user, but should not
        // make iterative planning feel broken. The next run still remains read-only.
      } else {
        throw new Error(preStepVerification.detail);
      }
    }

    const capabilityMode = normalizeAgentCliCapabilityMode(aiStatus.featureFlags.agentCliCapabilityMode);
    const webResearchPreparation = await this.prepareWebResearchSourceContext({
      capabilityMode,
      prompt: request.prompt,
      runtimeCapabilities,
      task,
    });
    task = webResearchPreparation.task;
    const taskFilesForContext = buildAgentCliTaskFilesForContext(task);
    const contextManifest = buildRuntimeContextManifest({
      activeSurface: runtimeContextSurfaceForRunScope(runScope.kind),
      businessLineContextPack: businessLineWorkspace,
      capabilities: buildRuntimeCapabilitySnapshot({ aiStatus }),
      capabilityRegistry: aiStatus.capabilityRegistry ?? [],
      currentRunId: null,
      sourceContexts: task.sourceContexts.map((source) => ({
        ...source,
        contentPreview: source.content?.slice(0, 800) ?? null,
        selected: source.isKey,
      })),
      task,
      taskFiles: taskFilesForContext,
    });
    const contextAssembly = buildRuntimeContextAssemblyPolicy({ manifest: contextManifest });
    const contextGate = evaluateRuntimeContextAssemblyGate({
      contextAssembly,
      executionLabel: 'Agent CLI run',
      modelExposure: 'visible',
      providerCallAllowed: true,
      providerVisibleTaskContext: true,
    });
    if (!contextGate.canProceed) {
      throw new Error(contextGate.summary);
    }
    const contextReadiness = evaluateRuntimeContextReadiness({
      contextAssembly,
      prompt: runtimePrompt,
      task,
    });

    const sandboxMode = request.sandboxMode ?? 'read-only';
    const workspaceRoot = aiStatus.workspaceRoot?.trim() || aiStatus.suggestedWorkspaceRoot?.trim();
    if (!workspaceRoot) {
      throw new Error('Agent CLI run requires an available runtime workspace.');
    }
    if (!fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
      throw new Error(`Agent CLI workspace root is not a readable directory: ${workspaceRoot}`);
    }
    const run = await this.runRepository.create({
      ...(businessLineId ? { businessLineId } : {}),
      taskId: task.id,
      type: 'agent',
      instructions: `Agent CLI (${runtime.label}) ${sandboxMode}: ${runtimePrompt}`,
    });
    const runContract = buildRunGoalContract({
      contextGateSummary: contextGate.summary,
      contextManifest,
      executionKind: 'cli',
      prompt: runtimePrompt,
      runId: run.id,
      runtimeCapabilities,
      runtimeId,
      runtimeLabel: adapter.runtimeLabel,
      sandboxMode,
      task,
    });
    const contextBridge = buildAgentCliContextBridge({
      capabilityMode,
      contract: runContract,
      businessLineWorkspace,
      manifest: contextManifest,
      readinessSummary: formatRuntimeContextReadinessForStep(contextReadiness),
      task,
      taskFilesForContext,
    });
    const execution = adapter.buildExecution({
      capabilityMode,
      contextSummary: contextBridge,
      prompt: runtimePrompt,
      sandboxMode,
      task,
      workspaceRoot,
    });
    const adapterContract = buildNativeCliAdapterContract({
      capabilityMode,
      commandPreview: execution.commandPreview,
      contextManifest,
      runId: run.id,
      runScope,
      runtimeCapabilities,
      runtimeId,
      runtimeLabel: adapter.runtimeLabel,
      sandboxMode,
      taskId: task.id,
      taskTitle: task.title,
      workspaceRoot,
    });

    await this.runStepRepository.create({
      runId: run.id,
      kind: 'plan',
      status: 'completed',
      title: 'agent cli run accepted',
      input: runtimePrompt,
      output: [
        `runtime=${runtime.id}`,
        `sandbox=${sandboxMode}`,
        pendingMemoryWarning ? `pending_memory_warning=${pendingMemoryWarning}` : null,
        `capability_mode=${capabilityMode}`,
        contextGate.summary,
        formatRuntimeContextReadinessForStep(contextReadiness),
        formatRuntimeContextManifestForStep(contextManifest),
      ].filter((line): line is string => line !== null).join('\n'),
    });
    if (request.pilotDecision) {
      await this.runStepRepository.create({
        runId: run.id,
        kind: 'decision',
        status: request.pilotDecision.backendPlan.status === 'not_needed' ? 'skipped' : 'completed',
        title: 'Pilot 决策辅助计划',
        input: JSON.stringify(request.pilotDecision, null, 2),
        output: formatAgentCliPilotDecisionForStep(request.pilotDecision),
      });
    }
    await this.runStepRepository.create({
      runId: run.id,
      kind: 'plan',
      status: contextReadiness.decision === 'blocked' ? 'failed' : 'completed',
      title: 'Agent CLI 上下文就绪判断',
      input: runtimePrompt,
      output: formatRuntimeContextReadinessForStep(contextReadiness),
    });
    await this.runStepRepository.create({
      runId: run.id,
      kind: 'tool_call',
      status: webResearchPreparation.preparation.status === 'skipped' ? 'skipped' : 'completed',
      title: 'Agent CLI 联网调研准备',
      input: webResearchPreparation.preparation.query ?? request.prompt,
      output: formatAgentCliWebResearchPreparation(webResearchPreparation.preparation),
    });
    await this.runStepRepository.create({
      runId: run.id,
      kind: 'plan',
      status: 'completed',
      title: 'Agent CLI 目标契约',
      input: JSON.stringify(runContract, null, 2),
      output: formatRunGoalContractForStep(runContract),
    });
    await this.runStepRepository.create({
      runId: run.id,
      kind: 'plan',
      status: 'completed',
      title: 'Native CLI adapter contract',
      input: JSON.stringify(adapterContract, null, 2),
      output: formatNativeCliAdapterContractForStep(adapterContract),
    });
    const abortController = new AbortController();
    const workloadLease = this.workloadTracker.start(runtimeId, run.id, (reason) => {
      abortController.abort(reason);
    });
    void this.completeRunInBackground({
      abortController,
      commandPreview: execution.commandPreview,
      input: execution.input,
      runAdapter: adapter,
      runArgs: execution.args,
      runContract,
      run,
      runtimeCommand: runtime.executablePath ?? runtime.command,
      sandboxMode,
      task,
      workloadLease,
      workspaceRoot,
    });

    return attachAgentCliRunScope(run, runScope);
  }

  async cancel(input: CancelAgentCliRunInput): Promise<CancelAgentCliRunResult> {
    const request = normalizeCancelAgentCliRunInput(input);
    const cancelled = this.workloadTracker.cancelRun(request.runId, request.reason);
    return {
      cancelled,
      reason: request.reason,
      runId: request.runId,
      summary: cancelled
        ? `Agent CLI cancellation requested for ${request.runId}.`
        : `No active Agent CLI run found for ${request.runId}.`,
    };
  }

  private async updateRunResult(
    runId: string,
    status: RunStatus,
    output: string | null,
    outputSource: RunOutputSource,
    failureReason: string | null = null,
  ): Promise<RunRecord> {
    const updated = failureReason === null
      ? await this.runRepository.updateResult(runId, status, output, outputSource)
      : await this.runRepository.updateResult(runId, status, output, outputSource, failureReason);
    if (status === 'completed' || status === 'failed') {
      const steps = await this.runStepRepository.listForRun(updated.id);
      const taskDetail = await this.taskService.getDetail(updated.taskId).catch(() => null);
      await persistTerminalRunVerifications({
        run: updated,
        runStepRepository: this.runStepRepository,
        runVerificationRepository: this.runVerificationRepository,
        steps,
        taskMemoryGuidance: buildTaskMemoryGuidanceStateForTaskFiles({
          guidanceSignals: steps,
          taskFiles: taskDetail?.taskFiles,
        }),
      });
    }
    return updated;
  }

  private async buildTaskMemoryGuidanceForTask(task: TaskDetail): Promise<TaskMemoryGuidanceState> {
    const steps = await this.runStepRepository.listForTask(task.id).catch(() => []);
    return buildTaskMemoryGuidanceStateForTaskFiles({
      guidanceSignals: steps,
      taskFiles: task.taskFiles,
    });
  }

  private async prepareWebResearchSourceContext(params: {
    capabilityMode: AgentCliCapabilityMode;
    prompt: string;
    runtimeCapabilities: AgentRuntimeAdapterCapabilities;
    task: TaskDetail;
  }): Promise<{ preparation: AgentCliWebResearchPreparation; task: TaskDetail }> {
    if (params.capabilityMode === 'restricted') {
      return {
        preparation: {
          capabilityMode: params.capabilityMode,
          query: null,
          reason: 'Restricted mode disables live web/search preparation.',
          sourceCount: 0,
          status: 'skipped',
        },
        task: params.task,
      };
    }
    if (!shouldPrepareWebResearch(params.task, params.prompt)) {
      return {
        preparation: {
          capabilityMode: params.capabilityMode,
          query: null,
          reason: 'The selected task and user request do not appear to require fresh external research.',
          sourceCount: 0,
          status: 'not_needed',
        },
        task: params.task,
      };
    }
    if (!this.taskService.createSourceContext || !this.aiConfigService.resolveOpenAiWebResearchConfig) {
      return {
        preparation: {
          capabilityMode: params.capabilityMode,
          query: null,
          reason: `Taskplane has no configured source-context writer or OpenAI web research bridge. ${nativeWebSearchFallbackReason(params.runtimeCapabilities)}`,
          sourceCount: 0,
          status: 'skipped',
        },
        task: params.task,
      };
    }

    const query = buildWebResearchQuery(params.task, params.prompt);
    let config: Awaited<ReturnType<NonNullable<AgentCliAiConfigService['resolveOpenAiWebResearchConfig']>>>;
    try {
      config = await this.aiConfigService.resolveOpenAiWebResearchConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        preparation: {
          capabilityMode: params.capabilityMode,
          query,
          reason: `Taskplane web research bridge is unavailable: ${message}. ${nativeWebSearchFallbackReason(params.runtimeCapabilities)}`,
          sourceCount: 0,
          status: 'skipped',
        },
        task: params.task,
      };
    }

    const research = await runOpenAiWebResearch({
      apiKey: config.apiKey,
      model: config.model,
      query,
    }).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    if (research && 'error' in research) {
      return {
        preparation: {
          capabilityMode: params.capabilityMode,
          query,
          reason: `Taskplane web research request failed: ${research.error}. ${nativeWebSearchFallbackReason(params.runtimeCapabilities)}`,
          sourceCount: 0,
          status: 'skipped',
        },
        task: params.task,
      };
    }
    if (!research?.sources.length && !research?.summary.trim()) {
      return {
        preparation: {
          capabilityMode: params.capabilityMode,
          query,
          reason: `Taskplane web research returned no usable summary or sources. ${nativeWebSearchFallbackReason(params.runtimeCapabilities)}`,
          sourceCount: 0,
          status: 'skipped',
        },
        task: params.task,
      };
    }

    const capturedAt = new Date().toISOString();
    const batchId = `web-research:${params.task.id}:${capturedAt}`;
    const createdInputs = buildWebResearchSourceInputs({
      batchId,
      capturedAt,
      query,
      research,
      taskId: params.task.id,
    });
    let persistedSourceCount = 0;
    const persistedSourceIds: string[] = [];
    for (const input of createdInputs) {
      const source = await Promise.resolve(this.taskService.createSourceContext(input)).catch(() => null);
      if (source) {
        persistedSourceCount += 1;
        const sourceId = readCreatedSourceContextId(source);
        if (sourceId) persistedSourceIds.push(sourceId);
      }
    }

    if (persistedSourceCount === 0) {
      return {
        preparation: {
          attemptedSourceCount: createdInputs.length,
          batchId,
          capabilityMode: params.capabilityMode,
          failedSourceCount: createdInputs.length,
          query,
          reason: `Taskplane web research produced ${createdInputs.length} source context item(s), but none could be saved. ${nativeWebSearchFallbackReason(params.runtimeCapabilities)}`,
          sourceCount: 0,
          status: 'skipped',
        },
        task: params.task,
      };
    }

    const failedSourceCount = createdInputs.length - persistedSourceCount;

    return {
      preparation: {
        attemptedSourceCount: createdInputs.length,
        batchId,
        capabilityMode: params.capabilityMode,
        failedSourceCount,
        persistedSourceIds,
        query,
        reason: failedSourceCount > 0
          ? `Taskplane captured ${persistedSourceCount}/${createdInputs.length} web research source context item(s) before handing the task to the selected Agent CLI.`
          : 'Taskplane captured web research into Source Context before handing the task to the selected Agent CLI.',
        sourceCount: persistedSourceCount,
        status: 'captured',
      },
      task: await this.taskService.getDetail(params.task.id).catch(() => params.task) ?? params.task,
    };
  }

  private async completeRunInBackground(params: {
    abortController: AbortController;
    commandPreview: string;
    input: string;
    runAdapter: AgentCliRunAdapter;
    runArgs: string[];
    runContract: RunGoalContract;
    run: RunRecord;
    runtimeCommand: string;
    sandboxMode: AgentCliRunSandboxMode;
    task: TaskDetail;
    workloadLease: { finish(): void };
    workspaceRoot: string;
  }): Promise<void> {
    const liveTranscript = createAgentCliNativeTranscriptProjector({
      onEvent: async (event) => {
        await this.runStepRepository.create({
          runId: params.run.id,
          kind: event.kind,
          status: event.status,
          title: event.title,
          input: event.input,
          output: event.output,
        });
      },
      runtimeLabel: params.runAdapter.runtimeLabel,
    });
    const execution = await this.executeWithFailureCapture({
      args: params.runArgs,
      command: params.runtimeCommand,
      cwd: params.workspaceRoot,
      input: params.input,
      onStdoutLine: liveTranscript.acceptLine,
      outputLimitBytes: DEFAULT_AGENT_CLI_OUTPUT_LIMIT_BYTES,
      signal: params.abortController.signal,
      timeoutMs: DEFAULT_AGENT_CLI_TIMEOUT_MS,
    }).finally(() => {
      params.workloadLease.finish();
    });
    await liveTranscript.drain();
    const streamedTranscript = liveTranscript.snapshot();
    const eventsAlreadyProjected = streamedTranscript.rawJsonLineCount > 0;
    const parsedTranscript = eventsAlreadyProjected
      ? streamedTranscript
      : parseAgentCliNativeTranscript({
          runtimeLabel: params.runAdapter.runtimeLabel,
          stderr: execution.stderr,
          stdout: execution.stdout,
        });
    const evidenceOutput = parsedTranscript.finalText?.trim() || execution.stdout;
    const modelOutput = evidenceOutput || execution.summary;
    const normalizedExecution = {
      ...execution,
      stdout: evidenceOutput,
      summary: modelOutput,
    };

    try {
      if (parsedTranscript.rawJsonLineCount > 0) {
        await this.runStepRepository.create({
          runId: params.run.id,
          kind: 'tool_result',
          status: 'completed',
          title: `${params.runAdapter.runtimeLabel} 原生事件流`,
          input: params.commandPreview,
          output: [
            `json_lines=${parsedTranscript.rawJsonLineCount}`,
            `parsed_events=${parsedTranscript.events.length}`,
            parsedTranscript.finalText ? `final_text=${truncateAgentCliContextLine(parsedTranscript.finalText, 600)}` : null,
          ].filter((line): line is string => line !== null).join('\n'),
        });
      }
      if (!eventsAlreadyProjected) {
        for (const event of parsedTranscript.events) {
          await this.runStepRepository.create({
            runId: params.run.id,
            kind: event.kind,
            status: event.status,
            title: event.title,
            input: event.input,
            output: event.output,
          });
        }
      }
      await this.runStepRepository.create({
        runId: params.run.id,
        kind: 'model',
        status: execution.status,
        title: execution.status === 'completed' ? params.runAdapter.completedStepTitle : params.runAdapter.failedStepTitle,
        input: [
          params.commandPreview,
          `exitCode=${execution.exitCode ?? 'unknown'}`,
        ].join('\n'),
        output: modelOutput,
        error: execution.failureReason,
      });
      const verificationStep = buildAgentCliGoalVerificationStep({
        contract: params.runContract,
        execution: normalizedExecution,
        runId: params.run.id,
        runtimeLabel: params.runAdapter.runtimeLabel,
        task: params.task,
      });
      await this.runStepRepository.create({
        runId: params.run.id,
        kind: 'final',
        status: verificationStep.status,
        title: '验收子 Agent 检查',
        input: verificationStep.input,
        output: verificationStep.output,
        error: verificationStep.error,
      });
      const shouldCreateTaskMemoryProposal = verificationStep.verification.shouldProposeTaskMemory
        && !isChildTaskAdvancementRequest(params.runContract.userRequest);
      if (shouldCreateTaskMemoryProposal) {
        const memoryInvocation = buildProductHarnessMemoryProposalInvocation({
          sourceRunId: params.run.id,
          targets: ['task_record'],
          userConfirmationRequired: verificationStep.verification.userConfirmationRequired,
        });
        await this.runStepRepository.create({
          runId: params.run.id,
          kind: 'plan',
          status: 'completed',
          title: '任务记忆建议',
          input: JSON.stringify({
            decision: verificationStep.verification.decision,
            invocation: {
              phase: memoryInvocation.phase,
              layer: memoryInvocation.layer,
              runtime: {
                mode: 'product_harness',
                label: memoryInvocation.runtime.label,
              },
              status: memoryInvocation.status,
              summary: memoryInvocation.summary,
            },
            nextAction: verificationStep.verification.nextAction,
            source: 'agent_cli',
            sourceRunId: params.run.id,
            targets: ['task_record'],
            userConfirmationRequired: verificationStep.verification.userConfirmationRequired,
            suggestedContentByTarget: {
              task_record: buildAgentCliTaskRecordSuggestion({
                output: modelOutput,
                runId: params.run.id,
                runtimeLabel: params.runAdapter.runtimeLabel,
                sandboxMode: params.sandboxMode,
                task: params.task,
                verification: verificationStep.verification,
              }),
            },
          }),
          output: [
            '- Task Record may be useful: Agent CLI output should be reviewed and confirmed into task memory.',
            `- Verifier decision: ${verificationStep.verification.decision}`,
            `- Next action: ${verificationStep.verification.nextAction}`,
            `- Completion conditions: ${verificationStep.verification.contract.completionConditions.length
              ? verificationStep.verification.contract.completionConditions.join(' | ')
              : 'none'}`,
            `- Runtime: ${params.runAdapter.runtimeLabel}`,
            `- Run: ${params.run.id}`,
          ].join('\n'),
        });
      }

      const updated = await this.updateRunResult(
        params.run.id,
        execution.status,
        modelOutput,
        execution.status === 'completed' ? 'ai' : 'system',
        execution.failureReason,
      );

      if (execution.status === 'completed') {
        await this.taskService.annotateRunCompleted(
          params.task.id,
          'agent',
          Boolean(modelOutput.trim()),
          updated.id,
        );
      } else {
        await this.taskService.annotateRunFailed(
          params.task.id,
          execution.failureReason ?? execution.summary,
          updated.id,
        );
      }

      await this.notifyTerminalRun(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = await this.updateRunResult(
        params.run.id,
        'failed',
        `Agent CLI terminal persistence failed: ${message}`,
        'system',
        message,
      ).catch(() => null);
      if (failed) {
        await Promise.resolve(this.taskService.annotateRunFailed(params.task.id, message, failed.id)).catch(() => undefined);
        await Promise.resolve(this.notifyTerminalRun(failed)).catch(() => undefined);
      }
    }
  }

  private async notifyTerminalRun(run: RunRecord): Promise<void> {
    await this.onTerminalRun?.(run);
  }

  private async executeWithFailureCapture(params: Parameters<AgentCliExecutor>[0]): Promise<AgentCliExecutionResult> {
    try {
      return await this.executor(params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        exitCode: null,
        failureReason: message,
        status: 'failed',
        stderr: '',
        stdout: '',
        summary: `Agent CLI execution failed: ${message}`,
      };
    }
  }
}

function runtimeContextSurfaceForRunScope(kind: RunScope['kind']): RuntimeContextManifest['activeSurface'] {
  if (kind === 'business_line_chat') return 'business_line';
  if (kind === 'next_action_execution' || kind === 'scheduler_loop_carrier') return 'next_action';
  if (kind === 'legacy_task_recovery' || kind === 'one_off_non_durable_action') return 'legacy_task';
  return 'global';
}

function normalizeAgentCliRunInput(input: CreateAgentCliRunInput): NormalizedAgentCliRunInput {
  const rawSandboxMode = (input as { sandboxMode?: unknown }).sandboxMode;
  if (rawSandboxMode !== undefined && rawSandboxMode !== 'read-only') {
    throw new Error('Agent CLI workspace-write mode is not enabled in this version.');
  }
  return {
    operatorConfirmed: input.operatorConfirmed === true,
    businessLineId: input.businessLineId?.trim() || null,
    prompt: input.prompt?.trim() ?? '',
    runtimeId: input.runtimeId ?? 'codex',
    sandboxMode: 'read-only',
    taskId: input.taskId?.trim() ?? '',
    pilotDecision: input.pilotDecision ?? null,
  };
}

function attachAgentCliRunScope<T extends RunRecord>(run: T, scope: RunScope): T {
  return {
    ...run,
    businessLineId: scope.businessLineId ?? run.businessLineId ?? null,
    scope,
  };
}

function formatAgentCliPilotDecisionForStep(snapshot: PilotDecisionSnapshot): string {
  return [
    `operationMode=${snapshot.operationMode}`,
    `backend=${snapshot.backend}`,
    `confidence=${snapshot.confidence}`,
    `messagePriority=${snapshot.messagePriority}`,
    `movement=${snapshot.movement}`,
    `executor=${snapshot.executor}`,
    `priorityLane=${snapshot.priorityLane ?? 'none'}`,
    `reason=${snapshot.reason}`,
    formatPilotDecisionBackendPlanForStep(snapshot.backendPlan),
  ].join('\n');
}

function normalizeAgentCliCapabilityMode(mode: AgentCliCapabilityMode | undefined): AgentCliCapabilityMode {
  if (mode === 'audit_enhanced' || mode === 'restricted') return mode;
  return 'native';
}

function normalizeRuntimeNativeGoalRequestInput(
  input: RecordRuntimeNativeGoalRequestInput,
): RecordRuntimeNativeGoalRequestInput {
  const objective = input.objective?.trim() ?? '';
  if (!objective) {
    throw new Error('Runtime-native goal audit requires an objective.');
  }
  return {
    forwarded: false,
    objective,
    operatorConfirmed: input.operatorConfirmed === true,
    reason: input.reason?.trim() || 'Runtime-native goal request was not forwarded by Taskplane policy.',
    runtimeId: input.runtimeId ?? 'selected',
    runtimeLabel: input.runtimeLabel?.trim() || String(input.runtimeId ?? 'selected'),
    supportsNativeGoalMode: input.supportsNativeGoalMode === true,
    taskId: input.taskId?.trim() ?? '',
  };
}

function normalizeCancelAgentCliRunInput(input: CancelAgentCliRunInput): Required<CancelAgentCliRunInput> {
  const runId = input.runId?.trim() ?? '';
  if (!runId) {
    throw new Error('Agent CLI cancellation requires a run id.');
  }
  if (!input.operatorConfirmed) {
    throw new Error('Agent CLI cancellation requires explicit operator confirmation.');
  }
  return {
    operatorConfirmed: true,
    reason: input.reason?.trim() || 'Operator cancelled the Agent CLI run.',
    runId,
  };
}

function getAgentCliRunAdapter(runtimeId: AgentCliRuntimeId): AgentCliRunAdapter | null {
  if (runtimeId === 'codex') return codexCliRunAdapter;
  if (runtimeId === 'claude') return claudeCodeRunAdapter;
  return null;
}

const codexCliRunAdapter: AgentCliRunAdapter = {
  acceptedLabel: 'Codex CLI',
  buildExecution(params) {
    return {
      args: ['exec', '--json', '--sandbox', params.sandboxMode, '--cd', params.workspaceRoot, '--skip-git-repo-check', '-'],
      commandPreview: `codex exec --json --sandbox ${params.sandboxMode} --cd ${params.workspaceRoot} -`,
      input: buildCodexCliPrompt({
        capabilityMode: params.capabilityMode,
        contextSummary: params.contextSummary,
        prompt: params.prompt,
        sandboxMode: params.sandboxMode,
        task: params.task,
      }),
    };
  },
  completedStepTitle: 'codex cli completed',
  failedStepTitle: 'codex cli failed',
  runtimeLabel: 'Codex CLI',
};

const claudeCodeRunAdapter: AgentCliRunAdapter = {
  acceptedLabel: 'Claude Code',
  buildExecution(params) {
    return {
      args: ['-p', '--permission-mode', 'plan', '--output-format', 'stream-json'],
      commandPreview: `claude -p --permission-mode plan --output-format stream-json`,
      input: buildClaudeCodePrompt({
        capabilityMode: params.capabilityMode,
        contextSummary: params.contextSummary,
        prompt: params.prompt,
        sandboxMode: params.sandboxMode,
        task: params.task,
      }),
    };
  },
  completedStepTitle: 'claude code completed',
  failedStepTitle: 'claude code failed',
  runtimeLabel: 'Claude Code',
};

function buildAgentCliContextBridge(params: {
  businessLineWorkspace: BusinessLineWorkspace | null;
  capabilityMode: AgentCliCapabilityMode;
  contract: RunGoalContract;
  manifest: RuntimeContextManifest;
  readinessSummary: string;
  task: TaskDetail;
  taskFilesForContext: ReturnType<typeof buildAgentCliTaskFilesForContext>;
}): string {
  const includedSourceIds = new Set(params.manifest.items
    .filter((item) => item.kind === 'source_context' && item.contentIncluded)
    .map((item) => item.id));
  const sourcePreviews = params.task.sourceContexts
    .filter((source) => (
      includedSourceIds.has(source.id)
      && !source.containsSensitiveData
      && !source.isDuplicate
      && source.status === 'active'
    ))
    .slice(0, 3)
    .map((source, index) => [
      `${index + 1}. ${source.title}`,
      source.sourceRole ? `role=${source.sourceRole}` : null,
      source.uri ? `uri=${source.uri}` : null,
      source.note ? `note=${truncateAgentCliContextLine(source.note, 240)}` : null,
      source.content ? `preview=${truncateAgentCliContextLine(source.content, 600)}` : null,
    ].filter(Boolean).join(' / '));
  const taskFilePreviews = params.taskFilesForContext
    .filter((file) => isTaskMdPath(file.path) || isTaskMdPath(file.name ?? ''))
    .slice(0, 1)
    .map((file) => [
      `- ${file.path}`,
      file.contentPreview ? truncateAgentCliContextLine(file.contentPreview, 900) : null,
    ].filter(Boolean).join('\n'));

  return [
    'Taskplane run contract:',
    formatRunGoalContractForPrompt(params.contract),
    '',
    params.manifest.userFacingSummary,
    '',
    'Runtime context manifest:',
    formatRuntimeContextManifestForStep(params.manifest),
    '',
    'Context readiness decision:',
    params.readinessSummary,
    params.businessLineWorkspace ? '' : null,
    params.businessLineWorkspace ? 'Business-line source of truth:' : null,
    params.businessLineWorkspace ? formatBusinessLineContextPackForPrompt(params.businessLineWorkspace) : null,
    taskFilePreviews.length ? '' : null,
    taskFilePreviews.length ? 'Task recovery context preview:' : null,
    ...taskFilePreviews,
    sourcePreviews.length ? '' : null,
    sourcePreviews.length ? 'Confirmed source previews:' : null,
    ...sourcePreviews,
    '',
    'Capability bridge policy:',
    ...buildAgentCliCapabilityBridgePolicy(params.capabilityMode),
  ].filter((line): line is string => line !== null).join('\n');
}

function buildAgentCliCapabilityBridgePolicy(mode: AgentCliCapabilityMode): string[] {
  if (mode === 'restricted') {
    return [
      '- Taskplane-managed External Access, Skills, and MCP entries are context-only unless Taskplane exposes explicit tools in this run.',
      '- Restricted mode: do not use live web, search, connector, or external tools. Answer from the confirmed Taskplane context and native reasoning only.',
    ];
  }
  if (mode === 'audit_enhanced') {
    return [
      '- Taskplane-managed External Access, Skills, and MCP entries are context-only unless Taskplane exposes explicit tools in this run.',
      '- Audit-enhanced mode may include Taskplane-captured source previews; treat them as reviewable evidence and cite them when relevant.',
      '- This policy does not disable official CLI-native read-only tools. Use Codex CLI or Claude Code built-in search, browse, source, and documentation capabilities when the selected CLI exposes them.',
    ];
  }
  return [
    '- Taskplane-managed External Access, Skills, and MCP entries are context-only unless Taskplane exposes explicit tools in this run.',
    '- Native mode: do not downgrade the selected official CLI. Use Codex CLI or Claude Code built-in search, browse, source, and documentation capabilities when the selected CLI exposes them.',
    '- Workspace writes remain outside this Taskplane run unless the user explicitly chooses a write-capable flow.',
  ];
}

function buildAgentCliTaskFilesForContext(task: TaskDetail): Array<{
  contentPreview: string | null;
  id: string;
  kind: string | null;
  name: string | null;
  path: string;
  taskId: string | null;
  updatedAt: string | null;
}> {
  const files = (task.taskFiles ?? []).map((file) => ({
    contentPreview: file.content?.slice(0, 1600) ?? null,
    id: file.id,
    kind: file.kind,
    name: file.name,
    path: file.path,
    taskId: file.taskId,
    updatedAt: file.updatedAt,
  }));
  if (files.some((file) => isTaskMdPath(file.path) || isTaskMdPath(file.name ?? ''))) {
    return files;
  }
  const syntheticTaskMd = [
    `# ${task.title}`,
    '',
    task.summary?.trim() ? `Summary: ${task.summary.trim()}` : null,
    task.nextStep?.trim() ? `Next step: ${task.nextStep.trim()}` : null,
    task.resumeCard?.nextSuggestedMove?.trim() ? `Suggested move: ${task.resumeCard.nextSuggestedMove.trim()}` : null,
    `State: ${task.state}`,
    `Risk: ${task.riskLevel}${task.riskNote?.trim() ? ` / ${task.riskNote.trim()}` : ''}`,
    task.parentTaskId ? `Parent task: ${task.parentTaskId}` : null,
    task.childTaskIds?.length ? `Child tasks: ${task.childTaskIds.length}` : null,
    '',
    'This Task.md context was synthesized from structured Taskplane task state because no persisted Task.md exists yet.',
    'Use it as read-only recovery context for planning; do not create or edit files unless the user confirms a write proposal.',
  ].filter((line): line is string => line !== null).join('\n');
  return [
    ...files,
    {
      contentPreview: syntheticTaskMd,
      id: `synthetic_task_md:${task.id}`,
      kind: 'file',
      name: 'Task.md',
      path: 'Task.md',
      taskId: task.id,
      updatedAt: task.updatedAt ?? task.createdAt ?? null,
    },
  ];
}

function buildAgentCliGoalVerificationStep(params: {
  contract: RunGoalContract;
  execution: AgentCliExecutionResult;
  runId: string;
  runtimeLabel: string;
  task: TaskDetail;
}): {
  error: string | null;
  input: string;
  output: string;
  status: 'completed' | 'failed';
  verification: AgentRuntimeVerifierResult;
} {
  const verification = verifyRunGoalContractEvidence({
    contract: params.contract,
    failureReason: params.execution.failureReason,
    stdout: params.execution.stdout,
    terminalStatus: params.execution.status,
  });
  const invocation = buildProductHarnessVerificationAssistInvocation({
    runtimeLabel: 'Taskplane lightweight verifier',
    verification,
  });
  return {
    status: params.execution.status === 'failed' ? 'failed' : 'completed',
    input: JSON.stringify({
      canMarkTaskComplete: verification.canMarkTaskComplete,
      decision: verification.decision,
      evaluator: verification.evaluator,
      invocation: {
        phase: invocation.phase,
        layer: invocation.layer,
        runtime: {
          mode: 'product_harness',
          label: invocation.runtime.label,
        },
        status: invocation.status,
        summary: invocation.summary,
      },
      nextAction: verification.nextAction,
      runId: params.runId,
      runtimeLabel: params.runtimeLabel,
      runGoalContract: {
        completionConditions: params.contract.completionConditions,
        constraints: params.contract.constraints,
        objective: params.contract.objective,
        taskGoal: params.contract.taskGoal,
      },
      shouldProposeTaskMemory: verification.shouldProposeTaskMemory,
      taskId: params.task.id,
      taskTitle: params.task.title,
      userConfirmationRequired: verification.userConfirmationRequired,
    }, null, 2),
    output: formatAgentRuntimeVerifierResult(verification),
    error: params.execution.status === 'failed'
      ? params.execution.failureReason ?? params.execution.summary
      : null,
    verification,
  };
}

function truncateAgentCliContextLine(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

type WebResearchSource = {
  title: string | null;
  url: string;
  snippet: string | null;
};

type WebResearchResult = {
  query: string;
  sources: WebResearchSource[];
  summary: string;
};

type AgentCliWebResearchPreparation = {
  attemptedSourceCount?: number;
  batchId?: string | null;
  capabilityMode: AgentCliCapabilityMode;
  failedSourceCount?: number;
  persistedSourceIds?: string[];
  query: string | null;
  reason: string;
  sourceCount: number;
  status: 'captured' | 'not_needed' | 'skipped';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function shouldPrepareWebResearch(task: TaskDetail, prompt: string): boolean {
  return evaluateRuntimeResearchIntent(buildRuntimeResearchIntentText([
    task.title,
    task.summary,
    task.nextStep,
    prompt,
  ])).shouldUseExternalResearch;
}

function formatAgentCliWebResearchPreparation(preparation: AgentCliWebResearchPreparation): string {
  return [
    `status=${preparation.status}`,
    `capability_mode=${preparation.capabilityMode}`,
    `sources=${preparation.sourceCount}`,
    typeof preparation.attemptedSourceCount === 'number' ? `attempted_sources=${preparation.attemptedSourceCount}` : null,
    typeof preparation.failedSourceCount === 'number' ? `failed_sources=${preparation.failedSourceCount}` : null,
    preparation.batchId ? `batch_id=${preparation.batchId}` : null,
    preparation.persistedSourceIds?.length ? `source_context_ids=${preparation.persistedSourceIds.join(',')}` : null,
    preparation.query ? `query=${truncateAgentCliContextLine(preparation.query, 600)}` : null,
    `reason=${preparation.reason}`,
  ].filter((line): line is string => line !== null).join('\n');
}

function readCreatedSourceContextId(source: unknown): string | null {
  if (!isRecord(source) || typeof source.id !== 'string') return null;
  const id = source.id.trim();
  return id || null;
}

function nativeWebSearchFallbackReason(capabilities: AgentRuntimeAdapterCapabilities): string {
  const availability = capabilities.nativeCapabilities?.webSearch.availability;
  if (availability === 'available' || availability === 'runtime_dependent') {
    return 'Selected native CLI reports web/search support; Taskplane will project visible native web/search events when they appear.';
  }
  if (availability === 'unverified') {
    return 'Selected native CLI web/search is unverified by the current probe; Taskplane will only project native web/search when visible events appear.';
  }
  if (availability === 'unsupported') {
    return 'Selected native CLI web/search is not available according to the current probe.';
  }
  return 'Selected native CLI web/search readiness is unknown.';
}

function buildWebResearchQuery(task: TaskDetail, prompt: string): string {
  return [
    task.title,
    task.summary,
    task.nextStep,
    prompt,
  ].filter((line): line is string => Boolean(line?.trim())).join('\n');
}

async function runOpenAiWebResearch(params: {
  apiKey: string;
  model: string;
  query: string;
}): Promise<WebResearchResult | null> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    body: JSON.stringify({
      input: [
        'Research the user task using web search.',
        'Return concise findings and include useful sources.',
        'Focus on official documentation and high-signal reference pages.',
        '',
        params.query,
      ].join('\n'),
      model: params.model,
      tools: [{ type: 'web_search' }],
    }),
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`OpenAI web research failed: ${response.status}`);
  }
  const body = await response.json() as unknown;
  return parseOpenAiWebResearchResponse(body, params.query);
}

function parseOpenAiWebResearchResponse(body: unknown, query: string): WebResearchResult | null {
  const text = extractOpenAiResponseText(body);
  const sources = dedupeWebResearchSources([
    ...extractOpenAiResponseSources(body),
    ...extractOpenAiResponseUrlCitations(body),
  ]).slice(0, 5);
  if (!text && sources.length === 0) return null;
  return {
    query,
    sources,
    summary: text,
  };
}

function extractOpenAiResponseText(value: unknown): string {
  if (!isRecord(value)) return '';
  if (typeof value.output_text === 'string') return value.output_text.trim();
  const chunks: string[] = [];
  collectOpenAiTextChunks(value, chunks);
  return chunks.join('\n').trim();
}

function collectOpenAiTextChunks(value: unknown, chunks: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectOpenAiTextChunks(item, chunks);
    return;
  }
  if (!isRecord(value)) return;
  if ((value.type === 'output_text' || value.type === 'text') && typeof value.text === 'string') {
    chunks.push(value.text);
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) collectOpenAiTextChunks(child, chunks);
  }
}

function extractOpenAiResponseSources(value: unknown): WebResearchSource[] {
  if (!isRecord(value) || !Array.isArray(value.sources)) return [];
  return value.sources
    .filter(isRecord)
    .map((source) => {
      const url = typeof source.url === 'string' ? source.url.trim() : '';
      if (!url) return null;
      return {
        snippet: typeof source.snippet === 'string' ? source.snippet.trim() : null,
        title: typeof source.title === 'string' ? source.title.trim() : null,
        url,
      };
    })
    .filter((source): source is WebResearchSource => source !== null);
}

function extractOpenAiResponseUrlCitations(value: unknown): WebResearchSource[] {
  const sources: WebResearchSource[] = [];
  collectUrlCitations(value, sources);
  return sources;
}

function collectUrlCitations(value: unknown, sources: WebResearchSource[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectUrlCitations(item, sources);
    return;
  }
  if (!isRecord(value)) return;
  if (
    (value.type === 'url_citation' || value.type === 'citation')
    && typeof value.url === 'string'
    && value.url.trim()
  ) {
    sources.push({
      snippet: null,
      title: typeof value.title === 'string' ? value.title.trim() : null,
      url: value.url.trim(),
    });
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child) || isRecord(child)) collectUrlCitations(child, sources);
  }
}

function dedupeWebResearchSources(sources: WebResearchSource[]): WebResearchSource[] {
  const seen = new Set<string>();
  const result: WebResearchSource[] = [];
  for (const source of sources) {
    const key = source.url.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(source);
  }
  return result;
}

function buildWebResearchSourceInputs(params: {
  batchId: string;
  capturedAt: string;
  query: string;
  research: WebResearchResult;
  taskId: string;
}): CreateSourceContextInput[] {
  const summaryInput: CreateSourceContextInput = {
    batchId: params.batchId,
    capturedAt: params.capturedAt,
    content: [
      '# Web Research Summary',
      '',
      `Query:\n${params.query}`,
      '',
      params.research.summary ? `Findings:\n${params.research.summary}` : null,
      '',
      params.research.sources.length
        ? [
            'Sources:',
            ...params.research.sources.map((source, index) => `${index + 1}. ${source.title || source.url} - ${source.url}`),
          ].join('\n')
        : null,
    ].filter((line): line is string => line !== null).join('\n'),
    credibility: 'unknown',
    isKey: true,
    kind: 'note',
    note: 'AI web research digest created before an Agent CLI run. Review sources before treating conclusions as durable facts.',
    sourceRole: 'digest',
    taskId: params.taskId,
    title: '联网调研摘要',
    uri: null,
  };
  const sourceInputs = params.research.sources.map((source): CreateSourceContextInput => ({
    batchId: params.batchId,
    capturedAt: params.capturedAt,
    content: source.snippet,
    credibility: 'unknown',
    isKey: true,
    kind: 'link',
    note: 'Source discovered by OpenAI web_search before an Agent CLI run.',
    sourceRole: 'raw',
    taskId: params.taskId,
    title: source.title || source.url,
    uri: source.url,
  }));
  return [summaryInput, ...sourceInputs];
}

function buildAgentCliTaskRecordSuggestion(params: {
  output: string;
  runId: string;
  runtimeLabel: string;
  sandboxMode: AgentCliRunSandboxMode;
  task: TaskDetail;
  verification: AgentRuntimeVerifierResult;
}): string {
  return [
    '## Summary',
    truncateAgentCliMemoryLine(params.output),
    '',
    '## Confirmed',
    `- ${params.runtimeLabel} completed a read-only task inspection.`,
    `- Runtime mode: ${params.runtimeLabel} / ${params.sandboxMode}.`,
    `- Run objective: ${params.verification.contract.objective}`,
    `- Completion conditions checked: ${params.verification.contract.completionConditionCount}`,
    ...params.verification.contract.completionConditions.map((condition) => `  - ${condition}`),
    `- Verifier decision: ${params.verification.decision}.`,
    `- User confirmation required: ${params.verification.userConfirmationRequired ? 'yes' : 'no'}.`,
    `- Source run: ${params.runId}`,
    '',
    '## Open',
    '- Review the Agent CLI output before treating these findings as durable task memory.',
    '',
    '## Next',
    params.task.nextStep?.trim()
      ? `- ${params.task.nextStep.trim()}`
      : '- Decide the next task step from the Agent CLI findings.',
    '',
    '## Verification',
    '- Agent CLI process exited successfully and did not receive workspace-write permission from Taskplane.',
    `- Task Goal status: ${params.verification.contract.taskGoalStatus}.`,
    `- Next verifier action: ${params.verification.nextAction}.`,
    '',
    '## Risks',
    params.task.riskNote?.trim()
      ? `- ${params.task.riskNote.trim()}`
      : '- No explicit task risk note was present before this run.',
    '',
    '## Links',
    `- Run: ${params.runId}`,
  ].join('\n');
}

function truncateAgentCliMemoryLine(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 600) return normalized;
  return `${normalized.slice(0, 597)}...`;
}

function buildCodexCliPrompt(params: {
  capabilityMode: AgentCliCapabilityMode;
  contextSummary: string;
  prompt: string;
  sandboxMode: AgentCliRunSandboxMode;
  task: TaskDetail;
}): string {
  const decompositionInstructions = buildTaskDecompositionPromptInstructions(params.prompt);
  const childTaskInstructions = params.task.parentTaskId
    ? buildNativeChildTaskContextInstructions()
    : buildChildTaskAdvancePromptInstructions(params.prompt);
  return [
    'You are running as Codex CLI from inside Taskplane.',
    `Sandbox mode: ${params.sandboxMode}.`,
    'Do not modify files.',
    buildAgentCliCapabilityPromptInstruction(params.capabilityMode, 'Codex CLI'),
    buildContextReadinessPromptInstruction(),
    decompositionInstructions ?? childTaskInstructions ?? 'Answer with a concrete plan, risks, and verification steps. Only inspect the workspace when the user explicitly asks for code, files, repository state, or local verification.',
    '',
    `Task: ${params.task.title}`,
    params.task.summary ? `Summary: ${params.task.summary}` : null,
    params.task.nextStep ? `Next step: ${params.task.nextStep}` : null,
    params.task.riskNote ? `Risk: ${params.task.riskNote}` : null,
    `Runtime context: ${params.contextSummary}`,
    buildTaskplaneWriteIntentPromptInstructions(),
    '',
    'User request:',
    params.prompt,
  ].filter((line): line is string => line !== null).join('\n');
}

function buildClaudeCodePrompt(params: {
  capabilityMode: AgentCliCapabilityMode;
  contextSummary: string;
  prompt: string;
  sandboxMode: AgentCliRunSandboxMode;
  task: TaskDetail;
}): string {
  const decompositionInstructions = buildTaskDecompositionPromptInstructions(params.prompt);
  const childTaskInstructions = params.task.parentTaskId
    ? buildNativeChildTaskContextInstructions()
    : buildChildTaskAdvancePromptInstructions(params.prompt);
  return [
    'You are running as Claude Code from inside Taskplane.',
    `Taskplane sandbox intent: ${params.sandboxMode}.`,
    'Claude Code is launched with --permission-mode plan. Research and propose; do not edit files, write files, or ask to continue into an editing mode.',
    buildAgentCliCapabilityPromptInstruction(params.capabilityMode, 'Claude Code'),
    buildContextReadinessPromptInstruction(),
    decompositionInstructions ?? childTaskInstructions ?? 'Return a concise answer with findings, recommended next steps, risks, and verification checks. Only inspect the workspace when the user explicitly asks for code, files, repository state, or local verification.',
    '',
    `Task: ${params.task.title}`,
    params.task.summary ? `Summary: ${params.task.summary}` : null,
    params.task.nextStep ? `Next step: ${params.task.nextStep}` : null,
    params.task.riskNote ? `Risk: ${params.task.riskNote}` : null,
    `Runtime context: ${params.contextSummary}`,
    buildTaskplaneWriteIntentPromptInstructions(),
    '',
    'User request:',
    params.prompt,
  ].filter((line): line is string => line !== null).join('\n');
}

function buildContextReadinessPromptInstruction(): string {
  return [
    'Context readiness: before asking or executing, decide whether the task context is clean and sufficient for a reversible next step.',
    'If missing facts can be learned from files, source context, web research, official docs, prior records, or native runtime tools, inspect or research instead of asking.',
    'Ask the user only when the answer changes the goal, acceptance boundary, irreversible cost, security/legal/credential boundary, external side effect, or a preference only the user can know.',
    'If context is sufficient, briefly say so only when useful, then move into the concrete plan, research, execution, verification, or writeback path.',
  ].join(' ');
}

function buildNativeChildTaskContextInstructions(): string {
  return [
    'Taskplane context: the selected task is a child task.',
    'Treat the user request as the source of intent; do not rewrite it or ask secondary preference questions when the task title, summary, memory, or parent context gives enough signal to move forward.',
    'Focus on the child task boundary. Produce the smallest useful advancement: a first-pass goal, scope, non-goals, research/build action, or concrete next step.',
    'When the task title, summary, memory, or user request is enough, continue with a concrete action instead of another planning question.',
    'Do not create a subtask.propose write-intent block unless the user explicitly asks to split this child task further.',
    'Ask only when the missing information blocks useful progress, changes a key risk, or materially changes the deliverable boundary.',
  ].join(' ');
}

function buildAgentCliCapabilityPromptInstruction(
  mode: AgentCliCapabilityMode,
  runtimeLabel: string,
): string {
  if (mode === 'restricted') {
    return [
      'Capability mode: restricted.',
      'Do not use live web, search, browse, external connector, or MCP tools unless Taskplane explicitly injected their results into the prompt.',
      'If external research is necessary, say what should be researched next instead of inventing sources.',
    ].join(' ');
  }
  if (mode === 'audit_enhanced') {
    return [
      'Capability mode: audit-enhanced.',
      'Use Taskplane-confirmed source previews when present, and also use the official CLI native read-only search, browse, source, or documentation tools when they are available in this runtime.',
      'For research-dependent tasks, gather high-signal sources and cite them; do not ask the user to choose secondary product structure when research can resolve the next step.',
    ].join(' ');
  }
  return [
    'Capability mode: native.',
    `Use ${runtimeLabel}'s native read-only capabilities as you normally would in the terminal, including search, browse, source, and documentation tools when available.`,
    'For research-dependent tasks, gather high-signal sources and cite them; if the runtime truly has no live research capability, state that as a blocker or next action instead of over-asking the user.',
  ].join(' ');
}

function buildTaskplaneWriteIntentPromptInstructions(): string {
  return [
    'Taskplane write intent: do not claim that you wrote Taskplane data.',
    'If your result contains durable business memory, a business review, a business-line Next Action, a SOP revision proposal, a business handoff, durable task memory, a task file draft, task artifact, patch evidence, source evidence, a decision proposal, next-step update, blocker, or completion proposal that Taskplane should offer to save, append at most one fenced JSON block.',
    'Allowed intent types: business_record.create, business_review.record, business_next_action.create, business_sop_revision.propose, business_handoff.record, task_record.create, task_file.propose, artifact.propose, source_context.create, decision.create, task.update_next_step, task.mark_blocked, task.complete.propose.',
    'For artifact.propose, use kind="note" for ordinary artifacts and kind="patch" only when content is reviewable unified diff / git diff evidence; patch artifacts are still proposals and do not apply workspace files.',
    '{"type":"TASKPLANE_WRITE_INTENTS","intents":[{"type":"business_record.create","summary":"...","recordType":"signal"},{"type":"business_review.record","resultSummary":"...","evidenceItems":["..."]},{"type":"business_next_action.create","title":"...","nextStep":"..."},{"type":"business_sop_revision.propose","nextContent":"...","changeReason":"..."},{"type":"business_handoff.record","currentState":"...","nextSafeAction":"...","reason":"..."},{"type":"task_record.create","confidence":"medium","content":"..."},{"type":"task_file.propose","path":"notes.md","content":"...","summary":"..."},{"type":"artifact.propose","title":"artifact.md","kind":"note","content":"...","summary":"..."},{"type":"artifact.propose","title":"changes.patch","kind":"patch","content":"diff --git ...","summary":"Reviewable patch evidence."},{"type":"source_context.create","title":"...","uri":"https://...","note":"...","credibility":"unknown"},{"type":"decision.create","title":"...","rationale":"...","options":["..."],"proposedOutcome":"..."},{"type":"task.update_next_step","nextStep":"...","reason":"..."},{"type":"task.mark_blocked","reason":"...","unblockCondition":"..."},{"type":"task.complete.propose","evidence":"..."}]}',
    'Only include intents that need Taskplane confirmation or writeback review; otherwise omit the block.',
  ].join(' ');
}

function parseAgentCliNativeTranscript(params: {
  runtimeLabel: string;
  stderr: string;
  stdout: string;
}): AgentCliParsedTranscript {
  const projector = createAgentCliNativeTranscriptProjector({ runtimeLabel: params.runtimeLabel });
  for (const line of params.stdout.split(/\r?\n/)) {
    projector.acceptLine(line);
  }
  return projector.snapshot();
}

function createAgentCliNativeTranscriptProjector(params: {
  onEvent?: (event: AgentCliParsedEvent) => void | Promise<void>;
  runtimeLabel: string;
}): AgentCliNativeTranscriptProjector {
  const events: AgentCliParsedEvent[] = [];
  const finalCandidates: string[] = [];
  let rawJsonLineCount = 0;
  let projectionChain = Promise.resolve();

  const acceptLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return;
    }
    if (!isRecord(parsed)) return;
    rawJsonLineCount += 1;
    const finalText = extractAgentCliFinalText(parsed);
    if (finalText) finalCandidates.push(finalText);

    const event = mapAgentCliJsonEventToRunStep(parsed, params.runtimeLabel);
    if (!event || events.length >= 12) return;
    events.push(event);
    if (params.onEvent) {
      projectionChain = projectionChain
        .then(() => params.onEvent?.(event))
        .catch(() => undefined);
    }
  };

  return {
    acceptLine,
    drain: () => projectionChain,
    snapshot: () => ({
      events: [...events],
      finalText: finalCandidates.at(-1) ?? null,
      rawJsonLineCount,
    }),
  };
}

function mapAgentCliJsonEventToRunStep(event: Record<string, unknown>, runtimeLabel: string): AgentCliParsedEvent | null {
  const kind = String(event.type ?? event.event ?? event.kind ?? '').toLowerCase();
  const nativeItem = findAgentCliNativeActionItem(event);
  const nestedToolUse = findAgentCliToolUse(event);
  const name = String(event.name ?? event.tool_name ?? event.tool ?? event.subtype ?? nativeItem?.name ?? nestedToolUse?.name ?? '').trim();
  const input = summarizeAgentCliEventInput(event)
    ?? summarizeAgentCliEventInput(nativeItem?.item ?? {})
    ?? summarizeAgentCliEventInput(nestedToolUse ?? {});
  const text = extractAgentCliEventText(event) || nativeItem?.text || '';
  if (!kind && !name && !text) return null;

  const isToolLike = Boolean(nestedToolUse)
    || Boolean(nativeItem)
    || /tool|call|command|bash|shell|search|browse|web|read|write|edit|hook|mcp/.test(`${kind} ${name}`);
  if (!isToolLike) return null;

  const label = name || humanizeAgentCliEventKind(kind) || 'native event';
  const capability = classifyAgentCliNativeCapability({
    kind,
    input,
    name,
    text,
  });
  const fallbackOutput = truncateAgentCliContextLine(JSON.stringify(event), 1200);
  return {
    input,
    kind: runStepKindForAgentCliNativeEvent(kind),
    output: [
      `capability=${capability}`,
      kind ? `provider_event=${kind}` : null,
      text || fallbackOutput,
    ].filter((line): line is string => line !== null).join('\n'),
    status: /error|failed|failure/.test(kind) ? 'failed' : 'completed',
    title: `${runtimeLabel} ${agentCliNativeCapabilityLabel(capability)}：${label}`,
  };
}

function runStepKindForAgentCliNativeEvent(kind: string): RunStepKind {
  if (/result|completed|complete|finished|done|failed|failure|error/.test(kind)) {
    return 'tool_result';
  }
  return 'tool_call';
}

function classifyAgentCliNativeCapability(params: {
  kind: string;
  input: string | null;
  name: string;
  text: string;
}): AgentCliNativeCapability {
  const haystack = `${params.kind} ${params.name} ${params.input ?? ''} ${params.text}`.toLowerCase();
  if (/\bmcp\b/.test(haystack)) return 'mcp_tool';
  if (/hook/.test(haystack)) return 'hook';
  if (/web[_\s.-]?search|websearch|browser|browse|fetch|http|https|url|联网|搜索网页|网络检索/.test(haystack)) {
    return 'web_search';
  }
  if (/write|edit|patch|apply_patch|create|delete|remove|rename|move|修改|写入|删除/.test(haystack)) {
    return 'workspace_write';
  }
  if (/bash|shell|terminal|exec|command|run_command/.test(haystack)) {
    return 'shell_command';
  }
  if (/workspace|read|grep|rg|ripgrep|glob|list|ls|cat|sed|find|open|view|file|inspect|读取|文件/.test(haystack)) {
    return 'workspace_read';
  }
  return 'generic_tool';
}

function agentCliNativeCapabilityLabel(capability: AgentCliNativeCapability): string {
  switch (capability) {
    case 'web_search':
      return '联网检索';
    case 'workspace_read':
      return '工作区读取';
    case 'workspace_write':
      return '工作区写入候选';
    case 'shell_command':
      return '命令执行';
    case 'mcp_tool':
      return 'MCP 工具';
    case 'hook':
      return 'Hook';
    case 'generic_tool':
      return '原生工具';
  }
}

function extractAgentCliFinalText(event: Record<string, unknown>): string | null {
  for (const key of ['result', 'final_answer', 'final_message', 'output_text']) {
    const value = event[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const kind = String(event.type ?? event.event ?? event.kind ?? '').toLowerCase();
  if (/(assistant|message|response|completed|complete|final|result)/.test(kind)) {
    const text = extractAgentCliEventText(event);
    if (text) return text;
  }
  return null;
}

function extractAgentCliEventText(value: unknown): string {
  const chunks: string[] = [];
  collectAgentCliTextChunks(value, chunks);
  return chunks.join('\n').trim();
}

function collectAgentCliTextChunks(value: unknown, chunks: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectAgentCliTextChunks(item, chunks);
    return;
  }
  if (!isRecord(value)) return;
  const type = String(value.type ?? '').toLowerCase();
  if (
    (type === 'text' || type === 'output_text' || type === 'agent_message' || type === 'message')
    && typeof value.text === 'string'
  ) {
    chunks.push(value.text);
  }
  if (typeof value.message === 'string') chunks.push(value.message);
  if (typeof value.summary === 'string') chunks.push(value.summary);
  if (typeof value.content === 'string') chunks.push(value.content);
  for (const child of Object.values(value)) {
    if (Array.isArray(child) || isRecord(child)) collectAgentCliTextChunks(child, chunks);
  }
}

function summarizeAgentCliEventInput(event: Record<string, unknown>): string | null {
  const candidate = event.input ?? event.arguments ?? event.args ?? event.command ?? event.query ?? event.url;
  if (typeof candidate === 'string' && candidate.trim()) return truncateAgentCliContextLine(candidate, 1200);
  if (isRecord(candidate) || Array.isArray(candidate)) return truncateAgentCliContextLine(JSON.stringify(candidate), 1200);
  return null;
}

function findAgentCliToolUse(value: unknown): { input?: unknown; name: string } | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAgentCliToolUse(item);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  const type = String(value.type ?? '').toLowerCase();
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if ((type.includes('tool') || type.includes('call')) && name) {
    return {
      input: value.input ?? value.arguments ?? value.args,
      name,
    };
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child) || isRecord(child)) {
      const found = findAgentCliToolUse(child);
      if (found) return found;
    }
  }
  return null;
}

function findAgentCliNativeActionItem(value: unknown): { item: Record<string, unknown>; name: string; text: string } | null {
  if (!isRecord(value)) return null;
  if (!isRecord(value.item)) return null;
  const item = value.item;
  const type = String(item.type ?? '').toLowerCase();
  if (!type) return null;
  if (!/command|tool|call|search|browse|web|read|write|edit|hook|mcp/.test(type)) return null;
  return {
    item,
    name: type,
    text: summarizeAgentCliNativeActionItem(item),
  };
}

function summarizeAgentCliNativeActionItem(item: Record<string, unknown>): string {
  const parts = [
    typeof item.status === 'string' ? `status=${item.status}` : null,
    typeof item.exit_code === 'number' ? `exit_code=${item.exit_code}` : null,
    typeof item.command === 'string' ? `command=${truncateAgentCliContextLine(item.command, 400)}` : null,
    typeof item.query === 'string' ? `query=${truncateAgentCliContextLine(item.query, 400)}` : null,
    typeof item.url === 'string' ? `url=${truncateAgentCliContextLine(item.url, 400)}` : null,
    typeof item.aggregated_output === 'string' && item.aggregated_output.trim()
      ? `output=${truncateAgentCliContextLine(item.aggregated_output.trim(), 900)}`
      : null,
  ].filter((part): part is string => part !== null);
  return parts.join('\n');
}

function humanizeAgentCliEventKind(kind: string): string | null {
  if (!kind) return null;
  return kind
    .replace(/[_:.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTaskDecompositionPromptInstructions(prompt: string): string | null {
  if (!isTaskDecompositionRequest(prompt)) return null;
  return [
    'This is a Taskplane task-decomposition request, not a repository inspection request.',
    'Do not run shell commands unless the user explicitly asks to inspect code or files.',
    'Return concise Chinese output for the user, then include one machine-readable JSON block.',
    'The plan should contain 3-6 large-grained subtasks/phases. Avoid tiny implementation chores.',
    'Each subtask must have: title, summary, acceptanceCriteria, dependency.',
    'If one key product boundary is missing, still propose a sensible draft and put the question in nextStep.',
    'End with exactly one fenced JSON block using this Taskplane Write Intent shape:',
    '```json',
    '{"type":"TASKPLANE_WRITE_INTENTS","intents":[{"type":"subtask.propose","subtasks":[{"title":"...","summary":"...","acceptanceCriteria":"...","dependency":"..."}],"review":"...","nextStep":"..."}]}',
    '```',
  ].join('\n');
}

function buildChildTaskAdvancePromptInstructions(prompt: string): string | null {
  if (!isChildTaskAdvancementRequest(prompt)) return null;
  return [
    'This is a Taskplane child-task advancement request, not a decomposition request and not a parent-task review.',
    'Focus on the current child task title, summary, and user request.',
    'Do not create a subtask.propose write-intent block.',
    'Do not keep the task in clarification mode when the user has already supplied a concrete direction.',
    'If the user only says to start or advance the child task, use the task title and summary to propose a reasonable first move; ask for their initial idea only when the task state is too empty to advance usefully.',
    'If the user gives a concrete idea, establish a reasonable default and move the task forward with a first-pass boundary, useful research/action step, or draft artifact.',
    'For website, product, document, or tutorial tasks, theme/product + target audience + content shape/use case is enough to advance. Do not ask secondary choices such as private vs public use, directory vs learning path, or which display style before drafting.',
    'When external knowledge would materially improve the answer, use available research/search/browse tools if the runtime exposes them. If no live web tool is available, state the research need as the next action instead of inventing sources or asking the user to choose structure.',
    'Ask only when the missing information blocks the next action, changes a key risk, or materially changes the deliverable boundary. Ordinary product tradeoffs should be written as adjustable defaults.',
    'If context is sufficient, briefly say so only when useful, then move into the first-pass scope, research, draft, or execution path.',
    'For a tutorial/website scope task with enough intent, return a concise first-pass goal, scope, non-goals, and next research or build action.',
    'Do not use English section headings such as Key Findings, Recommended Next Step, Risks, or Verification Checks.',
    'Only inspect the workspace when the user explicitly asks for code, files, repository state, or local verification.',
  ].join('\n');
}

function isTaskDecompositionRequest(prompt: string): boolean {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  return /拆解|拆分|拆成|分解|任务方案|子任务方案|子任务草案|生成.{0,12}子任务|创建.{0,12}子任务|规划.{0,12}子任务|decompos|break\s*down|split.{0,24}(task|subtask)|subtask.{0,16}(plan|draft|breakdown)/i.test(normalized);
}

function isChildTaskAdvancementRequest(prompt: string): boolean {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  return /推进子任务|正在推进子任务|当前子任务|开始.{0,8}子任务|确认这个子任务|current child task|advance.{0,16}child task/i.test(normalized);
}

export function executeAgentCliCommand(params: Parameters<AgentCliExecutor>[0]): Promise<AgentCliExecutionResult> {
  return new Promise((resolve) => {
    const child = spawn(params.command, params.args, {
      cwd: params.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let settled = false;
    let stdout = '';
    let stderr = '';
    let stdoutLineBuffer = '';
    let terminalOverride: AgentCliExecutionResult | null = null;
    let terminationTimer: ReturnType<typeof setTimeout> | null = null;
    const append = (current: string, chunk: Buffer) =>
      (current + chunk.toString('utf8')).slice(-params.outputLimitBytes);
    const finish = (result: AgentCliExecutionResult) => {
      if (settled) return;
      settled = true;
      flushStdoutLineBuffer();
      clearTimeout(timer);
      if (terminationTimer) clearTimeout(terminationTimer);
      params.signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const emitStdoutLine = (line: string) => {
      if (!params.onStdoutLine) return;
      void Promise.resolve(params.onStdoutLine(line)).catch(() => undefined);
    };
    const appendStdoutLines = (text: string) => {
      stdoutLineBuffer += text;
      const lines = stdoutLineBuffer.split(/\r?\n/);
      stdoutLineBuffer = lines.pop() ?? '';
      for (const line of lines) emitStdoutLine(line);
    };
    const flushStdoutLineBuffer = () => {
      if (!stdoutLineBuffer.trim()) return;
      emitStdoutLine(stdoutLineBuffer);
      stdoutLineBuffer = '';
    };
    const cancellationReason = () =>
      typeof params.signal?.reason === 'string'
        ? params.signal.reason
        : 'Operator cancelled the Agent CLI run.';
    const onAbort = () => {
      terminalOverride = {
        exitCode: null,
        failureReason: cancellationReason(),
        status: 'failed',
        stderr,
        stdout,
        summary: 'Agent CLI execution cancelled.',
      };
      child.kill('SIGTERM');
      terminationTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, AGENT_CLI_TERMINATION_GRACE_MS);
    };
    const timer = setTimeout(() => {
      terminalOverride = {
        exitCode: null,
        failureReason: `Agent CLI execution timed out after ${params.timeoutMs}ms.`,
        status: 'failed',
        stderr,
        stdout,
        summary: 'Agent CLI execution timed out.',
      };
      child.kill('SIGTERM');
      terminationTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, AGENT_CLI_TERMINATION_GRACE_MS);
    }, params.timeoutMs);
    if (params.signal?.aborted) {
      onAbort();
      return;
    }
    params.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = append(stdout, chunk);
      appendStdoutLines(chunk.toString('utf8'));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.on('error', (error) => {
      finish({
        exitCode: null,
        failureReason: error.message,
        status: 'failed',
        stderr,
        stdout,
        summary: `Agent CLI execution failed: ${error.message}`,
      });
    });
    child.on('close', (exitCode) => {
      if (terminalOverride) {
        finish({
          ...terminalOverride,
          stderr,
          stdout: stdout.trim(),
        });
        return;
      }
      const status = exitCode === 0 ? 'completed' : 'failed';
      finish({
        exitCode,
        failureReason: status === 'completed' ? null : firstNonEmptyLine(stderr) ?? `Agent CLI exited with code ${exitCode ?? 'unknown'}.`,
        status,
        stderr,
        stdout: stdout.trim(),
        summary: status === 'completed' ? 'Agent CLI execution completed.' : 'Agent CLI execution failed.',
      });
    });
    child.stdin.end(params.input);
  });
}

function firstNonEmptyLine(value: string): string | null {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}
