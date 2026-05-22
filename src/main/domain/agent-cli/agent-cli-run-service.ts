import { spawn } from 'node:child_process';
import fs from 'node:fs';

import { evaluateRuntimeAction } from '../../../shared/runtime-action-evaluator.js';
import { evaluateRuntimeContextAssemblyGate } from '../../../shared/runtime-context-assembly-gate.js';
import {
  buildRuntimeContextAssemblyPolicy,
  buildRuntimeContextManifest,
  formatRuntimeContextManifestForStep,
  type RuntimeContextManifest,
} from '../../../shared/runtime-context.js';
import {
  buildRunGoalContract,
  formatRunGoalContractForPrompt,
  formatRunGoalContractForStep,
  type RunGoalContract,
} from '../../../shared/agent-runtime-goal.js';
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
import type { AgentCliRuntimeId } from '../../../shared/agent-cli-runtime-status.js';
import type {
  CancelAgentCliRunInput,
  CancelAgentCliRunResult,
  AgentCliRunSandboxMode,
  CreateAgentCliRunInput,
  RecordRuntimeNativeGoalRequestInput,
  RunOutputSource,
  RunRecord,
  RunStatus,
} from '../../../shared/types/run.js';
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

const DEFAULT_AGENT_CLI_TIMEOUT_MS = 120_000;
const DEFAULT_AGENT_CLI_OUTPUT_LIMIT_BYTES = 64_000;
const AGENT_CLI_TERMINATION_GRACE_MS = 1_500;

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
    const payload = {
      forwarded: request.forwarded,
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
        'Taskplane kept this as audit evidence; no CLI command was executed.',
      ].join('\n'),
    });
    const updated = await this.updateRunResult(
      run.id,
      'completed',
      `Runtime-native goal request recorded without forwarding. Runtime: ${request.runtimeLabel}. Objective: ${request.objective}. Reason: ${request.reason}`,
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
        hasNextStep: Boolean(task.nextStep?.trim() || task.resumeCard?.nextSuggestedMove?.trim() || request.prompt.trim()),
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
    task = await this.prepareWebResearchSourceContext({
      capabilityMode,
      prompt: request.prompt,
      task,
    });
    const taskFilesForContext = buildAgentCliTaskFilesForContext(task);
    const contextManifest = buildRuntimeContextManifest({
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

    const sandboxMode = request.sandboxMode ?? 'read-only';
    const workspaceRoot = aiStatus.workspaceRoot?.trim() || aiStatus.suggestedWorkspaceRoot?.trim();
    if (!workspaceRoot) {
      throw new Error('Agent CLI run requires an available runtime workspace.');
    }
    if (!fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
      throw new Error(`Agent CLI workspace root is not a readable directory: ${workspaceRoot}`);
    }
    const run = await this.runRepository.create({
      taskId: task.id,
      type: 'agent',
      instructions: `Agent CLI (${runtime.label}) ${sandboxMode}: ${request.prompt}`,
    });
    const runContract = buildRunGoalContract({
      contextGateSummary: contextGate.summary,
      contextManifest,
      executionKind: 'cli',
      prompt: request.prompt,
      runId: run.id,
      runtimeId,
      runtimeLabel: adapter.runtimeLabel,
      sandboxMode,
      task,
    });

    await this.runStepRepository.create({
      runId: run.id,
      kind: 'plan',
      status: 'completed',
      title: 'agent cli run accepted',
      input: request.prompt,
      output: [
        `runtime=${runtime.id}`,
        `sandbox=${sandboxMode}`,
        pendingMemoryWarning ? `pending_memory_warning=${pendingMemoryWarning}` : null,
        `capability_mode=${capabilityMode}`,
        contextGate.summary,
        formatRuntimeContextManifestForStep(contextManifest),
      ].filter((line): line is string => line !== null).join('\n'),
    });
    await this.runStepRepository.create({
      runId: run.id,
      kind: 'plan',
      status: 'completed',
      title: 'Agent CLI 目标契约',
      input: JSON.stringify(runContract, null, 2),
      output: formatRunGoalContractForStep(runContract),
    });

    const execution = adapter.buildExecution({
      capabilityMode,
      contextSummary: buildAgentCliContextBridge({
        capabilityMode,
        contract: runContract,
        manifest: contextManifest,
        task,
        taskFilesForContext,
      }),
      prompt: request.prompt,
      sandboxMode,
      task,
      workspaceRoot,
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

    return run;
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
    task: TaskDetail;
  }): Promise<TaskDetail> {
    if (params.capabilityMode !== 'audit_enhanced') {
      return params.task;
    }
    if (!shouldPrepareWebResearch(params.task, params.prompt)) {
      return params.task;
    }
    if (!this.taskService.createSourceContext || !this.aiConfigService.resolveOpenAiWebResearchConfig) {
      return params.task;
    }

    let config: Awaited<ReturnType<NonNullable<AgentCliAiConfigService['resolveOpenAiWebResearchConfig']>>>;
    try {
      config = await this.aiConfigService.resolveOpenAiWebResearchConfig();
    } catch {
      return params.task;
    }

    const query = buildWebResearchQuery(params.task, params.prompt);
    const research = await runOpenAiWebResearch({
      apiKey: config.apiKey,
      model: config.model,
      query,
    }).catch(() => null);
    if (!research?.sources.length && !research?.summary.trim()) {
      return params.task;
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
    for (const input of createdInputs) {
      await this.taskService.createSourceContext(input).catch(() => null);
    }

    return await this.taskService.getDetail(params.task.id).catch(() => params.task) ?? params.task;
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
    const execution = await this.executeWithFailureCapture({
      args: params.runArgs,
      command: params.runtimeCommand,
      cwd: params.workspaceRoot,
      input: params.input,
      outputLimitBytes: DEFAULT_AGENT_CLI_OUTPUT_LIMIT_BYTES,
      signal: params.abortController.signal,
      timeoutMs: DEFAULT_AGENT_CLI_TIMEOUT_MS,
    }).finally(() => {
      params.workloadLease.finish();
    });

    try {
      await this.runStepRepository.create({
        runId: params.run.id,
        kind: 'model',
        status: execution.status,
        title: execution.status === 'completed' ? params.runAdapter.completedStepTitle : params.runAdapter.failedStepTitle,
        input: [
          params.commandPreview,
          `exitCode=${execution.exitCode ?? 'unknown'}`,
        ].join('\n'),
        output: execution.stdout || execution.summary,
        error: execution.failureReason,
      });
      const verificationStep = buildAgentCliGoalVerificationStep({
        contract: params.runContract,
        execution,
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
                output: execution.stdout,
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
        execution.stdout || execution.summary,
        execution.status === 'completed' ? 'ai' : 'system',
        execution.failureReason,
      );

      if (execution.status === 'completed') {
        await this.taskService.annotateRunCompleted(
          params.task.id,
          'agent',
          Boolean(execution.stdout.trim()),
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

function normalizeAgentCliRunInput(input: CreateAgentCliRunInput): Required<CreateAgentCliRunInput> {
  const rawSandboxMode = (input as { sandboxMode?: unknown }).sandboxMode;
  if (rawSandboxMode !== undefined && rawSandboxMode !== 'read-only') {
    throw new Error('Agent CLI workspace-write mode is not enabled in this version.');
  }
  return {
    operatorConfirmed: input.operatorConfirmed === true,
    prompt: input.prompt?.trim() ?? '',
    runtimeId: input.runtimeId ?? 'codex',
    sandboxMode: 'read-only',
    taskId: input.taskId?.trim() ?? '',
  };
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
      args: ['exec', '--sandbox', params.sandboxMode, '--cd', params.workspaceRoot, '--skip-git-repo-check', '-'],
      commandPreview: `codex exec --sandbox ${params.sandboxMode} --cd ${params.workspaceRoot} -`,
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
      args: ['-p', '--permission-mode', 'plan', '--output-format', 'text'],
      commandPreview: `claude -p --permission-mode plan --output-format text`,
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
  capabilityMode: AgentCliCapabilityMode;
  contract: RunGoalContract;
  manifest: RuntimeContextManifest;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function shouldPrepareWebResearch(task: TaskDetail, prompt: string): boolean {
  const text = `${task.title}\n${task.summary ?? ''}\n${task.nextStep ?? ''}\n${prompt}`;
  if (/不要联网|不要搜索|不需要调研|skip\s+(web|search|research)|no\s+(web|search|research)/i.test(text)) {
    return false;
  }
  return /网站|教程|文档|资料|调研|案例|官方文档|竞品|产品规划|市场|当前|最新|Codex|Agent\s*初学者|web\s*research|search|browse|documentation/i.test(text);
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
  const childTaskInstructions = buildChildTaskAdvancePromptInstructions(params.prompt);
  return [
    'You are running as Codex CLI from inside Taskplane.',
    `Sandbox mode: ${params.sandboxMode}.`,
    'Do not modify files.',
    buildAgentCliCapabilityPromptInstruction(params.capabilityMode, 'Codex CLI'),
    decompositionInstructions ?? childTaskInstructions ?? 'Answer with a concrete plan, risks, and verification steps. Only inspect the workspace when the user explicitly asks for code, files, repository state, or local verification.',
    '',
    `Task: ${params.task.title}`,
    params.task.summary ? `Summary: ${params.task.summary}` : null,
    params.task.nextStep ? `Next step: ${params.task.nextStep}` : null,
    params.task.riskNote ? `Risk: ${params.task.riskNote}` : null,
    `Runtime context: ${params.contextSummary}`,
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
  const childTaskInstructions = buildChildTaskAdvancePromptInstructions(params.prompt);
  return [
    'You are running as Claude Code from inside Taskplane.',
    `Taskplane sandbox intent: ${params.sandboxMode}.`,
    'Claude Code is launched with --permission-mode plan. Research and propose; do not edit files, write files, or ask to continue into an editing mode.',
    buildAgentCliCapabilityPromptInstruction(params.capabilityMode, 'Claude Code'),
    decompositionInstructions ?? childTaskInstructions ?? 'Return a concise answer with findings, recommended next steps, risks, and verification checks. Only inspect the workspace when the user explicitly asks for code, files, repository state, or local verification.',
    '',
    `Task: ${params.task.title}`,
    params.task.summary ? `Summary: ${params.task.summary}` : null,
    params.task.nextStep ? `Next step: ${params.task.nextStep}` : null,
    params.task.riskNote ? `Risk: ${params.task.riskNote}` : null,
    `Runtime context: ${params.contextSummary}`,
    '',
    'User request:',
    params.prompt,
  ].filter((line): line is string => line !== null).join('\n');
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

function buildTaskDecompositionPromptInstructions(prompt: string): string | null {
  if (!isTaskDecompositionRequest(prompt)) return null;
  return [
    'This is a Taskplane task-decomposition request, not a repository inspection request.',
    'Do not run shell commands unless the user explicitly asks to inspect code or files.',
    'Return concise Chinese output for the user, then include one machine-readable JSON block.',
    'The plan should contain 3-6 large-grained subtasks/phases. Avoid tiny implementation chores.',
    'Each subtask must have: title, summary, acceptanceCriteria, dependency.',
    'If one key product boundary is missing, still propose a sensible draft and put the question in nextStep.',
    'End with exactly one fenced JSON block using this shape:',
    '```json',
    '{"type":"TASKPLANE_DECOMPOSITION","subtasks":[{"title":"...","summary":"...","acceptanceCriteria":"...","dependency":"..."}],"review":"...","nextStep":"..."}',
    '```',
  ].join('\n');
}

function buildChildTaskAdvancePromptInstructions(prompt: string): string | null {
  if (!isChildTaskAdvancementRequest(prompt)) return null;
  return [
    'This is a Taskplane child-task advancement request, not a decomposition request and not a parent-task review.',
    'Focus on the current child task title, summary, and user request.',
    'Do not create a TASKPLANE_DECOMPOSITION JSON block.',
    'Do not keep the task in clarification mode when the user has already supplied a concrete direction.',
    'If the user only says to start or advance the child task, use the task title and summary to propose a reasonable first move; ask for their initial idea only when the task state is too empty to advance usefully.',
    'If the user gives a concrete idea, establish a reasonable default and move the task forward with a first-pass boundary, useful research/action step, or draft artifact.',
    'For website, product, document, or tutorial tasks, theme/product + target audience + content shape/use case is enough to advance. Do not ask secondary choices such as private vs public use, directory vs learning path, or which display style before drafting.',
    'When external knowledge would materially improve the answer, use available research/search/browse tools if the runtime exposes them. If no live web tool is available, state the research need as the next action instead of inventing sources or asking the user to choose structure.',
    'Ask only when the missing information blocks the next action, changes a key risk, or materially changes the deliverable boundary. Ordinary product tradeoffs should be written as adjustable defaults.',
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
    let terminalOverride: AgentCliExecutionResult | null = null;
    let terminationTimer: ReturnType<typeof setTimeout> | null = null;
    const append = (current: string, chunk: Buffer) =>
      (current + chunk.toString('utf8')).slice(-params.outputLimitBytes);
    const finish = (result: AgentCliExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (terminationTimer) clearTimeout(terminationTimer);
      params.signal?.removeEventListener('abort', onAbort);
      resolve(result);
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
