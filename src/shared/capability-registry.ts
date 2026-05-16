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

export function buildCapabilityRegistry(params: {
  snapshot?: RuntimeCapabilitySnapshot | null;
}): CapabilityRegistryEntry[] {
  const snapshot = params.snapshot ?? null;
  const modelConfigured = Boolean(snapshot?.model.configured);
  const workspaceConfigured = Boolean(snapshot?.workspace.rootConfigured);
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
      status: statusFromSnapshot(snapshot?.flags.sandboxCodingAgent),
      configured: snapshot?.flags.sandboxCodingAgent === 'available',
      missingReason: snapshot?.flags.sandboxCodingAgent === 'available' ? null : 'Sandbox coding agent is disabled or unknown.',
      visibility: 'policy_gated',
      access: 'mutating',
      requiresApproval: true,
      requiredGate: 'capability_probe',
      summary: `sandboxCodingAgent=${snapshot?.flags.sandboxCodingAgent ?? 'unknown'}`,
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
    deferredCapability('external_access.connectors', 'External Access', 'external_access'),
    deferredCapability('skills.catalogue', 'Skills', 'skill'),
    deferredCapability('mcp.servers', 'MCP Servers', 'mcp'),
    deferredCapability('browser.operator', 'Browser Operator', 'browser'),
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
