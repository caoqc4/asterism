import { execFile } from 'node:child_process';

import type { AgentCliRuntimeId } from '../../shared/agent-cli-runtime-status.js';
import type {
  ApplyTaskplaneWritebackInput,
  ChatInput,
  PingResponse,
  ProjectDecompositionInput,
} from '../../shared/types/ipc.js';
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
import type {
  CancelAgentCliRunInput,
  CreateAgentCliRunInput,
  CreateCodeAgentRunInput,
  CreateRunInput,
  RecordRuntimeNativeGoalRequestInput,
} from '../../shared/types/run.js';
import type { AiConfigInput, FeatureFlags } from '../../shared/types/settings.js';
import type { GmailOAuthConnectInput, GmailOAuthDisconnectInput } from '../../shared/types/external-access-control.js';
import type {
  ExternalAccessSourceIngestionCommitInput,
  ExternalAccessSourceIngestionPreviewInput,
} from '../../shared/types/external-access-source-ingestion.js';
import type { OperatorStartedRunRequest } from '../../shared/types/operator-started-run.js';
import type { CreateManualArtifactInput, UpdateArtifactInput } from '../../shared/types/artifact.js';
import type { CreateTaskFileInput, UpdateTaskFileInput } from '../../shared/types/task-file.js';
import type {
  CreateSourceContextInput,
  SourceContextRecord,
  UpdateSourceContextInput,
} from '../../shared/types/source-context.js';
import type {
  CompletionOverrideLearningSignalInput,
  CreateManualWorkHabitInput,
  CreateWorkHabitProposalInput,
  ImportLegacyWorkHabitsInput,
  RecordWorkHabitApplicationsInput,
  ResolveWorkHabitConflictInput,
  SopTemplateHabitInput,
  UpdateWorkHabitInput,
} from '../../shared/types/work-habit.js';
import type {
  CreateTaskInput,
  RecordTaskCompletionCheckInput,
  RecordTaskTimelineEventInput,
  TransitionTaskInput,
  UpdateTaskInput,
} from '../../shared/types/task.js';
import type { ApplyTaskHierarchyManualResolutionInput } from '../../shared/task-hierarchy-consistency.js';

import { generateText } from 'ai';
import { buildAgentSandboxBackendStatus } from '../../shared/agent-sandbox-provider.js';
import {
  buildApiRuntimeChatAssistantInvocation,
  buildApiRuntimeDecompositionDraftInvocation,
} from '../../shared/ai-runtime-invocation.js';
import { getServices } from '../bootstrap/services.js';
import { getLanguageModel } from '../executors/ai-client.js';
import { probeLocalContainerSandboxBackend } from '../domain/run/local-container-sandbox-backend.js';
import { evaluateSandboxedCodingProducerBackendReadiness } from '../domain/run/sandboxed-coding-producer-backend.js';
import { ipcMain } from '../electron.js';
import { emitAppEvent } from './event-bus.js';
import {
  projectWorkHabitLabel,
  selectApplicableWorkHabitMatches,
  summarizeWorkHabitMatchesForPrompt,
  taskTypeWorkHabitLabel,
} from '../../shared/work-habit-rules.js';
import { TASKPLANE_CORE_AGENT_CONTEXT } from '../../shared/core-agent-context.js';
import { TASKPLANE_AGENT_PRINCIPLES } from '../../shared/agent-principles.js';
import { normalizeCreateManualArtifactInput } from '../../shared/runtime-surface-routing.js';
import { evaluateRuntimeSubtaskDraft } from '../../shared/runtime-subtask-evaluator.js';
import { evaluateRuntimeAction } from '../../shared/runtime-action-evaluator.js';
import { evaluateRuntimeVerification } from '../../shared/runtime-verification.js';
import {
  extractJsonObjectFromText,
  normalizeProjectDecompositionDraft,
} from '../../shared/project-decomposition-draft.js';
import { GmailOAuthControlService } from '../domain/external-access/gmail-oauth-control-service.js';

const PING_CHANNEL = 'app:ping';

function agentCliLoginCommand(runtimeId: AgentCliRuntimeId): string {
  if (runtimeId === 'claude') return 'claude auth login';
  return 'codex login';
}

function agentCliInstallCommand(runtimeId: AgentCliRuntimeId): string {
  if (runtimeId === 'claude') {
    return [
      'npm install -g @anthropic-ai/claude-code --include=optional',
      'echo ""',
      'echo "Claude Code installed. Checking status..."',
      'claude --version',
      'claude auth status --text || echo "Claude is installed but not authorized. Run: claude auth login"',
      'echo "Return to Taskplane and click Re-detect."',
    ].join('; ');
  }
  return [
    'npm install -g @openai/codex',
    'echo ""',
    'echo "Codex CLI installed. Checking status..."',
    'codex --version',
    'codex login status || echo "Codex is installed but not authorized. Run: codex login"',
    'echo "Return to Taskplane and click Re-detect."',
  ].join('; ');
}

function agentCliRepairInstallCommand(runtimeId: AgentCliRuntimeId): string {
  if (runtimeId !== 'claude') return agentCliInstallCommand(runtimeId);

  return [
    'set -e',
    'ROOT="$(npm root -g)"',
    'PREFIX="$(npm prefix -g)"',
    'BASE="$ROOT/@anthropic-ai"',
    'STAMP="$(date +%Y%m%d%H%M%S)"',
    'for dir in "$BASE"/.claude-code-* "$BASE"/claude-code; do',
    '  [ -e "$dir" ] && mv "$dir" "$dir.bak.$STAMP"',
    'done',
    'rm -f "$PREFIX/bin/claude"',
    'npm install -g @anthropic-ai/claude-code --include=optional',
    'echo ""',
    'echo "Claude Code installed. Checking status..."',
    'claude --version',
    'claude auth status --text || echo "Claude is installed but not authorized. Run: claude auth login"',
    'echo "Return to Taskplane and click Re-detect."',
  ].join('; ');
}

function openTerminalWithCommand(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'darwin') {
      reject(new Error('Opening a prepared terminal login command is only supported on macOS for now.'));
      return;
    }

    execFile('osascript', [
      '-e',
      'tell application "Terminal" to activate',
      '-e',
      `tell application "Terminal" to do script ${JSON.stringify(command)}`,
    ], (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function selectPromptKeySources(sourceContexts: SourceContextRecord[], maxItems = 3): SourceContextRecord[] {
  return sourceContexts
    .filter((source) => source.status === 'active' && source.isKey)
    .sort((a, b) => (b.capturedAt ?? b.updatedAt).localeCompare(a.capturedAt ?? a.updatedAt))
    .slice(0, maxItems);
}

function formatPromptSource(source: SourceContextRecord): string {
  const captured = source.capturedAt ?? source.createdAt ?? source.updatedAt;
  const scope = [
    `captured=${captured}`,
    source.runId ? `run=${source.runId}` : null,
    source.batchId ? `batch=${source.batchId}` : null,
    `role=${source.sourceRole ?? 'raw'}`,
  ].filter(Boolean).join(', ');
  const body = source.note ?? source.content ?? source.uri ?? 'no summary';
  return `${source.title} (${scope}): ${body}`;
}

function formatAiBehaviorPreferences(featureFlags: FeatureFlags): string {
  const communication = featureFlags.communicationStyle ?? 'balanced';
  const confirmation = featureFlags.confirmationThreshold ?? 'normal';
  const communicationInstruction = {
    concise: 'Keep replies short and direct; prefer bullets only when they reduce friction.',
    balanced: 'Use a balanced level of detail: explain reasoning briefly, then give concrete next steps.',
    detailed: 'Provide more context and rationale when it helps the user make a decision, while staying practical.',
  }[communication];
  const confirmationInstruction = {
    low: 'Ask for confirmation only before irreversible or clearly risky actions.',
    normal: 'Ask for confirmation before risky, ambiguous, or externally visible actions.',
    high: 'Ask for confirmation more often when intent, risk, external effects, or task type is uncertain.',
  }[confirmation];

  return `\n\nAI behavior preferences:\n- Communication style: ${communicationInstruction}\n- Confirmation threshold: ${confirmationInstruction}`;
}

function emitTaskplaneWritebackEvents(input: ApplyTaskplaneWritebackInput): void {
  emitAppEvent('task.changed', input.taskId);
  if (input.plan.action === 'decision.create' || input.plan.action === 'completion_decision.create') {
    emitAppEvent('decision.changed');
    emitAppEvent('brief.changed');
  }
}

async function assertTaskBoundMutationAllowed(taskId: string): Promise<void> {
  const task = await getServices().taskService.getDetail(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const action = evaluateRuntimeAction({
    action: 'task_mutation',
    fromTaskId: taskId,
  });
  const verification = evaluateRuntimeVerification({
    mode: 'pre_step',
    action,
    confirmationSatisfied: true,
  });

  if (!verification.canProceed) {
    throw new Error(verification.detail);
  }
}

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

  ipcMain.handle('settings:openAgentCliLogin', async (_event, input: { runtimeId?: AgentCliRuntimeId }) => {
    const runtimeId = input.runtimeId === 'claude' ? 'claude' : 'codex';
    const command = agentCliLoginCommand(runtimeId);
    await openTerminalWithCommand(command);

    return {
      command,
      opened: true,
      runtimeId,
      summary: `Opened Terminal with ${command}.`,
    };
  });

  ipcMain.handle('settings:openAgentCliInstall', async (_event, input: { repair?: boolean; runtimeId?: AgentCliRuntimeId }) => {
    const runtimeId = input.runtimeId === 'claude' ? 'claude' : 'codex';
    const command = input.repair ? agentCliRepairInstallCommand(runtimeId) : agentCliInstallCommand(runtimeId);
    await openTerminalWithCommand(command);

    return {
      command,
      opened: true,
      runtimeId,
      summary: `Opened Terminal with ${command}.`,
    };
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

  ipcMain.handle('externalAccess:gmailOAuthConnect', async (_event, input: GmailOAuthConnectInput) => {
    const result = await new GmailOAuthControlService().connect(input);
    if (result.status === 'connected') emitAppEvent('settings.changed');
    return result;
  });

  ipcMain.handle('externalAccess:gmailOAuthDisconnect', async (_event, input: GmailOAuthDisconnectInput) => {
    const result = await new GmailOAuthControlService().disconnect(input);
    if (result.status === 'disconnected') emitAppEvent('settings.changed');
    return result;
  });

  ipcMain.handle('externalAccess:sourceIngestionPreview', async (
    _event,
    input: ExternalAccessSourceIngestionPreviewInput,
  ) => {
    return getServices().externalAccessSourceIngestionService.preview(input);
  });

  ipcMain.handle('externalAccess:sourceIngestionCommit', async (
    _event,
    input: ExternalAccessSourceIngestionCommitInput,
  ) => {
    const result = await getServices().externalAccessSourceIngestionService.commit(input);
    if (result.created.length > 0) {
      emitAppEvent('task.changed', result.taskId);
    }
    return result;
  });

  ipcMain.handle('task:list', async () => {
    return getServices().taskService.list();
  });

  ipcMain.handle('task:getHierarchyConsistency', async () => {
    return getServices().taskService.getHierarchyConsistency();
  });

  ipcMain.handle('task:getHierarchyManualReviewPolicy', async () => {
    return getServices().taskService.getHierarchyManualReviewPolicy();
  });

  ipcMain.handle('task:applySafeHierarchyRepairs', async () => {
    const result = await getServices().taskService.applySafeHierarchyRepairs();
    emitAppEvent('task.changed');
    return result;
  });

  ipcMain.handle('task:applyHierarchyManualResolution', async (
    _event,
    input: ApplyTaskHierarchyManualResolutionInput,
  ) => {
    const result = await getServices().taskService.applyHierarchyManualResolution(input);
    emitAppEvent('task.changed');
    return result;
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

  ipcMain.handle('task:recordCompletionCheck', async (_event, input: RecordTaskCompletionCheckInput) => {
    await getServices().taskService.recordCompletionCheck(input);
    emitAppEvent('task.changed', input.taskId);
  });

  ipcMain.handle('task:recordTimelineEvent', async (_event, input: RecordTaskTimelineEventInput) => {
    await getServices().taskService.recordTimelineEvent(input);
    emitAppEvent('task.changed', input.taskId);
  });

  ipcMain.handle('taskplaneWriteback:apply', async (_event, input: ApplyTaskplaneWritebackInput) => {
    await assertTaskBoundMutationAllowed(input.taskId);
    const result = await getServices().taskplaneWritebackDispatchService.dispatch(input);
    if (result.status === 'completed') {
      emitTaskplaneWritebackEvents(input);
    }
    return result;
  });

  ipcMain.handle('workHabit:getSnapshot', async () => getServices().workHabitService.getSnapshot());

  ipcMain.handle('workHabit:importLegacy', async (_event, input: ImportLegacyWorkHabitsInput) =>
    getServices().workHabitService.importLegacy(input));

  ipcMain.handle('workHabit:update', async (_event, input: UpdateWorkHabitInput) =>
    getServices().workHabitService.update(input));

  ipcMain.handle('workHabit:delete', async (_event, id: string) =>
    getServices().workHabitService.delete(id));

  ipcMain.handle('workHabit:createManual', async (_event, input: CreateManualWorkHabitInput) =>
    getServices().workHabitService.createManual(input));

  ipcMain.handle('workHabit:propose', async (_event, input: CreateWorkHabitProposalInput) =>
    getServices().workHabitService.propose(input));

  ipcMain.handle('workHabit:resolveConflict', async (_event, input: ResolveWorkHabitConflictInput) =>
    getServices().workHabitService.resolveConflict(input));

  ipcMain.handle('workHabit:recordCompletionOverride', async (_event, input: CompletionOverrideLearningSignalInput) =>
    getServices().workHabitService.recordCompletionOverride(input));

  ipcMain.handle('workHabit:recordSopTemplate', async (_event, input: SopTemplateHabitInput) =>
    getServices().workHabitService.recordSopTemplate(input));

  ipcMain.handle('workHabit:recordApplications', async (_event, input: RecordWorkHabitApplicationsInput) =>
    getServices().workHabitService.recordApplications(input.habitIds));

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

  ipcMain.handle('artifact:createManual', async (_event, input: CreateManualArtifactInput) => {
    const normalizedInput = normalizeCreateManualArtifactInput(input);
    await assertTaskBoundMutationAllowed(normalizedInput.taskId);
    const created = await getServices().artifactRepository.createManualNote({
      taskId: normalizedInput.taskId,
      title: normalizedInput.title,
      content: normalizedInput.content ?? '',
    });
    emitAppEvent('task.changed', created.taskId);
    return created;
  });

  ipcMain.handle('artifact:update', async (_event, input: UpdateArtifactInput) => {
    const existing = await getServices().artifactRepository.findById(input.id);
    if (!existing) {
      throw new Error(`Artifact not found: ${input.id}`);
    }
    await assertTaskBoundMutationAllowed(existing.taskId);
    const updated = await getServices().artifactRepository.update(input);
    emitAppEvent('task.changed', updated.taskId);
    return updated;
  });

  ipcMain.handle('artifact:delete', async (_event, id: string) => {
    const existing = await getServices().artifactRepository.findById(id);
    if (!existing) {
      throw new Error(`Artifact not found: ${id}`);
    }
    await assertTaskBoundMutationAllowed(existing.taskId);
    const deleted = await getServices().artifactRepository.delete(id);
    emitAppEvent('task.changed', deleted.taskId);
    return deleted;
  });

  ipcMain.handle('taskFile:list', async (_event, taskId: string) => {
    return getServices().taskFileRepository.listForTask(taskId);
  });

  ipcMain.handle('taskFile:create', async (_event, input: CreateTaskFileInput) => {
    await assertTaskBoundMutationAllowed(input.taskId);
    const created = await getServices().taskFileRepository.create(input);
    emitAppEvent('task.changed', created.taskId);
    return created;
  });

  ipcMain.handle('taskFile:update', async (_event, input: UpdateTaskFileInput) => {
    const existing = await getServices().taskFileRepository.findById(input.id);
    if (!existing) {
      throw new Error(`Task file not found: ${input.id}`);
    }
    await assertTaskBoundMutationAllowed(existing.taskId);
    const updated = await getServices().taskFileRepository.update(input);
    emitAppEvent('task.changed', updated.taskId);
    return updated;
  });

  ipcMain.handle('taskFile:delete', async (_event, id: string) => {
    const existing = await getServices().taskFileRepository.findById(id);
    if (!existing) {
      throw new Error(`Task file not found: ${id}`);
    }
    await assertTaskBoundMutationAllowed(existing.taskId);
    const deleted = await getServices().taskFileRepository.delete(id);
    emitAppEvent('task.changed', deleted.taskId);
    return deleted;
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

  ipcMain.handle('decision:listJudgments', async () => {
    return getServices().decisionService.listJudgments();
  });

  ipcMain.handle('decision:draft', async (_event, input: DraftDecisionInput) => {
    return getServices().decisionService.draft(input);
  });

  ipcMain.handle('decision:create', async (_event, input: CreateDecisionInput) => {
    const created = await getServices().decisionService.create(input);
    emitAppEvent('decision.changed', created.id);
    if (created.taskId) emitAppEvent('task.changed', created.taskId);
    return created;
  });

  ipcMain.handle('decision:act', async (_event, input: DecisionActionInput) => {
    const updated = await getServices().decisionService.act(input);
    emitAppEvent('decision.changed', updated.id);
    if (updated.taskId) emitAppEvent('task.changed', updated.taskId);
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
    const status = await getServices().aiConfigService.getStatus();
    if (status.runtimeMode && status.runtimeMode !== 'api') {
      const selectedRuntimeLabel = status.runtimeMode === 'codex' ? 'Codex CLI' : 'Claude Code';
      throw new Error(`当前选择的是 ${selectedRuntimeLabel}。旧版 API Run 入口不会在未确认的情况下切换到 Agent API Runtime；请使用当前选中的 Agent CLI 任务执行入口。`);
    }
    const created = await getServices().runService.trigger(input);
    emitAppEvent('run.changed', created.id);
    emitAppEvent('task.changed', created.taskId);
    emitAppEvent('brief.changed');
    return created;
  });

  ipcMain.handle('run:triggerAgentCli', async (_event, input: CreateAgentCliRunInput) => {
    const created = await getServices().agentCliRunService.trigger(input);
    emitAppEvent('run.changed', created.id);
    emitAppEvent('task.changed', created.taskId);
    emitAppEvent('brief.changed');
    return created;
  });

  ipcMain.handle('run:recordRuntimeNativeGoalRequest', async (_event, input: RecordRuntimeNativeGoalRequestInput) => {
    const created = await getServices().agentCliRunService.recordNativeGoalRequest(input);
    emitAppEvent('run.changed', created.id);
    emitAppEvent('task.changed', created.taskId);
    emitAppEvent('brief.changed');
    return created;
  });

  ipcMain.handle('run:cancelAgentCli', async (_event, input: CancelAgentCliRunInput) => {
    const result = await getServices().agentCliRunService.cancel(input);
    if (result.cancelled) {
      emitAppEvent('run.changed', result.runId);
      emitAppEvent('brief.changed');
    }
    return result;
  });

  ipcMain.handle('run:triggerCodeAgent', async (_event, input: CreateCodeAgentRunInput) => {
    const created = await getServices().codeAgentRunService.trigger(input);
    emitAppEvent('run.changed', created.id);
    emitAppEvent('task.changed', created.taskId);
    emitAppEvent('brief.changed');
    return created;
  });

  ipcMain.handle('run:triggerOperatorStarted', async (_event, input: OperatorStartedRunRequest) => {
    const created = await getServices().operatorStartedRunService.trigger(input);
    emitAppEvent('run.changed', created.id);
    emitAppEvent('task.changed', created.taskId);
    emitAppEvent('brief.changed');
    return created;
  });

  ipcMain.handle('run:continuePaused', async (_event, runId: string) => {
    const status = await getServices().aiConfigService.getStatus();
    if (status.runtimeMode && status.runtimeMode !== 'api') {
      const selectedRuntimeLabel = status.runtimeMode === 'codex' ? 'Codex CLI' : 'Claude Code';
      throw new Error(`当前选择的是 ${selectedRuntimeLabel}。旧版 API Run 续跑入口不会在未确认的情况下切换到 Agent API Runtime；请在 AI Runtime 中切回 Agent API Runtime 后再继续这个 paused run。`);
    }
    const updated = await getServices().runService.continuePausedRun(runId);
    emitAppEvent('run.changed', updated.id);
    emitAppEvent('task.changed', updated.taskId);
    emitAppEvent('brief.changed');
    return updated;
  });

  ipcMain.handle('ai:chat', async (_event, input: ChatInput) => {
    const status = await getServices().aiConfigService.getStatus();
    if (status.runtimeMode && status.runtimeMode !== 'api') {
      const selectedRuntimeLabel = status.runtimeMode === 'codex' ? 'Codex CLI' : 'Claude Code';
      throw new Error(`当前选择的是 ${selectedRuntimeLabel}。当前 API 聊天 adapter 不会在未确认的情况下切换到 Agent API Runtime。`);
    }
    const config = await getServices().aiConfigService.resolveRuntimeConfig();
    const model = getLanguageModel(config);
    const task = input.taskId
      ? await getServices().taskService.getDetail(input.taskId)
      : null;
    if (input.taskId && !task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }
    const keySources = task ? selectPromptKeySources(task.sourceContexts) : [];
    const completionCriteria = task?.completionCriteria?.slice(0, 5)
      .map((criterion) => `${criterion.status}: ${criterion.text}`)
      .join(' / ') || 'none';
    const recentArtifacts = task?.artifacts
      ? [...task.artifacts]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 5)
      .map((artifact) => `${artifact.title} (${artifact.kind})`)
        .join(', ')
      : 'none';
    const selectedFileContext = input.selectedFile
      ? [
          `Selected file: ${input.selectedFile.path} (${input.selectedFile.kind})${input.selectedFile.dirty ? ' [unsaved edits]' : ''}`,
          `Selected file preview: ${input.selectedFile.contentPreview ?? 'none'}`,
        ].join('\n')
      : 'Selected file: none';
    const taskContext = task
      ? [
          `Core Agent context:\n${TASKPLANE_CORE_AGENT_CONTEXT}`,
          `Task title: ${task.title}`,
          `State: ${task.state}`,
          `Risk: ${task.riskLevel}${task.riskNote ? ` (${task.riskNote})` : ''}`,
          `Summary: ${task.summary ?? 'none'}`,
          `Next step: ${task.nextStep ?? 'none'}`,
          `Waiting reason: ${task.waitingReason ?? task.activeWaitingItem?.reason ?? 'none'}`,
          `Active blocker: ${task.activeBlocker?.title ?? 'none'}`,
          `Resume: ${task.resumeCard.summary}`,
          `Suggested move: ${task.resumeCard.nextSuggestedMove}`,
          `Completion criteria: ${completionCriteria}`,
          `Recent artifacts: ${recentArtifacts}`,
          `Key sources: ${keySources.map(formatPromptSource).join(' / ') || 'none'}`,
          'Source freshness rule: prefer current-run, selected, key, or recently captured sources; do not treat older sources as current evidence unless they are stable references or explicitly selected.',
          selectedFileContext,
          `Recent activity: ${task.timeline.slice(-5).map((e) => `${e.type}${e.payload ? `=${e.payload}` : ''}`).join(' / ') || 'none'}`,
        ].join('\n')
      : null;
    const workHabitContext = input.workHabits?.length
      ? `\n\nApplicable confirmed work habits:\n${input.workHabits.slice(0, 5).map((habit) => `- ${habit}`).join('\n')}`
      : '';

    const behaviorContext = formatAiBehaviorPreferences(config.featureFlags);
    const systemPrompt = input.taskId
      ? `You are a helpful AI assistant inside Taskplane, a task management tool. The user is asking about a specific task. Use the persisted task context below as the source of truth. Treat applicable confirmed work habits as user preferences and quality criteria, but do not mention them unless relevant. Help them understand status, next steps, and risks. Reply in the same language as the user's message (Chinese or English).${behaviorContext}\n\n${taskContext ?? `Core Agent context:\n${TASKPLANE_CORE_AGENT_CONTEXT}\n\nTask ID: ${input.taskId}`}${workHabitContext}`
      : `You are a helpful AI assistant inside Taskplane, a task management tool. You have a global view of all tasks. Follow this read-only core Agent context when task work becomes durable:\n${TASKPLANE_CORE_AGENT_CONTEXT}\n\nTreat applicable confirmed work habits as user preferences and quality criteria, but do not mention them unless relevant. Help the user prioritize, plan, and think through their work. Reply in the same language as the user's message (Chinese or English).${behaviorContext}${workHabitContext}`;

    const result = await generateText({
      model,
      system: systemPrompt,
      messages: input.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const invocation = buildApiRuntimeChatAssistantInvocation({
      phase: input.taskId ? 'task_assistant' : 'global_assistant',
      pilotDecision: input.pilotDecision ?? null,
      runtimeLabel: `Agent API Runtime · ${config.provider} / ${config.model}`,
      text: result.text,
    });

    return {
      text: invocation.text,
      invocation: {
        phase: invocation.phase,
        layer: invocation.layer,
        runtime: {
          mode: 'api',
          label: invocation.runtime.label,
        },
        status: invocation.status,
        summary: invocation.summary,
        pilotDecision: invocation.pilotDecision ?? null,
      },
    };
  });

  ipcMain.handle('ai:decomposeProject', async (_event, input: ProjectDecompositionInput) => {
    const status = await getServices().aiConfigService.getStatus();
    if (status.runtimeMode && status.runtimeMode !== 'api') {
      const selectedRuntimeLabel = status.runtimeMode === 'codex' ? 'Codex CLI' : 'Claude Code';
      throw new Error(`当前选择的是 ${selectedRuntimeLabel}。项目拆解草案的所选 runtime adapter 尚未接入；Taskplane 不会在未确认的情况下切换到 Agent API Runtime。`);
    }
    const config = await getServices().aiConfigService.resolveRuntimeConfig();
    const model = getLanguageModel(config);
    const task = await getServices().taskService.getDetail(input.taskId);
    if (!task) throw new Error(`Task not found: ${input.taskId}`);
    if ((task.childTaskIds?.length ?? 0) > 0) {
      throw new Error('这个项目已经有子任务，应先推进或调整现有子任务，不应继续生成另一批拆解结果。');
    }
    const existingTasks = await getServices().taskService.list();
    const existingTaskNodes = [
      task,
      ...existingTasks.filter((existingTask) => existingTask.id !== task.id),
    ];
    const existingChildEvaluation = evaluateRuntimeSubtaskDraft({
      parentTask: task,
      proposedSubtasks: [],
      existingTasks: existingTaskNodes,
    });
    if (!existingChildEvaluation.allowed) {
      throw new Error(existingChildEvaluation.summary);
    }
    const keySources = selectPromptKeySources(task.sourceContexts);
    let habitSnapshot: Awaited<ReturnType<ReturnType<typeof getServices>['workHabitService']['getSnapshot']>> | null = null;
    try {
      habitSnapshot = await getServices().workHabitService.getSnapshot();
    } catch {
      habitSnapshot = null;
    }
    const applicableWorkHabitMatches = habitSnapshot
      ? selectApplicableWorkHabitMatches(habitSnapshot.habits, {
          taskTitle: task.title,
          taskTypeLabel: taskTypeWorkHabitLabel(task.taskType),
          projectLabel: projectWorkHabitLabel(task),
          limit: 4,
        })
      : [];
    const applicableWorkHabitSummaries = summarizeWorkHabitMatchesForPrompt(applicableWorkHabitMatches);

    const result = await generateText({
      model,
      system: [
        'You are Taskplane project decomposition planner.',
        'Read and follow this read-only Taskplane core Agent context before planning or creating task drafts:',
        TASKPLANE_CORE_AGENT_CONTEXT,
        'Phase-loaded execution and task-creation rules for this decomposition movement:',
        TASKPLANE_AGENT_PRINCIPLES,
        'Return only one valid JSON object. Do not wrap it in markdown.',
        'The JSON shape must be:',
        '{',
        '  "parentGoal": "one sentence",',
        '  "subtasks": [',
        '    {',
        '      "title": "short task title",',
        '      "summary": "what this child task accomplishes",',
        '      "acceptanceCriteria": "how the user can verify completion",',
        '      "dependency": "dependency or null",',
        '      "rationale": "why this is an independent but not over-small chunk"',
        '    }',
        '  ],',
        '  "review": "self-check of chunk size, independence, overlaps, missing criteria, and dependencies",',
        '  "nextStep": "what the user should confirm next"',
        '}',
        'Choose the number of subtasks from the actual project boundaries; most projects need 2 to 7, but do not split just to hit a number.',
        'Keep a single large child task when it is independently valuable; mark it for later re-decomposition instead of over-splitting now.',
        'Avoid generic phase templates. Preserve large, independently valuable chunks.',
        'Use applicable confirmed work habits and SOP templates as reference context and quality criteria; do not apply them mechanically when the project boundary differs.',
        'If the first decomposition is too fine, overlapping, missing acceptance criteria, or dependency-unclear, revise it before returning JSON.',
        'Reply in the same language as the task title and user instructions.',
      ].join('\n'),
      prompt: [
        `Project parent task: ${task.title}`,
        `Summary: ${task.summary ?? 'none'}`,
        `Next step: ${task.nextStep ?? 'none'}`,
        `Risk: ${task.riskLevel}${task.riskNote ? ` (${task.riskNote})` : ''}`,
        `Key sources: ${keySources.map(formatPromptSource).join(' / ') || 'none'}`,
        'Source freshness rule: prefer current-run, selected, key, or recently captured sources; do not treat older sources as current evidence unless they are stable references or explicitly selected.',
        `Applicable confirmed work habits: ${applicableWorkHabitSummaries.join(' / ') || 'none'}`,
        `Recent activity: ${task.timeline.slice(-5).map((event) => `${event.type}${event.payload ? `=${event.payload}` : ''}`).join(' / ') || 'none'}`,
        input.instructions?.trim() ? `User instructions: ${input.instructions.trim()}` : 'User instructions: none',
      ].join('\n'),
    });

    const decomposition = normalizeProjectDecompositionDraft(extractJsonObjectFromText(result.text));
    const draftEvaluation = evaluateRuntimeSubtaskDraft({
      parentTask: task,
      proposedSubtasks: decomposition.subtasks,
      existingTasks: existingTaskNodes,
    });
    if (!draftEvaluation.allowed) {
      throw new Error(draftEvaluation.summary);
    }
    const invocation = buildApiRuntimeDecompositionDraftInvocation({
      draft: decomposition,
      runtimeLabel: `Agent API Runtime · ${config.provider} / ${config.model}`,
    });
    const appliedHabitIds = applicableWorkHabitMatches.map((match) => match.habit.id);
    if (appliedHabitIds.length > 0) {
      try {
        await Promise.resolve(getServices().workHabitService.recordApplications(appliedHabitIds));
      } catch {
        // Habit usage telemetry should never block project decomposition.
      }
    }
    return {
      ...invocation.draft,
      invocation: {
        phase: invocation.phase,
        layer: invocation.layer,
        runtime: invocation.runtime,
        status: invocation.status,
        summary: invocation.summary,
      },
    };
  });
}
