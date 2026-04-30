import { describe, expect, it, vi } from 'vitest';

import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';
import { DryRunAgentExecutorLifecycleAdapter } from './agent-executor.js';
import { AgentExecutorLifecycleMonitor } from './agent-executor-lifecycle-monitor.js';
import { AgentExecutorLifecycleService } from './agent-executor-lifecycle-service.js';
import { AgentSessionEventRecorder } from './agent-session-event-recorder.js';

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

function buildService() {
  const runStepRepository = buildRunStepRepositoryMock();
  const statusUpdater = {
    updateStatus: vi.fn().mockImplementation(async (id: string, status: string) => ({
      id,
      runId: 'run_1',
      mode: 'agent',
      status,
      capabilities: buildCapabilities(),
      metadata: null,
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:01:00.000Z',
    })),
  };
  const service = new AgentExecutorLifecycleService(
    new AgentExecutorLifecycleMonitor(
      new DryRunAgentExecutorLifecycleAdapter(),
      new AgentSessionEventRecorder(runStepRepository as never),
    ),
    statusUpdater as never,
  );

  return {
    runStepRepository,
    service,
    statusUpdater,
  };
}

describe('AgentExecutorLifecycleService', () => {
  it('observes and plans lifecycle events without applying session status updates', async () => {
    const { runStepRepository, service, statusUpdater } = buildService();
    const handle = await service.startSession({
      runId: 'run_1',
      agentSessionId: 'agent_session_1',
      runtimeId: 'local_sandbox',
      profileId: 'manual_code_agent',
      nowIso: '2026-04-29T00:00:00.000Z',
      capabilities: buildCapabilities(),
    });

    const planned = await service.observeAndPlan({
      handle,
      signal: {
        type: 'cancelled',
        reason: 'Operator cancelled the dry-run executor.',
      },
    });

    expect(planned).toMatchObject({
      projectedStatus: 'cancelled',
      terminalEventRecorded: true,
      settlementPlan: {
        action: 'update_session_status',
        sessionId: 'agent_session_1',
        status: 'cancelled',
      },
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'final',
      title: 'Agent session 已取消',
      error: 'Operator cancelled the dry-run executor.',
    }));
    expect(statusUpdater.updateStatus).not.toHaveBeenCalled();
  });

  it('applies a planned settlement only when explicitly requested', async () => {
    const { service, statusUpdater } = buildService();
    const handle = await service.startSession({
      runId: 'run_1',
      agentSessionId: 'agent_session_1',
      runtimeId: 'local_sandbox',
      profileId: 'manual_code_agent',
      nowIso: '2026-04-29T00:00:00.000Z',
      capabilities: buildCapabilities(),
    });
    const planned = await service.observeAndPlan({
      handle,
      signal: {
        type: 'cancelled',
        reason: 'Operator cancelled the dry-run executor.',
      },
    });

    await expect(service.applySettlementPlan(planned.settlementPlan)).resolves.toMatchObject({
      applied: true,
      session: {
        id: 'agent_session_1',
        status: 'cancelled',
      },
    });
    expect(statusUpdater.updateStatus).toHaveBeenCalledWith('agent_session_1', 'cancelled');
  });

  it('plans typed lifecycle control requests without applying session status updates', async () => {
    const { runStepRepository, service, statusUpdater } = buildService();
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
        type: 'cancel',
        reason: 'Operator cancelled dry-run control.',
      },
    });

    expect(planned).toMatchObject({
      projectedStatus: 'cancelled',
      terminalEventRecorded: true,
      settlementPlan: {
        action: 'update_session_status',
        sessionId: 'agent_session_1',
        status: 'cancelled',
      },
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'final',
      title: 'Agent session 已取消',
      error: 'Operator cancelled dry-run control.',
    }));
    expect(statusUpdater.updateStatus).not.toHaveBeenCalled();
  });

  it('propagates unsupported control requests without recording or updating status', async () => {
    const { runStepRepository, service, statusUpdater } = buildService();
    const handle = await service.startSession({
      runId: 'run_1',
      agentSessionId: 'agent_session_1',
      runtimeId: 'local_sandbox',
      profileId: 'manual_code_agent',
      nowIso: '2026-04-30T00:00:00.000Z',
      capabilities: buildCapabilities(),
      controlSupport: {
        interrupt: false,
      },
    });

    await expect(service.controlAndPlan({
      handle,
      request: {
        type: 'interrupt',
        reason: 'Operator attempted unsupported interrupt.',
      },
    })).rejects.toThrow(
      'Executor lifecycle control request interrupt is not supported by this handle.',
    );
    expect(runStepRepository.create).not.toHaveBeenCalled();
    expect(statusUpdater.updateStatus).not.toHaveBeenCalled();
  });
});
