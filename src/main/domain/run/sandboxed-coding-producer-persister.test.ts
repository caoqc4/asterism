import { describe, expect, it, vi } from 'vitest';

import type { AgentSessionRecord } from '../../../shared/types/agent-execution.js';
import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';
import {
  SandboxedCodingProducerPreviewPersister,
  summarizeSandboxedCodingProducerPreviewPersistence,
} from './sandboxed-coding-producer-persister.js';
import type { PreviewSandboxedCodingInjectedProducerRunResult } from './sandboxed-coding-producer.js';
import { buildSandboxedCodingProducerBackendBlockedPreviewResult } from './sandboxed-coding-producer-backend.js';

function buildAgentSessionRepositoryMock() {
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
    metadata: null,
    mode: 'agent',
    runId: 'run_1',
    status: 'running',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  return {
    create: vi.fn().mockImplementation(async (input: {
      metadata?: string | null;
      runId: string;
    }) => ({
      ...session,
      metadata: input.metadata ?? null,
      runId: input.runId,
    })),
    updateStatus: vi.fn().mockImplementation(async (_id: string, status: AgentSessionRecord['status']) => ({
      ...session,
      status,
    })),
  };
}

function buildRunStepRepositoryMock() {
  let stepCount = 0;

  return {
    create: vi.fn().mockImplementation(async (input: {
      error?: string | null;
      input?: string | null;
      kind: RunStepKind;
      output?: string | null;
      runId: string;
      status?: RunStepStatus;
      title: string;
    }) => {
      stepCount += 1;
      return {
        createdAt: '2026-01-01T00:00:00.000Z',
        error: input.error ?? null,
        id: `run_step_${stepCount}`,
        index: stepCount,
        input: input.input ?? null,
        kind: input.kind,
        output: input.output ?? null,
        runId: input.runId,
        status: input.status ?? 'completed',
        title: input.title,
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
    }),
  };
}

describe('SandboxedCodingProducerPreviewPersister', () => {
  it('persists producer preview metadata and run steps without creating artifacts or checkpoints', async () => {
    const agentSessionRepository = buildAgentSessionRepositoryMock();
    const runStepRepository = buildRunStepRepositoryMock();
    const result: PreviewSandboxedCodingInjectedProducerRunResult = {
      events: [],
      plan: {
        reason: 'not used by preview persister',
        status: 'blocked',
        summary: 'not used by preview persister',
      },
      sessionMetadata: 'executor=sandboxed_coding_producer\nproducerStatus=source_ready',
      sessionSummary: 'producer completed',
      source: {
        evidence: {
          commandSummaries: ['lint: passed'],
          modelSummary: null,
          observations: ['updated notes'],
        },
        patchDraft: {
          diff: '--- a/src/notes.md',
          files: ['src/notes.md'],
          summary: 'Update notes',
        },
        policySnapshot: {
          network: 'disabled',
          noCredentialPassthrough: true,
          promotion: 'decision_required',
        },
        requestedScripts: ['lint'],
        runId: 'run_1',
        sourceId: 'source_1',
        sourceKind: 'sandbox_session',
        taskId: 'task_1',
        workspaceRoot: '/tmp/taskplane-workspace',
      },
      status: 'preview_ready',
      steps: [
        {
          input: 'session=sandboxed_producer:source_1',
          kind: 'plan',
          output: 'started',
          runId: 'run_1',
          status: 'running',
          title: 'Sandboxed coding producer started',
        },
        {
          input: 'session=sandboxed_producer:source_1',
          kind: 'artifact',
          output: 'ready',
          runId: 'run_1',
          status: 'completed',
          title: 'Sandbox producer source ready',
        },
      ],
    };
    const persister = new SandboxedCodingProducerPreviewPersister(
      agentSessionRepository as never,
      runStepRepository as never,
    );

    const persisted = await persister.persist({
      result,
      runId: 'run_1',
    });

    expect(agentSessionRepository.create).toHaveBeenCalledWith({
      runId: 'run_1',
      mode: 'agent',
      capabilities: {
        fileContext: true,
        longRunningSessions: true,
        streaming: false,
        structuredToolCalls: false,
        taskMutationTools: false,
        textOnlyPlanning: false,
      },
      metadata: 'executor=sandboxed_coding_producer\nproducerStatus=source_ready',
    });
    expect(runStepRepository.create).toHaveBeenCalledTimes(2);
    expect(agentSessionRepository.updateStatus).toHaveBeenCalledWith('agent_session_1', 'completed');
    expect(persisted.steps.map((step) => step.title)).toEqual([
      'Sandboxed coding producer started',
      'Sandbox producer source ready',
    ]);
  });

  it('marks blocked producer previews as failed sessions with terminal steps', async () => {
    const agentSessionRepository = buildAgentSessionRepositoryMock();
    const runStepRepository = buildRunStepRepositoryMock();
    const result: PreviewSandboxedCodingInjectedProducerRunResult = {
      events: [],
      plan: null,
      reason: 'No sandbox backend is ready.',
      sessionMetadata: 'executor=sandboxed_coding_producer\nproducerStatus=blocked',
      sessionSummary: 'blocked before work',
      status: 'blocked',
      steps: [
        {
          kind: 'final',
          output: 'No sandbox backend is ready.',
          runId: 'run_1',
          status: 'completed',
          title: 'Sandbox producer blocked',
        },
      ],
    };
    const persister = new SandboxedCodingProducerPreviewPersister(
      agentSessionRepository as never,
      runStepRepository as never,
    );

    const persisted = await persister.persist({
      result,
      runId: 'run_1',
    });

    expect(agentSessionRepository.updateStatus).toHaveBeenCalledWith('agent_session_1', 'failed');
    expect(persisted.session.status).toBe('failed');
    expect(persisted.steps[0]).toMatchObject({
      kind: 'final',
      title: 'Sandbox producer blocked',
    });
    expect(summarizeSandboxedCodingProducerPreviewPersistence({
      result,
      stepCount: persisted.steps.length,
    })).toBe('producer=blocked / session=failed / steps=1');
  });

  it('persists blocked backend connection diagnostics through the preview persister', async () => {
    const agentSessionRepository = buildAgentSessionRepositoryMock();
    const runStepRepository = buildRunStepRepositoryMock();
    const result = buildSandboxedCodingProducerBackendBlockedPreviewResult({
      commandScripts: ['lint', 'test'],
      network: 'disabled',
      plan: {
        blockedReasons: ['docker daemon unavailable'],
        gateSummary: 'Sandboxed coding producer backend connection blocked: docker daemon unavailable',
        status: 'blocked',
        summary: 'Sandboxed coding producer backend connection plan blocked: docker daemon unavailable',
      },
      providerKind: 'openai-compatible',
      runId: 'run_1',
      sourceId: 'sandbox_source_1',
      workspaceRoot: '/tmp/taskplane-workspace',
    });
    const persister = new SandboxedCodingProducerPreviewPersister(
      agentSessionRepository as never,
      runStepRepository as never,
    );

    const persisted = await persister.persist({
      result,
      runId: 'run_1',
    });

    expect(agentSessionRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.stringContaining('producerStatus=blocked'),
      runId: 'run_1',
    }));
    expect(agentSessionRepository.updateStatus).toHaveBeenCalledWith('agent_session_1', 'failed');
    expect(persisted.steps).toHaveLength(1);
    expect(persisted.steps[0]).toMatchObject({
      kind: 'final',
      output: 'Sandboxed coding producer backend connection plan blocked: docker daemon unavailable',
      status: 'completed',
      title: 'Sandbox producer backend blocked',
    });
  });
});
