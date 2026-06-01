import { describe, expect, it } from 'vitest';

import type { CapabilityRegistryEntry } from './capability-registry.js';
import {
  buildCapabilityScopedAllowanceManifest,
  formatCapabilityScopedAllowanceManifestForStep,
} from './capability-scoped-allowance.js';
import { buildRuntimeCapabilitySnapshot } from './runtime-capability-snapshot.js';

describe('capability scoped allowance manifest', () => {
  it('separates global capability configuration from per-action scoped allowance', () => {
    const manifest = buildCapabilityScopedAllowanceManifest({
      capabilities: buildRuntimeCapabilitySnapshot({
        aiStatus: {
          apiKeySource: null,
          apiKeyStored: false,
          baseUrl: null,
          configPath: '/config.json',
          configured: false,
          featureFlags: { enableScheduler: false },
          model: null,
          provider: null,
          runtimeMode: 'codex',
          updatedAt: '2026-05-31T00:00:00.000Z',
          workspaceRoot: '/repo',
        },
      }),
      capabilityRegistry: [
        registryEntry({
          family: 'external_access',
          id: 'external_access.connectors',
          status: 'available',
          visibility: 'policy_gated',
        }),
        registryEntry({
          family: 'skill',
          id: 'skills.catalogue',
          status: 'available',
          visibility: 'model_visible',
        }),
        registryEntry({
          family: 'mcp',
          id: 'mcp.servers',
          status: 'available',
          visibility: 'model_visible',
        }),
        registryEntry({
          family: 'agent_cli',
          id: 'agent_cli.runtimes',
          status: 'available',
          visibility: 'hidden',
        }),
      ],
    });

    expect(manifest).toMatchObject({
      businessLineSkillPolicy: 'business_memory_only',
      globalConfigurationPolicy: 'global_capability_configuration',
      source: 'per_action_context_manifest',
    });
    expect(manifest.summary).toContain('perBusinessLineMatrix=no');
    expect(manifest.surfaces.find((surface) => surface.surface === 'external_access')).toMatchObject({
      allowance: 'context_only',
      globalConfiguration: 'global',
    });
    expect(manifest.surfaces.find((surface) => surface.surface === 'skills')).toMatchObject({
      allowance: 'context_only',
      sourceEntryIds: ['skills.catalogue'],
    });
    expect(manifest.surfaces.find((surface) => surface.surface === 'mcp_tools')).toMatchObject({
      allowance: 'context_only',
      sourceEntryIds: ['mcp.servers'],
    });
    expect(manifest.surfaces.find((surface) => surface.surface === 'hooks')).toMatchObject({
      allowance: 'runtime_native_gated',
      gate: 'runtime_adapter_capability',
    });
    expect(manifest.surfaces.find((surface) => surface.surface === 'local_file_scope')).toMatchObject({
      allowance: 'read_only',
      gate: 'runtime_context_assembly',
    });
    expect(formatCapabilityScopedAllowanceManifestForStep(manifest)).toContain(
      'capability_allowance:skills:context_only',
    );
  });

  it('blocks unexposed skills and MCP tools without converting business-line SOPs into runtime config', () => {
    const manifest = buildCapabilityScopedAllowanceManifest({
      capabilities: buildRuntimeCapabilitySnapshot({
        aiStatus: {
          apiKeySource: null,
          apiKeyStored: false,
          baseUrl: null,
          configPath: '/config.json',
          configured: false,
          featureFlags: { enableScheduler: false },
          model: null,
          provider: null,
          runtimeMode: 'api',
          updatedAt: '2026-05-31T00:00:00.000Z',
          workspaceRoot: null,
        },
      }),
      capabilityRegistry: [
        registryEntry({
          family: 'skill',
          id: 'skills.catalogue',
          missingReason: 'Ready skills are not exposed through the runtime tool gate.',
          status: 'unconfigured',
          visibility: 'hidden',
        }),
        registryEntry({
          family: 'mcp',
          id: 'mcp.servers',
          missingReason: 'Connected MCP tools are not exposed through the runtime tool gate.',
          status: 'unconfigured',
          visibility: 'hidden',
        }),
      ],
    });

    expect(manifest.surfaces.find((surface) => surface.surface === 'skills')).toMatchObject({
      allowance: 'blocked',
      reason: expect.stringContaining('Business-line SOPs remain business memory'),
    });
    expect(manifest.surfaces.find((surface) => surface.surface === 'mcp_tools')).toMatchObject({
      allowance: 'blocked',
    });
    expect(manifest.surfaces.find((surface) => surface.surface === 'hooks')).toMatchObject({
      allowance: 'blocked',
    });
    expect(manifest.surfaces.find((surface) => surface.surface === 'local_file_scope')).toMatchObject({
      allowance: 'blocked',
    });
    expect(JSON.stringify(manifest)).not.toContain('businessLineId');
  });
});

function registryEntry(partial: Partial<CapabilityRegistryEntry>): CapabilityRegistryEntry {
  return {
    access: 'mixed',
    configured: partial.status === 'available',
    family: 'skill',
    id: 'capability.test',
    label: 'Capability',
    missingReason: null,
    requiredGate: 'runtime_entrypoint_coverage',
    requiresApproval: true,
    status: 'available',
    summary: 'test capability',
    visibility: 'hidden',
    ...partial,
  };
}
