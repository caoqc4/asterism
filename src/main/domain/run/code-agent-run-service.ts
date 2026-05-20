import type { AgentSandboxCheckResult } from '../../../shared/agent-sandbox-provider.js';
import { buildCodeAgentOrchestrationRequest } from '../../../shared/agent-orchestration.js';
import {
  buildAgentSandboxPatchArtifactFromCheckResults,
  buildAgentSandboxPatchPromotionCheckpoint,
  summarizeAgentSandboxCheckResults,
} from '../../../shared/agent-sandbox-provider.js';
import {
  buildCodeAgentProviderVisibleContextManifest,
  formatCodeAgentProviderVisibleContextManifestForStep,
} from '../../../shared/code-agent-model-context.js';
import { evaluateRuntimeAction } from '../../../shared/runtime-action-evaluator.js';
import { buildRuntimeCapabilitySnapshot } from '../../../shared/runtime-capability-snapshot.js';
import { evaluateRuntimeVerification } from '../../../shared/runtime-verification.js';
import { buildTaskMemoryCoverageInputForTask, evaluateTaskMemoryCoverage } from '../../../shared/task-memory-coverage.js';
import {
  buildTaskMemoryGuidanceStateForTaskFiles,
  type TaskMemoryGuidanceState,
} from '../../../shared/task-memory-guidance-state.js';
import {
  buildRuntimeContextAssemblyPolicy,
  buildRuntimeContextManifest,
  formatRuntimeContextManifestForStep,
} from '../../../shared/runtime-context.js';
import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type {
  CreateCodeAgentRunInput,
  CodeAgentAllowedCheck,
  RunOutputSource,
  RunRecord,
  RunStatus,
} from '../../../shared/types/run.js';
import type { AiConfigStatus } from '../../../shared/types/settings.js';
import type { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import type { DecisionRepository } from '../../db/repositories/decision-repository.js';
import type { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
import type { RunRepository } from '../../db/repositories/run-repository.js';
import type { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import type { RunVerificationRepository } from '../../db/repositories/run-verification-repository.js';
import type { SandboxPatchPromotionRepository } from '../../db/repositories/sandbox-patch-promotion-repository.js';
import type { AiConfigService } from '../../keychain/ai-config-service.js';
import { readEnvBoolean, readEnvValue } from '../../config/env.js';
import { AgentCheckpointRecorder } from './agent-checkpoint-recorder.js';
import {
  normalizeCodeAgentStagedFilePlanPayload,
  writeCodeAgentStagedFilePlan,
} from './code-agent-staged-file-plan.js';
import { prepareCodeAgentModelProducerRuntime } from './code-agent-model-producer-runtime.js';
import { collectCodeAgentWorkspaceContext } from './code-agent-workspace-context.js';
import { collectCodeAgentSourceContext } from './code-agent-source-context.js';
import type { LocalContainerSandboxPatchReviewPreparation } from './local-container-sandbox-backend.js';
import { LocalContainerSandboxedCodingProducerExecutionService } from './local-container-sandboxed-coding-producer-execution-service.js';
import { persistTerminalRunVerifications } from './run-verification-service.js';
import type { LocalContainerSandboxedCodingProducerLoop } from './local-container-sandboxed-coding-producer-runner.js';
import { SandboxPatchReviewPersister } from './sandbox-patch-review-persister.js';
import type {
  PreviewSandboxedCodingInjectedProducerRunResult,
  SandboxedCodingProducerEvent,
} from './sandboxed-coding-producer.js';
import type { TaskService } from '../task/task-service.js';
import type { SourceContextRecord } from '../../../shared/types/source-context.js';

const DEFAULT_CODE_AGENT_PREVIEW_FILE = '.taskplane/code-agent-preview.md';
const ENABLE_CODE_AGENT_MODEL_PRODUCER_ENV = 'TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER';
const CODE_AGENT_CONTEXT_FILES_ENV = 'TASKPLANE_CODE_AGENT_CONTEXT_FILES';

type CodeAgentRunExecutionService = Pick<LocalContainerSandboxedCodingProducerExecutionService, 'run'>;

export class CodeAgentRunService {
  constructor(
    private readonly taskService: Pick<TaskService, 'getDetail'>,
    private readonly aiConfigService: Pick<AiConfigService, 'getStatus' | 'resolveRuntimeConfig'>,
    private readonly runRepository: Pick<RunRepository, 'create' | 'updateResult'>,
    private readonly runStepRepository: RunStepRepository,
    private readonly artifactRepository: Pick<ArtifactRepository, 'createPatchFromRun'>,
    private readonly runCheckpointRepository: RunCheckpointRepository,
    private readonly decisionRepository: Pick<DecisionRepository, 'create'>,
    private readonly sandboxPatchPromotionRepository: Pick<SandboxPatchPromotionRepository, 'createPending'>,
    private readonly createExecutionService: () => CodeAgentRunExecutionService = () =>
      new LocalContainerSandboxedCodingProducerExecutionService(),
    private readonly runVerificationRepository: Pick<RunVerificationRepository, 'upsert'> | null = null,
  ) {}

  async trigger(input: CreateCodeAgentRunInput): Promise<RunRecord> {
    const task = await this.taskService.getDetail(input.taskId);

    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
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

    const actionEvaluation = evaluateRuntimeAction({
      action: 'run_start',
      fromTaskId: task.id,
      targetTaskId: task.id,
    });
    const aiStatus = await this.aiConfigService.getStatus();
    const taskMemoryGuidance = await this.buildTaskMemoryGuidanceForTask(task);
    const preStepVerification = evaluateRuntimeVerification({
      mode: 'pre_step',
      action: actionEvaluation,
      capabilities: buildRuntimeCapabilitySnapshot({ aiStatus }),
      taskMemoryCoverage: evaluateTaskMemoryCoverage(buildTaskMemoryCoverageInputForTask('run_start', task, {
        hasNextStep: Boolean(task.nextStep?.trim() || task.resumeCard?.nextSuggestedMove?.trim() || input.patchIntent?.trim()),
      })),
      taskMemoryGuidance,
      requiresModelExecution: input.useModelProducer === true,
      requiresWorkspaceVerification: true,
    });
    if (!preStepVerification.canProceed) {
      throw new Error(preStepVerification.detail);
    }

    const workspaceRoot = aiStatus.workspaceRoot?.trim();
    const requestedChecks = normalizeCodeAgentChecks(
      input.requestedChecks,
      aiStatus.codeAgentWorkspaceChecks,
    );

    if (!requestedChecks.length) {
      throw new Error('Code Agent run requires at least one available package.json test/lint script.');
    }

    const patchIntent = input.patchIntent.trim() || `Prepare a staged patch for ${task.title}.`;
    const modelProducerAvailable = readEnvBoolean(ENABLE_CODE_AGENT_MODEL_PRODUCER_ENV) === true;
    const modelProducerRequested = input.useModelProducer === true;
    const modelProducerOptIn = modelProducerAvailable && modelProducerRequested;
    const orchestrationRequest = buildCodeAgentOrchestrationRequest({
      ...input,
      patchIntent,
      requestedChecks,
    });
    const run = await this.runRepository.create({
      taskId: task.id,
      type: 'agent',
      instructions: [
        'Code Agent manual sandbox producer preview.',
        patchIntent,
        modelProducerRequested
          ? 'Model producer loop is explicitly requested for this run and remains sandbox/Decision gated.'
          : 'Model producer loop is not requested for this run; this run records a staged local preview only.',
      ].join(' '),
    });
    const request = {
      commandPolicy: {
        allowedScripts: requestedChecks,
        outputLimitBytes: 64_000,
        timeoutMs: 120_000,
      },
      executionPolicy: {
        network: 'disabled',
        noCredentialPassthrough: true,
        promotion: 'decision_required',
      },
      intent: {
        completionCriteria: task.completionCriteria.length
          ? task.completionCriteria.map((item) => item.text)
          : ['Patch is reviewable before workspace mutation.'],
        instructions: patchIntent,
        taskTitle: task.title,
      },
      modelPolicy: {
        providerKind: aiStatus.provider ?? 'openai-compatible',
        toolExposure: 'sandboxed_coding_producer',
      },
      runId: run.id,
      sourceId: `sandbox_source_${run.id}`,
      taskId: task.id,
      workspaceRoot: workspaceRoot ?? '',
    };

    await this.runStepRepository.create({
      runId: run.id,
      kind: 'plan',
      status: 'completed',
      title: 'manual code-agent run accepted',
      input: patchIntent,
      output: [
        'descriptor=workspace.staged_patch',
        `producer=${modelProducerRequested ? 'model_backed_requested' : 'local_diagnostic'}`,
        `providerCall=${modelProducerRequested ? 'explicit_user_opt_in_required' : 'disabled'}`,
        `checks=${requestedChecks.join(',')}`,
        orchestrationRequest.summary,
      ].join(' / '),
    });

    const selectedContextFiles = readSelectedCodeAgentContextFiles(input);
    const selectedArtifacts = selectCodeAgentArtifacts(input, task.artifacts);
    const selectedSourceContexts = selectCodeAgentSourceContexts(input, task.sourceContexts);

    if (modelProducerRequested && !modelProducerAvailable) {
      return this.updateRunResult(
        run.id,
        'failed',
        'Code Agent model producer runtime blocked: TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER is not enabled.',
        'system',
        'TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER is not enabled.',
      );
    }

    if (modelProducerOptIn && !selectedContextFiles.length) {
      return this.updateRunResult(
        run.id,
        'failed',
        'Code Agent model producer runtime blocked: bounded workspace context files are required.',
        'system',
        'Model-backed Code Agent preview requires at least one selected context file.',
      );
    }

    const retainedContextManifest = modelProducerOptIn
      ? buildRuntimeContextManifest({
          currentRunId: run.id,
          sourceContexts: selectedSourceContexts.items.map((source) => ({
            ...source,
            contentPreview: source.content ? source.content.slice(0, 600) : null,
            selected: true,
          })),
          task,
          taskFiles: task.taskFiles ?? [],
        })
      : null;
    const retainedContextManifestForStep = retainedContextManifest
      ? formatRuntimeContextManifestForStep(retainedContextManifest)
      : null;

    if (modelProducerOptIn && retainedContextManifest) {
      const contextAssembly = buildRuntimeContextAssemblyPolicy({
        manifest: retainedContextManifest,
      });
      if (!contextAssembly.canExecuteTaskWork) {
        return this.updateRunResult(
          run.id,
          'failed',
          `Code Agent model producer runtime blocked: ${contextAssembly.summary}`,
          'system',
          contextAssembly.summary,
        );
      }
    }

    if (modelProducerOptIn && selectedSourceContexts.status === 'blocked') {
      return this.updateRunResult(
        run.id,
        'failed',
        selectedSourceContexts.summary,
        'system',
        selectedSourceContexts.blockedReasons.join(' '),
      );
    }

    if (modelProducerOptIn && selectedArtifacts.status === 'blocked') {
      return this.updateRunResult(
        run.id,
        'failed',
        selectedArtifacts.summary,
        'system',
        selectedArtifacts.blockedReasons.join(' '),
      );
    }

    if (input.includeArtifactContent === true) {
      return this.updateRunResult(
        run.id,
        'failed',
        'Code Agent artifact content blocked: artifact content is not accepted as provider-visible context.',
        'system',
        'Artifact content requires kind-specific policy, source-run status checks, stale-patch handling, and generated-output truth labeling before provider use.',
      );
    }

    if (input.includeSourceContextContent === true && !modelProducerOptIn) {
      return this.updateRunResult(
        run.id,
        'failed',
        'Code Agent source context content blocked: model producer opt-in is required.',
        'system',
        'Code Agent source context content requires Use model producer and enabled model producer capability.',
      );
    }

    const sourceContextContent = collectCodeAgentSourceContext({
      includeContent: modelProducerOptIn && input.includeSourceContextContent === true,
      sourceContexts: selectedSourceContexts.items,
    });

    if (modelProducerOptIn && sourceContextContent.status === 'blocked') {
      return this.updateRunResult(
        run.id,
        'failed',
        sourceContextContent.summary,
        'system',
        sourceContextContent.blockedReasons.join(' '),
      );
    }

    const workspaceContext = modelProducerOptIn
      ? await this.collectSelectedWorkspaceContext({
          files: selectedContextFiles,
          runId: run.id,
          workspaceRoot: workspaceRoot ?? '',
        })
      : null;

    if (workspaceContext?.status === 'blocked') {
      return this.updateRunResult(
        run.id,
        'failed',
        workspaceContext.summary,
        'system',
        workspaceContext.blockedReasons.join(' '),
      );
    }

    if (modelProducerOptIn) {
      await this.runStepRepository.create({
        input: retainedContextManifestForStep ?? '',
        kind: 'plan',
        output: retainedContextManifestForStep ?? '',
        runId: run.id,
        status: 'completed',
        title: 'Code Agent retained runtime context manifest',
      });

      const contextManifest = buildCodeAgentProviderVisibleContextManifest({
        artifacts: selectedArtifacts.items,
        sourceContexts: selectedSourceContexts.items.map((item) => ({
          contentIncluded: input.includeSourceContextContent === true,
          id: item.id,
          title: item.title,
        })),
        workspaceFiles: selectedContextFiles,
      });

      await this.runStepRepository.create({
        input: formatCodeAgentProviderVisibleContextManifestForStep(contextManifest),
        kind: 'plan',
        output: contextManifest.summary,
        runId: run.id,
        status: 'completed',
        title: 'Code Agent provider-visible context manifest',
      });
    }

    const modelRuntime = await prepareCodeAgentModelProducerRuntime({
      aiConfigService: this.aiConfigService,
      allowProviderCalls: modelProducerOptIn,
    });

    if (modelProducerOptIn && modelRuntime.status === 'blocked') {
      return this.updateRunResult(
        run.id,
        'failed',
        modelRuntime.summary,
        'system',
        modelRuntime.reason,
      );
    }

    const producerLoop = modelRuntime.status === 'ready'
      ? modelRuntime.createLoop({
          retainedContextManifest: retainedContextManifestForStep,
          sourceContext: sourceContextContent.status === 'collected'
            ? sourceContextContent.snapshot
            : null,
          workspaceContext: workspaceContext?.snapshot ?? null,
        })
      : createManualCodeAgentPreviewLoop({
          patchIntent,
          runId: run.id,
          taskTitle: task.title,
        });
    const producerSource = modelRuntime.status === 'ready' ? 'model_backed' : 'local_diagnostic';
    const execution = await this.createExecutionService().run({
      decisionTitle: `Review Code Agent preview for ${task.title}`,
      featureFlags: aiStatus.featureFlags,
      operatorConfirmed: input.operatorConfirmed,
      patchSummary: patchIntent,
      producerLoop,
      producerSource,
      request,
    });

    if (execution.status === 'blocked') {
      return this.updateRunResult(
        run.id,
        'failed',
        execution.summary,
        'system',
        execution.reason,
      );
    }

    const previewStatus = execution.preview.status;
    if (previewStatus === 'previewed') {
      const producerPreview = execution.preview.preview.preview;
      const reviewSummary = producerPreview.status === 'preview_ready'
        ? await this.persistPatchReview({
            decisionTitle: `Review Code Agent preview for ${task.title}`,
            preview: producerPreview,
          })
        : null;
      const producerStatus = producerPreview.status;
      const status = producerStatus === 'preview_ready'
        ? 'completed'
        : producerStatus === 'paused'
          ? 'paused'
          : 'failed';

      return this.updateRunResult(
        run.id,
        status,
        [execution.summary, reviewSummary].filter(Boolean).join(' / '),
        'system',
        status === 'failed'
          ? getCodeAgentPreviewFailureReason(producerPreview) ?? execution.summary
          : null,
      );
    }

    return this.updateRunResult(
      run.id,
      'failed',
      execution.summary,
      'system',
      execution.preview.preflight.summary,
    );
  }

  private async collectSelectedWorkspaceContext(params: {
    files: string[];
    runId: string;
    workspaceRoot: string;
  }): ReturnType<typeof collectCodeAgentWorkspaceContext> {
    const result = await collectCodeAgentWorkspaceContext({
      files: params.files,
      workspaceRoot: params.workspaceRoot,
    });

    if (result.status === 'collected' && result.snapshot.files.length) {
      await this.runStepRepository.create({
        input: params.files.join('\n'),
        kind: 'tool_result',
        output: result.summary,
        runId: params.runId,
        status: 'completed',
        title: 'Code Agent workspace context collected',
      });
    }

    return result;
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

  private async buildTaskMemoryGuidanceForTask(
    task: NonNullable<Awaited<ReturnType<TaskService['getDetail']>>>,
  ): Promise<TaskMemoryGuidanceState> {
    const listForTask = (
      this.runStepRepository as Partial<Pick<RunStepRepository, 'listForTask'>>
    ).listForTask;
    const steps = typeof listForTask === 'function'
      ? await listForTask.call(this.runStepRepository, task.id)
      : [];

    return buildTaskMemoryGuidanceStateForTaskFiles({
      guidanceSignals: steps,
      taskFiles: task.taskFiles,
    });
  }

  private async persistPatchReview(params: {
    decisionTitle: string;
    preview: Extract<PreviewSandboxedCodingInjectedProducerRunResult, { status: 'preview_ready' }>;
  }): Promise<string | null> {
    if (params.preview.plan.status !== 'ready') {
      return null;
    }

    const checkResults = getProducerCheckResults(params.preview);
    const artifact = buildAgentSandboxPatchArtifactFromCheckResults({
      checkResults,
      diff: params.preview.plan.patchDraft.diff,
      files: params.preview.plan.patchDraft.files,
      riskSummary: params.preview.plan.patchDraft.riskSummary,
      summary: params.preview.plan.patchDraft.summary,
    });
    const preparation: LocalContainerSandboxPatchReviewPreparation = {
      artifact,
      audit: params.preview.plan.requestBundle.audit,
      checkRun: {
        results: checkResults,
        summary: summarizeAgentSandboxCheckResults(checkResults),
      },
      checkpoint: buildAgentSandboxPatchPromotionCheckpoint({
        artifact,
        policySnapshot: params.preview.plan.requestBundle.request.executionPolicy,
        resumeTarget: `${params.preview.source.sourceId}:promote`,
      }),
      handle: {
        createdAt: new Date().toISOString(),
        id: params.preview.source.sourceId,
        providerKind: 'local_container',
        stagingRoot: `sandbox_source:${params.preview.source.sourceId}`,
        workspaceMode: 'staged_write',
      },
      sessionSummary: [
        'sandbox source ready for patch review',
        `source=${params.preview.source.sourceId}`,
        `files=${params.preview.source.patchDraft.files.join(',')}`,
      ].join(' / '),
    };
    const persister = new SandboxPatchReviewPersister(
      this.artifactRepository,
      this.runStepRepository,
      new AgentCheckpointRecorder(
        this.runCheckpointRepository,
        this.runStepRepository,
        this.decisionRepository,
        this.sandboxPatchPromotionRepository,
      ),
    );
    const result = await persister.persist({
      decisionTitle: params.decisionTitle,
      preparation,
      runId: params.preview.source.runId,
      taskId: params.preview.source.taskId,
    });

    return result.checkpoint
      ? `patch review Decision created: ${result.checkpoint.decisionId ?? result.checkpoint.checkpointId}`
      : `patch review artifact created: ${result.artifact.id}; no promotion Decision because checks did not pass`;
  }
}

function readSelectedCodeAgentContextFiles(input?: CreateCodeAgentRunInput): string[] {
  if (input?.contextFiles?.length) {
    return input.contextFiles
      .map((file) => file.trim())
      .filter(Boolean);
  }

  return (readEnvValue(CODE_AGENT_CONTEXT_FILES_ENV) ?? '')
    .split(',')
    .map((file) => file.trim())
    .filter(Boolean);
}

function selectCodeAgentArtifacts(
  input: CreateCodeAgentRunInput | undefined,
  artifacts: ArtifactRecord[],
): {
  blockedReasons: string[];
  items: ArtifactRecord[];
  status: 'blocked' | 'selected';
  summary: string;
} {
  const rawSelectedIds = (input?.artifactIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean);
  const duplicateIds = rawSelectedIds.filter((id, index, ids) => ids.indexOf(id) !== index);
  const selectedIds = Array.from(new Set(rawSelectedIds));
  const items: ArtifactRecord[] = [];
  const blockedReasons = Array.from(new Set(duplicateIds))
    .map((id) => `Code Agent artifact selection was duplicated: ${id}.`);

  for (const selectedId of selectedIds) {
    const artifact = artifacts.find((item) => item.id === selectedId);
    if (!artifact) {
      blockedReasons.push(`Code Agent artifact selection was not found on this task: ${selectedId}.`);
      continue;
    }

    items.push(artifact);
  }

  if (blockedReasons.length) {
    return {
      blockedReasons,
      items: [],
      status: 'blocked',
      summary: `Code Agent artifact selection blocked: ${blockedReasons.join(' ')}`,
    };
  }

  return {
    blockedReasons: [],
    items,
    status: 'selected',
    summary: items.length
      ? `Code Agent artifact selection / items=${items.length}`
      : 'Code Agent artifact selection / items=0',
  };
}

function selectCodeAgentSourceContexts(
  input: CreateCodeAgentRunInput | undefined,
  sourceContexts: SourceContextRecord[],
): {
  blockedReasons: string[];
  items: SourceContextRecord[];
  status: 'blocked' | 'selected';
  summary: string;
} {
  const rawSelectedIds = (input?.sourceContextIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean);
  const duplicateIds = rawSelectedIds.filter((id, index, ids) => ids.indexOf(id) !== index);
  const selectedIds = Array.from(new Set(rawSelectedIds));
  const items: SourceContextRecord[] = [];
  const blockedReasons = Array.from(new Set(duplicateIds))
    .map((id) => `Code Agent source context selection was duplicated: ${id}.`);

  for (const selectedId of selectedIds) {
    const sourceContext = sourceContexts.find((item) => item.id === selectedId);
    if (!sourceContext) {
      blockedReasons.push(`Code Agent source context selection was not found on this task: ${selectedId}.`);
      continue;
    }

    items.push(sourceContext);
  }

  if (blockedReasons.length) {
    return {
      blockedReasons,
      items: [],
      status: 'blocked',
      summary: `Code Agent source context selection blocked: ${blockedReasons.join(' ')}`,
    };
  }

  return {
    blockedReasons: [],
    items,
    status: 'selected',
    summary: items.length
      ? `Code Agent source context selection / items=${items.length}`
      : 'Code Agent source context selection / items=0',
  };
}

function getProducerCheckResults(
  preview: Extract<PreviewSandboxedCodingInjectedProducerRunResult, { status: 'preview_ready' }>,
): AgentSandboxCheckResult[] {
  const eventResults = preview.events
    .filter((event): event is Extract<SandboxedCodingEventCheckCompleted, { type: 'sandbox_producer.check_completed' }> =>
      event.type === 'sandbox_producer.check_completed')
    .map((event) => ({
      outputPreview: event.outputSummary,
      script: event.script,
      status: event.status,
    }));

  if (eventResults.length) {
    return eventResults;
  }

  return preview.source.requestedScripts.map((script) => ({
    outputPreview: 'No producer check evidence was recorded.',
    script,
    status: 'skipped',
  }));
}

type SandboxedCodingEventCheckCompleted = Extract<
  SandboxedCodingProducerEvent,
  { type: 'sandbox_producer.check_completed' }
>;

function getCodeAgentPreviewFailureReason(preview: { status: string; reason?: string }): string | null {
  return preview.reason?.trim() || null;
}

function normalizeCodeAgentChecks(
  checks: CodeAgentAllowedCheck[],
  availability: AiConfigStatus['codeAgentWorkspaceChecks'],
): CodeAgentAllowedCheck[] {
  const allowed = new Set<CodeAgentAllowedCheck>(['test', 'lint']);
  const normalized = Array.from(new Set(checks.filter((check) => allowed.has(check))));

  return normalized.filter((check) => availability?.[check].available === true);
}

function createManualCodeAgentPreviewLoop(params: {
  patchIntent: string;
  runId: string;
  taskTitle: string;
}): LocalContainerSandboxedCodingProducerLoop {
  return async ({ emit, request: producerRequest, sessionId, stagingRoot }) => {
    const plan = buildManualCodeAgentPreviewPlan(params);
    const normalizedPlan = normalizeCodeAgentStagedFilePlanPayload(plan);

    if (normalizedPlan.status === 'blocked') {
      emit({
        reason: normalizedPlan.summary,
        runId: producerRequest.runId,
        sessionId,
        sourceId: producerRequest.sourceId,
        tool: 'staging.write_file',
        type: 'sandbox_producer.tool_blocked',
      });

      return {
        reason: normalizedPlan.summary,
        sessionSummary: normalizedPlan.summary,
        status: 'blocked',
      };
    }

    emit({
      inputSummary: normalizedPlan.summary,
      runId: producerRequest.runId,
      sessionId,
      sourceId: producerRequest.sourceId,
      tool: 'staging.write_file',
      type: 'sandbox_producer.tool_requested',
    });

    const writeResult = await writeCodeAgentStagedFilePlan({
      plan: normalizedPlan.plan,
      stagingRoot,
    });

    emit({
      outputSummary: writeResult.summary,
      runId: producerRequest.runId,
      sessionId,
      sourceId: producerRequest.sourceId,
      tool: 'staging.write_file',
      type: 'sandbox_producer.tool_completed',
    });

    return {
      evidence: {
        modelSummary: normalizedPlan.plan.summary,
        observations: [
          ...normalizedPlan.plan.observations,
          'Workspace input stayed read-only; promotion remains Decision-gated.',
        ],
      },
      producerSource: 'local_diagnostic',
      sessionSummary: 'manual sandbox producer preview completed without external AI call',
      status: 'completed',
      summary: `Staged ${writeResult.files.join(', ')}`,
    };
  };
}

function buildManualCodeAgentPreviewPlan(params: {
  patchIntent: string;
  runId: string;
  taskTitle: string;
}): unknown {
  return {
    files: [
      {
        content: [
          '# Taskplane Code Agent Preview',
          '',
          `Task: ${params.taskTitle}`,
          `Run: ${params.runId}`,
          '',
          'Patch intent:',
          params.patchIntent,
          '',
          'Status:',
          'This is a manual sandbox preview. Model producer usage was not requested for this run.',
          'Workspace mutation still requires an approved Decision in a later promotion flow.',
          '',
        ].join('\n'),
        path: DEFAULT_CODE_AGENT_PREVIEW_FILE,
      },
    ],
    observations: [
      `Wrote ${DEFAULT_CODE_AGENT_PREVIEW_FILE} in staging only.`,
      'The same staged-file plan validator will be used before any model-backed producer write.',
    ],
    summary: 'Manual sandbox preview wrote a validated staged diagnostic patch; model producer usage was not requested.',
  };
}
