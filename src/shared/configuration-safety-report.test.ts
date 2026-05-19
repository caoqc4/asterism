import { describe, expect, it } from 'vitest';

import { buildCapabilityRegistry } from './capability-registry.js';
import { buildConfigurationSafetyReport } from './configuration-safety-report.js';
import { buildRuntimeCapabilitySnapshot } from './runtime-capability-snapshot.js';
import type { AiConfigStatus } from './types/settings.js';

describe('configuration safety report', () => {
  it('summarizes safe configuration state without exposing secret values', () => {
    const status = withRegistry(aiStatus());
    const report = buildConfigurationSafetyReport(status);

    expect(report.secretExposureSafe).toBe(true);
    expect(report.surfaces.find((surface) => surface.id === 'model.api_key')).toMatchObject({
      state: 'configured',
      reason: 'API key source is env; secret value is not exposed.',
      startupProbePolicy: 'never',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'workspace.root')).toMatchObject({
      state: 'configured',
      requiresApproval: true,
      startupProbePolicy: 'safe_read_only',
    });
  });

  it('keeps costly or mutating capabilities approval-bound', () => {
    const status = withRegistry(aiStatus({
      featureFlags: {
        enableScheduler: true,
        enableSandboxCodingAgent: true,
        enableSandboxPatchPromotionApply: true,
        enableSelfCheck: true,
      },
    }));
    const report = buildConfigurationSafetyReport(status);

    expect(report.surfaces.find((surface) => surface.id === 'runtime.scheduler')).toMatchObject({
      state: 'approval_required',
      requiresApproval: true,
      startupProbePolicy: 'never',
    });
    expect(report.surfaces.find((surface) => surface.id === 'sandbox.patch_promotion')).toMatchObject({
      state: 'approval_required',
      requiresApproval: true,
      startupProbePolicy: 'manual_only',
    });
  });

  it('explains blocked missing or disabled configuration', () => {
    const status = withRegistry(aiStatus({
      configured: false,
      apiKeySource: null,
      provider: null,
      model: null,
      workspaceRoot: null,
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: false,
        enableSandboxPatchPromotionApply: false,
        enableSelfCheck: false,
      },
    }));
    const report = buildConfigurationSafetyReport(status);

    expect(report.surfaces.find((surface) => surface.id === 'model.provider')).toMatchObject({
      state: 'missing',
      reason: 'Model provider or model is missing.',
    });
    expect(report.surfaces.find((surface) => surface.id === 'runtime.scheduler')).toMatchObject({
      state: 'disabled_by_flag',
    });
    expect(report.blockedReasons).toEqual(expect.arrayContaining([
      'model.provider: Model provider or model is missing.',
      'model.api_key: API key is missing.',
      'workspace.root: Workspace root is missing.',
    ]));
  });

  it('keeps live external probes manual-only by default', () => {
    const report = buildConfigurationSafetyReport(withRegistry(aiStatus()));

    expect(report.surfaces.find((surface) => surface.id === 'external_access.connectors')).toMatchObject({
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'skills.catalogue')).toMatchObject({
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'mcp.servers')).toMatchObject({
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'agent_cli.runtimes')).toMatchObject({
      startupProbePolicy: 'safe_read_only',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'browser.operator')).toMatchObject({
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'sandbox.coding_agent')).toMatchObject({
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
  });

  it('distinguishes product-policy disabled surfaces from feature-flag disabled surfaces', () => {
    const base = aiStatus({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: false,
        enableSandboxPatchPromotionApply: false,
        enableSelfCheck: true,
      },
    });
    const report = buildConfigurationSafetyReport({
      ...base,
      capabilityRegistry: buildCapabilityRegistry({
        snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: base }),
        productSurfaces: {
          externalAccess: { connectedCount: 0, pendingCount: 0, errorCount: 0, catalogueCount: 1 },
          skills: { enabledCount: 0, readyCount: 0, needsConfigCount: 0, catalogueCount: 1 },
          mcp: { connectedServerCount: 0, toolCount: 0, errorCount: 0, catalogueCount: 1 },
          agentCli: { detectedCount: 0, readyCount: 0, manualRunCount: 0, readyManualRunCount: 0, runningCount: 0, errorCount: 0, catalogueCount: 2 },
        },
      }),
    });

    expect(report.surfaces.find((surface) => surface.id === 'runtime.scheduler')).toMatchObject({
      state: 'disabled_by_flag',
    });
    expect(report.surfaces.find((surface) => surface.id === 'external_access.connectors')).toMatchObject({
      state: 'disabled_by_policy',
      reason: 'No external access connector is connected.',
    });
    expect(report.surfaces.find((surface) => surface.id === 'skills.catalogue')).toMatchObject({
      state: 'disabled_by_policy',
      reason: 'No ready skill is enabled.',
    });
    expect(report.surfaces.find((surface) => surface.id === 'mcp.servers')).toMatchObject({
      state: 'disabled_by_policy',
      reason: 'No connected MCP server exposes tools.',
    });
    expect(report.surfaces.find((surface) => surface.id === 'agent_cli.runtimes')).toMatchObject({
      state: 'disabled_by_policy',
      reason: 'No supported Agent CLI runtime is detected.',
    });
  });

  it('treats pending or errored External Access connectors as missing configuration, not disabled flags', () => {
    const base = aiStatus();
    const report = buildConfigurationSafetyReport({
      ...base,
      capabilityRegistry: buildCapabilityRegistry({
        snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: base }),
        productSurfaces: {
          externalAccess: { connectedCount: 0, pendingCount: 1, errorCount: 1 },
        },
      }),
    });

    expect(report.surfaces.find((surface) => surface.id === 'external_access.connectors')).toMatchObject({
      state: 'missing',
      reason: 'External access connector authorization is pending or has errors.',
      startupProbePolicy: 'manual_only',
    });
  });

  it('redacts accidental secret-looking values from safety reasons', () => {
    const report = buildConfigurationSafetyReport({
      ...aiStatus(),
      capabilityRegistry: [
        {
          id: 'external_access.connectors',
          family: 'external_access',
          label: 'External Access',
          status: 'unconfigured',
          configured: false,
          summary: 'Gmail token=secret-token-1 is missing',
          missingReason: 'Gmail accessToken=short-lived-token; apiKey=raw-key; Authorization Bearer abc.def',
          visibility: 'hidden',
          access: 'read_only',
          requiresApproval: true,
          requiredGate: 'capability_probe',
        },
      ],
    });
    const reason = report.surfaces.find((surface) => surface.id === 'external_access.connectors')?.reason ?? '';

    expect(reason).toContain('accessToken=[redacted]');
    expect(reason).toContain('apiKey=[redacted]');
    expect(reason).toContain('Bearer [redacted]');
    expect(reason).not.toContain('short-lived-token');
    expect(reason).not.toContain('raw-key');
    expect(report.blockedReasons.join('\n')).not.toContain('abc.def');
  });

  it('keeps Skills and MCP safety states aligned with capability registry rows', () => {
    const base = aiStatus();
    const status = {
      ...base,
      capabilityRegistry: buildCapabilityRegistry({
        snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: base }),
        productSurfaces: {
          skills: { enabledCount: 2, readyCount: 1, modelVisibleCount: 1, needsConfigCount: 1, catalogueCount: 1 },
          mcp: { connectedServerCount: 1, toolCount: 3, modelVisibleToolCount: 2, errorCount: 0, catalogueCount: 1 },
          agentCli: { detectedCount: 1, readyCount: 1, manualRunCount: 1, readyManualRunCount: 1, runningCount: 0, errorCount: 0, catalogueCount: 2 },
        },
      }),
    };
    const report = buildConfigurationSafetyReport(status);

    expect(report.surfaces.find((surface) => surface.id === 'skills.catalogue')).toMatchObject({
      state: 'approval_required',
      requiresApproval: true,
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'mcp.servers')).toMatchObject({
      state: 'approval_required',
      requiresApproval: true,
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'agent_cli.runtimes')).toMatchObject({
      state: 'approval_required',
      requiresApproval: true,
      startupProbePolicy: 'safe_read_only',
      exposesSecretValue: false,
    });
  });

  it('does not treat ready Skills or connected MCP tools as usable until model-visible exposure is gated in', () => {
    const base = aiStatus();
    const status = {
      ...base,
      capabilityRegistry: buildCapabilityRegistry({
        snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: base }),
        productSurfaces: {
          skills: { enabledCount: 1, readyCount: 1, modelVisibleCount: 0, needsConfigCount: 0, catalogueCount: 1 },
          mcp: { connectedServerCount: 1, toolCount: 3, modelVisibleToolCount: 0, errorCount: 0, catalogueCount: 1 },
        },
      }),
    };
    const report = buildConfigurationSafetyReport(status);

    expect(report.surfaces.find((surface) => surface.id === 'skills.catalogue')).toMatchObject({
      state: 'missing',
      reason: 'Ready skills are not exposed through the runtime tool gate.',
    });
    expect(report.surfaces.find((surface) => surface.id === 'mcp.servers')).toMatchObject({
      state: 'missing',
      reason: 'Connected MCP tools are not exposed through the runtime tool gate.',
    });
  });
});

function withRegistry(status: AiConfigStatus): AiConfigStatus {
  return {
    ...status,
    capabilityRegistry: buildCapabilityRegistry({
      snapshot: buildRuntimeCapabilitySnapshot({ aiStatus: status }),
    }),
  };
}

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
      test: { available: true, reason: 'ok' },
    },
    featureFlags: {
      enableScheduler: false,
      enableSandboxCodingAgent: false,
      enableSandboxPatchPromotionApply: false,
      enableSelfCheck: true,
    },
    toolScaffoldSummaries: [],
    ...partial,
  };
}
