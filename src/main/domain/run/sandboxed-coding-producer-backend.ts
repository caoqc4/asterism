import {
  type AgentSandboxCheckScript,
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
  type PreviewSandboxedCodingInjectedProducerRunResult,
  validateSandboxedCodingProducerRequest,
} from './sandboxed-coding-producer.js';
import { formatSandboxedCodingProducerSessionMetadata } from '../../../shared/agent-session-metadata.js';

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

export type SandboxedCodingProducerBackendConnectionPlan =
  | {
      blockedReasons: string[];
      gateSummary: string;
      status: 'blocked';
      summary: string;
    }
  | {
      backendId: string;
      backendKind: AgentSandboxBackendProfile['kind'];
      commandScripts: string[];
      gateSummary: string;
      network: NormalizedSandboxedCodingProducerRequest['executionPolicy']['network'];
      noCredentialPassthrough: true;
      promotion: 'decision_required';
      requiredRunner: 'local_container_sandboxed_coding_producer' | 'remote_sandboxed_coding_producer';
      sourceId: string;
      status: 'ready';
      summary: string;
      workspaceRoot: string;
    };

export type SandboxedCodingProducerBackendLaunchEnvelope =
  | {
      blockedReasons: string[];
      gateSummary: string;
      status: 'blocked';
      summary: string;
    }
  | {
      backendId: string;
      backendKind: AgentSandboxBackendProfile['kind'];
      commandPolicy: NormalizedSandboxedCodingProducerRequest['commandPolicy'];
      executionPolicy: NormalizedSandboxedCodingProducerRequest['executionPolicy'];
      invariants: {
        noCredentialPassthrough: true;
        noHostEnvironment: true;
        noHostProcess: true;
        promotion: 'decision_required';
        stagedWritesOnly: true;
        workspaceReadOnly: true;
      };
      modelPolicy: NormalizedSandboxedCodingProducerRequest['modelPolicy'];
      requiredRunner: 'local_container_sandboxed_coding_producer' | 'remote_sandboxed_coding_producer';
      runId: string;
      sessionId: string;
      sourceId: string;
      status: 'ready';
      summary: string;
      taskId: string;
      workspaceRoot: string;
    };

export type SandboxedCodingProducerBackendLaunchEnvelopeValidation =
  | {
      envelope: Extract<SandboxedCodingProducerBackendLaunchEnvelope, { status: 'ready' }>;
      summary: string;
      valid: true;
    }
  | {
      blockedReasons: string[];
      summary: string;
      valid: false;
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

export function buildSandboxedCodingProducerBackendConnectionPlan(
  gate: SandboxedCodingProducerBackendConnectionGate,
): SandboxedCodingProducerBackendConnectionPlan {
  if (!gate.ready) {
    return {
      blockedReasons: gate.blockedReasons,
      gateSummary: gate.summary,
      status: 'blocked',
      summary: `Sandboxed coding producer backend connection plan blocked: ${gate.blockedReasons.join(' ')}`,
    };
  }

  const requiredRunner = gate.profile.kind === 'local_container'
    ? 'local_container_sandboxed_coding_producer'
    : 'remote_sandboxed_coding_producer';

  return {
    backendId: gate.profile.id,
    backendKind: gate.profile.kind,
    commandScripts: gate.request.commandPolicy.allowedScripts,
    gateSummary: gate.summary,
    network: gate.request.executionPolicy.network,
    noCredentialPassthrough: true,
    promotion: 'decision_required',
    requiredRunner,
    sourceId: gate.request.sourceId,
    status: 'ready',
    summary: [
      'Sandboxed coding producer backend connection plan ready',
      `backend=${gate.profile.id}`,
      `runner=${requiredRunner}`,
      `source=${gate.request.sourceId}`,
      `checks=${gate.request.commandPolicy.allowedScripts.join(',') || 'none'}`,
    ].join(' / '),
    workspaceRoot: gate.request.workspaceRoot,
  };
}

export function buildSandboxedCodingProducerBackendLaunchEnvelope(
  gate: SandboxedCodingProducerBackendConnectionGate,
): SandboxedCodingProducerBackendLaunchEnvelope {
  if (!gate.ready) {
    return {
      blockedReasons: gate.blockedReasons,
      gateSummary: gate.summary,
      status: 'blocked',
      summary: `Sandboxed coding producer backend launch blocked: ${gate.blockedReasons.join(' ')}`,
    };
  }

  const plan = buildSandboxedCodingProducerBackendConnectionPlan(gate);
  if (plan.status !== 'ready') {
    return {
      blockedReasons: plan.blockedReasons,
      gateSummary: plan.gateSummary,
      status: 'blocked',
      summary: `Sandboxed coding producer backend launch blocked: ${plan.blockedReasons.join(' ')}`,
    };
  }

  return {
    backendId: plan.backendId,
    backendKind: plan.backendKind,
    commandPolicy: gate.request.commandPolicy,
    executionPolicy: gate.request.executionPolicy,
    invariants: {
      noCredentialPassthrough: true,
      noHostEnvironment: true,
      noHostProcess: true,
      promotion: 'decision_required',
      stagedWritesOnly: true,
      workspaceReadOnly: true,
    },
    modelPolicy: gate.request.modelPolicy,
    requiredRunner: plan.requiredRunner,
    runId: gate.request.runId,
    sessionId: `sandboxed_producer:${gate.request.sourceId}`,
    sourceId: gate.request.sourceId,
    status: 'ready',
    summary: [
      'Sandboxed coding producer backend launch envelope ready',
      `backend=${plan.backendId}`,
      `runner=${plan.requiredRunner}`,
      `run=${gate.request.runId}`,
      `source=${gate.request.sourceId}`,
    ].join(' / '),
    taskId: gate.request.taskId,
    workspaceRoot: gate.request.workspaceRoot,
  };
}

export function validateSandboxedCodingProducerBackendLaunchEnvelope(
  value: SandboxedCodingProducerBackendLaunchEnvelope,
): SandboxedCodingProducerBackendLaunchEnvelopeValidation {
  if (value.status === 'blocked') {
    return {
      blockedReasons: value.blockedReasons.length
        ? value.blockedReasons
        : ['Sandboxed coding producer backend launch envelope is blocked.'],
      summary: value.summary,
      valid: false,
    };
  }

  const blockedReasons: string[] = [];

  for (const [field, fieldValue] of [
    ['backendId', value.backendId],
    ['runId', value.runId],
    ['taskId', value.taskId],
    ['sourceId', value.sourceId],
    ['sessionId', value.sessionId],
    ['workspaceRoot', value.workspaceRoot],
  ] as const) {
    if (!fieldValue.trim()) {
      blockedReasons.push(`Sandboxed coding producer backend launch envelope requires ${field}.`);
    }
  }

  if (value.backendKind === 'local_container' && value.requiredRunner !== 'local_container_sandboxed_coding_producer') {
    blockedReasons.push('Local container backend launch envelope requires the local container producer runner.');
  }

  if (value.backendKind === 'remote' && value.requiredRunner !== 'remote_sandboxed_coding_producer') {
    blockedReasons.push('Remote backend launch envelope requires the remote producer runner.');
  }

  if (value.executionPolicy.noCredentialPassthrough !== true || value.invariants.noCredentialPassthrough !== true) {
    blockedReasons.push('Sandboxed coding producer backend launch envelope forbids credential passthrough.');
  }

  if (value.executionPolicy.network !== 'disabled') {
    blockedReasons.push('Sandboxed coding producer backend launch envelope must start with disabled network.');
  }

  if (value.executionPolicy.promotion !== 'decision_required' || value.invariants.promotion !== 'decision_required') {
    blockedReasons.push('Sandboxed coding producer backend launch envelope requires Decision promotion.');
  }

  if (value.modelPolicy.toolExposure !== 'sandboxed_coding_producer') {
    blockedReasons.push('Sandboxed coding producer backend launch envelope requires sandbox-only tool exposure.');
  }

  if (
    value.invariants.noHostEnvironment !== true
    || value.invariants.noHostProcess !== true
    || value.invariants.stagedWritesOnly !== true
    || value.invariants.workspaceReadOnly !== true
  ) {
    blockedReasons.push('Sandboxed coding producer backend launch envelope must preserve sandbox isolation invariants.');
  }

  const allowedScripts = new Set<AgentSandboxCheckScript>(['test', 'lint']);
  if (!value.commandPolicy.allowedScripts.length) {
    blockedReasons.push('Sandboxed coding producer backend launch envelope requires allowlisted checks.');
  }
  if (value.commandPolicy.allowedScripts.some((script) => !allowedScripts.has(script))) {
    blockedReasons.push('Sandboxed coding producer backend launch envelope only allows test/lint scripts.');
  }

  if (blockedReasons.length > 0) {
    return {
      blockedReasons,
      summary: `Sandboxed coding producer backend launch envelope blocked: ${blockedReasons.join(' ')}`,
      valid: false,
    };
  }

  return {
    envelope: value,
    summary: value.summary,
    valid: true,
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

export function buildSandboxedCodingProducerBackendBlockedPreviewResult(params: {
  commandScripts?: AgentSandboxCheckScript[];
  network?: NormalizedSandboxedCodingProducerRequest['executionPolicy']['network'];
  plan: Extract<SandboxedCodingProducerBackendConnectionPlan, { status: 'blocked' }>;
  providerKind?: string | null;
  runId: string;
  sessionId?: string | null;
  sourceId?: string | null;
  workspaceRoot?: string | null;
}): PreviewSandboxedCodingInjectedProducerRunResult {
  const sourceId = params.sourceId?.trim() || 'backend_connection_preflight';
  const sessionId = params.sessionId?.trim() || `sandboxed_producer:${sourceId}`;
  const commandScripts = params.commandScripts ?? [];
  const reason = params.plan.blockedReasons.join(' ') || params.plan.summary;

  return {
    events: [],
    plan: null,
    reason,
    sessionMetadata: formatSandboxedCodingProducerSessionMetadata({
      blockedReasons: params.plan.blockedReasons,
      commandScripts,
      network: params.network ?? 'disabled',
      promotion: 'decision_required',
      providerKind: params.providerKind?.trim() || 'unconfigured',
      sessionId,
      sourceId,
      status: 'blocked',
      summary: params.plan.summary,
      workspaceRoot: params.workspaceRoot?.trim() || 'unknown',
    }),
    sessionSummary: params.plan.summary,
    status: 'blocked',
    steps: [
      {
        input: [
          `session=${sessionId}`,
          `source=${sourceId}`,
          `gate=${params.plan.gateSummary}`,
          `blockedReasons=${params.plan.blockedReasons.join('; ') || 'unknown'}`,
        ].join('\n'),
        kind: 'final',
        output: params.plan.summary,
        runId: params.runId,
        status: 'completed',
        title: 'Sandbox producer backend blocked',
      },
    ],
  };
}
