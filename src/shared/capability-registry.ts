import type { AgentToolScaffoldFamilySummary } from './agent-tool-scaffold.js';
import type { AgentCliRuntimeId, AgentCliRuntimeStatus } from './agent-cli-runtime-status.js';
import type { AgentRuntimeNativeCapabilityAvailability } from './agent-runtime-goal.js';
import {
  evaluateAgentApiDecompositionPromotionReadinessFromEvidence,
  evaluateAgentApiExecutionPromotionReadinessFromEvidence,
} from './ai-runtime-invocation.js';
import { evaluateAgentApiProviderToolReadinessFromEvidence } from './agent-api-provider-tool-readiness.js';
import {
  RUNTIME_ENTRYPOINT_COVERAGE,
  requiredRuntimeEntrypointGatesForKind,
  type RuntimeEntrypointGate,
} from './runtime-entrypoint-coverage.js';
import { planSchedulerDecisionProposalFromEvidence } from './scheduler-decision-proposal.js';
import type { RuntimeCapabilitySnapshot } from './runtime-capability-snapshot.js';

export type CapabilityRegistryStatus =
  | 'available'
  | 'disabled'
  | 'unconfigured'
  | 'unknown';

export type CapabilityVisibility =
  | 'hidden'
  | 'model_visible'
  | 'policy_gated';

export type CapabilityAccess =
  | 'read_only'
  | 'mutating'
  | 'mixed';

export type CapabilityRuntimeGate =
  | 'runtime_context_assembly'
  | 'runtime_pre_step'
  | 'runtime_post_step'
  | 'runtime_entrypoint_coverage'
  | 'decision_checkpoint'
  | 'capability_probe'
  | 'not_applicable';

export type CapabilityRegistryEntry = {
  id: string;
  label: string;
  family:
    | 'model'
    | 'external_access'
    | 'skill'
    | 'mcp'
    | 'agent_cli'
    | 'agent_api'
    | 'workspace'
    | 'sandbox'
    | 'scheduler'
    | 'browser'
    | 'agent_tool'
    | 'runtime_setting';
  status: CapabilityRegistryStatus;
  configured: boolean;
  missingReason: string | null;
  visibility: CapabilityVisibility;
  access: CapabilityAccess;
  requiresApproval: boolean;
  requiredGate: CapabilityRuntimeGate;
  summary: string;
};

export type CapabilityProductSurfaceStatus = {
  externalAccess?: {
    connectedCount: number;
    pendingCount?: number;
    errorCount?: number;
    catalogueCount?: number;
  } | null;
  skills?: {
    enabledCount: number;
    readyCount: number;
    modelVisibleCount?: number;
    needsConfigCount?: number;
    catalogueCount?: number;
  } | null;
  mcp?: {
    connectedServerCount: number;
    toolCount: number;
    modelVisibleToolCount?: number;
    errorCount?: number;
    catalogueCount?: number;
  } | null;
  agentCli?: {
    catalogueCount?: number;
    detectedCount: number;
    readyCount: number;
    runningCount?: number;
    errorCount?: number;
    manualRunCount?: number;
    nativeWebSearchRuntimeDependentCount?: number;
    selectedNativeWebSearchAvailability?: AgentRuntimeNativeCapabilityAvailability;
    nativeWebSearchUnverifiedCount?: number;
    readyManualRunCount?: number;
  } | null;
  browser?: {
    available: boolean;
    reason?: string | null;
  } | null;
};

export function buildCapabilityRegistry(params: {
  snapshot?: RuntimeCapabilitySnapshot | null;
  productSurfaces?: CapabilityProductSurfaceStatus | null;
}): CapabilityRegistryEntry[] {
  const snapshot = params.snapshot ?? null;
  const productSurfaces = params.productSurfaces ?? null;
  const modelConfigured = Boolean(snapshot?.model.configured);
  const workspaceConfigured = Boolean(snapshot?.workspace.rootConfigured);
  const sandboxFlagAvailable = snapshot?.flags.sandboxCodingAgent === 'available';
  const sandboxReady = Boolean(snapshot?.sandbox.producerBackendReady || snapshot?.sandbox.backendReady);
  const modelVisibleToolCount = snapshot?.tools.modelVisibleCount ?? 0;
  const checkpointToolCount = snapshot?.tools.checkpointRequiredCount ?? 0;

  return [
    {
      id: 'model.provider',
      label: 'Model Provider',
      family: 'model',
      status: modelConfigured ? 'available' : 'unconfigured',
      configured: modelConfigured,
      missingReason: modelConfigured ? null : 'No configured model provider.',
      visibility: 'policy_gated',
      access: 'read_only',
      requiresApproval: false,
      requiredGate: 'runtime_context_assembly',
      summary: snapshot?.model.provider && snapshot.model.model
        ? `${snapshot.model.provider} / ${snapshot.model.model}`
        : 'Model provider is not configured.',
    },
    {
      id: 'model.code_agent_producer',
      label: 'Code Agent Model Producer',
      family: 'model',
      status: statusFromSnapshot(snapshot?.model.producer, modelConfigured),
      configured: snapshot?.model.producer === 'available',
      missingReason: snapshot?.model.producer === 'available' ? null : 'Model producer is disabled or missing provider configuration.',
      visibility: snapshot?.model.producer === 'available' ? 'policy_gated' : 'hidden',
      access: 'mutating',
      requiresApproval: true,
      requiredGate: 'runtime_pre_step',
      summary: `modelProducer=${snapshot?.model.producer ?? 'unknown'}`,
    },
    {
      id: 'workspace.root',
      label: 'Workspace Root',
      family: 'workspace',
      status: workspaceConfigured ? 'available' : 'unconfigured',
      configured: workspaceConfigured,
      missingReason: workspaceConfigured ? null : 'Workspace root is not configured.',
      visibility: 'hidden',
      access: 'mixed',
      requiresApproval: true,
      requiredGate: 'runtime_pre_step',
      summary: workspaceConfigured ? 'Workspace root configured.' : 'Workspace root missing.',
    },
    {
      id: 'workspace.checks',
      label: 'Workspace Verification',
      family: 'workspace',
      status: snapshot?.workspace.lintAvailable || snapshot?.workspace.testAvailable ? 'available' : workspaceConfigured ? 'disabled' : 'unconfigured',
      configured: Boolean(snapshot?.workspace.lintAvailable || snapshot?.workspace.testAvailable),
      missingReason: snapshot?.workspace.lintAvailable || snapshot?.workspace.testAvailable
        ? null
        : 'No lint or test verification command is available.',
      visibility: 'hidden',
      access: 'read_only',
      requiresApproval: false,
      requiredGate: 'runtime_pre_step',
      summary: `lint=${snapshot?.workspace.lintAvailable ? 'yes' : 'no'} / test=${snapshot?.workspace.testAvailable ? 'yes' : 'no'}`,
    },
    {
      id: 'runtime.scheduler',
      label: 'Scheduler',
      family: 'scheduler',
      status: statusFromSnapshot(snapshot?.flags.scheduler),
      configured: snapshot?.flags.scheduler === 'available',
      missingReason: snapshot?.flags.scheduler === 'available' ? null : 'Scheduler is disabled or unknown.',
      visibility: 'hidden',
      access: 'mutating',
      requiresApproval: true,
      requiredGate: 'runtime_entrypoint_coverage',
      summary: schedulerCapabilitySummary(snapshot?.flags.scheduler),
    },
    {
      id: 'sandbox.coding_agent',
      label: 'Sandbox Coding Agent',
      family: 'sandbox',
      status: sandboxCapabilityStatus(snapshot),
      configured: sandboxFlagAvailable && sandboxReady,
      missingReason: sandboxMissingReason(snapshot),
      visibility: sandboxFlagAvailable && sandboxReady ? 'policy_gated' : 'hidden',
      access: 'mutating',
      requiresApproval: true,
      requiredGate: 'capability_probe',
      summary: snapshot?.sandbox.summary ?? `sandboxCodingAgent=${snapshot?.flags.sandboxCodingAgent ?? 'unknown'}`,
    },
    {
      id: 'runtime.self_check',
      label: 'Self Check',
      family: 'runtime_setting',
      status: statusFromSnapshot(snapshot?.flags.selfCheck),
      configured: snapshot?.flags.selfCheck === 'available',
      missingReason: snapshot?.flags.selfCheck === 'available' ? null : 'Self-check is disabled or unknown.',
      visibility: 'hidden',
      access: 'read_only',
      requiresApproval: false,
      requiredGate: 'runtime_post_step',
      summary: `selfCheck=${snapshot?.flags.selfCheck ?? 'unknown'}`,
    },
    {
      id: 'agent_tools.model_visible',
      label: 'Model-visible Agent Tools',
      family: 'agent_tool',
      status: modelVisibleToolCount > 0 ? 'available' : 'disabled',
      configured: modelVisibleToolCount > 0,
      missingReason: modelVisibleToolCount > 0 ? null : 'No model-visible tools are exposed.',
      visibility: modelVisibleToolCount > 0 ? 'model_visible' : 'hidden',
      access: 'mixed',
      requiresApproval: checkpointToolCount > 0,
      requiredGate: 'runtime_pre_step',
      summary: `modelVisibleTools=${modelVisibleToolCount}`,
    },
    {
      id: 'agent_tools.checkpointed',
      label: 'Checkpointed Agent Tools',
      family: 'agent_tool',
      status: checkpointToolCount > 0 ? 'available' : 'disabled',
      configured: checkpointToolCount > 0,
      missingReason: checkpointToolCount > 0 ? null : 'No checkpoint-required tools are exposed.',
      visibility: 'policy_gated',
      access: 'mutating',
      requiresApproval: true,
      requiredGate: 'decision_checkpoint',
      summary: `checkpointTools=${checkpointToolCount}`,
    },
    externalAccessCapability(productSurfaces?.externalAccess ?? null),
    skillsCapability(productSurfaces?.skills ?? null, findToolFamily(snapshot, 'skill')),
    mcpCapability(productSurfaces?.mcp ?? null, findToolFamily(snapshot, 'mcp')),
    agentCliCapability(productSurfaces?.agentCli ?? null, snapshot),
    agentApiRuntimeCapability(snapshot),
    browserCapability(productSurfaces?.browser ?? null, findToolFamily(snapshot, 'browser_playwright')),
  ];
}

export function capabilityRegistryAllowsModelExecution(
  registry: CapabilityRegistryEntry[],
): boolean {
  const providerConfigured = registry.some((entry) => (
    entry.id === 'model.provider'
    && entry.status === 'available'
    && entry.requiredGate === 'runtime_context_assembly'
  ));
  const selectedAgentApiRuntime = registry.some((entry) => (
    entry.id === 'agent_api.runtime'
    && entry.summary.includes('selected=true')
  ));

  return providerConfigured && selectedAgentApiRuntime;
}

export function capabilityRegistryAllowsWorkspaceVerification(
  registry: CapabilityRegistryEntry[],
): boolean {
  return registry.some((entry) => (
    entry.id === 'workspace.checks'
    && entry.status === 'available'
    && entry.requiredGate === 'runtime_pre_step'
  ));
}

function schedulerCapabilitySummary(schedulerFlag: RuntimeCapabilitySnapshot['flags']['scheduler'] | undefined): string {
  const decisionProposalPlan = planSchedulerDecisionProposalFromEvidence({});
  return [
    `scheduler=${schedulerFlag ?? 'unknown'}`,
    decisionProposalPlan.summary,
  ].join(' / ');
}

export function agentCliStatusForCapability(
  status: AgentCliRuntimeStatus,
  selectedRuntimeId: AgentCliRuntimeId | null = null,
): NonNullable<CapabilityProductSurfaceStatus['agentCli']> {
  const installedRuntimes = status.runtimes.filter((runtime) => runtime.installed);
  const selectedRuntime = selectedRuntimeId
    ? installedRuntimes.find((runtime) => runtime.id === selectedRuntimeId) ?? null
    : null;
  const nativeWebSearchRuntimeDependentCount = installedRuntimes.filter((runtime) => (
    runtime.authState === 'ready'
    && (
      runtime.capabilities?.nativeCapabilities?.webSearch.availability === 'runtime_dependent'
      || runtime.capabilities?.nativeCapabilities?.webSearch.availability === 'available'
    )
  )).length;
  const nativeWebSearchUnverifiedCount = installedRuntimes.filter((runtime) => (
    runtime.authState !== 'ready'
    || runtime.capabilities?.nativeCapabilities?.webSearch.availability === 'unverified'
  )).length;
  const selectedNativeWebSearchAvailability = selectedRuntime?.authState === 'ready'
    ? selectedRuntime.capabilities?.nativeCapabilities?.webSearch.availability
    : selectedRuntime?.capabilities?.nativeCapabilities?.webSearch.availability
      ? 'unverified'
      : undefined;

  return {
    catalogueCount: status.catalogueCount,
    detectedCount: status.detectedCount,
    errorCount: status.errorCount,
    manualRunCount: status.manualRunCount,
    nativeWebSearchRuntimeDependentCount,
    selectedNativeWebSearchAvailability,
    nativeWebSearchUnverifiedCount,
    readyCount: status.readyCount,
    readyManualRunCount: status.readyManualRunCount,
    runningCount: status.runningCount,
  };
}

function statusFromSnapshot(
  status: RuntimeCapabilitySnapshot['model']['producer'] | undefined,
  requiredConfigured = true,
): CapabilityRegistryStatus {
  if (!requiredConfigured) return 'unconfigured';
  if (status === 'available') return 'available';
  if (status === 'disabled') return 'disabled';
  return 'unknown';
}

function sandboxCapabilityStatus(snapshot: RuntimeCapabilitySnapshot | null): CapabilityRegistryStatus {
  if (!snapshot) return 'unknown';
  if (snapshot.flags.sandboxCodingAgent === 'disabled') return 'disabled';
  if (snapshot.flags.sandboxCodingAgent === 'unknown') return 'unknown';
  if (!snapshot.sandbox.backendProbed) return 'unknown';
  return snapshot.sandbox.producerBackendReady || snapshot.sandbox.backendReady ? 'available' : 'disabled';
}

function sandboxMissingReason(snapshot: RuntimeCapabilitySnapshot | null): string | null {
  if (!snapshot) return 'Sandbox capability status is unknown.';
  if (snapshot.flags.sandboxCodingAgent === 'disabled') return 'Sandbox coding agent is disabled.';
  if (snapshot.flags.sandboxCodingAgent === 'unknown') return 'Sandbox coding agent flag is unknown.';
  if (!snapshot.sandbox.backendProbed) return 'Sandbox backend has not been probed.';
  if (snapshot.sandbox.producerBackendReady || snapshot.sandbox.backendReady) return null;
  return snapshot.sandbox.blockedReasons.join(' ') || 'Sandbox backend is not ready.';
}

function deferredCapability(
  id: string,
  label: string,
  family: CapabilityRegistryEntry['family'],
): CapabilityRegistryEntry {
  return {
    id,
    label,
    family,
    status: 'unknown',
    configured: false,
    missingReason: 'Capability source is not connected to the shared registry yet.',
    visibility: 'hidden',
    access: 'mixed',
    requiresApproval: true,
    requiredGate: 'runtime_entrypoint_coverage',
    summary: 'Deferred until the product surface exposes structured status.',
  };
}

function findToolFamily(
  snapshot: RuntimeCapabilitySnapshot | null,
  family: AgentToolScaffoldFamilySummary['family'],
): AgentToolScaffoldFamilySummary | null {
  return snapshot?.tools.summaries.find((summary) => summary.family === family) ?? null;
}

function externalAccessCapability(
  status: NonNullable<CapabilityProductSurfaceStatus['externalAccess']> | null,
): CapabilityRegistryEntry {
  if (!status) return deferredCapability('external_access.connectors', 'External Access', 'external_access');
  const connected = status.connectedCount > 0;
  const needsConfiguration = (status.pendingCount ?? 0) > 0 || (status.errorCount ?? 0) > 0;
  return {
    id: 'external_access.connectors',
    label: 'External Access',
    family: 'external_access',
    status: connected ? 'available' : needsConfiguration ? 'unconfigured' : 'disabled',
    configured: connected,
    missingReason: connected ? null : needsConfiguration
      ? 'External access connector authorization is pending or has errors.'
      : 'No external access connector is connected.',
    visibility: 'hidden',
    access: 'read_only',
    requiresApproval: true,
    requiredGate: 'runtime_entrypoint_coverage',
    summary: [
      `connected=${status.connectedCount}`,
      `pending=${status.pendingCount ?? 0}`,
      `errors=${status.errorCount ?? 0}`,
      typeof status.catalogueCount === 'number' ? `catalogue=${status.catalogueCount}` : null,
    ].filter(Boolean).join(' / '),
  };
}

function skillsCapability(
  status: NonNullable<CapabilityProductSurfaceStatus['skills']> | null,
  scaffold: AgentToolScaffoldFamilySummary | null,
): CapabilityRegistryEntry {
  if (!status) {
    return toolScaffoldCapability({
      id: 'skills.catalogue',
      label: 'Skills',
      family: 'skill',
      scaffold,
      access: 'mixed',
      requiredGate: 'runtime_entrypoint_coverage',
    });
  }
  const ready = status.enabledCount > 0 && status.readyCount > 0;
  const modelVisible = (status.modelVisibleCount ?? 0) > 0;
  const configured = ready && modelVisible;
  return {
    id: 'skills.catalogue',
    label: 'Skills',
    family: 'skill',
    status: configured ? 'available' : ready || status.needsConfigCount ? 'unconfigured' : 'disabled',
    configured,
    missingReason: configured ? null : ready
      ? 'Ready skills are not exposed through the runtime tool gate.'
      : 'No ready skill is enabled.',
    visibility: configured ? 'model_visible' : 'hidden',
    access: 'mixed',
    requiresApproval: true,
    requiredGate: 'runtime_entrypoint_coverage',
    summary: [
      `enabled=${status.enabledCount}`,
      `ready=${status.readyCount}`,
      `modelVisible=${status.modelVisibleCount ?? 0}`,
      `needsConfig=${status.needsConfigCount ?? 0}`,
      typeof status.catalogueCount === 'number' ? `catalogue=${status.catalogueCount}` : null,
    ].filter(Boolean).join(' / '),
  };
}

function mcpCapability(
  status: NonNullable<CapabilityProductSurfaceStatus['mcp']> | null,
  scaffold: AgentToolScaffoldFamilySummary | null,
): CapabilityRegistryEntry {
  if (!status) {
    return toolScaffoldCapability({
      id: 'mcp.servers',
      label: 'MCP Servers',
      family: 'mcp',
      scaffold,
      access: 'mixed',
      requiredGate: 'runtime_entrypoint_coverage',
    });
  }
  const connected = status.connectedServerCount > 0 && status.toolCount > 0;
  const modelVisible = (status.modelVisibleToolCount ?? 0) > 0;
  const configured = connected && modelVisible;
  return {
    id: 'mcp.servers',
    label: 'MCP Servers',
    family: 'mcp',
    status: configured ? 'available' : connected || status.errorCount ? 'unconfigured' : 'disabled',
    configured,
    missingReason: configured ? null : connected
      ? 'Connected MCP tools are not exposed through the runtime tool gate.'
      : 'No connected MCP server exposes tools.',
    visibility: configured ? 'model_visible' : 'hidden',
    access: 'mixed',
    requiresApproval: true,
    requiredGate: 'runtime_entrypoint_coverage',
    summary: [
      `connectedServers=${status.connectedServerCount}`,
      `tools=${status.toolCount}`,
      `modelVisibleTools=${status.modelVisibleToolCount ?? 0}`,
      `errors=${status.errorCount ?? 0}`,
      typeof status.catalogueCount === 'number' ? `catalogue=${status.catalogueCount}` : null,
    ].filter(Boolean).join(' / '),
  };
}

function agentCliCapability(
  status: NonNullable<CapabilityProductSurfaceStatus['agentCli']> | null,
  snapshot: RuntimeCapabilitySnapshot | null,
): CapabilityRegistryEntry {
  if (!status) return deferredCapability('agent_cli.runtimes', 'Agent CLI Runtimes', 'agent_cli');
  const detected = status.detectedCount > 0;
  const readyManualRunCount = status.readyManualRunCount ?? Math.min(status.readyCount, status.manualRunCount ?? 0);
  const configured = readyManualRunCount > 0;
  const selected = snapshot?.executionRuntime.kind === 'agent_cli' ? snapshot.executionRuntime.label : null;
  return {
    id: 'agent_cli.runtimes',
    label: 'Agent CLI Runtimes',
    family: 'agent_cli',
    status: configured ? 'available' : detected || (status.errorCount ?? 0) > 0 ? 'unconfigured' : 'disabled',
    configured,
    missingReason: configured ? null : detected
      ? 'Agent CLI authentication is not confirmed; use the official CLI login flow before execution.'
      : 'No supported Agent CLI runtime is detected.',
    visibility: 'hidden',
    access: 'mutating',
    requiresApproval: true,
    requiredGate: 'runtime_pre_step',
    summary: [
      `detected=${status.detectedCount}`,
      `ready=${status.readyCount}`,
      `manualRun=${status.manualRunCount ?? 0}`,
      `readyManualRun=${readyManualRunCount}`,
      `running=${status.runningCount ?? 0}`,
      `errors=${status.errorCount ?? 0}`,
      typeof status.nativeWebSearchRuntimeDependentCount === 'number' && status.nativeWebSearchRuntimeDependentCount > 0
        ? `nativeWebSearch=runtime_dependent:${status.nativeWebSearchRuntimeDependentCount}`
        : null,
      typeof status.nativeWebSearchUnverifiedCount === 'number' && status.nativeWebSearchUnverifiedCount > 0
        ? `nativeWebSearchUnverified=${status.nativeWebSearchUnverifiedCount}`
        : null,
      selected ? `selected=${selected}` : null,
      selected && status.selectedNativeWebSearchAvailability
        ? `selectedNativeWebSearch=${status.selectedNativeWebSearchAvailability}`
        : null,
      typeof status.catalogueCount === 'number' ? `catalogue=${status.catalogueCount}` : null,
    ].filter(Boolean).join(' / '),
  };
}

function agentApiRuntimeCapability(snapshot: RuntimeCapabilitySnapshot | null): CapabilityRegistryEntry {
  const selected = snapshot?.executionRuntime.kind === 'agent_api';
  const providerConfigured = Boolean(snapshot?.model.configured);
  const availableForSelectedProviderPhases = selected && providerConfigured;
  const providerToolReadiness = evaluateAgentApiProviderToolReadinessFromEvidence({
    providerConfigured,
    selectedRuntime: {
      mode: selected ? 'api' : 'none',
      runtimeKind: selected ? 'agent_api' : 'none',
    },
    startupProbe: 'never',
  });
  return {
    id: 'agent_api.runtime',
    label: 'Agent API Runtime',
    family: 'agent_api',
    status: availableForSelectedProviderPhases ? 'available' : 'disabled',
    configured: availableForSelectedProviderPhases,
    missingReason: availableForSelectedProviderPhases
      ? null
      : 'Agent API Runtime is a peer AI invocation runtime; supported provider-backed phases require selecting API Runtime and configuring a provider key. Full task execution_run remains deferred behind Taskplane harness gates.',
    visibility: 'hidden',
    access: 'mutating',
    requiresApproval: true,
    requiredGate: 'runtime_pre_step',
    summary: [
      'executionKind=api',
      availableForSelectedProviderPhases ? 'status=partial' : 'status=development',
      'supportedPhases=chat,decomposition,decision,scheduled_brief',
      'executionRun=deferred',
      agentApiExecutionRunPromotionSummary(),
      agentApiExecutionRunGateSummary(),
      agentApiDecompositionPromotionSummary(),
      `providerToolReadiness=${providerToolReadiness.toolReadiness}`,
      `providerToolRequirements=${providerToolReadiness.satisfiedRequirements.length}/${providerToolReadiness.satisfiedRequirements.length + providerToolReadiness.missingRequirements.length}`,
      `providerToolMissingRequirements=${providerToolReadiness.missingRequirements.join(',') || 'none'}`,
      'startupProbe=never',
      selected ? 'selected=true' : null,
      providerConfigured ? 'provider=configured' : 'provider=missing',
    ].filter(Boolean).join(' / '),
  };
}

function agentApiExecutionRunPromotionSummary(): string {
  const promotionReadiness = evaluateAgentApiExecutionPromotionReadinessFromEvidence({});
  const promotionRequirementCount = promotionReadiness.satisfiedRequirements.length + promotionReadiness.missingRequirements.length;
  return [
    `executionRunPromotionRequirements=${promotionReadiness.satisfiedRequirements.length}/${promotionRequirementCount}`,
    `executionRunMissingRequirements=${promotionReadiness.missingRequirements.join(',') || 'none'}`,
  ].join(' / ');
}

function agentApiExecutionRunGateSummary(): string {
  const requiredGates = RUNTIME_ENTRYPOINT_COVERAGE
    .find((entrypoint) => entrypoint.id === 'run.triggerAgentApi.future')
    ?.requiredGates
    ?? requiredRuntimeEntrypointGatesForKind('provider_visible_execution');
  const excludedSummaryGates = new Set<RuntimeEntrypointGate>(['simplicity_check', 'runtime_action']);
  const keyGates = requiredGates.filter((gate) => !excludedSummaryGates.has(gate));
  return [
    `executionRunKeyGates=${keyGates.join(',')}`,
    `executionRunMissingGates=${keyGates.join(',')}`,
  ].join(' / ');
}

function agentApiDecompositionPromotionSummary(): string {
  const promotionReadiness = evaluateAgentApiDecompositionPromotionReadinessFromEvidence({});
  const promotionRequirementCount = promotionReadiness.satisfiedRequirements.length + promotionReadiness.missingRequirements.length;
  return [
    `decompositionPromotionRequirements=${promotionReadiness.satisfiedRequirements.length}/${promotionRequirementCount}`,
    `decompositionMissingRequirements=${promotionReadiness.missingRequirements.join(',') || 'none'}`,
  ].join(' / ');
}

function browserCapability(
  status: NonNullable<CapabilityProductSurfaceStatus['browser']> | null,
  scaffold: AgentToolScaffoldFamilySummary | null,
): CapabilityRegistryEntry {
  if (!status) {
    return toolScaffoldCapability({
      id: 'browser.operator',
      label: 'Browser Operator',
      family: 'browser',
      scaffold,
      access: 'mutating',
      requiredGate: 'runtime_pre_step',
    });
  }
  return {
    id: 'browser.operator',
    label: 'Browser Operator',
    family: 'browser',
    status: status.available ? 'available' : 'disabled',
    configured: status.available,
    missingReason: status.available ? null : status.reason ?? 'Browser operator is not available.',
    visibility: status.available ? 'policy_gated' : 'hidden',
    access: 'mutating',
    requiresApproval: true,
    requiredGate: 'runtime_pre_step',
    summary: status.reason ?? `browser=${status.available ? 'available' : 'disabled'}`,
  };
}

function toolScaffoldCapability(params: {
  id: string;
  label: string;
  family: CapabilityRegistryEntry['family'];
  scaffold: AgentToolScaffoldFamilySummary | null;
  access: CapabilityAccess;
  requiredGate: CapabilityRuntimeGate;
}): CapabilityRegistryEntry {
  if (!params.scaffold) {
    return deferredCapability(params.id, params.label, params.family);
  }
  const modelVisible = params.scaffold.modelVisibleIds.length > 0;
  const hasReserved = params.scaffold.reservedCount > 0;
  const configured = modelVisible;
  return {
    id: params.id,
    label: params.label,
    family: params.family,
    status: configured ? 'available' : hasReserved ? 'unconfigured' : 'disabled',
    configured,
    missingReason: configured ? null : 'Capability family is not configured for model-visible use.',
    visibility: modelVisible ? 'model_visible' : 'hidden',
    access: params.access,
    requiresApproval: params.scaffold.checkpointRequiredIds.length > 0 || params.scaffold.credentialGatedIds.length > 0,
    requiredGate: params.requiredGate,
    summary: params.scaffold.summary,
  };
}
