import { describe, expect, it, vi } from 'vitest';

import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';
import { AgentToolRegistry } from './agent-tool-registry.js';

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
      error?: string | null;
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
        error: input.error ?? null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
    }),
    update: vi.fn().mockImplementation(async (id: string, input: {
      status: RunStepStatus;
      output?: string | null;
      error?: string | null;
    }) => ({
      id,
      runId: 'run_1',
      index: 1,
      kind: 'tool_call',
      status: input.status,
      title: '调用工具：artifact.create_note',
      input: null,
      output: input.output ?? null,
      error: input.error ?? null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
  };
}

describe('AgentToolRegistry', () => {
  it('creates a note artifact and writes tool call/result steps', async () => {
    const artifactRepository = {
      createNoteFromRun: vi.fn().mockResolvedValue({
        id: 'artifact_1',
        title: 'Agent note',
        content: 'Captured note',
      }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry(
      artifactRepository as never,
      runStepRepository as never,
    );

    const result = await registry.execute(
      'artifact.create_note',
      { title: 'Agent note', content: 'Captured note' },
      { runId: 'run_1', taskId: 'task_1' },
    );

    expect(result).toMatchObject({
      success: true,
      artifactId: 'artifact_1',
      output: 'Captured note',
    });
    expect(artifactRepository.createNoteFromRun).toHaveBeenCalledWith({
      taskId: 'task_1',
      runId: 'run_1',
      title: 'Agent note',
      content: 'Captured note',
    });
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: 'tool_call', status: 'running' }),
    );
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({ status: 'completed' }),
    );
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: 'tool_result', status: 'completed' }),
    );
  });

  it('records failed tool validation as tool result failure', async () => {
    const artifactRepository = {
      createNoteFromRun: vi.fn(),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry(
      artifactRepository as never,
      runStepRepository as never,
    );

    const result = await registry.execute(
      'artifact.create_note',
      { title: '', content: '' },
      { runId: 'run_1', taskId: 'task_1' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('artifact.create_note requires a title.');
    expect(artifactRepository.createNoteFromRun).not.toHaveBeenCalled();
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({
        status: 'failed',
        error: 'artifact.create_note requires a title.',
      }),
    );
    expect(runStepRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'tool_result', status: 'failed' }),
    );
  });
});
