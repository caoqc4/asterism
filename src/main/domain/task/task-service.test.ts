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

function buildWaitingDetail(state: TaskDetail['state']): TaskDetail {
  return {
    ...buildDetail(state),
    waitingReason: 'Waiting for external approval',
  };
}

function buildHighRiskDetail(state: TaskDetail['state']): TaskDetail {
  return {
    ...buildDetail(state),
    riskLevel: 'high',
    riskNote: 'Existing high risk note',
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
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    };
    const service = new TaskService(repository as never, waitingItems as never);

    const result = await service.transition({
      id: 'task_1',
      nextState: 'running',
    });

    expect(repository.transition).toHaveBeenCalledWith({
      id: 'task_1',
      nextState: 'running',
      waitingReason: null,
    });
    expect(waitingItems.resolveActive).toHaveBeenCalledWith('task_1');
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
    const service = new TaskService(repository as never, {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    } as never);

    await expect(
      service.transition({
        id: 'task_1',
        nextState: 'running',
      }),
    ).rejects.toThrow('Invalid transition: captured -> running');
    expect(repository.transition).not.toHaveBeenCalled();
  });

  it('requires a waiting reason when transitioning to waiting_external', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildDetail('running')),
      update: vi.fn(),
      transition: vi.fn(),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    };
    const service = new TaskService(repository as never, waitingItems as never);

    await expect(
      service.transition({
        id: 'task_1',
        nextState: 'waiting_external',
      }),
    ).rejects.toThrow('Waiting reason is required when transitioning to waiting_external');
    expect(repository.transition).not.toHaveBeenCalled();
    expect(waitingItems.upsertActive).not.toHaveBeenCalled();
  });

  it('clears waiting reason when transitioning out of waiting_external', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildWaitingDetail('waiting_external')),
      update: vi.fn(),
      transition: vi.fn().mockResolvedValue({
        ...buildRecord('planned'),
        waitingReason: null,
      }),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    };
    const service = new TaskService(repository as never, waitingItems as never);

    const result = await service.transition({
      id: 'task_1',
      nextState: 'planned',
    });

    expect(repository.transition).toHaveBeenCalledWith({
      id: 'task_1',
      nextState: 'planned',
      waitingReason: null,
    });
    expect(waitingItems.resolveActive).toHaveBeenCalledWith('task_1');
    expect(result.waitingReason).toBeNull();
  });

  it('creates or updates an active waiting item when transitioning into waiting_external', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildDetail('running')),
      update: vi.fn(),
      transition: vi.fn().mockResolvedValue({
        ...buildRecord('waiting_external'),
        waitingReason: 'Waiting for finance confirmation',
      }),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    };
    const service = new TaskService(repository as never, waitingItems as never);

    await service.transition({
      id: 'task_1',
      nextState: 'waiting_external',
      waitingReason: 'Waiting for finance confirmation',
    });

    expect(waitingItems.upsertActive).toHaveBeenCalledWith(
      'task_1',
      'Waiting for finance confirmation',
    );
    expect(waitingItems.resolveActive).not.toHaveBeenCalled();
  });

  it('requires a risk note when updating a task to high risk', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildDetail('planned')),
      update: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never, {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    } as never);

    await expect(
      service.update({
        id: 'task_1',
        riskLevel: 'high',
        riskNote: '',
      }),
    ).rejects.toThrow('Risk note is required when setting task risk to high');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('allows updates to existing high-risk tasks when a risk note already exists', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildHighRiskDetail('running')),
      update: vi.fn().mockResolvedValue({
        ...buildRecord('running'),
        title: 'Updated title',
        riskLevel: 'high',
        riskNote: 'Existing high risk note',
      }),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never, {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    } as never);

    const result = await service.update({
      id: 'task_1',
      title: 'Updated title',
    });

    expect(repository.update).toHaveBeenCalledWith({
      id: 'task_1',
      title: 'Updated title',
      riskNote: 'Existing high risk note',
    });
    expect(result.riskLevel).toBe('high');
    expect(result.riskNote).toBe('Existing high risk note');
  });

  it('syncs the active waiting item when updating waiting reason on a waiting task', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildWaitingDetail('waiting_external')),
      update: vi.fn().mockResolvedValue({
        ...buildRecord('waiting_external'),
        waitingReason: 'Waiting for revised proposal',
      }),
      transition: vi.fn(),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    };
    const service = new TaskService(repository as never, waitingItems as never);

    const result = await service.update({
      id: 'task_1',
      waitingReason: 'Waiting for revised proposal',
    });

    expect(waitingItems.upsertActive).toHaveBeenCalledWith(
      'task_1',
      'Waiting for revised proposal',
    );
    expect(result.waitingReason).toBe('Waiting for revised proposal');
  });

  it('clears stale high-risk notes when lowering risk without a new note', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildHighRiskDetail('running')),
      update: vi.fn().mockResolvedValue({
        ...buildRecord('running'),
        riskLevel: 'medium',
        riskNote: null,
      }),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never, {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    } as never);

    const result = await service.update({
      id: 'task_1',
      riskLevel: 'medium',
    });

    expect(repository.update).toHaveBeenCalledWith({
      id: 'task_1',
      riskLevel: 'medium',
      riskNote: null,
    });
    expect(result.riskLevel).toBe('medium');
    expect(result.riskNote).toBeNull();
  });

  it('throws when the task does not exist', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      transition: vi.fn(),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    };
    const service = new TaskService(repository as never, waitingItems as never);

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
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    };
    const service = new TaskService(repository as never, waitingItems as never);

    const result = await service.annotateDecisionCancelled('task_1', 'Need approval');

    expect(repository.update).toHaveBeenCalledWith({
      id: 'task_1',
      nextStep: '确认该任务是否还需要继续推进，或改走无需拍板的路径。',
      waitingReason: null,
      riskLevel: 'medium',
      riskNote: '相关决策已取消：Need approval',
    });
    expect(waitingItems.resolveActive).toHaveBeenCalledWith('task_1');
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith(
      'task_1',
      'task.decision_cancelled',
      {
        decisionTitle: 'Need approval',
        suggestedAction: '创建新的 Decision，或改走无需拍板的路径',
      },
    );
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
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    };
    const service = new TaskService(repository as never, waitingItems as never);

    const result = await service.annotateRunFailed('task_1', 'Executor exploded');

    expect(repository.update).toHaveBeenCalledWith({
      id: 'task_1',
      nextStep: '检查失败原因，修正输入或上下文后再决定是否重试。',
      riskLevel: 'high',
      riskNote: 'Executor exploded',
    });
    expect(waitingItems.resolveActive).toHaveBeenCalledWith('task_1');
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith('task_1', 'task.run_failed', {
      failureReason: 'Executor exploded',
      suggestedAction: '检查失败原因并准备重试 Run',
    });
    expect(result.riskLevel).toBe('high');
  });
});
