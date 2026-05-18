import type { AgentToolScaffoldFamilySummary } from './agent-tool-scaffold.js';
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
    needsConfigCount?: number;
    catalogueCount?: number;
  } | null;
  mcp?: {
    connectedServerCount: number;
    toolCount: number;
    errorCount?: number;
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
      summary: `scheduler=${snapshot?.flags.scheduler ?? 'unknown'}`,
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
    browserCapability(productSurfaces?.browser ?? null, findToolFamily(snapshot, 'browser_playwright')),
  ];
}

export function capabilityRegistryAllowsModelExecution(
  registry: CapabilityRegistryEntry[],
): boolean {
  return registry.some((entry) => (
    entry.id === 'model.provider'
    && entry.status === 'available'
    && entry.requiredGate === 'runtime_context_assembly'
  ));
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
  const enabled = status.enabledCount > 0 && status.readyCount > 0;
  return {
    id: 'skills.catalogue',
    label: 'Skills',
    family: 'skill',
    status: enabled ? 'available' : status.needsConfigCount ? 'unconfigured' : 'disabled',
    configured: enabled,
    missingReason: enabled ? null : 'No ready skill is enabled.',
    visibility: enabled ? 'policy_gated' : 'hidden',
    access: 'mixed',
    requiresApproval: true,
    requiredGate: 'runtime_entrypoint_coverage',
    summary: [
      `enabled=${status.enabledCount}`,
      `ready=${status.readyCount}`,
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
  return {
    id: 'mcp.servers',
    label: 'MCP Servers',
    family: 'mcp',
    status: connected ? 'available' : status.errorCount ? 'unconfigured' : 'disabled',
    configured: connected,
    missingReason: connected ? null : 'No connected MCP server exposes tools.',
    visibility: connected ? 'policy_gated' : 'hidden',
    access: 'mixed',
    requiresApproval: true,
    requiredGate: 'runtime_entrypoint_coverage',
    summary: `connectedServers=${status.connectedServerCount} / tools=${status.toolCount} / errors=${status.errorCount ?? 0}`,
  };
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
