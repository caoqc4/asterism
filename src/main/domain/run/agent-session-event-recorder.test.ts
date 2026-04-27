import { describe, expect, it, vi } from 'vitest';

import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';
import { AgentSessionEventRecorder } from './agent-session-event-recorder.js';

describe('AgentSessionEventRecorder', () => {
  it('records durable session start, plan, tool result, checkpoint, and terminal events with product titles', async () => {
    const runStepRepository = {
      create: vi.fn().mockImplementation(async (input: {
        runId: string;
        kind: RunStepKind;
        status?: RunStepStatus;
        title: string;
      }) => ({
        id: `run_step_${runStepRepository.create.mock.calls.length}`,
        ...input,
      })),
      update: vi.fn().mockImplementation(async (id: string, input: {
        status: RunStepStatus;
        output?: string | null;
        error?: string | null;
      }) => ({
        id,
        ...input,
      })),
    };
    const recorder = new AgentSessionEventRecorder(runStepRepository as never);

    await recorder.record({
      type: 'session.started',
      runId: 'run_1',
      taskId: 'task_1',
      mode: 'agent',
      capabilities: {
        fileContext: false,
        longRunningSessions: true,
        streaming: false,
        structuredToolCalls: false,
        taskMutationTools: true,
        textOnlyPlanning: false,
      },
    });
    await recorder.record({
      type: 'plan.proposed',
      runId: 'run_1',
      source: 'provider_tool_call',
      detail: '{"steps":[{"tool":"artifact.create_note"}]}',
      summary: '1. artifact.create_note',
    });
    await recorder.record({
      type: 'tool.started',
      runId: 'run_1',
      tool: 'artifact.create_note',
      input: { title: 'Note' },
    });
    await recorder.record({
      type: 'tool.completed',
      runId: 'run_1',
      tool: 'artifact.create_note',
      result: {
        success: true,
        summary: 'Created note',
        output: 'Note content',
      },
    });
    await recorder.record({
      type: 'checkpoint.created',
      runId: 'run_1',
      checkpointId: 'run_checkpoint_1',
      checkpointKind: 'tool_permission',
      reason: 'Confirm local note creation before continuing.',
      decisionId: 'decision_1',
      tool: 'artifact.create_note',
    });
    await recorder.record({
      type: 'session.completed',
      runId: 'run_1',
      output: 'Final output',
    });

    expect(runStepRepository.create).toHaveBeenCalledTimes(6);
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: 'plan',
        status: 'running',
        title: '开始 Agent session',
        output: 'mode=agent',
      }),
    );
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: 'plan',
        title: '采用模型提出的 agent 步骤计划',
        input: '{"steps":[{"tool":"artifact.create_note"}]}',
      }),
    );
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        kind: 'tool_call',
        status: 'running',
        title: 'Agent 工具开始：artifact.create_note',
        input: '{"title":"Note"}',
      }),
    );
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_3',
      {
        status: 'completed',
        output: 'Note content',
      },
    );
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        kind: 'tool_result',
        title: 'Agent 工具完成：artifact.create_note',
        output: 'Note content',
      }),
    );
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        kind: 'checkpoint',
        status: 'pending',
        title: '创建 Agent checkpoint：tool_permission',
        input: 'kind=tool_permission\ntool=artifact.create_note\ndecision=decision_1\ncheckpoint=run_checkpoint_1',
        output: 'Confirm local note creation before continuing.',
      }),
    );
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      6,
      expect.objectContaining({
        kind: 'final',
        title: '完成 Agent session',
        output: 'Final output',
      }),
    );
    expect(recorder.hasTerminalEvent()).toBe(true);
  });

  it('records heartbeat, interrupted, and cancelled session liveness events without replaying', async () => {
    const runStepRepository = {
      create: vi.fn().mockImplementation(async (input: {
        runId: string;
        kind: RunStepKind;
        status?: RunStepStatus;
        title: string;
      }) => ({
        id: `run_step_${runStepRepository.create.mock.calls.length}`,
        ...input,
      })),
      update: vi.fn(),
    };
    const recorder = new AgentSessionEventRecorder(runStepRepository as never);

    await recorder.record({
      type: 'session.heartbeat',
      runId: 'run_1',
      summary: 'Executor still active.',
    });

    expect(recorder.hasTerminalEvent()).toBe(false);
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'plan',
      status: 'running',
      title: 'Agent session 心跳',
      output: 'Executor still active.',
    }));

    await recorder.record({
      type: 'session.interrupted',
      runId: 'run_1',
      reason: 'Executor process exited.',
    });

    expect(recorder.hasTerminalEvent()).toBe(true);
    expect(runStepRepository.create).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'final',
      status: 'failed',
      title: 'Agent session 已中断',
      error: 'Executor process exited.',
    }));

    const cancelledRecorder = new AgentSessionEventRecorder(runStepRepository as never);
    await cancelledRecorder.record({
      type: 'session.cancelled',
      runId: 'run_2',
      reason: 'User cancelled.',
    });

    expect(cancelledRecorder.hasTerminalEvent()).toBe(true);
    expect(runStepRepository.create).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'final',
      status: 'failed',
      title: 'Agent session 已取消',
      error: 'User cancelled.',
    }));
  });

  it('marks a started tool step failed before recording the failed result event', async () => {
    const runStepRepository = {
      create: vi.fn().mockImplementation(async (input: {
        runId: string;
        kind: RunStepKind;
        status?: RunStepStatus;
        title: string;
      }) => ({
        id: `run_step_${runStepRepository.create.mock.calls.length}`,
        ...input,
      })),
      update: vi.fn().mockImplementation(async (id: string, input: {
        status: RunStepStatus;
        output?: string | null;
        error?: string | null;
      }) => ({
        id,
        ...input,
      })),
    };
    const recorder = new AgentSessionEventRecorder(runStepRepository as never);

    await recorder.record({
      type: 'tool.started',
      runId: 'run_1',
      tool: 'workspace.search',
      input: { query: 'missing' },
    });
    await recorder.record({
      type: 'tool.failed',
      runId: 'run_1',
      tool: 'workspace.search',
      error: 'Workspace search failed.',
      result: {
        error: 'Workspace search failed.',
        success: false,
        summary: 'Search failed',
      },
    });

    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      {
        error: 'Workspace search failed.',
        output: 'Search failed',
        status: 'failed',
      },
    );
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: 'tool_result',
        status: 'failed',
        title: 'Agent 工具失败：workspace.search',
        error: 'Workspace search failed.',
      }),
    );
  });
});
