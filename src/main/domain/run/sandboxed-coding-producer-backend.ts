import {
  buildAgentSandboxProviderCapabilitiesFromBackendProfile,
  buildAgentSandboxBackendProfileFromProbe,
  buildDefaultAgentSandboxCommandPolicy,
  evaluateAgentSandboxBackendReadiness,
  evaluateAgentSandboxCodingLaneEligibility,
  type AgentSandboxBackendProfile,
  type AgentSandboxBackendProbe,
} from '../../../shared/agent-sandbox-provider.js';
import { buildDefaultAgentToolExecutionPolicy } from '../../../shared/agent-tool-scaffold.js';
import type { FeatureFlags } from '../../../shared/types/settings.js';
import {
  type NormalizedSandboxedCodingProducerRequest,
  validateSandboxedCodingProducerRequest,
} from './sandboxed-coding-producer.js';

export type SandboxedCodingProducerBackendReadiness =
  | {
      ready: true;
      summary: string;
    }
  | {
      blockedReasons: string[];
      ready: false;
      summary: string;
    };

export type SandboxedCodingProducerBackendConnectionGate =
  | {
      profile: AgentSandboxBackendProfile;
      readiness: Extract<SandboxedCodingProducerBackendReadiness, { ready: true }>;
      ready: true;
      request: NormalizedSandboxedCodingProducerRequest;
      summary: string;
    }
  | {
      blockedReasons: string[];
      readiness: SandboxedCodingProducerBackendReadiness;
      ready: false;
      summary: string;
    };

export function evaluateSandboxedCodingProducerBackendReadiness(params: {
  featureFlags: FeatureFlags;
  probe: AgentSandboxBackendProbe;
  request: unknown;
}): SandboxedCodingProducerBackendReadiness {
  const blockedReasons: string[] = [];
  const requestValidation = validateSandboxedCodingProducerRequest(params.request);
  if (!requestValidation.valid) {
    blockedReasons.push(...requestValidation.blockedReasons);
  }

  const profile = buildAgentSandboxBackendProfileFromProbe(params.probe);
  if (!profile) {
    blockedReasons.push(
      params.probe.status === 'unavailable'
        ? params.probe.reason
        : 'Sandbox backend profile is unavailable.',
    );
  } else {
    const backendReadiness = evaluateAgentSandboxBackendReadiness(profile);
    blockedReasons.push(...backendReadiness.blockedReasons);

    if (backendReadiness.ready && requestValidation.valid) {
      const commandPolicy = buildDefaultAgentSandboxCommandPolicy({
        outputLimitBytes: requestValidation.request.commandPolicy.outputLimitBytes,
        timeoutMs: requestValidation.request.commandPolicy.timeoutMs,
      });
      const providerCapabilities = buildAgentSandboxProviderCapabilitiesFromBackendProfile(profile);
      const eligibility = evaluateAgentSandboxCodingLaneEligibility({
        commandPolicy: {
          ...commandPolicy,
          allowedScripts: requestValidation.request.commandPolicy.allowedScripts,
        },
        executionPolicy: {
          ...buildDefaultAgentToolExecutionPolicy({
            descriptorId: 'workspace.staged_patch',
            outputLimitBytes: requestValidation.request.commandPolicy.outputLimitBytes,
            timeoutMs: requestValidation.request.commandPolicy.timeoutMs,
          }),
          networkPolicy: requestValidation.request.executionPolicy.network,
          workspaceRoot: requestValidation.request.workspaceRoot,
        },
        featureFlags: params.featureFlags,
        providerCapabilities,
        workspaceRoot: requestValidation.request.workspaceRoot,
      });
      blockedReasons.push(...eligibility.blockedReasons);
    }
  }

  const uniqueBlockedReasons = Array.from(new Set(blockedReasons.filter(Boolean)));
  if (uniqueBlockedReasons.length > 0) {
    return {
      blockedReasons: uniqueBlockedReasons,
      ready: false,
      summary: `Sandboxed coding producer backend blocked: ${uniqueBlockedReasons.join(' ')}`,
    };
  }

  return {
    ready: true,
    summary: [
      'Sandboxed coding producer backend ready',
      `backend=${params.probe.backendId}`,
      `kind=${params.probe.kind}`,
      requestValidation.valid ? `workspace=${requestValidation.request.workspaceRoot}` : null,
    ].filter(Boolean).join(' / '),
  };
}

export function evaluateSandboxedCodingProducerBackendConnectionGate(params: {
  featureFlags: FeatureFlags;
  probe: AgentSandboxBackendProbe;
  request: unknown;
}): SandboxedCodingProducerBackendConnectionGate {
  const readiness = evaluateSandboxedCodingProducerBackendReadiness(params);
  if (!readiness.ready) {
    return {
      blockedReasons: readiness.blockedReasons,
      readiness,
      ready: false,
      summary: `Sandboxed coding producer backend connection blocked: ${readiness.blockedReasons.join(' ')}`,
    };
  }

  const profile = buildAgentSandboxBackendProfileFromProbe(params.probe);
  const requestValidation = validateSandboxedCodingProducerRequest(params.request);
  if (!profile || !requestValidation.valid) {
    const blockedReasons = [
      !profile ? 'Sandbox backend profile is unavailable.' : null,
      !requestValidation.valid ? requestValidation.blockedReasons.join(' ') : null,
    ].filter((reason): reason is string => Boolean(reason));

    return {
      blockedReasons,
      readiness: {
        blockedReasons,
        ready: false,
        summary: `Sandboxed coding producer backend blocked: ${blockedReasons.join(' ')}`,
      },
      ready: false,
      summary: `Sandboxed coding producer backend connection blocked: ${blockedReasons.join(' ')}`,
    };
  }

  return {
    profile,
    readiness,
    ready: true,
    request: requestValidation.request,
    summary: [
      'Sandboxed coding producer backend connection allowed',
      `backend=${profile.id}`,
      `kind=${profile.kind}`,
      `source=${requestValidation.request.sourceId}`,
    ].join(' / '),
  };
}
