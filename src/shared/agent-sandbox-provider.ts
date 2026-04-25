import type {
  AgentToolArtifactDescriptor,
  AgentToolCheckpointDescriptor,
  AgentToolExecutionPolicy,
} from './agent-tool-scaffold.js';
import type { FeatureFlags } from './types/settings.js';

export type AgentSandboxProviderKind = 'local_container' | 'remote' | 'disabled';

export type AgentSandboxNetworkMode = 'disabled' | 'allowlisted';

export type AgentSandboxWorkspaceMode = 'read_only' | 'staged_write';

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
