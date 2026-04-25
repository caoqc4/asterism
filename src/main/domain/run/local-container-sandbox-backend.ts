import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  AgentSandboxBackendProbe,
  AgentSandboxCheckPlan,
  AgentSandboxCheckScript,
  AgentSandboxSessionHandle,
  AgentSandboxSessionRequest,
} from '../../../shared/agent-sandbox-provider.js';

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

export type LocalContainerSandboxCommandPlan = {
  args: string[];
  command: 'docker';
  environment: Record<string, never>;
  image: string;
  networkMode: 'disabled';
  outputLimitBytes: number;
  script: AgentSandboxCheckScript;
  timeoutMs: number;
  workspaceMount: {
    readonly: true;
    source: string;
    target: string;
  };
  stagingMount: {
    readonly: false;
    source: string;
    target: string;
  };
};

export type BuildLocalContainerSandboxCommandPlansInput = {
  checkPlan: AgentSandboxCheckPlan;
  handle: AgentSandboxSessionHandle;
  image?: string;
  request: AgentSandboxSessionRequest;
};

const DEFAULT_LOCAL_CONTAINER_SANDBOX_IMAGE = 'node:22-bookworm-slim';
const LOCAL_CONTAINER_STAGING_MOUNT_PATH = '/taskplane-staging';

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

export function buildLocalContainerSandboxCommandPlans(
  input: BuildLocalContainerSandboxCommandPlansInput,
): LocalContainerSandboxCommandPlan[] {
  if (input.request.providerKind !== 'local_container' || input.handle.providerKind !== 'local_container') {
    throw new Error('Local container sandbox command plans require a local_container session.');
  }

  if (input.request.descriptorId !== 'workspace.staged_patch') {
    throw new Error(`Unsupported sandbox descriptor: ${input.request.descriptorId}`);
  }

  if (input.request.workspace.mode !== 'staged_write') {
    throw new Error('Local container sandbox command plans require staged_write workspace mode.');
  }

  if (input.request.executionPolicy.credentialPolicy !== 'none') {
    throw new Error('Local container sandbox command plans must not pass credentials.');
  }

  if (input.request.executionPolicy.networkPolicy !== 'disabled') {
    throw new Error('Local container sandbox command plans require disabled network policy.');
  }

  if (input.request.commandPolicy.allowArbitraryShell || input.request.commandPolicy.allowInteractive) {
    throw new Error('Local container sandbox command plans require non-interactive allowlist commands.');
  }

  const allowedScripts = new Set(input.request.commandPolicy.allowedScripts);
  for (const script of input.checkPlan.scripts) {
    if (!allowedScripts.has(script)) {
      throw new Error(`Local container sandbox script is not allowed: ${script}`);
    }
  }

  const image = input.image?.trim() || DEFAULT_LOCAL_CONTAINER_SANDBOX_IMAGE;
  const workspaceMount = {
    readonly: true,
    source: input.request.workspace.workspaceRoot,
    target: input.request.workspace.mountPath,
  } as const;
  const stagingMount = {
    readonly: false,
    source: input.handle.stagingRoot,
    target: LOCAL_CONTAINER_STAGING_MOUNT_PATH,
  } as const;

  return input.checkPlan.scripts.map((script) => ({
    args: [
      'run',
      '--rm',
      '--network',
      'none',
      '--mount',
      `type=bind,source=${workspaceMount.source},target=${workspaceMount.target},readonly`,
      '--mount',
      `type=bind,source=${stagingMount.source},target=${stagingMount.target}`,
      '--workdir',
      workspaceMount.target,
      image,
      'npm',
      'run',
      script,
    ],
    command: 'docker',
    environment: {},
    image,
    networkMode: 'disabled',
    outputLimitBytes: input.checkPlan.outputLimitBytes,
    script,
    stagingMount,
    timeoutMs: input.checkPlan.timeoutMs,
    workspaceMount,
  }));
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
