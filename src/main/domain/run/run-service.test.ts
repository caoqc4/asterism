import { describe, expect, it, vi } from 'vitest';

import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { AppliedProcessTemplateRecord } from '../../../shared/types/process-template.js';
import type { RunStepKind, RunStepStatus, RunRecord } from '../../../shared/types/run.js';
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
    activeWaitingItem: null,
    activeBlocker: null,
    riskLevel: 'medium',
    riskNote: 'Need confirmation soon',
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
      nextSuggestedMove: 'Draft the response',
    },
    artifacts: [],
    completionCriteria: [],
    taskFiles: [
      {
        id: 'task_file_1',
        taskId: 'task_1',
        name: 'Task.md',
        path: 'Task.md',
        kind: 'file',
        content: '# Task\n\nCurrent recovery context.',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
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

function buildConfiguredAiStatus(partial: Record<string, unknown> = {}) {
  return {
    configured: true,
    apiKeyStored: true,
    apiKeySource: 'env',
    runtimeMode: 'api',
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-latest',
    baseUrl: null,
    workspaceRoot: '/workspace',
    updatedAt: '2026-01-01T00:00:00.000Z',
    configPath: '/config.json',
    codeAgentModelProducerEnabled: false,
    featureFlags: {
      enableScheduler: false,
      enableSandboxCodingAgent: false,
      enableSelfCheck: true,
    },
    toolScaffoldSummaries: [],
    ...partial,
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

function buildArtifactRepositoryMock(params: {
  createFromRun?: ReturnType<typeof vi.fn>;
  listForRun?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    createFromRun: params.createFromRun ?? vi.fn(),
    listForRun: params.listForRun ?? vi.fn().mockResolvedValue([]),
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

function buildRunStepRepositoryMock() {
  let stepCount = 0;

  return {
    listForRun: vi.fn().mockResolvedValue([]),
    listForTask: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation(async (input: {
      runId: string;
      kind: RunStepKind;
      status?: RunStepStatus;
      title: string;
      input?: string | null;
      output?: string | null;
      error?: string | null;
    }) => {
      stepCount += 1;
      return {
        id: `run_step_${stepCount}`,
        runId: input.runId,
        index: stepCount,
        kind: input.kind,
        status: input.status ?? 'completed',
        title: input.title,
        input: input.input ?? null,
        output: input.output ?? null,
        error: input.error ?? null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
    }),
    update: vi.fn().mockImplementation(async (id: string, input: {
      status: RunStepStatus;
      output?: string | null;
      error?: string | null;
    }) => ({
      id,
      runId: 'run_1',
      index: 2,
      kind: 'model',
      status: input.status,
      title: 'draft 模型执行',
      input: null,
      output: input.output ?? null,
      error: input.error ?? null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
  };
}

function buildPausedRunServiceWithPayload(payload: unknown) {
  const runRepository = {
    list: vi.fn(),
    getDetail: vi.fn().mockResolvedValue({
      ...buildRunRecord('paused'),
      type: 'agent',
      output: '等待先解除阻塞。',
      outputSource: 'system',
    }),
    create: vi.fn(),
    updateResult: vi.fn(),
  };
  const taskService = {
    getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
    transitionIfAllowed: vi.fn(),
    annotateRunCompleted: vi.fn(),
    annotateRunFailed: vi.fn(),
    annotateRunPaused: vi.fn(),
    annotateProcessTemplateSelected: vi.fn(),
    annotateProcessTemplateSkipped: vi.fn(),
  };
  const artifactRepository = buildArtifactRepositoryMock();
  const runStepRepository = buildRunStepRepositoryMock();
  const runCheckpointRepository = {
    listForRun: vi.fn().mockResolvedValue([
      {
        id: 'run_checkpoint_resume',
        runId: 'run_1',
        stepId: 'run_step_resume',
        kind: 'resume',
        status: 'open',
        payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      },
    ]),
    updateStatus: vi.fn(),
  };
  const agentToolRegistry = {
    execute: vi.fn(),
  };
  const agentSessionRepository = {
    listForRun: vi.fn().mockResolvedValue([]),
  };
  const service = new RunService(
    runRepository as never,
    taskService as never,
    artifactRepository as never,
    {} as never,
    {} as never,
    undefined,
    runStepRepository as never,
    agentToolRegistry as never,
    runCheckpointRepository as never,
    agentSessionRepository as never,
  );

  return {
    agentToolRegistry,
    runCheckpointRepository,
    runStepRepository,
    service,
    taskService,
  };
}

describe('RunService', () => {
  it('returns run detail with execution steps, checkpoints, and agent sessions', async () => {
    const runRepository = {
      list: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildRunRecord('completed')),
      create: vi.fn(),
      updateResult: vi.fn(),
    };
    const runStepRepository = {
      listForRun: vi.fn().mockResolvedValue([{
        id: 'run_step_1',
        runId: 'run_1',
        index: 1,
        kind: 'final',
        status: 'completed',
        title: 'Final output',
        input: null,
        output: 'Generated output',
        error: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }]),
    };
    const runCheckpointRepository = {
      listForRun: vi.fn().mockResolvedValue([{ id: 'run_checkpoint_1' }]),
    };
    const agentSessionRepository = {
      listForRun: vi.fn().mockResolvedValue([{ id: 'agent_session_1' }]),
    };
    const artifactRepository = buildArtifactRepositoryMock({
      listForRun: vi.fn().mockResolvedValue([{ id: 'artifact_1' }]),
    });
    const runVerificationRepository = {
      upsert: vi.fn(),
      listForRun: vi.fn().mockResolvedValue([{ id: 'run_verification_1' }]),
    };
    const sandboxPatchPromotionRepository = {
      listForRun: vi.fn().mockResolvedValue([{ checkpointId: 'run_checkpoint_1', status: 'applied' }]),
    };
    const service = new RunService(
      runRepository as never,
      {} as never,
      artifactRepository as never,
      {} as never,
      {} as never,
      undefined,
      runStepRepository as never,
      null,
      runCheckpointRepository as never,
      agentSessionRepository as never,
      runVerificationRepository as never,
      undefined,
      null,
      sandboxPatchPromotionRepository as never,
    );

    const result = await service.getDetail('run_1');

    expect(runRepository.getDetail).toHaveBeenCalledWith('run_1');
    expect(runStepRepository.listForRun).toHaveBeenCalledWith('run_1');
    expect(runCheckpointRepository.listForRun).toHaveBeenCalledWith('run_1');
    expect(sandboxPatchPromotionRepository.listForRun).toHaveBeenCalledWith('run_1');
    expect(agentSessionRepository.listForRun).toHaveBeenCalledWith('run_1');
    expect(artifactRepository.listForRun).toHaveBeenCalledWith('run_1');
    expect(runVerificationRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_1',
      targetType: 'step',
      targetId: 'run_step_1',
      label: '执行后检查通过',
      source: 'lightweight_rule_engine',
    }));
    expect(runVerificationRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_1',
      targetType: 'run',
      targetId: 'run_1',
      source: 'lightweight_rule_engine',
    }));
    expect(runVerificationRepository.listForRun).toHaveBeenCalledWith('run_1');
    expect(result?.artifacts).toEqual([{ id: 'artifact_1' }]);
    expect(result?.verifications).toEqual([{ id: 'run_verification_1' }]);
    expect(result?.sandboxPatchPromotions).toEqual([{ checkpointId: 'run_checkpoint_1', status: 'applied' }]);
    expect(result?.agentSessions).toEqual([{ id: 'agent_session_1' }]);
    expect(result?.runtimeEvents?.map((event) => event.type)).toEqual([
      'run.completed',
      'run_step.final.completed',
    ]);
    expect(result?.runtimeReplayGroups?.some((group) => group.kind === 'execution_recovery')).toBe(true);
  });

  it('projects task memory events into run detail runtime replay data', async () => {
    const runRepository = {
      list: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildRunRecord('completed')),
      create: vi.fn(),
      updateResult: vi.fn(),
    };
    const taskDetail = buildTaskDetail('running');
    taskDetail.timeline = [{
      id: 'timeline_1',
      taskId: 'task_1',
      type: 'panel.completion_handoff',
      payload: JSON.stringify({ nextTaskId: 'task_2', nextTaskTitle: 'Next task' }),
      createdAt: '2026-01-01T00:01:00.000Z',
    }];
    taskDetail.taskFiles = [
      ...(taskDetail.taskFiles ?? []),
      {
        id: 'task_record_1',
        taskId: 'task_1',
        name: '2026-01-01-completion-handoff.md',
        path: 'Task Records/2026-01-01-completion-handoff.md',
        kind: 'file',
        content: '# Handoff',
        createdAt: '2026-01-01T00:02:00.000Z',
        updatedAt: '2026-01-01T00:02:00.000Z',
      },
    ];
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(taskDetail),
    };
    const runStepRepository = {
      listForRun: vi.fn().mockResolvedValue([]),
    };
    const runCheckpointRepository = {
      listForRun: vi.fn().mockResolvedValue([]),
    };
    const agentSessionRepository = {
      listForRun: vi.fn().mockResolvedValue([]),
    };
    const artifactRepository = buildArtifactRepositoryMock({
      listForRun: vi.fn().mockResolvedValue([]),
    });
    const service = new RunService(
      runRepository as never,
      taskService as never,
      artifactRepository as never,
      {} as never,
      {} as never,
      undefined,
      runStepRepository as never,
      null,
      runCheckpointRepository as never,
      agentSessionRepository as never,
    );

    const result = await service.getDetail('run_1');

    expect(taskService.getDetail).toHaveBeenCalledWith('task_1');
    expect(result?.runtimeEvents?.map((event) => event.type)).toEqual([
      'task_record.updated',
      'panel.completion_handoff',
      'run.completed',
    ]);
    expect(result?.runtimeReplayGroups?.find((group) => group.kind === 'handoff')).toMatchObject({
      eventIds: [
        'timeline:timeline_1',
        'task_record:task_record_1',
      ],
      relatedTaskIds: ['task_2'],
    });
  });

  it('projects task memory guidance state into run detail', async () => {
    const runRepository = {
      list: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildRunRecord('completed')),
      create: vi.fn(),
      updateResult: vi.fn(),
    };
    const runStepRepository = {
      listForRun: vi.fn().mockResolvedValue([{
        id: 'run_step_memory',
        runId: 'run_1',
        index: 1,
        kind: 'plan',
        status: 'completed',
        title: '任务记忆建议',
        input: null,
        output: '- Task.md update recommended: next_step',
        error: null,
        createdAt: '2026-01-01T00:01:00.000Z',
        updatedAt: '2026-01-01T00:01:00.000Z',
      }]),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue({
        ...buildTaskDetail('running'),
        taskFiles: [{
          id: 'task_file_1',
          taskId: 'task_1',
          name: 'Task.md',
          path: 'Task.md',
          kind: 'file',
          content: '# Task\n\nUpdated recovery context.',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:02:00.000Z',
        }],
      }),
    };
    const service = new RunService(
      runRepository as never,
      taskService as never,
      buildArtifactRepositoryMock() as never,
      {} as never,
      {} as never,
      undefined,
      runStepRepository as never,
      null,
      { listForRun: vi.fn().mockResolvedValue([]) } as never,
      { listForRun: vi.fn().mockResolvedValue([]) } as never,
      { upsert: vi.fn(), listForRun: vi.fn().mockResolvedValue([]) } as never,
    );

    const result = await service.getDetail('run_1');

    expect(taskService.getDetail).toHaveBeenCalledWith('task_1');
    expect(result?.taskMemoryGuidance).toMatchObject({
      outcome: 'satisfied',
      targets: ['task_md'],
    });
    expect(result?.taskMemoryWriteProposals).toEqual([]);
  });

  it('persists run-level warning when task memory guidance is still pending', async () => {
    const runRepository = {
      list: vi.fn(),
      getDetail: vi.fn().mockResolvedValue(buildRunRecord('completed')),
      create: vi.fn(),
      updateResult: vi.fn(),
    };
    const runStepRepository = {
      listForRun: vi.fn().mockResolvedValue([{
        id: 'run_step_memory',
        runId: 'run_1',
        index: 1,
        kind: 'plan',
        status: 'completed',
        title: '任务记忆建议',
        input: null,
        output: '- Task Record may be useful: context_archive',
        error: null,
        createdAt: '2026-01-01T00:01:00.000Z',
        updatedAt: '2026-01-01T00:01:00.000Z',
      }]),
    };
    const runVerificationRepository = {
      upsert: vi.fn(),
      listForRun: vi.fn().mockResolvedValue([]),
    };
    const service = new RunService(
      runRepository as never,
      {
        getDetail: vi.fn().mockResolvedValue({
          ...buildTaskDetail('running'),
          taskFiles: [],
        }),
      } as never,
      buildArtifactRepositoryMock() as never,
      {} as never,
      {} as never,
      undefined,
      runStepRepository as never,
      null,
      { listForRun: vi.fn().mockResolvedValue([]) } as never,
      { listForRun: vi.fn().mockResolvedValue([]) } as never,
      runVerificationRepository as never,
    );

    const result = await service.getDetail('run_1');

    expect(result?.taskMemoryGuidance).toMatchObject({
      outcome: 'pending',
      pendingTargets: ['task_record'],
    });
    expect(result?.taskMemoryWriteProposals).toMatchObject([{
      operation: 'create',
      path: expect.stringMatching(/^Task Records\/\d{4}-\d{2}-\d{2}-memory-guidance\.md$/),
      target: 'task_record',
      title: '创建任务记录',
    }]);
    expect(runVerificationRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      targetType: 'run',
      targetId: 'run_1',
      tone: 'warn',
      label: 'Run 任务记忆待处理',
      detail: '最新任务记忆建议仍缺少对应写入：Task Record。',
    }));
  });

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
        taskType: 'project',
        processTemplates: [buildAppliedTemplate()],
      }),
      transitionIfAllowed: vi.fn().mockResolvedValue(buildTaskRecord('running')),
      annotateRunCompleted: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateRunFailed: vi.fn(),
      annotateProcessTemplateSelected: vi.fn(),
      annotateProcessTemplateSkipped: vi.fn(),
    };
    const artifactRepository = buildArtifactRepositoryMock({
      createFromRun: vi.fn().mockResolvedValue(buildArtifactRecord()),
    });
    const aiConfigService = {
      getStatus: vi.fn().mockResolvedValue(buildConfiguredAiStatus()),
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
    const runStepRepository = buildRunStepRepositoryMock();
    const runVerificationRepository = {
      upsert: vi.fn(),
      listForRun: vi.fn(),
    };
    const workHabitService = {
      getSnapshot: vi.fn().mockResolvedValue({
        version: 3,
        storage: 'main_db',
        privacyBoundary: {
          locality: 'device_only',
          contains: [],
          excludes: [],
        },
        habits: [
          {
            id: 'habit_project_type',
            rule: '项目型任务先确认拆解边界',
            source: 'manual',
            scope: 'task_type',
            scopeLabel: '项目型',
            status: 'confirmed',
            examples: '开发小程序',
            createdAt: '2026-01-01T00:00:00.000Z',
            lastAppliedAt: null,
            applicationCount: 0,
          },
          {
            id: 'habit_confirmed',
            rule: '数据报告初稿完成后先内部评审再对外发送',
            source: 'manual',
            scope: 'global',
            scopeLabel: '全局',
            status: 'confirmed',
            examples: 'Q1 财报',
            createdAt: '2026-01-01T00:00:00.000Z',
            lastAppliedAt: null,
            applicationCount: 2,
          },
          {
            id: 'habit_pending',
            rule: '待确认习惯不应进入 Run 提示词',
            source: 'proposal',
            scope: 'global',
            scopeLabel: '全局',
            status: 'pending',
            examples: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            lastAppliedAt: null,
            applicationCount: 0,
          },
        ],
      }),
      recordApplications: vi.fn(),
    };
    const runCheckpointRepository = {
      listForRun: vi.fn().mockResolvedValue([]),
    };
    const agentSessionRepository = {
      listForRun: vi.fn().mockResolvedValue([]),
    };
    const sandboxPatchPromotionRepository = {
      listForRun: vi.fn().mockResolvedValue([{
        checkpointId: 'run_checkpoint_patch_1',
        status: 'applied',
      }]),
    };
    const service = new RunService(
      runRepository as never,
      taskService as never,
      artifactRepository as never,
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository as never,
      null,
      runCheckpointRepository as never,
      agentSessionRepository as never,
      runVerificationRepository as never,
      undefined,
      workHabitService as never,
      sandboxPatchPromotionRepository as never,
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
        taskType: 'project',
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
        applicableWorkHabitSummaries: [
          '项目型任务先确认拆解边界（范围：项目型；适用原因：task type match: 项目型；例：开发小程序）',
          '数据报告初稿完成后先内部评审再对外发送（范围：全局；适用原因：global confirmed habit；例：Q1 财报）',
        ],
      },
    );
    expect(workHabitService.getSnapshot).toHaveBeenCalled();
    expect(workHabitService.recordApplications).toHaveBeenCalledWith(['habit_project_type', 'habit_confirmed']);
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
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run_1', kind: 'plan' }),
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'plan',
        status: 'completed',
        title: 'Agent API 上下文就绪判断',
        input: 'Please draft this',
        output: expect.stringContaining('decision=ready'),
      }),
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Agent API 上下文就绪判断',
        output: expect.stringContaining('recommendedMode=read_only_execute'),
      }),
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'plan',
        status: 'completed',
        title: 'Agent API execution promotion readiness',
        output: expect.stringContaining('ready=no'),
      }),
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Agent API execution promotion readiness',
        output: expect.stringContaining('missingRequirements=task_memory_guidance,run_goal_contract,write_intent_extraction,reviewed_patch_apply_boundary,post_step_verification,run_evidence_persistence'),
      }),
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'plan',
        status: 'completed',
        title: '任务记忆建议',
        input: JSON.stringify({
          targets: ['task_md'],
          items: [{
            target: 'task_md',
            reason: 'important_file',
            referencePath: 'artifact_1',
          }],
        }),
        output: '- Task.md: important_file / reference=artifact_1',
      }),
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'plan',
        status: 'completed',
        title: 'Agent API execution post-run promotion readiness',
        output: expect.stringContaining('missingRequirements=task_memory_guidance,run_goal_contract,write_intent_extraction'),
      }),
    );
    expect(sandboxPatchPromotionRepository.listForRun).toHaveBeenCalledWith('run_1');
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Agent API execution post-run promotion readiness',
        output: expect.not.stringContaining('reviewed_patch_apply_boundary,post_step_verification,run_evidence_persistence'),
      }),
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Agent API execution post-run promotion readiness',
        output: expect.not.stringContaining('missingRequirements=task_memory_guidance,run_goal_contract,write_intent_extraction,reviewed_patch_apply_boundary,post_step_verification,run_evidence_persistence'),
      }),
    );
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_4',
      expect.objectContaining({ status: 'completed', output: 'Generated output' }),
    );
    expect(runVerificationRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_1',
      targetType: 'run',
      targetId: 'run_1',
      source: 'lightweight_rule_engine',
      detail: expect.stringContaining('本次还对照 2 条已确认工作习惯。'),
    }));
    expect(result.status).toBe('completed');
  });

  it('persists terminal run warning for pending task memory guidance immediately after completion', async () => {
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
        taskFiles: [],
      }),
      transitionIfAllowed: vi.fn(),
      annotateRunCompleted: vi.fn().mockResolvedValue(buildTaskRecord('running')),
      annotateRunFailed: vi.fn(),
      annotateProcessTemplateSelected: vi.fn(),
      annotateProcessTemplateSkipped: vi.fn(),
    };
    const runStepRepository = {
      ...buildRunStepRepositoryMock(),
      listForRun: vi.fn().mockResolvedValue([{
        id: 'run_step_memory',
        runId: 'run_1',
        index: 4,
        kind: 'plan',
        status: 'completed',
        title: '任务记忆建议',
        input: null,
        output: '- Task Record may be useful: context_archive',
        error: null,
        createdAt: '2026-01-01T00:03:00.000Z',
        updatedAt: '2026-01-01T00:03:00.000Z',
      }]),
    };
    const runVerificationRepository = {
      upsert: vi.fn(),
      listForRun: vi.fn(),
    };
    const service = new RunService(
      runRepository as never,
      taskService as never,
      buildArtifactRepositoryMock({
        createFromRun: vi.fn().mockResolvedValue(buildArtifactRecord()),
      }) as never,
      {
        getStatus: vi.fn().mockResolvedValue(buildConfiguredAiStatus()),
        resolveRuntimeConfig: vi.fn().mockResolvedValue({
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-latest',
          apiKey: 'secret',
        }),
      } as never,
      {
        execute: vi.fn().mockResolvedValue('Generated output'),
      } as never,
      {
        select: vi.fn().mockResolvedValue({
          shouldUse: false,
          selectedTemplates: [],
          reason: 'No template needed.',
        }),
      } as never,
      runStepRepository as never,
      null,
      { listForRun: vi.fn().mockResolvedValue([]) } as never,
      { listForRun: vi.fn().mockResolvedValue([]) } as never,
      runVerificationRepository as never,
    );

    await service.trigger({
      taskId: 'task_1',
      type: 'draft',
      instructions: 'Please draft this',
    });

    expect(runVerificationRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_1',
      targetType: 'run',
      targetId: 'run_1',
      tone: 'warn',
      label: 'Run 任务记忆待处理',
      detail: '最新任务记忆建议仍缺少对应写入：Task Record。',
    }));
  });

  it('blocks run start when the target task cannot start', async () => {
    const runRepository = {
      list: vi.fn(),
      getDetail: vi.fn(),
      create: vi.fn().mockResolvedValue(buildRunRecord('pending')),
      updateResult: vi.fn(),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue({
        ...buildTaskDetail('planned'),
        activeBlocker: {
          id: 'blocker_1',
          taskId: 'task_1',
          title: '等待评审',
          kind: 'approval',
          detail: null,
          owner: null,
          responsibility: null,
          responsibilityLabel: null,
          sourceContextId: null,
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          resolvedAt: null,
        },
      }),
      transitionIfAllowed: vi.fn(),
      annotateRunCompleted: vi.fn(),
      annotateRunFailed: vi.fn(),
      annotateProcessTemplateSelected: vi.fn(),
      annotateProcessTemplateSkipped: vi.fn(),
    };
    const service = new RunService(
      runRepository as never,
      taskService as never,
      buildArtifactRepositoryMock() as never,
      {} as never,
      {} as never,
      undefined,
      buildRunStepRepositoryMock() as never,
      null,
      { listForRun: vi.fn().mockResolvedValue([]) } as never,
      { listForRun: vi.fn().mockResolvedValue([]) } as never,
    );

    await expect(service.trigger({
      taskId: 'task_1',
      type: 'draft',
      instructions: 'Please draft this',
    })).rejects.toThrow('不能安全开始执行');
    expect(runRepository.create).not.toHaveBeenCalled();
    expect(taskService.transitionIfAllowed).not.toHaveBeenCalled();
  });

  it('blocks run start when prior task memory guidance is still pending', async () => {
    const runRepository = {
      list: vi.fn(),
      getDetail: vi.fn(),
      create: vi.fn().mockResolvedValue(buildRunRecord('pending')),
      updateResult: vi.fn(),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue({
        ...buildTaskDetail('running'),
        taskFiles: [],
      }),
      transitionIfAllowed: vi.fn(),
      annotateRunCompleted: vi.fn(),
      annotateRunFailed: vi.fn(),
      annotateProcessTemplateSelected: vi.fn(),
      annotateProcessTemplateSkipped: vi.fn(),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    runStepRepository.listForTask.mockResolvedValue([{
      id: 'run_step_memory',
      runId: 'run_previous',
      index: 1,
      kind: 'plan',
      status: 'completed',
      title: '任务记忆建议',
      input: null,
      output: '- Task Record may be useful: context_archive',
      error: null,
      createdAt: '2026-01-01T00:01:00.000Z',
      updatedAt: '2026-01-01T00:01:00.000Z',
    }]);
    const service = new RunService(
      runRepository as never,
      taskService as never,
      buildArtifactRepositoryMock() as never,
      {} as never,
      {} as never,
      undefined,
      runStepRepository as never,
      null,
      { listForRun: vi.fn().mockResolvedValue([]) } as never,
      { listForRun: vi.fn().mockResolvedValue([]) } as never,
    );

    await expect(service.trigger({
      taskId: 'task_1',
      type: 'draft',
      instructions: 'Please draft this',
    })).rejects.toThrow('最新任务记忆建议仍缺少对应写入：Task Record。');

    expect(runRepository.create).not.toHaveBeenCalled();
    expect(taskService.transitionIfAllowed).not.toHaveBeenCalled();
  });

  it('keeps step checks but skips run-level verification when self-check is disabled', async () => {
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
      annotateRunCompleted: vi.fn().mockResolvedValue(buildTaskRecord('running')),
      annotateRunFailed: vi.fn(),
      annotateProcessTemplateSelected: vi.fn(),
      annotateProcessTemplateSkipped: vi.fn(),
    };
    const artifactRepository = buildArtifactRepositoryMock({
      createFromRun: vi.fn().mockResolvedValue(buildArtifactRecord()),
    });
    const aiConfigService = {
      getStatus: vi.fn().mockResolvedValue({
        configured: true,
        runtimeMode: 'api',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        workspaceRoot: null,
        codeAgentWorkspaceChecks: {
          lint: { available: false, reason: 'not configured' },
          test: { available: false, reason: 'not configured' },
        },
        featureFlags: {
          enableSelfCheck: false,
        },
      }),
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
        shouldUse: false,
        selectedTemplates: [],
        reason: '当前无明显匹配模板。',
      }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    runStepRepository.listForRun.mockResolvedValue([{
      id: 'run_step_checked',
      runId: 'run_1',
      index: 1,
      kind: 'model',
      status: 'completed',
      title: 'draft 模型执行',
      input: null,
      output: 'Generated output',
      error: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }]);
    const runVerificationRepository = {
      upsert: vi.fn(),
      listForRun: vi.fn(),
    };
    const service = new RunService(
      runRepository as never,
      taskService as never,
      artifactRepository as never,
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository as never,
      null,
      undefined,
      undefined as never,
      runVerificationRepository as never,
    );

    await service.trigger({
      taskId: 'task_1',
      type: 'draft',
    });

    expect(runVerificationRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      targetType: 'step',
      source: 'lightweight_rule_engine',
    }));
    expect(runVerificationRepository.upsert).not.toHaveBeenCalledWith(expect.objectContaining({
      targetType: 'run',
    }));
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
    const artifactRepository = buildArtifactRepositoryMock();
    const aiConfigService = {
      getStatus: vi.fn().mockResolvedValue(buildConfiguredAiStatus({
        provider: 'openai',
        model: 'gpt-4.1',
      })),
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
    const runStepRepository = buildRunStepRepositoryMock();
    const service = new RunService(
      runRepository as never,
      taskService as never,
      artifactRepository as never,
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository as never,
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
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_4',
      expect.objectContaining({ status: 'failed', error: 'Executor exploded' }),
    );
    expect(artifactRepository.createFromRun).not.toHaveBeenCalled();
    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('Executor exploded');
  });

  it('marks an agent run as paused when the orchestrator pauses for review', async () => {
    const runRepository = {
      list: vi.fn(),
      getDetail: vi.fn(),
      create: vi.fn().mockResolvedValue(buildRunRecord('pending')),
      updateResult: vi.fn().mockResolvedValue({
        ...buildRunRecord('paused'),
        output: '等待先解除阻塞。',
        outputSource: 'system',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('planned')),
      transitionIfAllowed: vi.fn().mockResolvedValue(buildTaskRecord('running')),
      annotateRunCompleted: vi.fn(),
      annotateRunFailed: vi.fn(),
      annotateRunPaused: vi.fn().mockResolvedValue({
        ...buildTaskRecord('planned'),
        riskLevel: 'medium',
        riskNote: '等待先解除阻塞。',
      }),
      annotateProcessTemplateSelected: vi.fn(),
      annotateProcessTemplateSkipped: vi.fn(),
    };
    const artifactRepository = buildArtifactRepositoryMock();
    const runOrchestrator = {
      executeAgentRun: vi.fn().mockResolvedValue({
        status: 'paused',
        message: '等待先解除阻塞。',
        selection: null,
      }),
    };
    const service = new RunService(
      runRepository as never,
      taskService as never,
      artifactRepository as never,
      {
        getStatus: vi.fn().mockResolvedValue(buildConfiguredAiStatus()),
      } as never,
      {} as never,
      undefined,
      buildRunStepRepositoryMock() as never,
      null,
      undefined,
      undefined as never,
      null,
      runOrchestrator as never,
    );

    const result = await service.trigger({
      taskId: 'task_1',
      type: 'agent',
    });

    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'paused',
      '等待先解除阻塞。',
      'system',
      null,
    );
    expect(taskService.annotateRunPaused).toHaveBeenCalledWith(
      'task_1',
      '等待先解除阻塞。',
      'run_1',
    );
    expect(taskService.annotateRunFailed).not.toHaveBeenCalled();
    expect(artifactRepository.createFromRun).not.toHaveBeenCalled();
    expect(result.status).toBe('paused');
  });

  it('continues a paused agent run from its resume checkpoint', async () => {
    const runRepository = {
      list: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildRunRecord('paused'),
        type: 'agent',
        output: '等待先解除阻塞。',
        outputSource: 'system',
      }),
      create: vi.fn(),
      updateResult: vi.fn().mockResolvedValue({
        ...buildRunRecord('completed'),
        type: 'agent',
        output: 'Recovered note',
        outputSource: 'system',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      transitionIfAllowed: vi.fn(),
      annotateRunCompleted: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateRunFailed: vi.fn(),
      annotateRunPaused: vi.fn(),
      annotateProcessTemplateSelected: vi.fn(),
      annotateProcessTemplateSkipped: vi.fn(),
    };
    const artifactRepository = buildArtifactRepositoryMock();
    const runStepRepository = {
      ...buildRunStepRepositoryMock(),
      listForRun: vi.fn().mockResolvedValue([]),
    };
    const runCheckpointRepository = {
      listForRun: vi.fn().mockResolvedValue([
        {
          id: 'run_checkpoint_resume_stale',
          runId: 'run_1',
          stepId: 'run_step_resume_stale',
          kind: 'resume',
          status: 'open',
          payload: JSON.stringify({
            version: 1,
            kind: 'resume',
            reason: 'stale payload',
            runId: 'run_other',
            nextTool: 'artifact.create_note',
            nextInput: {
              title: 'Stale note',
              content: 'Stale note',
            },
            taskId: 'task_1',
          }),
          createdAt: '2026-01-01T00:00:00.000Z',
          resolvedAt: null,
        },
        {
          id: 'run_checkpoint_resume',
          runId: 'run_1',
          stepId: 'run_step_resume',
          kind: 'resume',
          status: 'open',
          payload: JSON.stringify({
            version: 1,
            kind: 'resume',
            agentSessionId: 'agent_session_paused_old_created',
            reason: '等待先解除阻塞。',
            runId: 'run_1',
            nextTool: 'artifact.create_note',
            nextInput: {
              title: 'Recovered note',
              content: 'Recovered note',
            },
            policySnapshot: {
              maxSteps: 8,
              maxWallTimeMs: 120_000,
              allowNetwork: false,
              allowLocalWorkspaceRead: false,
              allowLocalFileWrite: false,
              confirmationRequiredRisks: ['external_write', 'sensitive'],
            },
            taskId: 'task_1',
          }),
          createdAt: '2026-01-01T00:00:00.000Z',
          resolvedAt: null,
        },
      ]),
      updateStatus: vi.fn().mockResolvedValue({
        id: 'run_checkpoint_resume',
        status: 'resolved',
      }),
    };
    const agentToolRegistry = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        status: 'completed',
        summary: '已创建本地 note 产物：Recovered note',
        output: 'Recovered note',
      }),
    };
    const agentSessionRepository = {
      listForRun: vi.fn().mockResolvedValue([
        {
          id: 'agent_session_paused_old_created',
          runId: 'run_1',
          mode: 'agent',
          status: 'paused',
          capabilities: {
            structuredToolCalls: false,
            textOnlyPlanning: true,
            streaming: false,
            fileContext: false,
            taskMutationTools: false,
            longRunningSessions: false,
          },
          metadata: 'executor=local_agent',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'agent_session_confirmation_new_created',
          runId: 'run_1',
          mode: 'agent',
          status: 'needs_confirmation',
          capabilities: {
            structuredToolCalls: false,
            textOnlyPlanning: true,
            streaming: false,
            fileContext: false,
            taskMutationTools: false,
            longRunningSessions: false,
          },
          metadata: 'executor=local_agent',
          createdAt: '2026-01-01T12:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'agent_session_running_stale',
          runId: 'run_1',
          mode: 'agent',
          status: 'running',
          capabilities: {
            structuredToolCalls: false,
            textOnlyPlanning: true,
            streaming: false,
            fileContext: false,
            taskMutationTools: false,
            longRunningSessions: false,
          },
          metadata: 'executor=local_agent',
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ]),
      updateStatus: vi.fn(),
    };
    const runVerificationRepository = {
      upsert: vi.fn(),
      listForRun: vi.fn(),
    };
    const service = new RunService(
      runRepository as never,
      taskService as never,
      artifactRepository as never,
      {} as never,
      {} as never,
      undefined,
      runStepRepository as never,
      agentToolRegistry as never,
      runCheckpointRepository as never,
      agentSessionRepository as never,
      runVerificationRepository as never,
    );

    const result = await service.continuePausedRun('run_1');

    expect(agentToolRegistry.execute).toHaveBeenCalledWith(
      'artifact.create_note',
      {
        title: 'Recovered note',
        content: 'Recovered note',
      },
      {
        runId: 'run_1',
        taskId: 'task_1',
      },
      expect.objectContaining({
        allowLocalFileWrite: false,
        confirmationRequiredRisks: ['external_write', 'sensitive'],
      }),
    );
    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith(
      'run_checkpoint_resume',
      'resolved',
    );
    expect(agentSessionRepository.updateStatus).toHaveBeenCalledWith(
      'agent_session_paused_old_created',
      'completed',
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'final',
        status: 'completed',
        title: '完成 paused run 续跑',
      }),
    );
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'completed',
      'Recovered note',
      'system',
    );
    expect(taskService.annotateRunCompleted).toHaveBeenCalledWith(
      'task_1',
      'agent',
      true,
      'run_1',
    );
    expect(runVerificationRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_1',
      targetType: 'run',
      targetId: 'run_1',
      source: 'lightweight_rule_engine',
    }));
    expect(artifactRepository.createFromRun).not.toHaveBeenCalled();
    expect(result.status).toBe('completed');
  });

  it('blocks paused run continuation when the target task cannot resume execution', async () => {
    const {
      agentToolRegistry,
      runCheckpointRepository,
      service,
      taskService,
    } = buildPausedRunServiceWithPayload({
      version: 1,
      kind: 'resume',
      reason: '等待先解除阻塞。',
      runId: 'run_1',
      nextTool: 'artifact.create_note',
      nextInput: {
        title: 'Recovered note',
        content: 'Recovered note',
      },
      taskId: 'task_1',
    });
    taskService.getDetail.mockResolvedValue({
      ...buildTaskDetail('running'),
      activeBlocker: {
        id: 'blocker_1',
        taskId: 'task_1',
        title: '等待评审',
        kind: 'approval',
        detail: null,
        owner: null,
        responsibility: null,
        responsibilityLabel: null,
        sourceContextId: null,
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      },
    });

    await expect(service.continuePausedRun('run_1')).rejects.toThrow(
      '仍有阻塞、依赖或等待状态',
    );

    expect(agentToolRegistry.execute).not.toHaveBeenCalled();
    expect(runCheckpointRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('blocks paused run continuation when task memory guidance is still pending', async () => {
    const {
      agentToolRegistry,
      runCheckpointRepository,
      runStepRepository,
      service,
    } = buildPausedRunServiceWithPayload({
      version: 1,
      kind: 'resume',
      reason: '等待补齐任务记忆。',
      runId: 'run_1',
      nextTool: 'artifact.create_note',
      nextInput: {
        title: 'Recovered note',
        content: 'Recovered note',
      },
      taskId: 'task_1',
    });
    runStepRepository.listForRun.mockResolvedValue([{
      id: 'run_step_memory',
      runId: 'run_1',
      index: 1,
      kind: 'final',
      status: 'completed',
      title: '任务记忆建议',
      input: null,
      output: '- Task.md update recommended: next_step',
      error: null,
      createdAt: '2026-01-01T00:01:00.000Z',
      updatedAt: '2026-01-01T00:01:00.000Z',
    }]);

    await expect(service.continuePausedRun('run_1')).rejects.toThrow(
      '最新任务记忆建议仍缺少对应写入：Task.md。',
    );

    expect(agentToolRegistry.execute).not.toHaveBeenCalled();
    expect(runCheckpointRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('marks the paused agent session failed when resume execution fails', async () => {
    const runRepository = {
      list: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildRunRecord('paused'),
        type: 'agent',
        output: '等待先解除阻塞。',
        outputSource: 'system',
      }),
      create: vi.fn(),
      updateResult: vi.fn().mockResolvedValue({
        ...buildRunRecord('failed'),
        type: 'agent',
        output: 'Resume failed',
        outputSource: 'system',
        failureReason: 'Resume failed',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      transitionIfAllowed: vi.fn(),
      annotateRunCompleted: vi.fn(),
      annotateRunFailed: vi.fn(),
      annotateRunPaused: vi.fn(),
      annotateProcessTemplateSelected: vi.fn(),
      annotateProcessTemplateSkipped: vi.fn(),
    };
    const artifactRepository = buildArtifactRepositoryMock();
    const runStepRepository = {
      ...buildRunStepRepositoryMock(),
      listForRun: vi.fn().mockResolvedValue([]),
    };
    const runCheckpointRepository = {
      listForRun: vi.fn().mockResolvedValue([
        {
          id: 'run_checkpoint_resume',
          runId: 'run_1',
          stepId: 'run_step_resume',
          kind: 'resume',
          status: 'open',
          payload: JSON.stringify({
            version: 1,
            kind: 'resume',
            reason: '等待先解除阻塞。',
            runId: 'run_1',
            nextTool: 'artifact.create_note',
            nextInput: {
              title: 'Recovered note',
              content: 'Recovered note',
            },
            policySnapshot: {
              maxSteps: 8,
              maxWallTimeMs: 120_000,
              allowNetwork: false,
              allowLocalWorkspaceRead: false,
              allowLocalFileWrite: false,
              confirmationRequiredRisks: ['external_write', 'sensitive'],
            },
            taskId: 'task_1',
          }),
          createdAt: '2026-01-01T00:00:00.000Z',
          resolvedAt: null,
        },
      ]),
      updateStatus: vi.fn(),
    };
    const agentToolRegistry = {
      execute: vi.fn().mockResolvedValue({
        success: false,
        status: 'failed',
        summary: 'Resume failed',
        error: 'Resume failed',
      }),
    };
    const agentSessionRepository = {
      listForRun: vi.fn().mockResolvedValue([
        {
          id: 'agent_session_paused',
          runId: 'run_1',
          mode: 'agent',
          status: 'paused',
          capabilities: {
            structuredToolCalls: false,
            textOnlyPlanning: true,
            streaming: false,
            fileContext: false,
            taskMutationTools: false,
            longRunningSessions: false,
          },
          metadata: 'executor=local_agent',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
      updateStatus: vi.fn(),
    };
    const service = new RunService(
      runRepository as never,
      taskService as never,
      artifactRepository as never,
      {} as never,
      {} as never,
      undefined,
      runStepRepository as never,
      agentToolRegistry as never,
      runCheckpointRepository as never,
      agentSessionRepository as never,
    );

    const result = await service.continuePausedRun('run_1');

    expect(agentSessionRepository.updateStatus).toHaveBeenCalledWith(
      'agent_session_paused',
      'failed',
    );
    expect(runCheckpointRepository.updateStatus).not.toHaveBeenCalled();
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'failed',
      'Resume failed',
      'system',
      'Resume failed',
    );
    expect(taskService.annotateRunFailed).toHaveBeenCalledWith(
      'task_1',
      'Resume failed',
      'run_1',
    );
    expect(result.status).toBe('failed');
  });

  it('blocks ambiguous paused run continuation when multiple supported resume checkpoints are open', async () => {
    const runRepository = {
      list: vi.fn(),
      getDetail: vi.fn().mockResolvedValue({
        ...buildRunRecord('paused'),
        type: 'agent',
        output: '等待先解除阻塞。',
        outputSource: 'system',
      }),
      create: vi.fn(),
      updateResult: vi.fn(),
    };
    const taskService = {
      getDetail: vi.fn(),
      transitionIfAllowed: vi.fn(),
      annotateRunCompleted: vi.fn(),
      annotateRunFailed: vi.fn(),
      annotateRunPaused: vi.fn(),
      annotateProcessTemplateSelected: vi.fn(),
      annotateProcessTemplateSkipped: vi.fn(),
    };
    const artifactRepository = buildArtifactRepositoryMock();
    const runStepRepository = {
      ...buildRunStepRepositoryMock(),
      listForRun: vi.fn().mockResolvedValue([]),
    };
    const buildResumeCheckpoint = (id: string, title: string) => ({
      id,
      runId: 'run_1',
      stepId: `run_step_${id}`,
      kind: 'resume',
      status: 'open',
      payload: JSON.stringify({
        version: 1,
        kind: 'resume',
        reason: '等待先解除阻塞。',
        runId: 'run_1',
        nextTool: 'artifact.create_note',
        nextInput: {
          title,
          content: `${title} content`,
        },
        taskId: 'task_1',
      }),
      createdAt: '2026-01-01T00:00:00.000Z',
      resolvedAt: null,
    });
    const runCheckpointRepository = {
      listForRun: vi.fn().mockResolvedValue([
        buildResumeCheckpoint('run_checkpoint_resume_a', 'Recovered note A'),
        buildResumeCheckpoint('run_checkpoint_resume_b', 'Recovered note B'),
      ]),
      updateStatus: vi.fn(),
    };
    const agentToolRegistry = {
      execute: vi.fn(),
    };
    const agentSessionRepository = {
      listForRun: vi.fn().mockResolvedValue([]),
      updateStatus: vi.fn(),
    };
    const service = new RunService(
      runRepository as never,
      taskService as never,
      artifactRepository as never,
      {} as never,
      {} as never,
      undefined,
      runStepRepository as never,
      agentToolRegistry as never,
      runCheckpointRepository as never,
      agentSessionRepository as never,
    );

    await expect(service.continuePausedRun('run_1')).rejects.toThrow(
      'Multiple open resume checkpoints found for run: run_1: run_checkpoint_resume_a, run_checkpoint_resume_b.',
    );

    expect(agentToolRegistry.execute).not.toHaveBeenCalled();
    expect(runCheckpointRepository.updateStatus).not.toHaveBeenCalled();
    expect(agentSessionRepository.updateStatus).not.toHaveBeenCalled();
    expect(runRepository.updateResult).not.toHaveBeenCalled();
    expect(taskService.annotateRunCompleted).not.toHaveBeenCalled();
    expect(taskService.annotateRunFailed).not.toHaveBeenCalled();
  });

  it('blocks resume checkpoints bound to a missing agent session before executing tools', async () => {
    const {
      agentToolRegistry,
      runCheckpointRepository,
      service,
    } = buildPausedRunServiceWithPayload({
      version: 1,
      kind: 'resume',
      agentSessionId: 'agent_session_missing',
      reason: '等待先解除阻塞。',
      runId: 'run_1',
      nextTool: 'artifact.create_note',
      nextInput: {
        title: 'Recovered note',
        content: 'Recovered note',
      },
      taskId: 'task_1',
    });

    await expect(service.continuePausedRun('run_1')).rejects.toThrow(
      'Resume checkpoint agent session is not resumable for run: run_1 (agent_session_missing).',
    );

    expect(agentToolRegistry.execute).not.toHaveBeenCalled();
    expect(runCheckpointRepository.updateStatus).not.toHaveBeenCalled();
  });

  it.each([
    {
      payload: {
        version: 2,
        kind: 'resume',
        runId: 'run_1',
        taskId: 'task_1',
        nextTool: 'artifact.create_note',
        nextInput: {},
      },
      message: 'Resume checkpoint run_checkpoint_resume is not valid: Unsupported resume checkpoint payload version: 2.',
    },
    {
      payload: {
        version: 1,
        kind: 'tool_permission',
        runId: 'run_1',
        taskId: 'task_1',
        nextTool: 'artifact.create_note',
        nextInput: {},
      },
      message: 'Resume checkpoint run_checkpoint_resume is not valid: Resume checkpoint payload kind is not resume: tool_permission.',
    },
    {
      payload: {
        version: 1,
        kind: 'resume',
        runId: 'run_other',
        taskId: 'task_1',
        nextTool: 'artifact.create_note',
        nextInput: {},
      },
      message: 'Resume checkpoint run_checkpoint_resume is not valid: Resume checkpoint payload runId does not match run: run_1.',
    },
    {
      payload: {
        version: 1,
        kind: 'resume',
        runId: 'run_1',
        taskId: 'task_other',
        nextTool: 'artifact.create_note',
        nextInput: {},
      },
      message: 'Resume checkpoint run_checkpoint_resume is not valid: Resume checkpoint payload taskId does not match task: task_1.',
    },
    {
      payload: {
        version: 1,
        kind: 'resume',
        runId: 'run_1',
        taskId: 'task_1',
        nextTool: 'artifact.create_note',
        nextInput: {},
        policySnapshot: { allowLocalWorkspaceRead: false },
      },
      message: 'Resume checkpoint run_checkpoint_resume is not valid: Resume checkpoint payload policySnapshot is invalid.',
    },
  ])('rejects stale or incompatible resume payloads: $message', async ({ message, payload }) => {
    const {
      agentToolRegistry,
      runCheckpointRepository,
      service,
    } = buildPausedRunServiceWithPayload(payload);

    await expect(service.continuePausedRun('run_1')).rejects.toThrow(message);

    expect(agentToolRegistry.execute).not.toHaveBeenCalled();
    expect(runCheckpointRepository.updateStatus).not.toHaveBeenCalled();
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
    const artifactRepository = buildArtifactRepositoryMock();
    const aiConfigService = {
      getStatus: vi.fn().mockResolvedValue(buildConfiguredAiStatus()),
      resolveRuntimeConfig: vi.fn(),
    };
    const textExecutor = {
      execute: vi.fn(),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const service = new RunService(
      runRepository as never,
      taskService as never,
      artifactRepository as never,
      aiConfigService as never,
      textExecutor as never,
      undefined,
      runStepRepository as never,
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
    const artifactRepository = buildArtifactRepositoryMock({
      createFromRun: vi.fn().mockResolvedValue(buildArtifactRecord()),
    });
    const aiConfigService = {
      getStatus: vi.fn().mockResolvedValue(buildConfiguredAiStatus()),
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
    const runStepRepository = buildRunStepRepositoryMock();
    const service = new RunService(
      runRepository as never,
      taskService as never,
      artifactRepository as never,
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository as never,
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
