import { describe, expect, it, vi } from 'vitest';

import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';
import { parseRunCheckpointPayload } from '../../../shared/types/run-checkpoint-payload.js';
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
    const sandboxPatchPromotionRepository = {
      createPending: vi.fn().mockResolvedValue({ id: 'sandbox_patch_promotion_1' }),
    };
    const recorder = new AgentCheckpointRecorder(
      runCheckpointRepository as never,
      runStepRepository as never,
      decisionRepository as never,
      sandboxPatchPromotionRepository as never,
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
      event: {
        type: 'checkpoint.created',
        runId: 'run_1',
        checkpointId: 'run_checkpoint_1',
        checkpointKind: 'tool_permission',
        reason: '工具 workspace.write_patch 需要确认后才能继续，已创建 Decision：确认本地写入：workspace.write_patch。',
        decisionId: 'decision_1',
        tool: 'workspace.write_patch',
      },
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
      event: {
        type: 'checkpoint.created',
        runId: 'run_1',
        checkpointId: 'run_checkpoint_1',
        checkpointKind: 'resume',
        reason: '等待先解除阻塞。',
        tool: 'artifact.create_note',
      },
    });
  });

  it('creates a Decision-linked patch-promotion checkpoint without applying the patch', async () => {
    const runCheckpointRepository = buildRunCheckpointRepositoryMock();
    const runStepRepository = buildRunStepRepositoryMock();
    const decisionRepository = {
      create: vi.fn().mockResolvedValue({
        id: 'decision_patch_1',
        taskId: 'task_1',
        title: '确认提升 sandbox patch',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    };
    const sandboxPatchPromotionRepository = {
      createPending: vi.fn().mockResolvedValue({ id: 'sandbox_patch_promotion_1' }),
    };
    const recorder = new AgentCheckpointRecorder(
      runCheckpointRepository as never,
      runStepRepository as never,
      decisionRepository as never,
      sandboxPatchPromotionRepository as never,
    );

    const result = await recorder.createPatchPromotionCheckpoint({
      runId: 'run_1',
      taskId: 'task_1',
      artifactId: 'artifact_1',
      artifactSummary: 'Reviewable sandbox patch',
      expectedFiles: ['src/a.ts'],
      patchDigest: 'sha256:abc123',
      sessionId: 'sandbox_session_1',
      policySnapshot: {
        descriptorId: 'workspace.staged_patch',
        sessionKind: 'sandbox',
        credentialPolicy: 'none',
        networkPolicy: 'disabled',
        timeoutMs: 120_000,
        outputLimitBytes: 64_000,
      },
      decisionTitle: '确认提升 sandbox patch',
      preview: 'diff --git a/src/a.ts b/src/a.ts',
    });

    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'checkpoint',
        status: 'pending',
        title: '等待确认：sandbox patch promotion',
        input: 'diff --git a/src/a.ts b/src/a.ts',
        output: '等待确认是否将 sandbox patch 提升到工作区：Reviewable sandbox patch',
      }),
    );
    expect(runCheckpointRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        stepId: 'run_step_2',
        kind: 'patch_promotion',
        payload: expect.stringContaining('"descriptorId":"workspace.staged_patch"'),
      }),
    );
    expect(parseRunCheckpointPayload(
      runCheckpointRepository.create.mock.calls[0]?.[0].payload,
    )).toMatchObject({
      expectedFiles: ['src/a.ts'],
      patchDigest: 'sha256:abc123',
    });
    expect(decisionRepository.create).toHaveBeenCalledWith({
      taskId: 'task_1',
      title: '确认提升 sandbox patch',
      sourceType: 'agent_checkpoint',
      sourceId: 'run_checkpoint_1',
      sourceLabel: 'workspace.staged_patch',
    });
    expect(runCheckpointRepository.updatePayload).toHaveBeenCalledWith(
      'run_checkpoint_1',
      expect.stringContaining('"decisionId":"decision_patch_1"'),
    );
    expect(parseRunCheckpointPayload(
      runCheckpointRepository.updatePayload.mock.calls[0]?.[1],
    )).toMatchObject({
      decisionId: 'decision_patch_1',
      expectedFiles: ['src/a.ts'],
      patchDigest: 'sha256:abc123',
    });
    expect(sandboxPatchPromotionRepository.createPending).toHaveBeenCalledWith({
      artifactId: 'artifact_1',
      auditSummary: 'Reviewable sandbox patch',
      checkpointId: 'run_checkpoint_1',
      decisionId: 'decision_patch_1',
      expectedFiles: ['src/a.ts'],
      patchDigest: 'sha256:abc123',
      runId: 'run_1',
      sourceId: 'sandbox_session_1',
      taskId: 'task_1',
    });
    expect(result).toEqual({
      checkpointId: 'run_checkpoint_1',
      decisionId: 'decision_patch_1',
      event: {
        type: 'checkpoint.created',
        runId: 'run_1',
        checkpointId: 'run_checkpoint_1',
        checkpointKind: 'patch_promotion',
        reason: 'Sandbox patch promotion 需要确认后才能继续，已创建 Decision：确认提升 sandbox patch。',
        decisionId: 'decision_patch_1',
        tool: null,
      },
      summary: 'Sandbox patch promotion 需要确认后才能继续，已创建 Decision：确认提升 sandbox patch。',
    });
  });
});
