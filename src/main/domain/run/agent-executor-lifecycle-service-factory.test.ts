import { describe, expect, it, vi } from 'vitest';

import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';
import {
  createAgentExecutorLifecycleService,
  evaluateAgentExecutorLifecycleServiceAvailability,
} from './agent-executor-lifecycle-service-factory.js';

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
  it('describes the default lifecycle service as dry-run only', () => {
    expect(evaluateAgentExecutorLifecycleServiceAvailability()).toEqual({
      status: 'dry_run_available',
      runtimeReady: false,
      modelExposure: 'hidden',
      automaticStartAllowed: false,
      queueWorkerAllowed: false,
      supportedControlRequests: ['heartbeat', 'interrupt', 'cancel'],
      blockedReasons: [
        'No real executor runtime is connected.',
        'Lifecycle service is not wired into bootstrap, IPC, scheduler, or queue workers.',
        'Model-visible tool exposure remains hidden.',
      ],
      nextAction: 'Keep lifecycle service in dry-run diagnostics until a real executor adapter decision is accepted.',
      reason:
        'Executor lifecycle service is available as a dry-run adapter boundary only; no real runtime is launched.',
      summary: [
        'Executor lifecycle service availability',
        'status=dry_run_available',
        'runtimeReady=no',
        'modelExposure=hidden',
        'automaticStart=no',
        'queueWorker=no',
        'controlRequests=heartbeat,interrupt,cancel',
        'blocked=No real executor runtime is connected.; Lifecycle service is not wired into bootstrap, IPC, scheduler, or queue workers.; Model-visible tool exposure remains hidden.',
        'next=Keep lifecycle service in dry-run diagnostics until a real executor adapter decision is accepted.',
      ].join(' / '),
    });
  });

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

  it('builds a service that plans typed control requests without applying status updates', async () => {
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

    const planned = await service.controlAndPlan({
      handle,
      request: {
        type: 'interrupt',
        reason: 'Dry-run executor control interrupted.',
      },
    });

    expect(planned).toMatchObject({
      projectedStatus: 'failed',
      terminalEventRecorded: true,
      settlementPlan: {
        action: 'update_session_status',
        sessionId: 'agent_session_1',
        status: 'failed',
      },
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'final',
      status: 'failed',
      title: 'Agent session 已中断',
      error: 'Dry-run executor control interrupted.',
    }));
    expect(agentSessionStore.updateStatus).not.toHaveBeenCalled();
  });

  it('builds a service that rejects unsupported control requests before evidence is recorded', async () => {
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

    await expect(service.controlAndPlan({
      handle: {
        ...handle,
        control: {
          ...handle.control,
          cancel: false,
        },
      },
      request: {
        type: 'cancel',
        reason: 'Operator attempted unsupported factory cancel.',
      },
    })).rejects.toThrow(
      'Executor lifecycle control request cancel is not supported by this handle.',
    );
    expect(runStepRepository.create).not.toHaveBeenCalled();
    expect(agentSessionStore.updateStatus).not.toHaveBeenCalled();
  });
});
