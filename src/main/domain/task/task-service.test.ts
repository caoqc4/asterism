import { describe, expect, it, vi } from 'vitest';

import type {
  AppliedProcessTemplateRecord,
  ProcessTemplateRecord,
} from '../../../shared/types/process-template.js';
import type { BlockerRecord } from '../../../shared/types/blocker.js';
import type { TaskDetail, TaskRecord } from '../../../shared/types/task.js';
import type { SourceContextRecord } from '../../../shared/types/source-context.js';
import { TaskService } from './task-service.js';

function buildDetail(state: TaskDetail['state']): TaskDetail {
  return {
    id: 'task_1',
    title: 'Task 1',
    summary: 'Summary',
    state,
    nextStep: 'Next step',
    waitingReason: null,
    activeWaitingItem: null,
    activeBlocker: null,
    riskLevel: 'none',
    riskNote: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    resumeCard: {
      summary: 'Resume summary',
      currentState: `状态：${state}`,
      latestChange: {
        summary: '最近没有新的生命周期变化。',
        action: {
          label: null,
          targetType: null,
          targetId: null,
        },
      },
      currentBlocker: {
        blockerId: null,
        title: '暂无当前阻塞项',
        detail: null,
      },
      keySource: {
        sourceContextId: null,
        title: '暂无关键来源',
        detail: null,
        priorityReason: null,
      },
      currentMethod: {
        templateId: null,
        title: '暂无方法模板',
        detail: null,
        selectionReason: null,
      },
      nextSuggestedMove: 'Next step',
    },
    artifacts: [],
    sourceContexts: [],
    processTemplates: [],
    availableProcessTemplates: [],
    timeline: [],
  };
}

function buildBlockerRecord(partial: Partial<BlockerRecord> = {}): BlockerRecord {
  return {
    id: partial.id ?? 'blocker_1',
    taskId: partial.taskId ?? 'task_1',
    title: partial.title ?? 'Legal approval pending',
    kind: partial.kind ?? 'approval',
    detail: partial.detail ?? 'Need sign-off',
    owner: partial.owner ?? 'Legal',
    sourceContextId: partial.sourceContextId ?? null,
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    resolvedAt: partial.resolvedAt ?? null,
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

function buildSourceContextRecord(partial: Partial<SourceContextRecord> = {}): SourceContextRecord {
  return {
    id: partial.id ?? 'source_context_1',
    taskId: partial.taskId ?? 'task_1',
    title: partial.title ?? 'PRD',
    kind: partial.kind ?? 'doc',
    isKey: partial.isKey ?? false,
    uri: partial.uri ?? 'https://example.com/prd',
    content: partial.content ?? null,
    note: partial.note ?? 'Primary doc',
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    archivedAt: partial.archivedAt ?? null,
  };
}

function buildProcessTemplateRecord(
  partial: Partial<ProcessTemplateRecord> = {},
): ProcessTemplateRecord {
  return {
    id: partial.id ?? 'process_template_1',
    title: partial.title ?? 'Outreach skill',
    summary: partial.summary ?? 'Use the outreach workflow',
    content: partial.content ?? '1. Review the sources\n2. Draft the outreach note',
    kind: partial.kind ?? 'skill',
    tags: partial.tags ?? ['outreach'],
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    archivedAt: partial.archivedAt ?? null,
  };
}

function buildAppliedProcessTemplateRecord(
  partial: Partial<AppliedProcessTemplateRecord> = {},
): AppliedProcessTemplateRecord {
  const template = buildProcessTemplateRecord(partial);

  return {
    ...template,
    bindingId: partial.bindingId ?? 'task_process_binding_1',
    taskId: partial.taskId ?? 'task_1',
    bindingStatus: partial.bindingStatus ?? 'active',
    bindingNote: partial.bindingNote ?? null,
    boundAt: partial.boundAt ?? '2026-01-01T00:00:00.000Z',
    bindingUpdatedAt: partial.bindingUpdatedAt ?? '2026-01-01T00:00:00.000Z',
    removedAt: partial.removedAt ?? null,
  };
}

describe('TaskService', () => {
  it('builds a task resume card from current signals, materials, methods, and timeline', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildDetail('planned'),
        nextStep: null,
        timeline: [
          {
            id: 'timeline_0',
            taskId: 'task_1',
            type: 'process_template.selected',
            payload: JSON.stringify({
              sourceType: 'run',
              sourceId: 'run_1',
              templateIds: ['process_template_outreach'],
              titles: ['Outreach skill'],
              reason: '来源材料已更新，适合先按 outreach 方法整理外链目标。',
            }),
            createdAt: '2026-01-02T00:30:00.000Z',
          },
          {
            id: 'timeline_1',
            taskId: 'task_1',
            type: 'source_context.updated',
            payload: JSON.stringify({
              sourceContextId: 'source_context_key',
              title: 'Partner website shortlist',
            }),
            createdAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      }),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    };
    const artifacts = {
      listRecentForTask: vi.fn().mockResolvedValue([]),
    };
    const sourceContexts = {
      listActiveForTask: vi.fn().mockResolvedValue([
        buildSourceContextRecord({
          id: 'source_context_key',
          title: 'Partner website shortlist',
          isKey: true,
          note: 'Latest approved outreach targets',
        }),
      ]),
    };
    const processTemplates = {
      listActive: vi.fn().mockResolvedValue([]),
    };
    const bindings = {
      listActiveForTask: vi.fn().mockResolvedValue([
        buildAppliedProcessTemplateRecord({
          id: 'process_template_outreach',
          title: 'Outreach skill',
          summary: 'Review targets before drafting',
        }),
      ]),
    };
    const blockers = {
      getActiveForTask: vi.fn().mockResolvedValue(
        buildBlockerRecord({
          title: 'Legal approval pending',
          detail: 'Need formal sign-off before launch',
        }),
      ),
    };
    const service = new TaskService(
      repository as never,
      waitingItems as never,
      artifacts as never,
      sourceContexts as never,
      processTemplates as never,
      bindings as never,
      blockers as never,
    );

    const detail = await service.getDetail('task_1');

    expect(detail?.resumeCard.summary).toContain('Partner website shortlist');
    expect(detail?.resumeCard.latestChange.summary).toBe('最近更新了来源材料：Partner website shortlist。');
    expect(detail?.resumeCard.latestChange.action).toEqual({
      label: '查看来源',
      targetType: 'source_context',
      targetId: 'source_context_key',
    });
    expect(detail?.resumeCard.currentBlocker).toEqual({
      blockerId: 'blocker_1',
      title: 'Legal approval pending',
      detail: 'Need formal sign-off before launch',
      priorityReason: '当前主阻塞项：Need formal sign-off before launch',
    });
    expect(detail?.resumeCard.keySource.title).toBe('Partner website shortlist');
    expect(detail?.resumeCard.keySource.priorityReason).toBe(
      '当前在材料架中被标记为关键来源：Latest approved outreach targets',
    );
    expect(detail?.resumeCard.currentMethod.title).toBe('Outreach skill');
    expect(detail?.resumeCard.currentMethod.selectionReason).toBe(
      '当前任务最近采用该方法：来源材料已更新，适合先按 outreach 方法整理外链目标。',
    );
    expect(detail?.resumeCard.nextSuggestedMove).toBe('基于来源材料继续推进：Partner website shortlist');
    expect(detail?.resumeCard.currentState).toContain('阻塞：Legal approval pending');
  });

  it('prioritizes a clear lifecycle change when deriving the next suggested move', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildDetail('planned'),
        nextStep: null,
        timeline: [
          {
            id: 'timeline_run_failed',
            taskId: 'task_1',
            type: 'task.run_failed',
            payload: JSON.stringify({
              runId: 'run_1',
              failureReason: 'Model overloaded',
            }),
            createdAt: '2026-01-02T01:00:00.000Z',
          },
        ],
      }),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    };
    const service = new TaskService(repository as never, waitingItems as never);

    const detail = await service.getDetail('task_1');

    expect(detail?.resumeCard.latestChange.summary).toBe('最近一次执行失败：Model overloaded。');
    expect(detail?.resumeCard.nextSuggestedMove).toBe('检查最近一次执行失败原因，并决定是否重试。');
  });

  it('creates and resolves blocker objects with task timeline events', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildDetail('planned')),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    };
    const blockers = {
      getActiveForTask: vi.fn().mockResolvedValueOnce(null),
      create: vi.fn().mockResolvedValue(
        buildBlockerRecord({
          title: 'Legal approval pending',
          kind: 'approval',
          detail: 'Need legal sign-off',
        }),
      ),
      update: vi.fn(),
      resolve: vi.fn().mockResolvedValue(
        buildBlockerRecord({
          status: 'resolved',
          resolvedAt: '2026-01-02T00:00:00.000Z',
        }),
      ),
    };
    const service = new TaskService(
      repository as never,
      waitingItems as never,
      null,
      null,
      null,
      null,
      blockers as never,
    );

    const created = await service.createBlocker({
      taskId: 'task_1',
      title: 'Legal approval pending',
      kind: 'approval',
      detail: 'Need legal sign-off',
    });
    const resolved = await service.resolveBlocker(created.id);

    expect(blockers.create).toHaveBeenCalledWith({
      taskId: 'task_1',
      title: 'Legal approval pending',
      kind: 'approval',
      detail: 'Need legal sign-off',
    });
    expect(repository.appendTimelineEvent).toHaveBeenNthCalledWith(
      1,
      'task_1',
      'blocker.created',
      expect.objectContaining({
        blockerId: 'blocker_1',
        title: 'Legal approval pending',
      }),
    );
    expect(blockers.resolve).toHaveBeenCalledWith('blocker_1');
    expect(repository.appendTimelineEvent).toHaveBeenNthCalledWith(
      2,
      'task_1',
      'blocker.resolved',
      expect.objectContaining({
        blockerId: 'blocker_1',
        status: 'resolved',
      }),
    );
    expect(resolved.status).toBe('resolved');
  });

  it('allows valid state transitions', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildDetail('planned')),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn().mockResolvedValue(buildRecord('running')),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn().mockResolvedValue({
        id: 'waiting_1',
        taskId: 'task_1',
        reason: 'Waiting for external approval',
        status: 'resolved',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T01:00:00.000Z',
        resolvedAt: '2026-01-01T01:00:00.000Z',
      }),
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
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith(
      'task_1',
      'waiting_item.resolved',
      expect.objectContaining({
        waitingItemId: 'waiting_1',
        nextState: 'running',
      }),
    );
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
      appendTimelineEvent: vi.fn(),
      transition: vi.fn().mockResolvedValue({
        ...buildRecord('planned'),
        waitingReason: null,
      }),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn().mockResolvedValue({
        id: 'waiting_1',
        taskId: 'task_1',
        reason: 'Waiting for external approval',
        status: 'resolved',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T01:00:00.000Z',
        resolvedAt: '2026-01-01T01:00:00.000Z',
      }),
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
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith(
      'task_1',
      'waiting_item.resolved',
      expect.objectContaining({
        waitingItemId: 'waiting_1',
        nextState: 'planned',
      }),
    );
    expect(result.waitingReason).toBeNull();
  });

  it('creates or updates an active waiting item when transitioning into waiting_external', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildDetail('running')),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn().mockResolvedValue({
        ...buildRecord('waiting_external'),
        waitingReason: 'Waiting for finance confirmation',
      }),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn().mockResolvedValue({
        action: 'created',
        item: {
          id: 'waiting_1',
          taskId: 'task_1',
          reason: 'Waiting for finance confirmation',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          resolvedAt: null,
        },
      }),
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
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith(
      'task_1',
      'waiting_item.created',
      expect.objectContaining({
        waitingItemId: 'waiting_1',
        reason: 'Waiting for finance confirmation',
      }),
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
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn().mockResolvedValue({
        action: 'updated',
        item: {
          id: 'waiting_1',
          taskId: 'task_1',
          reason: 'Waiting for revised proposal',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T01:00:00.000Z',
          resolvedAt: null,
        },
      }),
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
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith(
      'task_1',
      'waiting_item.updated',
      expect.objectContaining({
        waitingItemId: 'waiting_1',
        reason: 'Waiting for revised proposal',
      }),
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
      resolveActive: vi.fn().mockResolvedValue(null),
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
      resolveActive: vi.fn().mockResolvedValue(null),
    };
    const service = new TaskService(repository as never, waitingItems as never);

    const result = await service.annotateDecisionCancelled('task_1', 'Need approval', 'decision_1');

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
        decisionId: 'decision_1',
        decisionTitle: 'Need approval',
        suggestedAction: '创建新的 Decision，或改走无需拍板的路径',
      },
    );
    expect(result.riskLevel).toBe('medium');
  });

  it('annotates an approved decision with a next step', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildWaitingDetail('waiting_external')),
      update: vi.fn().mockResolvedValue({
        ...buildRecord('planned'),
        nextStep: '已获批准：Need approval，继续推进下一步。',
        waitingReason: null,
      }),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn().mockResolvedValue({
        ...buildRecord('planned'),
        waitingReason: null,
      }),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn().mockResolvedValue(null),
    };
    const service = new TaskService(repository as never, waitingItems as never);

    const result = await service.annotateDecisionApproved('task_1', 'Need approval', 'decision_1');

    expect(repository.transition).toHaveBeenCalledWith({
      id: 'task_1',
      nextState: 'planned',
      waitingReason: null,
    });
    expect(repository.update).toHaveBeenCalledWith({
      id: 'task_1',
      nextStep: '已获批准：Need approval，继续推进下一步。',
      waitingReason: null,
    });
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith('task_1', 'task.decision_approved', {
      decisionId: 'decision_1',
      decisionTitle: 'Need approval',
      nextState: 'planned',
      suggestedAction: '基于已批准决策继续推进任务',
    });
    expect(result.state).toBe('planned');
    expect(result.nextStep).toBe('已获批准：Need approval，继续推进下一步。');
  });

  it('annotates a deferred decision as a waiting signal', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildDetail('planned')),
      update: vi.fn().mockResolvedValue({
        ...buildRecord('waiting_external'),
        nextStep: '跟进该决策是否可以恢复拍板，或准备替代推进路径。',
        waitingReason: '等待重新拍板：Need approval',
      }),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn().mockResolvedValue({
        ...buildRecord('waiting_external'),
        waitingReason: '等待重新拍板：Need approval',
      }),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn().mockResolvedValue({
        action: 'created',
        item: {
          id: 'waiting_1',
          taskId: 'task_1',
          reason: '等待重新拍板：Need approval',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          resolvedAt: null,
        },
      }),
      resolveActive: vi.fn(),
    };
    const service = new TaskService(repository as never, waitingItems as never);

    const result = await service.annotateDecisionDeferred('task_1', 'Need approval', 'decision_1');

    expect(repository.transition).toHaveBeenCalledWith({
      id: 'task_1',
      nextState: 'waiting_external',
      waitingReason: '等待重新拍板：Need approval',
    });
    expect(repository.update).toHaveBeenCalledWith({
      id: 'task_1',
      nextStep: '跟进该决策是否可以恢复拍板，或准备替代推进路径。',
      waitingReason: '等待重新拍板：Need approval',
    });
    expect(repository.appendTimelineEvent).toHaveBeenNthCalledWith(
      1,
      'task_1',
      'waiting_item.created',
      expect.objectContaining({
        waitingItemId: 'waiting_1',
        reason: '等待重新拍板：Need approval',
      }),
    );
    expect(repository.appendTimelineEvent).toHaveBeenNthCalledWith(
      2,
      'task_1',
      'task.decision_deferred',
      {
        decisionId: 'decision_1',
        decisionTitle: 'Need approval',
        waitingReason: '等待重新拍板：Need approval',
        suggestedAction: '跟进拍板时机，或准备替代路径',
      },
    );
    expect(result.state).toBe('waiting_external');
    expect(result.waitingReason).toBe('等待重新拍板：Need approval');
  });

  it('annotates a failed run as a high-risk signal', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildDetail('running')),
      update: vi.fn().mockResolvedValue({
        ...buildRecord('planned'),
        riskLevel: 'high',
        riskNote: 'Executor exploded',
        nextStep: '检查失败原因，修正输入或上下文后再决定是否重试。',
      }),
      appendTimelineEvent: vi.fn(),
      transition: vi
        .fn()
        .mockResolvedValueOnce({
          ...buildRecord('planned'),
          waitingReason: null,
        }),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn().mockResolvedValue(null),
    };
    const service = new TaskService(repository as never, waitingItems as never);

    const result = await service.annotateRunFailed('task_1', 'Executor exploded', 'run_1');

    expect(repository.update).toHaveBeenCalledWith({
      id: 'task_1',
      nextStep: '检查失败原因，修正输入或上下文后再决定是否重试。',
      riskLevel: 'high',
      riskNote: 'Executor exploded',
    });
    expect(repository.transition).toHaveBeenCalledWith({
      id: 'task_1',
      nextState: 'planned',
      waitingReason: null,
    });
    expect(waitingItems.resolveActive).toHaveBeenCalledWith('task_1');
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith('task_1', 'task.run_failed', {
      runId: 'run_1',
      failureReason: 'Executor exploded',
      suggestedAction: '检查失败原因并准备重试 Run',
    });
    expect(result.riskLevel).toBe('high');
  });

  it('annotates a completed run and restores the task to planned', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildDetail('running')),
      update: vi.fn().mockResolvedValue({
        ...buildRecord('planned'),
        nextStep: '审阅最新 draft 产物，并决定是否继续推进。',
      }),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn().mockResolvedValue({
        ...buildRecord('planned'),
        waitingReason: null,
      }),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn().mockResolvedValue(null),
    };
    const service = new TaskService(repository as never, waitingItems as never);

    const result = await service.annotateRunCompleted('task_1', 'draft', true, 'run_1');

    expect(repository.transition).toHaveBeenCalledWith({
      id: 'task_1',
      nextState: 'planned',
      waitingReason: null,
    });
    expect(repository.update).toHaveBeenCalledWith({
      id: 'task_1',
      nextStep: '审阅最新 draft 产物，并决定是否继续推进。',
    });
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith('task_1', 'task.run_completed', {
      runId: 'run_1',
      runType: 'draft',
      nextState: 'planned',
      hasOutput: true,
      suggestedAction: '审阅最新产物并继续推进',
    });
    expect(result.state).toBe('planned');
    expect(result.nextStep).toBe('审阅最新 draft 产物，并决定是否继续推进。');
  });

  it('creates a source context item and records a lifecycle event', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildDetail('planned')),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    };
    const sourceContexts = {
      listActiveForTask: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(buildSourceContextRecord()),
      update: vi.fn(),
      archive: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      waitingItems as never,
      null,
      sourceContexts as never,
    );

    const result = await service.createSourceContext({
      taskId: 'task_1',
      title: 'PRD',
      kind: 'doc',
      uri: 'https://example.com/prd',
      note: 'Primary doc',
    });

    expect(sourceContexts.create).toHaveBeenCalledWith({
      taskId: 'task_1',
      title: 'PRD',
      kind: 'doc',
      uri: 'https://example.com/prd',
      note: 'Primary doc',
    });
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith('task_1', 'source_context.created', {
      sourceContextId: 'source_context_1',
      title: 'PRD',
      kind: 'doc',
      isKey: false,
      uri: 'https://example.com/prd',
    });
    expect(result.id).toBe('source_context_1');
  });

  it('archives a source context item and records a lifecycle event', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn(),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    };
    const sourceContexts = {
      listActiveForTask: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn().mockResolvedValue(
        buildSourceContextRecord({
          status: 'archived',
          archivedAt: '2026-01-02T00:00:00.000Z',
        }),
      ),
    };
    const service = new TaskService(
      repository as never,
      waitingItems as never,
      null,
      sourceContexts as never,
    );

    const result = await service.archiveSourceContext('source_context_1');

    expect(sourceContexts.archive).toHaveBeenCalledWith('source_context_1');
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith('task_1', 'source_context.archived', {
      sourceContextId: 'source_context_1',
      title: 'PRD',
      kind: 'doc',
      isKey: false,
    });
    expect(result.status).toBe('archived');
  });

  it('applies a process template and records a lifecycle event', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn(),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    };
    const processBindings = {
      listActiveForTask: vi.fn().mockResolvedValue([]),
      apply: vi.fn().mockResolvedValue({
        action: 'created',
        binding: buildAppliedProcessTemplateRecord(),
      }),
      remove: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      waitingItems as never,
      null,
      null,
      null,
      processBindings as never,
    );

    const result = await service.applyProcessTemplate({
      taskId: 'task_1',
      templateId: 'process_template_1',
    });

    expect(processBindings.apply).toHaveBeenCalledWith({
      taskId: 'task_1',
      templateId: 'process_template_1',
    });
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith('task_1', 'process_template.applied', {
      templateId: 'process_template_1',
      bindingId: 'task_process_binding_1',
      title: 'Outreach skill',
      kind: 'skill',
    });
    expect(result.bindingId).toBe('task_process_binding_1');
  });

  it('removes a process template binding and records a lifecycle event', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn(),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    };
    const processBindings = {
      listActiveForTask: vi.fn().mockResolvedValue([]),
      apply: vi.fn(),
      remove: vi.fn().mockResolvedValue(
        buildAppliedProcessTemplateRecord({
          bindingStatus: 'removed',
          removedAt: '2026-01-02T00:00:00.000Z',
        }),
      ),
    };
    const service = new TaskService(
      repository as never,
      waitingItems as never,
      null,
      null,
      null,
      processBindings as never,
    );

    const result = await service.removeProcessTemplate('task_process_binding_1');

    expect(processBindings.remove).toHaveBeenCalledWith('task_process_binding_1');
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith('task_1', 'process_template.removed', {
      templateId: 'process_template_1',
      bindingId: 'task_process_binding_1',
      title: 'Outreach skill',
      kind: 'skill',
    });
    expect(result.bindingStatus).toBe('removed');
  });
});
