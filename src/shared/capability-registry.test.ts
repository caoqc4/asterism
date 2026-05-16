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
