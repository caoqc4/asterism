import { describe, expect, it } from 'vitest';

import {
  buildRuntimeCapabilitySnapshot,
  capabilitySnapshotAllowsModelExecution,
  capabilitySnapshotAllowsWorkspaceVerification,
} from './runtime-capability-snapshot.js';
import type { AiConfigStatus } from './types/settings.js';

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
    toolScaffoldSummaries: [{
      family: 'task_domain',
      descriptorIds: ['task.inspect_context'],
      implementedCount: 1,
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
    }],
    ...partial,
  };
}

describe('runtime capability snapshot', () => {
  it('summarizes model, workspace, flags, and tool scaffold state', () => {
    const snapshot = buildRuntimeCapabilitySnapshot({ aiStatus: aiStatus() });

    expect(snapshot).toMatchObject({
      model: {
        configured: true,
        provider: 'anthropic',
        producer: 'available',
      },
      workspace: {
        rootConfigured: true,
        lintAvailable: true,
        testAvailable: false,
      },
      flags: {
        scheduler: 'disabled',
        sandboxCodingAgent: 'available',
        selfCheck: 'available',
      },
      sandbox: {
        backendProbed: false,
        backendReady: false,
        producerBackendReady: false,
      },
      tools: {
        familyCount: 1,
        modelVisibleCount: 1,
        checkpointRequiredCount: 1,
        families: ['task_domain'],
        summaries: [expect.objectContaining({
          family: 'task_domain',
          modelVisibleIds: ['task.inspect_context'],
        })],
      },
      registry: {
        entryCount: 0,
        availableCount: 0,
        modelVisibleCount: 0,
        blockedCount: 0,
      },
    });
    expect(snapshot.summary).toContain('model=configured');
    expect(snapshot.summary).toContain('sandbox=not_probed');
    expect(capabilitySnapshotAllowsModelExecution(snapshot)).toBe(true);
    expect(capabilitySnapshotAllowsWorkspaceVerification(snapshot)).toBe(true);
  });

  it('keeps missing capability state explicit', () => {
    const snapshot = buildRuntimeCapabilitySnapshot({
      aiStatus: aiStatus({
        configured: false,
        model: null,
        provider: null,
        workspaceRoot: null,
        codeAgentWorkspaceChecks: undefined,
        codeAgentModelProducerEnabled: false,
        toolScaffoldSummaries: [],
      }),
    });

    expect(snapshot.summary).toContain('model=missing');
    expect(snapshot.summary).toContain('workspace=missing');
    expect(capabilitySnapshotAllowsModelExecution(snapshot)).toBe(false);
    expect(capabilitySnapshotAllowsWorkspaceVerification(snapshot)).toBe(false);
  });

  it('summarizes sandbox backend readiness when a probe is available', () => {
    const snapshot = buildRuntimeCapabilitySnapshot({
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
            summary: 'Sandbox backend ready: local-container.',
            blockedReasons: [],
          },
          producerBackendReadiness: {
            ready: true,
            summary: 'Sandbox producer backend ready.',
            blockedReasons: [],
          },
          summary: 'Sandbox backend ready: local-container.',
        },
      }),
    });

    expect(snapshot.sandbox).toMatchObject({
      backendProbed: true,
      backendReady: true,
      producerBackendReady: true,
      summary: 'Sandbox producer backend ready.',
    });
    expect(snapshot.summary).toContain('sandbox=ready');
  });

  it('summarizes capability registry rows without exposing catalogue entry names', () => {
    const snapshot = buildRuntimeCapabilitySnapshot({
      aiStatus: aiStatus({
        capabilityRegistry: [
          {
            access: 'mixed',
            configured: true,
            family: 'skill',
            id: 'skills.catalogue',
            label: 'Skills',
            missingReason: null,
            requiredGate: 'runtime_entrypoint_coverage',
            requiresApproval: true,
            status: 'available',
            summary: 'enabled=1 / ready=1 / modelVisible=1 / needsConfig=0 / catalogue=1 / Brainstorming',
            visibility: 'model_visible',
          },
          {
            access: 'mixed',
            configured: false,
            family: 'mcp',
            id: 'mcp.servers',
            label: 'MCP Servers',
            missingReason: 'Connected MCP tools are not exposed through the runtime tool gate.',
            requiredGate: 'runtime_entrypoint_coverage',
            requiresApproval: true,
            status: 'unconfigured',
            summary: 'connectedServers=1 / tools=3 / modelVisibleTools=0 / errors=0 / catalogue=1 / Playwright MCP',
            visibility: 'hidden',
          },
        ],
      }),
    });

    expect(snapshot.registry).toEqual({
      availableCount: 1,
      blockedCount: 1,
      entryCount: 2,
      hiddenCount: 1,
      modelVisibleCount: 1,
      policyGatedCount: 0,
    });
    expect(snapshot.summary).toContain('capabilityRows=2');
    expect(snapshot.summary).toContain('capabilityAvailable=1');
    expect(snapshot.summary).toContain('capabilityModelVisible=1');
    expect(snapshot.summary).toContain('capabilityBlocked=1');
    expect(snapshot.summary).not.toContain('Brainstorming');
    expect(snapshot.summary).not.toContain('Playwright');
  });
});
