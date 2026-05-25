import type { AgentCliRuntimeId } from './agent-cli-runtime-status.js';
import type { RuntimeContextManifest } from './runtime-context.js';
import type { AgentCliRunSandboxMode } from './types/run.js';
import type { TaskDetail, TimelineEventRecord } from './types/task.js';

export type AgentRuntimeExecutionKind = 'cli' | 'api';

export type NativeGoalModeAvailability =
  | 'available'
  | 'requires_update'
  | 'unknown'
  | 'unsupported';

export type NativeGoalModeCapability = {
  availability: NativeGoalModeAvailability;
  minimumVersion: string | null;
  reason: string;
};

export type AgentRuntimeNativeCapabilityAvailability =
  | 'available'
  | 'product_controlled'
  | 'runtime_dependent'
  | 'unverified'
  | 'unsupported';

export type AgentRuntimeNativeCapabilityDeclaration = {
  availability: AgentRuntimeNativeCapabilityAvailability;
  label: string;
  reason: string;
};

export type AgentRuntimeNativeCapabilitySet = {
  structuredProgressEvents: AgentRuntimeNativeCapabilityDeclaration;
  webSearch: AgentRuntimeNativeCapabilityDeclaration;
  workspaceRead: AgentRuntimeNativeCapabilityDeclaration;
  workspaceWrite: AgentRuntimeNativeCapabilityDeclaration;
  hooks: AgentRuntimeNativeCapabilityDeclaration;
  subagents: AgentRuntimeNativeCapabilityDeclaration;
  memory: AgentRuntimeNativeCapabilityDeclaration;
  compact: AgentRuntimeNativeCapabilityDeclaration;
  clear: AgentRuntimeNativeCapabilityDeclaration;
};

export type AgentRuntimeAdapterCapabilities = {
  id: AgentCliRuntimeId | 'agent_api';
  label: string;
  executionKind: AgentRuntimeExecutionKind;
  supportsSingleRun: boolean;
  supportsPersistentSession?: boolean;
  supportsNativeGoalMode: boolean;
  supportsNativeClear?: boolean;
  supportsNativeCompact?: boolean;
  supportsNativeResume?: boolean;
  supportsPauseGoal: boolean;
  supportsResumeGoal: boolean;
  supportsClearGoal: boolean;
  supportsStructuredProgressEvents: boolean;
  supportsWorkspaceWrite: boolean;
  defaultResetStrategy?: 'product_transcript_reset' | 'runtime_native_clear' | 'runtime_restart';
  defaultPermissionMode: 'read_only' | 'plan' | 'workspace_write';
  nativeGoalMode: NativeGoalModeCapability;
  nativeCapabilities?: AgentRuntimeNativeCapabilitySet;
  commandRouting: {
    productOwned: string[];
    runtimeNative: string[];
    passthroughRequiresExplicitNamespace: boolean;
  };
};

export type RunGoalContract = {
  id: string;
  taskId: string;
  taskTitle: string;
  taskGoal: TaskGoalLifecycleState;
  executionKind: AgentRuntimeExecutionKind;
  runtimeId: AgentCliRuntimeId | 'agent_api';
  runtimeLabel: string;
  sandboxMode: AgentCliRunSandboxMode | 'plan' | 'workspace-write';
  userRequest: string;
  objective: string;
  completionConditions: string[];
  validationEvidence: string[];
  constraints: string[];
  runtimeCapabilities: string[];
  contextManifestSummary: string;
  contextGateSummary: string;
  expectedOutput: string[];
};

export type AgentRuntimeSlashCommand =
  | { kind: 'none' }
  | { kind: 'product_goal_set'; objective: string }
  | { kind: 'product_goal_status' }
  | { kind: 'product_goal_pause' }
  | { kind: 'product_goal_resume' }
  | { kind: 'product_goal_clear' }
  | { kind: 'product_status' }
  | { kind: 'product_cancel' }
  | { kind: 'runtime_native_goal'; runtimeId: AgentCliRuntimeId | 'selected'; objective: string }
  | { kind: 'unknown'; command: string };

export type RuntimeNativeGoalForwardingDecision = {
  forwarded: false;
  reason: string;
  supportsNativeGoalMode: boolean;
  passthroughRequiresExplicitNamespace: boolean | null;
  policy:
    | 'capability_unavailable'
    | 'native_goal_disabled'
    | 'native_goal_unverified'
    | 'runtime_requires_update'
    | 'passthrough_entrypoint_closed';
};

export type TaskGoalLifecycleStatus = 'unset' | 'active' | 'paused' | 'cleared';

export type TaskGoalLifecycleState = {
  objective: string | null;
  completionConditions: string[];
  previousObjective: string | null;
  source: string | null;
  status: TaskGoalLifecycleStatus;
  updatedAt: string | null;
};

export type ProductGoalDraft = {
  objective: string;
  completionConditions: string[];
};

export function parseAgentRuntimeSlashCommand(input: string): AgentRuntimeSlashCommand {
  const text = input.trim();
  if (!text.startsWith('/')) return { kind: 'none' };
  const match = text.match(/^\/([a-zA-Z][\w-]*)(?:\s+([\s\S]*))?$/);
  if (!match) return { kind: 'unknown', command: text.split(/\s+/, 1)[0] ?? '/' };
  const command = match[1].toLowerCase();
  const arg = (match[2] ?? '').trim();

  if (command === 'goal') {
    const goalAction = arg.toLowerCase();
    if (!arg || goalAction === 'status') return { kind: 'product_goal_status' };
    if (goalAction === 'pause') return { kind: 'product_goal_pause' };
    if (goalAction === 'resume') return { kind: 'product_goal_resume' };
    if (['clear', 'stop', 'off', 'reset', 'none', 'cancel'].includes(goalAction)) {
      return { kind: 'product_goal_clear' };
    }
    return { kind: 'product_goal_set', objective: arg };
  }

  if (command === 'status') return { kind: 'product_status' };
  if (command === 'cancel') return { kind: 'product_cancel' };

  if (command === 'runtime' && (arg.toLowerCase() === 'goal' || arg.toLowerCase().startsWith('goal '))) {
    const objective = arg.slice(5).trim();
    return objective
      ? { kind: 'runtime_native_goal', runtimeId: 'selected', objective }
      : { kind: 'unknown', command: '/runtime goal' };
  }
  if ((command === 'codex' || command === 'claude') && (arg.toLowerCase() === 'goal' || arg.toLowerCase().startsWith('goal '))) {
    const objective = arg.slice(5).trim();
    return objective
      ? { kind: 'runtime_native_goal', runtimeId: command, objective }
      : { kind: 'unknown', command: `/${command} goal` };
  }

  return { kind: 'unknown', command: `/${command}` };
}

export function evaluateRuntimeNativeGoalForwarding(
  capabilities: AgentRuntimeAdapterCapabilities | null | undefined,
): RuntimeNativeGoalForwardingDecision {
  if (!capabilities) {
    return {
      forwarded: false,
      passthroughRequiresExplicitNamespace: null,
      policy: 'capability_unavailable',
      reason: 'Adapter capability is unavailable.',
      supportsNativeGoalMode: false,
    };
  }

  if (!capabilities.supportsNativeGoalMode) {
    const nativeGoalMode = capabilities.nativeGoalMode;
    const policy = nativeGoalMode.availability === 'requires_update'
      ? 'runtime_requires_update'
      : nativeGoalMode.availability === 'unknown'
        ? 'native_goal_unverified'
        : 'native_goal_disabled';
    return {
      forwarded: false,
      passthroughRequiresExplicitNamespace: capabilities.commandRouting.passthroughRequiresExplicitNamespace,
      policy,
      reason: nativeGoalMode.reason || 'Adapter native goal capability is disabled.',
      supportsNativeGoalMode: false,
    };
  }

  return {
    forwarded: false,
    passthroughRequiresExplicitNamespace: capabilities.commandRouting.passthroughRequiresExplicitNamespace,
    policy: 'passthrough_entrypoint_closed',
    reason: 'Adapter declares native goal support, but Taskplane passthrough entrypoint is not open yet.',
    supportsNativeGoalMode: true,
  };
}

export function parseProductGoalDraft(input: string): ProductGoalDraft {
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const objectiveLines: string[] = [];
  const completionConditions: string[] = [];
  let readingConditions = false;

  for (const line of lines) {
    const headingMatch = line.match(/^(?:验收|验收条件|完成条件|acceptance|acceptance criteria|done when)\s*[:：]\s*(.*)$/i);
    if (headingMatch) {
      readingConditions = true;
      completionConditions.push(...splitGoalCompletionConditions(headingMatch[1] ?? ''));
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (readingConditions && bulletMatch) {
      completionConditions.push(...splitGoalCompletionConditions(bulletMatch[1] ?? ''));
      continue;
    }

    objectiveLines.push(line);
  }

  return {
    objective: objectiveLines.join('\n').trim(),
    completionConditions: uniqueCleanStrings(completionConditions),
  };
}

export function deriveTaskGoalLifecycleState(params: {
  fallbackGoal?: string | null;
  nextStep?: string | null;
  timeline?: TimelineEventRecord[];
}): TaskGoalLifecycleState {
  const baseGoal = cleanGoal(params.nextStep) ?? cleanGoal(params.fallbackGoal);
  const goalEvents = (params.timeline ?? [])
    .filter((event) => [
      'panel.task_goal_updated',
      'panel.task_goal_paused',
      'panel.task_goal_resumed',
    ].includes(event.type))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const latest = goalEvents[0];
  if (!latest) {
    return {
      objective: baseGoal,
      completionConditions: [],
      previousObjective: null,
      source: null,
      status: baseGoal ? 'active' : 'unset',
      updatedAt: null,
    };
  }

  const payload = parseGoalLifecyclePayload(latest.payload);
  const objective = cleanGoal(payload.objective) ?? baseGoal;
  const completionConditions = cleanGoalList(payload.completionConditions);
  const previousObjective = cleanGoal(payload.previousObjective);
  const source = cleanGoal(payload.source);

  if (latest.type === 'panel.task_goal_updated' && payload.cleared === true) {
    return {
      objective: null,
      completionConditions,
      previousObjective: previousObjective ?? baseGoal,
      source,
      status: 'cleared',
      updatedAt: latest.createdAt,
    };
  }
  if (latest.type === 'panel.task_goal_paused') {
    return {
      objective: objective ?? previousObjective,
      completionConditions,
      previousObjective,
      source,
      status: 'paused',
      updatedAt: latest.createdAt,
    };
  }
  if (latest.type === 'panel.task_goal_resumed') {
    return {
      objective,
      completionConditions,
      previousObjective,
      source,
      status: objective ? 'active' : 'unset',
      updatedAt: latest.createdAt,
    };
  }

  return {
    objective,
    completionConditions,
    previousObjective,
    source,
    status: objective ? 'active' : 'unset',
    updatedAt: latest.createdAt,
  };
}

export function buildRunGoalContract(params: {
  contextGateSummary: string;
  contextManifest: RuntimeContextManifest;
  executionKind: AgentRuntimeExecutionKind;
  prompt: string;
  runId: string;
  runtimeCapabilities?: AgentRuntimeAdapterCapabilities | null;
  runtimeId: RunGoalContract['runtimeId'];
  runtimeLabel: string;
  sandboxMode: RunGoalContract['sandboxMode'];
  task: TaskDetail;
}): RunGoalContract {
  const completionConditions = params.task.completionCriteria
    .map((criteria) => criteria.text.trim())
    .filter(Boolean);
  const taskGoal = deriveTaskGoalLifecycleState({
    fallbackGoal: params.task.resumeCard?.nextSuggestedMove,
    nextStep: params.task.nextStep,
    timeline: params.task.timeline,
  });
  const activeGoal = taskGoal.status === 'active' ? taskGoal.objective : null;
  const runCompletionConditions = uniqueCleanStrings([
    ...completionConditions,
    ...(taskGoal.status === 'active' ? taskGoal.completionConditions : []),
  ]);
  const childTaskConversation = isChildTaskConversationRequest(params.prompt);
  return {
    id: params.runId,
    taskId: params.task.id,
    taskTitle: params.task.title,
    taskGoal,
    executionKind: params.executionKind,
    runtimeId: params.runtimeId,
    runtimeLabel: params.runtimeLabel,
    sandboxMode: params.sandboxMode,
    userRequest: params.prompt,
    objective: activeGoal || params.prompt,
    completionConditions: runCompletionConditions.length
      ? runCompletionConditions
      : childTaskConversation
        ? ['本次 Agent run 应围绕当前子任务推进一轮简短对话；若上下文足够，先形成首版边界、调研/执行动作或草稿，只有用户拍板会改变目标、风险或交付边界时才收束为关键问题。']
        : ['本次 Agent run 应回答用户请求，并给出下一步、风险和验证建议。'],
    validationEvidence: [
      'Agent terminal step exits successfully or records a failure reason.',
      'Run output is persisted as run evidence.',
      'Workspace write permission remains unavailable unless Taskplane explicitly enables it.',
    ],
    constraints: [
      'Do not modify files unless the selected runtime mode explicitly grants write permission.',
      'Do not claim External Access, Skills, or MCP live tool access from context-only capability summaries.',
      'Do not mark the task complete without Taskplane verification or user confirmation.',
      params.sandboxMode === 'read-only'
        ? 'Codex runs with read-only sandbox intent; Claude runs in plan mode when selected.'
        : `Runtime permission mode: ${params.sandboxMode}.`,
    ],
    runtimeCapabilities: formatRuntimeCapabilityDeclarations(params.runtimeCapabilities),
    contextManifestSummary: params.contextManifest.summary,
    contextGateSummary: params.contextGateSummary,
    expectedOutput: [
      ...(childTaskConversation
        ? ['简短判断', '聚焦澄清问题']
        : ['Key findings', 'Recommended next step', 'Risks or open questions', 'Verification checks']),
    ],
  };
}

export function formatRuntimeCapabilityDeclarations(
  capabilities: AgentRuntimeAdapterCapabilities | null | undefined,
): string[] {
  if (!capabilities) return ['adapter_capabilities=unavailable'];

  const native = capabilities.nativeCapabilities;
  return uniqueCleanStrings([
    `runtime=${capabilities.label}`,
    `execution=${capabilities.executionKind}`,
    `default_permission=${capabilities.defaultPermissionMode}`,
    `native_goal=${capabilities.nativeGoalMode.availability}`,
    `structured_events=${native?.structuredProgressEvents.availability ?? (capabilities.supportsStructuredProgressEvents ? 'available' : 'unsupported')}`,
    native ? `web_search=${native.webSearch.availability}` : null,
    native ? `workspace_read=${native.workspaceRead.availability}` : null,
    `workspace_write=${native?.workspaceWrite.availability ?? (capabilities.supportsWorkspaceWrite ? 'available' : 'unsupported')}`,
    native ? `hooks=${native.hooks.availability}` : null,
    native ? `subagents=${native.subagents.availability}` : null,
    native ? `memory=${native.memory.availability}` : null,
    native ? `compact=${native.compact.availability}` : null,
    native ? `clear=${native.clear.availability}` : null,
    capabilities.defaultResetStrategy ? `reset=${capabilities.defaultResetStrategy}` : null,
  ].filter((item): item is string => item !== null));
}

function isChildTaskConversationRequest(prompt: string): boolean {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  return /推进子任务|正在推进子任务|当前子任务|确认这个子任务|current child task|advance.{0,16}child task/i.test(normalized);
}

function parseGoalLifecyclePayload(payload: string | null): Record<string, unknown> {
  if (!payload) return {};
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function cleanGoal(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanGoalList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueCleanStrings(value.filter((item): item is string => typeof item === 'string'));
}

function splitGoalCompletionConditions(value: string): string[] {
  return value
    .split(/\s*(?:[;；]|\|)\s*/)
    .map((item) => item.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);
}

function uniqueCleanStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

export function formatRunGoalContractForStep(contract: RunGoalContract): string {
  return [
    `runtime=${contract.runtimeLabel}`,
    `sandbox=${contract.sandboxMode}`,
    `taskGoal=${contract.taskGoal.status}`,
    `objective=${contract.objective}`,
    `completionConditions=${contract.completionConditions.length}`,
    `validationEvidence=${contract.validationEvidence.length}`,
    `constraints=${contract.constraints.length}`,
    `runtimeCapabilities=${contract.runtimeCapabilities.length}`,
    contract.contextGateSummary,
    contract.contextManifestSummary,
  ].join(' / ');
}

export function formatRunGoalContractForPrompt(contract: RunGoalContract): string {
  return [
    `- Task Goal: status=${contract.taskGoal.status}; objective=${contract.taskGoal.objective ?? 'none'}; source=${contract.taskGoal.source ?? 'task_state'}`,
    `- Objective: ${contract.objective}`,
    `- Completion conditions: ${contract.completionConditions.join(' | ')}`,
    `- Validation evidence expected: ${contract.validationEvidence.join(' | ')}`,
    `- Constraints: ${contract.constraints.join(' | ')}`,
    `- Runtime capabilities: ${contract.runtimeCapabilities.join(' | ')}`,
    `- Expected output: ${contract.expectedOutput.join(' | ')}`,
  ].join('\n');
}
