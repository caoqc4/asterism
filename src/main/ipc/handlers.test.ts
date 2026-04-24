import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handleMock, emitAppEventMock, servicesMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  emitAppEventMock: vi.fn(),
  servicesMock: {
    aiConfigService: {
      getStatus: vi.fn(),
      setConfig: vi.fn(),
    },
    schedulerService: {
      start: vi.fn(),
      stop: vi.fn(),
    },
    taskService: {
      list: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn(),
      update: vi.fn(),
      transition: vi.fn(),
      createBlocker: vi.fn(),
      updateBlocker: vi.fn(),
      resolveBlocker: vi.fn(),
      createCompletionCriteria: vi.fn(),
      updateCompletionCriteria: vi.fn(),
      satisfyCompletionCriteria: vi.fn(),
      reopenCompletionCriteria: vi.fn(),
      createTaskDependency: vi.fn(),
      updateTaskDependency: vi.fn(),
      resolveTaskDependency: vi.fn(),
      createSourceContext: vi.fn(),
      updateSourceContext: vi.fn(),
      archiveSourceContext: vi.fn(),
      createProcessTemplate: vi.fn(),
      updateProcessTemplate: vi.fn(),
      archiveProcessTemplate: vi.fn(),
      applyProcessTemplate: vi.fn(),
      removeProcessTemplate: vi.fn(),
    },
    decisionService: {
      list: vi.fn(),
      draft: vi.fn(),
      create: vi.fn(),
      act: vi.fn(),
    },
    homeBriefService: {
      getHomeData: vi.fn(),
    },
    runService: {
      list: vi.fn(),
      getDetail: vi.fn(),
      trigger: vi.fn(),
      continuePausedRun: vi.fn(),
    },
  },
}));

vi.mock('../electron.js', () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

vi.mock('../bootstrap/services.js', () => ({
  getServices: () => servicesMock,
}));

vi.mock('./event-bus.js', () => ({
  emitAppEvent: emitAppEventMock,
}));

import { registerIpcHandlers } from './handlers.js';

function getRegisteredHandler<TArgs extends unknown[], TResult>(channel: string) {
  const match = handleMock.mock.calls.find(([registeredChannel]) => registeredChannel === channel);

  if (!match) {
    throw new Error(`Handler not registered for channel: ${channel}`);
  }

  return match[1] as (_event: unknown, ...args: TArgs) => Promise<TResult>;
}

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    handleMock.mockClear();
    emitAppEventMock.mockClear();
    Object.values(servicesMock).forEach((service) => {
      Object.values(service).forEach((member) => {
        if (typeof member === 'function' && 'mockClear' in member) {
          member.mockClear();
        }
      });
    });

    registerIpcHandlers();
  });

  it('starts the scheduler and emits settings.changed when scheduler is enabled', async () => {
    const input = {
      provider: 'openai' as const,
      model: 'gpt-5.4-mini',
      baseUrl: 'https://relay.example.com/v1',
      apiKey: 'sk-test',
      featureFlags: {
        enableScheduler: true,
      },
    };

    servicesMock.aiConfigService.setConfig.mockResolvedValue({
      configured: true,
      apiKeyStored: true,
      apiKeySource: 'keychain',
      provider: 'openai',
      model: 'gpt-5.4-mini',
      baseUrl: 'https://relay.example.com/v1',
      updatedAt: '2026-01-02T00:00:00.000Z',
      configPath: '/tmp/config.json',
      featureFlags: {
        enableScheduler: true,
      },
    });

    const handler = getRegisteredHandler<[typeof input], Awaited<ReturnType<typeof servicesMock.aiConfigService.setConfig>>>(
      'settings:setAiConfig',
    );

    const result = await handler({}, input);

    expect(servicesMock.aiConfigService.setConfig).toHaveBeenCalledWith(input);
    expect(servicesMock.schedulerService.start).toHaveBeenCalled();
    expect(servicesMock.schedulerService.stop).not.toHaveBeenCalled();
    expect(emitAppEventMock).toHaveBeenCalledWith('settings.changed');
    expect(result.featureFlags.enableScheduler).toBe(true);
  });

  it('emits decision and task events after decision actions', async () => {
    servicesMock.decisionService.act.mockResolvedValue({
      id: 'decision_1',
      taskId: 'task_1',
      title: 'Approve launch',
      status: 'cancelled',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const handler = getRegisteredHandler<
      [{ id: string; action: 'approve' | 'defer' | 'cancel' }],
      Awaited<ReturnType<typeof servicesMock.decisionService.act>>
    >('decision:act');

    const result = await handler({}, { id: 'decision_1', action: 'cancel' });

    expect(servicesMock.decisionService.act).toHaveBeenCalledWith({
      id: 'decision_1',
      action: 'cancel',
    });
    expect(emitAppEventMock).toHaveBeenNthCalledWith(1, 'decision.changed', 'decision_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(2, 'task.changed', 'task_1');
    expect(result.status).toBe('cancelled');
  });

  it('routes decision drafts without emitting entity-change events', async () => {
    servicesMock.decisionService.draft.mockResolvedValue({
      taskId: 'task_1',
      title: 'Approve launch note',
      rationale: 'Current task needs explicit stakeholder approval.',
      source: 'ai',
      selectedTemplateIds: ['process_template_1'],
      selectedTemplateTitles: ['Approval skill'],
      selectionReason: 'This task is awaiting stakeholder sign-off.',
    });

    const handler = getRegisteredHandler<
      [{ taskId: string; note?: string | null }],
      Awaited<ReturnType<typeof servicesMock.decisionService.draft>>
    >('decision:draft');

    const result = await handler({}, {
      taskId: 'task_1',
      note: 'Need stakeholder sign-off',
    });

    expect(servicesMock.decisionService.draft).toHaveBeenCalledWith({
      taskId: 'task_1',
      note: 'Need stakeholder sign-off',
    });
    expect(emitAppEventMock).not.toHaveBeenCalled();
    expect(result.title).toBe('Approve launch note');
  });

  it('emits task.changed after source context writes', async () => {
    servicesMock.taskService.createSourceContext.mockResolvedValue({
      id: 'source_context_1',
      taskId: 'task_1',
      title: 'PRD',
      kind: 'doc',
      isKey: false,
      uri: 'https://example.com/prd',
      content: null,
      note: 'Primary product doc',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      archivedAt: null,
    });

    const handler = getRegisteredHandler<
      [{ taskId: string; title: string; kind: string; uri?: string; note?: string }],
      Awaited<ReturnType<typeof servicesMock.taskService.createSourceContext>>
    >('sourceContext:create');

    const result = await handler({}, {
      taskId: 'task_1',
      title: 'PRD',
      kind: 'doc',
      uri: 'https://example.com/prd',
      note: 'Primary product doc',
    });

    expect(servicesMock.taskService.createSourceContext).toHaveBeenCalledWith({
      taskId: 'task_1',
      title: 'PRD',
      kind: 'doc',
      uri: 'https://example.com/prd',
      note: 'Primary product doc',
    });
    expect(emitAppEventMock).toHaveBeenCalledWith('task.changed', 'task_1');
    expect(result.id).toBe('source_context_1');
  });

  it('emits task.changed after completion criteria writes', async () => {
    servicesMock.taskService.createCompletionCriteria.mockResolvedValue({
      id: 'criteria_1',
      taskId: 'task_1',
      text: 'Stakeholder approved final brief',
      status: 'open',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      satisfiedAt: null,
    });

    const handler = getRegisteredHandler<
      [{ taskId: string; text: string }],
      Awaited<ReturnType<typeof servicesMock.taskService.createCompletionCriteria>>
    >('completionCriteria:create');

    const result = await handler({}, {
      taskId: 'task_1',
      text: 'Stakeholder approved final brief',
    });

    expect(servicesMock.taskService.createCompletionCriteria).toHaveBeenCalledWith({
      taskId: 'task_1',
      text: 'Stakeholder approved final brief',
    });
    expect(emitAppEventMock).toHaveBeenCalledWith('task.changed', 'task_1');
    expect(result.id).toBe('criteria_1');
  });

  it('emits task.changed after task transitions', async () => {
    servicesMock.taskService.transition.mockResolvedValue({
      id: 'task_1',
      title: 'Launch brief',
      summary: 'Prepare the launch brief',
      state: 'in_progress',
      nextStep: 'Draft the brief',
      waitingReason: null,
      riskLevel: 'none',
      riskNote: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const handler = getRegisteredHandler<
      [{ taskId: string; nextState: string; reason?: string }],
      Awaited<ReturnType<typeof servicesMock.taskService.transition>>
    >('task:transition');

    const result = await handler({}, {
      taskId: 'task_1',
      nextState: 'in_progress',
      reason: 'Ready to draft',
    });

    expect(servicesMock.taskService.transition).toHaveBeenCalledWith({
      taskId: 'task_1',
      nextState: 'in_progress',
      reason: 'Ready to draft',
    });
    expect(emitAppEventMock).toHaveBeenCalledWith('task.changed', 'task_1');
    expect(result.state).toBe('in_progress');
  });

  it('emits task.changed for both sides after task dependency writes', async () => {
    servicesMock.taskService.createTaskDependency.mockResolvedValue({
      id: 'task_dependency_1',
      taskId: 'task_1',
      blockedByTaskId: 'task_2',
      blockedByTaskTitle: 'Upstream design',
      reason: 'Need upstream design to finish first',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      resolvedAt: null,
    });

    const handler = getRegisteredHandler<
      [{ taskId: string; blockedByTaskId: string; reason?: string }],
      Awaited<ReturnType<typeof servicesMock.taskService.createTaskDependency>>
    >('taskDependency:create');

    const result = await handler({}, {
      taskId: 'task_1',
      blockedByTaskId: 'task_2',
      reason: 'Need upstream design to finish first',
    });

    expect(servicesMock.taskService.createTaskDependency).toHaveBeenCalledWith({
      taskId: 'task_1',
      blockedByTaskId: 'task_2',
      reason: 'Need upstream design to finish first',
    });
    expect(emitAppEventMock).toHaveBeenNthCalledWith(1, 'task.changed', 'task_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(2, 'task.changed', 'task_2');
    expect(result.id).toBe('task_dependency_1');
  });

  it('emits task.changed after blocker writes', async () => {
    servicesMock.taskService.createBlocker.mockResolvedValue({
      id: 'blocker_1',
      taskId: 'task_1',
      title: 'Legal approval pending',
      kind: 'approval',
      detail: 'Need legal sign-off',
      owner: 'Legal',
      sourceContextId: null,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      resolvedAt: null,
    });

    const handler = getRegisteredHandler<
      [{ taskId: string; title: string; kind: string; detail?: string }],
      Awaited<ReturnType<typeof servicesMock.taskService.createBlocker>>
    >('blocker:create');

    const result = await handler({}, {
      taskId: 'task_1',
      title: 'Legal approval pending',
      kind: 'approval',
      detail: 'Need legal sign-off',
    });

    expect(servicesMock.taskService.createBlocker).toHaveBeenCalledWith({
      taskId: 'task_1',
      title: 'Legal approval pending',
      kind: 'approval',
      detail: 'Need legal sign-off',
    });
    expect(emitAppEventMock).toHaveBeenCalledWith('task.changed', 'task_1');
    expect(result.id).toBe('blocker_1');
  });

  it('emits task.changed after process template bindings change', async () => {
    servicesMock.taskService.applyProcessTemplate.mockResolvedValue({
      id: 'process_template_1',
      title: 'Outreach skill',
      summary: 'Workflow',
      content: 'Do the thing',
      kind: 'skill',
      tags: ['outreach'],
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      archivedAt: null,
      bindingId: 'task_process_binding_1',
      taskId: 'task_1',
      bindingStatus: 'active',
      bindingNote: null,
      boundAt: '2026-01-01T00:00:00.000Z',
      bindingUpdatedAt: '2026-01-01T00:00:00.000Z',
      removedAt: null,
    });

    const handler = getRegisteredHandler<
      [{ taskId: string; templateId: string }],
      Awaited<ReturnType<typeof servicesMock.taskService.applyProcessTemplate>>
    >('processTemplate:apply');

    const result = await handler({}, {
      taskId: 'task_1',
      templateId: 'process_template_1',
    });

    expect(servicesMock.taskService.applyProcessTemplate).toHaveBeenCalledWith({
      taskId: 'task_1',
      templateId: 'process_template_1',
    });
    expect(emitAppEventMock).toHaveBeenCalledWith('task.changed', 'task_1');
    expect(result.bindingId).toBe('task_process_binding_1');
  });

  it('emits run, task, and brief events after a run trigger', async () => {
    servicesMock.runService.trigger.mockResolvedValue({
      id: 'run_1',
      taskId: 'task_1',
      type: 'summarize',
      status: 'failed',
      instructions: 'Retry summary',
      output: 'Missing API key',
      outputSource: 'system',
      failureReason: 'Missing API key',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const handler = getRegisteredHandler<
      [{ taskId: string; type: 'draft' | 'summarize'; instructions?: string }],
      Awaited<ReturnType<typeof servicesMock.runService.trigger>>
    >('run:trigger');

    const result = await handler({}, {
      taskId: 'task_1',
      type: 'summarize',
      instructions: 'Retry summary',
    });

    expect(servicesMock.runService.trigger).toHaveBeenCalledWith({
      taskId: 'task_1',
      type: 'summarize',
      instructions: 'Retry summary',
    });
    expect(emitAppEventMock).toHaveBeenNthCalledWith(1, 'run.changed', 'run_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(2, 'task.changed', 'task_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(3, 'brief.changed');
    expect(result.failureReason).toBe('Missing API key');
  });

  it('emits run, task, and brief events after continuing a paused run', async () => {
    servicesMock.runService.continuePausedRun.mockResolvedValue({
      id: 'run_1',
      taskId: 'task_1',
      type: 'agent',
      status: 'completed',
      instructions: null,
      output: 'Recovered note',
      outputSource: 'system',
      failureReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const handler = getRegisteredHandler<
      [string],
      Awaited<ReturnType<typeof servicesMock.runService.continuePausedRun>>
    >('run:continuePaused');

    const result = await handler({}, 'run_1');

    expect(servicesMock.runService.continuePausedRun).toHaveBeenCalledWith('run_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(1, 'run.changed', 'run_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(2, 'task.changed', 'task_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(3, 'brief.changed');
    expect(result.status).toBe('completed');
  });
});
