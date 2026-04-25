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
});
