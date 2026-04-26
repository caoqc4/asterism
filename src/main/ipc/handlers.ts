import type { PingResponse } from '../../shared/types/ipc.js';
import type { AgentSandboxCheckResult } from '../../shared/agent-sandbox-provider.js';
import {
  buildAgentSandboxPatchArtifactFromCheckResults,
  buildAgentSandboxPatchPromotionCheckpoint,
  summarizeAgentSandboxCheckResults,
} from '../../shared/agent-sandbox-provider.js';
import type { CreateBlockerInput, UpdateBlockerInput } from '../../shared/types/blocker.js';
import type {
  CreateCompletionCriteriaInput,
  UpdateCompletionCriteriaInput,
} from '../../shared/types/completion-criteria.js';
import type {
  CreateTaskDependencyInput,
  UpdateTaskDependencyInput,
} from '../../shared/types/task-dependency.js';
import type { CreateDecisionInput, DecisionActionInput, DraftDecisionInput } from '../../shared/types/decision.js';
import type {
  ApplyProcessTemplateInput,
  CreateProcessTemplateInput,
  UpdateProcessTemplateInput,
} from '../../shared/types/process-template.js';
import type { CodeAgentAllowedCheck, CreateCodeAgentRunInput, CreateRunInput, RunRecord } from '../../shared/types/run.js';
import type { AiConfigInput } from '../../shared/types/settings.js';
import type { CreateSourceContextInput, UpdateSourceContextInput } from '../../shared/types/source-context.js';
import type {
  CreateTaskInput,
  TransitionTaskInput,
  UpdateTaskInput,
} from '../../shared/types/task.js';

import { buildAgentSandboxBackendStatus } from '../../shared/agent-sandbox-provider.js';
import { getServices } from '../bootstrap/services.js';
import { readEnvBoolean } from '../config/env.js';
import { probeLocalContainerSandboxBackend } from '../domain/run/local-container-sandbox-backend.js';
import { LocalContainerSandboxedCodingProducerExecutionService } from '../domain/run/local-container-sandboxed-coding-producer-execution-service.js';
import type { LocalContainerSandboxPatchReviewPreparation } from '../domain/run/local-container-sandbox-backend.js';
import { evaluateSandboxedCodingProducerBackendReadiness } from '../domain/run/sandboxed-coding-producer-backend.js';
import {
  normalizeCodeAgentStagedFilePlanPayload,
  writeCodeAgentStagedFilePlan,
} from '../domain/run/code-agent-staged-file-plan.js';
import { prepareCodeAgentModelProducerRuntime } from '../domain/run/code-agent-model-producer-runtime.js';
import type {
  PreviewSandboxedCodingInjectedProducerRunResult,
  SandboxedCodingProducerEvent,
} from '../domain/run/sandboxed-coding-producer.js';
import type { LocalContainerSandboxedCodingProducerLoop } from '../domain/run/local-container-sandboxed-coding-producer-runner.js';
import { AgentCheckpointRecorder } from '../domain/run/agent-checkpoint-recorder.js';
import { SandboxPatchReviewPersister } from '../domain/run/sandbox-patch-review-persister.js';
import { ipcMain } from '../electron.js';
import { emitAppEvent } from './event-bus.js';

const PING_CHANNEL = 'app:ping';
const DEFAULT_CODE_AGENT_PREVIEW_FILE = '.taskplane/code-agent-preview.md';
const ENABLE_CODE_AGENT_MODEL_PRODUCER_ENV = 'TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER';

export function registerIpcHandlers(): void {
  ipcMain.handle(PING_CHANNEL, async (): Promise<PingResponse> => {
    return {
      message: 'pong from main',
      timestamp: new Date().toISOString(),
    };
  });

  ipcMain.handle('settings:getAiConfigStatus', async () => {
    return getServices().aiConfigService.getStatus();
  });

  ipcMain.handle('settings:setAiConfig', async (_event, input: AiConfigInput) => {
    const nextStatus = await getServices().aiConfigService.setConfig(input);

    if (nextStatus.featureFlags.enableScheduler) {
      await getServices().schedulerService.start();
    } else {
      getServices().schedulerService.stop();
    }

    emitAppEvent('settings.changed');

    return nextStatus;
  });

  ipcMain.handle('settings:probeSandboxBackend', async () => {
    const aiStatus = await getServices().aiConfigService.getStatus();
    const probe = await probeLocalContainerSandboxBackend();
    const status = buildAgentSandboxBackendStatus(probe);
    const producerBackendReadiness = evaluateSandboxedCodingProducerBackendReadiness({
      featureFlags: aiStatus.featureFlags,
      probe,
      request: {
        commandPolicy: {
          allowedScripts: ['test', 'lint'],
          outputLimitBytes: 64_000,
          timeoutMs: 120_000,
        },
        executionPolicy: {
          network: 'disabled',
          noCredentialPassthrough: true,
          promotion: 'decision_required',
        },
        intent: {
          completionCriteria: ['Backend readiness probe only'],
          instructions: 'Validate sandboxed coding producer backend readiness.',
          taskTitle: 'Sandbox backend readiness probe',
        },
        modelPolicy: {
          providerKind: aiStatus.provider ?? 'unconfigured',
          toolExposure: 'sandboxed_coding_producer',
        },
        runId: 'settings_probe',
        sourceId: 'settings_probe',
        taskId: 'settings_probe',
        workspaceRoot: aiStatus.workspaceRoot ?? '',
      },
    });

    return {
      ...status,
      producerBackendReadiness,
    };
  });

  ipcMain.handle('task:list', async () => {
    return getServices().taskService.list();
  });

  ipcMain.handle('task:create', async (_event, input: CreateTaskInput) => {
    const created = await getServices().taskService.create(input);
    emitAppEvent('task.changed', created.id);
    return created;
  });

  ipcMain.handle('task:getDetail', async (_event, taskId: string) => {
    return getServices().taskService.getDetail(taskId);
  });

  ipcMain.handle('task:update', async (_event, input: UpdateTaskInput) => {
    const updated = await getServices().taskService.update(input);
    emitAppEvent('task.changed', updated.id);
    return updated;
  });

  ipcMain.handle('task:transition', async (_event, input: TransitionTaskInput) => {
    const updated = await getServices().taskService.transition(input);
    emitAppEvent('task.changed', updated.id);
    return updated;
  });

  ipcMain.handle('blocker:create', async (_event, input: CreateBlockerInput) => {
    const created = await getServices().taskService.createBlocker(input);
    emitAppEvent('task.changed', created.taskId);
    return created;
  });

  ipcMain.handle('blocker:update', async (_event, input: UpdateBlockerInput) => {
    const updated = await getServices().taskService.updateBlocker(input);
    emitAppEvent('task.changed', updated.taskId);
    return updated;
  });

  ipcMain.handle('blocker:resolve', async (_event, id: string) => {
    const resolved = await getServices().taskService.resolveBlocker(id);
    emitAppEvent('task.changed', resolved.taskId);
    return resolved;
  });

  ipcMain.handle('completionCriteria:create', async (_event, input: CreateCompletionCriteriaInput) => {
    const created = await getServices().taskService.createCompletionCriteria(input);
    emitAppEvent('task.changed', created.taskId);
    return created;
  });

  ipcMain.handle('completionCriteria:update', async (_event, input: UpdateCompletionCriteriaInput) => {
    const updated = await getServices().taskService.updateCompletionCriteria(input);
    emitAppEvent('task.changed', updated.taskId);
    return updated;
  });

  ipcMain.handle('completionCriteria:satisfy', async (_event, id: string) => {
    const satisfied = await getServices().taskService.satisfyCompletionCriteria(id);
    emitAppEvent('task.changed', satisfied.taskId);
    return satisfied;
  });

  ipcMain.handle('completionCriteria:reopen', async (_event, id: string) => {
    const reopened = await getServices().taskService.reopenCompletionCriteria(id);
    emitAppEvent('task.changed', reopened.taskId);
    return reopened;
  });

  ipcMain.handle('taskDependency:create', async (_event, input: CreateTaskDependencyInput) => {
    const created = await getServices().taskService.createTaskDependency(input);
    emitAppEvent('task.changed', created.taskId);
    emitAppEvent('task.changed', created.blockedByTaskId);
    return created;
  });

  ipcMain.handle('taskDependency:update', async (_event, input: UpdateTaskDependencyInput) => {
    const updated = await getServices().taskService.updateTaskDependency(input);
    emitAppEvent('task.changed', updated.taskId);
    emitAppEvent('task.changed', updated.blockedByTaskId);
    return updated;
  });

  ipcMain.handle('taskDependency:resolve', async (_event, id: string) => {
    const resolved = await getServices().taskService.resolveTaskDependency(id);
    emitAppEvent('task.changed', resolved.taskId);
    emitAppEvent('task.changed', resolved.blockedByTaskId);
    return resolved;
  });

  ipcMain.handle('sourceContext:create', async (_event, input: CreateSourceContextInput) => {
    const created = await getServices().taskService.createSourceContext(input);
    emitAppEvent('task.changed', created.taskId);
    return created;
  });

  ipcMain.handle('sourceContext:update', async (_event, input: UpdateSourceContextInput) => {
    const updated = await getServices().taskService.updateSourceContext(input);
    emitAppEvent('task.changed', updated.taskId);
    return updated;
  });

  ipcMain.handle('sourceContext:archive', async (_event, id: string) => {
    const archived = await getServices().taskService.archiveSourceContext(id);
    emitAppEvent('task.changed', archived.taskId);
    return archived;
  });

  ipcMain.handle('processTemplate:create', async (_event, input: CreateProcessTemplateInput) => {
    return getServices().taskService.createProcessTemplate(input);
  });

  ipcMain.handle('processTemplate:update', async (_event, input: UpdateProcessTemplateInput) => {
    return getServices().taskService.updateProcessTemplate(input);
  });

  ipcMain.handle('processTemplate:archive', async (_event, id: string) => {
    return getServices().taskService.archiveProcessTemplate(id);
  });

  ipcMain.handle('processTemplate:apply', async (_event, input: ApplyProcessTemplateInput) => {
    const applied = await getServices().taskService.applyProcessTemplate(input);
    emitAppEvent('task.changed', applied.taskId);
    return applied;
  });

  ipcMain.handle('processTemplate:remove', async (_event, bindingId: string) => {
    const removed = await getServices().taskService.removeProcessTemplate(bindingId);
    emitAppEvent('task.changed', removed.taskId);
    return removed;
  });

  ipcMain.handle('decision:list', async () => {
    return getServices().decisionService.list();
  });

  ipcMain.handle('decision:draft', async (_event, input: DraftDecisionInput) => {
    return getServices().decisionService.draft(input);
  });

  ipcMain.handle('decision:create', async (_event, input: CreateDecisionInput) => {
    const created = await getServices().decisionService.create(input);
    emitAppEvent('decision.changed', created.id);
    emitAppEvent('task.changed', created.taskId);
    return created;
  });

  ipcMain.handle('decision:act', async (_event, input: DecisionActionInput) => {
    const updated = await getServices().decisionService.act(input);
    emitAppEvent('decision.changed', updated.id);
    emitAppEvent('task.changed', updated.taskId);
    return updated;
  });

  ipcMain.handle('brief:getHomeData', async () => {
    return getServices().homeBriefService.getHomeData();
  });

  ipcMain.handle('run:list', async () => {
    return getServices().runService.list();
  });

  ipcMain.handle('run:getDetail', async (_event, runId: string) => {
    return getServices().runService.getDetail(runId);
  });

  ipcMain.handle('run:trigger', async (_event, input: CreateRunInput) => {
    const created = await getServices().runService.trigger(input);
    emitAppEvent('run.changed', created.id);
    emitAppEvent('task.changed', created.taskId);
    emitAppEvent('brief.changed');
    return created;
  });

  ipcMain.handle('run:triggerCodeAgent', async (_event, input: CreateCodeAgentRunInput) => {
    const created = await triggerManualCodeAgentRun(input);
    emitAppEvent('run.changed', created.id);
    emitAppEvent('task.changed', created.taskId);
    emitAppEvent('brief.changed');
    return created;
  });

  ipcMain.handle('run:continuePaused', async (_event, runId: string) => {
    const updated = await getServices().runService.continuePausedRun(runId);
    emitAppEvent('run.changed', updated.id);
    emitAppEvent('task.changed', updated.taskId);
    emitAppEvent('brief.changed');
    return updated;
  });
}

async function triggerManualCodeAgentRun(input: CreateCodeAgentRunInput): Promise<RunRecord> {
  const services = getServices();
  const task = await services.taskService.getDetail(input.taskId);

  if (!task) {
    throw new Error(`Task not found: ${input.taskId}`);
  }

  const aiStatus = await services.aiConfigService.getStatus();
  const workspaceRoot = aiStatus.workspaceRoot?.trim();
  const requestedChecks = normalizeCodeAgentChecks(input.requestedChecks);
  const patchIntent = input.patchIntent.trim() || `Prepare a staged patch for ${task.title}.`;
  const modelProducerOptIn = readEnvBoolean(ENABLE_CODE_AGENT_MODEL_PRODUCER_ENV) === true;
  const run = await services.runRepository.create({
    taskId: task.id,
    type: 'agent',
    instructions: [
      'Code Agent manual sandbox producer preview.',
      patchIntent,
      modelProducerOptIn
        ? 'Model producer loop is explicitly enabled by local env and remains sandbox/Decision gated.'
        : 'Real model producer loop is not connected yet; this run records a staged local preview only.',
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
  const modelRuntime = await prepareCodeAgentModelProducerRuntime({
    aiConfigService: services.aiConfigService,
    allowProviderCalls: modelProducerOptIn,
  });

  if (modelProducerOptIn && modelRuntime.status === 'blocked') {
    return services.runRepository.updateResult(
      run.id,
      'failed',
      modelRuntime.summary,
      'system',
      modelRuntime.reason,
    );
  }

  const producerLoop = modelRuntime.status === 'ready'
    ? modelRuntime.createLoop()
    : createManualCodeAgentPreviewLoop({
        patchIntent,
        runId: run.id,
        taskTitle: task.title,
      });
  const execution = await new LocalContainerSandboxedCodingProducerExecutionService().run({
    decisionTitle: `Review Code Agent preview for ${task.title}`,
    featureFlags: aiStatus.featureFlags,
    operatorConfirmed: input.operatorConfirmed,
    patchSummary: patchIntent,
    producerLoop,
    request,
  });

  if (execution.status === 'blocked') {
    return services.runRepository.updateResult(
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
      ? await persistCodeAgentPatchReview({
          decisionTitle: `Review Code Agent preview for ${task.title}`,
          preview: producerPreview,
          services,
        })
      : null;
    const producerStatus = producerPreview.status;
    const status = producerStatus === 'preview_ready'
      ? 'completed'
      : producerStatus === 'paused'
        ? 'paused'
        : 'failed';

    return services.runRepository.updateResult(
      run.id,
      status,
      [execution.summary, reviewSummary].filter(Boolean).join(' / '),
      'system',
      status === 'failed'
        ? getCodeAgentPreviewFailureReason(producerPreview) ?? execution.summary
        : null,
    );
  }

  return services.runRepository.updateResult(
    run.id,
    'failed',
    execution.summary,
    'system',
    execution.preview.preflight.summary,
  );
}

async function persistCodeAgentPatchReview(params: {
  decisionTitle: string;
  preview: Extract<PreviewSandboxedCodingInjectedProducerRunResult, { status: 'preview_ready' }>;
  services: ReturnType<typeof getServices>;
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
    params.services.artifactRepository,
    params.services.runStepRepository,
    new AgentCheckpointRecorder(
      params.services.runCheckpointRepository,
      params.services.runStepRepository,
      params.services.decisionRepository,
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

function getProducerCheckResults(
  preview: Extract<PreviewSandboxedCodingInjectedProducerRunResult, { status: 'preview_ready' }>,
): AgentSandboxCheckResult[] {
  const eventResults = preview.events
    .filter((event): event is Extract<SandboxedCodingProducerEvent, { type: 'sandbox_producer.check_completed' }> =>
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

function getCodeAgentPreviewFailureReason(preview: { status: string; reason?: string }): string | null {
  return preview.reason?.trim() || null;
}

function normalizeCodeAgentChecks(checks: CodeAgentAllowedCheck[]): CodeAgentAllowedCheck[] {
  const allowed = new Set<CodeAgentAllowedCheck>(['test', 'lint']);
  const normalized = Array.from(new Set(checks.filter((check) => allowed.has(check))));

  return normalized.length ? normalized : ['test'];
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
          'This is a manual sandbox preview. The real model producer loop is not connected yet.',
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
    summary: 'Manual sandbox preview wrote a validated staged diagnostic patch; real producer model loop is not connected yet.',
  };
}
