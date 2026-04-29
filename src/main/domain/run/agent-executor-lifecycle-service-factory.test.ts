import { describe, expect, it, vi } from 'vitest';

import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';
import { createAgentExecutorLifecycleService } from './agent-executor-lifecycle-service-factory.js';

function buildCapabilities() {
  return {
    structuredToolCalls: false,
    textOnlyPlanning: true,
    streaming: false,
    fileContext: true,
    taskMutationTools: false,
    longRunningSessions: true,
  };
}

function buildRunStepRepositoryMock() {
  let stepCount = 1;

  return {
    create: vi.fn().mockImplementation(async (input: {
      runId: string;
      kind: RunStepKind;
      status?: RunStepStatus;
      title: string;
    }) => ({
      id: `run_step_${stepCount++}`,
      ...input,
    })),
    update: vi.fn(),
  };
}

describe('createAgentExecutorLifecycleService', () => {
  it('builds a dry-run lifecycle service from explicit dependencies without exposing a runtime', async () => {
    const runStepRepository = buildRunStepRepositoryMock();
    const agentSessionStore = {
      updateStatus: vi.fn().mockImplementation(async (id: string, status: string) => ({
        id,
        runId: 'run_1',
        mode: 'agent',
        status,
        capabilities: buildCapabilities(),
        metadata: null,
        createdAt: '2026-04-30T00:00:00.000Z',
        updatedAt: '2026-04-30T00:01:00.000Z',
      })),
    };
    const service = createAgentExecutorLifecycleService({
      agentSessionStore: agentSessionStore as never,
      runStepRepository: runStepRepository as never,
    });
    const handle = await service.startSession({
      runId: 'run_1',
      agentSessionId: 'agent_session_1',
      runtimeId: 'local_sandbox',
      profileId: 'manual_code_agent',
      nowIso: '2026-04-30T00:00:00.000Z',
      capabilities: buildCapabilities(),
    });

    const planned = await service.observeAndPlan({
      handle,
      signal: {
        type: 'cancelled',
        reason: 'Operator cancelled the dry-run lifecycle service.',
      },
    });

    expect(planned).toMatchObject({
      settlementPlan: {
        action: 'update_session_status',
        sessionId: 'agent_session_1',
        status: 'cancelled',
      },
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'final',
      title: 'Agent session 已取消',
      error: 'Operator cancelled the dry-run lifecycle service.',
    }));
    expect(agentSessionStore.updateStatus).not.toHaveBeenCalled();

    await expect(service.applySettlementPlan(planned.settlementPlan)).resolves.toMatchObject({
      applied: true,
      session: {
        id: 'agent_session_1',
        status: 'cancelled',
      },
    });
    expect(agentSessionStore.updateStatus).toHaveBeenCalledWith('agent_session_1', 'cancelled');
  });
});
