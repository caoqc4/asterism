import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { AgentSandboxBackendProbe } from '../../../shared/agent-sandbox-provider.js';

const execFileAsync = promisify(execFile);

export type LocalContainerSandboxProbeInput = {
  dockerAvailable: boolean;
  detail?: string | null;
};

export type LocalContainerRuntimeProbeRunner = (params: {
  command: string;
  args: string[];
  timeoutMs: number;
}) => Promise<{
  stdout: string;
  stderr: string;
}>;

export type ProbeLocalContainerSandboxBackendInput = {
  runner?: LocalContainerRuntimeProbeRunner;
  timeoutMs?: number;
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

export async function probeLocalContainerSandboxBackend(
  input: ProbeLocalContainerSandboxBackendInput = {},
): Promise<AgentSandboxBackendProbe> {
  const runner = input.runner ?? defaultLocalContainerRuntimeProbeRunner;

  try {
    const result = await runner({
      args: ['version', '--format', '{{.Server.Version}}'],
      command: 'docker',
      timeoutMs: input.timeoutMs ?? 2_000,
    });

    return buildLocalContainerSandboxBackendProbe({
      detail: result.stdout.trim() || result.stderr.trim() || null,
      dockerAvailable: true,
    });
  } catch (error) {
    return buildLocalContainerSandboxBackendProbe({
      detail: error instanceof Error ? error.message : 'Local container runtime probe failed.',
      dockerAvailable: false,
    });
  }
}

async function defaultLocalContainerRuntimeProbeRunner(params: {
  command: string;
  args: string[];
  timeoutMs: number;
}): Promise<{
  stdout: string;
  stderr: string;
}> {
  const result = await execFileAsync(params.command, params.args, {
    timeout: params.timeoutMs,
    windowsHide: true,
  });

  return {
    stderr: result.stderr,
    stdout: result.stdout,
  };
}
