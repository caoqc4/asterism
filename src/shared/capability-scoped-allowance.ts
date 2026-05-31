import type {
  CapabilityRegistryEntry,
  CapabilityRuntimeGate,
} from './capability-registry.js';
import type { RuntimeCapabilitySnapshot } from './runtime-capability-snapshot.js';

export type CapabilitySurfaceKind =
  | 'browser_computer_use'
  | 'external_access'
  | 'hooks'
  | 'local_file_scope'
  | 'mcp_tools'
  | 'skills';

export type CapabilityScopedAllowanceMode =
  | 'blocked'
  | 'context_only'
  | 'read_only'
  | 'runtime_native_gated';

export type CapabilityScopedAllowance = {
  allowance: CapabilityScopedAllowanceMode;
  gate: CapabilityRuntimeGate | 'runtime_adapter_capability';
  globalConfiguration: 'global';
  reason: string;
  sourceEntryIds: string[];
  surface: CapabilitySurfaceKind;
};

export type CapabilityScopedAllowanceManifest = {
  businessLineSkillPolicy: 'business_memory_only';
  globalConfigurationPolicy: 'global_capability_configuration';
  source: 'per_action_context_manifest';
  surfaces: CapabilityScopedAllowance[];
  summary: string;
};

export function buildCapabilityScopedAllowanceManifest(params: {
  capabilities?: RuntimeCapabilitySnapshot | null;
  capabilityRegistry?: CapabilityRegistryEntry[] | null;
}): CapabilityScopedAllowanceManifest {
  const registry = params.capabilityRegistry ?? [];
  const capabilities = params.capabilities ?? null;
  const surfaces: CapabilityScopedAllowance[] = [
    externalAccessAllowance(registry),
    skillsAllowance(registry),
    mcpToolsAllowance(registry),
    hooksAllowance(registry, capabilities),
    browserComputerUseAllowance(registry),
    localFileScopeAllowance(capabilities),
  ];
  const allowedCount = surfaces.filter((surface) => surface.allowance !== 'blocked').length;
  const blockedCount = surfaces.length - allowedCount;

  return {
    businessLineSkillPolicy: 'business_memory_only',
    globalConfigurationPolicy: 'global_capability_configuration',
    source: 'per_action_context_manifest',
    surfaces,
    summary: [
      `scopedAllowances=${surfaces.length}`,
      `allowed=${allowedCount}`,
      `blocked=${blockedCount}`,
      'businessLineSkills=business_memory_only',
      'perBusinessLineMatrix=no',
    ].join(' / '),
  };
}

export function formatCapabilityScopedAllowanceManifestForStep(
  manifest: CapabilityScopedAllowanceManifest,
): string {
  return [
    `capability_allowance:${manifest.summary}`,
    ...manifest.surfaces.map((surface) => [
      `capability_allowance:${surface.surface}:${surface.allowance}`,
      `gate=${surface.gate}`,
      `global=${surface.globalConfiguration}`,
      surface.sourceEntryIds.length ? `entries=${surface.sourceEntryIds.join(',')}` : 'entries=none',
      `reason=${surface.reason}`,
    ].join(':')),
  ].join('\n');
}

function externalAccessAllowance(registry: CapabilityRegistryEntry[]): CapabilityScopedAllowance {
  const entries = entriesForFamily(registry, 'external_access');
  const available = entries.some((entry) => entry.status === 'available');
  return {
    allowance: available ? 'context_only' : 'blocked',
    gate: firstGate(entries),
    globalConfiguration: 'global',
    reason: available
      ? 'External access is globally configured, but this action receives only scoped context unless an explicit connector gate opens a tool.'
      : 'No globally configured external access surface is available for this action.',
    sourceEntryIds: entries.map((entry) => entry.id),
    surface: 'external_access',
  };
}

function skillsAllowance(registry: CapabilityRegistryEntry[]): CapabilityScopedAllowance {
  const entries = entriesForFamily(registry, 'skill');
  const modelVisible = entries.some((entry) => entry.status === 'available' && entry.visibility === 'model_visible');
  return {
    allowance: modelVisible ? 'context_only' : 'blocked',
    gate: firstGate(entries),
    globalConfiguration: 'global',
    reason: modelVisible
      ? 'Global Skills catalogue is model-visible through a gate; business-line SOPs remain BusinessLineContextPack memory, not runtime configuration.'
      : 'Skills are not model-visible for this action. Business-line SOPs remain business memory, not global runtime tools.',
    sourceEntryIds: entries.map((entry) => entry.id),
    surface: 'skills',
  };
}

function mcpToolsAllowance(registry: CapabilityRegistryEntry[]): CapabilityScopedAllowance {
  const entries = entriesForFamily(registry, 'mcp');
  const modelVisible = entries.some((entry) => entry.status === 'available' && entry.visibility === 'model_visible');
  return {
    allowance: modelVisible ? 'context_only' : 'blocked',
    gate: firstGate(entries),
    globalConfiguration: 'global',
    reason: modelVisible
      ? 'MCP tools are globally connected and model-visible, but this action receives a scoped allowance instead of a business-line-specific MCP matrix.'
      : 'No MCP tools are model-visible for this action.',
    sourceEntryIds: entries.map((entry) => entry.id),
    surface: 'mcp_tools',
  };
}

function hooksAllowance(
  registry: CapabilityRegistryEntry[],
  capabilities: RuntimeCapabilitySnapshot | null,
): CapabilityScopedAllowance {
  const entries = entriesForFamily(registry, 'agent_cli');
  const agentCliSelected = capabilities?.executionRuntime.kind === 'agent_cli';
  return {
    allowance: agentCliSelected ? 'runtime_native_gated' : 'blocked',
    gate: 'runtime_adapter_capability',
    globalConfiguration: 'global',
    reason: agentCliSelected
      ? 'Native hooks are adapter capability evidence for the selected CLI runtime; this allowance does not grant product writes.'
      : 'No selected native CLI runtime owns hook capability for this action.',
    sourceEntryIds: entries.map((entry) => entry.id),
    surface: 'hooks',
  };
}

function browserComputerUseAllowance(registry: CapabilityRegistryEntry[]): CapabilityScopedAllowance {
  const entries = registry.filter((entry) => entry.family === 'browser' || entry.family === 'agent_tool');
  const availableBrowser = entries.some((entry) => entry.family === 'browser' && entry.status === 'available');
  return {
    allowance: availableBrowser ? 'runtime_native_gated' : 'blocked',
    gate: firstGate(entries),
    globalConfiguration: 'global',
    reason: availableBrowser
      ? 'Browser/computer-use surfaces require an explicit per-action runtime gate before any external interaction.'
      : 'Browser/computer-use is not opened for this action.',
    sourceEntryIds: entries.map((entry) => entry.id),
    surface: 'browser_computer_use',
  };
}

function localFileScopeAllowance(capabilities: RuntimeCapabilitySnapshot | null): CapabilityScopedAllowance {
  const workspaceReady = capabilities?.workspace.rootConfigured === true;
  return {
    allowance: workspaceReady ? 'read_only' : 'blocked',
    gate: 'runtime_context_assembly',
    globalConfiguration: 'global',
    reason: workspaceReady
      ? 'Local workspace scope is read-only for this action; workspace writes require a separate reviewed write path.'
      : 'No local workspace root is configured for this action.',
    sourceEntryIds: capabilities ? ['runtime_capabilities'] : [],
    surface: 'local_file_scope',
  };
}

function entriesForFamily(
  registry: CapabilityRegistryEntry[],
  family: CapabilityRegistryEntry['family'],
): CapabilityRegistryEntry[] {
  return registry.filter((entry) => entry.family === family);
}

function firstGate(entries: CapabilityRegistryEntry[]): CapabilityScopedAllowance['gate'] {
  return entries[0]?.requiredGate ?? 'runtime_entrypoint_coverage';
}
