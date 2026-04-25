import { describe, expect, it, vi } from 'vitest';

import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';
import { AgentSessionEventRecorder } from './agent-session-event-recorder.js';

describe('AgentSessionEventRecorder', () => {
  it('records durable plan, tool result, and terminal events with product titles', async () => {
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
      type: 'session.completed',
      runId: 'run_1',
      output: 'Final output',
    });

    expect(runStepRepository.create).toHaveBeenCalledTimes(3);
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: 'plan',
        title: '采用模型提出的 agent 步骤计划',
        input: '{"steps":[{"tool":"artifact.create_note"}]}',
      }),
    );
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: 'tool_result',
        title: 'Agent 工具完成：artifact.create_note',
        output: 'Note content',
      }),
    );
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        kind: 'final',
        title: '完成 Agent session',
        output: 'Final output',
      }),
    );
    expect(recorder.hasTerminalEvent()).toBe(true);
  });
});
