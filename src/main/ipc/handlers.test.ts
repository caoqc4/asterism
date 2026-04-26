import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  codeAgentExecutionRunMock,
  handleMock,
  emitAppEventMock,
  probeLocalContainerSandboxBackendMock,
  servicesMock,
} = vi.hoisted(() => ({
  codeAgentExecutionRunMock: vi.fn(),
  handleMock: vi.fn(),
  emitAppEventMock: vi.fn(),
  probeLocalContainerSandboxBackendMock: vi.fn(),
  servicesMock: {
    aiConfigService: {
      getStatus: vi.fn(),
      resolveRuntimeConfig: vi.fn(),
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
    decisionRepository: {
      create: vi.fn(),
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
    runRepository: {
      create: vi.fn(),
      updateResult: vi.fn(),
    },
    runStepRepository: {
      create: vi.fn(),
      update: vi.fn(),
    },
    runCheckpointRepository: {
      create: vi.fn(),
      updatePayload: vi.fn(),
    },
    artifactRepository: {
      createPatchFromRun: vi.fn(),
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

vi.mock('../domain/run/local-container-sandbox-backend.js', () => ({
  probeLocalContainerSandboxBackend: probeLocalContainerSandboxBackendMock,
}));

vi.mock('../domain/run/local-container-sandboxed-coding-producer-execution-service.js', () => ({
  LocalContainerSandboxedCodingProducerExecutionService: vi.fn().mockImplementation(function MockExecutionService() {
    return {
    run: codeAgentExecutionRunMock,
    };
  }),
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
    codeAgentExecutionRunMock.mockReset();
    handleMock.mockClear();
    emitAppEventMock.mockClear();
    probeLocalContainerSandboxBackendMock.mockReset();
    delete process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER;
    delete process.env.TASKPLANE_CODE_AGENT_CONTEXT_FILES;
    servicesMock.aiConfigService.resolveRuntimeConfig.mockReset();
    Object.values(servicesMock).forEach((service) => {
      Object.values(service).forEach((member) => {
        if (typeof member === 'function' && 'mockClear' in member) {
          member.mockClear();
        }
      });
    });

    registerIpcHandlers();
  });

  it('runs the sandbox backend probe only through the explicit settings channel', async () => {
    servicesMock.aiConfigService.getStatus.mockResolvedValue({
      configured: true,
      apiKeyStored: true,
      apiKeySource: 'keychain',
      provider: 'openai-compatible',
      model: 'relay-model',
      baseUrl: 'https://relay.example.com/v1',
      workspaceRoot: '/tmp/taskplane-workspace',
      updatedAt: '2026-01-01T00:00:00.000Z',
      configPath: '/tmp/config.json',
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
    });
    probeLocalContainerSandboxBackendMock.mockResolvedValue({
      backendId: 'local-container',
      environmentPolicy: 'empty',
      isolation: 'container',
      kind: 'local_container',
      networkMode: 'disabled',
      status: 'available',
      supportsOutputLimits: true,
      supportsPatchArtifacts: true,
      supportsStagedWrites: true,
      supportsStructuredCommands: true,
      supportsTargetedCommands: true,
      supportsWorkspaceMount: true,
    });

    const handler = getRegisteredHandler<[], Awaited<ReturnType<typeof probeLocalContainerSandboxBackendMock>>>(
      'settings:probeSandboxBackend',
    );

    const result = await handler({});

    expect(probeLocalContainerSandboxBackendMock).toHaveBeenCalledTimes(1);
    expect(result.probe?.status).toBe('available');
    expect(result.readiness?.ready).toBe(true);
    expect(result.producerBackendReadiness?.ready).toBe(true);
    expect(result.summary).toBe('Sandbox backend ready: local-container.');
  });

  it('returns producer backend blocked readiness when the sandbox backend probe is unavailable', async () => {
    servicesMock.aiConfigService.getStatus.mockResolvedValue({
      configured: true,
      apiKeyStored: true,
      apiKeySource: 'keychain',
      provider: 'openai-compatible',
      model: 'relay-model',
      baseUrl: 'https://relay.example.com/v1',
      workspaceRoot: '/tmp/taskplane-workspace',
      updatedAt: '2026-01-01T00:00:00.000Z',
      configPath: '/tmp/config.json',
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
    });
    probeLocalContainerSandboxBackendMock.mockResolvedValue({
      backendId: 'local-container',
      kind: 'local_container',
      reason: 'docker: command not found',
      status: 'unavailable',
    });

    const handler = getRegisteredHandler<[], Awaited<ReturnType<typeof probeLocalContainerSandboxBackendMock>>>(
      'settings:probeSandboxBackend',
    );

    const result = await handler({});

    expect(result.probe?.status).toBe('unavailable');
    expect(result.producerBackendReadiness).toMatchObject({
      blockedReasons: ['docker: command not found'],
      ready: false,
      summary: 'Sandboxed coding producer backend blocked: docker: command not found',
    });
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
      workspaceRoot: '/tmp/taskplane-workspace',
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

  it('creates a manual code-agent sandbox preview run and emits refresh events', async () => {
    servicesMock.taskService.getDetail.mockResolvedValue({
      id: 'task_1',
      title: 'Prepare notes patch',
      summary: null,
      nextStep: null,
      state: 'planned',
      riskLevel: 'none',
      riskNote: null,
      waitingReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      blockers: [],
      completionCriteria: [{ id: 'criteria_1', text: 'Patch is reviewable' }],
      dependencies: [],
      processBindings: [],
      sourceContexts: [],
      timeline: [],
    });
    servicesMock.aiConfigService.getStatus.mockResolvedValue({
      configured: true,
      apiKeyStored: true,
      apiKeySource: 'env',
      provider: 'openai-compatible',
      model: 'relay-model',
      baseUrl: 'https://relay.example.com/v1',
      workspaceRoot: '/tmp/taskplane-workspace',
      updatedAt: '2026-01-01T00:00:00.000Z',
      configPath: '/tmp/config.json',
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
    });
    servicesMock.runRepository.create.mockResolvedValue({
      id: 'run_code_agent_1',
      taskId: 'task_1',
      type: 'agent',
      status: 'running',
      instructions: 'Code Agent manual sandbox producer preview.',
      output: null,
      outputSource: null,
      failureReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    servicesMock.runRepository.updateResult.mockResolvedValue({
      id: 'run_code_agent_1',
      taskId: 'task_1',
      type: 'agent',
      status: 'completed',
      instructions: 'Code Agent manual sandbox producer preview.',
      output: 'preview completed / patch review Decision created: decision_1',
      outputSource: 'system',
      failureReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    servicesMock.artifactRepository.createPatchFromRun.mockResolvedValue({
      id: 'artifact_1',
      taskId: 'task_1',
      runId: 'run_code_agent_1',
      kind: 'patch',
      title: 'Prepare a staged notes patch.',
      content: '{}',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    servicesMock.runStepRepository.create
      .mockResolvedValueOnce({
        id: 'step_review_session',
        runId: 'run_code_agent_1',
        index: 5,
        kind: 'plan',
        status: 'completed',
        title: '准备 sandbox patch review',
        input: null,
        output: null,
        error: null,
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        id: 'step_review_checks',
        runId: 'run_code_agent_1',
        index: 6,
        kind: 'tool_result',
        status: 'completed',
        title: 'sandbox targeted checks',
        input: null,
        output: null,
        error: null,
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        id: 'step_review_artifact',
        runId: 'run_code_agent_1',
        index: 7,
        kind: 'artifact',
        status: 'completed',
        title: '记录 sandbox patch artifact',
        input: null,
        output: 'artifact_1',
        error: null,
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        id: 'step_review_checkpoint',
        runId: 'run_code_agent_1',
        index: 8,
        kind: 'checkpoint',
        status: 'pending',
        title: '等待确认：sandbox patch promotion',
        input: null,
        output: null,
        error: null,
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      });
    servicesMock.runCheckpointRepository.create.mockResolvedValue({
      id: 'checkpoint_1',
      runId: 'run_code_agent_1',
      stepId: 'step_review_checkpoint',
      kind: 'patch_promotion',
      status: 'open',
      payload: '{}',
      createdAt: '2026-01-02T00:00:00.000Z',
      resolvedAt: null,
    });
    servicesMock.runCheckpointRepository.updatePayload.mockResolvedValue({
      id: 'checkpoint_1',
      runId: 'run_code_agent_1',
      stepId: 'step_review_checkpoint',
      kind: 'patch_promotion',
      status: 'open',
      payload: '{}',
      createdAt: '2026-01-02T00:00:00.000Z',
      resolvedAt: null,
    });
    servicesMock.decisionRepository.create.mockResolvedValue({
      id: 'decision_1',
      taskId: 'task_1',
      title: 'Review Code Agent preview for Prepare notes patch',
      status: 'pending',
      note: null,
      sourceType: 'agent_checkpoint',
      sourceId: 'checkpoint_1',
      sourceLabel: 'workspace.staged_patch',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    codeAgentExecutionRunMock.mockResolvedValue({
      preview: {
        preview: {
          preview: {
            events: [
              {
                outputSummary: 'test: passed',
                runId: 'run_code_agent_1',
                script: 'test',
                sessionId: 'sandboxed_producer:sandbox_source_run_code_agent_1',
                sourceId: 'sandbox_source_run_code_agent_1',
                status: 'passed',
                type: 'sandbox_producer.check_completed',
              },
            ],
            plan: {
              decisionTitle: 'Review Code Agent preview for Prepare notes patch',
              patchDraft: {
                diff: '--- /dev/null\n+++ b/.taskplane/code-agent-preview.md',
                files: ['.taskplane/code-agent-preview.md'],
                riskSummary: 'Pending human review before workspace promotion.',
                summary: 'Prepare a staged notes patch.',
              },
              requestBundle: {
                audit: {
                  acceptedScripts: ['test'],
                  idempotencyKey: 'sandbox-patch-review:sandbox_session:sandbox_source_run_code_agent_1:run_code_agent_1:task_1:test',
                  initiatedBy: 'internal_sandbox_patch_review',
                  patchDraftSource: {
                    sourceId: 'sandbox_source_run_code_agent_1',
                    sourceKind: 'sandbox_session',
                  },
                  reason: 'Review sandbox patch before workspace promotion.',
                  rejectedScripts: [],
                  requestedScripts: ['test'],
                  workspaceRoot: '/tmp/taskplane-workspace',
                },
                checkPlan: {
                  scripts: ['test'],
                },
                request: {
                  commandPolicy: {
                    allowArbitraryShell: false,
                    allowInteractive: false,
                    allowedScripts: ['test', 'lint'],
                    outputLimitBytes: 64_000,
                    timeoutMs: 120_000,
                  },
                  descriptorId: 'workspace.staged_patch',
                  executionPolicy: {
                    credentialPolicy: 'none',
                    descriptorId: 'workspace.staged_patch',
                    networkPolicy: 'disabled',
                    outputLimitBytes: 64_000,
                    timeoutMs: 120_000,
                    workspaceRoot: '/tmp/taskplane-workspace',
                  },
                  providerKind: 'local_container',
                  runId: 'run_code_agent_1',
                  taskId: 'task_1',
                  workspace: {
                    mode: 'staged_write',
                    mountPath: '/workspace',
                    workspaceRoot: '/tmp/taskplane-workspace',
                  },
                },
                summary: 'descriptor=workspace.staged_patch',
              },
              status: 'ready',
              summary: 'Sandbox patch review run plan ready',
            },
            sessionMetadata: 'executor=sandboxed_coding_producer',
            sessionSummary: 'manual sandbox producer preview completed without external AI call',
            source: {
              evidence: {
                commandSummaries: ['test: passed'],
                modelSummary: 'Manual sandbox preview',
                observations: ['Wrote staged diagnostic patch.'],
              },
              patchDraft: {
                diff: '--- /dev/null\n+++ b/.taskplane/code-agent-preview.md',
                files: ['.taskplane/code-agent-preview.md'],
                riskSummary: 'Pending human review before workspace promotion.',
                summary: 'Prepare a staged notes patch.',
              },
              policySnapshot: {
                network: 'disabled',
                noCredentialPassthrough: true,
                promotion: 'decision_required',
              },
              requestedScripts: ['test'],
              runId: 'run_code_agent_1',
              sourceId: 'sandbox_source_run_code_agent_1',
              sourceKind: 'sandbox_session',
              taskId: 'task_1',
              workspaceRoot: '/tmp/taskplane-workspace',
            },
            status: 'preview_ready',
            steps: [],
          },
        },
        status: 'previewed',
        summary: 'preview completed',
      },
      status: 'completed',
      summary: 'preview completed',
    });

    const handler = getRegisteredHandler<
      [{ taskId: string; patchIntent: string; requestedChecks: ['test']; operatorConfirmed: true }],
      Awaited<ReturnType<typeof servicesMock.runRepository.updateResult>>
    >('run:triggerCodeAgent');

    const result = await handler({}, {
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      taskId: 'task_1',
    });

    expect(servicesMock.runRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_1',
      type: 'agent',
    }));
    expect(codeAgentExecutionRunMock).toHaveBeenCalledWith(expect.objectContaining({
      operatorConfirmed: true,
      patchSummary: 'Prepare a staged notes patch.',
      producerLoop: expect.any(Function),
      request: expect.objectContaining({
        commandPolicy: expect.objectContaining({
          allowedScripts: ['test'],
        }),
        runId: 'run_code_agent_1',
        sourceId: 'sandbox_source_run_code_agent_1',
        taskId: 'task_1',
      }),
    }));
    expect(servicesMock.aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(servicesMock.runRepository.updateResult).toHaveBeenCalledWith(
      'run_code_agent_1',
      'completed',
      'preview completed / patch review Decision created: decision_1',
      'system',
      null,
    );
    expect(servicesMock.artifactRepository.createPatchFromRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_code_agent_1',
      taskId: 'task_1',
      title: 'Prepare a staged notes patch.',
    }));
    expect(servicesMock.runCheckpointRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'patch_promotion',
      runId: 'run_code_agent_1',
    }));
    expect(servicesMock.decisionRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      sourceLabel: 'workspace.staged_patch',
      sourceType: 'agent_checkpoint',
      taskId: 'task_1',
      title: 'Review Code Agent preview for Prepare notes patch',
    }));
    expect(emitAppEventMock).toHaveBeenNthCalledWith(1, 'run.changed', 'run_code_agent_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(2, 'task.changed', 'task_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(3, 'brief.changed');
    expect(result.status).toBe('completed');
  });

  it('blocks the manual code-agent path when model producer env opt-in cannot resolve runtime config', async () => {
    process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER = 'true';
    servicesMock.taskService.getDetail.mockResolvedValue({
      id: 'task_1',
      title: 'Prepare notes patch',
      summary: null,
      nextStep: null,
      state: 'planned',
      riskLevel: 'none',
      riskNote: null,
      waitingReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      blockers: [],
      completionCriteria: [],
      dependencies: [],
      processBindings: [],
      sourceContexts: [],
      timeline: [],
    });
    servicesMock.aiConfigService.getStatus.mockResolvedValue({
      configured: true,
      apiKeyStored: true,
      apiKeySource: 'env',
      provider: 'fal-openrouter',
      model: 'google/gemini-2.5-flash',
      baseUrl: null,
      workspaceRoot: '/tmp/taskplane-workspace',
      updatedAt: '2026-01-01T00:00:00.000Z',
      configPath: '/tmp/config.json',
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
    });
    servicesMock.aiConfigService.resolveRuntimeConfig.mockRejectedValue(new Error('Missing API key'));
    servicesMock.runRepository.create.mockResolvedValue({
      id: 'run_code_agent_1',
      taskId: 'task_1',
      type: 'agent',
      status: 'running',
      instructions: 'Code Agent manual sandbox producer preview.',
      output: null,
      outputSource: null,
      failureReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    servicesMock.runRepository.updateResult.mockResolvedValue({
      id: 'run_code_agent_1',
      taskId: 'task_1',
      type: 'agent',
      status: 'failed',
      instructions: 'Code Agent manual sandbox producer preview.',
      output: 'Code Agent model producer runtime blocked: Missing API key',
      outputSource: 'system',
      failureReason: 'Missing API key',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const handler = getRegisteredHandler<
      [{ taskId: string; patchIntent: string; requestedChecks: ['test']; operatorConfirmed: true }],
      Awaited<ReturnType<typeof servicesMock.runRepository.updateResult>>
    >('run:triggerCodeAgent');

    const result = await handler({}, {
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      taskId: 'task_1',
    });

    expect(servicesMock.aiConfigService.resolveRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(codeAgentExecutionRunMock).not.toHaveBeenCalled();
    expect(servicesMock.runRepository.updateResult).toHaveBeenCalledWith(
      'run_code_agent_1',
      'failed',
      'Code Agent model producer runtime blocked: Missing API key',
      'system',
      'Missing API key',
    );
    expect(result.status).toBe('failed');
  });

  it('blocks env-gated model producer runs when selected workspace context is invalid', async () => {
    process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER = 'true';
    process.env.TASKPLANE_CODE_AGENT_CONTEXT_FILES = '../escape.md';
    servicesMock.taskService.getDetail.mockResolvedValue({
      id: 'task_1',
      title: 'Prepare notes patch',
      summary: null,
      nextStep: null,
      state: 'planned',
      riskLevel: 'none',
      riskNote: null,
      waitingReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      blockers: [],
      completionCriteria: [],
      dependencies: [],
      processBindings: [],
      sourceContexts: [],
      timeline: [],
    });
    servicesMock.aiConfigService.getStatus.mockResolvedValue({
      configured: true,
      apiKeyStored: true,
      apiKeySource: 'env',
      provider: 'fal-openrouter',
      model: 'google/gemini-2.5-flash',
      baseUrl: null,
      workspaceRoot: '/tmp/taskplane-workspace',
      updatedAt: '2026-01-01T00:00:00.000Z',
      configPath: '/tmp/config.json',
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
    });
    servicesMock.aiConfigService.resolveRuntimeConfig.mockResolvedValue({
      apiKey: 'secret',
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      model: 'google/gemini-2.5-flash',
      provider: 'fal-openrouter',
      workspaceRoot: '/tmp/taskplane-workspace',
    });
    servicesMock.runRepository.create.mockResolvedValue({
      id: 'run_code_agent_1',
      taskId: 'task_1',
      type: 'agent',
      status: 'running',
      instructions: 'Code Agent manual sandbox producer preview.',
      output: null,
      outputSource: null,
      failureReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    servicesMock.runRepository.updateResult.mockResolvedValue({
      id: 'run_code_agent_1',
      taskId: 'task_1',
      type: 'agent',
      status: 'failed',
      instructions: 'Code Agent manual sandbox producer preview.',
      output: 'Code Agent workspace context blocked: Code Agent workspace context path is not allowed: ../escape.md.',
      outputSource: 'system',
      failureReason: 'Code Agent workspace context path is not allowed: ../escape.md.',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const handler = getRegisteredHandler<
      [{ taskId: string; patchIntent: string; requestedChecks: ['test']; operatorConfirmed: true }],
      Awaited<ReturnType<typeof servicesMock.runRepository.updateResult>>
    >('run:triggerCodeAgent');

    const result = await handler({}, {
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      taskId: 'task_1',
    });

    expect(codeAgentExecutionRunMock).not.toHaveBeenCalled();
    expect(servicesMock.runRepository.updateResult).toHaveBeenCalledWith(
      'run_code_agent_1',
      'failed',
      'Code Agent workspace context blocked: Code Agent workspace context path is not allowed: ../escape.md.',
      'system',
      'Code Agent workspace context path is not allowed: ../escape.md.',
    );
    expect(result.status).toBe('failed');
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
