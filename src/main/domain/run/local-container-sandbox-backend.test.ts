import { describe, expect, it, vi } from 'vitest';

import {
  buildAgentSandboxCheckPlan,
  buildAgentSandboxBackendProfileFromProbe,
  buildAgentSandboxProviderCapabilitiesFromBackendProfile,
  buildDefaultAgentSandboxCommandPolicy,
  evaluateAgentSandboxBackendReadiness,
  summarizeAgentSandboxBackendProbe,
  type AgentSandboxSessionRequest,
} from '../../../shared/agent-sandbox-provider.js';
import { buildDefaultAgentToolExecutionPolicy } from '../../../shared/agent-tool-scaffold.js';
import {
  buildLocalContainerSandboxCommandPlans,
  buildLocalContainerSandboxBackendProbe,
  probeLocalContainerSandboxBackend,
} from './local-container-sandbox-backend.js';

describe('local container sandbox backend probe', () => {
  it('reports unavailable local container runtime without creating a backend profile', () => {
    const probe = buildLocalContainerSandboxBackendProbe({
      detail: 'Docker CLI not found.',
      dockerAvailable: false,
    });

    expect(probe).toEqual({
      backendId: 'local-container',
      kind: 'local_container',
      reason: 'Docker CLI not found.',
      status: 'unavailable',
    });
    expect(buildAgentSandboxBackendProfileFromProbe(probe)).toBeNull();
    expect(summarizeAgentSandboxBackendProbe(probe)).toBe(
      'backend=local-container / kind=local_container / available=no / reason=Docker CLI not found.',
    );
  });

  it('maps an available local container runtime into a ready backend profile', () => {
    const probe = buildLocalContainerSandboxBackendProbe({
      dockerAvailable: true,
    });
    const profile = buildAgentSandboxBackendProfileFromProbe(probe);

    expect(profile).toMatchObject({
      environmentPolicy: 'empty',
      id: 'local-container',
      isolation: 'container',
      kind: 'local_container',
      networkMode: 'disabled',
    });
    expect(evaluateAgentSandboxBackendReadiness(profile!)).toMatchObject({
      blockedReasons: [],
      ready: true,
    });
    expect(buildAgentSandboxProviderCapabilitiesFromBackendProfile(profile!)).toMatchObject({
      enabled: true,
      kind: 'local_container',
      supportsPatchArtifacts: true,
      supportsTargetedCommands: true,
    });
  });

  it('probes the local container runtime through an injected read-only runner', async () => {
    const runner = vi.fn().mockResolvedValue({
      stderr: '',
      stdout: '27.5.1\n',
    });

    const probe = await probeLocalContainerSandboxBackend({
      runner,
      timeoutMs: 500,
    });

    expect(runner).toHaveBeenCalledWith({
      args: ['version', '--format', '{{.Server.Version}}'],
      command: 'docker',
      timeoutMs: 500,
    });
    expect(probe).toMatchObject({
      backendId: 'local-container',
      status: 'available',
    });
  });

  it('reports unavailable when the local container runtime probe fails', async () => {
    const probe = await probeLocalContainerSandboxBackend({
      runner: vi.fn().mockRejectedValue(new Error('docker: command not found')),
    });

    expect(probe).toEqual({
      backendId: 'local-container',
      kind: 'local_container',
      reason: 'docker: command not found',
      status: 'unavailable',
    });
  });

  it('builds auditable docker run plans without credentials, network, or writable workspace mounts', () => {
    const commandPolicy = buildDefaultAgentSandboxCommandPolicy({ timeoutMs: 30_000 });
    const request: AgentSandboxSessionRequest = {
      commandPolicy,
      descriptorId: 'workspace.staged_patch',
      executionPolicy: buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' }),
      providerKind: 'local_container',
      runId: 'run_1',
      taskId: 'task_1',
      workspace: {
        mode: 'staged_write',
        mountPath: '/workspace',
        workspaceRoot: '/tmp/taskplane-workspace',
      },
    };
    const plans = buildLocalContainerSandboxCommandPlans({
      checkPlan: buildAgentSandboxCheckPlan({
        policy: commandPolicy,
        requestedScripts: ['test', 'lint', 'test'],
      }),
      handle: {
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'sandbox_1',
        providerKind: 'local_container',
        stagingRoot: '/tmp/taskplane-sandbox-1',
        workspaceMode: 'staged_write',
      },
      request,
    });

    expect(plans.map((plan) => plan.script)).toEqual(['test', 'lint']);
    expect(plans[0]).toMatchObject({
      command: 'docker',
      environment: {},
      image: 'node:22-bookworm-slim',
      networkMode: 'disabled',
      outputLimitBytes: 64_000,
      timeoutMs: 30_000,
      workspaceMount: {
        readonly: true,
        source: '/tmp/taskplane-workspace',
        target: '/workspace',
      },
      stagingMount: {
        readonly: false,
        source: '/tmp/taskplane-sandbox-1',
        target: '/taskplane-staging',
      },
    });
    expect(plans[0]?.args).toEqual([
      'run',
      '--rm',
      '--network',
      'none',
      '--mount',
      'type=bind,source=/tmp/taskplane-workspace,target=/workspace,readonly',
      '--mount',
      'type=bind,source=/tmp/taskplane-sandbox-1,target=/taskplane-staging',
      '--workdir',
      '/workspace',
      'node:22-bookworm-slim',
      'npm',
      'run',
      'test',
    ]);
    expect(plans[0]?.args).not.toContain('--env');
  });

  it('rejects local container command plans that would inherit credentials or network', () => {
    const commandPolicy = buildDefaultAgentSandboxCommandPolicy();
    const request: AgentSandboxSessionRequest = {
      commandPolicy,
      descriptorId: 'workspace.staged_patch',
      executionPolicy: {
        ...buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' }),
        credentialPolicy: 'explicit_config',
      },
      providerKind: 'local_container',
      runId: 'run_1',
      taskId: 'task_1',
      workspace: {
        mode: 'staged_write',
        mountPath: '/workspace',
        workspaceRoot: '/tmp/taskplane-workspace',
      },
    };

    expect(() => buildLocalContainerSandboxCommandPlans({
      checkPlan: buildAgentSandboxCheckPlan({
        policy: commandPolicy,
        requestedScripts: ['test'],
      }),
      handle: {
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'sandbox_1',
        providerKind: 'local_container',
        stagingRoot: '/tmp/taskplane-sandbox-1',
        workspaceMode: 'staged_write',
      },
      request,
    })).toThrow('must not pass credentials');
  });
});
