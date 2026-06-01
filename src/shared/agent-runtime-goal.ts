import type { AgentCliRuntimeId } from './agent-cli-runtime-status.js';
import {
  chooseContextResetStrategy,
  type ContextResetStrategy,
  type ContextTransitionEvaluation,
} from './context-transition.js';
import type { ContextOwner } from './context-owner.js';
import { formatContextOwnerForSummary } from './context-owner.js';
import type { AgentRuntimeVerifierResult } from './agent-runtime-verifier.js';
import type { BusinessMemoryCoverageEvaluation, BusinessMemoryRequiredWrite } from './business-memory-coverage.js';
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

export type GoalContextTransitionAction = 'compact' | 'reset';

export type GoalStopConditionStatus =
  | 'met'
  | 'missing'
  | 'not_met';

export type GoalContextTransitionStatus =
  | 'allowed'
  | 'blocked';

export type GoalContextTransitionNextAction =
  | 'compact_with_product_transcript_reset'
  | 'compact_with_runtime_native_compact'
  | 'reset_with_product_transcript_reset'
  | 'reset_with_runtime_native_clear'
  | 'restart_runtime_session'
  | 'define_goal_objective'
  | 'define_verifier_or_stop_condition'
  | 'resolve_pending_decision'
  | 'record_run_evidence'
  | 'define_next_safe_action'
  | 'complete_or_review_goal'
  | 'write_business_memory'
  | 'ask_for_recovery_clarification'
  | 'preserve_context_first'
  | 'keep_context';

export type NativeRuntimeResetEvidence = {
  nativeClearCompleted?: boolean;
  nativeCompactCompleted?: boolean;
  runtimeSessionId?: string | null;
  adapterEvidenceId?: string | null;
};

export type GoalStopConditionInput = {
  description?: string | null;
  status: GoalStopConditionStatus;
};

export type GoalContextTransitionInput = {
  action: GoalContextTransitionAction;
  adapterEvidence?: NativeRuntimeResetEvidence | null;
  businessMemoryCoverage: BusinessMemoryCoverageEvaluation;
  contextTransition?: ContextTransitionEvaluation | null;
  contract: RunGoalContract;
  hasPendingDecision?: boolean;
  hasRecentRunEvidence?: boolean;
  nextSafeAction?: string | null;
  owner: ContextOwner;
  runtimeCapabilities?: AgentRuntimeAdapterCapabilities | null;
  stopCondition?: GoalStopConditionInput | null;
  verifier?: Pick<AgentRuntimeVerifierResult, 'verdict' | 'decision' | 'reason' | 'evidence' | 'missingEvidence'> | null;
};

export type GoalContextTransitionEvaluation = {
  action: GoalContextTransitionAction;
  canCompact: boolean;
  canReset: boolean;
  evidence: string[];
  missing: string[];
  nativeRuntimeMemoryCleared: boolean;
  nativeRuntimeResetClaim: 'adapter_evidence_present' | 'not_claimed';
  nextAction: GoalContextTransitionNextAction;
  ownerSummary: string;
  reason: string;
  requiredWrites: BusinessMemoryRequiredWrite[];
  resetStrategy: ContextResetStrategy;
  status: GoalContextTransitionStatus;
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

export function evaluateGoalContextTransitionReadiness(
  input: GoalContextTransitionInput,
): GoalContextTransitionEvaluation {
  const resetStrategy = chooseContextResetStrategy({
    preferCompact: input.action === 'compact',
    runtimeCapabilities: input.runtimeCapabilities ?? null,
  });
  const ownerSummary = formatContextOwnerForSummary(input.owner);
  const evidence = [
    `goal=${input.contract.objective ? 'present' : 'missing'}`,
    `owner=${ownerSummary}`,
    `businessCoverage=${input.businessMemoryCoverage.status}`,
    `preservationProof=${input.businessMemoryCoverage.preservationProofReady ? 'ready' : 'missing'}`,
    `pendingDecision=${input.hasPendingDecision ? 'yes' : 'no'}`,
    `runEvidence=${input.hasRecentRunEvidence ? 'present' : 'missing'}`,
    `nextSafeAction=${cleanGoal(input.nextSafeAction) ? 'present' : 'missing'}`,
    `verifier=${input.verifier?.verdict ?? 'missing'}`,
    `stopCondition=${input.stopCondition?.status ?? 'missing'}`,
    `resetStrategy=${resetStrategy}`,
  ];

  const missing: string[] = [];
  let nextAction: GoalContextTransitionNextAction | null = null;
  const goalObjective = cleanGoal(input.contract.objective) ?? cleanGoal(input.contract.taskGoal.objective);
  const hasVerifier = Boolean(input.verifier);
  const stopConditionStatus = input.stopCondition?.status ?? 'missing';
  const hasStopCondition = stopConditionStatus !== 'missing';
  const nextSafeAction = cleanGoal(input.nextSafeAction);

  if (!goalObjective) {
    missing.push('Goal objective is missing.');
    nextAction ??= 'define_goal_objective';
  }
  if (!hasVerifier && !hasStopCondition) {
    missing.push('A verifier result or stop condition is required before compact/reset.');
    nextAction ??= 'define_verifier_or_stop_condition';
  }
  if (input.verifier?.verdict === 'fail') {
    missing.push(input.verifier.reason || 'Verifier failed; inspect run result before context transition.');
    nextAction ??= 'keep_context';
  }
  if (input.verifier?.verdict === 'warn') {
    missing.push(input.verifier.missingEvidence[0] ?? input.verifier.reason ?? 'Verifier warning still needs evidence.');
    nextAction ??= 'record_run_evidence';
  }
  if (stopConditionStatus === 'met') {
    missing.push('Goal stop condition is met; review or close the goal instead of compacting/resetting for continuation.');
    nextAction ??= 'complete_or_review_goal';
  }
  if (input.hasPendingDecision) {
    missing.push('A pending Decision must be resolved before compact/reset.');
    nextAction ??= 'resolve_pending_decision';
  }
  if (!input.hasRecentRunEvidence) {
    missing.push('Recent run evidence is required for goal continuation recovery.');
    nextAction ??= 'record_run_evidence';
  }
  if (!nextSafeAction) {
    missing.push('Next safe action is required for rehydration after compact/reset.');
    nextAction ??= 'define_next_safe_action';
  }
  if (input.businessMemoryCoverage.status !== 'pass' || !input.businessMemoryCoverage.preservationProofReady) {
    missing.push(...input.businessMemoryCoverage.missing);
    nextAction ??= input.businessMemoryCoverage.requiredWrites.length
      ? 'write_business_memory'
      : input.businessMemoryCoverage.requiresUserClarification
        ? 'ask_for_recovery_clarification'
        : 'preserve_context_first';
  }
  if (input.contextTransition && input.contextTransition.preservation.status !== 'covered') {
    missing.push(input.contextTransition.preservation.reason);
    nextAction ??= 'preserve_context_first';
  }

  const nativeRuntimeMemoryCleared = Boolean(
    resetStrategy === 'runtime_native_clear'
    && input.adapterEvidence?.nativeClearCompleted
    && cleanGoal(input.adapterEvidence.runtimeSessionId),
  );
  const nativeRuntimeCompactCompleted = Boolean(
    resetStrategy === 'runtime_compact'
    && input.adapterEvidence?.nativeCompactCompleted
    && cleanGoal(input.adapterEvidence.runtimeSessionId),
  );
  const nativeRuntimeResetClaim = nativeRuntimeMemoryCleared || nativeRuntimeCompactCompleted
    ? 'adapter_evidence_present'
    : 'not_claimed';

  if (missing.length > 0) {
    return {
      action: input.action,
      canCompact: false,
      canReset: false,
      evidence: [
        ...evidence,
        `nativeRuntimeMemoryCleared=${nativeRuntimeMemoryCleared ? 'yes' : 'no'}`,
        `nativeRuntimeResetClaim=${nativeRuntimeResetClaim}`,
      ],
      missing: uniqueCleanStrings(missing),
      nativeRuntimeMemoryCleared,
      nativeRuntimeResetClaim,
      nextAction: nextAction ?? 'keep_context',
      ownerSummary,
      reason: uniqueCleanStrings(missing).join(' '),
      requiredWrites: input.businessMemoryCoverage.requiredWrites,
      resetStrategy,
      status: 'blocked',
    };
  }

  return {
    action: input.action,
    canCompact: input.action === 'compact',
    canReset: input.action === 'reset',
    evidence: [
      ...evidence,
      `nativeRuntimeMemoryCleared=${nativeRuntimeMemoryCleared ? 'yes' : 'no'}`,
      `nativeRuntimeResetClaim=${nativeRuntimeResetClaim}`,
      nextSafeAction ? `nextSafeActionText=${nextSafeAction}` : null,
    ].filter((item): item is string => item !== null),
    missing: [],
    nativeRuntimeMemoryCleared,
    nativeRuntimeResetClaim,
    nextAction: goalContextNextActionForStrategy(input.action, resetStrategy),
    ownerSummary,
    reason: 'Goal context transition is safe: owner, verifier/stop condition, preservation proof, run evidence, and next safe action are recoverable.',
    requiredWrites: [],
    resetStrategy,
    status: 'allowed',
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

function goalContextNextActionForStrategy(
  action: GoalContextTransitionAction,
  resetStrategy: ContextResetStrategy,
): GoalContextTransitionNextAction {
  if (resetStrategy === 'runtime_compact') return 'compact_with_runtime_native_compact';
  if (resetStrategy === 'runtime_native_clear') return 'reset_with_runtime_native_clear';
  if (resetStrategy === 'runtime_restart') return 'restart_runtime_session';
  if (action === 'compact') return 'compact_with_product_transcript_reset';
  return 'reset_with_product_transcript_reset';
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
