import { describe, expect, it, vi } from 'vitest';

import type { RunRecord } from '../../../shared/types/run.js';
import type { TaskDetail } from '../../../shared/types/task.js';
import { RunService } from './run-service.js';

function buildTaskDetail(): TaskDetail {
  return {
    id: 'task_1',
    title: 'Task 1',
    summary: 'Summary',
    state: 'planned',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    timeline: [],
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
    const taskRepository = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail()),
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
      taskRepository as never,
      aiConfigService as never,
      textExecutor as never,
    );

    const result = await service.trigger({
      taskId: 'task_1',
      type: 'draft',
      instructions: 'Please draft this',
    });

    expect(taskRepository.getDetail).toHaveBeenCalledWith('task_1');
    expect(runRepository.create).toHaveBeenCalledWith({
      taskId: 'task_1',
      type: 'draft',
      instructions: 'Please draft this',
    });
    expect(aiConfigService.resolveRuntimeConfig).toHaveBeenCalled();
    expect(textExecutor.execute).toHaveBeenCalledWith(
      buildTaskDetail(),
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
    const taskRepository = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail()),
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
      taskRepository as never,
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
    const taskRepository = {
      getDetail: vi.fn().mockResolvedValue(null),
    };
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn(),
    };
    const textExecutor = {
      execute: vi.fn(),
    };
    const service = new RunService(
      runRepository as never,
      taskRepository as never,
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
    expect(textExecutor.execute).not.toHaveBeenCalled();
  });
});
