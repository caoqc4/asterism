import { spawn } from 'node:child_process';

import { evaluateRuntimeAction } from '../../../shared/runtime-action-evaluator.js';
import { evaluateRuntimeContextAssemblyGate } from '../../../shared/runtime-context-assembly-gate.js';
import {
  buildRuntimeContextAssemblyPolicy,
  buildRuntimeContextManifest,
} from '../../../shared/runtime-context.js';
import { evaluateRuntimeVerification } from '../../../shared/runtime-verification.js';
import { buildTaskMemoryCoverageInputForTask, evaluateTaskMemoryCoverage } from '../../../shared/task-memory-coverage.js';
import {
  buildTaskMemoryGuidanceStateForTaskFiles,
  type TaskMemoryGuidanceState,
} from '../../../shared/task-memory-guidance-state.js';
import type { AgentCliRuntimeId } from '../../../shared/agent-cli-runtime-status.js';
import type {
  AgentCliRunSandboxMode,
  CreateAgentCliRunInput,
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
  timeoutMs: number;
}) => Promise<AgentCliExecutionResult>;

const DEFAULT_AGENT_CLI_TIMEOUT_MS = 120_000;
const DEFAULT_AGENT_CLI_OUTPUT_LIMIT_BYTES = 64_000;

export class AgentCliRunService {
  constructor(
    private readonly taskService: Pick<TaskService, 'annotateRunCompleted' | 'annotateRunFailed' | 'getDetail'>,
    private readonly aiConfigService: Pick<AiConfigService, 'getStatus'>,
    private readonly runRepository: Pick<RunRepository, 'create' | 'updateResult'>,
    private readonly runStepRepository: Pick<RunStepRepository, 'create' | 'listForRun' | 'listForTask'>,
    private readonly executor: AgentCliExecutor = executeAgentCliCommand,
    private readonly runVerificationRepository: Pick<RunVerificationRepository, 'upsert'> | null = null,
  ) {}

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
    if (runtimeId !== 'codex') {
      throw new Error('Only Codex CLI execution is supported in this version.');
    }

    const aiStatus = await this.aiConfigService.getStatus();
    const runtime = aiStatus.agentCliRuntimeStatus?.runtimes.find((item) => item.id === runtimeId) ?? null;
    if (!runtime?.installed || runtime.executionSupport !== 'manual_run') {
      throw new Error('Codex CLI is not detected on PATH or is not enabled for manual runs.');
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
    const workspaceRoot = aiStatus.workspaceRoot?.trim() || process.cwd();
    const run = await this.runRepository.create({
      taskId: task.id,
      type: 'agent',
      instructions: `Agent CLI (${runtime.label}) ${sandboxMode}: ${request.prompt}`,
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

    const prompt = buildCodexCliPrompt({
      contextSummary: contextManifest.userFacingSummary,
      prompt: request.prompt,
      sandboxMode,
      task,
    });
    const execution = await this.executor({
      args: ['exec', '--sandbox', sandboxMode, '--cd', workspaceRoot, '--skip-git-repo-check', '-'],
      command: runtime.command,
      cwd: workspaceRoot,
      input: prompt,
      outputLimitBytes: DEFAULT_AGENT_CLI_OUTPUT_LIMIT_BYTES,
      timeoutMs: DEFAULT_AGENT_CLI_TIMEOUT_MS,
    });

    await this.runStepRepository.create({
      runId: run.id,
      kind: 'model',
      status: execution.status,
      title: execution.status === 'completed' ? 'codex cli completed' : 'codex cli failed',
      input: [
        `codex exec --sandbox ${sandboxMode} --cd ${workspaceRoot} -`,
        `exitCode=${execution.exitCode ?? 'unknown'}`,
      ].join('\n'),
      output: execution.stdout || execution.summary,
      error: execution.failureReason,
    });

    const updated = await this.updateRunResult(
      run.id,
      execution.status,
      execution.stdout || execution.summary,
      execution.status === 'completed' ? 'ai' : 'system',
      execution.failureReason,
    );

    if (execution.status === 'completed') {
      await this.taskService.annotateRunCompleted(task.id, 'agent', Boolean(execution.stdout.trim()), updated.id);
      return updated;
    }

    await this.taskService.annotateRunFailed(task.id, execution.failureReason ?? execution.summary, updated.id);
    return updated;
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

function executeAgentCliCommand(params: Parameters<AgentCliExecutor>[0]): Promise<AgentCliExecutionResult> {
  return new Promise((resolve) => {
    const child = spawn(params.command, params.args, {
      cwd: params.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let settled = false;
    let stdout = '';
    let stderr = '';
    const append = (current: string, chunk: Buffer) =>
      (current + chunk.toString('utf8')).slice(-params.outputLimitBytes);
    const finish = (result: AgentCliExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({
        exitCode: null,
        failureReason: `Agent CLI execution timed out after ${params.timeoutMs}ms.`,
        status: 'failed',
        stderr,
        stdout,
        summary: 'Agent CLI execution timed out.',
      });
    }, params.timeoutMs);

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
