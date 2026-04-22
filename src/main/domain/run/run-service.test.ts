import { describe, expect, it, vi } from 'vitest';

import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { AppliedProcessTemplateRecord } from '../../../shared/types/process-template.js';
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
    resumeCard: {
      summary: 'Resume summary',
      currentState: `状态：${state}`,
      latestChange: '最近没有新的生命周期变化。',
      keySource: {
        sourceContextId: null,
        title: '暂无关键来源',
        detail: null,
      },
      currentMethod: {
        templateId: null,
        title: '暂无方法模板',
        detail: null,
      },
      nextSuggestedMove: 'Draft the response',
    },
    artifacts: [],
    sourceContexts: [],
    processTemplates: [],
    availableProcessTemplates: [],
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

function buildAppliedTemplate(
  partial: Partial<AppliedProcessTemplateRecord> = {},
): AppliedProcessTemplateRecord {
  return {
    id: partial.id ?? 'process_template_1',
    title: partial.title ?? 'Outreach skill',
    summary: partial.summary ?? 'Use outreach workflow',
    content: partial.content ?? '1. Review sources\n2. Draft outreach',
    kind: partial.kind ?? 'skill',
    tags: partial.tags ?? ['outreach'],
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
      getDetail: vi.fn().mockResolvedValue({
        ...buildTaskDetail('planned'),
        processTemplates: [buildAppliedTemplate()],
      }),
      transitionIfAllowed: vi.fn().mockResolvedValue(buildTaskRecord('running')),
      annotateRunCompleted: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateRunFailed: vi.fn(),
      annotateProcessTemplateSelected: vi.fn(),
      annotateProcessTemplateSkipped: vi.fn(),
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
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: true,
        selectedTemplates: [buildAppliedTemplate()],
        reason: '当前 run 是外联草稿，适合调用 outreach skill。',
      }),
    };
    const service = new RunService(
      runRepository as never,
      taskService as never,
      artifactRepository as never,
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
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
    expect(processTemplateSelector.select).toHaveBeenCalled();
    expect(taskService.annotateProcessTemplateSelected).toHaveBeenCalledWith(
      'task_1',
      'run',
      'run_1',
      ['process_template_1'],
      ['Outreach skill'],
      '当前 run 是外联草稿，适合调用 outreach skill。',
    );
    expect(textExecutor.execute).toHaveBeenCalledWith(
      {
        ...buildTaskDetail('planned'),
        processTemplates: [buildAppliedTemplate()],
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
      {
        selectedTemplates: [buildAppliedTemplate()],
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
      annotateProcessTemplateSelected: vi.fn(),
      annotateProcessTemplateSkipped: vi.fn(),
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
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: '当前无明显匹配模板。',
      }),
    };
    const service = new RunService(
      runRepository as never,
      taskService as never,
      artifactRepository as never,
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
    );

    const result = await service.trigger({
      taskId: 'task_1',
      type: 'draft',
    });

    expect(taskService.annotateProcessTemplateSkipped).toHaveBeenCalledWith(
      'task_1',
      'run',
      'run_1',
      '当前无明显匹配模板。',
      0,
    );
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
      annotateProcessTemplateSelected: vi.fn(),
      annotateProcessTemplateSkipped: vi.fn(),
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
      getDetail: vi.fn().mockResolvedValue({
        ...buildTaskDetail('running'),
        processTemplates: [buildAppliedTemplate()],
      }),
      transitionIfAllowed: vi.fn(),
      annotateRunCompleted: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateRunFailed: vi.fn(),
      annotateProcessTemplateSelected: vi.fn(),
      annotateProcessTemplateSkipped: vi.fn(),
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
    const processTemplateSelector = {
      select: vi.fn().mockRejectedValue(new Error('selector unavailable')),
    };
    const service = new RunService(
      runRepository as never,
      taskService as never,
      artifactRepository as never,
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
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
    expect(taskService.annotateProcessTemplateSkipped).toHaveBeenCalledWith(
      'task_1',
      'run',
      'run_1',
      'process template selector 不可用：selector unavailable',
      1,
    );
    expect(textExecutor.execute).toHaveBeenCalledWith(
      {
        ...buildTaskDetail('running'),
        processTemplates: [buildAppliedTemplate()],
      },
      {
        taskId: 'task_1',
        type: 'draft',
      },
      {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
      },
      {
        selectedTemplates: [],
      },
    );
  });
});
