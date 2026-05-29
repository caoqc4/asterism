import { describe, expect, it, vi } from 'vitest';

import type {
  AppliedProcessTemplateRecord,
  ProcessTemplateRecord,
} from '../../../shared/types/process-template.js';
import type { BlockerRecord } from '../../../shared/types/blocker.js';
import type { CompletionCriteriaRecord } from '../../../shared/types/completion-criteria.js';
import type { TaskDependencyRecord } from '../../../shared/types/task-dependency.js';
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
      completionStatus: {
        total: 0,
        satisfied: 0,
        open: 0,
        summary: '尚未定义完成标准',
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
    completionCriteria: [],
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
    responsibility: partial.responsibility ?? null,
    responsibilityLabel: partial.responsibilityLabel ?? null,
    sourceContextId: partial.sourceContextId ?? null,
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    resolvedAt: partial.resolvedAt ?? null,
  };
}

function buildTaskDependencyRecord(
  partial: Partial<TaskDependencyRecord> = {},
): TaskDependencyRecord {
  return {
    id: partial.id ?? 'task_dependency_1',
    taskId: partial.taskId ?? 'task_1',
    blockedByTaskId: partial.blockedByTaskId ?? 'task_2',
    blockedByTaskTitle: partial.blockedByTaskTitle ?? 'Publish partner list',
    reason: partial.reason ?? 'Need the upstream partner list before continuing',
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    resolvedAt: partial.resolvedAt ?? null,
  };
}

function buildCompletionCriteriaRecord(
  partial: Partial<CompletionCriteriaRecord> = {},
): CompletionCriteriaRecord {
  return {
    id: partial.id ?? 'criteria_1',
    taskId: partial.taskId ?? 'task_1',
    text: partial.text ?? 'Stakeholder approved final brief',
    verificationResponsibility: partial.verificationResponsibility ?? null,
    verificationResponsibilityLabel: partial.verificationResponsibilityLabel ?? null,
    status: partial.status ?? 'open',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    satisfiedAt: partial.satisfiedAt ?? null,
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
    capturedAt: partial.capturedAt ?? '2026-01-01T00:00:00.000Z',
      runId: partial.runId ?? null,
      batchId: partial.batchId ?? null,
      sourceRole: partial.sourceRole ?? 'raw',
      credibility: partial.credibility ?? null,
      isDuplicate: partial.isDuplicate ?? false,
      containsSensitiveData: partial.containsSensitiveData ?? false,
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
  it('blocks duplicate open task creation at the service boundary', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([
        buildRecord('running'),
      ]),
      create: vi.fn(),
      getDetail: vi.fn(),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
    );

    await expect(service.create({ title: 'Task 1' })).rejects.toThrow(
      '任务捕获暂不能继续：已有未完成任务「Task 1」，不应重复捕获同名任务。',
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('allows specific new task creation after the service capture guard passes', async () => {
    const created = {
      ...buildRecord('captured'),
      id: 'task_new',
      title: '整理验收清单',
      summary: '汇总现有子任务的验收标准。',
    };
    const repository = {
      list: vi.fn().mockResolvedValue([
        buildRecord('running'),
      ]),
      create: vi.fn().mockResolvedValue(created),
      getDetail: vi.fn(),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
    );

    await expect(service.create({
      title: '整理验收清单',
      summary: '汇总现有子任务的验收标准。',
    })).resolves.toMatchObject({
      id: 'task_new',
      title: '整理验收清单',
    });
    expect(repository.create).toHaveBeenCalledWith({
      title: '整理验收清单',
      summary: '汇总现有子任务的验收标准。',
    });
  });

  it('preserves business-line ownership when creating an execution task', async () => {
    const created = {
      ...buildRecord('captured'),
      id: 'task_business_line_action',
      title: '推进业务线动作',
      businessLineId: 'business_line_product',
    };
    const repository = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(created),
      getDetail: vi.fn(),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
    );

    await expect(service.create({
      title: '推进业务线动作',
      businessLineId: 'business_line_product',
    })).resolves.toMatchObject({
      id: 'task_business_line_action',
      businessLineId: 'business_line_product',
    });
    expect(repository.create).toHaveBeenCalledWith({
      title: '推进业务线动作',
      businessLineId: 'business_line_product',
    });
  });

  it('allows same child title under a different project scope', async () => {
    const created = {
      ...buildRecord('captured'),
      id: 'child_2',
      title: '需求分析',
      parentTaskId: 'project_2',
    };
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('running'),
          id: 'project_2',
          title: '项目二',
          parentTaskId: null,
          childTaskIds: [],
        },
        {
          ...buildRecord('running'),
          id: 'child_1',
          title: '需求分析',
          parentTaskId: 'project_1',
        },
      ]),
      create: vi.fn().mockResolvedValue(created),
      getDetail: vi.fn(),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
    );

    await expect(service.create({
      title: '需求分析',
      summary: '确认项目二的需求范围。',
      parentTaskId: 'project_2',
    })).resolves.toMatchObject({
      id: 'child_2',
      parentTaskId: 'project_2',
    });
    expect(repository.create).toHaveBeenCalled();
  });

  it('blocks duplicate child titles under the same project scope', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('running'),
          id: 'project_1',
          title: '项目一',
          parentTaskId: null,
          childTaskIds: ['child_1'],
        },
        {
          ...buildRecord('running'),
          id: 'child_1',
          title: '需求分析',
          parentTaskId: 'project_1',
        },
      ]),
      create: vi.fn(),
      getDetail: vi.fn(),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
    );

    await expect(service.create({
      title: '需求分析',
      summary: '重复创建同一项目下的需求分析。',
      parentTaskId: 'project_1',
    })).rejects.toThrow('已有未完成任务「需求分析」');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('blocks generic phase-template task creation before persistence', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('running'),
          id: 'project_1',
          title: '开发小程序',
          parentTaskId: null,
          childTaskIds: ['child_1'],
        },
      ]),
      create: vi.fn(),
      getDetail: vi.fn(),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
    );

    await expect(service.create({
      title: '验收回归：开发小程序',
      summary: '检查阶段收尾。',
    })).rejects.toThrow('任务标题像阶段模板');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('syncs parent child ids when creating a child task', async () => {
    const created = {
      ...buildRecord('captured'),
      id: 'child_1',
      title: '需求分析',
      parentTaskId: 'project_1',
    };
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('running'),
          id: 'project_1',
          title: '开发小程序',
          childTaskIds: [],
        },
      ]),
      create: vi.fn().mockResolvedValue(created),
      getDetail: vi.fn(),
      update: vi.fn().mockResolvedValue(buildRecord('running')),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
    );

    await expect(service.create({
      title: '需求分析',
      summary: '明确项目边界。',
      parentTaskId: 'project_1',
    })).resolves.toMatchObject({
      id: 'child_1',
      parentTaskId: 'project_1',
    });
    expect(repository.update).toHaveBeenCalledWith({
      id: 'project_1',
      childTaskIds: ['child_1'],
    });
  });

  it('blocks child task creation when the parent task does not exist', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      getDetail: vi.fn(),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
    );

    await expect(service.create({
      title: '需求分析',
      summary: '明确项目边界。',
      parentTaskId: 'missing_project',
    })).rejects.toThrow('Parent task not found: missing_project');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('blocks child task creation under a non-project parent', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('running'),
          id: 'task_parent',
          title: '普通任务',
          taskType: 'simple',
          parentTaskId: null,
          childTaskIds: [],
        },
      ]),
      create: vi.fn(),
      getDetail: vi.fn(),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
    );

    await expect(service.create({
      title: '补充步骤',
      summary: '补充普通任务的执行步骤。',
      parentTaskId: 'task_parent',
    })).rejects.toThrow('必须是项目型任务');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('blocks child task creation under a non-project child task', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('running'),
          id: 'project_1',
          title: '项目一',
          taskType: 'project',
          parentTaskId: null,
          childTaskIds: ['child_1'],
        },
        {
          ...buildRecord('running'),
          id: 'child_1',
          title: '需求分析',
          taskType: 'simple',
          parentTaskId: 'project_1',
          childTaskIds: [],
        },
      ]),
      create: vi.fn(),
      getDetail: vi.fn(),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
    );

    await expect(service.create({
      title: '三级任务',
      summary: '普通子任务不能继续拆分。',
      parentTaskId: 'child_1',
    })).rejects.toThrow('必须是项目型任务');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('allows child task creation under a project child task', async () => {
    const created = {
      ...buildRecord('captured'),
      id: 'grandchild_1',
      title: '前端实现',
      parentTaskId: 'child_1',
    };
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('running'),
          id: 'project_1',
          title: '网站项目',
          taskType: 'project',
          parentTaskId: null,
          childTaskIds: ['child_1'],
        },
        {
          ...buildRecord('running'),
          id: 'child_1',
          title: '代码实现',
          taskType: 'project',
          parentTaskId: 'project_1',
          childTaskIds: [],
        },
      ]),
      create: vi.fn().mockResolvedValue(created),
      getDetail: vi.fn(),
      update: vi.fn().mockResolvedValue(buildRecord('running')),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
    );

    await expect(service.create({
      title: '前端实现',
      summary: '实现网站前端页面。',
      parentTaskId: 'child_1',
    })).resolves.toMatchObject({
      id: 'grandchild_1',
      parentTaskId: 'child_1',
    });
    expect(repository.update).toHaveBeenCalledWith({
      id: 'child_1',
      childTaskIds: ['grandchild_1'],
    });
  });

  it('returns hierarchy consistency diagnostics from current task records', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('running'),
          id: 'project_1',
          title: '项目一',
          childTaskIds: [],
        },
        {
          ...buildRecord('running'),
          id: 'child_1',
          title: '需求分析',
          parentTaskId: 'project_1',
        },
      ]),
      create: vi.fn(),
      getDetail: vi.fn(),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
    );

    await expect(service.getHierarchyConsistency()).resolves.toMatchObject({
      consistent: false,
      issues: [
        {
          code: 'missing_parent_child_link',
          taskId: 'project_1',
          relatedTaskId: 'child_1',
        },
      ],
    });
  });

  it('applies only safe task hierarchy repairs', async () => {
    const project = {
      ...buildRecord('running'),
      id: 'project_1',
      title: '项目一',
      childTaskIds: ['child_missing_parent'],
    };
    const childMissingParent = {
      ...buildRecord('running'),
      id: 'child_missing_parent',
      title: '需求分析',
      parentTaskId: null,
      childTaskIds: [],
    };
    const childMissingParentLink = {
      ...buildRecord('running'),
      id: 'child_missing_parent_link',
      title: '实现开发',
      parentTaskId: 'project_1',
      childTaskIds: [],
    };
    const unrelatedParent = {
      ...buildRecord('running'),
      id: 'project_2',
      title: '项目二',
      childTaskIds: ['conflicted_child'],
    };
    const conflictedChild = {
      ...buildRecord('running'),
      id: 'conflicted_child',
      title: '冲突子任务',
      parentTaskId: 'project_1',
      childTaskIds: [],
    };
    const repository = {
      list: vi.fn()
        .mockResolvedValueOnce([
          project,
          childMissingParent,
          childMissingParentLink,
          unrelatedParent,
          conflictedChild,
        ])
        .mockResolvedValueOnce([
          {
            ...project,
            childTaskIds: ['child_missing_parent', 'child_missing_parent_link'],
          },
          {
            ...childMissingParent,
            parentTaskId: 'project_1',
          },
          childMissingParentLink,
          unrelatedParent,
          conflictedChild,
        ]),
      create: vi.fn(),
      getDetail: vi.fn(),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
    );

    await expect(service.applySafeHierarchyRepairs()).resolves.toMatchObject({
      appliedActionCount: 2,
      skippedManualReviewCount: 2,
      before: {
        safeActionCount: 2,
        manualReviewCount: 2,
      },
      after: {
        safeActionCount: 0,
      },
    });
    expect(repository.update).toHaveBeenCalledWith({
      id: 'child_missing_parent',
      parentTaskId: 'project_1',
    });
    expect(repository.update).toHaveBeenCalledWith({
      id: 'project_1',
      childTaskIds: ['child_missing_parent', 'child_missing_parent_link'],
    });
  });

  it('returns manual-review policy for hierarchy conflicts', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('running'),
          id: 'project_1',
          title: '项目一',
          childTaskIds: ['missing_child'],
        },
      ]),
      create: vi.fn(),
      getDetail: vi.fn(),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
    );

    await expect(service.getHierarchyManualReviewPolicy()).resolves.toMatchObject({
      required: true,
      items: [
        {
          reason: 'missing_record',
          issue: {
            code: 'missing_child_record',
            taskId: 'project_1',
            relatedTaskId: 'missing_child',
          },
        },
      ],
    });
  });

  it('applies an explicit manual hierarchy resolution for unique parentage', async () => {
    const projectOne = {
      ...buildRecord('running'),
      id: 'project_1',
      title: '项目一',
      childTaskIds: ['child_1'],
    };
    const projectTwo = {
      ...buildRecord('running'),
      id: 'project_2',
      title: '项目二',
      childTaskIds: ['child_1'],
    };
    const child = {
      ...buildRecord('running'),
      id: 'child_1',
      title: '需求分析',
      parentTaskId: 'project_2',
      childTaskIds: [],
    };
    const repository = {
      list: vi.fn()
        .mockResolvedValueOnce([projectOne, projectTwo, child])
        .mockResolvedValueOnce([
          { ...projectOne, childTaskIds: [] },
          projectTwo,
          child,
        ]),
      create: vi.fn(),
      getDetail: vi.fn(),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
    );

    await expect(service.applyHierarchyManualResolution({
      kind: 'set_unique_parent',
      taskId: 'child_1',
      targetParentTaskId: 'project_2',
    })).resolves.toMatchObject({
      applied: true,
    });
    expect(repository.update).toHaveBeenCalledWith({
      id: 'project_1',
      childTaskIds: [],
    });
  });

  it('applies explicit manual hierarchy cleanup for missing and malformed references', async () => {
    const project = {
      ...buildRecord('running'),
      id: 'project_1',
      title: '项目一',
      childTaskIds: ['child_1', 'child_1', 'missing_child'],
    };
    const loop = {
      ...buildRecord('running'),
      id: 'loop',
      title: '循环任务',
      parentTaskId: 'loop',
      childTaskIds: ['loop'],
    };
    const repository = {
      list: vi.fn()
        .mockResolvedValueOnce([project, loop])
        .mockResolvedValueOnce([{
          ...project,
          childTaskIds: ['child_1', 'child_1'],
        }, loop])
        .mockResolvedValueOnce([project, loop])
        .mockResolvedValueOnce([{
          ...project,
          childTaskIds: ['child_1', 'missing_child'],
        }, loop])
        .mockResolvedValueOnce([project, loop])
        .mockResolvedValueOnce([project, {
          ...loop,
          parentTaskId: null,
          childTaskIds: [],
        }]),
      create: vi.fn(),
      getDetail: vi.fn(),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
    );

    await service.applyHierarchyManualResolution({
      kind: 'remove_child_reference',
      taskId: 'project_1',
      relatedTaskId: 'missing_child',
    });
    await service.applyHierarchyManualResolution({
      kind: 'dedupe_child_reference',
      taskId: 'project_1',
      relatedTaskId: 'child_1',
    });
    await service.applyHierarchyManualResolution({
      kind: 'remove_self_reference',
      taskId: 'loop',
      relatedTaskId: 'loop',
    });

    expect(repository.update).toHaveBeenCalledWith({
      id: 'project_1',
      childTaskIds: ['child_1', 'child_1'],
    });
    expect(repository.update).toHaveBeenCalledWith({
      id: 'project_1',
      childTaskIds: ['child_1', 'missing_child'],
    });
    expect(repository.update).toHaveBeenCalledWith({
      id: 'loop',
      parentTaskId: null,
      childTaskIds: [],
    });
  });

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
          responsibility: 'external_team',
          responsibilityLabel: '法务团队确认',
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
    expect(detail?.resumeCard.currentBlocker).toMatchObject({
      blockerId: 'blocker_1',
      title: 'Legal approval pending',
      detail: 'Need formal sign-off before launch',
      priorityReason: expect.stringContaining('当前主阻塞项：Need formal sign-off before launch'),
      ageLabel: expect.stringContaining('blocked since 2026-01-01'),
      responsibilitySummary: '解除责任：法务团队确认',
    });
    expect(detail?.resumeCard.keySource.title).toBe('Partner website shortlist');
    expect(detail?.resumeCard.keySource.priorityReason).toBe(
      '当前在材料架中被标记为关键来源：Latest approved outreach targets',
    );
    expect(detail?.resumeCard.currentMethod.title).toBe('Outreach skill');
    expect(detail?.resumeCard.currentMethod.selectionReason).toBe(
      '当前任务最近采用该方法：来源材料已更新，适合先按 outreach 方法整理外链目标。',
    );
    expect(detail?.resumeCard.nextSuggestedMove).toBe(
      '基于来源更新重新判断是否解除阻塞：Legal approval pending',
    );
    expect(detail?.resumeCard.currentState).toContain('阻塞：Legal approval pending');
  });

  it('does not label a non-key source as the most important resume source', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildDetail('planned'),
        timeline: [
          {
            id: 'timeline_1',
            taskId: 'task_1',
            type: 'source_context.updated',
            payload: JSON.stringify({
              sourceContextId: 'source_context_recent',
              title: 'General research note',
            }),
            createdAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      }),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
      { listRecentForTask: vi.fn().mockResolvedValue([]) } as never,
      {
        listActiveForTask: vi.fn().mockResolvedValue([
          buildSourceContextRecord({
            id: 'source_context_recent',
            title: 'General research note',
            isKey: false,
            note: 'Recent but not pinned',
          }),
        ]),
      } as never,
      { listActive: vi.fn().mockResolvedValue([]) } as never,
      { listActiveForTask: vi.fn().mockResolvedValue([]) } as never,
      { getActiveForTask: vi.fn().mockResolvedValue(null) } as never,
    );

    const detail = await service.getDetail('task_1');

    expect(detail?.resumeCard.summary).toContain('当前最近更新的来源材料是“General research note”。');
    expect(detail?.resumeCard.summary).not.toContain('当前最关键的来源材料是“General research note”');
    expect(detail?.resumeCard.keySource).toMatchObject({
      sourceContextId: 'source_context_recent',
      title: 'General research note',
      priorityReason: '当前材料架里该来源最近更新，建议先查看。',
    });
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
            id: 'timeline_process_applied',
            taskId: 'task_1',
            type: 'process_template.applied',
            payload: JSON.stringify({
              templateId: 'process_template_1',
              title: 'Outreach method',
            }),
            createdAt: '2026-01-02T02:00:00.000Z',
          },
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

  it('treats approved decisions and completed runs as closeout evidence on near-completion tasks', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildDetail('planned'),
        nextStep: null,
        timeline: [
          {
            id: 'timeline_decision_approved',
            taskId: 'task_1',
            type: 'task.decision_approved',
            payload: JSON.stringify({
              decisionId: 'decision_1',
              decisionTitle: 'Approve final launch brief',
            }),
            createdAt: '2026-01-03T00:00:00.000Z',
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
    const completionCriteria = {
      listForTask: vi.fn().mockResolvedValue([
        buildCompletionCriteriaRecord({
          id: 'criteria_satisfied',
          status: 'satisfied',
          text: 'Draft delivered',
          satisfiedAt: '2026-01-02T00:00:00.000Z',
        }),
        buildCompletionCriteriaRecord({
          id: 'criteria_open',
          text: 'Final launch brief approved',
          verificationResponsibility: 'self',
          verificationResponsibilityLabel: '我自己确认',
        }),
      ]),
    };
    const service = new TaskService(
      repository as never,
      waitingItems as never,
      null,
      null,
      null,
      null,
      null,
      null,
      completionCriteria as never,
    );

    const detail = await service.getDetail('task_1');

    expect(detail?.resumeCard.completionStatus).toMatchObject({
      total: 2,
      satisfied: 1,
      open: 1,
      satisfiedCriteriaHighlights: ['Draft delivered'],
      nextOpenCriterion: 'Final launch brief approved',
      nextOpenResponsibilitySummary: '确认责任：我自己确认',
    });
    expect(detail?.resumeCard.latestChange.summary).toBe(
      '最近一条决策已获批准：Approve final launch brief，这可能说明某些完成标准已具备。',
    );
    expect(detail?.resumeCard.nextSuggestedMove).toBe(
      '先对照 Completion Criteria，判断这次批准是否已满足完成标准。',
    );
  });

  it('uses dependency re-evaluation wording in the task resume card when an upstream task completes', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId === 'task_upstream') {
          return {
            ...buildDetail('completed'),
            id: 'task_upstream',
            title: 'Publish partner list',
            state: 'completed',
            updatedAt: '2026-01-03T00:00:00.000Z',
          };
        }

        return {
          ...buildDetail('planned'),
          nextStep: null,
          activeDependency: buildTaskDependencyRecord({
            id: 'task_dependency_1',
            taskId: 'task_1',
            blockedByTaskId: 'task_upstream',
            blockedByTaskTitle: 'Publish partner list',
            createdAt: '2026-01-02T00:00:00.000Z',
          }),
          timeline: [],
        };
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
    const dependencies = {
      getActiveForTask: vi.fn().mockResolvedValue(
        buildTaskDependencyRecord({
          id: 'task_dependency_1',
          taskId: 'task_1',
          blockedByTaskId: 'task_upstream',
          blockedByTaskTitle: 'Publish partner list',
          createdAt: '2026-01-02T00:00:00.000Z',
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
      null,
      dependencies as never,
    );

    const detail = await service.getDetail('task_1');

    expect(detail?.dependencyReevaluation).toMatchObject({
      dependencyId: 'task_dependency_1',
      upstreamTaskId: 'task_upstream',
      upstreamTaskTitle: 'Publish partner list',
      status: 'upstream_ready',
    });
    expect(detail?.resumeCard.latestChange.summary).toBe(
      '上游任务已完成：Publish partner list，可重新判断当前依赖。',
    );
    expect(detail?.resumeCard.currentDependency).toMatchObject({
      title: 'Publish partner list',
      detail: '上游任务“Publish partner list”已完成，可重新判断是否解除依赖。',
      priorityReason: '上游任务“Publish partner list”已完成，可重新判断是否解除依赖。',
      responsibilitySummary: '推进责任：上游任务“Publish partner list”',
    });
    expect(detail?.resumeCard.summary).toContain('当前依赖已具备恢复推进条件');
    expect(detail?.resumeCard.nextSuggestedMove).toBe(
      '确认上游任务就绪后的下一步推进：Publish partner list',
    );
  });

  it('uses clarify-first recovery wording for newly captured tasks', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildDetail('captured'),
        summary: null,
        nextStep: null,
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

    expect(detail?.resumeCard.latestChange.summary).toBe('这条任务刚进入系统，先补清摘要与下一步。');
    expect(detail?.resumeCard.nextSuggestedMove).toBe('先补一句任务摘要，再明确下一步。');
  });

  it('elevates stale dependencies into task resume summaries and latest change guidance', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId === 'task_upstream') {
          return {
            ...buildDetail('planned'),
            id: 'task_upstream',
            title: 'Finalize legal brief',
            updatedAt: '2026-01-21T00:00:00.000Z',
          };
        }

        return {
          ...buildDetail('planned'),
          nextStep: null,
          timeline: [],
        };
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
    const dependencies = {
      getActiveForTask: vi.fn().mockResolvedValue(
        buildTaskDependencyRecord({
          id: 'task_dependency_stale_1',
          taskId: 'task_1',
          blockedByTaskId: 'task_upstream',
          blockedByTaskTitle: 'Finalize legal brief',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
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
      null,
      dependencies as never,
    );

    const detail = await service.getDetail('task_1');

    expect(detail?.resumeCard.latestChange.summary).toBe(
      '这条依赖链已持续较久：Finalize legal brief，值得优先升级处理。',
    );
    expect(detail?.resumeCard.summary).toContain(
      '当前依赖链已持续较久：上游任务“Finalize legal brief”仍未打通，值得优先升级处理。',
    );
    expect(detail?.resumeCard.nextSuggestedMove).toBe('优先升级依赖链路：Finalize legal brief');
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
      get: vi.fn().mockResolvedValue(buildBlockerRecord()),
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

  it('blocks empty blocker titles before persistence', async () => {
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
      getActiveForTask: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      resolve: vi.fn(),
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

    await expect(service.createBlocker({
      taskId: 'task_1',
      title: ' ',
      kind: 'other',
    })).rejects.toThrow('阻塞项缺少标题');
    await expect(service.updateBlocker({
      id: 'blocker_1',
      title: '',
    })).rejects.toThrow('阻塞项缺少标题');
    expect(blockers.create).not.toHaveBeenCalled();
    expect(blockers.update).not.toHaveBeenCalled();
  });

  it('creates and resolves task dependency objects with task timeline events', async () => {
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
    const dependencies = {
      getActiveForTask: vi.fn().mockResolvedValueOnce(null),
      get: vi.fn().mockResolvedValue(buildTaskDependencyRecord()),
      create: vi.fn().mockResolvedValue(
        buildTaskDependencyRecord({
          blockedByTaskId: 'task_upstream',
          blockedByTaskTitle: 'Publish partner list',
          reason: 'Need the final partner list before outreach starts',
        }),
      ),
      update: vi.fn(),
      resolve: vi.fn().mockResolvedValue(
        buildTaskDependencyRecord({
          status: 'resolved',
          resolvedAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
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
      null,
      dependencies as never,
    );

    const created = await service.createTaskDependency({
      taskId: 'task_1',
      blockedByTaskId: 'task_upstream',
      reason: 'Need the final partner list before outreach starts',
    });
    const resolved = await service.resolveTaskDependency(created.id);

    expect(dependencies.create).toHaveBeenCalledWith({
      taskId: 'task_1',
      blockedByTaskId: 'task_upstream',
      reason: 'Need the final partner list before outreach starts',
    });
    expect(repository.appendTimelineEvent).toHaveBeenNthCalledWith(
      1,
      'task_1',
      'task_dependency.created',
      expect.objectContaining({
        dependencyId: 'task_dependency_1',
        blockedByTaskId: 'task_upstream',
        blockedByTaskTitle: 'Publish partner list',
      }),
    );
    expect(dependencies.resolve).toHaveBeenCalledWith('task_dependency_1');
    expect(repository.appendTimelineEvent).toHaveBeenNthCalledWith(
      2,
      'task_1',
      'task_dependency.resolved',
      expect.objectContaining({
        dependencyId: 'task_dependency_1',
        status: 'resolved',
      }),
    );
    expect(resolved.status).toBe('resolved');
  });

  it('blocks self task dependencies before persistence', async () => {
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
    const dependencies = {
      getActiveForTask: vi.fn(),
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      resolve: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      waitingItems as never,
      null,
      null,
      null,
      null,
      null,
      dependencies as never,
    );

    await expect(service.createTaskDependency({
      taskId: 'task_1',
      blockedByTaskId: 'task_1',
    })).rejects.toThrow('任务不能依赖自己');
    expect(repository.getDetail).not.toHaveBeenCalled();
    expect(dependencies.create).not.toHaveBeenCalled();
  });

  it('blocks dependency updates that would make a task depend on itself', async () => {
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
    const dependencies = {
      getActiveForTask: vi.fn(),
      create: vi.fn(),
      get: vi.fn().mockResolvedValue(buildTaskDependencyRecord({
        id: 'task_dependency_1',
        taskId: 'task_1',
        blockedByTaskId: 'task_upstream',
      })),
      update: vi.fn(),
      resolve: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      waitingItems as never,
      null,
      null,
      null,
      null,
      null,
      dependencies as never,
    );

    await expect(service.updateTaskDependency({
      id: 'task_dependency_1',
      blockedByTaskId: 'task_1',
    })).rejects.toThrow('任务不能依赖自己');
    expect(dependencies.update).not.toHaveBeenCalled();
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

  it('blocks transition to running when the task still has an active blocker', async () => {
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
      getActiveForTask: vi.fn().mockResolvedValue(buildBlockerRecord()),
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      resolve: vi.fn(),
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

    await expect(service.transition({
      id: 'task_1',
      nextState: 'running',
    })).rejects.toThrow('仍有阻塞、依赖或等待状态');
    expect(repository.transition).not.toHaveBeenCalled();
  });

  it('blocks transitionIfAllowed to running when the task still has an active dependency', async () => {
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
    const dependencies = {
      getActiveForTask: vi.fn().mockResolvedValue(buildTaskDependencyRecord()),
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      resolve: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      waitingItems as never,
      null,
      null,
      null,
      null,
      null,
      dependencies as never,
    );

    await expect(service.transitionIfAllowed('task_1', 'running')).rejects.toThrow(
      '仍有阻塞、依赖或等待状态',
    );
    expect(repository.transition).not.toHaveBeenCalled();
  });

  it('records task completion check results as timeline events', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildDetail('planned')),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never, {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    } as never);

    await service.recordCompletionCheck({
      taskId: 'task_1',
      action: 'override_completed',
      criteriaTotal: 3,
      criteriaSatisfied: 2,
      criteriaOpen: 1,
      reason: '仍有 1 条完成标准未满足',
      runVerificationTone: 'warn',
      runVerificationLabel: 'Run 需补验证',
      runVerificationDetail: 'Run 已完成，但缺少可复核输出。',
      source: 'task_completion_modal',
      checkedAt: '2026-05-05T10:00:00.000Z',
    });

    expect(repository.appendTimelineEvent).toHaveBeenCalledWith(
      'task_1',
      'task.completion_check',
      {
        action: 'override_completed',
        criteriaTotal: 3,
        criteriaSatisfied: 2,
        criteriaOpen: 1,
        reason: '仍有 1 条完成标准未满足',
        runVerificationTone: 'warn',
        runVerificationLabel: 'Run 需补验证',
        runVerificationDetail: 'Run 已完成，但缺少可复核输出。',
        source: 'task_completion_modal',
        checkedAt: '2026-05-05T10:00:00.000Z',
      },
    );
  });

  it('blocks completion transition when completion memory evidence is missing', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildDetail('running'),
        completionCriteria: [buildCompletionCriteriaRecord({ status: 'satisfied' })],
      }),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never, {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    } as never);

    await expect(service.transition({
      id: 'task_1',
      nextState: 'completed',
    })).rejects.toThrow('任务完成前应保留足够的完成证据或输出引用');

    expect(repository.transition).not.toHaveBeenCalled();
  });

  it('allows completion transition after a passed completion check is recorded', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildDetail('running'),
        completionCriteria: [buildCompletionCriteriaRecord({
          status: 'satisfied',
          satisfiedAt: '2026-05-15T01:00:00.000Z',
        })],
        timeline: [{
          id: 'event_1',
          taskId: 'task_1',
          type: 'task.completion_check',
          payload: JSON.stringify({ action: 'passed' }),
          createdAt: '2026-05-15T01:01:00.000Z',
        }],
      }),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn().mockResolvedValue(buildRecord('completed')),
    };
    const service = new TaskService(repository as never, {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    } as never);

    const result = await service.transition({
      id: 'task_1',
      nextState: 'completed',
    });

    expect(repository.transition).toHaveBeenCalledWith({
      id: 'task_1',
      nextState: 'completed',
      waitingReason: null,
    });
    expect(result.state).toBe('completed');
  });

  it('uses repository-backed task memory surfaces when completing a task', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildDetail('running'),
        completionCriteria: [],
        sourceContexts: [],
        timeline: [{
          id: 'event_1',
          taskId: 'task_1',
          type: 'task.completion_check',
          payload: JSON.stringify({ action: 'passed' }),
          createdAt: '2026-05-15T01:01:00.000Z',
        }],
      }),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn().mockResolvedValue(buildRecord('completed')),
    };
    const completionCriteria = {
      listForTask: vi.fn().mockResolvedValue([buildCompletionCriteriaRecord({
        status: 'satisfied',
        satisfiedAt: '2026-05-15T01:00:00.000Z',
        updatedAt: '2026-05-15T01:00:00.000Z',
      })]),
    };
    const sourceContexts = {
      listActiveForTask: vi.fn().mockResolvedValue([buildSourceContextRecord({ isKey: true })]),
    };
    const service = new TaskService(
      repository as never,
      {
        getActiveForTask: vi.fn().mockResolvedValue(null),
        upsertActive: vi.fn(),
        resolveActive: vi.fn(),
      } as never,
      null,
      sourceContexts as never,
      null,
      null,
      null,
      null,
      completionCriteria as never,
    );

    const result = await service.transition({
      id: 'task_1',
      nextState: 'completed',
    });

    expect(completionCriteria.listForTask).toHaveBeenCalledWith('task_1');
    expect(sourceContexts.listActiveForTask).toHaveBeenCalledWith('task_1');
    expect(repository.transition).toHaveBeenCalledWith({
      id: 'task_1',
      nextState: 'completed',
      waitingReason: null,
    });
    expect(result.state).toBe('completed');
  });

  it('blocks project completion when child tasks are still open', async () => {
    const project = {
      ...buildDetail('running'),
      taskType: 'project' as const,
      childTaskIds: ['child_1'],
      completionCriteria: [buildCompletionCriteriaRecord({
        status: 'satisfied',
        satisfiedAt: '2026-05-15T01:00:00.000Z',
      })],
      timeline: [{
        id: 'event_1',
        taskId: 'task_1',
        type: 'task.completion_check',
        payload: JSON.stringify({ action: 'passed' }),
        createdAt: '2026-05-15T01:01:00.000Z',
      }],
    };
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('running'),
          id: 'child_1',
          title: 'Child 1',
          parentTaskId: 'task_1',
          childTaskIds: [],
        },
      ]),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(project),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never, {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    } as never);

    await expect(service.transition({
      id: 'task_1',
      nextState: 'completed',
    })).rejects.toThrow('项目仍有 1 个未完成子任务，应继续推进子任务。');

    expect(repository.transition).not.toHaveBeenCalled();
  });

  it('allows project completion after child tasks and parent criteria are complete', async () => {
    const project = {
      ...buildDetail('running'),
      taskType: 'project' as const,
      childTaskIds: ['child_1'],
      completionCriteria: [buildCompletionCriteriaRecord({
        status: 'satisfied',
        satisfiedAt: '2026-05-15T01:00:00.000Z',
      })],
      artifacts: [{
        id: 'artifact_1',
        taskId: 'task_1',
        sourceType: 'run',
        sourceId: 'run_1',
        kind: 'run_output',
        title: 'Project output',
        content: 'Output',
        createdAt: '2026-05-15T01:00:00.000Z',
        updatedAt: '2026-05-15T01:00:00.000Z',
      }],
      sourceContexts: [buildSourceContextRecord({
        isKey: true,
      })],
      timeline: [{
        id: 'event_1',
        taskId: 'task_1',
        type: 'task.completion_check',
        payload: JSON.stringify({ action: 'passed' }),
        createdAt: '2026-05-15T01:01:00.000Z',
      }],
    };
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('completed'),
          id: 'child_1',
          title: 'Child 1',
          parentTaskId: 'task_1',
          childTaskIds: [],
        },
      ]),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(project),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
      transition: vi.fn().mockResolvedValue(buildRecord('completed')),
    };
    const service = new TaskService(repository as never, {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    } as never);

    const result = await service.transition({
      id: 'task_1',
      nextState: 'completed',
    });

    expect(repository.transition).toHaveBeenCalledWith({
      id: 'task_1',
      nextState: 'completed',
      waitingReason: null,
    });
    expect(result.state).toBe('completed');
  });

  it('blocks running transition when task memory is not sufficient to start', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildDetail('planned'),
        nextStep: null,
        resumeCard: {
          ...buildDetail('planned').resumeCard,
          nextSuggestedMove: '',
        },
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

    await expect(service.transition({
      id: 'task_1',
      nextState: 'running',
    })).rejects.toThrow('任务开始前的恢复信息不足');

    expect(repository.transition).not.toHaveBeenCalled();
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

  it('requires an existing waiting reason when transitionIfAllowed enters waiting_external', async () => {
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
      service.transitionIfAllowed('task_1', 'waiting_external'),
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

  it('blocks moving a task into a project that already has an open child with the same title', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('running'),
          id: 'project_1',
          title: '项目一',
          parentTaskId: null,
          childTaskIds: ['child_2'],
        },
        {
          ...buildRecord('running'),
          id: 'project_2',
          title: '项目二',
          parentTaskId: null,
          childTaskIds: ['child_1'],
        },
        {
          ...buildRecord('running'),
          id: 'child_2',
          title: '需求分析',
          parentTaskId: 'project_1',
        },
      ]),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildDetail('planned'),
        id: 'child_1',
        title: '需求分析',
        parentTaskId: 'project_2',
      }),
      update: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never, {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    } as never);

    await expect(service.update({
      id: 'child_1',
      parentTaskId: 'project_1',
    })).rejects.toThrow('已有未完成任务「需求分析」');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('allows moving a task when the duplicate title is in a different parent scope', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('running'),
          id: 'project_1',
          title: '项目一',
          parentTaskId: null,
          childTaskIds: [],
        },
        {
          ...buildRecord('running'),
          id: 'child_2',
          title: '需求分析',
          parentTaskId: 'project_2',
        },
      ]),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildDetail('planned'),
        id: 'child_1',
        title: '需求分析',
        parentTaskId: null,
      }),
      update: vi.fn().mockResolvedValue({
        ...buildRecord('planned'),
        id: 'child_1',
        title: '需求分析',
        parentTaskId: 'project_1',
      }),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never, {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    } as never);

    await expect(service.update({
      id: 'child_1',
      parentTaskId: 'project_1',
    })).resolves.toMatchObject({
      id: 'child_1',
      parentTaskId: 'project_1',
    });
    expect(repository.update).toHaveBeenCalledWith({
      id: 'child_1',
      parentTaskId: 'project_1',
      riskNote: null,
    });
    expect(repository.update).toHaveBeenCalledWith({
      id: 'project_1',
      childTaskIds: ['child_1'],
    });
  });

  it('moves child ids between parents when a task changes parent scope', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('running'),
          id: 'project_1',
          title: '项目一',
          parentTaskId: null,
          childTaskIds: ['child_1'],
        },
        {
          ...buildRecord('running'),
          id: 'project_2',
          title: '项目二',
          parentTaskId: null,
          childTaskIds: [],
        },
      ]),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildDetail('planned'),
        id: 'child_1',
        title: '需求分析',
        parentTaskId: 'project_1',
      }),
      update: vi.fn().mockResolvedValue({
        ...buildRecord('planned'),
        id: 'child_1',
        title: '需求分析',
        parentTaskId: 'project_2',
      }),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never, {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    } as never);

    await service.update({
      id: 'child_1',
      parentTaskId: 'project_2',
    });

    expect(repository.update).toHaveBeenCalledWith({
      id: 'child_1',
      parentTaskId: 'project_2',
      riskNote: null,
    });
    expect(repository.update).toHaveBeenCalledWith({
      id: 'project_1',
      childTaskIds: [],
    });
    expect(repository.update).toHaveBeenCalledWith({
      id: 'project_2',
      childTaskIds: ['child_1'],
    });
  });

  it('blocks moving a task under a missing parent', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildDetail('planned'),
        id: 'child_1',
        title: '需求分析',
        parentTaskId: null,
      }),
      update: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never, {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    } as never);

    await expect(service.update({
      id: 'child_1',
      parentTaskId: 'missing_project',
    })).rejects.toThrow('Parent task not found: missing_project');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('blocks moving a task under a non-project parent', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('running'),
          id: 'task_parent',
          title: '普通任务',
          taskType: 'simple',
          parentTaskId: null,
          childTaskIds: [],
        },
      ]),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildDetail('planned'),
        id: 'child_1',
        title: '需求分析',
        parentTaskId: null,
      }),
      update: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never, {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    } as never);

    await expect(service.update({
      id: 'child_1',
      parentTaskId: 'task_parent',
    })).rejects.toThrow('必须是项目型任务');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('syncs child parent ids when updating a parent child list', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('running'),
          id: 'project_1',
          title: '项目一',
          parentTaskId: null,
          childTaskIds: [],
        },
        {
          ...buildRecord('running'),
          id: 'child_1',
          title: '需求分析',
          parentTaskId: null,
          childTaskIds: [],
        },
      ]),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildDetail('planned'),
        id: 'project_1',
        title: '项目一',
        parentTaskId: null,
        childTaskIds: [],
      }),
      update: vi.fn().mockResolvedValue({
        ...buildRecord('planned'),
        id: 'project_1',
        title: '项目一',
        childTaskIds: ['child_1'],
      }),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never, {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    } as never);

    await service.update({
      id: 'project_1',
      childTaskIds: ['child_1', 'child_1'],
    });

    expect(repository.update).toHaveBeenCalledWith({
      id: 'project_1',
      childTaskIds: ['child_1'],
      riskNote: null,
    });
    expect(repository.update).toHaveBeenCalledWith({
      id: 'child_1',
      parentTaskId: 'project_1',
    });
  });

  it('clears child parent ids when removing children from a parent list', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('running'),
          id: 'project_1',
          title: '项目一',
          parentTaskId: null,
          childTaskIds: ['child_1'],
        },
        {
          ...buildRecord('running'),
          id: 'child_1',
          title: '需求分析',
          parentTaskId: 'project_1',
          childTaskIds: [],
        },
      ]),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildDetail('planned'),
        id: 'project_1',
        title: '项目一',
        parentTaskId: null,
        childTaskIds: ['child_1'],
      }),
      update: vi.fn().mockResolvedValue({
        ...buildRecord('planned'),
        id: 'project_1',
        title: '项目一',
        childTaskIds: [],
      }),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never, {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    } as never);

    await service.update({
      id: 'project_1',
      childTaskIds: [],
    });

    expect(repository.update).toHaveBeenCalledWith({
      id: 'project_1',
      childTaskIds: [],
      riskNote: null,
    });
    expect(repository.update).toHaveBeenCalledWith({
      id: 'child_1',
      parentTaskId: null,
    });
  });

  it('blocks parent child-list updates that reference missing or self child ids', async () => {
    const repository = {
      list: vi.fn().mockResolvedValue([
        {
          ...buildRecord('running'),
          id: 'project_1',
          title: '项目一',
          parentTaskId: null,
          childTaskIds: [],
        },
      ]),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildDetail('planned'),
        id: 'project_1',
        title: '项目一',
        parentTaskId: null,
        childTaskIds: [],
      }),
      update: vi.fn(),
      transition: vi.fn(),
    };
    const service = new TaskService(repository as never, {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    } as never);

    await expect(service.update({
      id: 'project_1',
      childTaskIds: ['missing_child'],
    })).rejects.toThrow('Child task not found: missing_child');
    await expect(service.update({
      id: 'project_1',
      childTaskIds: ['project_1'],
    })).rejects.toThrow('A task cannot be its own child');
    expect(repository.update).not.toHaveBeenCalled();
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

  it('annotates a paused run as review-needed without marking high risk', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildDetail('running')),
      update: vi.fn().mockResolvedValue({
        ...buildRecord('planned'),
        riskLevel: 'medium',
        riskNote: '等待先解除阻塞。',
        nextStep: '先处理 Run 暂停原因，再决定是否继续或重试。',
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

    const result = await service.annotateRunPaused('task_1', '等待先解除阻塞。', 'run_1');

    expect(repository.update).toHaveBeenCalledWith({
      id: 'task_1',
      nextStep: '先处理 Run 暂停原因，再决定是否继续或重试。',
      riskLevel: 'medium',
      riskNote: '等待先解除阻塞。',
    });
    expect(repository.transition).toHaveBeenCalledWith({
      id: 'task_1',
      nextState: 'planned',
      waitingReason: null,
    });
    expect(waitingItems.resolveActive).toHaveBeenCalledWith('task_1');
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith('task_1', 'task.run_paused', {
      runId: 'run_1',
      pauseReason: '等待先解除阻塞。',
      suggestedAction: '处理暂停原因后继续 Run',
    });
    expect(result.riskLevel).toBe('medium');
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
      sourceRole: 'raw',
      credibility: 'verified',
      containsSensitiveData: true,
    });

    expect(sourceContexts.create).toHaveBeenCalledWith({
      taskId: 'task_1',
      title: 'PRD',
      kind: 'doc',
      uri: 'https://example.com/prd',
      note: 'Primary doc',
      sourceRole: 'raw',
      credibility: 'verified',
      containsSensitiveData: true,
    });
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith('task_1', 'source_context.created', {
      sourceContextId: 'source_context_1',
      title: 'PRD',
      kind: 'doc',
      isKey: false,
      uri: 'https://example.com/prd',
      capturedAt: '2026-01-01T00:00:00.000Z',
      runId: null,
      batchId: null,
      sourceRole: 'raw',
      credibility: null,
      isDuplicate: false,
      containsSensitiveData: false,
    });
    expect(result.id).toBe('source_context_1');
  });

  it('normalizes generated source contexts into digest role before persistence', async () => {
    const repository = {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildDetail('planned')),
      update: vi.fn(),
      appendTimelineEvent: vi.fn(),
    };
    const waitingItems = {
      getActiveForTask: vi.fn().mockResolvedValue(null),
      upsertActive: vi.fn(),
      resolveActive: vi.fn(),
    };
    const sourceContexts = {
      listActiveForTask: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(buildSourceContextRecord({ sourceRole: 'digest' })),
      update: vi.fn(),
      archive: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      waitingItems as never,
      null,
      sourceContexts as never,
    );

    await service.createSourceContext({
      taskId: 'task_1',
      title: '阶段收尾记录',
      kind: 'note',
      note: '任务记录：阶段收尾、质量检查和执行交接。',
    });

    expect(sourceContexts.create).toHaveBeenCalledWith(expect.objectContaining({
      title: '阶段收尾记录',
      sourceRole: 'digest',
    }));
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith('task_1', 'source_context.created', expect.objectContaining({
      sourceRole: 'digest',
    }));
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
      get: vi.fn().mockResolvedValue(buildSourceContextRecord()),
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
        binding: buildAppliedProcessTemplateRecord({
          bindingNote: 'Use for outreach drafting',
        }),
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
      note: 'Use for outreach drafting',
    });

    expect(processBindings.apply).toHaveBeenCalledWith({
      taskId: 'task_1',
      templateId: 'process_template_1',
      note: 'Use for outreach drafting',
    });
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith('task_1', 'process_template.applied', {
      templateId: 'process_template_1',
      bindingId: 'task_process_binding_1',
      title: 'Outreach skill',
      kind: 'skill',
      action: 'created',
      note: 'Use for outreach drafting',
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
      get: vi.fn().mockResolvedValue(buildAppliedProcessTemplateRecord()),
      apply: vi.fn(),
      remove: vi.fn().mockResolvedValue(
        buildAppliedProcessTemplateRecord({
          bindingNote: 'No longer fits current task',
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
      note: 'No longer fits current task',
    });
    expect(result.bindingStatus).toBe('removed');
  });

  it('guards adjunct task state changes before persistence', async () => {
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
      get: vi.fn().mockResolvedValue(buildSourceContextRecord({ taskId: '' })),
      archive: vi.fn(),
    };
    await expect(new TaskService(
      repository as never,
      waitingItems as never,
      null,
      sourceContexts as never,
    ).archiveSourceContext('source_context_1')).rejects.toThrow('任务变更需要绑定任务上下文');
    expect(sourceContexts.archive).not.toHaveBeenCalled();

    const blockers = {
      get: vi.fn().mockResolvedValue(buildBlockerRecord({ taskId: '' })),
      resolve: vi.fn(),
    };
    await expect(new TaskService(
      repository as never,
      waitingItems as never,
      null,
      null,
      null,
      null,
      blockers as never,
    ).resolveBlocker('blocker_1')).rejects.toThrow('任务变更需要绑定任务上下文');
    expect(blockers.resolve).not.toHaveBeenCalled();

    const dependencies = {
      get: vi.fn().mockResolvedValue(buildTaskDependencyRecord({ taskId: '' })),
      resolve: vi.fn(),
    };
    await expect(new TaskService(
      repository as never,
      waitingItems as never,
      null,
      null,
      null,
      null,
      null,
      dependencies as never,
    ).resolveTaskDependency('task_dependency_1')).rejects.toThrow('任务变更需要绑定任务上下文');
    expect(dependencies.resolve).not.toHaveBeenCalled();

    const processBindings = {
      get: vi.fn().mockResolvedValue(buildAppliedProcessTemplateRecord({ taskId: '' })),
      remove: vi.fn(),
    };
    await expect(new TaskService(
      repository as never,
      waitingItems as never,
      null,
      null,
      null,
      processBindings as never,
    ).removeProcessTemplate('task_process_binding_1')).rejects.toThrow('任务变更需要绑定任务上下文');
    expect(processBindings.remove).not.toHaveBeenCalled();
    expect(repository.appendTimelineEvent).not.toHaveBeenCalled();
  });

  it('guards panel timeline events before persistence', async () => {
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
    const service = new TaskService(repository as never, waitingItems as never);

    await service.recordTimelineEvent({
      taskId: 'task_1',
      type: 'panel.task_file_written',
      payload: { path: 'Task.md' },
    });
    expect(repository.appendTimelineEvent).toHaveBeenCalledWith('task_1', 'panel.task_file_written', {
      path: 'Task.md',
    });

    await expect(service.recordTimelineEvent({
      taskId: '',
      type: 'panel.task_file_written',
      payload: { path: 'Task.md' },
    })).rejects.toThrow('任务变更需要绑定任务上下文');
    expect(repository.appendTimelineEvent).toHaveBeenCalledTimes(1);
  });

  it('creates and satisfies completion criteria while recording lifecycle events', async () => {
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
    const completionCriteriaRepository = {
      listForTask: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(buildCompletionCriteriaRecord()),
      get: vi.fn().mockResolvedValue(buildCompletionCriteriaRecord()),
      update: vi.fn(),
      satisfy: vi.fn().mockResolvedValue(
        buildCompletionCriteriaRecord({
          status: 'satisfied',
          satisfiedAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        }),
      ),
      reopen: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      waitingItems as never,
      null,
      null,
      null,
      null,
      null,
      null,
      completionCriteriaRepository as never,
    );

    const created = await service.createCompletionCriteria({
      taskId: 'task_1',
      text: 'Stakeholder approved final brief',
    });
    const satisfied = await service.satisfyCompletionCriteria(created.id);

    expect(completionCriteriaRepository.create).toHaveBeenCalledWith({
      taskId: 'task_1',
      text: 'Stakeholder approved final brief',
    });
    expect(completionCriteriaRepository.get).toHaveBeenCalledWith('criteria_1');
    expect(repository.appendTimelineEvent).toHaveBeenNthCalledWith(
      1,
      'task_1',
      'completion_criteria.created',
      {
        completionCriteriaId: 'criteria_1',
        text: 'Stakeholder approved final brief',
        status: 'open',
      },
    );
    expect(repository.appendTimelineEvent).toHaveBeenNthCalledWith(
      2,
      'task_1',
      'completion_criteria.satisfied',
      {
        completionCriteriaId: 'criteria_1',
        text: 'Stakeholder approved final brief',
        status: 'satisfied',
        satisfiedAt: '2026-01-02T00:00:00.000Z',
      },
    );
    expect(satisfied.status).toBe('satisfied');
  });

  it('guards completion criteria satisfaction before persistence', async () => {
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
    const completionCriteriaRepository = {
      get: vi.fn().mockResolvedValue(buildCompletionCriteriaRecord({ taskId: '' })),
      satisfy: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      waitingItems as never,
      null,
      null,
      null,
      null,
      null,
      null,
      completionCriteriaRepository as never,
    );

    await expect(service.satisfyCompletionCriteria('criteria_1')).rejects.toThrow(
      '任务变更需要绑定任务上下文',
    );

    expect(completionCriteriaRepository.satisfy).not.toHaveBeenCalled();
    expect(repository.appendTimelineEvent).not.toHaveBeenCalled();
  });

  it('guards completion criteria reopening before persistence', async () => {
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
    const completionCriteriaRepository = {
      get: vi.fn().mockResolvedValue(buildCompletionCriteriaRecord({ taskId: '' })),
      reopen: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      waitingItems as never,
      null,
      null,
      null,
      null,
      null,
      null,
      completionCriteriaRepository as never,
    );

    await expect(service.reopenCompletionCriteria('criteria_1')).rejects.toThrow(
      '任务变更需要绑定任务上下文',
    );

    expect(completionCriteriaRepository.reopen).not.toHaveBeenCalled();
    expect(repository.appendTimelineEvent).not.toHaveBeenCalled();
  });

  it('blocks generic or duplicate completion criteria before persistence', async () => {
    const repository = {
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
    const completionCriteriaRepository = {
      listForTask: vi.fn().mockResolvedValue([
        buildCompletionCriteriaRecord({
          id: 'criteria_existing',
          text: '用户确认验收清单。',
        }),
      ]),
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      satisfy: vi.fn(),
      reopen: vi.fn(),
    };
    const service = new TaskService(
      repository as never,
      waitingItems as never,
      null,
      null,
      null,
      null,
      null,
      null,
      completionCriteriaRepository as never,
    );

    await expect(service.createCompletionCriteria({
      taskId: 'task_1',
      text: '完成后能明确验收。',
    })).rejects.toThrow('完成标准过于泛化');
    await expect(service.createCompletionCriteria({
      taskId: 'task_1',
      text: '用户确认验收清单',
    })).rejects.toThrow('已有未满足完成标准');
    expect(completionCriteriaRepository.create).not.toHaveBeenCalled();
  });
});
