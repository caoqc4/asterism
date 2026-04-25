import {
  buildAgentSandboxProviderCapabilitiesFromBackendProfile,
  buildAgentSandboxBackendProfileFromProbe,
  buildDefaultAgentSandboxCommandPolicy,
  evaluateAgentSandboxBackendReadiness,
  evaluateAgentSandboxCodingLaneEligibility,
  type AgentSandboxBackendProbe,
} from '../../../shared/agent-sandbox-provider.js';
import { buildDefaultAgentToolExecutionPolicy } from '../../../shared/agent-tool-scaffold.js';
import type { FeatureFlags } from '../../../shared/types/settings.js';
import { validateSandboxedCodingProducerRequest } from './sandboxed-coding-producer.js';

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
