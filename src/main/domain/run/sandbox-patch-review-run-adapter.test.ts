import { describe, expect, it, vi } from 'vitest';

import type { AgentSandboxSessionRequest } from '../../../shared/agent-sandbox-provider.js';
import {
  buildAgentSandboxCheckPlan,
  buildDefaultAgentSandboxCommandPolicy,
} from '../../../shared/agent-sandbox-provider.js';
import { buildDefaultAgentToolExecutionPolicy } from '../../../shared/agent-tool-scaffold.js';
import { LocalContainerSandboxProvider } from './local-container-sandbox-backend.js';
import { SandboxPatchReviewRunAdapter } from './sandbox-patch-review-run-adapter.js';

function buildRequest(commandPolicy = buildDefaultAgentSandboxCommandPolicy()): AgentSandboxSessionRequest {
  return {
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
}

describe('SandboxPatchReviewRunAdapter', () => {
  it('returns blocked before persistence when the sandbox coding lane is not eligible', async () => {
    const provider = new LocalContainerSandboxProvider();
    const persister = {
      persist: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const commandPolicy = buildDefaultAgentSandboxCommandPolicy();
    const adapter = new SandboxPatchReviewRunAdapter(
      provider,
      persister as never,
      runStepRepository as never,
    );

    const result = await adapter.run({
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
        summary: 'Blocked patch',
      },
      request: buildRequest(commandPolicy),
      runner: vi.fn(),
    });

    expect(result).toMatchObject({
      status: 'blocked',
      reason: expect.stringContaining('sandbox coding-agent feature flag is disabled'),
    });
    expect(persister.persist).not.toHaveBeenCalled();
    expect(runStepRepository.create).not.toHaveBeenCalled();
  });

  it('persists prepared sandbox patch reviews through the injected persister', async () => {
    const provider = new LocalContainerSandboxProvider();
    const persisted = {
      artifact: { id: 'artifact_patch_1' },
      checkpoint: { checkpointId: 'run_checkpoint_1' },
      steps: {},
    };
    const persister = {
      persist: vi.fn().mockResolvedValue(persisted),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const commandPolicy = buildDefaultAgentSandboxCommandPolicy();
    const adapter = new SandboxPatchReviewRunAdapter(
      provider,
      persister as never,
      runStepRepository as never,
    );

    const result = await adapter.run({
      checkPlan: buildAgentSandboxCheckPlan({
        policy: commandPolicy,
        requestedScripts: ['test'],
      }),
      decisionTitle: '确认提升 sandbox patch',
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      patchDraft: {
        diff: '--- a/notes.md\n+++ b/notes.md',
        files: ['notes.md'],
        summary: 'Reviewable patch',
      },
      request: buildRequest(commandPolicy),
      runner: vi.fn().mockResolvedValue({
        exitCode: 0,
        stderr: '',
        stdout: 'test ok',
      }),
    });

    expect(result).toEqual({
      result: persisted,
      status: 'persisted',
    });
    expect(persister.persist).toHaveBeenCalledWith(expect.objectContaining({
      decisionTitle: '确认提升 sandbox patch',
      runId: 'run_1',
      taskId: 'task_1',
    }));
    expect(runStepRepository.create).not.toHaveBeenCalled();
  });

  it('records a failed run step when preparation fails after eligibility passes', async () => {
    const provider = new LocalContainerSandboxProvider();
    const persister = {
      persist: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn().mockResolvedValue({
        id: 'run_step_failed_1',
        status: 'failed',
      }),
    };
    const commandPolicy = buildDefaultAgentSandboxCommandPolicy();
    const adapter = new SandboxPatchReviewRunAdapter(
      provider,
      persister as never,
      runStepRepository as never,
    );

    const result = await adapter.run({
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
        summary: 'Invalid patch',
      },
      request: buildRequest(commandPolicy),
      runner: vi.fn().mockResolvedValue({
        exitCode: 0,
        stderr: '',
        stdout: 'test ok',
      }),
    });

    expect(result).toMatchObject({
      status: 'failed',
      reason: 'Sandbox patch artifact requires a diff preview.',
      step: {
        id: 'run_step_failed_1',
      },
    });
    expect(persister.persist).not.toHaveBeenCalled();
    expect(runStepRepository.create).toHaveBeenCalledWith({
      runId: 'run_1',
      kind: 'final',
      status: 'failed',
      title: 'sandbox patch review failed',
      output: 'Sandbox patch artifact requires a diff preview.',
    });
  });
});
