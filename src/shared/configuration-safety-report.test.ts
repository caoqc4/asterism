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
    expect(report.surfaces.find((surface) => surface.id === 'browser.operator')).toMatchObject({
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    });
    expect(report.surfaces.find((surface) => surface.id === 'sandbox.coding_agent')).toMatchObject({
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
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
