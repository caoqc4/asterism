import { describe, expect, it, vi } from 'vitest';

import type { AgentWorkingContext } from '../../../shared/types/agent-execution.js';
import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';
import { AgentToolRegistry } from './agent-tool-registry.js';

function buildWorkingContext(): AgentWorkingContext {
  return {
    task: {
      id: 'task_1',
      title: 'Inspect agent context',
      summary: 'Context summary',
      state: 'running',
      nextStep: 'Review the context',
      riskLevel: 'medium',
      riskNote: 'Needs attention',
    },
    priorityLane: 'continue_or_review',
    resumeSummary: 'Ready to continue with context inspection.',
    completion: {
      total: 2,
      satisfied: 1,
      open: 1,
      nextOpenCriterion: 'Confirm output quality',
    },
    blockers: [{ title: 'Legal review', detail: null, owner: 'Legal' }],
    dependencies: [{ title: 'Upstream research', detail: 'Waiting for notes' }],
    sources: [
      {
        title: 'Key brief',
        kind: 'note',
        isKey: true,
        note: 'Most important source',
        contentPreview: 'Brief content',
      },
    ],
    processTemplates: [
      {
        id: 'process_template_1',
        title: 'Review checklist',
        kind: 'checklist',
        summary: 'Review output quality',
      },
    ],
    recentTimeline: [
      {
        type: 'task.next_step_changed',
        summary: '下一步调整为 Review the context',
        createdAt: '2026-01-01T01:00:00.000Z',
      },
    ],
  };
}

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

function buildRunCheckpointRepositoryMock() {
  return {
    create: vi.fn().mockImplementation(async (input: { payload?: string | null }) => ({
      id: 'run_checkpoint_1',
      runId: 'run_1',
      stepId: 'run_step_1',
      kind: 'tool_permission',
      status: 'open',
      payload: input.payload ?? null,
      createdAt: '2026-01-01T00:00:00.000Z',
      resolvedAt: null,
    })),
    updatePayload: vi.fn().mockImplementation(async (_id: string, payload: string | null) => ({
      id: 'run_checkpoint_1',
      runId: 'run_1',
      stepId: 'run_step_1',
      kind: 'tool_permission',
      status: 'open',
      payload,
      createdAt: '2026-01-01T00:00:00.000Z',
      resolvedAt: null,
    })),
  };
}

function buildDecisionRepositoryMock() {
  return {
    create: vi.fn().mockResolvedValue({
      id: 'decision_1',
      taskId: 'task_1',
      title: '确认本地写入：artifact.create_note',
      status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
  };
}

describe('AgentToolRegistry', () => {
  it('lists read-only context inspection before write tools', () => {
    const registry = new AgentToolRegistry({} as never, buildRunStepRepositoryMock() as never);

    expect(registry.list()).toEqual([
      expect.objectContaining({
        name: 'task.inspect_context',
        risk: 'safe_read',
        requiresConfirmation: false,
      }),
      expect.objectContaining({
        name: 'task.inspect_timeline',
        risk: 'safe_read',
        requiresConfirmation: false,
      }),
      expect.objectContaining({
        name: 'artifact.create_note',
        risk: 'local_write',
      }),
    ]);
  });

  it('inspects the current working context as a read-only tool', async () => {
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry({} as never, runStepRepository as never);

    const result = await registry.execute(
      'task.inspect_context',
      {},
      {
        runId: 'run_1',
        taskId: 'task_1',
        workingContext: buildWorkingContext(),
      },
    );

    expect(result).toMatchObject({
      success: true,
      status: 'completed',
      summary: '已读取当前任务上下文摘要。',
    });
    expect(result.output).toContain('任务：Inspect agent context');
    expect(result.output).toContain('关键来源：Key brief');
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({ status: 'completed' }),
    );
    expect(runStepRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'tool_result', status: 'completed' }),
    );
  });

  it('inspects recent timeline events as a read-only tool', async () => {
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry({} as never, runStepRepository as never);

    const result = await registry.execute(
      'task.inspect_timeline',
      {},
      {
        runId: 'run_1',
        taskId: 'task_1',
        workingContext: buildWorkingContext(),
      },
    );

    expect(result).toMatchObject({
      success: true,
      status: 'completed',
      summary: '已读取当前任务最近时间线。',
    });
    expect(result.output).toContain('task.next_step_changed');
    expect(result.output).toContain('下一步调整为 Review the context');
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({ status: 'completed' }),
    );
  });

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

  it('creates a checkpoint instead of executing when policy requires confirmation', async () => {
    const artifactRepository = {
      createNoteFromRun: vi.fn(),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const runCheckpointRepository = buildRunCheckpointRepositoryMock();
    const decisionRepository = buildDecisionRepositoryMock();
    const registry = new AgentToolRegistry(
      artifactRepository as never,
      runStepRepository as never,
      runCheckpointRepository as never,
      decisionRepository as never,
    );

    const result = await registry.execute(
      'artifact.create_note',
      { title: 'Agent note', content: 'Captured note' },
      { runId: 'run_1', taskId: 'task_1' },
      {
        maxSteps: 8,
        maxWallTimeMs: 120_000,
        allowNetwork: false,
        allowLocalFileWrite: false,
        confirmationRequiredRisks: ['local_write'],
      },
    );

    expect(result).toMatchObject({
      success: false,
      status: 'needs_confirmation',
      checkpointId: 'run_checkpoint_1',
    });
    expect(artifactRepository.createNoteFromRun).not.toHaveBeenCalled();
    expect(decisionRepository.create).toHaveBeenCalledWith({
      taskId: 'task_1',
      title: '确认本地写入：artifact.create_note',
      sourceType: 'agent_checkpoint',
      sourceId: 'run_checkpoint_1',
      sourceLabel: 'artifact.create_note',
    });
    expect(runCheckpointRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'tool_permission',
      }),
    );
    expect(runCheckpointRepository.updatePayload).toHaveBeenCalledWith(
      'run_checkpoint_1',
      expect.stringContaining('"decisionId":"decision_1"'),
    );
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({
        status: 'skipped',
        output: '工具 artifact.create_note 需要确认后才能继续，已创建 Decision：确认本地写入：artifact.create_note。',
      }),
    );
    expect(runStepRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'checkpoint', status: 'pending' }),
    );
  });
});
