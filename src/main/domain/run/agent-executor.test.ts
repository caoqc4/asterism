import { describe, expect, it, vi } from 'vitest';

import { DryRunAgentExecutorLifecycleAdapter, LocalAgentExecutor } from './agent-executor.js';

function buildInput() {
  return {
    request: {
      runId: 'run_1',
      taskId: 'task_1',
      goal: 'Create note',
      mode: 'agent',
      context: {},
      policy: {},
    },
    modelOutput: 'Model output',
    taskTitle: 'Task 1',
  };
}

describe('LocalAgentExecutor', () => {
  it('delegates local note sessions to the current agent run loop', async () => {
    const agentRunLoop = {
      executeLocalNoteLoop: vi.fn().mockResolvedValue({
        status: 'completed',
        output: 'Created note',
        observations: [],
      }),
    };
    const executor = new LocalAgentExecutor(agentRunLoop as never);
    const input = buildInput();

    const result = await executor.executeLocalNoteSession(input as never);

    expect(agentRunLoop.executeLocalNoteLoop).toHaveBeenCalledWith(input);
    expect(result).toEqual({
      status: 'completed',
      output: 'Created note',
    });
  });

  it('normalizes failed loop results into session failures', async () => {
    const agentRunLoop = {
      executeLocalNoteLoop: vi.fn().mockResolvedValue({
        status: 'failed',
        message: 'Tool failed',
        observations: [],
      }),
    };
    const executor = new LocalAgentExecutor(agentRunLoop as never);

    const result = await executor.executeLocalNoteSession(buildInput() as never);

    expect(result).toEqual({
      status: 'failed',
      failureKind: 'tool',
      message: 'Tool failed',
    });
  });

  it('delegates provider-native sessions through the same local run loop with the normalized proposal', async () => {
    const agentRunLoop = {
      executeLocalNoteLoop: vi.fn().mockResolvedValue({
        status: 'completed',
        output: 'Provider native note',
        observations: [],
      }),
    };
    const executor = new LocalAgentExecutor(agentRunLoop as never);
    const input = {
      ...buildInput(),
      modelOutput: 'Fallback text output',
      providerPlan: {
        source: 'provider_tool_call',
        provider: 'openai-compatible',
        model: 'relay-model',
        rawSummary: 'tool_calls=1',
        providerCallIds: ['call_1'],
        stopReason: 'tool_calls',
        proposal: {
          finalOutput: 'Provider native note',
          steps: [
            {
              tool: 'artifact.create_note',
              input: {
                title: 'Provider note',
                content: 'Provider native note',
              },
            },
          ],
        },
      },
    };

    const result = await executor.executeProviderNativeSession(input as never);

    expect(agentRunLoop.executeLocalNoteLoop).toHaveBeenCalledWith({
      onEvent: undefined,
      request: input.request,
      modelOutput: 'Fallback text output',
      proposal: input.providerPlan.proposal,
      proposalSource: 'provider_tool_call',
      recordPlanRunStep: undefined,
      taskTitle: 'Task 1',
    });
    expect(result).toEqual({
      status: 'completed',
      output: 'Provider native note',
    });
  });

  it.each([
    {
      loopResult: {
        status: 'failed',
        message: 'Provider proposal tool failed',
        observations: [],
      },
      sessionResult: {
        status: 'failed',
        failureKind: 'tool',
        message: 'Provider proposal tool failed',
      },
    },
    {
      loopResult: {
        status: 'paused',
        checkpointId: 'checkpoint_1',
        message: 'Provider proposal paused',
        observations: [],
      },
      sessionResult: {
        status: 'paused',
        checkpointId: 'checkpoint_1',
        message: 'Provider proposal paused',
      },
    },
    {
      loopResult: {
        status: 'needs_confirmation',
        checkpointId: 'checkpoint_2',
        message: 'Provider proposal needs confirmation',
        observations: [],
      },
      sessionResult: {
        status: 'needs_confirmation',
        checkpointId: 'checkpoint_2',
        message: 'Provider proposal needs confirmation',
      },
    },
  ])('normalizes provider-native loop result $loopResult.status into a session result', async ({
    loopResult,
    sessionResult,
  }) => {
    const agentRunLoop = {
      executeLocalNoteLoop: vi.fn().mockResolvedValue(loopResult),
    };
    const executor = new LocalAgentExecutor(agentRunLoop as never);

    await expect(executor.executeProviderNativeSession({
      ...buildInput(),
      providerPlan: {
        source: 'provider_tool_call',
        provider: 'openai-compatible',
        model: 'relay-model',
        rawSummary: 'tool_calls=1',
        providerCallIds: ['call_1'],
        proposal: {
          steps: [
            {
              tool: 'artifact.create_note',
              input: {
                title: 'Provider note',
                content: 'Provider native note',
              },
            },
          ],
        },
      },
    } as never)).resolves.toEqual(sessionResult);
  });
});

describe('DryRunAgentExecutorLifecycleAdapter', () => {
  it('starts a controllable dry-run handle without launching a real executor', async () => {
    const adapter = new DryRunAgentExecutorLifecycleAdapter();

    const handle = await adapter.startSession({
      runId: 'run_1',
      agentSessionId: 'agent_session_1',
      runtimeId: 'local_sandbox',
      profileId: 'manual_code_agent',
      nowIso: '2026-04-29T00:00:00.000Z',
      capabilities: {
        structuredToolCalls: false,
        textOnlyPlanning: true,
        streaming: false,
        fileContext: true,
        taskMutationTools: false,
        longRunningSessions: true,
      },
    });

    expect(handle).toEqual({
      executorSessionId: 'dry-run:agent_session_1',
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
    });
  });

  it('can start a dry-run handle with explicit limited control support', async () => {
    const adapter = new DryRunAgentExecutorLifecycleAdapter();

    const handle = await adapter.startSession({
      runId: 'run_1',
      agentSessionId: 'agent_session_1',
      runtimeId: 'local_sandbox',
      profileId: 'manual_code_agent',
      nowIso: '2026-04-30T00:00:00.000Z',
      capabilities: {
        structuredToolCalls: false,
        textOnlyPlanning: true,
        streaming: false,
        fileContext: true,
        taskMutationTools: false,
        longRunningSessions: true,
      },
      controlSupport: {
        cancel: false,
        interrupt: false,
      },
    });

    expect(handle.control).toEqual({
      heartbeat: true,
      interrupt: false,
      cancel: false,
    });
  });

  it('observes lifecycle signals through the runtime event spine', async () => {
    const adapter = new DryRunAgentExecutorLifecycleAdapter();
    const onEvent = vi.fn();
    const handle = await adapter.startSession({
      runId: 'run_1',
      agentSessionId: 'agent_session_1',
      runtimeId: 'local_sandbox',
      profileId: 'manual_code_agent',
      nowIso: '2026-04-29T00:00:00.000Z',
      capabilities: {
        structuredToolCalls: false,
        textOnlyPlanning: true,
        streaming: false,
        fileContext: true,
        taskMutationTools: false,
        longRunningSessions: true,
      },
    });

    await expect(adapter.observe({
      handle,
      onEvent,
      signal: {
        type: 'heartbeat',
        summary: 'Dry-run executor is still alive.',
      },
    })).resolves.toMatchObject({
      event: {
        type: 'session.heartbeat',
        runId: 'run_1',
        sessionId: 'agent_session_1',
        summary: 'Dry-run executor is still alive.',
      },
      projectedStatus: null,
    });

    await expect(adapter.observe({
      handle,
      onEvent,
      signal: {
        type: 'cancelled',
        reason: 'Operator cancelled the dry-run executor.',
      },
    })).resolves.toMatchObject({
      event: {
        type: 'session.cancelled',
        runId: 'run_1',
        sessionId: 'agent_session_1',
        reason: 'Operator cancelled the dry-run executor.',
      },
      projectedStatus: 'cancelled',
    });
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('maps typed control requests through the dry-run lifecycle spine', async () => {
    const adapter = new DryRunAgentExecutorLifecycleAdapter();
    const onEvent = vi.fn();
    const handle = await adapter.startSession({
      runId: 'run_1',
      agentSessionId: 'agent_session_1',
      runtimeId: 'local_sandbox',
      profileId: 'manual_code_agent',
      nowIso: '2026-04-30T00:00:00.000Z',
      capabilities: {
        structuredToolCalls: false,
        textOnlyPlanning: true,
        streaming: false,
        fileContext: true,
        taskMutationTools: false,
        longRunningSessions: true,
      },
    });

    await expect(adapter.control({
      handle,
      onEvent,
      request: {
        type: 'interrupt',
        reason: 'Dry-run executor stopped responding.',
      },
    })).resolves.toMatchObject({
      event: {
        type: 'session.interrupted',
        runId: 'run_1',
        sessionId: 'agent_session_1',
        reason: 'Dry-run executor stopped responding.',
      },
      projectedStatus: 'failed',
    });
    await expect(adapter.control({
      handle,
      onEvent,
      request: {
        type: 'cancel',
        reason: 'Operator cancelled dry-run executor control.',
      },
    })).resolves.toMatchObject({
      event: {
        type: 'session.cancelled',
        runId: 'run_1',
        sessionId: 'agent_session_1',
        reason: 'Operator cancelled dry-run executor control.',
      },
      projectedStatus: 'cancelled',
    });
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('rejects unsupported lifecycle control requests without recording an event', async () => {
    const adapter = new DryRunAgentExecutorLifecycleAdapter();
    const onEvent = vi.fn();
    const handle = await adapter.startSession({
      runId: 'run_1',
      agentSessionId: 'agent_session_1',
      runtimeId: 'local_sandbox',
      profileId: 'manual_code_agent',
      nowIso: '2026-04-30T00:00:00.000Z',
      capabilities: {
        structuredToolCalls: false,
        textOnlyPlanning: true,
        streaming: false,
        fileContext: true,
        taskMutationTools: false,
        longRunningSessions: true,
      },
    });

    await expect(adapter.control({
      handle: {
        ...handle,
        control: {
          ...handle.control,
          cancel: false,
        },
      },
      onEvent,
      request: {
        type: 'cancel',
        reason: 'Operator attempted unsupported cancel.',
      },
    })).rejects.toThrow(
      'Executor lifecycle control request cancel is not supported by this handle.',
    );
    expect(onEvent).not.toHaveBeenCalled();
  });
});
