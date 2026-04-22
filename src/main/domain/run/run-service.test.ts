import { describe, expect, it, vi } from 'vitest';

import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { RunRecord } from '../../../shared/types/run.js';
import type { TaskDetail, TaskRecord } from '../../../shared/types/task.js';
import { RunService } from './run-service.js';

function buildTaskDetail(state: TaskDetail['state'] = 'planned'): TaskDetail {
  return {
    id: 'task_1',
    title: 'Task 1',
    summary: 'Summary',
    state,
    nextStep: 'Draft the response',
    waitingReason: null,
    riskLevel: 'medium',
    riskNote: 'Need confirmation soon',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    artifacts: [],
    sourceContexts: [],
    timeline: [],
  };
}

function buildTaskRecord(state: TaskRecord['state']): TaskRecord {
  return {
    id: 'task_1',
    title: 'Task 1',
    summary: 'Summary',
    state,
    nextStep: 'Draft the response',
    waitingReason: null,
    riskLevel: 'medium',
    riskNote: 'Need confirmation soon',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:01.000Z',
  };
}

function buildRunRecord(status: RunRecord['status']): RunRecord {
  return {
    id: 'run_1',
    taskId: 'task_1',
    type: 'draft',
    status,
    instructions: 'Please draft this',
    output: null,
    outputSource: null,
    failureReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildArtifactRecord(): ArtifactRecord {
  return {
    id: 'artifact_1',
    taskId: 'task_1',
    sourceType: 'run',
    sourceId: 'run_1',
    kind: 'run_output',
    title: 'draft output',
    content: 'Generated output',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('RunService', () => {
  it('completes a run when the executor succeeds', async () => {
    const runRepository = {
      list: vi.fn(),
      getDetail: vi.fn(),
      create: vi.fn().mockResolvedValue(buildRunRecord('pending')),
      updateResult: vi.fn().mockResolvedValue({
        ...buildRunRecord('completed'),
        output: 'Generated output',
        outputSource: 'ai',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('planned')),
      transitionIfAllowed: vi.fn().mockResolvedValue(buildTaskRecord('running')),
      annotateRunCompleted: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateRunFailed: vi.fn(),
    };
    const artifactRepository = {
      createFromRun: vi.fn().mockResolvedValue(buildArtifactRecord()),
    };
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
      }),
    };
    const textExecutor = {
      execute: vi.fn().mockResolvedValue('Generated output'),
    };
    const service = new RunService(
      runRepository as never,
      taskService as never,
      artifactRepository as never,
      aiConfigService as never,
      textExecutor as never,
    );

    const result = await service.trigger({
      taskId: 'task_1',
      type: 'draft',
      instructions: 'Please draft this',
    });

    expect(taskService.getDetail).toHaveBeenCalledWith('task_1');
    expect(taskService.transitionIfAllowed).toHaveBeenCalledWith('task_1', 'running');
    expect(runRepository.create).toHaveBeenCalledWith({
      taskId: 'task_1',
      type: 'draft',
      instructions: 'Please draft this',
    });
    expect(aiConfigService.resolveRuntimeConfig).toHaveBeenCalled();
    expect(textExecutor.execute).toHaveBeenCalledWith(
      {
        ...buildTaskDetail('planned'),
        state: 'running',
        updatedAt: '2026-01-01T00:00:01.000Z',
      },
      {
        taskId: 'task_1',
        type: 'draft',
        instructions: 'Please draft this',
      },
      {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
      },
    );
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'completed',
      'Generated output',
      'ai',
    );
    expect(artifactRepository.createFromRun).toHaveBeenCalledWith({
      taskId: 'task_1',
      runId: 'run_1',
      runType: 'draft',
      content: 'Generated output',
    });
    expect(taskService.annotateRunCompleted).toHaveBeenCalledWith(
      'task_1',
      'draft',
      true,
      'run_1',
    );
    expect(result.status).toBe('completed');
  });

  it('marks the run as failed when the executor throws', async () => {
    const runRepository = {
      list: vi.fn(),
      getDetail: vi.fn(),
      create: vi.fn().mockResolvedValue(buildRunRecord('pending')),
      updateResult: vi.fn().mockResolvedValue({
        ...buildRunRecord('failed'),
        output: 'Executor exploded',
        outputSource: 'system',
        failureReason: 'Executor exploded',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('planned')),
      transitionIfAllowed: vi.fn().mockResolvedValue(buildTaskRecord('running')),
      annotateRunCompleted: vi.fn(),
      annotateRunFailed: vi.fn().mockResolvedValue({
        ...buildTaskRecord('running'),
        riskLevel: 'high',
        riskNote: 'Executor exploded',
      }),
    };
    const artifactRepository = {
      createFromRun: vi.fn(),
    };
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'openai',
        model: 'gpt-4.1',
        apiKey: 'secret',
      }),
    };
    const textExecutor = {
      execute: vi.fn().mockRejectedValue(new Error('Executor exploded')),
    };
    const service = new RunService(
      runRepository as never,
      taskService as never,
      artifactRepository as never,
      aiConfigService as never,
      textExecutor as never,
    );

    const result = await service.trigger({
      taskId: 'task_1',
      type: 'draft',
    });

    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'failed',
      'Executor exploded',
      'system',
      'Executor exploded',
    );
    expect(taskService.annotateRunCompleted).not.toHaveBeenCalled();
    expect(taskService.annotateRunFailed).toHaveBeenCalledWith(
      'task_1',
      'Executor exploded',
      'run_1',
    );
    expect(artifactRepository.createFromRun).not.toHaveBeenCalled();
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('Executor exploded');
  });

  it('rejects the run when the task does not exist', async () => {
    const runRepository = {
      list: vi.fn(),
      getDetail: vi.fn(),
      create: vi.fn(),
      updateResult: vi.fn(),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(null),
      transitionIfAllowed: vi.fn(),
      annotateRunCompleted: vi.fn(),
      annotateRunFailed: vi.fn(),
    };
    const artifactRepository = {
      createFromRun: vi.fn(),
    };
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn(),
    };
    const textExecutor = {
      execute: vi.fn(),
    };
    const service = new RunService(
      runRepository as never,
      taskService as never,
      artifactRepository as never,
      aiConfigService as never,
      textExecutor as never,
    );

    await expect(
      service.trigger({
        taskId: 'missing_task',
        type: 'draft',
      }),
    ).rejects.toThrow('Task not found: missing_task');

    expect(runRepository.create).not.toHaveBeenCalled();
    expect(artifactRepository.createFromRun).not.toHaveBeenCalled();
    expect(textExecutor.execute).not.toHaveBeenCalled();
  });

  it('does not auto-transition when the task is already running', async () => {
    const runRepository = {
      list: vi.fn(),
      getDetail: vi.fn(),
      create: vi.fn().mockResolvedValue(buildRunRecord('pending')),
      updateResult: vi.fn().mockResolvedValue({
        ...buildRunRecord('completed'),
        output: 'Generated output',
        outputSource: 'ai',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      transitionIfAllowed: vi.fn(),
      annotateRunCompleted: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateRunFailed: vi.fn(),
    };
    const artifactRepository = {
      createFromRun: vi.fn().mockResolvedValue(buildArtifactRecord()),
    };
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
      }),
    };
    const textExecutor = {
      execute: vi.fn().mockResolvedValue('Generated output'),
    };
    const service = new RunService(
      runRepository as never,
      taskService as never,
      artifactRepository as never,
      aiConfigService as never,
      textExecutor as never,
    );

    await service.trigger({
      taskId: 'task_1',
      type: 'draft',
    });

    expect(taskService.transitionIfAllowed).not.toHaveBeenCalled();
    expect(taskService.annotateRunCompleted).toHaveBeenCalledWith(
      'task_1',
      'draft',
      true,
      'run_1',
    );
    expect(artifactRepository.createFromRun).toHaveBeenCalled();
    expect(textExecutor.execute).toHaveBeenCalledWith(
      buildTaskDetail('running'),
      {
        taskId: 'task_1',
        type: 'draft',
      },
      {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
      },
    );
  });
});
