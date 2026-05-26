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
import type { TaskDetail, TaskExecutionType } from './types/task.js';

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
export type AgentAutomationStartBoundary =
  | 'blocked_until_ready'
  | 'manual_or_operator_started'
  | 'separate_scheduled_event_entrypoint_required';
export type AgentAutonomyLevel =
  | 'L0_diagnostic'
  | 'L1_proposal'
  | 'L2_limited_authorized_action'
  | 'L3_policy_gated_workspace_write';

export type AgentAutomationReadinessRequirement =
  | 'procedure'
  | 'inputs'
  | 'runtime'
  | 'risk'
  | 'waiting_clear'
  | 'blocker_clear'
  | 'dependency_clear'
  | 'open_completion_criterion'
  | 'scheduled_event_entrypoint';

export type AgentAutomationReadinessEvaluation = {
  state: AgentAutomationReadinessState;
  autonomyLevel: AgentAutonomyLevel;
  nextAutonomyLevel: AgentAutonomyLevel | null;
  automaticStartBoundary: AgentAutomationStartBoundary;
  automaticStartAllowed: false;
  standingApprovalRequired: boolean;
  blockedReasons: string[];
  evidence: string[];
  missingRequirements: AgentAutomationReadinessRequirement[];
  satisfiedRequirements: AgentAutomationReadinessRequirement[];
  summary: string;
};

export type AgentStandingApprovalStatus = 'active' | 'paused' | 'expired' | 'revoked';
export type AgentStandingApprovalRiskCeiling = 'low' | 'medium';

export type AgentStandingApprovalPolicy = {
  id: string;
  status: AgentStandingApprovalStatus;
  taskId?: string | null;
  taskTypes?: TaskExecutionType[];
  taskFacets?: string[];
  allowedLanes: AgentExecutionOrchestrationLane[];
  allowedRuntimeIds: string[];
  allowedAutonomyLevel: Extract<AgentAutonomyLevel, 'L2_limited_authorized_action'>;
  riskCeiling: AgentStandingApprovalRiskCeiling;
  maxRunsPerDay: number;
  expiresAt: string;
  createdAt: string;
  reason: string;
};

export type AgentStandingApprovalEvaluation = {
  accepted: boolean;
  authorizedAutonomyLevel: AgentAutonomyLevel | null;
  blockedReasons: string[];
  evidence: string[];
  summary: string;
};

export type AgentStandingApprovalConfirmationDraft = {
  id: string;
  status: 'ready' | 'blocked';
  title: string;
  detail: string;
  policy: AgentStandingApprovalPolicy;
  evaluation: AgentStandingApprovalEvaluation;
  confirmationRequired: true;
  schedulerTriggerAllowed: false;
  workspaceWriteAllowed: false;
  summary: string;
};

export type AgentScheduledEventTriggerPlan = {
  status: 'ready' | 'blocked';
  triggerPlanReady: boolean;
  runtimeStartAllowed: boolean;
  schedulerTriggerServiceConnected: boolean;
  triggerRunEvidenceRequired: Array<
    | 'context_readiness'
    | 'target_task_identity'
    | 'task_memory_coverage'
    | 'task_memory_guidance'
    | 'subtask_start'
    | 'run_limit_count'
    | 'post_step'
  >;
  policy: AgentStandingApprovalPolicy | null;
  runLimit: {
    maxRunsPerDay: number | null;
    runsStartedToday: number | null;
  };
  readiness: AgentAutomationReadinessEvaluation;
  standingApproval: AgentStandingApprovalEvaluation;
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
  const requiredRequirements: AgentAutomationReadinessRequirement[] = [
    'procedure',
    'inputs',
    'runtime',
    'risk',
    'waiting_clear',
    'blocker_clear',
    'dependency_clear',
    'open_completion_criterion',
    'scheduled_event_entrypoint',
  ];
  const blockedReasons: string[] = [];
  const evidence: string[] = [];
  const missingRequirements: AgentAutomationReadinessRequirement[] = [];
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
    missingRequirements.push('procedure');
    blockedReasons.push('No applied skill or process template is attached to this task.');
  } else {
    evidence.push('procedure=present');
  }

  if (!hasInputs) {
    missingRequirements.push('inputs');
    blockedReasons.push('Task needs a clear next step plus summary or source context before automation readiness.');
  } else {
    evidence.push('inputs=present');
  }

  if (!hasRuntime) {
    missingRequirements.push('runtime');
    blockedReasons.push(`Runtime is not ready: ${params.snapshot.runtime.status}.`);
  } else {
    evidence.push('runtime=ready');
  }

  if (params.task.riskLevel === 'high') {
    missingRequirements.push('risk');
    blockedReasons.push('High-risk tasks require manual Decision or operator-started review before execution.');
  } else {
    evidence.push(`risk=${params.task.riskLevel}`);
  }

  if (params.task.state === 'waiting_external' || params.task.activeWaitingItem || params.task.waitingReason?.trim()) {
    missingRequirements.push('waiting_clear');
    blockedReasons.push('Task is waiting on external input.');
  }

  if (params.task.activeBlocker) {
    missingRequirements.push('blocker_clear');
    blockedReasons.push('Task has an active blocker.');
  }

  if (params.task.activeDependency) {
    missingRequirements.push('dependency_clear');
    blockedReasons.push('Task has an active dependency.');
  }

  if (!hasOpenCompletionCriterion) {
    missingRequirements.push('open_completion_criterion');
    blockedReasons.push('Task needs at least one open completion criterion to bound execution.');
  } else {
    evidence.push('openCompletionCriterion=present');
  }

  if (scheduledOrEventTriggered) {
    missingRequirements.push('scheduled_event_entrypoint');
    blockedReasons.push('Scheduled, event-triggered, and routine tasks need a policy-gated scheduled/event execution entrypoint before automatic native runtime start.');
    evidence.push(`taskAutomationClass=${Array.from(taskKinds).join(',')}`);
  }

  const state: AgentAutomationReadinessState = blockedReasons.length === 0
    ? 'eligible'
    : evidence.length > 0
      ? 'diagnostic_only'
      : 'blocked';
  const automaticStartBoundary: AgentAutomationStartBoundary = scheduledOrEventTriggered
    ? 'separate_scheduled_event_entrypoint_required'
    : state === 'blocked'
      ? 'blocked_until_ready'
      : 'manual_or_operator_started';
  const autonomyLevel: AgentAutonomyLevel = state === 'blocked'
    ? 'L0_diagnostic'
    : 'L1_proposal';
  const nextAutonomyLevel: AgentAutonomyLevel | null = state === 'blocked'
    ? 'L1_proposal'
    : 'L2_limited_authorized_action';
  const standingApprovalRequired = state !== 'blocked';
  const missingRequirementSet = new Set(missingRequirements);
  const satisfiedRequirements = requiredRequirements.filter((requirement) => !missingRequirementSet.has(requirement));

  return {
    state,
    autonomyLevel,
    nextAutonomyLevel,
    automaticStartBoundary,
    automaticStartAllowed: false,
    standingApprovalRequired,
    blockedReasons,
    evidence,
    missingRequirements,
    satisfiedRequirements,
    summary: [
      'Automation readiness',
      `state=${state}`,
      `requirements=${satisfiedRequirements.length}/${requiredRequirements.length}`,
      `autonomy=${autonomyLevel}`,
      nextAutonomyLevel ? `next=${nextAutonomyLevel}` : null,
      `evidence=${evidence.length ? evidence.join(',') : 'none'}`,
      `blocked=${blockedReasons.length ? blockedReasons.join('; ') : 'none'}`,
      'autoStart=no',
      `standingApproval=${standingApprovalRequired ? 'required_for_auto_action' : 'not_ready'}`,
      `boundary=${automaticStartBoundary}`,
    ].filter(Boolean).join(' / '),
  };
}

export function evaluateStandingApprovalForAutomation(params: {
  lane: AgentExecutionOrchestrationLane;
  now: string;
  policy: AgentStandingApprovalPolicy | null;
  readiness: AgentAutomationReadinessEvaluation;
  runtimeId: string;
  task: Pick<TaskDetail, 'id' | 'riskLevel' | 'taskFacets' | 'taskType'>;
}): AgentStandingApprovalEvaluation {
  const blockedReasons: string[] = [];
  const evidence: string[] = [];
  const { policy } = params;

  if (!policy) {
    blockedReasons.push('Standing Approval policy is missing.');
  } else {
    evidence.push(`policy=${policy.id}`);

    if (policy.status !== 'active') {
      blockedReasons.push(`Standing Approval policy is not active: ${policy.status}.`);
    } else {
      evidence.push('policyStatus=active');
    }

    if (!policy.reason.trim()) {
      blockedReasons.push('Standing Approval policy requires a visible reason.');
    }

    const expiresAtMs = Date.parse(policy.expiresAt);
    const nowMs = Date.parse(params.now);
    if (Number.isNaN(expiresAtMs) || Number.isNaN(nowMs)) {
      blockedReasons.push('Standing Approval policy requires valid ISO timestamps.');
    } else if (expiresAtMs <= nowMs) {
      blockedReasons.push('Standing Approval policy has expired.');
    } else {
      evidence.push('policyExpiry=future');
    }

    if (policy.allowedAutonomyLevel !== 'L2_limited_authorized_action') {
      blockedReasons.push('Standing Approval policy must authorize L2 limited autonomous action.');
    } else {
      evidence.push('authorized=L2_limited_authorized_action');
    }

    if (!policy.allowedLanes.includes(params.lane)) {
      blockedReasons.push(`Standing Approval policy does not allow lane ${params.lane}.`);
    } else {
      evidence.push(`lane=${params.lane}`);
    }

    if (!policy.allowedRuntimeIds.includes(params.runtimeId)) {
      blockedReasons.push(`Standing Approval policy does not allow runtime ${params.runtimeId}.`);
    } else {
      evidence.push(`runtime=${params.runtimeId}`);
    }

    if (policy.taskId && policy.taskId !== params.task.id) {
      blockedReasons.push('Standing Approval policy is scoped to a different task.');
    }

    const taskKinds = new Set<string>();
    if (params.task.taskType) {
      taskKinds.add(params.task.taskType);
    }
    for (const facet of params.task.taskFacets ?? []) {
      taskKinds.add(facet);
    }

    if (policy.taskTypes?.length && (!params.task.taskType || !policy.taskTypes.includes(params.task.taskType))) {
      blockedReasons.push(`Standing Approval policy does not allow task type ${params.task.taskType ?? 'unknown'}.`);
    } else if (policy.taskTypes?.length) {
      evidence.push(`taskType=${params.task.taskType}`);
    }

    if (policy.taskFacets?.length) {
      const missingFacets = policy.taskFacets.filter((facet) => !taskKinds.has(facet));
      if (missingFacets.length > 0) {
        blockedReasons.push(`Standing Approval policy requires missing task facets: ${missingFacets.join(', ')}.`);
      } else {
        evidence.push(`taskFacets=${policy.taskFacets.join(',')}`);
      }
    }

    if (!isRiskAllowedByStandingApproval(policy.riskCeiling, params.task.riskLevel)) {
      blockedReasons.push(`Standing Approval policy risk ceiling ${policy.riskCeiling} does not allow ${params.task.riskLevel} risk.`);
    } else {
      evidence.push(`risk=${params.task.riskLevel}`);
    }

    if (!Number.isInteger(policy.maxRunsPerDay) || policy.maxRunsPerDay < 1 || policy.maxRunsPerDay > 24) {
      blockedReasons.push('Standing Approval policy requires maxRunsPerDay between 1 and 24.');
    } else {
      evidence.push(`maxRunsPerDay=${policy.maxRunsPerDay}`);
    }
  }

  const readinessBlockers = params.readiness.blockedReasons.filter((reason) =>
    !isStandingApprovalToleratedReadinessBlocker(reason));
  if (params.readiness.state === 'blocked' || readinessBlockers.length > 0) {
    blockedReasons.push('Automation readiness is blocked.');
    for (const reason of readinessBlockers) {
      blockedReasons.push(`Automation readiness blocker: ${reason}`);
    }
  } else {
    evidence.push(`readiness=${params.readiness.state}`);
  }

  const accepted = blockedReasons.length === 0;
  return {
    accepted,
    authorizedAutonomyLevel: accepted ? 'L2_limited_authorized_action' : null,
    blockedReasons,
    evidence,
    summary: [
      'Standing Approval',
      `accepted=${accepted ? 'yes' : 'no'}`,
      `authorized=${accepted ? 'L2_limited_authorized_action' : 'none'}`,
      `evidence=${evidence.length ? evidence.join(',') : 'none'}`,
      `blocked=${blockedReasons.length ? blockedReasons.join('; ') : 'none'}`,
    ].join(' / '),
  };
}

export function buildStandingApprovalConfirmationDraft(params: {
  lane?: AgentExecutionOrchestrationLane;
  maxRunsPerDay?: number;
  now: Date;
  readiness: AgentAutomationReadinessEvaluation;
  runtimeId?: string;
  task: Pick<TaskDetail, 'id' | 'riskLevel' | 'taskFacets' | 'taskType'>;
}): AgentStandingApprovalConfirmationDraft {
  const lane = params.lane ?? 'coding';
  const runtimeId = params.runtimeId ?? 'local_sandbox';
  const nowIso = params.now.toISOString();
  const expiresAt = new Date(params.now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const riskCeiling: AgentStandingApprovalRiskCeiling = params.task.riskLevel === 'medium'
    ? 'medium'
    : 'low';
  const taskTypes = params.task.taskType ? [params.task.taskType] : undefined;
  const taskFacets = params.task.taskFacets?.length ? [...params.task.taskFacets] : undefined;
  const policy: AgentStandingApprovalPolicy = {
    id: [
      'standing_approval',
      params.task.id,
      lane,
      runtimeId,
    ].join(':'),
    allowedAutonomyLevel: 'L2_limited_authorized_action',
    allowedLanes: [lane],
    allowedRuntimeIds: [runtimeId],
    createdAt: nowIso,
    expiresAt,
    maxRunsPerDay: params.maxRunsPerDay ?? 3,
    reason: 'Allow this task to perform bounded L2 autonomous action under Taskplane standing approval.',
    riskCeiling,
    status: 'active',
    taskFacets,
    taskId: params.task.id,
    taskTypes,
  };
  const evaluation = evaluateStandingApprovalForAutomation({
    lane,
    now: nowIso,
    policy,
    readiness: params.readiness,
    runtimeId,
    task: params.task,
  });
  const status = evaluation.accepted ? 'ready' : 'blocked';

  return {
    id: policy.id,
    status,
    title: status === 'ready'
      ? 'Standing Approval 草案：允许 L2 有限自主行动'
      : 'Standing Approval 草案：暂不可授权',
    detail: [
      `scope=task:${params.task.id}`,
      `lane=${lane}`,
      `runtime=${runtimeId}`,
      `riskCeiling=${riskCeiling}`,
      `maxRunsPerDay=${policy.maxRunsPerDay}`,
      `expiresAt=${expiresAt}`,
      'schedulerTriggerAllowed=false',
      'workspaceWriteAllowed=false',
    ].join(' / '),
    policy,
    evaluation,
    confirmationRequired: true,
    schedulerTriggerAllowed: false,
    workspaceWriteAllowed: false,
    summary: [
      'Standing Approval confirmation draft',
      `status=${status}`,
      'confirmationRequired=yes',
      'schedulerTriggerAllowed=false',
      'workspaceWriteAllowed=false',
      evaluation.summary,
    ].join(' / '),
  };
}

export function planScheduledEventAgentTrigger(params: {
  aiStatus: Pick<
    AiConfigStatus,
    'featureFlags' | 'sandboxBackendStatus' | 'toolScaffoldSummaries' | 'workspaceRoot'
  > | null;
  lane?: AgentExecutionOrchestrationLane;
  now: Date;
  runLimit?: {
    runsStartedToday: number;
  } | null;
  runtimeId?: string;
  schedulerTriggerServiceConnected?: boolean;
  task: Pick<
    TaskDetail,
    | 'activeBlocker'
    | 'activeDependency'
    | 'activeWaitingItem'
    | 'completionCriteria'
    | 'id'
    | 'nextStep'
    | 'processTemplates'
    | 'riskLevel'
    | 'sourceContexts'
    | 'state'
    | 'summary'
    | 'taskFacets'
    | 'taskType'
    | 'timeline'
    | 'waitingReason'
  >;
}): AgentScheduledEventTriggerPlan {
  const lane = params.lane ?? 'coding';
  const schedulerTriggerServiceConnected = params.schedulerTriggerServiceConnected === true;
  const snapshot = buildAgentExecutionOrchestrationSnapshot(params.aiStatus);
  const runtimeId = params.runtimeId ?? snapshot.runtime.id;
  const readiness = evaluateSkillInformedAutomationReadiness({
    snapshot,
    task: params.task,
  });
  const policy = findConfirmedStandingApprovalPolicy({
    lane,
    runtimeId,
    task: params.task,
  });
  const standingApproval = evaluateStandingApprovalForAutomation({
    lane,
    now: params.now.toISOString(),
    policy,
    readiness,
    runtimeId,
    task: params.task,
  });
  const blockedReasons = [...standingApproval.blockedReasons];
  const evidence = [
    ...standingApproval.evidence,
    `targetTask=${params.task.id}`,
    `runtime=${snapshot.runtime.status}`,
  ];

  if (!isScheduledEventOrRoutineTask(params.task)) {
    blockedReasons.push('Scheduled/event trigger planner only handles scheduled, event, or routine tasks.');
  } else {
    evidence.push('taskAutomationClass=scheduled_event_or_routine');
  }

  const runsStartedToday = params.runLimit?.runsStartedToday;
  if (policy && runsStartedToday !== undefined) {
    if (!Number.isInteger(runsStartedToday) || runsStartedToday < 0) {
      blockedReasons.push('Scheduled/event trigger run-limit accounting requires a non-negative integer run count.');
    } else if (runsStartedToday >= policy.maxRunsPerDay) {
      blockedReasons.push(`Scheduled/event trigger daily run limit reached: ${runsStartedToday}/${policy.maxRunsPerDay}.`);
    } else {
      evidence.push(`runLimit=${runsStartedToday}/${policy.maxRunsPerDay}`);
    }
  } else if (policy) {
    evidence.push(`runLimit=not_counted/${policy.maxRunsPerDay}`);
  }

  const status = blockedReasons.length === 0 ? 'ready' : 'blocked';
  const runtimeStartAllowed = status === 'ready' && schedulerTriggerServiceConnected;

  return {
    status,
    triggerPlanReady: status === 'ready',
    runtimeStartAllowed,
    schedulerTriggerServiceConnected,
    triggerRunEvidenceRequired: [
      'context_readiness',
      'target_task_identity',
      'task_memory_coverage',
      'task_memory_guidance',
      'subtask_start',
      'run_limit_count',
      'post_step',
    ],
    policy,
    runLimit: {
      maxRunsPerDay: policy?.maxRunsPerDay ?? null,
      runsStartedToday: Number.isInteger(runsStartedToday) && runsStartedToday !== undefined
        ? runsStartedToday
        : null,
    },
    readiness,
    standingApproval,
    blockedReasons,
    evidence,
    summary: [
      'Scheduled/event trigger plan',
      `status=${status}`,
      `triggerPlanReady=${status === 'ready' ? 'yes' : 'no'}`,
      `runtimeStartAllowed=${runtimeStartAllowed ? 'true' : 'false'}`,
      `schedulerTriggerServiceConnected=${schedulerTriggerServiceConnected ? 'true' : 'false'}`,
      'triggerRunEvidence=context_readiness,target_task_identity,task_memory_coverage,task_memory_guidance,subtask_start,run_limit_count,post_step',
      `evidence=${evidence.length ? evidence.join(',') : 'none'}`,
      `blocked=${blockedReasons.length ? blockedReasons.join('; ') : 'none'}`,
    ].join(' / '),
  };
}

function isRiskAllowedByStandingApproval(
  ceiling: AgentStandingApprovalRiskCeiling,
  risk: TaskDetail['riskLevel'],
): boolean {
  if (risk === 'high') return false;
  if (ceiling === 'low') return risk === 'low';
  return risk === 'low' || risk === 'medium';
}

function isStandingApprovalToleratedReadinessBlocker(reason: string): boolean {
  return reason === 'Scheduled, event-triggered, and routine tasks need a policy-gated scheduled/event execution entrypoint before automatic native runtime start.';
}

function findConfirmedStandingApprovalPolicy(params: {
  lane: AgentExecutionOrchestrationLane;
  runtimeId: string;
  task: Pick<TaskDetail, 'id' | 'timeline'>;
}): AgentStandingApprovalPolicy | null {
  for (const event of [...params.task.timeline].sort((left, right) => right.createdAt.localeCompare(left.createdAt))) {
    if (event.type !== 'panel.standing_approval_confirmed' || !event.payload) continue;
    try {
      const payload = JSON.parse(event.payload) as {
        policy?: AgentStandingApprovalPolicy;
        schedulerTriggerAllowed?: unknown;
        workspaceWriteAllowed?: unknown;
      };
      if (
        payload.schedulerTriggerAllowed !== false
        || payload.workspaceWriteAllowed !== false
        || payload.policy?.taskId !== params.task.id
        || !payload.policy.allowedLanes?.includes(params.lane)
        || !payload.policy.allowedRuntimeIds?.includes(params.runtimeId)
      ) {
        continue;
      }
      return payload.policy;
    } catch {
      continue;
    }
  }
  return null;
}

function isScheduledEventOrRoutineTask(
  task: Pick<TaskDetail, 'taskFacets' | 'taskType'>,
): boolean {
  const kinds = new Set([
    task.taskType,
    ...(task.taskFacets ?? []),
  ].filter(Boolean));
  return kinds.has('scheduled') || kinds.has('event') || kinds.has('routine');
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
