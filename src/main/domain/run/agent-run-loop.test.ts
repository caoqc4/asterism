import { describe, expect, it, vi } from 'vitest';

import type { AgentRunRequest } from '../../../shared/types/agent-execution.js';
import { AgentRunLoop } from './agent-run-loop.js';

function buildRequest(): AgentRunRequest {
  return {
    runId: 'run_1',
    taskId: 'task_1',
    goal: 'Create a local note',
    mode: 'agent',
    context: {
      task: {
        id: 'task_1',
        title: 'Task 1',
        summary: null,
        state: 'running',
        nextStep: 'Draft note',
        riskLevel: 'none',
        riskNote: null,
      },
      priorityLane: 'continue_or_review',
      resumeSummary: 'Ready to continue.',
      completion: {
        total: 0,
        satisfied: 0,
        open: 0,
        nextOpenCriterion: null,
      },
      blockers: [],
      dependencies: [],
      sources: [],
      processTemplates: [],
      recentTimeline: [],
    },
    policy: {
      maxSteps: 8,
      maxWallTimeMs: 120_000,
      allowNetwork: false,
      allowLocalFileWrite: false,
      confirmationRequiredRisks: ['external_write', 'sensitive'],
    },
  };
}

describe('AgentRunLoop', () => {
  it('builds the fixed local note plan as typed steps', () => {
    const loop = new AgentRunLoop({ execute: vi.fn() } as never);

    expect(loop.buildLocalNotePlan({
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    })).toEqual([
      {
        kind: 'inspect_context',
        tool: 'task.inspect_context',
        input: {},
      },
      {
        kind: 'create_note',
        tool: 'artifact.create_note',
        input: {
          title: 'Task 1 agent note',
          content: 'Agent output',
        },
      },
    ]);
    expect(loop.buildLocalNotePlan({ modelOutput: '   ', taskTitle: 'Task 1' })).toEqual([]);
  });

  it('runs the fixed local observe-then-write loop', async () => {
    const agentToolRegistry = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          summary: 'Inspected context',
          output: 'Context summary',
        })
        .mockResolvedValueOnce({
          success: true,
          summary: 'Created note',
          output: 'Agent output',
          artifactId: 'artifact_1',
        }),
    };
    const loop = new AgentRunLoop(agentToolRegistry as never);

    const result = await loop.executeLocalNoteLoop({
      request: buildRequest(),
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    });

    expect(result).toEqual({
      status: 'completed',
      output: 'Agent output',
    });
    expect(agentToolRegistry.execute).toHaveBeenNthCalledWith(
      1,
      'task.inspect_context',
      {},
      expect.objectContaining({
        runId: 'run_1',
        taskId: 'task_1',
        workingContext: expect.objectContaining({
          task: expect.objectContaining({ title: 'Task 1' }),
        }),
      }),
      expect.objectContaining({ confirmationRequiredRisks: ['external_write', 'sensitive'] }),
    );
    expect(agentToolRegistry.execute).toHaveBeenNthCalledWith(
      2,
      'artifact.create_note',
      {
        title: 'Task 1 agent note',
        content: 'Agent output',
      },
      {
        runId: 'run_1',
        taskId: 'task_1',
        workingContext: undefined,
      },
      expect.objectContaining({ confirmationRequiredRisks: ['external_write', 'sensitive'] }),
    );
  });

  it('returns needs_confirmation when the write tool pauses', async () => {
    const agentToolRegistry = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          summary: 'Inspected context',
        })
        .mockResolvedValueOnce({
          success: false,
          status: 'needs_confirmation',
          summary: 'Needs confirmation',
          checkpointId: 'run_checkpoint_1',
        }),
    };
    const loop = new AgentRunLoop(agentToolRegistry as never);

    const result = await loop.executeLocalNoteLoop({
      request: buildRequest(),
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    });

    expect(result).toEqual({
      status: 'needs_confirmation',
      message: 'Needs confirmation',
      checkpointId: 'run_checkpoint_1',
    });
  });

  it('returns failed when inspection fails', async () => {
    const agentToolRegistry = {
      execute: vi.fn().mockResolvedValueOnce({
        success: false,
        summary: 'Inspection failed',
        error: 'Missing context',
      }),
    };
    const loop = new AgentRunLoop(agentToolRegistry as never);

    const result = await loop.executeLocalNoteLoop({
      request: buildRequest(),
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    });

    expect(result).toEqual({
      status: 'failed',
      message: 'Missing context',
    });
    expect(agentToolRegistry.execute).toHaveBeenCalledTimes(1);
  });
});
