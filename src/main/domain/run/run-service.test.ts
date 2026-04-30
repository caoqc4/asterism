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
    getDetail: vi.fn(),
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
    service,
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
      listForRun: vi.fn().mockResolvedValue([{ id: 'run_step_1' }]),
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
    );

    const result = await service.getDetail('run_1');

    expect(runRepository.getDetail).toHaveBeenCalledWith('run_1');
    expect(runStepRepository.listForRun).toHaveBeenCalledWith('run_1');
    expect(runCheckpointRepository.listForRun).toHaveBeenCalledWith('run_1');
    expect(agentSessionRepository.listForRun).toHaveBeenCalledWith('run_1');
    expect(artifactRepository.listForRun).toHaveBeenCalledWith('run_1');
    expect(result?.artifacts).toEqual([{ id: 'artifact_1' }]);
    expect(result?.agentSessions).toEqual([{ id: 'agent_session_1' }]);
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
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run_1', kind: 'plan' }),
    );
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_2',
      expect.objectContaining({ status: 'completed', output: 'Generated output' }),
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
    const artifactRepository = buildArtifactRepositoryMock();
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
      'run_step_2',
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
      {} as never,
      {} as never,
      undefined,
      undefined,
      null,
      undefined,
      undefined as never,
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
      getDetail: vi.fn(),
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
      'agent_session_confirmation_new_created',
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
    expect(artifactRepository.createFromRun).not.toHaveBeenCalled();
    expect(result.status).toBe('completed');
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
      message: 'Unsupported resume checkpoint payload version: 2.',
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
      message: 'Resume checkpoint payload kind is not resume: tool_permission.',
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
      message: 'Resume checkpoint payload runId does not match run: run_1.',
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
      message: 'Resume checkpoint payload taskId does not match task: task_1.',
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
      message: 'Resume checkpoint payload policySnapshot is invalid.',
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
