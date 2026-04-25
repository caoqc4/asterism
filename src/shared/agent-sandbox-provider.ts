import type {
  AgentToolArtifactDescriptor,
  AgentToolExecutionPolicy,
} from './agent-tool-scaffold.js';

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
