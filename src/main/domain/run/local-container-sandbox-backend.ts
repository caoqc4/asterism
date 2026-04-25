import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type {
  AgentSandboxPatchArtifact,
  AgentSandboxBackendProbe,
  AgentSandboxCheckPlan,
  AgentSandboxCheckResult,
  AgentSandboxProvider,
  AgentSandboxProviderCapabilities,
  AgentSandboxCheckScript,
  AgentSandboxSessionHandle,
  AgentSandboxSessionManifest,
  AgentSandboxSessionRequest,
} from '../../../shared/agent-sandbox-provider.js';
import type { AgentToolCheckpointDescriptor } from '../../../shared/agent-tool-scaffold.js';
import {
  buildAgentSandboxPatchArtifactFromCheckResults,
  buildAgentSandboxPatchPromotionCheckpoint,
  buildAgentSandboxSessionManifest,
  evaluateAgentSandboxCodingLaneEligibility,
  summarizeAgentSandboxSessionManifest,
} from '../../../shared/agent-sandbox-provider.js';
import type { FeatureFlags } from '../../../shared/types/settings.js';

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

export type LocalContainerSandboxCommandRunner = (
  plan: LocalContainerSandboxCommandPlan,
) => Promise<{
  exitCode: number;
  stderr: string;
  stdout: string;
}>;

export type LocalContainerSandboxCheckRun = {
  results: AgentSandboxCheckResult[];
  summary: string;
};

export type LocalContainerSandboxExecFileRunner = (params: {
  args: string[];
  command: string;
  env: Record<string, never>;
  maxBuffer: number;
  timeoutMs: number;
}) => Promise<{
  exitCode: number;
  stderr: string;
  stdout: string;
}>;

export type LocalContainerSandboxPatchDraft = {
  diff: string;
  files: string[];
  riskSummary?: string | null;
  summary: string;
};

export type LocalContainerSandboxPatchReviewPreparation = {
  artifact: AgentSandboxPatchArtifact;
  checkRun: LocalContainerSandboxCheckRun;
  checkpoint: AgentToolCheckpointDescriptor;
  handle: AgentSandboxSessionHandle;
  sessionSummary: string;
};

const DEFAULT_LOCAL_CONTAINER_SANDBOX_IMAGE = 'node:22-bookworm-slim';
const LOCAL_CONTAINER_STAGING_MOUNT_PATH = '/taskplane-staging';

export class LocalContainerSandboxProvider implements AgentSandboxProvider {
  readonly capabilities: AgentSandboxProviderCapabilities = {
    credentialPassthrough: false,
    enabled: true,
    kind: 'local_container',
    networkMode: 'disabled',
    supportsPatchArtifacts: true,
    supportsReadOnlyWorkspace: true,
    supportsStagedWrites: true,
    supportsTargetedCommands: true,
  };

  async prepareSession(request: AgentSandboxSessionRequest): Promise<AgentSandboxSessionHandle> {
    if (request.providerKind !== 'local_container') {
      throw new Error(`Unsupported sandbox provider: ${request.providerKind}`);
    }

    if (request.descriptorId !== 'workspace.staged_patch') {
      throw new Error(`Unsupported sandbox descriptor: ${request.descriptorId}`);
    }

    const workspaceRoot = path.resolve(request.workspace.workspaceRoot);
    const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-local-container-sandbox-'));
    const createdAt = new Date().toISOString();
    const handle: AgentSandboxSessionHandle = {
      createdAt,
      id: path.basename(stagingRoot),
      providerKind: 'local_container',
      stagingRoot,
      workspaceMode: request.workspace.mode,
    };
    const manifest = buildAgentSandboxSessionManifest({
      handle,
      providerCapabilities: this.capabilities,
      request: {
        ...request,
        workspace: {
          ...request.workspace,
          workspaceRoot,
        },
      },
    });

    await fs.writeFile(
      path.join(stagingRoot, 'session.json'),
      JSON.stringify(manifest, null, 2),
      'utf8',
    );

    return handle;
  }

  async disposeSession(handle: AgentSandboxSessionHandle): Promise<void> {
    await fs.rm(handle.stagingRoot, { force: true, recursive: true });
  }

  async summarizeSession(handle: AgentSandboxSessionHandle): Promise<string> {
    const raw = await fs.readFile(path.join(handle.stagingRoot, 'session.json'), 'utf8');
    return summarizeAgentSandboxSessionManifest(JSON.parse(raw) as AgentSandboxSessionManifest);
  }

  async runChecks(params: {
    checkPlan: AgentSandboxCheckPlan;
    handle: AgentSandboxSessionHandle;
    request: AgentSandboxSessionRequest;
    runner: LocalContainerSandboxCommandRunner;
  }): Promise<LocalContainerSandboxCheckRun> {
    return runLocalContainerSandboxCommandPlans(
      buildLocalContainerSandboxCommandPlans({
        checkPlan: params.checkPlan,
        handle: params.handle,
        request: params.request,
      }),
      params.runner,
    );
  }
}

export async function prepareLocalContainerSandboxPatchReview(params: {
  checkPlan: AgentSandboxCheckPlan;
  featureFlags: FeatureFlags;
  patchDraft: LocalContainerSandboxPatchDraft;
  provider: LocalContainerSandboxProvider;
  request: AgentSandboxSessionRequest;
  runner: LocalContainerSandboxCommandRunner;
}): Promise<LocalContainerSandboxPatchReviewPreparation> {
  const eligibility = evaluateAgentSandboxCodingLaneEligibility({
    commandPolicy: params.request.commandPolicy,
    executionPolicy: params.request.executionPolicy,
    featureFlags: params.featureFlags,
    providerCapabilities: params.provider.capabilities,
    workspaceRoot: params.request.workspace.workspaceRoot,
  });

  if (!eligibility.eligible) {
    throw new Error(eligibility.summary);
  }

  const handle = await params.provider.prepareSession(params.request);

  try {
    const checkRun = await params.provider.runChecks({
      checkPlan: params.checkPlan,
      handle,
      request: params.request,
      runner: params.runner,
    });
    const artifact = buildAgentSandboxPatchArtifactFromCheckResults({
      checkResults: checkRun.results,
      diff: params.patchDraft.diff,
      files: params.patchDraft.files,
      riskSummary: params.patchDraft.riskSummary,
      summary: params.patchDraft.summary,
    });

    return {
      artifact,
      checkRun,
      checkpoint: buildAgentSandboxPatchPromotionCheckpoint({
        artifact,
        policySnapshot: params.request.executionPolicy,
        resumeTarget: `${handle.id}:promote`,
      }),
      handle,
      sessionSummary: await params.provider.summarizeSession(handle),
    };
  } catch (error) {
    await params.provider.disposeSession(handle);
    throw error;
  }
}

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

export async function runLocalContainerSandboxCommandPlan(
  plan: LocalContainerSandboxCommandPlan,
  runner: LocalContainerSandboxCommandRunner,
): Promise<AgentSandboxCheckResult> {
  try {
    const result = await runner(plan);
    const outputPreview = limitSandboxCommandOutput(
      [result.stdout, result.stderr].filter(Boolean).join('\n'),
      plan.outputLimitBytes,
    );

    return {
      outputPreview,
      script: plan.script,
      status: result.exitCode === 0 ? 'passed' : 'failed',
    };
  } catch (error) {
    return {
      outputPreview: limitSandboxCommandOutput(
        error instanceof Error ? error.message : 'Sandbox command failed.',
        plan.outputLimitBytes,
      ),
      script: plan.script,
      status: 'failed',
    };
  }
}

export function createLocalContainerSandboxCommandRunner(
  execFileRunner: LocalContainerSandboxExecFileRunner = defaultLocalContainerSandboxExecFileRunner,
): LocalContainerSandboxCommandRunner {
  return (plan) =>
    execFileRunner({
      args: plan.args,
      command: plan.command,
      env: plan.environment,
      maxBuffer: plan.outputLimitBytes,
      timeoutMs: plan.timeoutMs,
    });
}

export async function runLocalContainerSandboxCommandPlans(
  plans: LocalContainerSandboxCommandPlan[],
  runner: LocalContainerSandboxCommandRunner,
): Promise<LocalContainerSandboxCheckRun> {
  const results: AgentSandboxCheckResult[] = [];

  for (const plan of plans) {
    results.push(await runLocalContainerSandboxCommandPlan(plan, runner));
  }

  return {
    results,
    summary: results.length
      ? results.map((result) => `${result.script}: ${result.status}`).join('; ')
      : 'No sandbox checks were run.',
  };
}

function limitSandboxCommandOutput(value: string, outputLimitBytes: number): string {
  const normalized = value.trim();

  if (normalized.length <= outputLimitBytes) {
    return normalized;
  }

  return `${normalized.slice(0, outputLimitBytes)}\n[output truncated]`;
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

async function defaultLocalContainerSandboxExecFileRunner(params: {
  args: string[];
  command: string;
  env: Record<string, never>;
  maxBuffer: number;
  timeoutMs: number;
}): Promise<{
  exitCode: number;
  stderr: string;
  stdout: string;
}> {
  try {
    const result = await execFileAsync(params.command, params.args, {
      env: params.env,
      maxBuffer: params.maxBuffer,
      timeout: params.timeoutMs,
      windowsHide: true,
    });

    return {
      exitCode: 0,
      stderr: result.stderr,
      stdout: result.stdout,
    };
  } catch (error) {
    const processError = error as {
      code?: number | string;
      stderr?: string;
      stdout?: string;
    };

    return {
      exitCode: typeof processError.code === 'number' ? processError.code : 1,
      stderr: processError.stderr ?? (error instanceof Error ? error.message : 'Sandbox command failed.'),
      stdout: processError.stdout ?? '',
    };
  }
}
