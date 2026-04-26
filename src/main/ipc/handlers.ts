import fs from 'node:fs/promises';
import path from 'node:path';

import type { PingResponse } from '../../shared/types/ipc.js';
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
import { probeLocalContainerSandboxBackend } from '../domain/run/local-container-sandbox-backend.js';
import { LocalContainerSandboxedCodingProducerExecutionService } from '../domain/run/local-container-sandboxed-coding-producer-execution-service.js';
import { evaluateSandboxedCodingProducerBackendReadiness } from '../domain/run/sandboxed-coding-producer-backend.js';
import { ipcMain } from '../electron.js';
import { emitAppEvent } from './event-bus.js';

const PING_CHANNEL = 'app:ping';
const DEFAULT_CODE_AGENT_PREVIEW_FILE = '.taskplane/code-agent-preview.md';

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
  const run = await services.runRepository.create({
    taskId: task.id,
    type: 'agent',
    instructions: [
      'Code Agent manual sandbox producer preview.',
      patchIntent,
      'Real model producer loop is not connected yet; this run records a staged local preview only.',
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
  const execution = await new LocalContainerSandboxedCodingProducerExecutionService().run({
    decisionTitle: `Review Code Agent preview for ${task.title}`,
    featureFlags: aiStatus.featureFlags,
    operatorConfirmed: input.operatorConfirmed,
    patchSummary: patchIntent,
    producerLoop: async ({ stagingRoot }) => {
      await writeManualCodeAgentPreview({
        patchIntent,
        runId: run.id,
        stagingRoot,
        taskTitle: task.title,
      });

      return {
        evidence: {
          modelSummary: 'Manual sandbox preview wrote a staged diagnostic patch; real producer model loop is not connected yet.',
          observations: [
            `Wrote ${DEFAULT_CODE_AGENT_PREVIEW_FILE} in staging only.`,
            'Workspace input stayed read-only; promotion remains Decision-gated.',
          ],
        },
        sessionSummary: 'manual sandbox producer preview completed without external AI call',
        status: 'completed',
        summary: `Staged ${DEFAULT_CODE_AGENT_PREVIEW_FILE}`,
      };
    },
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
    const producerStatus = execution.preview.preview.preview.status;
    const status = producerStatus === 'preview_ready'
      ? 'completed'
      : producerStatus === 'paused'
        ? 'paused'
        : 'failed';

    return services.runRepository.updateResult(
      run.id,
      status,
      execution.summary,
      'system',
      status === 'failed'
        ? getCodeAgentPreviewFailureReason(execution.preview.preview.preview) ?? execution.summary
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

function getCodeAgentPreviewFailureReason(preview: { status: string; reason?: string }): string | null {
  return preview.reason?.trim() || null;
}

function normalizeCodeAgentChecks(checks: CodeAgentAllowedCheck[]): CodeAgentAllowedCheck[] {
  const allowed = new Set<CodeAgentAllowedCheck>(['test', 'lint']);
  const normalized = Array.from(new Set(checks.filter((check) => allowed.has(check))));

  return normalized.length ? normalized : ['test'];
}

async function writeManualCodeAgentPreview(params: {
  patchIntent: string;
  runId: string;
  stagingRoot: string;
  taskTitle: string;
}): Promise<void> {
  const file = path.join(params.stagingRoot, DEFAULT_CODE_AGENT_PREVIEW_FILE);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    [
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
    'utf8',
  );
}
