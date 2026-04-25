import { describe, expect, it, vi } from 'vitest';

import { LocalAgentExecutor } from './agent-executor.js';

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
