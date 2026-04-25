import { describe, expect, it, vi } from 'vitest';

import type { AgentSessionRecord } from '../../../shared/types/agent-execution.js';
import type { RunStepRecord } from '../../../shared/types/run.js';
import { SandboxedCodingInjectedProducerPreviewService } from './sandboxed-coding-injected-producer-preview-service.js';

describe('SandboxedCodingInjectedProducerPreviewService', () => {
  it('runs the injected preview and persists the resulting session and steps', async () => {
    const session: AgentSessionRecord = {
      capabilities: {
        fileContext: true,
        longRunningSessions: true,
        streaming: false,
        structuredToolCalls: false,
        taskMutationTools: false,
        textOnlyPlanning: false,
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'agent_session_1',
      metadata: 'executor=sandboxed_coding_producer',
      mode: 'agent',
      runId: 'run_1',
      status: 'completed',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const step: RunStepRecord = {
      createdAt: '2026-01-01T00:00:00.000Z',
      error: null,
      id: 'run_step_1',
      index: 1,
      input: null,
      kind: 'final',
      output: 'No sandbox backend is ready.',
      runId: 'run_1',
      status: 'completed',
      title: 'Sandbox producer blocked',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const persister = {
      persist: vi.fn().mockResolvedValue({
        session,
        steps: [step],
      }),
    };
    const service = new SandboxedCodingInjectedProducerPreviewService(persister as never);

    const result = await service.run({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      patchSummary: 'No patch',
      request: {
        commandPolicy: {
          allowedScripts: ['test', 'lint'],
          outputLimitBytes: 64_000,
          timeoutMs: 120_000,
        },
        executionPolicy: {
          network: 'disabled',
          noCredentialPassthrough: true,
          promotion: 'decision_required',
        },
        intent: {
          completionCriteria: ['Patch is reviewable'],
          instructions: 'Try producer path.',
          taskTitle: 'Try producer',
        },
        modelPolicy: {
          providerKind: 'openai-compatible',
          toolExposure: 'sandboxed_coding_producer',
        },
        runId: 'run_1',
        sourceId: 'source_1',
        taskId: 'task_1',
        workspaceRoot: '/tmp/taskplane-workspace',
      },
      runner: async () => ({
        reason: 'No sandbox backend is ready.',
        sessionSummary: 'blocked before work',
        status: 'blocked',
      }),
      stagingRoot: '/tmp/taskplane-staging',
    });

    expect(persister.persist).toHaveBeenCalledWith({
      result: expect.objectContaining({
        reason: 'No sandbox backend is ready.',
        status: 'blocked',
      }),
      runId: 'run_1',
    });
    expect(result.preview.status).toBe('blocked');
    expect(result.persistence.session.id).toBe('agent_session_1');
    expect(result.persistenceSummary).toBe('producer=blocked / session=failed / steps=1');
  });

  it('fails before persistence when preview validation cannot produce a run id', async () => {
    const persister = {
      persist: vi.fn(),
    };
    const service = new SandboxedCodingInjectedProducerPreviewService(persister as never);

    await expect(service.run({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      patchSummary: 'No patch',
      request: {},
      runner: async () => ({
        reason: 'unreachable',
        sessionSummary: 'unreachable',
        status: 'blocked',
      }),
      stagingRoot: '/tmp/taskplane-staging',
    })).rejects.toThrow('Sandboxed coding producer preview did not produce a run id.');
    expect(persister.persist).not.toHaveBeenCalled();
  });
});
