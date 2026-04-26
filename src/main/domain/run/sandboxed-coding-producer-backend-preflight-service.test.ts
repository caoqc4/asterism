import { describe, expect, it, vi } from 'vitest';

import type { AgentSandboxBackendProbe } from '../../../shared/agent-sandbox-provider.js';
import type { AgentSessionRecord } from '../../../shared/types/agent-execution.js';
import type { RunStepRecord } from '../../../shared/types/run.js';
import { SandboxedCodingProducerBackendPreflightService } from './sandboxed-coding-producer-backend-preflight-service.js';

const request = {
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
    instructions: 'Prepare a staged coding patch.',
    taskTitle: 'Prepare coding patch',
  },
  modelPolicy: {
    providerKind: 'openai-compatible',
    toolExposure: 'sandboxed_coding_producer',
  },
  runId: 'run_1',
  sourceId: 'sandbox_source_1',
  taskId: 'task_1',
  workspaceRoot: '/tmp/taskplane-workspace',
};

const availableProbe: AgentSandboxBackendProbe = {
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

function buildPersisterMock() {
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
    status: 'failed',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const step: RunStepRecord = {
    createdAt: '2026-01-01T00:00:00.000Z',
    error: null,
    id: 'run_step_1',
    index: 1,
    input: 'session=sandboxed_producer:sandbox_source_1',
    kind: 'final',
    output: 'Sandboxed coding producer backend connection plan blocked: docker daemon unavailable',
    runId: 'run_1',
    status: 'completed',
    title: 'Sandbox producer backend blocked',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  return {
    persist: vi.fn().mockResolvedValue({
      session,
      steps: [step],
    }),
  };
}

describe('SandboxedCodingProducerBackendPreflightService', () => {
  it('returns a validated launch envelope when the backend gate is ready', async () => {
    const persister = buildPersisterMock();
    const service = new SandboxedCodingProducerBackendPreflightService(persister as never);

    const result = await service.run({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      probe: availableProbe,
      request,
    });

    expect(result).toMatchObject({
      envelope: {
        backendId: 'local-container',
        requiredRunner: 'local_container_sandboxed_coding_producer',
        runId: 'run_1',
        sessionId: 'sandboxed_producer:sandbox_source_1',
        sourceId: 'sandbox_source_1',
        status: 'ready',
      },
      plan: {
        backendId: 'local-container',
        status: 'ready',
      },
      status: 'ready',
    });
    expect(persister.persist).not.toHaveBeenCalled();
  });

  it('persists blocked backend preflight diagnostics when a run id is available', async () => {
    const persister = buildPersisterMock();
    const service = new SandboxedCodingProducerBackendPreflightService(persister as never);

    const result = await service.run({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      probe: {
        backendId: 'local-container',
        kind: 'local_container',
        reason: 'docker daemon unavailable',
        status: 'unavailable',
      },
      producerSource: 'model_backed',
      request,
    });

    expect(result).toMatchObject({
      diagnostic: {
        reason: 'docker daemon unavailable',
        status: 'blocked',
      },
      persistenceSummary: 'producer=blocked / session=failed / steps=1',
      reason: 'docker daemon unavailable',
      status: 'blocked',
    });
    const persistedResult = persister.persist.mock.calls[0]?.[0].result;
    if (!persistedResult) {
      throw new Error('Expected persisted blocked preflight result');
    }
    expect(persistedResult.sessionMetadata).toContain('producerSource=model_backed');
    expect(persistedResult.sessionMetadata).toContain('blockedReasons=docker daemon unavailable');
    expect(persister.persist).toHaveBeenCalledWith({
      result: expect.objectContaining({
        status: 'blocked',
      }),
      runId: 'run_1',
    });
  });

  it('keeps blocked diagnostics unpersisted when there is no run id', async () => {
    const persister = buildPersisterMock();
    const service = new SandboxedCodingProducerBackendPreflightService(persister as never);

    const result = await service.run({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      probe: {
        backendId: 'local-container',
        kind: 'local_container',
        reason: 'docker daemon unavailable',
        status: 'unavailable',
      },
      request: {},
    });

    expect(result).toMatchObject({
      diagnostic: null,
      reason: expect.stringContaining('Sandboxed coding producer requires a run id.'),
      status: 'blocked',
      summary: expect.stringContaining('not persisted: missing run id'),
    });
    expect(persister.persist).not.toHaveBeenCalled();
  });
});
