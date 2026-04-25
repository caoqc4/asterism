import type { AgentToolExecutionPolicy } from './agent-tool-scaffold.js';

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
    script: 'test' | 'lint';
    status: 'passed' | 'failed' | 'skipped';
    outputPreview: string;
  }>;
  riskSummary: string;
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
