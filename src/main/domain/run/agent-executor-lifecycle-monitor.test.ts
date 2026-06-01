import { describe, expect, it, vi } from 'vitest';

import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';
import { DryRunAgentExecutorLifecycleAdapter } from './agent-executor.js';
import {
  AgentExecutorLifecycleMonitor,
  applyAgentExecutorLifecycleSettlementPlan,
  buildAgentExecutorLifecycleSettlementDiagnostic,
} from './agent-executor-lifecycle-monitor.js';
import { AgentSessionEventRecorder } from './agent-session-event-recorder.js';
import type {
  AgentExecutorLifecycleAdapter,
  AgentExecutorLifecycleObserveInput,
  AgentExecutorLifecycleStartInput,
} from './agent-executor.js';

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
        terminalEventRecorded: false,
        terminalSessionStatus: null,
      },
      settlementDiagnostic: {
        action: 'no_status_change',
        autoReplay: false,
        sessionId: 'agent_session_1',
        status: null,
        terminalEventRecorded: false,
        terminalSessionStatus: null,
      },
    });
    expect(buildAgentExecutorLifecycleSettlementDiagnostic(observation.settlementPlan)).toEqual({
      action: 'no_status_change',
      autoReplay: false,
      sessionId: 'agent_session_1',
      status: null,
      summary: [
        'Executor lifecycle settlement',
        'session=agent_session_1',
        'action=no_status_change',
        'reason=no_projected_status',
        'autoReplay=no',
      ].join(' / '),
      terminalEventRecorded: false,
      terminalSessionStatus: null,
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
        terminalEventRecorded: true,
        terminalSessionStatus: 'cancelled',
      },
      settlementDiagnostic: {
        action: 'update_session_status',
        autoReplay: false,
        sessionId: 'agent_session_1',
        status: 'cancelled',
        terminalEventRecorded: true,
        terminalSessionStatus: 'cancelled',
      },
    });
    expect(buildAgentExecutorLifecycleSettlementDiagnostic(observation.settlementPlan)).toEqual({
      action: 'update_session_status',
      autoReplay: false,
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
      terminalEventRecorded: true,
      terminalSessionStatus: 'cancelled',
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'final',
      status: 'failed',
      title: 'Agent session 已取消',
      error: 'Operator cancelled the dry-run executor.',
    }));
  });

  it('keeps terminal observations scoped when one monitor handles multiple sessions', async () => {
    const runStepRepository = buildRunStepRepositoryMock();
    const monitor = new AgentExecutorLifecycleMonitor(
      new DryRunAgentExecutorLifecycleAdapter(),
      new AgentSessionEventRecorder(runStepRepository as never),
    );
    const cancelledHandle = await monitor.startSession({
      runId: 'run_1',
      agentSessionId: 'agent_session_1',
      runtimeId: 'local_sandbox',
      profileId: 'manual_code_agent',
      nowIso: '2026-04-29T00:00:00.000Z',
      capabilities: buildCapabilities(),
    });
    const heartbeatHandle = await monitor.startSession({
      runId: 'run_2',
      agentSessionId: 'agent_session_2',
      runtimeId: 'local_sandbox',
      profileId: 'manual_code_agent',
      nowIso: '2026-04-29T00:01:00.000Z',
      capabilities: buildCapabilities(),
    });

    await monitor.observeAndPlan({
      handle: cancelledHandle,
      signal: {
        type: 'cancelled',
        reason: 'First dry-run session was cancelled.',
      },
    });
    const heartbeatObservation = await monitor.observeAndPlan({
      handle: heartbeatHandle,
      signal: {
        type: 'heartbeat',
        summary: 'Second dry-run session is alive.',
      },
    });

    expect(heartbeatObservation).toMatchObject({
      projectedStatus: null,
      terminalEventRecorded: false,
      terminalSessionStatus: null,
      settlementPlan: {
        action: 'no_status_change',
        sessionId: 'agent_session_2',
      },
      settlementDiagnostic: {
        action: 'no_status_change',
        sessionId: 'agent_session_2',
        status: null,
      },
    });
  });

  it('scopes lifecycle adapter events to the current handle when events omit session id', async () => {
    const runStepRepository = buildRunStepRepositoryMock();
    const adapter: AgentExecutorLifecycleAdapter = {
      startSession: vi.fn().mockImplementation(async (input: AgentExecutorLifecycleStartInput) => ({
        executorSessionId: `adapter:${input.agentSessionId}`,
        runId: input.runId,
        agentSessionId: input.agentSessionId,
        runtimeId: input.runtimeId,
        profileId: input.profileId,
        startedAt: input.nowIso ?? '2026-04-29T00:00:00.000Z',
        capabilities: input.capabilities,
        control: {
          cancel: true,
          heartbeat: true,
          interrupt: true,
        },
      })),
      observe: vi.fn().mockImplementation(async (input: AgentExecutorLifecycleObserveInput) => {
        const event = {
          type: 'session.cancelled' as const,
          runId: input.handle.runId,
          reason: 'Adapter omitted session id.',
        };
        await input.onEvent?.(event);

        return {
          event,
          projectedStatus: 'cancelled' as const,
        };
      }),
      control: vi.fn(),
      settle: vi.fn(),
    };
    const monitor = new AgentExecutorLifecycleMonitor(
      adapter,
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
        reason: 'Adapter omitted session id.',
      },
    });

    expect(observation).toMatchObject({
      projectedStatus: 'cancelled',
      terminalEventRecorded: true,
      terminalSessionStatus: 'cancelled',
      settlementPlan: {
        action: 'update_session_status',
        sessionId: 'agent_session_1',
        status: 'cancelled',
      },
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'final',
      status: 'failed',
      title: 'Agent session 已取消',
      error: 'Adapter omitted session id.',
    }));
  });

  it('records settle results as planned terminal observations without applying status updates', async () => {
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

    const observation = await monitor.settleAndPlan({
      handle,
      result: {
        status: 'completed',
        output: 'Dry-run executor completed.',
      },
    });

    expect(observation).toMatchObject({
      projectedStatus: 'completed',
      terminalEventRecorded: true,
      terminalSessionStatus: 'completed',
      recordedStep: {
        kind: 'final',
        status: 'completed',
        title: '完成 Agent session',
        output: 'Dry-run executor completed.',
      },
      settlementPlan: {
        action: 'update_session_status',
        sessionId: 'agent_session_1',
        status: 'completed',
      },
      settlementDiagnostic: {
        action: 'update_session_status',
        autoReplay: false,
        sessionId: 'agent_session_1',
        status: 'completed',
      },
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'final',
      status: 'completed',
      title: '完成 Agent session',
      output: 'Dry-run executor completed.',
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
      settlementDiagnostic: {
        action: 'update_session_status',
        autoReplay: false,
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
        terminalEventRecorded: false,
        terminalSessionStatus: null,
      },
    })).resolves.toEqual({
      action: 'no_status_change',
      applied: false,
      autoReplay: false,
      sessionId: 'agent_session_1',
      status: null,
      summary: 'Executor lifecycle settlement / action=no_status_change / applied=no',
      terminalEventRecorded: false,
      terminalSessionStatus: null,
    });
    expect(statusUpdater.updateStatus).not.toHaveBeenCalled();

    await expect(applyAgentExecutorLifecycleSettlementPlan({
      statusUpdater,
      plan: {
        action: 'update_session_status',
        sessionId: 'agent_session_1',
        status: 'cancelled',
        summary: 'Executor lifecycle settlement / action=update_session_status',
        terminalEventRecorded: true,
        terminalSessionStatus: 'cancelled',
      },
    })).resolves.toMatchObject({
      action: 'update_session_status',
      applied: true,
      autoReplay: false,
      session: {
        id: 'agent_session_1',
        status: 'cancelled',
      },
      sessionId: 'agent_session_1',
      status: 'cancelled',
      summary: 'Executor lifecycle settlement / action=update_session_status / applied=yes',
      terminalEventRecorded: true,
      terminalSessionStatus: 'cancelled',
    });
    expect(statusUpdater.updateStatus).toHaveBeenCalledWith('agent_session_1', 'cancelled');
  });
});
