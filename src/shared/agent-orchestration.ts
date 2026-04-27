import type { AgentToolScaffoldFamily, AgentToolScaffoldFamilySummary } from './agent-tool-scaffold.js';
import type { AiConfigStatus } from './types/settings.js';

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

export type AgentExecutionOrchestrationSnapshot = {
  runtime: ExecutionRuntimeSnapshot;
  profile: AgentProfileSnapshot;
  lifecycle: AgentRunLifecycleSnapshot;
  hiddenFamilies: AgentToolScaffoldFamily[];
  summary: string;
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
