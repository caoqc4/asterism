import { describe, expect, it } from 'vitest';

import {
  buildCapabilityRegistry,
  capabilityRegistryAllowsModelExecution,
  capabilityRegistryAllowsWorkspaceVerification,
} from './capability-registry.js';
import { buildRuntimeCapabilitySnapshot } from './runtime-capability-snapshot.js';
import type { AgentToolScaffoldFamilySummary } from './agent-tool-scaffold.js';
import type { AiConfigStatus } from './types/settings.js';

describe('capability registry', () => {
  it('projects runtime capability snapshot into stable registry entries', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: aiStatus() }),
    });

    expect(registry.map((entry) => entry.id)).toEqual([
      'model.provider',
      'model.code_agent_producer',
      'workspace.root',
      'workspace.checks',
      'runtime.scheduler',
      'sandbox.coding_agent',
      'runtime.self_check',
      'agent_tools.model_visible',
      'agent_tools.checkpointed',
      'external_access.connectors',
      'skills.catalogue',
      'mcp.servers',
      'browser.operator',
    ]);

    expect(registry.find((entry) => entry.id === 'model.provider')).toMatchObject({
      status: 'available',
      configured: true,
      visibility: 'policy_gated',
      requiredGate: 'runtime_context_assembly',
    });
    expect(registry.find((entry) => entry.id === 'agent_tools.model_visible')).toMatchObject({
      status: 'available',
      visibility: 'model_visible',
      requiresApproval: true,
      summary: 'modelVisibleTools=1',
    });
    expect(registry.find((entry) => entry.id === 'sandbox.coding_agent')).toMatchObject({
      status: 'unknown',
      configured: false,
      visibility: 'hidden',
      missingReason: 'Sandbox backend has not been probed.',
    });
    expect(capabilityRegistryAllowsModelExecution(registry)).toBe(true);
    expect(capabilityRegistryAllowsWorkspaceVerification(registry)).toBe(true);
  });

  it('keeps disabled or unconfigured capabilities hidden from model-visible exposure', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({
        aiStatus: aiStatus({
          configured: false,
          provider: null,
          model: null,
          workspaceRoot: null,
          codeAgentModelProducerEnabled: false,
          codeAgentWorkspaceChecks: undefined,
          toolScaffoldSummaries: [],
          featureFlags: {
            enableScheduler: false,
            enableSandboxCodingAgent: false,
            enableSelfCheck: false,
          },
        }),
      }),
    });

    for (const entry of registry) {
      if (entry.status === 'available') continue;
      expect(entry.visibility).not.toBe('model_visible');
    }
    expect(registry.find((entry) => entry.id === 'model.provider')).toMatchObject({
      status: 'unconfigured',
      missingReason: 'No configured model provider.',
    });
    expect(capabilityRegistryAllowsModelExecution(registry)).toBe(false);
    expect(capabilityRegistryAllowsWorkspaceVerification(registry)).toBe(false);
  });

  it('requires a runtime gate and approval declaration for every capability', () => {
    for (const entry of buildCapabilityRegistry({ snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: aiStatus() }) })) {
      expect(entry.requiredGate).not.toBeUndefined();
      expect(typeof entry.requiresApproval).toBe('boolean');
      expect(entry.summary.length).toBeGreaterThan(0);
    }
  });

  it('requires sandbox backend readiness before exposing sandbox coding as available', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({
        aiStatus: aiStatus({
          sandboxBackendStatus: {
            probe: {
              backendId: 'local-container',
              environmentPolicy: 'empty',
              isolation: 'container',
              kind: 'local_container',
              networkMode: 'disabled',
              status: 'available',
              supportsOutputLimits: true,
              supportsPatchArtifacts: true,
              supportsStagedWrites: true,
              supportsStructuredCommands: true,
              supportsTargetedCommands: true,
              supportsWorkspaceMount: true,
            },
            profile: null,
            readiness: {
              ready: true,
              summary: 'Sandbox backend ready.',
              blockedReasons: [],
            },
            producerBackendReadiness: {
              ready: true,
              summary: 'Sandbox producer backend ready.',
              blockedReasons: [],
            },
            summary: 'Sandbox backend ready.',
          },
        }),
      }),
    });

    expect(registry.find((entry) => entry.id === 'sandbox.coding_agent')).toMatchObject({
      status: 'available',
      configured: true,
      visibility: 'policy_gated',
      requiredGate: 'capability_probe',
      summary: 'Sandbox producer backend ready.',
    });
  });

  it('can promote product surface statuses out of deferred capability rows', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: aiStatus() }),
      productSurfaces: {
        externalAccess: { connectedCount: 2, pendingCount: 1, errorCount: 0 },
        skills: { enabledCount: 3, readyCount: 2, needsConfigCount: 1 },
        mcp: { connectedServerCount: 1, toolCount: 4, errorCount: 0 },
        browser: { available: true, reason: 'Browser automation configured.' },
      },
    });

    expect(registry.find((entry) => entry.id === 'external_access.connectors')).toMatchObject({
      status: 'available',
      configured: true,
      visibility: 'hidden',
      access: 'read_only',
      summary: 'connected=2 / pending=1 / errors=0',
    });
    expect(registry.find((entry) => entry.id === 'skills.catalogue')).toMatchObject({
      status: 'available',
      visibility: 'policy_gated',
      summary: 'enabled=3 / ready=2 / needsConfig=1',
    });
    expect(registry.find((entry) => entry.id === 'mcp.servers')).toMatchObject({
      status: 'available',
      visibility: 'policy_gated',
      summary: 'connectedServers=1 / tools=4 / errors=0',
    });
    expect(registry.find((entry) => entry.id === 'browser.operator')).toMatchObject({
      status: 'available',
      visibility: 'policy_gated',
      requiredGate: 'runtime_pre_step',
      summary: 'Browser automation configured.',
    });
  });

  it('keeps product surfaces hidden when they are not connected or ready', () => {
    const registry = buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: aiStatus() }),
      productSurfaces: {
        externalAccess: { connectedCount: 0, errorCount: 1 },
        skills: { enabledCount: 1, readyCount: 0, needsConfigCount: 1 },
        mcp: { connectedServerCount: 1, toolCount: 0, errorCount: 1 },
        browser: { available: false, reason: 'Browser plugin unavailable.' },
      },
    });

    expect(registry.find((entry) => entry.id === 'external_access.connectors')).toMatchObject({
      status: 'disabled',
      visibility: 'hidden',
    });
    expect(registry.find((entry) => entry.id === 'skills.catalogue')).toMatchObject({
      status: 'unconfigured',
      visibility: 'hidden',
    });
    expect(registry.find((entry) => entry.id === 'mcp.servers')).toMatchObject({
      status: 'unconfigured',
      visibility: 'hidden',
    });
    expect(registry.find((entry) => entry.id === 'browser.operator')).toMatchObject({
      status: 'disabled',
      visibility: 'hidden',
      missingReason: 'Browser plugin unavailable.',
    });
  });
});

function aiStatus(partial: Partial<AiConfigStatus> = {}): AiConfigStatus {
  return {
    configured: true,
    apiKeyStored: true,
    apiKeySource: 'env',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-latest',
    baseUrl: null,
    workspaceRoot: '/repo',
    updatedAt: '2026-01-01T00:00:00.000Z',
    configPath: '/config.json',
    codeAgentModelProducerEnabled: true,
    codeAgentWorkspaceChecks: {
      lint: { available: true, reason: 'ok' },
      test: { available: false, reason: 'missing' },
    },
    featureFlags: {
      enableScheduler: false,
      enableSandboxCodingAgent: true,
      enableSelfCheck: true,
    },
    toolScaffoldSummaries: [toolSummary()],
    ...partial,
  };
}

function toolSummary(): AgentToolScaffoldFamilySummary {
  return {
    family: 'task_domain',
    descriptorIds: ['task.inspect_context', 'task.update'],
    implementedCount: 2,
    reservedCount: 0,
    connectorPolicyRecords: [],
    localVerificationEvidence: [],
    textPromptExposedIds: [],
    providerNativeExposedIds: [],
    checkpointRequiredIds: ['task.update'],
    credentialGatedIds: [],
    localVerificationRequiredIds: [],
    modelVisibleIds: ['task.inspect_context'],
    summary: 'task tools',
  };
}
