import { describe, expect, it, vi } from 'vitest';

import type { DecisionRecord } from '../../../shared/types/decision.js';
import type { TaskDetail, TaskRecord } from '../../../shared/types/task.js';
import { DecisionService } from './decision-service.js';

function buildTaskDetail(): TaskDetail {
  return {
    id: 'task_1',
    title: 'Task 1',
    summary: 'Summary',
    state: 'planned',
    nextStep: 'Move forward',
    waitingReason: null,
    riskLevel: 'none',
    riskNote: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    artifacts: [],
    sourceContexts: [],
    processTemplates: [],
    availableProcessTemplates: [],
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

function buildTaskRecord(state: TaskRecord['state']): TaskRecord {
  return {
    id: 'task_1',
    title: 'Task 1',
    summary: 'Summary',
    state,
    nextStep: 'Move forward',
    waitingReason: null,
    riskLevel: 'none',
    riskNote: null,
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
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail()),
      annotateDecisionApproved: vi.fn(),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
    };
    const service = new DecisionService(decisionRepository as never, taskService as never);

    const result = await service.create({
      taskId: 'task_1',
      title: 'Need approval',
    });

    expect(taskService.getDetail).toHaveBeenCalledWith('task_1');
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
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(null),
      annotateDecisionApproved: vi.fn(),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
    };
    const service = new DecisionService(decisionRepository as never, taskService as never);

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
    const taskService = {
      getDetail: vi.fn(),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
    };
    const service = new DecisionService(decisionRepository as never, taskService as never);

    const result = await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(decisionRepository.act).toHaveBeenCalledWith({
      id: 'decision_1',
      action: 'approve',
    });
    expect(taskService.annotateDecisionApproved).toHaveBeenCalledWith(
      'task_1',
      'Need approval',
      'decision_1',
    );
    expect(result.status).toBe('approved');
  });

  it('moves the task to waiting_external when a decision is deferred', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'deferred',
      }),
    };
    const taskService = {
      getDetail: vi.fn(),
      annotateDecisionApproved: vi.fn(),
      annotateDecisionDeferred: vi.fn().mockResolvedValue(buildTaskRecord('waiting_external')),
      annotateDecisionCancelled: vi.fn(),
    };
    const service = new DecisionService(decisionRepository as never, taskService as never);

    const result = await service.act({
      id: 'decision_1',
      action: 'defer',
    });

    expect(taskService.annotateDecisionDeferred).toHaveBeenCalledWith(
      'task_1',
      'Need approval',
      'decision_1',
    );
    expect(result.status).toBe('deferred');
  });

  it('writes a task signal when a decision is cancelled', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'cancelled',
      }),
    };
    const taskService = {
      getDetail: vi.fn(),
      annotateDecisionApproved: vi.fn(),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
    };
    const service = new DecisionService(decisionRepository as never, taskService as never);

    const result = await service.act({
      id: 'decision_1',
      action: 'cancel',
    });

    expect(taskService.annotateDecisionCancelled).toHaveBeenCalledWith(
      'task_1',
      'Need approval',
      'decision_1',
    );
    expect(result.status).toBe('cancelled');
  });
});
