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

    expect(runStepRepository.create).toHaveBeenCalledTimes(5);
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
        kind: 'tool_result',
        title: 'Agent 工具完成：artifact.create_note',
        output: 'Note content',
      }),
    );
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        kind: 'checkpoint',
        status: 'pending',
        title: '创建 Agent checkpoint：tool_permission',
        input: 'kind=tool_permission\ntool=artifact.create_note\ndecision=decision_1\ncheckpoint=run_checkpoint_1',
        output: 'Confirm local note creation before continuing.',
      }),
    );
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        kind: 'final',
        title: '完成 Agent session',
        output: 'Final output',
      }),
    );
    expect(recorder.hasTerminalEvent()).toBe(true);
  });
});
