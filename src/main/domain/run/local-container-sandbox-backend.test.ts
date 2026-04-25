import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  buildAgentSandboxCheckPlan,
  buildAgentSandboxBackendProfileFromProbe,
  buildAgentSandboxProviderCapabilitiesFromBackendProfile,
  buildDefaultAgentSandboxCommandPolicy,
  evaluateAgentSandboxBackendReadiness,
  evaluateAgentSandboxCodingLaneEligibility,
  summarizeAgentSandboxBackendProbe,
  type AgentSandboxSessionRequest,
} from '../../../shared/agent-sandbox-provider.js';
import { buildDefaultAgentToolExecutionPolicy } from '../../../shared/agent-tool-scaffold.js';
import {
  buildLocalContainerSandboxCommandPlans,
  buildLocalContainerSandboxBackendProbe,
  createLocalContainerSandboxCommandRunner,
  LocalContainerSandboxProvider,
  prepareLocalContainerSandboxPatchReview,
  probeLocalContainerSandboxBackend,
  runLocalContainerSandboxCommandPlan,
  runLocalContainerSandboxCommandPlans,
} from './local-container-sandbox-backend.js';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

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

  it('normalizes injected local container command runner results without executing docker directly', async () => {
    const commandPolicy = buildDefaultAgentSandboxCommandPolicy({
      outputLimitBytes: 18,
      timeoutMs: 30_000,
    });
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
    const [plan] = buildLocalContainerSandboxCommandPlans({
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
    });
    const runner = vi.fn().mockResolvedValue({
      exitCode: 1,
      stderr: '0123456789abcdefghij',
      stdout: 'tests failed',
    });

    await expect(runLocalContainerSandboxCommandPlan(plan!, runner)).resolves.toEqual({
      outputPreview: 'tests failed\n01234\n[output truncated]',
      script: 'test',
      status: 'failed',
    });
    expect(runner).toHaveBeenCalledWith(plan);

    await expect(runLocalContainerSandboxCommandPlan(plan!, vi.fn().mockRejectedValue(new Error('docker failed'))))
      .resolves.toEqual({
        outputPreview: 'docker failed',
        script: 'test',
        status: 'failed',
      });
  });

  it('runs injected local container command plans sequentially and keeps failed checks visible', async () => {
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
        requestedScripts: ['lint', 'test'],
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
    const runner = vi.fn()
      .mockResolvedValueOnce({
        exitCode: 0,
        stderr: '',
        stdout: 'lint ok',
      })
      .mockResolvedValueOnce({
        exitCode: 1,
        stderr: 'test failed',
        stdout: '',
      });

    await expect(runLocalContainerSandboxCommandPlans(plans, runner)).resolves.toEqual({
      results: [
        {
          outputPreview: 'lint ok',
          script: 'lint',
          status: 'passed',
        },
        {
          outputPreview: 'test failed',
          script: 'test',
          status: 'failed',
        },
      ],
      summary: 'lint: passed; test: failed',
    });
    expect(runner).toHaveBeenNthCalledWith(1, plans[0]);
    expect(runner).toHaveBeenNthCalledWith(2, plans[1]);
  });

  it('creates an explicit docker command runner without wiring it into automatic execution', async () => {
    const commandPolicy = buildDefaultAgentSandboxCommandPolicy({
      outputLimitBytes: 4096,
      timeoutMs: 30_000,
    });
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
    const [plan] = buildLocalContainerSandboxCommandPlans({
      checkPlan: buildAgentSandboxCheckPlan({
        policy: commandPolicy,
        requestedScripts: ['lint'],
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
    const execFileRunner = vi.fn().mockResolvedValue({
      exitCode: 0,
      stderr: '',
      stdout: 'lint ok',
    });

    const runner = createLocalContainerSandboxCommandRunner(execFileRunner);

    await expect(runner(plan!)).resolves.toEqual({
      exitCode: 0,
      stderr: '',
      stdout: 'lint ok',
    });
    expect(execFileRunner).toHaveBeenCalledWith({
      args: plan?.args,
      command: 'docker',
      env: {},
      maxBuffer: 4096,
      timeoutMs: 30_000,
    });
  });

  it('prepares a local-container sandbox session and runs checks only through an injected runner', async () => {
    const workspaceRoot = makeTempDir('taskplane-local-container-workspace-');
    const provider = new LocalContainerSandboxProvider();
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
        workspaceRoot,
      },
    };

    const handle = await provider.prepareSession(request);

    try {
      expect(evaluateAgentSandboxCodingLaneEligibility({
        commandPolicy: request.commandPolicy,
        executionPolicy: request.executionPolicy,
        featureFlags: {
          enableScheduler: false,
          enableSandboxCodingAgent: true,
        },
        providerCapabilities: provider.capabilities,
        workspaceRoot,
      })).toMatchObject({
        eligible: true,
      });
      expect(JSON.parse(fs.readFileSync(path.join(handle.stagingRoot, 'session.json'), 'utf8'))).toMatchObject({
        providerCapabilities: {
          supportsPatchArtifacts: true,
          supportsTargetedCommands: true,
        },
        providerKind: 'local_container',
        workspace: {
          mode: 'staged_write',
          workspaceRoot: path.resolve(workspaceRoot),
        },
      });
      await expect(provider.summarizeSession(handle)).resolves.toContain('patchArtifacts=supported');

      const runner = vi.fn().mockResolvedValue({
        exitCode: 0,
        stderr: '',
        stdout: 'lint ok',
      });

      await expect(provider.runChecks({
        checkPlan: buildAgentSandboxCheckPlan({
          policy: commandPolicy,
          requestedScripts: ['lint'],
        }),
        handle,
        request,
        runner,
      })).resolves.toMatchObject({
        results: [
          {
            outputPreview: 'lint ok',
            script: 'lint',
            status: 'passed',
          },
        ],
        summary: 'lint: passed',
      });
      expect(runner).toHaveBeenCalledTimes(1);
    } finally {
      await provider.disposeSession(handle);
      fs.rmSync(workspaceRoot, { force: true, recursive: true });
    }

    expect(fs.existsSync(handle.stagingRoot)).toBe(false);
  });

  it('prepares a reviewable sandbox patch with checks and a promotion checkpoint without applying files', async () => {
    const workspaceRoot = makeTempDir('taskplane-local-container-review-workspace-');
    const sourceFile = path.join(workspaceRoot, 'notes.md');
    fs.writeFileSync(sourceFile, 'original\n', 'utf8');
    const provider = new LocalContainerSandboxProvider();
    const commandPolicy = buildDefaultAgentSandboxCommandPolicy({ timeoutMs: 30_000 });
    const request: AgentSandboxSessionRequest = {
      audit: {
        acceptedScripts: ['test'],
        idempotencyKey: 'sandbox-patch-review:sandbox_session:sandbox_session_1:run_1:task_1:test',
        initiatedBy: 'internal_sandbox_patch_review',
        patchDraftSource: {
          sourceId: 'sandbox_session_1',
          sourceKind: 'sandbox_session',
        },
        reason: 'Review sandbox patch before promotion.',
        rejectedScripts: [],
        requestedScripts: ['test'],
        workspaceRoot,
      },
      commandPolicy,
      descriptorId: 'workspace.staged_patch',
      executionPolicy: buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' }),
      providerKind: 'local_container',
      runId: 'run_1',
      taskId: 'task_1',
      workspace: {
        mode: 'staged_write',
        mountPath: '/workspace',
        workspaceRoot,
      },
    };
    const runner = vi.fn().mockResolvedValue({
      exitCode: 0,
      stderr: '',
      stdout: 'test ok',
    });
    let handlePath: string | null = null;

    try {
      const preparation = await prepareLocalContainerSandboxPatchReview({
        checkPlan: buildAgentSandboxCheckPlan({
          policy: commandPolicy,
          requestedScripts: ['test'],
        }),
        featureFlags: {
          enableScheduler: false,
          enableSandboxCodingAgent: true,
        },
        patchDraft: {
          diff: '--- a/notes.md\n+++ b/notes.md\n@@\n-original\n+updated',
          files: ['notes.md'],
          summary: 'Update notes from sandbox',
        },
        provider,
        request,
        runner,
      });
      handlePath = preparation.handle.stagingRoot;

      expect(preparation.audit?.patchDraftSource).toEqual({
        sourceId: 'sandbox_session_1',
        sourceKind: 'sandbox_session',
      });
      expect(preparation.checkRun.summary).toBe('test: passed');
      expect(preparation.artifact).toMatchObject({
        commandLogs: [
          {
            outputPreview: 'test ok',
            script: 'test',
            status: 'passed',
          },
        ],
        files: ['notes.md'],
        kind: 'patch',
        summary: 'Update notes from sandbox',
      });
      expect(preparation.checkpoint).toMatchObject({
        kind: 'patch_promotion',
        policySnapshot: request.executionPolicy,
        preview: expect.stringContaining('+++ b/notes.md'),
        resumeTarget: `${preparation.handle.id}:promote`,
      });
      expect(preparation.sessionSummary).toContain('patchArtifacts=supported');
      expect(fs.readFileSync(sourceFile, 'utf8')).toBe('original\n');
      expect(runner).toHaveBeenCalledTimes(1);

      await provider.disposeSession(preparation.handle);
    } finally {
      fs.rmSync(workspaceRoot, { force: true, recursive: true });
      if (handlePath) {
        fs.rmSync(handlePath, { force: true, recursive: true });
      }
    }
  });

  it('disposes the prepared sandbox session when patch review preparation fails', async () => {
    const workspaceRoot = makeTempDir('taskplane-local-container-review-fail-workspace-');
    const provider = new LocalContainerSandboxProvider();
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
        workspaceRoot,
      },
    };
    let preparedHandlePath: string | null = null;
    const originalPrepareSession = provider.prepareSession.bind(provider);
    vi.spyOn(provider, 'prepareSession').mockImplementation(async (nextRequest) => {
      const handle = await originalPrepareSession(nextRequest);
      preparedHandlePath = handle.stagingRoot;
      return handle;
    });

    try {
      await expect(prepareLocalContainerSandboxPatchReview({
        checkPlan: buildAgentSandboxCheckPlan({
          policy: commandPolicy,
          requestedScripts: ['test'],
        }),
        featureFlags: {
          enableScheduler: false,
          enableSandboxCodingAgent: true,
        },
        patchDraft: {
          diff: '',
          files: ['notes.md'],
          summary: 'Invalid patch draft',
        },
        provider,
        request,
        runner: vi.fn().mockResolvedValue({
          exitCode: 0,
          stderr: '',
          stdout: 'test ok',
        }),
      })).rejects.toThrow('Sandbox patch artifact requires a diff preview.');

      expect(preparedHandlePath).not.toBeNull();
      expect(fs.existsSync(preparedHandlePath!)).toBe(false);
    } finally {
      fs.rmSync(workspaceRoot, { force: true, recursive: true });
      if (preparedHandlePath) {
        fs.rmSync(preparedHandlePath, { force: true, recursive: true });
      }
    }
  });

  it('blocks patch review preparation before creating a session when eligibility fails', async () => {
    const workspaceRoot = makeTempDir('taskplane-local-container-ineligible-workspace-');
    const provider = new LocalContainerSandboxProvider();
    const prepareSessionSpy = vi.spyOn(provider, 'prepareSession');
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
        workspaceRoot,
      },
    };

    try {
      await expect(prepareLocalContainerSandboxPatchReview({
        checkPlan: buildAgentSandboxCheckPlan({
          policy: commandPolicy,
          requestedScripts: ['test'],
        }),
        featureFlags: {
          enableScheduler: false,
          enableSandboxCodingAgent: false,
        },
        patchDraft: {
          diff: '--- a/notes.md\n+++ b/notes.md',
          files: ['notes.md'],
          summary: 'Blocked patch draft',
        },
        provider,
        request,
        runner: vi.fn(),
      })).rejects.toThrow('sandbox coding-agent feature flag is disabled');

      expect(prepareSessionSpy).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(workspaceRoot, { force: true, recursive: true });
    }
  });
});
