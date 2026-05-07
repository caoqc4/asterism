import type {
  ChatInput,
  PingResponse,
  ProjectDecompositionInput,
  ProjectDecompositionResult,
  ProjectSubtaskDraft,
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
import type { CreateCodeAgentRunInput, CreateRunInput } from '../../shared/types/run.js';
import type { AiConfigInput, FeatureFlags } from '../../shared/types/settings.js';
import type { OperatorStartedRunRequest } from '../../shared/types/operator-started-run.js';
import type {
  CreateSourceContextInput,
  SourceContextRecord,
  UpdateSourceContextInput,
} from '../../shared/types/source-context.js';
import type {
  CompletionOverrideLearningSignalInput,
  CreateManualWorkHabitInput,
  ImportLegacyWorkHabitsInput,
  ResolveWorkHabitConflictInput,
  SopTemplateHabitInput,
  UpdateWorkHabitInput,
} from '../../shared/types/work-habit.js';
import type {
  CreateTaskInput,
  RecordTaskCompletionCheckInput,
  TransitionTaskInput,
  UpdateTaskInput,
} from '../../shared/types/task.js';

import { generateText } from 'ai';
import { buildAgentSandboxBackendStatus } from '../../shared/agent-sandbox-provider.js';
import { getServices } from '../bootstrap/services.js';
import { getLanguageModel } from '../executors/ai-client.js';
import { probeLocalContainerSandboxBackend } from '../domain/run/local-container-sandbox-backend.js';
import { evaluateSandboxedCodingProducerBackendReadiness } from '../domain/run/sandboxed-coding-producer-backend.js';
import { ipcMain } from '../electron.js';
import { emitAppEvent } from './event-bus.js';
import {
  selectApplicableWorkHabits,
  summarizeWorkHabitsForPrompt,
} from '../../shared/work-habit-rules.js';

const PING_CHANNEL = 'app:ping';

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return JSON.parse(trimmed);
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }
  throw new Error('Project decomposition response did not contain JSON.');
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function selectPromptKeySources(sourceContexts: SourceContextRecord[], maxItems = 3): SourceContextRecord[] {
  return sourceContexts
    .filter((source) => source.status === 'active' && source.isKey)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, maxItems);
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

function normalizeProjectDecomposition(value: unknown): ProjectDecompositionResult {
  if (!value || typeof value !== 'object') {
    throw new Error('Project decomposition response must be an object.');
  }
  const record = value as Record<string, unknown>;
  const rawSubtasks = Array.isArray(record.subtasks) ? record.subtasks : [];
  const subtasks: ProjectSubtaskDraft[] = rawSubtasks.slice(0, 8).map((item, index) => {
    const subtask = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const title = readString(subtask.title, `子任务 ${index + 1}`);
    return {
      title,
      summary: readString(subtask.summary, title),
      acceptanceCriteria: readString(subtask.acceptanceCriteria, '完成后能明确验收。'),
      dependency: readString(subtask.dependency) || null,
      rationale: readString(subtask.rationale, '保持为相对独立的大块任务。'),
    };
  }).filter((item) => item.title);

  if (subtasks.length === 0) {
    throw new Error('Project decomposition response did not include subtasks.');
  }

  return {
    parentGoal: readString(record.parentGoal, '明确项目目标并拆解可执行子任务。'),
    subtasks,
    review: readString(record.review, '已检查子任务边界、依赖和粒度。'),
    nextStep: readString(record.nextStep, '请确认是否创建这些子任务。'),
  };
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

  ipcMain.handle('task:recordCompletionCheck', async (_event, input: RecordTaskCompletionCheckInput) => {
    await getServices().taskService.recordCompletionCheck(input);
    emitAppEvent('task.changed', input.taskId);
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

  ipcMain.handle('workHabit:resolveConflict', async (_event, input: ResolveWorkHabitConflictInput) =>
    getServices().workHabitService.resolveConflict(input));

  ipcMain.handle('workHabit:recordCompletionOverride', async (_event, input: CompletionOverrideLearningSignalInput) =>
    getServices().workHabitService.recordCompletionOverride(input));

  ipcMain.handle('workHabit:recordSopTemplate', async (_event, input: SopTemplateHabitInput) =>
    getServices().workHabitService.recordSopTemplate(input));

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
    const updated = await getServices().runService.continuePausedRun(runId);
    emitAppEvent('run.changed', updated.id);
    emitAppEvent('task.changed', updated.taskId);
    emitAppEvent('brief.changed');
    return updated;
  });

  ipcMain.handle('ai:chat', async (_event, input: ChatInput) => {
    const config = await getServices().aiConfigService.resolveRuntimeConfig();
    const model = getLanguageModel(config);
    const task = input.taskId
      ? await getServices().taskService.getDetail(input.taskId).catch(() => null)
      : null;
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
    const taskContext = task
      ? [
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
          `Key sources: ${keySources.map((s) => s.title).join(', ') || 'none'}`,
          `Recent activity: ${task.timeline.slice(-5).map((e) => `${e.type}${e.payload ? `=${e.payload}` : ''}`).join(' / ') || 'none'}`,
        ].join('\n')
      : null;
    const workHabitContext = input.workHabits?.length
      ? `\n\nApplicable confirmed work habits:\n${input.workHabits.slice(0, 5).map((habit) => `- ${habit}`).join('\n')}`
      : '';

    const behaviorContext = formatAiBehaviorPreferences(config.featureFlags);
    const systemPrompt = input.taskId
      ? `You are a helpful AI assistant inside Taskplane, a task management tool. The user is asking about a specific task. Use the persisted task context below as the source of truth. Treat applicable confirmed work habits as user preferences and quality criteria, but do not mention them unless relevant. Help them understand status, next steps, and risks. Reply in the same language as the user's message (Chinese or English).${behaviorContext}\n\n${taskContext ?? `Task ID: ${input.taskId}`}${workHabitContext}`
      : `You are a helpful AI assistant inside Taskplane, a task management tool. You have a global view of all tasks. Treat applicable confirmed work habits as user preferences and quality criteria, but do not mention them unless relevant. Help the user prioritize, plan, and think through their work. Reply in the same language as the user's message (Chinese or English).${behaviorContext}${workHabitContext}`;

    const result = await generateText({
      model,
      system: systemPrompt,
      messages: input.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    return { text: result.text };
  });

  ipcMain.handle('ai:decomposeProject', async (_event, input: ProjectDecompositionInput) => {
    const config = await getServices().aiConfigService.resolveRuntimeConfig();
    const model = getLanguageModel(config);
    const task = await getServices().taskService.getDetail(input.taskId);
    if (!task) throw new Error(`Task not found: ${input.taskId}`);
    const keySources = selectPromptKeySources(task.sourceContexts);
    let habitSnapshot: Awaited<ReturnType<ReturnType<typeof getServices>['workHabitService']['getSnapshot']>> | null = null;
    try {
      habitSnapshot = await getServices().workHabitService.getSnapshot();
    } catch {
      habitSnapshot = null;
    }
    const applicableWorkHabits = habitSnapshot
      ? selectApplicableWorkHabits(habitSnapshot.habits, {
          taskTitle: task.title,
          projectLabel: task.title,
          limit: 4,
        })
      : [];
    const applicableWorkHabitSummaries = summarizeWorkHabitsForPrompt(applicableWorkHabits);

    const result = await generateText({
      model,
      system: [
        'You are Taskplane project decomposition planner.',
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
        `Key sources: ${keySources.map((source) => `${source.title}: ${source.note ?? source.content ?? source.uri ?? ''}`).join(' / ') || 'none'}`,
        `Applicable confirmed work habits: ${applicableWorkHabitSummaries.join(' / ') || 'none'}`,
        `Recent activity: ${task.timeline.slice(-5).map((event) => `${event.type}${event.payload ? `=${event.payload}` : ''}`).join(' / ') || 'none'}`,
        input.instructions?.trim() ? `User instructions: ${input.instructions.trim()}` : 'User instructions: none',
      ].join('\n'),
    });

    const decomposition = normalizeProjectDecomposition(extractJsonObject(result.text));
    const appliedHabitIds = applicableWorkHabits.map((habit) => habit.id);
    if (appliedHabitIds.length > 0) {
      try {
        await Promise.resolve(getServices().workHabitService.recordApplications(appliedHabitIds));
      } catch {
        // Habit usage telemetry should never block project decomposition.
      }
    }
    return decomposition;
  });
}
