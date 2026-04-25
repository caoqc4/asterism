import type {
  AgentToolArtifactDescriptor,
  AgentToolCheckpointDescriptor,
  AgentToolExecutionPolicy,
} from './agent-tool-scaffold.js';
import type { FeatureFlags } from './types/settings.js';

export type AgentSandboxProviderKind = 'local_container' | 'remote' | 'disabled';

export type AgentSandboxNetworkMode = 'disabled' | 'allowlisted';

export type AgentSandboxWorkspaceMode = 'read_only' | 'staged_write';

export type AgentSandboxBackendIsolation = 'container' | 'remote_vm' | 'host_process';

export type AgentSandboxBackendEnvironmentPolicy = 'empty' | 'allowlisted' | 'inherit_host';

export type AgentSandboxBackendProfile = {
  id: string;
  kind: Exclude<AgentSandboxProviderKind, 'disabled'>;
  isolation: AgentSandboxBackendIsolation;
  environmentPolicy: AgentSandboxBackendEnvironmentPolicy;
  networkMode: AgentSandboxNetworkMode;
  credentialPassthrough: false;
  supportsWorkspaceMount: boolean;
  supportsStagedWrites: boolean;
  supportsStructuredCommands: boolean;
  supportsTargetedCommands: boolean;
  supportsOutputLimits: boolean;
  supportsPatchArtifacts: boolean;
};

export type AgentSandboxBackendReadiness = {
  ready: boolean;
  summary: string;
  blockedReasons: string[];
};

export type AgentSandboxBackendStatus = {
  probe: AgentSandboxBackendProbe | null;
  profile: AgentSandboxBackendProfile | null;
  readiness: AgentSandboxBackendReadiness | null;
  summary: string;
};

export type AgentSandboxBackendProbe =
  | {
      status: 'unavailable';
      backendId: string;
      kind: Exclude<AgentSandboxProviderKind, 'disabled'>;
      reason: string;
    }
  | {
      status: 'available';
      backendId: string;
      kind: Exclude<AgentSandboxProviderKind, 'disabled'>;
      isolation: Exclude<AgentSandboxBackendIsolation, 'host_process'>;
      environmentPolicy: Exclude<AgentSandboxBackendEnvironmentPolicy, 'inherit_host'>;
      networkMode: AgentSandboxNetworkMode;
      supportsWorkspaceMount: boolean;
      supportsStagedWrites: boolean;
      supportsStructuredCommands: boolean;
      supportsTargetedCommands: boolean;
      supportsOutputLimits: boolean;
      supportsPatchArtifacts: boolean;
    };

export type AgentSandboxProviderCapabilities = {
  kind: AgentSandboxProviderKind;
  enabled: boolean;
  supportsReadOnlyWorkspace: boolean;
  supportsStagedWrites: boolean;
  supportsTargetedCommands: boolean;
  supportsPatchArtifacts: boolean;
  networkMode: AgentSandboxNetworkMode;
  credentialPassthrough: false;
};

export type AgentSandboxWorkspaceMount = {
  workspaceRoot: string;
  mode: AgentSandboxWorkspaceMode;
  mountPath: string;
};

export type AgentSandboxCommandPolicy = {
  allowedScripts: Array<'test' | 'lint'>;
  timeoutMs: number;
  outputLimitBytes: number;
  allowInteractive: false;
  allowArbitraryShell: false;
};

export type AgentSandboxCheckScript = AgentSandboxCommandPolicy['allowedScripts'][number];

export type AgentSandboxCheckPlan = {
  scripts: AgentSandboxCheckScript[];
  timeoutMs: number;
  outputLimitBytes: number;
};

export type AgentSandboxCheckResult = {
  script: AgentSandboxCheckScript;
  status: 'passed' | 'failed' | 'skipped';
  outputPreview: string;
};

export type AgentSandboxSessionRequest = {
  runId: string;
  taskId: string;
  descriptorId: 'workspace.staged_patch';
  providerKind: Exclude<AgentSandboxProviderKind, 'disabled'>;
  workspace: AgentSandboxWorkspaceMount;
  commandPolicy: AgentSandboxCommandPolicy;
  executionPolicy: AgentToolExecutionPolicy;
};

export type AgentSandboxSessionHandle = {
  id: string;
  providerKind: Exclude<AgentSandboxProviderKind, 'disabled'>;
  stagingRoot: string;
  workspaceMode: AgentSandboxWorkspaceMode;
  createdAt: string;
};

export type AgentSandboxSessionManifest = {
  id: string;
  runId: string;
  taskId: string;
  descriptorId: 'workspace.staged_patch';
  providerKind: Exclude<AgentSandboxProviderKind, 'disabled'>;
  stagingRoot: string;
  createdAt: string;
  workspace: AgentSandboxWorkspaceMount;
  providerCapabilities: AgentSandboxProviderCapabilities;
  commandPolicy: AgentSandboxCommandPolicy;
  executionPolicy: AgentToolExecutionPolicy;
};

export type AgentSandboxPatchArtifact = {
  kind: 'patch';
  summary: string;
  files: string[];
  diff: string;
  commandLogs: Array<{
    script: AgentSandboxCheckScript;
    status: 'passed' | 'failed' | 'skipped';
    outputPreview: string;
  }>;
  riskSummary: string;
};

export type BuildAgentSandboxPatchArtifactInput = {
  summary: string;
  files: string[];
  diff: string;
  commandLogs?: AgentSandboxPatchArtifact['commandLogs'];
  riskSummary?: string | null;
};

export type AgentSandboxPatchPromotionRequest = {
  artifact: AgentSandboxPatchArtifact;
  policySnapshot: AgentToolExecutionPolicy;
  resumeTarget: string;
};

export type AgentSandboxSessionResult =
  | {
      status: 'completed';
      patch: AgentSandboxPatchArtifact;
    }
  | {
      status: 'failed';
      message: string;
      outputPreview?: string | null;
    };

export type AgentSandboxCodingLaneEligibility = {
  eligible: boolean;
  summary: string;
  blockedReasons: string[];
};

export interface AgentSandboxProvider {
  readonly capabilities: AgentSandboxProviderCapabilities;
  prepareSession(request: AgentSandboxSessionRequest): Promise<AgentSandboxSessionHandle>;
  disposeSession(handle: AgentSandboxSessionHandle): Promise<void>;
}

export const DISABLED_AGENT_SANDBOX_PROVIDER_CAPABILITIES: AgentSandboxProviderCapabilities = {
  kind: 'disabled',
  enabled: false,
  supportsReadOnlyWorkspace: false,
  supportsStagedWrites: false,
  supportsTargetedCommands: false,
  supportsPatchArtifacts: false,
  networkMode: 'disabled',
  credentialPassthrough: false,
};

export function buildAgentSandboxBackendProfileFromProbe(
  probe: AgentSandboxBackendProbe,
): AgentSandboxBackendProfile | null {
  if (probe.status === 'unavailable') {
    return null;
  }

  return {
    credentialPassthrough: false,
    environmentPolicy: probe.environmentPolicy,
    id: probe.backendId,
    isolation: probe.isolation,
    kind: probe.kind,
    networkMode: probe.networkMode,
    supportsOutputLimits: probe.supportsOutputLimits,
    supportsPatchArtifacts: probe.supportsPatchArtifacts,
    supportsStagedWrites: probe.supportsStagedWrites,
    supportsStructuredCommands: probe.supportsStructuredCommands,
    supportsTargetedCommands: probe.supportsTargetedCommands,
    supportsWorkspaceMount: probe.supportsWorkspaceMount,
  };
}

export function summarizeAgentSandboxBackendProbe(
  probe: AgentSandboxBackendProbe,
): string {
  return probe.status === 'unavailable'
    ? `backend=${probe.backendId} / kind=${probe.kind} / available=no / reason=${probe.reason}`
    : `backend=${probe.backendId} / kind=${probe.kind} / available=yes / isolation=${probe.isolation} / env=${probe.environmentPolicy}`;
}

export function buildAgentSandboxBackendStatus(
  probe: AgentSandboxBackendProbe | null,
): AgentSandboxBackendStatus {
  const profile = probe ? buildAgentSandboxBackendProfileFromProbe(probe) : null;
  const readiness = profile ? evaluateAgentSandboxBackendReadiness(profile) : null;

  return {
    probe,
    profile,
    readiness,
    summary: probe
      ? readiness?.summary ?? summarizeAgentSandboxBackendProbe(probe)
      : 'Sandbox backend not probed.',
  };
}

export function evaluateAgentSandboxBackendReadiness(
  profile: AgentSandboxBackendProfile,
): AgentSandboxBackendReadiness {
  const blockedReasons: string[] = [];

  if (profile.isolation === 'host_process') {
    blockedReasons.push('sandbox backend must not run as a host process');
  }

  if (profile.environmentPolicy === 'inherit_host') {
    blockedReasons.push('sandbox backend must not inherit the host environment');
  }

  if (profile.credentialPassthrough !== false) {
    blockedReasons.push('sandbox backend must not pass through credentials');
  }

  if (!profile.supportsWorkspaceMount) {
    blockedReasons.push('sandbox backend must mount exactly one selected workspace');
  }

  if (!profile.supportsStagedWrites) {
    blockedReasons.push('sandbox backend must support staged writes');
  }

  if (!profile.supportsStructuredCommands || !profile.supportsTargetedCommands) {
    blockedReasons.push('sandbox backend must support structured targeted commands');
  }

  if (!profile.supportsOutputLimits) {
    blockedReasons.push('sandbox backend must enforce command output limits');
  }

  if (!profile.supportsPatchArtifacts) {
    blockedReasons.push('sandbox backend must produce patch artifacts');
  }

  return {
    blockedReasons,
    ready: blockedReasons.length === 0,
    summary: blockedReasons.length
      ? `Sandbox backend not ready: ${blockedReasons.join('; ')}.`
      : `Sandbox backend ready: ${profile.id}.`,
  };
}

export function buildAgentSandboxProviderCapabilitiesFromBackendProfile(
  profile: AgentSandboxBackendProfile,
): AgentSandboxProviderCapabilities {
  const readiness = evaluateAgentSandboxBackendReadiness(profile);

  if (!readiness.ready) {
    throw new Error(readiness.summary);
  }

  return {
    credentialPassthrough: false,
    enabled: true,
    kind: profile.kind,
    networkMode: profile.networkMode,
    supportsPatchArtifacts: profile.supportsPatchArtifacts,
    supportsReadOnlyWorkspace: profile.supportsWorkspaceMount,
    supportsStagedWrites: profile.supportsStagedWrites,
    supportsTargetedCommands: profile.supportsTargetedCommands,
  };
}

export function summarizeAgentSandboxBackendProfile(
  profile: AgentSandboxBackendProfile,
): string {
  const readiness = evaluateAgentSandboxBackendReadiness(profile);

  return [
    `backend=${profile.id}`,
    `kind=${profile.kind}`,
    `isolation=${profile.isolation}`,
    `env=${profile.environmentPolicy}`,
    `network=${profile.networkMode}`,
    `ready=${readiness.ready ? 'yes' : 'no'}`,
  ].join(' / ');
}

export function buildDefaultAgentSandboxCommandPolicy(
  overrides: Partial<Pick<AgentSandboxCommandPolicy, 'timeoutMs' | 'outputLimitBytes'>> = {},
): AgentSandboxCommandPolicy {
  return {
    allowedScripts: ['test', 'lint'],
    allowArbitraryShell: false,
    allowInteractive: false,
    outputLimitBytes: overrides.outputLimitBytes ?? 64_000,
    timeoutMs: overrides.timeoutMs ?? 120_000,
  };
}

export function buildAgentSandboxCheckPlan(params: {
  requestedScripts: string[];
  policy: AgentSandboxCommandPolicy;
}): AgentSandboxCheckPlan {
  const allowed = new Set<string>(params.policy.allowedScripts);
  const scripts = Array.from(new Set(params.requestedScripts))
    .filter((script): script is AgentSandboxCheckScript => allowed.has(script));

  if (!scripts.length) {
    throw new Error('Sandbox check plan requires at least one allowlisted script.');
  }

  return {
    outputLimitBytes: params.policy.outputLimitBytes,
    scripts,
    timeoutMs: params.policy.timeoutMs,
  };
}

export function canUseAgentSandboxProviderForCoding(
  capabilities: AgentSandboxProviderCapabilities,
): boolean {
  return capabilities.enabled
    && capabilities.kind !== 'disabled'
    && capabilities.supportsReadOnlyWorkspace
    && capabilities.supportsStagedWrites
    && capabilities.supportsTargetedCommands
    && capabilities.supportsPatchArtifacts
    && capabilities.credentialPassthrough === false;
}

export function evaluateAgentSandboxCodingLaneEligibility(params: {
  featureFlags: FeatureFlags;
  providerCapabilities: AgentSandboxProviderCapabilities;
  workspaceRoot?: string | null;
  commandPolicy: AgentSandboxCommandPolicy;
  executionPolicy: AgentToolExecutionPolicy;
}): AgentSandboxCodingLaneEligibility {
  const blockedReasons: string[] = [];

  if (!params.featureFlags.enableSandboxCodingAgent) {
    blockedReasons.push('sandbox coding-agent feature flag is disabled');
  }

  if (!canUseAgentSandboxProviderForCoding(params.providerCapabilities)) {
    blockedReasons.push('sandbox provider does not expose the required staged-write, targeted-check, patch-artifact capability set');
  }

  if (!params.workspaceRoot?.trim()) {
    blockedReasons.push('workspace root is required before preparing a sandbox coding session');
  }

  if (params.executionPolicy.descriptorId !== 'workspace.staged_patch') {
    blockedReasons.push('execution policy must target workspace.staged_patch');
  }

  if (params.executionPolicy.sessionKind !== 'sandbox') {
    blockedReasons.push('execution policy must run in a sandbox session');
  }

  if (params.executionPolicy.credentialPolicy !== 'none') {
    blockedReasons.push('sandbox coding sessions must not receive credentials');
  }

  if (params.executionPolicy.networkPolicy !== 'disabled') {
    blockedReasons.push('sandbox coding sessions must start with network disabled');
  }

  if (params.commandPolicy.allowArbitraryShell || params.commandPolicy.allowInteractive) {
    blockedReasons.push('sandbox checks must be non-interactive and cannot allow arbitrary shell');
  }

  const allowedScripts = new Set<AgentSandboxCheckScript>(['test', 'lint']);
  if (params.commandPolicy.allowedScripts.some((script) => !allowedScripts.has(script))) {
    blockedReasons.push('sandbox checks are limited to test/lint scripts');
  }

  return {
    blockedReasons,
    eligible: blockedReasons.length === 0,
    summary: blockedReasons.length
      ? `Sandbox coding lane unavailable: ${blockedReasons.join('; ')}.`
      : 'Sandbox coding lane eligible for a gated staged-patch session.',
  };
}

export function buildAgentSandboxSessionManifest(params: {
  handle: AgentSandboxSessionHandle;
  request: AgentSandboxSessionRequest;
  providerCapabilities: AgentSandboxProviderCapabilities;
}): AgentSandboxSessionManifest {
  return {
    commandPolicy: params.request.commandPolicy,
    createdAt: params.handle.createdAt,
    descriptorId: params.request.descriptorId,
    executionPolicy: params.request.executionPolicy,
    id: params.handle.id,
    providerCapabilities: params.providerCapabilities,
    providerKind: params.handle.providerKind,
    runId: params.request.runId,
    stagingRoot: params.handle.stagingRoot,
    taskId: params.request.taskId,
    workspace: params.request.workspace,
  };
}

export function summarizeAgentSandboxSessionManifest(
  manifest: AgentSandboxSessionManifest,
): string {
  return [
    `sandbox=${manifest.id}`,
    `provider=${manifest.providerKind}`,
    `workspace=${manifest.workspace.mode}`,
    `network=${manifest.providerCapabilities.networkMode}`,
    `credentials=${manifest.providerCapabilities.credentialPassthrough ? 'passthrough' : 'none'}`,
    `commands=${manifest.commandPolicy.allowedScripts.join(',') || 'none'}`,
    `patchArtifacts=${manifest.providerCapabilities.supportsPatchArtifacts ? 'supported' : 'unsupported'}`,
  ].join(' / ');
}

export function buildAgentSandboxPatchArtifact(
  input: BuildAgentSandboxPatchArtifactInput,
): AgentSandboxPatchArtifact {
  const uniqueFiles = Array.from(new Set(input.files.map((file) => file.trim()).filter(Boolean))).sort();

  if (!uniqueFiles.length) {
    throw new Error('Sandbox patch artifact requires at least one changed file.');
  }

  if (!input.diff.trim()) {
    throw new Error('Sandbox patch artifact requires a diff preview.');
  }

  return {
    commandLogs: input.commandLogs ?? [],
    diff: input.diff,
    files: uniqueFiles,
    kind: 'patch',
    riskSummary: input.riskSummary?.trim() || 'Pending human review before workspace promotion.',
    summary: input.summary.trim() || 'Sandbox generated patch artifact.',
  };
}

export function toAgentToolArtifactDescriptor(
  artifact: AgentSandboxPatchArtifact,
): AgentToolArtifactDescriptor {
  return {
    kind: 'patch',
    preview: artifact.diff.slice(0, 4_000),
    summary: [
      `${artifact.files.length} file(s): ${artifact.files.join(', ')}`,
      artifact.riskSummary,
    ].join(' | '),
    title: artifact.summary,
  };
}

export function summarizeAgentSandboxCheckResults(
  results: AgentSandboxCheckResult[],
): string {
  if (!results.length) {
    return 'No sandbox checks were run.';
  }

  return results
    .map((result) => `${result.script}: ${result.status}`)
    .join('; ');
}

export function buildAgentSandboxPatchPromotionCheckpoint(
  request: AgentSandboxPatchPromotionRequest,
): AgentToolCheckpointDescriptor {
  if (request.policySnapshot.descriptorId !== 'workspace.staged_patch') {
    throw new Error('Sandbox patch promotion requires a workspace.staged_patch policy snapshot.');
  }

  return {
    consequence: 'Approving will allow this staged patch to be promoted to the selected workspace; deferring or cancelling leaves the workspace unchanged.',
    kind: 'patch_promotion',
    policySnapshot: request.policySnapshot,
    preview: request.artifact.diff.slice(0, 4_000),
    reason: [
      `Review sandbox patch before workspace promotion: ${request.artifact.summary}`,
      `${request.artifact.files.length} file(s): ${request.artifact.files.join(', ')}`,
      request.artifact.riskSummary,
    ].join(' | '),
    resumeTarget: request.resumeTarget,
  };
}
