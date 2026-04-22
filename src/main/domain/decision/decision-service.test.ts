import { describe, expect, it, vi } from 'vitest';

import type { DecisionRecord } from '../../../shared/types/decision.js';
import type { TaskDetail } from '../../../shared/types/task.js';
import { DecisionService } from './decision-service.js';

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

function buildDecisionRecord(): DecisionRecord {
  return {
    id: 'decision_1',
    taskId: 'task_1',
    title: 'Need approval',
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('DecisionService', () => {
  it('creates a decision when the task exists', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn().mockResolvedValue(buildDecisionRecord()),
      act: vi.fn(),
    };
    const taskRepository = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail()),
    };
    const service = new DecisionService(decisionRepository as never, taskRepository as never);

    const result = await service.create({
      taskId: 'task_1',
      title: 'Need approval',
    });

    expect(taskRepository.getDetail).toHaveBeenCalledWith('task_1');
    expect(decisionRepository.create).toHaveBeenCalledWith({
      taskId: 'task_1',
      title: 'Need approval',
    });
    expect(result.id).toBe('decision_1');
  });

  it('rejects decision creation when the task does not exist', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn(),
    };
    const taskRepository = {
      getDetail: vi.fn().mockResolvedValue(null),
    };
    const service = new DecisionService(decisionRepository as never, taskRepository as never);

    await expect(
      service.create({
        taskId: 'missing_task',
        title: 'Need approval',
      }),
    ).rejects.toThrow('Task not found: missing_task');
    expect(decisionRepository.create).not.toHaveBeenCalled();
  });

  it('passes actions straight through to the repository', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'approved',
      }),
    };
    const taskRepository = {
      getDetail: vi.fn(),
    };
    const service = new DecisionService(decisionRepository as never, taskRepository as never);

    const result = await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(decisionRepository.act).toHaveBeenCalledWith({
      id: 'decision_1',
      action: 'approve',
    });
    expect(result.status).toBe('approved');
  });
});
