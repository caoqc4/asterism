import type { CapabilityRegistryEntry } from './capability-registry.js';
import type { AiConfigStatus } from './types/settings.js';

export type ConfigurationSafetyState =
  | 'configured'
  | 'missing'
  | 'disabled_by_flag'
  | 'disabled_by_policy'
  | 'approval_required';

export type ConfigurationSafetySurfaceId =
  | 'model.provider'
  | 'model.api_key'
  | 'workspace.root'
  | 'runtime.scheduler'
  | 'sandbox.coding_agent'
  | 'sandbox.patch_promotion'
  | 'external_access.connectors'
  | 'skills.catalogue'
  | 'mcp.servers'
  | 'browser.operator';

export type ConfigurationSafetySurface = {
  id: ConfigurationSafetySurfaceId;
  state: ConfigurationSafetyState;
  reason: string;
  requiresApproval: boolean;
  startupProbePolicy: 'never' | 'manual_only' | 'safe_read_only';
  exposesSecretValue: boolean;
};

export type ConfigurationSafetyReport = {
  surfaces: ConfigurationSafetySurface[];
  secretExposureSafe: boolean;
  blockedReasons: string[];
  summary: string;
};

export function buildConfigurationSafetyReport(status: AiConfigStatus): ConfigurationSafetyReport {
  const registry = status.capabilityRegistry ?? [];
  const surfaces: ConfigurationSafetySurface[] = [
    {
      id: 'model.provider',
      state: status.provider && status.model ? 'configured' : 'missing',
      reason: status.provider && status.model
        ? `Provider configured: ${status.provider} / ${status.model}.`
        : 'Model provider or model is missing.',
      requiresApproval: false,
      startupProbePolicy: 'safe_read_only',
      exposesSecretValue: false,
    },
    {
      id: 'model.api_key',
      state: status.configured ? 'configured' : 'missing',
      reason: status.configured
        ? `API key source is ${status.apiKeySource ?? 'configured'}; secret value is not exposed.`
        : 'API key is missing.',
      requiresApproval: false,
      startupProbePolicy: 'never',
      exposesSecretValue: false,
    },
    {
      id: 'workspace.root',
      state: status.workspaceRoot?.trim() ? 'configured' : 'missing',
      reason: status.workspaceRoot?.trim() ? 'Workspace root is configured.' : 'Workspace root is missing.',
      requiresApproval: true,
      startupProbePolicy: 'safe_read_only',
      exposesSecretValue: false,
    },
    surfaceFromCapability('runtime.scheduler', registry, {
      id: 'runtime.scheduler',
      startupProbePolicy: 'never',
      disabledReason: 'Scheduler is disabled by feature flag or policy.',
    }),
    surfaceFromCapability('sandbox.coding_agent', registry, {
      id: 'sandbox.coding_agent',
      startupProbePolicy: 'manual_only',
      disabledReason: 'Sandbox coding agent is disabled or backend readiness has not been manually confirmed.',
    }),
    {
      id: 'sandbox.patch_promotion',
      state: status.featureFlags.enableSandboxPatchPromotionApply ? 'approval_required' : 'disabled_by_flag',
      reason: status.featureFlags.enableSandboxPatchPromotionApply
        ? 'Sandbox patch promotion apply is enabled but still requires explicit approval.'
        : 'Sandbox patch promotion apply is disabled by feature flag.',
      requiresApproval: true,
      startupProbePolicy: 'manual_only',
      exposesSecretValue: false,
    },
    surfaceFromCapability('external_access.connectors', registry, {
      id: 'external_access.connectors',
      startupProbePolicy: 'manual_only',
      disabledReason: 'External access connectors are not connected or are not exposed through structured status.',
    }),
    surfaceFromCapability('skills.catalogue', registry, {
      id: 'skills.catalogue',
      startupProbePolicy: 'manual_only',
      disabledReason: 'Skills are not enabled or are not exposed through structured status.',
    }),
    surfaceFromCapability('mcp.servers', registry, {
      id: 'mcp.servers',
      startupProbePolicy: 'manual_only',
      disabledReason: 'MCP servers are not connected or are not exposed through structured status.',
    }),
    surfaceFromCapability('browser.operator', registry, {
      id: 'browser.operator',
      startupProbePolicy: 'manual_only',
      disabledReason: 'Browser operator is unavailable or not configured.',
    }),
  ];
  const safeSurfaces = surfaces.map((surface) => ({
    ...surface,
    reason: redactSafetyText(surface.reason),
  }));
  const blockedReasons = safeSurfaces
    .filter((surface) => surface.state !== 'configured' && surface.state !== 'approval_required')
    .map((surface) => `${surface.id}: ${surface.reason}`);
  const secretExposureSafe = safeSurfaces.every((surface) => !surface.exposesSecretValue);

  return {
    surfaces: safeSurfaces,
    secretExposureSafe,
    blockedReasons,
    summary: `configured=${safeSurfaces.filter((surface) => surface.state === 'configured').length} / approvalRequired=${safeSurfaces.filter((surface) => surface.state === 'approval_required').length} / blocked=${blockedReasons.length}`,
  };
}

function surfaceFromCapability(
  capabilityId: string,
  registry: CapabilityRegistryEntry[],
  fallback: {
    id: ConfigurationSafetySurfaceId;
    startupProbePolicy: ConfigurationSafetySurface['startupProbePolicy'];
    disabledReason: string;
  },
): ConfigurationSafetySurface {
  const capability = registry.find((entry) => entry.id === capabilityId);
  if (!capability) {
    return {
      id: fallback.id,
      state: 'missing',
      reason: fallback.disabledReason,
      requiresApproval: true,
      startupProbePolicy: fallback.startupProbePolicy,
      exposesSecretValue: false,
    };
  }

  return {
    id: fallback.id,
    state: stateFromCapability(capability),
    reason: capability.missingReason ?? capability.summary,
    requiresApproval: capability.requiresApproval,
    startupProbePolicy: fallback.startupProbePolicy,
    exposesSecretValue: false,
  };
}

function stateFromCapability(capability: CapabilityRegistryEntry): ConfigurationSafetyState {
  if (capability.status === 'available') {
    return capability.requiresApproval ? 'approval_required' : 'configured';
  }
  if (capability.status === 'unconfigured') return 'missing';
  if (capability.status === 'disabled') return 'disabled_by_flag';
  return 'disabled_by_policy';
}

function redactSafetyText(value: string): string {
  return value
    .replace(/\b(api[_ -]?key|apiKey|token|secret|password|credential|refresh[_ -]?token|refreshToken|access[_ -]?token|accessToken)\s*[:=]\s*[^,;\s]+/gi, '$1=[redacted]')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]+=*/g, '$1 [redacted]');
}
