import { describe, expect, it, vi } from 'vitest';

import type { AgentRunRequest } from '../../../shared/types/agent-execution.js';
import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';
import { AgentRunLoop } from './agent-run-loop.js';

function buildRunStepRepositoryMock() {
  let stepCount = 0;

  return {
    create: vi.fn().mockImplementation(async (input: {
      runId: string;
      kind: RunStepKind;
      status?: RunStepStatus;
      title: string;
      input?: string | null;
      output?: string | null;
    }) => {
      stepCount += 1;
      return {
        id: `run_step_${stepCount}`,
        runId: input.runId,
        index: stepCount,
        kind: input.kind,
        status: input.status ?? 'completed',
        title: input.title,
        input: input.input ?? null,
        output: input.output ?? null,
        error: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
    }),
  };
}

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

  it('accepts a constrained model-produced step proposal', () => {
    const loop = new AgentRunLoop({ execute: vi.fn() } as never);

    expect(loop.buildPlanFromProposal({
      proposal: {
        steps: [
          { tool: 'task.inspect_context' },
          {
            tool: 'artifact.create_note',
            input: {
              title: 'Custom note',
              content: 'Custom content',
            },
          },
        ],
      },
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
          title: 'Custom note',
          content: 'Custom content',
        },
      },
    ]);
  });

  it('extracts a model-produced JSON proposal', () => {
    const loop = new AgentRunLoop({ execute: vi.fn() } as never);

    expect(loop.extractStepProposal(JSON.stringify({
      finalOutput: 'Final content',
      steps: [
        { tool: 'task.inspect_context' },
        {
          tool: 'artifact.create_note',
          input: {
            title: 'Proposed note',
            content: 'Final content',
          },
        },
      ],
    }))).toEqual({
      finalOutput: 'Final content',
      steps: [
        { tool: 'task.inspect_context', input: undefined },
        {
          tool: 'artifact.create_note',
          input: {
            title: 'Proposed note',
            content: 'Final content',
          },
        },
      ],
    });
    expect(loop.extractStepProposal('plain model output')).toBeNull();
  });

  it('falls back to the fixed plan when a proposal is incomplete', () => {
    const loop = new AgentRunLoop({ execute: vi.fn() } as never);

    expect(loop.buildPlanFromProposal({
      proposal: {
        steps: [{ tool: 'task.inspect_context' }],
      },
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    })).toEqual(loop.buildLocalNotePlan({
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    }));
    expect(loop.buildPlanFromProposal({
      proposal: {
        steps: [
          {
            tool: 'artifact.create_note',
            input: {
              title: '',
              content: 'Custom content',
            },
          },
        ],
      },
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    })).toEqual(loop.buildLocalNotePlan({
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    }));
  });

  it('labels execution plans by source', () => {
    const loop = new AgentRunLoop({ execute: vi.fn() } as never);

    expect(loop.buildExecutionPlan({
      proposal: null,
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    }).source).toBe('fallback');
    expect(loop.buildExecutionPlan({
      proposal: {
        steps: [
          { tool: 'task.inspect_context' },
          {
            tool: 'artifact.create_note',
            input: {
              title: 'Custom note',
              content: 'Custom content',
            },
          },
        ],
      },
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    }).source).toBe('model_proposal');
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
    const runStepRepository = buildRunStepRepositoryMock();
    const loop = new AgentRunLoop(agentToolRegistry as never, runStepRepository as never);

    const result = await loop.executeLocalNoteLoop({
      request: buildRequest(),
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    });

    expect(result).toEqual({
      status: 'completed',
      output: 'Agent output',
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'plan',
        title: '采用保守 fallback agent 步骤计划',
        output: '1. task.inspect_context\n2. artifact.create_note',
      }),
    );
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

  it('runs a valid model-produced proposal with final output', async () => {
    const agentToolRegistry = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          summary: 'Inspected context',
        })
        .mockResolvedValueOnce({
          success: true,
          summary: 'Created note',
          output: 'Final content',
          artifactId: 'artifact_1',
        }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const loop = new AgentRunLoop(agentToolRegistry as never, runStepRepository as never);

    const result = await loop.executeLocalNoteLoop({
      request: buildRequest(),
      modelOutput: JSON.stringify({
        finalOutput: 'Final content',
        steps: [
          { tool: 'task.inspect_context' },
          {
            tool: 'artifact.create_note',
            input: {
              title: 'Proposed note',
              content: 'Final content',
            },
          },
        ],
      }),
      taskTitle: 'Task 1',
    });

    expect(result).toEqual({
      status: 'completed',
      output: 'Final content',
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'plan',
        title: '采用模型提出的 agent 步骤计划',
        input: expect.stringContaining('"finalOutput":"Final content"'),
        output: '1. task.inspect_context\n2. artifact.create_note',
      }),
    );
    expect(agentToolRegistry.execute).toHaveBeenNthCalledWith(
      2,
      'artifact.create_note',
      {
        title: 'Proposed note',
        content: 'Final content',
      },
      expect.objectContaining({
        runId: 'run_1',
        taskId: 'task_1',
      }),
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
    const loop = new AgentRunLoop(
      agentToolRegistry as never,
      buildRunStepRepositoryMock() as never,
    );

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
    const loop = new AgentRunLoop(
      agentToolRegistry as never,
      buildRunStepRepositoryMock() as never,
    );

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
