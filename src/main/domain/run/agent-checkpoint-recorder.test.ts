import { describe, expect, it, vi } from 'vitest';

import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';
import { AgentCheckpointRecorder } from './agent-checkpoint-recorder.js';

function buildRunStepRepositoryMock() {
  let stepCount = 0;

  return {
    update: vi.fn().mockResolvedValue({ id: 'run_step_1' }),
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
        id: `run_step_${stepCount + 1}`,
        ...input,
      };
    }),
  };
}

function buildRunCheckpointRepositoryMock() {
  return {
    create: vi.fn().mockResolvedValue({
      id: 'run_checkpoint_1',
      runId: 'run_1',
      stepId: 'run_step_1',
      kind: 'tool_permission',
      status: 'open',
      payload: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      resolvedAt: null,
    }),
    updatePayload: vi.fn().mockResolvedValue({
      id: 'run_checkpoint_1',
      runId: 'run_1',
      stepId: 'run_step_1',
      kind: 'tool_permission',
      status: 'open',
      payload: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      resolvedAt: null,
    }),
  };
}

describe('AgentCheckpointRecorder', () => {
  it('creates a Decision-linked tool-permission checkpoint and pending run step', async () => {
    const runCheckpointRepository = buildRunCheckpointRepositoryMock();
    const runStepRepository = buildRunStepRepositoryMock();
    const decisionRepository = {
      create: vi.fn().mockResolvedValue({
        id: 'decision_1',
        taskId: 'task_1',
        title: '确认本地写入：workspace.write_patch',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    };
    const recorder = new AgentCheckpointRecorder(
      runCheckpointRepository as never,
      runStepRepository as never,
      decisionRepository as never,
    );

    const result = await recorder.createToolPermissionCheckpoint({
      runId: 'run_1',
      taskId: 'task_1',
      stepId: 'run_step_1',
      tool: 'workspace.write_patch',
      risk: 'local_write',
      input: {
        summary: 'Update note',
        diffPreview: '--- notes.md',
      },
      decisionTitle: '确认本地写入：workspace.write_patch',
      preview: '--- notes.md',
    });

    expect(runCheckpointRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'tool_permission',
        payload: expect.stringContaining('"decisionId":null'),
      }),
    );
    expect(decisionRepository.create).toHaveBeenCalledWith({
      taskId: 'task_1',
      title: '确认本地写入：workspace.write_patch',
      sourceType: 'agent_checkpoint',
      sourceId: 'run_checkpoint_1',
      sourceLabel: 'workspace.write_patch',
    });
    expect(runCheckpointRepository.updatePayload).toHaveBeenCalledWith(
      'run_checkpoint_1',
      expect.stringContaining('"decisionId":"decision_1"'),
    );
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({
        status: 'skipped',
        output: '工具 workspace.write_patch 需要确认后才能继续，已创建 Decision：确认本地写入：workspace.write_patch。',
      }),
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'checkpoint',
        status: 'pending',
        title: '等待确认：workspace.write_patch',
        input: '--- notes.md',
      }),
    );
    expect(result).toEqual({
      checkpointId: 'run_checkpoint_1',
      decisionId: 'decision_1',
      summary: '工具 workspace.write_patch 需要确认后才能继续，已创建 Decision：确认本地写入：workspace.write_patch。',
    });
  });

  it('creates a resume checkpoint with a restart-safe payload', async () => {
    const runCheckpointRepository = buildRunCheckpointRepositoryMock();
    const runStepRepository = buildRunStepRepositoryMock();
    const recorder = new AgentCheckpointRecorder(
      runCheckpointRepository as never,
      runStepRepository as never,
    );

    const result = await recorder.createResumeCheckpoint({
      runId: 'run_1',
      taskId: 'task_1',
      reason: '等待先解除阻塞。',
      nextTool: 'artifact.create_note',
      nextInput: {
        title: 'Recovered note',
        content: 'Recovered note',
      },
      policySnapshot: {
        maxSteps: 8,
        maxWallTimeMs: 120_000,
        allowNetwork: false,
        allowLocalWorkspaceRead: false,
        allowLocalFileWrite: false,
        confirmationRequiredRisks: ['external_write', 'sensitive'],
      },
      observations: [
        { tool: 'task.inspect_context', status: 'completed' },
      ],
    });

    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'checkpoint',
        status: 'pending',
        title: '等待恢复 agent run',
        input: expect.stringContaining('"nextTool":"artifact.create_note"'),
        output: '等待先解除阻塞。',
      }),
    );
    expect(runCheckpointRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        stepId: 'run_step_2',
        kind: 'resume',
        payload: expect.stringContaining('"policySnapshot"'),
      }),
    );
    expect(runCheckpointRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.stringContaining('"runId":"run_1"'),
      }),
    );
    expect(result).toEqual({
      checkpointId: 'run_checkpoint_1',
    });
  });
});
