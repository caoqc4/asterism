import { describe, expect, it, vi } from 'vitest';

import type { TaskDetail, TaskRecord } from '../../../shared/types/task.js';
import { TaskService } from './task-service.js';

function buildDetail(state: TaskDetail['state']): TaskDetail {
  return {
    id: 'task_1',
    title: 'Task 1',
    summary: 'Summary',
    state,
    nextStep: 'Next step',
    waitingReason: null,
    riskLevel: 'none',
    riskNote: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    timeline: [],
  };
}

function buildRecord(state: TaskRecord['state']): TaskRecord {
  return {
    id: 'task_1',
    title: 'Task 1',
    summary: 'Summary',
    state,
    nextStep: 'Next step',
    waitingReason: null,
    riskLevel: 'none',
    riskNote: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('TaskService', () => {
  it('allows valid state transitions', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildDetail('planned')),
      update: vi.fn(),
      transition: vi.fn().mockResolvedValue(buildRecord('running')),
    };
    const service = new TaskService(repository as never);

    const result = await service.transition({
      id: 'task_1',
      nextState: 'running',
    });

    expect(repository.transition).toHaveBeenCalledWith({
      id: 'task_1',
      nextState: 'running',
    });
    expect(result.state).toBe('running');
  });

  it('rejects invalid state transitions', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildDetail('captured')),
      update: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never);

    await expect(
      service.transition({
        id: 'task_1',
        nextState: 'running',
      }),
    ).rejects.toThrow('Invalid transition: captured -> running');
    expect(repository.transition).not.toHaveBeenCalled();
  });

  it('throws when the task does not exist', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never);

    await expect(
      service.transition({
        id: 'missing_task',
        nextState: 'planned',
      }),
    ).rejects.toThrow('Task not found: missing_task');
  });

  it('annotates a cancelled decision back onto the task', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildDetail('planned')),
      update: vi.fn().mockResolvedValue({
        ...buildRecord('planned'),
        riskLevel: 'medium',
        riskNote: '相关决策已取消：Need approval',
        nextStep: '确认该任务是否还需要继续推进，或改走无需拍板的路径。',
      }),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never);

    const result = await service.annotateDecisionCancelled('task_1', 'Need approval');

    expect(repository.update).toHaveBeenCalledWith({
      id: 'task_1',
      nextStep: '确认该任务是否还需要继续推进，或改走无需拍板的路径。',
      waitingReason: null,
      riskLevel: 'medium',
      riskNote: '相关决策已取消：Need approval',
    });
    expect(result.riskLevel).toBe('medium');
  });

  it('annotates a failed run as a high-risk signal', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildDetail('running')),
      update: vi.fn().mockResolvedValue({
        ...buildRecord('running'),
        riskLevel: 'high',
        riskNote: 'Executor exploded',
        nextStep: '检查失败原因，修正输入或上下文后再决定是否重试。',
      }),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never);

    const result = await service.annotateRunFailed('task_1', 'Executor exploded');

    expect(repository.update).toHaveBeenCalledWith({
      id: 'task_1',
      nextStep: '检查失败原因，修正输入或上下文后再决定是否重试。',
      riskLevel: 'high',
      riskNote: 'Executor exploded',
    });
    expect(result.riskLevel).toBe('high');
  });
});
