import type { AgentSandboxBackendProbe } from '../../../shared/agent-sandbox-provider.js';

export type LocalContainerSandboxProbeInput = {
  dockerAvailable: boolean;
  detail?: string | null;
};

export function buildLocalContainerSandboxBackendProbe(
  input: LocalContainerSandboxProbeInput,
): AgentSandboxBackendProbe {
  if (!input.dockerAvailable) {
    return {
      backendId: 'local-container',
      kind: 'local_container',
      reason: input.detail?.trim() || 'Local container runtime is not available.',
      status: 'unavailable',
    };
  }

  return {
    backendId: 'local-container',
    environmentPolicy: 'empty',
    isolation: 'container',
    kind: 'local_container',
    networkMode: 'disabled',
    status: 'available',
    supportsOutputLimits: true,
    supportsPatchArtifacts: true,
    supportsStagedWrites: true,
    supportsStructuredCommands: true,
    supportsTargetedCommands: true,
    supportsWorkspaceMount: true,
  };
}
