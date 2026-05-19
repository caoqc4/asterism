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
import { buildTaskMemoryCoverageInputForTask, evaluateTaskMemoryCoverage } from '../../../shared/task-memory-coverage.js';
import {
  buildTaskMemoryGuidanceStateForTaskFiles,
  type TaskMemoryGuidanceState,
} from '../../../shared/task-memory-guidance-state.js';
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

type AgentCliRunAdapter = {
  acceptedLabel: string;
  buildExecution(params: {
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
    private readonly taskService: Pick<TaskService, 'annotateRunCompleted' | 'annotateRunFailed' | 'getDetail'>,
    private readonly aiConfigService: Pick<AiConfigService, 'getStatus'>,
    private readonly runRepository: Pick<RunRepository, 'create' | 'updateResult'>,
    private readonly runStepRepository: Pick<RunStepRepository, 'create' | 'listForRun' | 'listForTask'>,
    private readonly executor: AgentCliExecutor = executeAgentCliCommand,
    private readonly runVerificationRepository: Pick<RunVerificationRepository, 'upsert'> | null = null,
    private readonly workloadTracker: AgentCliRuntimeWorkloadTracker = agentCliRuntimeWorkloadTracker,
    private readonly onTerminalRun: AgentCliRunTerminalListener | null = null,
  ) {}

  async recordNativeGoalRequest(input: RecordRuntimeNativeGoalRequestInput): Promise<RunRecord> {
    const request = normalizeRuntimeNativeGoalRequestInput(input);
    const task = await this.taskService.getDetail(request.taskId);
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
    const task = await this.taskService.getDetail(request.taskId);
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
    if (!preStepVerification.canProceed) {
      throw new Error(preStepVerification.detail);
    }

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
      taskFiles: task.taskFiles ?? [],
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
        contextGate.summary,
        contextManifest.summary,
      ].join(' / '),
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
      contextSummary: buildAgentCliContextBridge({
        contract: runContract,
        manifest: contextManifest,
        task,
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
      if (verificationStep.verification.shouldProposeTaskMemory) {
        await this.runStepRepository.create({
          runId: params.run.id,
          kind: 'plan',
          status: 'completed',
          title: '任务记忆建议',
          input: JSON.stringify({
            decision: verificationStep.verification.decision,
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
                task: params.task,
                verification: verificationStep.verification,
              }),
            },
          }),
          output: [
            '- Task Record may be useful: Agent CLI output should be reviewed and confirmed into task memory.',
            `- Verifier decision: ${verificationStep.verification.decision}`,
            `- Next action: ${verificationStep.verification.nextAction}`,
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
        await this.taskService.annotateRunFailed(params.task.id, message, failed.id).catch(() => undefined);
        await this.notifyTerminalRun(failed).catch(() => undefined);
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

function normalizeRuntimeNativeGoalRequestInput(
  input: RecordRuntimeNativeGoalRequestInput,
): RecordRuntimeNativeGoalRequestInput {
  return {
    forwarded: false,
    objective: input.objective?.trim() ?? '',
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
  contract: RunGoalContract;
  manifest: RuntimeContextManifest;
  task: TaskDetail;
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

  return [
    'Taskplane run contract:',
    formatRunGoalContractForPrompt(params.contract),
    '',
    params.manifest.userFacingSummary,
    '',
    'Runtime context manifest:',
    formatRuntimeContextManifestForStep(params.manifest),
    sourcePreviews.length ? '' : null,
    sourcePreviews.length ? 'Confirmed source previews:' : null,
    ...sourcePreviews,
    '',
    'Capability bridge policy:',
    '- External Access, Skills, and MCP entries are context-only unless Taskplane exposes explicit tools in this run.',
    '- Do not claim live connector/tool access from these summaries; use them to understand available context and safety boundaries.',
  ].filter((line): line is string => line !== null).join('\n');
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
  return {
    status: params.execution.status === 'failed' ? 'failed' : 'completed',
    input: JSON.stringify({
      canMarkTaskComplete: verification.canMarkTaskComplete,
      decision: verification.decision,
      evaluator: verification.evaluator,
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

function buildAgentCliTaskRecordSuggestion(params: {
  output: string;
  runId: string;
  runtimeLabel: string;
  task: TaskDetail;
  verification: AgentRuntimeVerifierResult;
}): string {
  return [
    '## Summary',
    truncateAgentCliMemoryLine(params.output),
    '',
    '## Confirmed',
    `- ${params.runtimeLabel} completed a read-only task inspection.`,
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
  contextSummary: string;
  prompt: string;
  sandboxMode: AgentCliRunSandboxMode;
  task: TaskDetail;
}): string {
  return [
    'You are running as Codex CLI from inside Taskplane.',
    `Sandbox mode: ${params.sandboxMode}.`,
    'Do not modify files. Inspect and answer with a concrete plan, risks, and verification steps.',
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
  contextSummary: string;
  prompt: string;
  sandboxMode: AgentCliRunSandboxMode;
  task: TaskDetail;
}): string {
  return [
    'You are running as Claude Code from inside Taskplane.',
    `Taskplane sandbox intent: ${params.sandboxMode}.`,
    'Claude Code is launched with --permission-mode plan. Research and propose; do not edit files, write files, or ask to continue into an editing mode.',
    'Return a concise answer with findings, recommended next steps, risks, and verification checks.',
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
