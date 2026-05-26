import {
  buildDefaultAgentToolExecutionPolicy,
  validateAgentToolExecutionPolicy,
  type AgentToolExecutionPolicy,
  type AgentToolScaffoldFamily,
  type AgentToolScaffoldFamilySummary,
} from './agent-tool-scaffold.js';
import {
  validateOperatorStartedRunRequest,
  type OperatorStartedRunRequest,
} from './types/operator-started-run.js';
import type { CodeAgentAllowedCheck, CreateCodeAgentRunInput, RunStatus } from './types/run.js';
import type { AiConfigStatus } from './types/settings.js';
import type { TaskDetail } from './types/task.js';

export type ExecutionRuntimeStatus = 'not_checked' | 'ready' | 'blocked' | 'offline';
export type ExecutionRuntimeKind =
  | 'browser_session'
  | 'creator_connector'
  | 'external_cli'
  | 'local_sandbox'
  | 'mcp_client'
  | 'remote_sandbox';

export type AgentRunLifecycleStage =
  | 'drafted'
  | 'queued'
  | 'claimed'
  | 'running'
  | 'paused'
  | 'needs_confirmation'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ExecutionRuntimeSnapshot = {
  id: string;
  displayName: string;
  kind: ExecutionRuntimeKind;
  status: ExecutionRuntimeStatus;
  capabilityFamilies: AgentToolScaffoldFamily[];
  policySummary: string;
  readinessSummary: string;
};

export type AgentProfileSnapshot = {
  id: string;
  displayName: string;
  role: string;
  allowedToolFamilies: AgentToolScaffoldFamily[];
  automationReadiness: 'disabled' | 'diagnostic_only' | 'eligible';
  summary: string;
};

export type AgentRunLifecycleSnapshot = {
  currentStage: AgentRunLifecycleStage;
  startMode: 'manual_or_operator_started';
  queueEnabled: false;
  claimEnabled: false;
  schedulerEnabled: false;
  automaticStartEnabled: false;
  summary: string;
};

export type AgentRunLifecycleProjection = {
  currentStage: AgentRunLifecycleStage;
  runStatus: RunStatus;
  startMode: AgentExecutionOrchestrationStartMode;
  queueEnabled: false;
  claimEnabled: false;
  automaticStartEnabled: false;
  summary: string;
};

export type AgentAutomationReadinessState = 'blocked' | 'diagnostic_only' | 'eligible';

export type AgentAutomationReadinessEvaluation = {
  state: AgentAutomationReadinessState;
  automaticStartAllowed: false;
  blockedReasons: string[];
  evidence: string[];
  summary: string;
};

export type AgentExecutionOrchestrationSnapshot = {
  runtime: ExecutionRuntimeSnapshot;
  profile: AgentProfileSnapshot;
  lifecycle: AgentRunLifecycleSnapshot;
  hiddenFamilies: AgentToolScaffoldFamily[];
  summary: string;
};

export type AgentExecutionOrchestrationLane =
  | 'browser_evidence'
  | 'coding'
  | 'creator'
  | 'general';

export type AgentExecutionOrchestrationStartMode =
  | 'manual'
  | 'operator_started'
  | 'policy_auto';

export type AgentExecutionOrchestrationRequiredInput = {
  key: string;
  present: boolean;
  reason: string;
};

export type AgentExecutionOrchestrationRequest = {
  idempotencyKey: string;
  taskId: string;
  lane: AgentExecutionOrchestrationLane;
  profileId: string;
  runtimeId: string;
  startMode: AgentExecutionOrchestrationStartMode;
  policy: AgentToolExecutionPolicy;
  requiredInputs: AgentExecutionOrchestrationRequiredInput[];
  operatorConfirmed: true;
  schedulerAllowed: false;
  automaticStartAllowed: false;
  providerCallAllowed: boolean;
  source:
    | {
        kind: 'code_agent_preview';
        requestedChecks: CodeAgentAllowedCheck[];
        useModelProducer: boolean;
        contextFileCount: number;
      }
    | {
        kind: 'operator_started_run';
        operatorKind: OperatorStartedRunRequest['kind'];
        descriptorId: string;
      };
  summary: string;
};

export type AgentExecutionOrchestrationRequestValidation =
  | {
      blockedReasons: [];
      request: AgentExecutionOrchestrationRequest;
      summary: string;
      valid: true;
    }
  | {
      blockedReasons: string[];
      summary: string;
      valid: false;
    };

const RESERVED_CONNECTOR_FAMILIES: AgentToolScaffoldFamily[] = [
  'browser_playwright',
  'mcp',
  'skill',
  'computer_use',
  'creator_connector',
];

export function buildAgentExecutionOrchestrationSnapshot(
  aiStatus: Pick<
    AiConfigStatus,
    'featureFlags' | 'sandboxBackendStatus' | 'toolScaffoldSummaries' | 'workspaceRoot'
  > | null,
): AgentExecutionOrchestrationSnapshot {
  const runtime = buildLocalSandboxRuntimeSnapshot(aiStatus);
  const profile = buildManualCodeAgentProfileSnapshot();
  const lifecycle = buildManualOnlyLifecycleSnapshot(aiStatus);
  const hiddenFamilies = getHiddenReservedFamilies(aiStatus?.toolScaffoldSummaries ?? []);

  return {
    runtime,
    profile,
    lifecycle,
    hiddenFamilies,
    summary: [
      'Orchestration snapshot',
      `runtime=${runtime.status}`,
      `profile=${profile.id}`,
      `lifecycle=${lifecycle.currentStage}`,
      `queue=${lifecycle.queueEnabled ? 'yes' : 'no'}`,
      `autoStart=${lifecycle.automaticStartEnabled ? 'yes' : 'no'}`,
      `hidden=${hiddenFamilies.length ? hiddenFamilies.join(',') : 'none'}`,
    ].join(' / '),
  };
}

function buildLocalSandboxRuntimeSnapshot(
  aiStatus: Pick<AiConfigStatus, 'featureFlags' | 'sandboxBackendStatus' | 'workspaceRoot'> | null,
): ExecutionRuntimeSnapshot {
  const producerReadiness = aiStatus?.sandboxBackendStatus?.producerBackendReadiness;
  const backendReadiness = aiStatus?.sandboxBackendStatus?.readiness;
  const hasProbe = Boolean(aiStatus?.sandboxBackendStatus?.probe);
  const status: ExecutionRuntimeStatus = !hasProbe
    ? 'not_checked'
    : producerReadiness?.ready || backendReadiness?.ready
      ? 'ready'
      : 'blocked';
  const readinessSummary = producerReadiness?.summary
    ?? backendReadiness?.summary
    ?? 'Sandbox runtime readiness has not been checked.';

  return {
    id: 'local_sandbox',
    displayName: 'Local Sandbox Runtime',
    kind: 'local_sandbox',
    status,
    capabilityFamilies: ['workspace_coding'],
    policySummary: [
      `workspace=${aiStatus?.workspaceRoot ? 'configured' : 'default'}`,
      `network=${aiStatus?.featureFlags.enableSandboxCodingAgent ? 'disabled' : 'not_enabled'}`,
      'credentials=none',
      'workspaceMutation=decision_required',
    ].join(', '),
    readinessSummary,
  };
}

function buildManualCodeAgentProfileSnapshot(): AgentProfileSnapshot {
  return {
    id: 'manual_sandbox_producer',
    displayName: 'Manual Sandbox Producer',
    role: 'code_agent_preview',
    allowedToolFamilies: ['workspace_coding', 'task_domain'],
    automationReadiness: 'disabled',
    summary:
      'profile=manual_sandbox_producer / tools=workspace_coding,task_domain / automation=disabled until skill/process policy exists',
  };
}

function buildManualOnlyLifecycleSnapshot(
  aiStatus: Pick<AiConfigStatus, 'featureFlags'> | null,
): AgentRunLifecycleSnapshot {
  return {
    currentStage: 'drafted',
    startMode: 'manual_or_operator_started',
    queueEnabled: false,
    claimEnabled: false,
    schedulerEnabled: false,
    automaticStartEnabled: false,
    summary: [
      'lifecycle=drafted',
      'start=manual_or_operator_started',
      'queue=no',
      'claim=no',
      `scheduler=${aiStatus?.featureFlags.enableScheduler ? 'configured_for_briefs_only' : 'no'}`,
      'autoStart=no',
    ].join(' / '),
  };
}

function getHiddenReservedFamilies(
  summaries: Pick<AgentToolScaffoldFamilySummary, 'family' | 'modelVisibleIds'>[],
): AgentToolScaffoldFamily[] {
  const visibleFamilies = new Set(
    summaries
      .filter((summary) => summary.modelVisibleIds.length > 0)
      .map((summary) => summary.family),
  );

  return RESERVED_CONNECTOR_FAMILIES.filter((family) => !visibleFamilies.has(family));
}

export function buildCodeAgentOrchestrationRequest(
  input: CreateCodeAgentRunInput,
): AgentExecutionOrchestrationRequest {
  const requestedChecks = normalizeRequestedChecks(input.requestedChecks);
  const contextFileCount = Array.isArray(input.contextFiles)
    ? input.contextFiles.filter((file) => file.trim()).length
    : 0;
  const requiredInputs: AgentExecutionOrchestrationRequiredInput[] = [
    {
      key: 'patch_intent',
      present: Boolean(input.patchIntent.trim()),
      reason: 'Code Agent preview needs a patch intent before it can prepare a staged diff.',
    },
    {
      key: 'requested_checks',
      present: requestedChecks.length > 0,
      reason: 'Code Agent preview needs at least one selected test or lint check.',
    },
    {
      key: 'operator_confirmation',
      present: input.operatorConfirmed === true,
      reason: 'Code Agent preview must be explicitly operator-started.',
    },
    {
      key: 'context_files',
      present: input.useModelProducer === true ? contextFileCount > 0 : true,
      reason: 'Model-backed Code Agent preview requires bounded context files.',
    },
  ];

  return {
    idempotencyKey: [
      'code_agent_preview',
      input.taskId.trim(),
      requestedChecks.join(',') || 'no_checks',
      input.useModelProducer === true ? `model_context_${contextFileCount}` : 'local_diagnostic',
    ].join(':'),
    taskId: input.taskId.trim(),
    lane: 'coding',
    profileId: 'manual_sandbox_producer',
    runtimeId: 'local_sandbox',
    startMode: 'manual',
    policy: buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' }),
    requiredInputs,
    operatorConfirmed: true,
    schedulerAllowed: false,
    automaticStartAllowed: false,
    providerCallAllowed: input.useModelProducer === true,
    source: {
      kind: 'code_agent_preview',
      requestedChecks,
      useModelProducer: input.useModelProducer === true,
      contextFileCount,
    },
    summary: [
      'Orchestration request',
      'lane=coding',
      'source=code_agent_preview',
      'profile=manual_sandbox_producer',
      'runtime=local_sandbox',
      'start=manual',
      `providerCall=${input.useModelProducer === true ? 'explicit_opt_in' : 'no'}`,
      'queue=no',
      'autoStart=no',
    ].join(' / '),
  };
}

export function buildOperatorStartedOrchestrationRequest(
  input: OperatorStartedRunRequest,
): AgentExecutionOrchestrationRequestValidation {
  const validation = validateOperatorStartedRunRequest(input);
  if (!validation.valid) {
    return invalidOrchestrationRequest(validation.blockedReasons);
  }

  const request = validation.request;

  return validateAgentExecutionOrchestrationRequest({
    idempotencyKey: `operator_started:${request.kind}:${request.taskId}`,
    taskId: request.taskId,
    lane: 'browser_evidence',
    profileId: 'operator_browser_evidence',
    runtimeId: request.policy.sessionKind === 'browser' ? 'browser_session' : 'local_sandbox',
    startMode: 'operator_started',
    policy: request.policy,
    requiredInputs: [
      {
        key: 'operator_confirmation',
        present: true,
        reason: 'Operator-started runs require explicit confirmation.',
      },
      {
        key: 'reason',
        present: Boolean(request.reason.trim()),
        reason: 'Operator-started runs require a visible reason.',
      },
    ],
    operatorConfirmed: true,
    schedulerAllowed: false,
    automaticStartAllowed: false,
    providerCallAllowed: false,
    source: {
      kind: 'operator_started_run',
      operatorKind: request.kind,
      descriptorId: request.descriptorId,
    },
    summary: [
      'Orchestration request',
      'lane=browser_evidence',
      `source=${request.kind}`,
      'start=operator_started',
      'providerCall=no',
      'queue=no',
      'autoStart=no',
    ].join(' / '),
  });
}

export function validateAgentExecutionOrchestrationRequest(
  input: unknown,
): AgentExecutionOrchestrationRequestValidation {
  if (!input || typeof input !== 'object') {
    return invalidOrchestrationRequest(['Orchestration request must be an object.']);
  }

  const candidate = input as Partial<AgentExecutionOrchestrationRequest>;
  const blockedReasons: string[] = [];

  if (typeof candidate.taskId !== 'string' || !candidate.taskId.trim()) {
    blockedReasons.push('Orchestration request requires a task id.');
  }

  if (!isOrchestrationLane(candidate.lane)) {
    blockedReasons.push('Orchestration request requires a supported lane.');
  }

  if (typeof candidate.profileId !== 'string' || !candidate.profileId.trim()) {
    blockedReasons.push('Orchestration request requires a profile id.');
  }

  if (typeof candidate.runtimeId !== 'string' || !candidate.runtimeId.trim()) {
    blockedReasons.push('Orchestration request requires a runtime id.');
  }

  if (!isOrchestrationStartMode(candidate.startMode)) {
    blockedReasons.push('Orchestration request requires a supported start mode.');
  }

  if (candidate.startMode === 'policy_auto') {
    blockedReasons.push('Orchestration request cannot use policy_auto until automation readiness is accepted.');
  }

  if (candidate.operatorConfirmed !== true) {
    blockedReasons.push('Orchestration request requires explicit operator confirmation.');
  }

  if (candidate.schedulerAllowed !== false) {
    blockedReasons.push('Orchestration request must not allow scheduler starts.');
  }

  if (candidate.automaticStartAllowed !== false) {
    blockedReasons.push('Orchestration request must not allow automatic starts.');
  }

  if (typeof candidate.providerCallAllowed !== 'boolean') {
    blockedReasons.push('Orchestration request must state whether provider calls are allowed.');
  }

  if (typeof candidate.idempotencyKey !== 'string' || !candidate.idempotencyKey.trim()) {
    blockedReasons.push('Orchestration request requires an idempotency key.');
  }

  const requiredInputs = Array.isArray(candidate.requiredInputs) ? candidate.requiredInputs : [];
  if (!requiredInputs.length) {
    blockedReasons.push('Orchestration request requires required-input evidence.');
  }

  const missingInputs = requiredInputs.filter((item) => item?.present !== true);
  if (missingInputs.length > 0) {
    blockedReasons.push(
      `Orchestration request is missing required inputs: ${missingInputs.map((item) => item.key).join(', ')}.`,
    );
  }

  const policyValidation = validateAgentToolExecutionPolicy(candidate.policy);
  if (!policyValidation.valid) {
    blockedReasons.push(...policyValidation.blockedReasons);
  }

  if (!candidate.source || typeof candidate.source !== 'object') {
    blockedReasons.push('Orchestration request requires a source envelope.');
  }

  if (blockedReasons.length > 0 || !policyValidation.valid) {
    return invalidOrchestrationRequest(blockedReasons);
  }

  const request = candidate as AgentExecutionOrchestrationRequest;
  return {
    blockedReasons: [],
    request: {
      ...request,
      taskId: request.taskId.trim(),
      profileId: request.profileId.trim(),
      runtimeId: request.runtimeId.trim(),
      idempotencyKey: request.idempotencyKey.trim(),
      policy: policyValidation.policy,
    },
    summary: request.summary,
    valid: true,
  };
}

export function projectAgentRunLifecycle(params: {
  runStatus: RunStatus;
  startMode: Exclude<AgentExecutionOrchestrationStartMode, 'policy_auto'>;
}): AgentRunLifecycleProjection {
  const currentStage = mapRunStatusToLifecycleStage(params.runStatus);

  return {
    currentStage,
    runStatus: params.runStatus,
    startMode: params.startMode,
    queueEnabled: false,
    claimEnabled: false,
    automaticStartEnabled: false,
    summary: [
      'AgentRunLifecycleProjection',
      `stage=${currentStage}`,
      `runStatus=${params.runStatus}`,
      `start=${params.startMode}`,
      'queue=no',
      'claim=no',
      'autoStart=no',
    ].join(' / '),
  };
}

export function evaluateSkillInformedAutomationReadiness(params: {
  task: Pick<
    TaskDetail,
    | 'activeBlocker'
    | 'activeDependency'
    | 'activeWaitingItem'
    | 'completionCriteria'
    | 'nextStep'
    | 'processTemplates'
    | 'riskLevel'
    | 'sourceContexts'
    | 'state'
    | 'summary'
    | 'taskFacets'
    | 'taskType'
    | 'waitingReason'
  >;
  snapshot: AgentExecutionOrchestrationSnapshot;
}): AgentAutomationReadinessEvaluation {
  const blockedReasons: string[] = [];
  const evidence: string[] = [];
  const hasProcedure = params.task.processTemplates.some((template) =>
    template.kind === 'skill'
      || template.kind === 'workflow'
      || template.kind === 'sop'
      || template.kind === 'checklist');
  const hasInputs = Boolean(params.task.nextStep?.trim())
    && (Boolean(params.task.summary?.trim()) || params.task.sourceContexts.length > 0);
  const hasRuntime = params.snapshot.runtime.status === 'ready';
  const hasOpenCompletionCriterion = params.task.completionCriteria.some((criteria) => criteria.status === 'open');
  const taskKinds = new Set([
    params.task.taskType,
    ...(params.task.taskFacets ?? []),
  ].filter(Boolean));
  const scheduledOrEventTriggered = taskKinds.has('scheduled')
    || taskKinds.has('event')
    || taskKinds.has('routine');

  if (!hasProcedure) {
    blockedReasons.push('No applied skill or process template is attached to this task.');
  } else {
    evidence.push('procedure=present');
  }

  if (!hasInputs) {
    blockedReasons.push('Task needs a clear next step plus summary or source context before automation readiness.');
  } else {
    evidence.push('inputs=present');
  }

  if (!hasRuntime) {
    blockedReasons.push(`Runtime is not ready: ${params.snapshot.runtime.status}.`);
  } else {
    evidence.push('runtime=ready');
  }

  if (params.task.riskLevel === 'high') {
    blockedReasons.push('High-risk tasks require manual Decision or operator-started review before execution.');
  } else {
    evidence.push(`risk=${params.task.riskLevel}`);
  }

  if (params.task.state === 'waiting_external' || params.task.activeWaitingItem || params.task.waitingReason?.trim()) {
    blockedReasons.push('Task is waiting on external input.');
  }

  if (params.task.activeBlocker) {
    blockedReasons.push('Task has an active blocker.');
  }

  if (params.task.activeDependency) {
    blockedReasons.push('Task has an active dependency.');
  }

  if (!hasOpenCompletionCriterion) {
    blockedReasons.push('Task needs at least one open completion criterion to bound execution.');
  } else {
    evidence.push('openCompletionCriterion=present');
  }

  if (scheduledOrEventTriggered) {
    blockedReasons.push('Scheduled, event-triggered, and routine tasks need a separate scheduled/event execution entrypoint before automatic native runtime start.');
    evidence.push(`taskAutomationClass=${Array.from(taskKinds).join(',')}`);
  }

  const state: AgentAutomationReadinessState = blockedReasons.length === 0
    ? 'eligible'
    : evidence.length > 0
      ? 'diagnostic_only'
      : 'blocked';

  return {
    state,
    automaticStartAllowed: false,
    blockedReasons,
    evidence,
    summary: [
      'Automation readiness',
      `state=${state}`,
      `evidence=${evidence.length ? evidence.join(',') : 'none'}`,
      `blocked=${blockedReasons.length ? blockedReasons.join('; ') : 'none'}`,
      'autoStart=no',
    ].join(' / '),
  };
}

function mapRunStatusToLifecycleStage(runStatus: RunStatus): AgentRunLifecycleStage {
  if (runStatus === 'pending') {
    return 'queued';
  }

  if (runStatus === 'running') {
    return 'running';
  }

  if (runStatus === 'paused') {
    return 'paused';
  }

  if (runStatus === 'needs_confirmation') {
    return 'needs_confirmation';
  }

  if (runStatus === 'completed') {
    return 'completed';
  }

  return 'failed';
}

function normalizeRequestedChecks(checks: CodeAgentAllowedCheck[]): CodeAgentAllowedCheck[] {
  return checks.filter((check, index) =>
    (check === 'test' || check === 'lint') && checks.indexOf(check) === index);
}

function isOrchestrationLane(value: unknown): value is AgentExecutionOrchestrationLane {
  return value === 'browser_evidence'
    || value === 'coding'
    || value === 'creator'
    || value === 'general';
}

function isOrchestrationStartMode(value: unknown): value is AgentExecutionOrchestrationStartMode {
  return value === 'manual' || value === 'operator_started' || value === 'policy_auto';
}

function invalidOrchestrationRequest(
  blockedReasons: string[],
): AgentExecutionOrchestrationRequestValidation {
  const reasons = blockedReasons.length
    ? blockedReasons
    : ['Orchestration request is invalid.'];

  return {
    blockedReasons: reasons,
    summary: `Orchestration request blocked: ${reasons.join('; ')}`,
    valid: false,
  };
}
