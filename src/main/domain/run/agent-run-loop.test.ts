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

function buildRunCheckpointRepositoryMock() {
  let checkpointCount = 0;

  return {
    create: vi.fn().mockImplementation(async (input: {
      runId: string;
      stepId?: string | null;
      kind: string;
      payload?: string | null;
    }) => {
      checkpointCount += 1;
      return {
        id: `run_checkpoint_${checkpointCount}`,
        runId: input.runId,
        stepId: input.stepId ?? null,
        kind: input.kind,
        status: 'open',
        payload: input.payload ?? null,
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
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
      allowLocalWorkspaceRead: false,
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
        kind: 'inspect_timeline',
        tool: 'task.inspect_timeline',
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
          { tool: 'task.inspect_timeline' },
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
        kind: 'inspect_timeline',
        tool: 'task.inspect_timeline',
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

  it('adds required read-only observations before a model-produced write step', () => {
    const loop = new AgentRunLoop({ execute: vi.fn() } as never);

    expect(loop.buildPlanFromProposal({
      proposal: {
        steps: [
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
        kind: 'inspect_timeline',
        tool: 'task.inspect_timeline',
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
        { tool: 'task.inspect_timeline' },
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
        { tool: 'task.inspect_timeline', input: undefined },
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

    expect(loop.buildPlanFromProposal({
      proposal: {
        steps: [
          { tool: 'task.inspect_context' },
          {
            tool: 'source_context.create',
            input: {
              title: 'Owner notes',
              kind: 'note',
              note: 'Use this source before drafting',
            },
          },
          {
            tool: 'artifact.create_note',
            input: {
              title: 'Source note',
              content: 'Source proposed',
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

    expect(loop.buildPlanFromProposal({
      proposal: {
        steps: [
          { tool: 'task.inspect_context' },
          {
            tool: 'decision.draft',
            input: {
              note: 'Need stakeholder sign-off',
            },
          },
          {
            tool: 'artifact.create_note',
            input: {
              title: 'Decision draft note',
              content: 'Decision draft proposed',
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

  it('accepts workspace read steps only when policy allows local workspace reads', () => {
    const loop = new AgentRunLoop({ execute: vi.fn() } as never);
    const proposal = {
      steps: [
        { tool: 'task.inspect_context' as const },
        {
          tool: 'workspace.search' as const,
          input: {
            query: 'AgentToolRegistry',
            maxResults: 3,
          },
        },
        {
          tool: 'workspace.read_file' as const,
          input: {
            path: 'src/main/domain/run/agent-tool-registry.ts',
          },
        },
        {
          tool: 'artifact.create_note' as const,
          input: {
            title: 'Workspace note',
            content: 'Workspace context reviewed',
          },
        },
      ],
    };

    expect(loop.buildPlanFromProposal({
      proposal,
      modelOutput: 'Agent output',
      policy: {
        ...buildRequest().policy,
        allowLocalWorkspaceRead: true,
      },
      taskTitle: 'Task 1',
    })).toEqual([
      {
        kind: 'inspect_context',
        tool: 'task.inspect_context',
        input: {},
      },
      {
        kind: 'inspect_timeline',
        tool: 'task.inspect_timeline',
        input: {},
      },
      {
        kind: 'workspace_search',
        tool: 'workspace.search',
        input: {
          query: 'AgentToolRegistry',
          maxResults: 3,
        },
      },
      {
        kind: 'workspace_read_file',
        tool: 'workspace.read_file',
        input: {
          path: 'src/main/domain/run/agent-tool-registry.ts',
        },
      },
      {
        kind: 'create_note',
        tool: 'artifact.create_note',
        input: {
          title: 'Workspace note',
          content: 'Workspace context reviewed',
        },
      },
    ]);

    expect(loop.buildPlanFromProposal({
      proposal,
      modelOutput: 'Agent output',
      policy: buildRequest().policy,
      taskTitle: 'Task 1',
    })).toEqual(loop.buildLocalNotePlan({
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    }));
  });

  it('does not accept model-produced workspace mutation or command steps in the normal run plan', () => {
    const loop = new AgentRunLoop({ execute: vi.fn() } as never);

    const proposal = {
      steps: [
        { tool: 'task.inspect_context' as const },
        {
          tool: 'workspace.write_patch' as const,
          input: {
            summary: 'Update notes',
            expectedFiles: ['notes.md'],
            patch: [
              '*** Begin Patch',
              '*** Update File: notes.md',
              '@@',
              '-alpha',
              '+beta',
              '*** End Patch',
            ].join('\n'),
          },
        },
        {
          tool: 'workspace.run_command' as const,
          input: {
            summary: 'Run tests',
            script: 'test',
          },
        },
        {
          tool: 'artifact.create_note' as const,
          input: {
            title: 'Workspace patch note',
            content: 'Patch proposed',
          },
        },
      ],
    };

    const fallbackPlan = loop.buildLocalNotePlan({
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    });

    expect(loop.buildPlanFromProposal({
      proposal,
      modelOutput: 'Agent output',
      policy: {
        ...buildRequest().policy,
        allowLocalFileWrite: true,
        allowLocalCommandRun: true,
        confirmationRequiredRisks: ['local_write'],
      },
      taskTitle: 'Task 1',
    })).toEqual(fallbackPlan);
    expect(loop.buildExecutionPlan({
      proposal,
      modelOutput: 'Agent output',
      policy: {
        ...buildRequest().policy,
        allowLocalFileWrite: true,
        allowLocalCommandRun: true,
        confirmationRequiredRisks: ['local_write'],
      },
      taskTitle: 'Task 1',
    }).source).toBe('fallback');
  });

  it('does not accept model-produced task mutation steps in the normal run plan', () => {
    const loop = new AgentRunLoop({ execute: vi.fn() } as never);
    const proposal = {
      steps: [
        { tool: 'task.inspect_context' as const },
        {
          tool: 'task.update_next_step' as const,
          input: {
            nextStep: 'Follow up with the owner',
          },
        },
        {
          tool: 'artifact.create_note' as const,
          input: {
            title: 'Next step note',
            content: 'Next step proposed',
          },
        },
      ],
    };

    expect(loop.buildPlanFromProposal({
      proposal,
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    })).toEqual(loop.buildLocalNotePlan({
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    }));

    expect(loop.buildPlanFromProposal({
      proposal: {
        steps: [
          { tool: 'task.inspect_context' },
          {
            tool: 'task.create_completion_criterion',
            input: {
              text: 'Owner has reviewed the final draft',
            },
          },
          {
            tool: 'artifact.create_note',
            input: {
              title: 'Completion note',
              content: 'Criterion proposed',
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
          { tool: 'task.inspect_timeline' },
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
          summary: 'Inspected timeline',
          output: 'Timeline summary',
        })
        .mockResolvedValueOnce({
          success: true,
          summary: 'Created note',
          output: 'Agent output',
          artifactId: 'artifact_1',
        }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const runCheckpointRepository = buildRunCheckpointRepositoryMock();
    const loop = new AgentRunLoop(
      agentToolRegistry as never,
      runStepRepository as never,
      runCheckpointRepository as never,
    );

    const result = await loop.executeLocalNoteLoop({
      request: buildRequest(),
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    });

    expect(result).toEqual({
      status: 'completed',
      output: 'Agent output',
      observations: [
        expect.objectContaining({
          tool: 'task.inspect_context',
          status: 'completed',
          summary: 'Inspected context',
          output: 'Context summary',
        }),
        expect.objectContaining({
          tool: 'task.inspect_timeline',
          status: 'completed',
          summary: 'Inspected timeline',
          output: 'Timeline summary',
        }),
        expect.objectContaining({
          tool: 'artifact.create_note',
          status: 'completed',
          summary: 'Created note',
          output: 'Agent output',
        }),
      ],
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'plan',
        title: '采用保守 fallback agent 步骤计划',
        output: '1. task.inspect_context\n2. task.inspect_timeline\n3. artifact.create_note',
      }),
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'decision',
        status: 'completed',
        title: '复核 agent 观察后继续执行',
        input: expect.stringContaining('"nextTool":"artifact.create_note"'),
        output: '已完成只读观察：task.inspect_context、task.inspect_timeline。继续执行：artifact.create_note。',
      }),
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'decision',
        status: 'completed',
        title: '汇总 agent 工具观察',
        input: expect.stringContaining('"tool":"task.inspect_context"'),
        output: expect.stringContaining('1. task.inspect_context [completed] Inspected context'),
      }),
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.stringContaining('3. artifact.create_note [completed] Created note'),
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
      'task.inspect_timeline',
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
      3,
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

  it('records an observation-aware planner decision before the first write tool', async () => {
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
          summary: 'Inspected timeline',
          output: 'Timeline summary',
        })
        .mockResolvedValueOnce({
          success: true,
          summary: 'Created note',
          output: 'Agent output',
        }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const runCheckpointRepository = buildRunCheckpointRepositoryMock();
    const loop = new AgentRunLoop(
      agentToolRegistry as never,
      runStepRepository as never,
      runCheckpointRepository as never,
    );

    await loop.executeLocalNoteLoop({
      request: buildRequest(),
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    });

    const plannerDecisionCallIndex = runStepRepository.create.mock.calls.findIndex(([input]) =>
      input.title === '复核 agent 观察后继续执行'
    );
    const observationSummaryCallIndex = runStepRepository.create.mock.calls.findIndex(([input]) =>
      input.title === '汇总 agent 工具观察'
    );

    expect(plannerDecisionCallIndex).toBeGreaterThan(-1);
    expect(observationSummaryCallIndex).toBeGreaterThan(plannerDecisionCallIndex);
    expect(agentToolRegistry.execute).toHaveBeenNthCalledWith(
      3,
      'artifact.create_note',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(runStepRepository.create.mock.calls[plannerDecisionCallIndex]?.[0]).toEqual(
      expect.objectContaining({
        input: expect.stringContaining('"tool":"task.inspect_context"'),
        output: expect.stringContaining('继续执行：artifact.create_note'),
      }),
    );
  });

  it('stops before local writes when observed context still has active blockers', async () => {
    const agentToolRegistry = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          summary: 'Inspected context',
          output: '阻塞项：Waiting on legal review',
        })
        .mockResolvedValueOnce({
          success: true,
          summary: 'Inspected timeline',
          output: 'Timeline summary',
        }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const runCheckpointRepository = buildRunCheckpointRepositoryMock();
    const loop = new AgentRunLoop(
      agentToolRegistry as never,
      runStepRepository as never,
      runCheckpointRepository as never,
    );
    const blockedRequest = buildRequest();
    blockedRequest.context.blockers = [
      {
        title: 'Waiting on legal review',
        detail: null,
        owner: 'Legal',
      },
    ];

    const result = await loop.executeLocalNoteLoop({
      request: blockedRequest,
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    });

    expect(result).toEqual({
      status: 'paused',
      message: '观察到任务仍有阻塞项：Waiting on legal review。暂停执行 artifact.create_note，等待先解除阻塞。',
      checkpointId: 'run_checkpoint_1',
      observations: [
        expect.objectContaining({ tool: 'task.inspect_context', status: 'completed' }),
        expect.objectContaining({ tool: 'task.inspect_timeline', status: 'completed' }),
      ],
    });
    expect(agentToolRegistry.execute).toHaveBeenCalledTimes(2);
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'decision',
        status: 'skipped',
        title: '复核 agent 观察后暂停写入',
        input: expect.stringContaining('"action":"stop"'),
        output: '观察到任务仍有阻塞项：Waiting on legal review。暂停执行 artifact.create_note，等待先解除阻塞。',
      }),
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'checkpoint',
        status: 'pending',
        title: '等待恢复 agent run',
        output: '观察到任务仍有阻塞项：Waiting on legal review。暂停执行 artifact.create_note，等待先解除阻塞。',
      }),
    );
    expect(runCheckpointRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        stepId: expect.stringMatching(/^run_step_/),
        kind: 'resume',
        payload: expect.stringContaining('"nextTool":"artifact.create_note"'),
      }),
    );
    expect(runCheckpointRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.stringContaining('"nextInput":{"title":"Task 1 agent note","content":"Agent output"}'),
      }),
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '汇总 agent 工具观察',
        output: expect.not.stringContaining('artifact.create_note'),
      }),
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
          summary: 'Inspected timeline',
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
          { tool: 'task.inspect_timeline' },
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
      observations: [
        expect.objectContaining({ tool: 'task.inspect_context', status: 'completed' }),
        expect.objectContaining({ tool: 'task.inspect_timeline', status: 'completed' }),
        expect.objectContaining({ tool: 'artifact.create_note', status: 'completed' }),
      ],
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'plan',
        title: '采用模型提出的 agent 步骤计划',
        input: expect.stringContaining('"finalOutput":"Final content"'),
        output: '1. task.inspect_context\n2. task.inspect_timeline\n3. artifact.create_note',
      }),
    );
    expect(agentToolRegistry.execute).toHaveBeenNthCalledWith(
      3,
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

  it('runs policy-enabled workspace reads before a model-produced local note', async () => {
    const agentToolRegistry = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          summary: 'Inspected context',
        })
        .mockResolvedValueOnce({
          success: true,
          summary: 'Inspected timeline',
        })
        .mockResolvedValueOnce({
          success: true,
          summary: 'Searched workspace',
          output: 'src/main/domain/run/agent-tool-registry.ts: class AgentToolRegistry',
        })
        .mockResolvedValueOnce({
          success: true,
          summary: 'Read file',
          output: 'export class AgentToolRegistry {}',
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
    const request: AgentRunRequest = {
      ...buildRequest(),
      policy: {
        ...buildRequest().policy,
        allowLocalWorkspaceRead: true,
      },
    };

    const result = await loop.executeLocalNoteLoop({
      request,
      modelOutput: JSON.stringify({
        finalOutput: 'Final content',
        steps: [
          { tool: 'task.inspect_context' },
          {
            tool: 'workspace.search',
            input: {
              query: 'AgentToolRegistry',
              maxResults: 1,
            },
          },
          {
            tool: 'workspace.read_file',
            input: {
              path: 'src/main/domain/run/agent-tool-registry.ts',
            },
          },
          {
            tool: 'artifact.create_note',
            input: {
              title: 'Workspace note',
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
      observations: [
        expect.objectContaining({ tool: 'task.inspect_context', status: 'completed' }),
        expect.objectContaining({ tool: 'task.inspect_timeline', status: 'completed' }),
        expect.objectContaining({ tool: 'workspace.search', status: 'completed' }),
        expect.objectContaining({ tool: 'workspace.read_file', status: 'completed' }),
        expect.objectContaining({ tool: 'artifact.create_note', status: 'completed' }),
      ],
    });
    expect(agentToolRegistry.execute).toHaveBeenNthCalledWith(
      2,
      'task.inspect_timeline',
      {},
      expect.any(Object),
      request.policy,
    );
    expect(agentToolRegistry.execute).toHaveBeenNthCalledWith(
      3,
      'workspace.search',
      {
        query: 'AgentToolRegistry',
        maxResults: 1,
      },
      expect.any(Object),
      request.policy,
    );
    expect(agentToolRegistry.execute).toHaveBeenNthCalledWith(
      4,
      'workspace.read_file',
      {
        path: 'src/main/domain/run/agent-tool-registry.ts',
      },
      expect.any(Object),
      request.policy,
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
          success: true,
          summary: 'Inspected timeline',
        })
        .mockResolvedValueOnce({
          success: false,
          status: 'needs_confirmation',
          summary: 'Needs confirmation',
          checkpointId: 'run_checkpoint_1',
        }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const loop = new AgentRunLoop(
      agentToolRegistry as never,
      runStepRepository as never,
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
      observations: [
        expect.objectContaining({ tool: 'task.inspect_context', status: 'completed' }),
        expect.objectContaining({ tool: 'task.inspect_timeline', status: 'completed' }),
        expect.objectContaining({
          tool: 'artifact.create_note',
          status: 'needs_confirmation',
          checkpointId: 'run_checkpoint_1',
        }),
      ],
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'decision',
        status: 'pending',
        title: '汇总 agent 工具观察',
        input: expect.stringContaining('"checkpointId":"run_checkpoint_1"'),
        output: expect.stringContaining('artifact.create_note [needs_confirmation] Needs confirmation；checkpoint=run_checkpoint_1'),
      }),
    );
  });

  it('returns failed when inspection fails', async () => {
    const agentToolRegistry = {
      execute: vi.fn().mockResolvedValueOnce({
        success: false,
        summary: 'Inspection failed',
        error: 'Missing context',
      }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const loop = new AgentRunLoop(
      agentToolRegistry as never,
      runStepRepository as never,
    );

    const result = await loop.executeLocalNoteLoop({
      request: buildRequest(),
      modelOutput: 'Agent output',
      taskTitle: 'Task 1',
    });

    expect(result).toEqual({
      status: 'failed',
      message: 'Missing context',
      observations: [
        expect.objectContaining({
          tool: 'task.inspect_context',
          status: 'failed',
          error: 'Missing context',
        }),
      ],
    });
    expect(agentToolRegistry.execute).toHaveBeenCalledTimes(1);
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'decision',
        status: 'failed',
        title: '汇总 agent 工具观察',
        input: expect.stringContaining('"error":"Missing context"'),
        output: '1. task.inspect_context [failed] Inspection failed；error=Missing context',
      }),
    );
  });
});
