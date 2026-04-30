import { describe, expect, it, vi } from 'vitest';

import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';
import { DryRunAgentExecutorLifecycleAdapter } from './agent-executor.js';
import {
  AgentExecutorLifecycleMonitor,
  applyAgentExecutorLifecycleSettlementPlan,
} from './agent-executor-lifecycle-monitor.js';
import { AgentSessionEventRecorder } from './agent-session-event-recorder.js';

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

describe('AgentExecutorLifecycleMonitor', () => {
  it('records heartbeat observations without projecting a terminal session status', async () => {
    const runStepRepository = buildRunStepRepositoryMock();
    const monitor = new AgentExecutorLifecycleMonitor(
      new DryRunAgentExecutorLifecycleAdapter(),
      new AgentSessionEventRecorder(runStepRepository as never),
    );
    const handle = await monitor.startSession({
      runId: 'run_1',
      agentSessionId: 'agent_session_1',
      runtimeId: 'local_sandbox',
      profileId: 'manual_code_agent',
      nowIso: '2026-04-29T00:00:00.000Z',
      capabilities: buildCapabilities(),
    });

    const observation = await monitor.observeAndPlan({
      handle,
      signal: {
        type: 'heartbeat',
        summary: 'Dry-run executor is still alive.',
      },
    });

    expect(observation).toMatchObject({
      projectedStatus: null,
      terminalEventRecorded: false,
      terminalSessionStatus: null,
      recordedStep: {
        kind: 'plan',
        status: 'running',
        title: 'Agent session 心跳',
        output: 'Dry-run executor is still alive.',
      },
      settlementPlan: {
        action: 'no_status_change',
        sessionId: 'agent_session_1',
        summary: [
          'Executor lifecycle settlement',
          'session=agent_session_1',
          'action=no_status_change',
          'reason=no_projected_status',
          'autoReplay=no',
        ].join(' / '),
      },
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'plan',
      status: 'running',
      title: 'Agent session 心跳',
    }));
  });

  it('records cancellation observations as terminal evidence without settling the session directly', async () => {
    const runStepRepository = buildRunStepRepositoryMock();
    const monitor = new AgentExecutorLifecycleMonitor(
      new DryRunAgentExecutorLifecycleAdapter(),
      new AgentSessionEventRecorder(runStepRepository as never),
    );
    const handle = await monitor.startSession({
      runId: 'run_1',
      agentSessionId: 'agent_session_1',
      runtimeId: 'local_sandbox',
      profileId: 'manual_code_agent',
      nowIso: '2026-04-29T00:00:00.000Z',
      capabilities: buildCapabilities(),
    });

    const observation = await monitor.observeAndPlan({
      handle,
      signal: {
        type: 'cancelled',
        reason: 'Operator cancelled the dry-run executor.',
      },
    });

    expect(observation).toMatchObject({
      projectedStatus: 'cancelled',
      terminalEventRecorded: true,
      terminalSessionStatus: 'cancelled',
      recordedStep: {
        kind: 'final',
        status: 'failed',
        title: 'Agent session 已取消',
        error: 'Operator cancelled the dry-run executor.',
      },
      settlementPlan: {
        action: 'update_session_status',
        sessionId: 'agent_session_1',
        status: 'cancelled',
        summary: [
          'Executor lifecycle settlement',
          'session=agent_session_1',
          'status=cancelled',
          'terminalEvent=yes',
          'action=update_session_status',
          'autoReplay=no',
        ].join(' / '),
      },
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'final',
      status: 'failed',
      title: 'Agent session 已取消',
      error: 'Operator cancelled the dry-run executor.',
    }));
  });

  it('records typed control requests and returns settlement plans', async () => {
    const runStepRepository = buildRunStepRepositoryMock();
    const monitor = new AgentExecutorLifecycleMonitor(
      new DryRunAgentExecutorLifecycleAdapter(),
      new AgentSessionEventRecorder(runStepRepository as never),
    );
    const handle = await monitor.startSession({
      runId: 'run_1',
      agentSessionId: 'agent_session_1',
      runtimeId: 'local_sandbox',
      profileId: 'manual_code_agent',
      nowIso: '2026-04-30T00:00:00.000Z',
      capabilities: buildCapabilities(),
    });

    const observation = await monitor.controlAndPlan({
      handle,
      request: {
        type: 'interrupt',
        reason: 'Dry-run executor stopped responding.',
      },
    });

    expect(observation).toMatchObject({
      projectedStatus: 'failed',
      terminalEventRecorded: true,
      terminalSessionStatus: 'failed',
      recordedStep: {
        kind: 'final',
        status: 'failed',
        title: 'Agent session 已中断',
        error: 'Dry-run executor stopped responding.',
      },
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
      error: 'Dry-run executor stopped responding.',
    }));
  });

  it('does not record events or settlement plans for unsupported control requests', async () => {
    const runStepRepository = buildRunStepRepositoryMock();
    const monitor = new AgentExecutorLifecycleMonitor(
      new DryRunAgentExecutorLifecycleAdapter(),
      new AgentSessionEventRecorder(runStepRepository as never),
    );
    const handle = await monitor.startSession({
      runId: 'run_1',
      agentSessionId: 'agent_session_1',
      runtimeId: 'local_sandbox',
      profileId: 'manual_code_agent',
      nowIso: '2026-04-30T00:00:00.000Z',
      capabilities: buildCapabilities(),
      controlSupport: {
        cancel: false,
      },
    });

    await expect(monitor.controlAndPlan({
      handle,
      request: {
        type: 'cancel',
        reason: 'Operator attempted unsupported cancel.',
      },
    })).rejects.toThrow(
      'Executor lifecycle control request cancel is not supported by this handle.',
    );
    expect(runStepRepository.create).not.toHaveBeenCalled();
  });

  it('applies settlement plans only when a status update is explicit', async () => {
    const statusUpdater = {
      updateStatus: vi.fn().mockResolvedValue({
        id: 'agent_session_1',
        runId: 'run_1',
        mode: 'agent',
        status: 'cancelled',
        capabilities: buildCapabilities(),
        metadata: null,
        createdAt: '2026-04-29T00:00:00.000Z',
        updatedAt: '2026-04-29T00:01:00.000Z',
      }),
    };

    await expect(applyAgentExecutorLifecycleSettlementPlan({
      statusUpdater,
      plan: {
        action: 'no_status_change',
        sessionId: 'agent_session_1',
        summary: 'Executor lifecycle settlement / action=no_status_change',
      },
    })).resolves.toEqual({
      applied: false,
      summary: 'Executor lifecycle settlement / action=no_status_change / applied=no',
    });
    expect(statusUpdater.updateStatus).not.toHaveBeenCalled();

    await expect(applyAgentExecutorLifecycleSettlementPlan({
      statusUpdater,
      plan: {
        action: 'update_session_status',
        sessionId: 'agent_session_1',
        status: 'cancelled',
        summary: 'Executor lifecycle settlement / action=update_session_status',
      },
    })).resolves.toMatchObject({
      applied: true,
      session: {
        id: 'agent_session_1',
        status: 'cancelled',
      },
      summary: 'Executor lifecycle settlement / action=update_session_status / applied=yes',
    });
    expect(statusUpdater.updateStatus).toHaveBeenCalledWith('agent_session_1', 'cancelled');
  });
});
