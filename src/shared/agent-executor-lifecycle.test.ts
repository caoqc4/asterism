import { describe, expect, it } from 'vitest';

import {
  assertExecutorLifecycleControlSupported,
  buildExecutorLifecycleControlSupport,
  getExecutorLifecycleControlKey,
  isExecutorLifecycleControlSupported,
  listSupportedExecutorLifecycleControlRequests,
  mapExecutorLifecycleControlRequestToSignal,
  mapExecutorLifecycleSignalToRuntimeEvent,
  projectExecutorLifecycleSignalSessionStatus,
  type AgentExecutorSessionHandle,
} from './agent-executor-lifecycle.js';

function buildHandle(): AgentExecutorSessionHandle {
  return {
    executorSessionId: 'executor_session_1',
    runId: 'run_1',
    agentSessionId: 'agent_session_1',
    runtimeId: 'local_sandbox',
    profileId: 'manual_code_agent',
    startedAt: '2026-04-29T00:00:00.000Z',
    capabilities: {
      structuredToolCalls: false,
      textOnlyPlanning: true,
      streaming: false,
      fileContext: true,
      taskMutationTools: false,
      longRunningSessions: true,
    },
    control: {
      heartbeat: true,
      interrupt: true,
      cancel: true,
    },
  };
}

describe('agent executor lifecycle', () => {
  it('builds and lists executor lifecycle control support consistently', () => {
    expect(buildExecutorLifecycleControlSupport()).toEqual({
      heartbeat: true,
      interrupt: true,
      cancel: true,
    });
    expect(buildExecutorLifecycleControlSupport({
      cancel: false,
      interrupt: false,
    })).toEqual({
      heartbeat: true,
      interrupt: false,
      cancel: false,
    });
    expect(listSupportedExecutorLifecycleControlRequests(buildExecutorLifecycleControlSupport({
      cancel: false,
    }))).toEqual(['heartbeat', 'interrupt']);
  });

  it('maps control requests to handle control keys', () => {
    expect(getExecutorLifecycleControlKey({
      type: 'heartbeat',
      summary: 'Executor reports liveness.',
    })).toBe('heartbeat');
    expect(getExecutorLifecycleControlKey({
      type: 'interrupt',
      reason: 'Executor process stopped responding.',
    })).toBe('interrupt');
    expect(getExecutorLifecycleControlKey({
      type: 'cancel',
      reason: 'Operator cancelled the executor.',
    })).toBe('cancel');
  });

  it('fails closed when a handle does not support a control request', () => {
    const handle = buildHandle();

    expect(isExecutorLifecycleControlSupported({
      handle,
      request: {
        type: 'interrupt',
        reason: 'Executor process stopped responding.',
      },
    })).toBe(true);
    expect(() => assertExecutorLifecycleControlSupported({
      handle,
      request: {
        type: 'interrupt',
        reason: 'Executor process stopped responding.',
      },
    })).not.toThrow();

    const handleWithoutInterrupt = {
      ...handle,
      control: {
        ...handle.control,
        interrupt: false,
      },
    };

    expect(isExecutorLifecycleControlSupported({
      handle: handleWithoutInterrupt,
      request: {
        type: 'interrupt',
        reason: 'Executor process stopped responding.',
      },
    })).toBe(false);
    expect(() => assertExecutorLifecycleControlSupported({
      handle: handleWithoutInterrupt,
      request: {
        type: 'interrupt',
        reason: 'Executor process stopped responding.',
      },
    })).toThrow('Executor lifecycle control request interrupt is not supported by this handle.');
  });

  it('maps control requests into lifecycle signals without granting runtime execution', () => {
    expect(mapExecutorLifecycleControlRequestToSignal({
      type: 'heartbeat',
      summary: 'Executor reports liveness.',
      observedAt: '2026-04-30T00:01:00.000Z',
    })).toEqual({
      type: 'heartbeat',
      summary: 'Executor reports liveness.',
      observedAt: '2026-04-30T00:01:00.000Z',
    });
    expect(mapExecutorLifecycleControlRequestToSignal({
      type: 'interrupt',
      reason: 'Executor process stopped responding.',
    })).toEqual({
      type: 'interrupted',
      reason: 'Executor process stopped responding.',
      observedAt: undefined,
    });
    expect(mapExecutorLifecycleControlRequestToSignal({
      type: 'cancel',
      reason: 'Operator cancelled the executor.',
    })).toEqual({
      type: 'cancelled',
      reason: 'Operator cancelled the executor.',
      observedAt: undefined,
    });
  });

  it('maps heartbeat signals into non-terminal runtime evidence', () => {
    const handle = buildHandle();

    const event = mapExecutorLifecycleSignalToRuntimeEvent({
      handle,
      signal: {
        type: 'heartbeat',
        summary: 'Executor is still applying the bounded plan.',
        observedAt: '2026-04-29T00:01:00.000Z',
      },
    });

    expect(event).toEqual({
      type: 'session.heartbeat',
      runId: 'run_1',
      sessionId: 'agent_session_1',
      createdAt: '2026-04-29T00:01:00.000Z',
      summary: 'Executor is still applying the bounded plan.',
    });
    expect(projectExecutorLifecycleSignalSessionStatus({
      handle,
      signal: {
        type: 'heartbeat',
        summary: 'Executor is still applying the bounded plan.',
      },
    })).toBeNull();
  });

  it('maps interrupt and cancel control outcomes into terminal session statuses', () => {
    const handle = buildHandle();

    expect(mapExecutorLifecycleSignalToRuntimeEvent({
      handle,
      signal: {
        type: 'interrupted',
        reason: 'Executor process exited before final output.',
      },
    })).toMatchObject({
      type: 'session.interrupted',
      runId: 'run_1',
      sessionId: 'agent_session_1',
      reason: 'Executor process exited before final output.',
    });
    expect(projectExecutorLifecycleSignalSessionStatus({
      handle,
      signal: {
        type: 'interrupted',
        reason: 'Executor process exited before final output.',
      },
    })).toBe('failed');

    expect(mapExecutorLifecycleSignalToRuntimeEvent({
      handle,
      signal: {
        type: 'cancelled',
        reason: 'User cancelled the executor.',
      },
    })).toMatchObject({
      type: 'session.cancelled',
      runId: 'run_1',
      sessionId: 'agent_session_1',
      reason: 'User cancelled the executor.',
    });
    expect(projectExecutorLifecycleSignalSessionStatus({
      handle,
      signal: {
        type: 'cancelled',
        reason: 'User cancelled the executor.',
      },
    })).toBe('cancelled');
  });

  it.each([
    {
      signal: {
        type: 'settled' as const,
        status: 'completed' as const,
        output: 'Final output.',
      },
      event: {
        type: 'session.completed',
        output: 'Final output.',
      },
      status: 'completed',
    },
    {
      signal: {
        type: 'settled' as const,
        status: 'failed' as const,
        failureKind: 'executor',
        message: 'Executor failed.',
      },
      event: {
        type: 'session.failed',
        failureKind: 'executor',
        message: 'Executor failed.',
      },
      status: 'failed',
    },
    {
      signal: {
        type: 'settled' as const,
        status: 'paused' as const,
        checkpointId: 'run_checkpoint_1',
        message: 'Waiting for operator review.',
      },
      event: {
        type: 'session.paused',
        checkpointId: 'run_checkpoint_1',
        message: 'Waiting for operator review.',
      },
      status: 'paused',
    },
  ])('maps settled $signal.status signals through the runtime event spine', ({
    signal,
    event,
    status,
  }) => {
    const handle = buildHandle();

    expect(mapExecutorLifecycleSignalToRuntimeEvent({
      handle,
      signal,
    })).toMatchObject({
      ...event,
      runId: 'run_1',
      sessionId: 'agent_session_1',
    });
    expect(projectExecutorLifecycleSignalSessionStatus({
      handle,
      signal,
    })).toBe(status);
  });
});
