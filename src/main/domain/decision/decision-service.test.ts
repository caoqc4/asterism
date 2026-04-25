import { describe, expect, it, vi } from 'vitest';

const { generateObjectMock } = vi.hoisted(() => ({
  generateObjectMock: vi.fn(),
}));

vi.mock('ai', () => ({
  generateObject: generateObjectMock,
}));

import type { DecisionRecord } from '../../../shared/types/decision.js';
import type { AppliedProcessTemplateRecord } from '../../../shared/types/process-template.js';
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
    activeWaitingItem: null,
    activeBlocker: null,
    riskLevel: 'none',
    riskNote: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    resumeCard: {
      summary: 'Resume summary',
      currentState: '状态：planned',
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
      currentBlocker: {
        blockerId: null,
        title: '暂无当前阻塞项',
        detail: null,
      },
      nextSuggestedMove: 'Move forward',
    },
    artifacts: [],
    completionCriteria: [],
    sourceContexts: [],
    processTemplates: [],
    availableProcessTemplates: [],
    timeline: [],
  };
}

function buildAppliedTemplate(
  partial: Partial<AppliedProcessTemplateRecord> = {},
): AppliedProcessTemplateRecord {
  return {
    id: partial.id ?? 'process_template_1',
    title: partial.title ?? 'Approval skill',
    summary: partial.summary ?? 'Structure approval requests clearly',
    content: partial.content ?? '1. Summarize the ask\n2. State why it matters',
    kind: partial.kind ?? 'skill',
    tags: partial.tags ?? ['approval'],
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    archivedAt: partial.archivedAt ?? null,
    bindingId: partial.bindingId ?? 'task_process_binding_1',
    taskId: partial.taskId ?? 'task_1',
    bindingStatus: partial.bindingStatus ?? 'active',
    bindingNote: partial.bindingNote ?? null,
    boundAt: partial.boundAt ?? '2026-01-01T00:00:00.000Z',
    bindingUpdatedAt: partial.bindingUpdatedAt ?? '2026-01-01T00:00:00.000Z',
    removedAt: partial.removedAt ?? null,
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
  it('drafts a decision with selected process templates', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        title: 'Approve launch note',
        rationale: 'Current task needs explicit stakeholder approval before moving ahead.',
      },
    });
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn(),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue({
        ...buildTaskDetail(),
        riskLevel: 'high',
        riskNote: 'Need fast escalation',
        processTemplates: [buildAppliedTemplate()],
        resumeCard: {
          ...buildTaskDetail().resumeCard,
          currentBlocker: {
            ...buildTaskDetail().resumeCard.currentBlocker,
            responsibilitySummary: '解除责任：法务团队确认',
          },
          completionStatus: {
            total: 1,
            satisfied: 0,
            open: 1,
            summary: '还差 1 条完成标准',
            nextOpenCriterion: 'Approve launch note',
            nextOpenResponsibilitySummary: '确认责任：客户确认',
          },
        },
      }),
      annotateDecisionApproved: vi.fn(),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateProcessTemplateSelected: vi.fn(),
      annotateProcessTemplateSkipped: vi.fn(),
    };
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
        featureFlags: { enableScheduler: true },
      }),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: true,
        selectedTemplates: [buildAppliedTemplate()],
        reason: 'This task is waiting on stakeholder approval.',
      }),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      aiConfigService as never,
      processTemplateSelector as never,
    );

    const result = await service.draft({
      taskId: 'task_1',
      note: 'Need stakeholder sign-off',
    });

    expect(processTemplateSelector.select).toHaveBeenCalled();
    expect(taskService.annotateProcessTemplateSelected).toHaveBeenCalledWith(
      'task_1',
      'decision_draft',
      expect.stringContaining('decision_draft_'),
      ['process_template_1'],
      ['Approval skill'],
      'This task is waiting on stakeholder approval.',
    );
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('当前优先级语义：立即升级。组织输出时优先帮助用户升级处理高风险或长期阻塞事项。'),
      }),
    );
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('当前阻塞解除责任：法务团队确认'),
      }),
    );
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('当前完成确认责任：客户确认'),
      }),
    );
    expect(result).toMatchObject({
      taskId: 'task_1',
      title: 'Approve launch note',
      source: 'ai',
      selectedTemplateIds: ['process_template_1'],
      selectedTemplateTitles: ['Approval skill'],
      selectionReason: 'This task is waiting on stakeholder approval.',
    });
  });

  it('falls back to a local draft when AI drafting is unavailable', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn(),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail()),
      annotateDecisionApproved: vi.fn(),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateProcessTemplateSelected: vi.fn(),
      annotateProcessTemplateSkipped: vi.fn(),
    };
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockRejectedValue(new Error('Missing API key')),
    };
    const processTemplateSelector = {
      select: vi.fn(),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      aiConfigService as never,
      processTemplateSelector as never,
    );

    const result = await service.draft({
      taskId: 'task_1',
      note: 'Need stakeholder sign-off',
    });

    expect(result).toMatchObject({
      taskId: 'task_1',
      title: 'Task 1：Need stakeholder sign-off',
      source: 'fallback',
    });
  });

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
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
    );

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
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
    );

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
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
    );

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

  it('resumes an approved checkpoint decision through the pending tool', async () => {
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
      annotateRunCompleted: vi.fn(),
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue({
        id: 'run_checkpoint_1',
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'tool_permission',
        status: 'open',
        payload: JSON.stringify({
          tool: 'artifact.create_note',
          input: { title: 'Agent note', content: 'Captured note' },
          decisionId: 'decision_1',
        }),
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      }),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const runRepository = {
      getDetail: vi.fn().mockResolvedValue({
        id: 'run_1',
        taskId: 'task_1',
        type: 'agent',
      }),
      updateResult: vi.fn(),
    };
    const agentToolRegistry = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        summary: '已创建本地 note 产物：Agent note',
        output: 'Captured note',
        artifactId: 'artifact_1',
      }),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      agentToolRegistry as never,
    );

    await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(agentToolRegistry.execute).toHaveBeenCalledWith(
      'artifact.create_note',
      { title: 'Agent note', content: 'Captured note' },
      { runId: 'run_1', taskId: 'task_1' },
      expect.objectContaining({ confirmationRequiredRisks: [] }),
    );
    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith('run_checkpoint_1', 'resolved');
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'completed',
      'Captured note',
      'system',
    );
    expect(taskService.annotateRunCompleted).toHaveBeenCalledWith('task_1', 'agent', true, 'run_1');
  });

  it('resumes an approved workspace patch checkpoint with local file-write policy', async () => {
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
      annotateRunCompleted: vi.fn(),
    };
    const patchInput = {
      summary: 'Update notes',
      expectedFiles: ['notes.md'],
      patch: [
        '*** Begin Patch',
        '*** Update File: notes.md',
        '@@',
        '-alpha',
        '+beta',
        '*** End Patch',
      ].join('\n'),
      diffPreview: 'Files: notes.md',
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue({
        id: 'run_checkpoint_1',
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'tool_permission',
        status: 'open',
        payload: JSON.stringify({
          version: 1,
          kind: 'tool_permission',
          tool: 'workspace.write_patch',
          risk: 'local_write',
          input: patchInput,
          decisionId: 'decision_1',
          decisionTitle: '确认本地写入：workspace.write_patch',
        }),
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      }),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const runRepository = {
      getDetail: vi.fn().mockResolvedValue({
        id: 'run_1',
        taskId: 'task_1',
        type: 'agent',
      }),
      updateResult: vi.fn(),
    };
    const agentToolRegistry = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        summary: '已应用工作区 patch：notes.md',
        output: patchInput.patch,
      }),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      agentToolRegistry as never,
    );

    await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(agentToolRegistry.execute).toHaveBeenCalledWith(
      'workspace.write_patch',
      patchInput,
      { runId: 'run_1', taskId: 'task_1' },
      expect.objectContaining({
        allowLocalFileWrite: true,
        confirmationRequiredRisks: [],
      }),
    );
    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith('run_checkpoint_1', 'resolved');
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'completed',
      patchInput.patch,
      'system',
    );
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
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
    );

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

  it('marks a checkpoint decision as non-resumable when deferred', async () => {
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
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue({
        id: 'run_checkpoint_1',
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'tool_permission',
        status: 'open',
        payload: JSON.stringify({ decisionId: 'decision_1' }),
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      }),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const runRepository = {
      getDetail: vi.fn(),
      updateResult: vi.fn(),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
    );

    await service.act({
      id: 'decision_1',
      action: 'defer',
    });

    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith('run_checkpoint_1', 'cancelled');
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'checkpoint',
        status: 'skipped',
      }),
    );
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'failed',
      '关联 Decision 已延后：Need approval',
      'system',
      '关联 Decision 已延后：Need approval',
    );
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
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
    );

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
