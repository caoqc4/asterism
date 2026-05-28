import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  codeAgentExecutionRunMock,
  generateTextMock,
  getLanguageModelMock,
  handleMock,
  emitAppEventMock,
  execFileMock,
  gmailOAuthConnectMock,
  gmailOAuthDisconnectMock,
  probeLocalContainerSandboxBackendMock,
  servicesMock,
} = vi.hoisted(() => ({
  codeAgentExecutionRunMock: vi.fn(),
  generateTextMock: vi.fn(),
  getLanguageModelMock: vi.fn(),
  handleMock: vi.fn(),
  emitAppEventMock: vi.fn(),
  execFileMock: vi.fn(),
  gmailOAuthConnectMock: vi.fn(),
  gmailOAuthDisconnectMock: vi.fn(),
  probeLocalContainerSandboxBackendMock: vi.fn(),
  servicesMock: {
    aiConfigService: {
      getStatus: vi.fn(),
      resolveRuntimeConfig: vi.fn(),
      setConfig: vi.fn(),
    },
    appConfigService: {
      read: vi.fn(),
    },
    schedulerService: {
      start: vi.fn(),
      stop: vi.fn(),
      triggerScheduledEventAgentRun: vi.fn(),
    },
    taskService: {
      list: vi.fn(),
      getHierarchyConsistency: vi.fn(),
      getHierarchyManualReviewPolicy: vi.fn(),
      applySafeHierarchyRepairs: vi.fn(),
      applyHierarchyManualResolution: vi.fn(),
      create: vi.fn(),
      getDetail: vi.fn(),
      update: vi.fn(),
      transition: vi.fn(),
      recordCompletionCheck: vi.fn(),
      recordTimelineEvent: vi.fn(),
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
    workHabitService: {
      getSnapshot: vi.fn(),
      importLegacy: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      createManual: vi.fn(),
      propose: vi.fn(),
      resolveConflict: vi.fn(),
      recordCompletionOverride: vi.fn(),
      recordSopTemplate: vi.fn(),
      recordApplications: vi.fn(),
    },
    decisionService: {
      list: vi.fn(),
      draft: vi.fn(),
      create: vi.fn(),
      act: vi.fn(),
    },
    taskplaneWritebackDispatchService: {
      dispatch: vi.fn(),
    },
    decisionRepository: {
      create: vi.fn(),
    },
    homeBriefService: {
      getHomeData: vi.fn(),
    },
    externalAccessSourceIngestionService: {
      preview: vi.fn(),
      commit: vi.fn(),
    },
    runService: {
      list: vi.fn(),
      getDetail: vi.fn(),
      trigger: vi.fn(),
      continuePausedRun: vi.fn(),
    },
    agentCliRunService: {
      trigger: vi.fn(),
      recordNativeGoalRequest: vi.fn(),
      cancel: vi.fn(),
    },
    codeAgentRunService: {
      trigger: vi.fn(),
    },
    patchArtifactSandboxReviewRunService: {
      run: vi.fn(),
    },
    sandboxPatchPromotionApplyService: {
      apply: vi.fn(),
    },
    operatorStartedRunService: {
      trigger: vi.fn(),
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
      createNoteFromRun: vi.fn(),
      createManualNote: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    taskFileRepository: {
      listForTask: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('../electron.js', () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

vi.mock('../bootstrap/services.js', () => ({
  getServices: () => servicesMock,
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
}));

vi.mock('../executors/ai-client.js', () => ({
  getLanguageModel: getLanguageModelMock,
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

vi.mock('../domain/external-access/gmail-oauth-control-service.js', () => ({
  GmailOAuthControlService: vi.fn().mockImplementation(function MockGmailOAuthControlService() {
    return {
      connect: gmailOAuthConnectMock,
      disconnect: gmailOAuthDisconnectMock,
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

const readyCodeAgentWorkspaceChecks = {
  lint: {
    available: true,
    reason: 'package.json exposes npm run lint.',
  },
  test: {
    available: true,
    reason: 'package.json exposes npm run test.',
  },
};

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    codeAgentExecutionRunMock.mockReset();
    generateTextMock.mockReset();
    getLanguageModelMock.mockReset();
    getLanguageModelMock.mockReturnValue('language-model');
    generateTextMock.mockResolvedValue({ text: 'AI response' });
    handleMock.mockClear();
    emitAppEventMock.mockClear();
    execFileMock.mockReset();
    gmailOAuthConnectMock.mockReset();
    gmailOAuthDisconnectMock.mockReset();
    probeLocalContainerSandboxBackendMock.mockReset();
    delete process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER;
    delete process.env.TASKPLANE_CODE_AGENT_CONTEXT_FILES;
    servicesMock.aiConfigService.resolveRuntimeConfig.mockReset();
    servicesMock.aiConfigService.getStatus.mockResolvedValue({
      configured: true,
      apiKeyStored: true,
      apiKeySource: 'keychain',
      provider: 'openai',
      model: 'gpt-test',
      baseUrl: null,
      workspaceRoot: null,
      runtimeMode: 'api',
      updatedAt: '2026-01-01T00:00:00.000Z',
      configPath: '/tmp/taskplane-config.json',
      featureFlags: {
        enableScheduler: false,
      },
    });
    Object.values(servicesMock).forEach((service) => {
      Object.values(service).forEach((member) => {
        if (typeof member === 'function' && 'mockClear' in member) {
          member.mockClear();
        }
      });
    });
    servicesMock.taskService.list.mockResolvedValue([]);
    servicesMock.appConfigService.read.mockReturnValue({
      featureFlags: {
        enableSandboxPatchPromotionApply: false,
      },
      workspaceRoot: '/tmp/taskplane-workspace',
    });
    servicesMock.taskService.getDetail.mockResolvedValue({
      id: 'task_1',
      title: 'Task 1',
      state: 'planned',
    });
    servicesMock.artifactRepository.findById.mockResolvedValue(null);
    servicesMock.taskFileRepository.findById.mockResolvedValue(null);

    registerIpcHandlers();
  });

  it('returns task hierarchy consistency diagnostics through IPC', async () => {
    servicesMock.taskService.getHierarchyConsistency.mockResolvedValue({
      consistent: false,
      issues: [
        {
          code: 'missing_parent_child_link',
          taskId: 'project_1',
          relatedTaskId: 'child_1',
          message: '父任务没有列出子任务。',
        },
      ],
      issueCount: 1,
      summary: '任务层级存在 1 个一致性问题。',
    });

    const handler = getRegisteredHandler<[], unknown>('task:getHierarchyConsistency');

    await expect(handler({})).resolves.toMatchObject({
      consistent: false,
      issueCount: 1,
    });
  });

  it('applies safe hierarchy repairs through IPC and emits a task change', async () => {
    servicesMock.taskService.applySafeHierarchyRepairs.mockResolvedValue({
      appliedActionCount: 1,
      skippedManualReviewCount: 0,
      before: {
        canAutoApplyAll: true,
        actions: [],
        safeActionCount: 1,
        manualReviewCount: 0,
        summary: '可安全修复 1 项，需人工确认 0 项。',
      },
      after: {
        canAutoApplyAll: false,
        actions: [],
        safeActionCount: 0,
        manualReviewCount: 0,
        summary: '任务层级关系一致，无需修复。',
      },
      summary: '已应用 1 项安全层级修复，保留 0 项人工确认。',
    });

    const handler = getRegisteredHandler<[], unknown>('task:applySafeHierarchyRepairs');

    await expect(handler({})).resolves.toMatchObject({
      appliedActionCount: 1,
    });
    expect(emitAppEventMock).toHaveBeenCalledWith('task.changed');
    expect(emitAppEventMock).toHaveBeenCalledTimes(1);
  });

  it('returns hierarchy manual-review policy through IPC', async () => {
    servicesMock.taskService.getHierarchyManualReviewPolicy.mockResolvedValue({
      required: true,
      items: [
        {
          reason: 'missing_record',
          decisionQuestion: '缺失的任务记录是否应恢复，还是应移除这条层级引用？',
          recommendedResolution: '先确认缺失记录来源；无法恢复时再移除悬空引用。',
          issue: {
            code: 'missing_child_record',
            taskId: 'project_1',
            relatedTaskId: 'missing_child',
            message: '任务引用了不存在的子任务。',
          },
        },
      ],
      summary: '有 1 个层级关系需要人工确认。',
    });

    const handler = getRegisteredHandler<[], unknown>('task:getHierarchyManualReviewPolicy');

    await expect(handler({})).resolves.toMatchObject({
      required: true,
      items: [
        {
          reason: 'missing_record',
        },
      ],
    });
  });

  it('applies explicit hierarchy manual resolution through IPC and emits a task change', async () => {
    const input = {
      kind: 'set_unique_parent',
      taskId: 'child_1',
      targetParentTaskId: 'project_1',
    };
    servicesMock.taskService.applyHierarchyManualResolution.mockResolvedValue({
      before: {
        required: true,
        items: [],
        summary: '有 1 个层级关系需要人工确认。',
      },
      after: {
        required: false,
        items: [],
        summary: '没有需要人工确认的层级关系。',
      },
      applied: true,
      summary: '已应用人工确认的层级维护动作。',
    });

    const handler = getRegisteredHandler<[typeof input], unknown>('task:applyHierarchyManualResolution');

    await expect(handler({}, input)).resolves.toMatchObject({
      applied: true,
    });
    expect(servicesMock.taskService.applyHierarchyManualResolution).toHaveBeenCalledWith(input);
    expect(emitAppEventMock).toHaveBeenCalledWith('task.changed');
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
      codeAgentWorkspaceChecks: readyCodeAgentWorkspaceChecks,
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
      codeAgentWorkspaceChecks: readyCodeAgentWorkspaceChecks,
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

  it('opens a prepared Codex CLI login command without storing credentials', async () => {
    execFileMock.mockImplementation((_command: unknown, _args: unknown, callback: (error: Error | null) => void) => {
      callback(null);
    });

    const handler = getRegisteredHandler<[{ runtimeId: 'codex' }], {
      command: string;
      opened: boolean;
      runtimeId: string;
      summary: string;
    }>('settings:openAgentCliLogin');

    const result = await handler({}, { runtimeId: 'codex' });

    expect(result).toMatchObject({
      command: 'codex login',
      opened: true,
      runtimeId: 'codex',
    });
    expect(execFileMock).toHaveBeenCalledWith('osascript', expect.arrayContaining([
      'tell application "Terminal" to activate',
      expect.stringContaining('codex login'),
    ]), expect.any(Function));
    expect(servicesMock.aiConfigService.setConfig).not.toHaveBeenCalled();
  });

  it('opens a prepared Claude Code install command without storing credentials', async () => {
    execFileMock.mockImplementation((_command: unknown, _args: unknown, callback: (error: Error | null) => void) => {
      callback(null);
    });

    const handler = getRegisteredHandler<[{ runtimeId: 'claude' }], {
      command: string;
      opened: boolean;
      runtimeId: string;
      summary: string;
    }>('settings:openAgentCliInstall');

    const result = await handler({}, { runtimeId: 'claude' });

    expect(result).toMatchObject({
      opened: true,
      runtimeId: 'claude',
    });
    expect(result.command).toContain('npm install -g @anthropic-ai/claude-code --include=optional');
    expect(result.command).toContain('claude auth status --text');
    expect(result.command).toContain('Return to Taskplane and click Re-detect.');
    expect(execFileMock).toHaveBeenCalledWith('osascript', expect.arrayContaining([
      'tell application "Terminal" to activate',
      expect.stringContaining('Return to Taskplane and click Re-detect.'),
    ]), expect.any(Function));
    expect(servicesMock.aiConfigService.setConfig).not.toHaveBeenCalled();
  });

  it('opens a Claude Code repair install command for broken npm installs', async () => {
    execFileMock.mockImplementation((_command: unknown, _args: unknown, callback: (error: Error | null) => void) => {
      callback(null);
    });

    const handler = getRegisteredHandler<[{ repair: true; runtimeId: 'claude' }], {
      command: string;
      opened: boolean;
      runtimeId: string;
      summary: string;
    }>('settings:openAgentCliInstall');

    const result = await handler({}, { repair: true, runtimeId: 'claude' });

    expect(result).toMatchObject({
      opened: true,
      runtimeId: 'claude',
    });
    expect(result.command).toContain('mv "$dir" "$dir.bak.$STAMP"');
    expect(result.command).toContain('npm install -g @anthropic-ai/claude-code --include=optional');
    expect(result.command).toContain('claude --version');
    expect(result.command).toContain('Return to Taskplane and click Re-detect.');
    expect(execFileMock).toHaveBeenCalledWith('osascript', expect.arrayContaining([
      'tell application "Terminal" to activate',
      expect.stringContaining('claude-code --include=optional'),
    ]), expect.any(Function));
    expect(servicesMock.aiConfigService.setConfig).not.toHaveBeenCalled();
  });

  it('connects Gmail OAuth through explicit External Access IPC and emits settings.changed only when connected', async () => {
    gmailOAuthConnectMock.mockResolvedValue({
      status: 'connected',
      connectorId: 'gmail',
      openedAuthorizationUrl: true,
      accountLabel: 'user@example.com',
      redirectUri: 'http://127.0.0.1:40000/oauth/gmail/callback',
      errorReason: null,
    });
    const handler = getRegisteredHandler<[{ confirmed: boolean }], Awaited<ReturnType<typeof gmailOAuthConnectMock>>>(
      'externalAccess:gmailOAuthConnect',
    );

    const result = await handler({}, { confirmed: true });

    expect(gmailOAuthConnectMock).toHaveBeenCalledWith({ confirmed: true });
    expect(result.status).toBe('connected');
    expect(emitAppEventMock).toHaveBeenCalledWith('settings.changed');
  });

  it('disconnects Gmail OAuth through explicit External Access IPC and emits settings.changed only when disconnected', async () => {
    gmailOAuthDisconnectMock.mockResolvedValue({
      status: 'disconnected',
      connectorId: 'gmail',
      hadRefreshToken: true,
      revoked: true,
      localTokenCleared: true,
      errorReason: null,
    });
    const handler = getRegisteredHandler<[{ confirmed: boolean }], Awaited<ReturnType<typeof gmailOAuthDisconnectMock>>>(
      'externalAccess:gmailOAuthDisconnect',
    );

    const result = await handler({}, { confirmed: true });

    expect(gmailOAuthDisconnectMock).toHaveBeenCalledWith({ confirmed: true });
    expect(result.status).toBe('disconnected');
    expect(emitAppEventMock).toHaveBeenCalledWith('settings.changed');
  });

  it('previews External Access source ingestion without emitting task change events', async () => {
    servicesMock.externalAccessSourceIngestionService.preview.mockResolvedValue({
      taskId: 'task_1',
      plans: [],
      createCount: 0,
      reviewCount: 0,
      skipCount: 0,
    });
    const handler = getRegisteredHandler<
      [{ taskId: string }],
      Awaited<ReturnType<typeof servicesMock.externalAccessSourceIngestionService.preview>>
    >('externalAccess:sourceIngestionPreview');

    const result = await handler({}, { taskId: 'task_1' });

    expect(servicesMock.externalAccessSourceIngestionService.preview).toHaveBeenCalledWith({
      taskId: 'task_1',
    });
    expect(emitAppEventMock).not.toHaveBeenCalled();
    expect(result.createCount).toBe(0);
  });

  it('commits confirmed External Access source ingestion and emits task.changed when memory was written', async () => {
    servicesMock.externalAccessSourceIngestionService.commit.mockResolvedValue({
      taskId: 'task_1',
      created: [{
        id: 'source_context_1',
        taskId: 'task_1',
        title: '客户确认邮件',
        kind: 'doc',
        isKey: false,
        uri: 'gmail://message/message_1',
        content: null,
        note: null,
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
      }],
      skippedPlanIds: [],
    });
    const handler = getRegisteredHandler<
      [{ taskId: string; planIds: string[]; confirmed: boolean }],
      Awaited<ReturnType<typeof servicesMock.externalAccessSourceIngestionService.commit>>
    >('externalAccess:sourceIngestionCommit');

    const result = await handler({}, {
      taskId: 'task_1',
      planIds: ['connector:gmail:message_1'],
      confirmed: true,
    });

    expect(servicesMock.externalAccessSourceIngestionService.commit).toHaveBeenCalledWith({
      taskId: 'task_1',
      planIds: ['connector:gmail:message_1'],
      confirmed: true,
    });
    expect(emitAppEventMock).toHaveBeenCalledWith('task.changed', 'task_1');
    expect(result.created).toHaveLength(1);
  });

  it('applies saved AI behavior preferences to chat prompts', async () => {
    servicesMock.aiConfigService.resolveRuntimeConfig.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'sk-test',
      baseUrl: null,
      featureFlags: {
        enableScheduler: false,
        communicationStyle: 'detailed',
        confirmationThreshold: 'high',
      },
    });

    const handler = getRegisteredHandler<
      [{
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        pilotDecision?: ReturnType<typeof buildPilotDecisionSnapshotForTest>;
        taskId?: string | null;
      }],
      {
        text: string;
        invocation?: {
          phase: string;
          layer: string;
          runtime: { mode: string; label: string };
          status: string;
          summary: string;
          pilotDecision?: ReturnType<typeof buildPilotDecisionSnapshotForTest> | null;
        };
      }
    >('ai:chat');
    const pilotDecision = buildPilotDecisionSnapshotForTest();

    const result = await handler({}, {
      taskId: null,
      pilotDecision,
      messages: [{ role: 'user', content: '帮我规划今天' }],
    });

    expect(result.text).toBe('AI response');
    expect(result.invocation).toMatchObject({
      phase: 'global_assistant',
      layer: 'api_runtime',
      runtime: {
        mode: 'api',
        label: 'Agent API Runtime · openai / gpt-test',
      },
      status: 'completed',
      summary: '已生成全局 API Runtime 回答。',
      pilotDecision,
    });
    expect(getLanguageModelMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-test',
    }));
    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'language-model',
      system: expect.stringContaining('AI behavior preferences'),
      messages: [{ role: 'user', content: '帮我规划今天' }],
    }));
    const system = generateTextMock.mock.calls[0]?.[0]?.system as string;
    expect(system).toContain('Provide more context and rationale');
    expect(system).toContain('Ask for confirmation more often');
  });

  it('does not route API chat when Agent CLI is the selected runtime', async () => {
    servicesMock.aiConfigService.getStatus.mockResolvedValue({
      configured: true,
      apiKeyStored: true,
      apiKeySource: 'keychain',
      provider: 'openai',
      model: 'gpt-test',
      baseUrl: null,
      workspaceRoot: null,
      runtimeMode: 'claude',
      updatedAt: '2026-01-01T00:00:00.000Z',
      configPath: '/tmp/taskplane-config.json',
      featureFlags: {
        enableScheduler: false,
      },
    });

    const handler = getRegisteredHandler<
      [{ messages: Array<{ role: 'user' | 'assistant'; content: string }>; taskId?: string | null }],
      { text: string }
    >('ai:chat');

    await expect(handler({}, {
      taskId: null,
      messages: [{ role: 'user', content: '帮我规划今天' }],
    })).rejects.toThrow('当前 API 聊天 adapter 不会在未确认的情况下切换到 Agent API Runtime');
    expect(servicesMock.aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('uses the latest active key sources in task chat prompts', async () => {
    servicesMock.aiConfigService.resolveRuntimeConfig.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'sk-test',
      baseUrl: null,
      featureFlags: {
        enableScheduler: false,
      },
    });
    servicesMock.taskService.getDetail.mockResolvedValue({
      activeBlocker: null,
      activeWaitingItem: null,
      nextStep: '确认材料',
      resumeCard: {
        nextSuggestedMove: '继续修订',
        summary: '等待最终拍板',
      },
      artifacts: [
        { id: 'artifact_1', title: 'report_v1.md', kind: 'note', updatedAt: '2026-01-03T00:00:00.000Z' },
        { id: 'artifact_2', title: 'cashflow.png', kind: 'browser_evidence', updatedAt: '2026-01-04T00:00:00.000Z' },
      ],
      completionCriteria: [
        { id: 'criterion_1', text: '确认最终材料', status: 'open' },
        { id: 'criterion_2', text: '更新现金流页', status: 'satisfied' },
      ],
      riskLevel: 'high',
      riskNote: null,
      sourceContexts: [
        { id: 'source_old', isKey: true, status: 'active', title: '旧邮件', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'source_inactive', isKey: true, status: 'archived', title: '归档材料', updatedAt: '2026-01-05T00:00:00.000Z' },
        { id: 'source_ignore', isKey: false, status: 'active', title: '普通备注', updatedAt: '2026-01-06T00:00:00.000Z' },
        { id: 'source_2', isKey: true, status: 'active', title: 'CEO 批注', updatedAt: '2026-01-02T00:00:00.000Z' },
        { id: 'source_3', isKey: true, status: 'active', title: '法务意见', updatedAt: '2026-01-03T00:00:00.000Z' },
        { id: 'source_4', isKey: true, status: 'active', title: '财务复核', updatedAt: '2026-01-04T00:00:00.000Z' },
      ],
      state: 'blocked',
      summary: '修订董事会材料',
      timeline: [],
      title: '董事会材料修订',
      waitingReason: null,
    });

    const handler = getRegisteredHandler<
      [{ messages: Array<{ role: 'user' | 'assistant'; content: string }>; taskId?: string | null }],
      { text: string }
    >('ai:chat');

    const result = await handler({}, {
      taskId: 'task_1',
      messages: [{ role: 'user', content: '现在该看什么？' }],
    });
    expect(result.invocation).toMatchObject({
      phase: 'task_assistant',
      layer: 'api_runtime',
      runtime: {
        mode: 'api',
        label: 'Agent API Runtime · openai / gpt-test',
      },
      status: 'completed',
      summary: '已生成任务上下文 API Runtime 回答。',
    });

    const system = generateTextMock.mock.calls[0]?.[0]?.system as string;
    expect(system).toContain('Key sources: 财务复核 (captured=2026-01-04T00:00:00.000Z, role=raw): no summary / 法务意见');
    expect(system).toContain('Source freshness rule: prefer current-run, selected, key, or recently captured sources');
    expect(system).toContain('Completion criteria: open: 确认最终材料 / satisfied: 更新现金流页');
    expect(system).toContain('Recent artifacts: cashflow.png (browser_evidence), report_v1.md (note)');
    expect(system).not.toContain('旧邮件');
    expect(system).not.toContain('归档材料');
    expect(system).not.toContain('普通备注');
  });

  it('blocks task-bound chat when persisted task detail is unavailable', async () => {
    servicesMock.aiConfigService.resolveRuntimeConfig.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'sk-test',
      baseUrl: null,
      featureFlags: {
        enableScheduler: false,
      },
    });
    servicesMock.taskService.getDetail.mockResolvedValue(null);

    const handler = getRegisteredHandler<
      [{ messages: Array<{ role: 'user' | 'assistant'; content: string }>; taskId?: string | null }],
      { text: string }
    >('ai:chat');

    await expect(handler({}, {
      taskId: 'missing_task',
      messages: [{ role: 'user', content: '继续这个任务' }],
    })).rejects.toThrow('Task not found: missing_task');
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('uses the latest active key sources in project decomposition prompts', async () => {
    servicesMock.aiConfigService.resolveRuntimeConfig.mockResolvedValue({
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'sk-test',
      baseUrl: null,
      featureFlags: {
        enableScheduler: false,
      },
    });
    generateTextMock.mockResolvedValue({
      text: JSON.stringify({
        parentGoal: '完成董事会材料修订',
        review: '拆解保持大块且独立。',
        nextStep: '确认拆解',
        subtasks: [
          {
            title: '完成材料修订',
            summary: '整合关键意见并形成版本。',
            acceptanceCriteria: '用户确认可提交。',
            dependency: null,
            rationale: '可独立交付。',
          },
        ],
      }),
    });
    servicesMock.workHabitService.getSnapshot.mockResolvedValue({
      version: 3,
      storage: 'main_db',
      privacyBoundary: {
        locality: 'device_only',
        contains: [],
        excludes: [],
      },
      habits: [
        {
          id: 'habit_sop_board',
          rule: '「董事会材料修订」流程模板',
          source: 'sop',
          scope: 'task_type',
          scopeLabel: '董事会材料修订',
          status: 'confirmed',
          examples: '1. 收集 CEO 批注 / 2. 复核法务意见',
          createdAt: '2026-01-01T00:00:00.000Z',
          lastAppliedAt: null,
          applicationCount: 2,
        },
        {
          id: 'habit_pending',
          rule: '待确认规则不进入拆解提示',
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
    });
    servicesMock.taskService.getDetail.mockResolvedValue({
      nextStep: '确认材料',
      riskLevel: 'high',
      riskNote: null,
      sourceContexts: [
        { id: 'source_old', isKey: true, note: 'old', status: 'active', title: '旧邮件', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'source_2', isKey: true, note: 'ceo', status: 'active', title: 'CEO 批注', updatedAt: '2026-01-02T00:00:00.000Z' },
        { id: 'source_3', isKey: true, note: 'legal', status: 'active', title: '法务意见', updatedAt: '2026-01-03T00:00:00.000Z' },
        { id: 'source_4', isKey: true, note: 'finance', status: 'active', title: '财务复核', updatedAt: '2026-01-04T00:00:00.000Z' },
      ],
      summary: '修订董事会材料',
      timeline: [],
      title: '董事会材料修订',
    });

    const handler = getRegisteredHandler<
      [{ taskId: string; instructions?: string | null }],
      unknown
    >('ai:decomposeProject');

    const result = await handler({}, { taskId: 'task_1' });

    const system = generateTextMock.mock.calls[0]?.[0]?.system as string;
    const prompt = generateTextMock.mock.calls[0]?.[0]?.prompt as string;
    expect(result).toMatchObject({
      evidenceRunId: expect.stringMatching(/^agent_api_decomposition:task_1:[a-f0-9]{12}$/),
      parentGoal: '完成董事会材料修订',
      invocation: {
        phase: 'decomposition_draft',
        layer: 'api_runtime',
        runtime: {
          mode: 'api',
          label: 'Agent API Runtime · openai / gpt-test',
        },
        status: 'completed',
      },
    });
    expect(result).toMatchObject({
      invocation: {
        summary: '已生成 1 个项目子任务草稿。',
      },
      promotionReadiness: {
        ready: true,
        satisfiedRequirements: [
          'selected_runtime_contract',
          'parent_task_identity',
          'reversible_proposal_card',
          'subtask_create_many_apply_plan',
          'agent_api_decomposition_source',
          'operator_confirmation_boundary',
          'draft_only_timeline_evidence',
        ],
        missingRequirements: [],
      },
    });
    expect((result as { promotionReadiness?: { summary?: string } }).promotionReadiness?.summary).toContain('promotionReady=yes');
    expect((result as { promotionReadiness?: { summary?: string } }).promotionReadiness?.summary).toContain('source=agent_api_decomposition');
    const evidenceRunId = (result as { evidenceRunId?: string }).evidenceRunId ?? '';
    expect((result as { promotionReadiness?: { summary?: string } }).promotionReadiness?.summary).toContain(`evidenceRunId=${evidenceRunId}`);
    expect((result as { promotionReadiness?: { summary?: string } }).promotionReadiness?.summary).toContain('evidenceRunIdChain=ready');
    expect(system).toContain('Taskplane Agent Operating Principles');
    expect(system).toContain('## Task Creation Protocol');
    expect(system).toContain('Subtasks remain drafts until the user confirms creation.');
    expect(system).toContain('Choose the number of subtasks from the actual project boundaries');
    expect(system).toContain('do not split just to hit a number');
    expect(system).toContain('Use applicable confirmed work habits and SOP templates as reference context');
    expect(system).not.toContain('Create 3 to 7 subtasks');
    expect(prompt).toContain('Key sources: 财务复核 (captured=2026-01-04T00:00:00.000Z, role=raw): finance / 法务意见');
    expect(prompt).toContain('Source freshness rule: prefer current-run, selected, key, or recently captured sources');
    expect(prompt).toContain('Applicable confirmed work habits: 「董事会材料修订」流程模板');
    expect(prompt).not.toContain('待确认规则不进入拆解提示');
    expect(prompt).not.toContain('旧邮件');
    expect(servicesMock.workHabitService.recordApplications).toHaveBeenCalledWith(['habit_sop_board']);
  });

  it('does not generate project decomposition through API when Agent CLI is the selected runtime', async () => {
    servicesMock.aiConfigService.getStatus.mockResolvedValue({
      configured: true,
      apiKeyStored: true,
      apiKeySource: 'keychain',
      provider: 'openai',
      model: 'gpt-test',
      baseUrl: null,
      workspaceRoot: null,
      runtimeMode: 'codex',
      updatedAt: '2026-01-01T00:00:00.000Z',
      configPath: '/tmp/taskplane-config.json',
      featureFlags: {
        enableScheduler: false,
      },
    });

    const handler = getRegisteredHandler<
      [{ taskId: string; instructions?: string | null }],
      unknown
    >('ai:decomposeProject');

    await expect(handler({}, { taskId: 'task_1' })).rejects.toThrow(
      'Taskplane 不会在未确认的情况下切换到 Agent API Runtime',
    );
    expect(servicesMock.aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('blocks project decomposition when existing children are linked by parent task id', async () => {
    servicesMock.taskService.getDetail.mockResolvedValue({
      id: 'project_1',
      childTaskIds: [],
      nextStep: '继续推进',
      riskLevel: 'none',
      riskNote: null,
      sourceContexts: [],
      summary: '开发小程序',
      timeline: [],
      title: '开发小程序',
      state: 'planned',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    servicesMock.taskService.list.mockResolvedValue([
      {
        id: 'project_1',
        title: '开发小程序',
        summary: '开发小程序',
        state: 'planned',
        nextStep: null,
        waitingReason: null,
        riskLevel: 'none',
        riskNote: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        taskType: 'project',
        taskFacets: ['project'],
        parentTaskId: null,
        childTaskIds: [],
        activeWaitingItem: null,
        activeBlocker: null,
        activeDependency: null,
        dependencyReevaluation: null,
      },
      {
        id: 'child_1',
        title: '小程序需求分析与功能设计',
        summary: '明确小程序范围',
        state: 'planned',
        nextStep: null,
        waitingReason: null,
        riskLevel: 'none',
        riskNote: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T01:00:00.000Z',
        taskType: 'simple',
        taskFacets: ['simple'],
        parentTaskId: 'project_1',
        childTaskIds: [],
        activeWaitingItem: null,
        activeBlocker: null,
        activeDependency: null,
        dependencyReevaluation: null,
      },
    ]);

    const handler = getRegisteredHandler<
      [{ taskId: string; instructions?: string | null }],
      unknown
    >('ai:decomposeProject');

    await expect(handler({}, { taskId: 'project_1' })).rejects.toThrow('父任务已有 1 个未完成子任务');
    expect(generateTextMock).not.toHaveBeenCalled();
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
      suggestedScope: 'task',
      suggestedKind: 'direction_choice',
      suggestedSourceType: 'manual',
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

  it('applies Taskplane writeback through the main dispatch adapter', async () => {
    servicesMock.taskplaneWritebackDispatchService.dispatch.mockResolvedValue({
      action: 'decision.create',
      status: 'completed',
      successMessage: '已确认并创建 Decision：确认首版范围。',
    });

    const handler = getRegisteredHandler<
      [{
        taskId: string;
        plan: {
          action: 'decision.create';
          input: {
            taskId: string;
            title: string;
          };
          requiredApi: 'createDecision';
          successMessage: string;
        };
      }],
      Awaited<ReturnType<typeof servicesMock.taskplaneWritebackDispatchService.dispatch>>
    >('taskplaneWriteback:apply');
    const input = {
      taskId: 'task_1',
      plan: {
        action: 'decision.create' as const,
        input: {
          taskId: 'task_1',
          title: '确认首版范围',
        },
        requiredApi: 'createDecision' as const,
        successMessage: '已确认并创建 Decision：确认首版范围。',
      },
    };

    const result = await handler({}, input);

    expect(servicesMock.taskService.getDetail).toHaveBeenCalledWith('task_1');
    expect(servicesMock.taskplaneWritebackDispatchService.dispatch).toHaveBeenCalledWith(input);
    expect(emitAppEventMock).toHaveBeenCalledWith('task.changed', 'task_1');
    expect(emitAppEventMock).toHaveBeenCalledWith('decision.changed');
    expect(emitAppEventMock).toHaveBeenCalledWith('brief.changed');
    expect(result.status).toBe('completed');
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

  it('emits task.changed after task completion check records', async () => {
    const handler = getRegisteredHandler<
      [{
        taskId: string;
        action: 'passed' | 'override_completed' | 'marked_waiting';
        criteriaTotal: number;
        criteriaSatisfied: number;
        criteriaOpen: number;
      }],
      void
    >('task:recordCompletionCheck');

    await handler({}, {
      taskId: 'task_1',
      action: 'marked_waiting',
      criteriaTotal: 2,
      criteriaSatisfied: 1,
      criteriaOpen: 1,
    });

    expect(servicesMock.taskService.recordCompletionCheck).toHaveBeenCalledWith({
      taskId: 'task_1',
      action: 'marked_waiting',
      criteriaTotal: 2,
      criteriaSatisfied: 1,
      criteriaOpen: 1,
    });
    expect(emitAppEventMock).toHaveBeenCalledWith('task.changed', 'task_1');
  });

  it('emits task.changed after task timeline event records', async () => {
    const handler = getRegisteredHandler<
      [{ taskId: string; type: string; payload?: Record<string, unknown> }],
      void
    >('task:recordTimelineEvent');

    await handler({}, {
      taskId: 'task_1',
      type: 'panel.phase_closeout',
      payload: { recordPath: 'Task Records/phase.md' },
    });

    expect(servicesMock.taskService.recordTimelineEvent).toHaveBeenCalledWith({
      taskId: 'task_1',
      type: 'panel.phase_closeout',
      payload: { recordPath: 'Task Records/phase.md' },
    });
    expect(emitAppEventMock).toHaveBeenCalledWith('task.changed', 'task_1');
  });

  it('blocks task-file creation when the task binding cannot be resolved', async () => {
    servicesMock.taskService.getDetail.mockResolvedValueOnce(null);

    const handler = getRegisteredHandler<
      [{ taskId: string; name: string; path: string; kind: 'task_record'; content: string }],
      unknown
    >('taskFile:create');

    await expect(handler({}, {
      taskId: 'missing_task',
      name: 'Phase.md',
      path: 'Task Records/Phase.md',
      kind: 'task_record',
      content: 'handoff notes',
    })).rejects.toThrow('Task not found: missing_task');

    expect(servicesMock.taskFileRepository.create).not.toHaveBeenCalled();
    expect(emitAppEventMock).not.toHaveBeenCalled();
  });

  it('blocks manual artifact creation when the task binding cannot be resolved', async () => {
    servicesMock.taskService.getDetail.mockResolvedValueOnce(null);

    const handler = getRegisteredHandler<
      [{ taskId: string; title: string; content?: string }],
      unknown
    >('artifact:createManual');

    await expect(handler({}, {
      taskId: 'missing_task',
      title: 'AI 项目拆解自检.md',
      content: 'review output',
    })).rejects.toThrow('Task not found: missing_task');

    expect(servicesMock.artifactRepository.createManualNote).not.toHaveBeenCalled();
    expect(emitAppEventMock).not.toHaveBeenCalled();
  });

  it('blocks task-file updates when the file binding cannot be resolved', async () => {
    servicesMock.taskFileRepository.findById.mockResolvedValueOnce(null);

    const handler = getRegisteredHandler<
      [{ id: string; content: string }],
      unknown
    >('taskFile:update');

    await expect(handler({}, {
      id: 'missing_file',
      content: 'updated notes',
    })).rejects.toThrow('Task file not found: missing_file');

    expect(servicesMock.taskFileRepository.update).not.toHaveBeenCalled();
    expect(emitAppEventMock).not.toHaveBeenCalled();
  });

  it('blocks task-file deletion when the file binding cannot be resolved', async () => {
    servicesMock.taskFileRepository.findById.mockResolvedValueOnce(null);

    const handler = getRegisteredHandler<
      [string],
      unknown
    >('taskFile:delete');

    await expect(handler({}, 'missing_file')).rejects.toThrow('Task file not found: missing_file');

    expect(servicesMock.taskFileRepository.delete).not.toHaveBeenCalled();
    expect(emitAppEventMock).not.toHaveBeenCalled();
  });

  it('blocks artifact updates when the artifact binding cannot be resolved', async () => {
    servicesMock.artifactRepository.findById.mockResolvedValueOnce(null);

    const handler = getRegisteredHandler<
      [{ id: string; content: string }],
      unknown
    >('artifact:update');

    await expect(handler({}, {
      id: 'missing_artifact',
      content: 'updated output',
    })).rejects.toThrow('Artifact not found: missing_artifact');

    expect(servicesMock.artifactRepository.update).not.toHaveBeenCalled();
    expect(emitAppEventMock).not.toHaveBeenCalled();
  });

  it('blocks artifact deletion when the artifact binding cannot be resolved', async () => {
    servicesMock.artifactRepository.findById.mockResolvedValueOnce(null);

    const handler = getRegisteredHandler<
      [string],
      unknown
    >('artifact:delete');

    await expect(handler({}, 'missing_artifact')).rejects.toThrow('Artifact not found: missing_artifact');

    expect(servicesMock.artifactRepository.delete).not.toHaveBeenCalled();
    expect(emitAppEventMock).not.toHaveBeenCalled();
  });

  it('previews sandbox review from a confirmed patch artifact without writing workspace files', async () => {
    servicesMock.aiConfigService.getStatus.mockResolvedValueOnce({
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
    servicesMock.artifactRepository.findById.mockResolvedValueOnce({
      id: 'artifact_patch_1',
      taskId: 'task_1',
      sourceType: 'run',
      sourceId: 'run_agent_cli_1',
      kind: 'patch',
      title: 'review.patch',
      content: JSON.stringify({
        diff: [
          'diff --git a/src/example.ts b/src/example.ts',
          '--- a/src/example.ts',
          '+++ b/src/example.ts',
          '@@ -1 +1 @@',
          '-old',
          '+new',
        ].join('\n'),
        files: ['src/example.ts'],
        summary: 'Update example implementation.',
      }),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const handler = getRegisteredHandler<
      [{ artifactId: string; requestedChecks: Array<'test'> }],
      unknown
    >('artifact:previewSandboxPatchReview');

    await expect(handler({}, {
      artifactId: 'artifact_patch_1',
      requestedChecks: ['test'],
    })).resolves.toMatchObject({
      artifactId: 'artifact_patch_1',
      changedFiles: ['src/example.ts'],
      checks: ['test'],
      noWorkspaceFilesWritten: true,
      sourceKind: 'imported_patch_artifact',
      status: 'ready',
      taskId: 'task_1',
      workspaceRoot: '/tmp/taskplane-workspace',
    });
    expect(servicesMock.artifactRepository.update).not.toHaveBeenCalled();
    expect(servicesMock.taskFileRepository.update).not.toHaveBeenCalled();
    expect(emitAppEventMock).not.toHaveBeenCalled();
  });

  it('runs sandbox review from a confirmed patch artifact and emits run, task, decision, and brief events', async () => {
    servicesMock.patchArtifactSandboxReviewRunService.run.mockResolvedValueOnce({
      artifactId: 'artifact_patch_1',
      checkpointId: 'run_checkpoint_patch_1',
      decisionId: 'decision_patch_1',
      noWorkspaceFilesWritten: true,
      reviewedArtifactId: 'artifact_patch_reviewed_1',
      run: {
        id: 'run_review_1',
        taskId: 'task_1',
        type: 'agent',
        status: 'completed',
        instructions: 'Run sandbox review.',
        output: 'Sandbox patch review completed.',
        outputSource: 'system',
        failureReason: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      status: 'completed',
      summary: 'Sandbox patch review completed / no workspace files written',
      taskId: 'task_1',
    });

    const handler = getRegisteredHandler<
      [{ artifactId: string; requestedChecks: Array<'test' | 'lint'> }],
      unknown
    >('artifact:runSandboxPatchReview');

    await expect(handler({}, {
      artifactId: 'artifact_patch_1',
      operatorConfirmed: true,
      requestedChecks: ['test', 'lint'],
    })).resolves.toMatchObject({
      artifactId: 'artifact_patch_1',
      checkpointId: 'run_checkpoint_patch_1',
      decisionId: 'decision_patch_1',
      noWorkspaceFilesWritten: true,
      reviewedArtifactId: 'artifact_patch_reviewed_1',
      runId: 'run_review_1',
      status: 'completed',
      taskId: 'task_1',
    });
    expect(servicesMock.patchArtifactSandboxReviewRunService.run).toHaveBeenCalledWith({
      artifactId: 'artifact_patch_1',
      operatorConfirmed: true,
      requestedChecks: ['test', 'lint'],
    });
    expect(emitAppEventMock).toHaveBeenNthCalledWith(1, 'run.changed', 'run_review_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(2, 'task.changed', 'task_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(3, 'decision.changed');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(4, 'brief.changed');
  });

  it('applies approved sandbox patch promotions through explicit IPC when the apply flag is enabled', async () => {
    servicesMock.appConfigService.read.mockReturnValue({
      featureFlags: {
        enableSandboxPatchPromotionApply: true,
      },
      workspaceRoot: '/tmp/taskplane-workspace',
    });
    servicesMock.sandboxPatchPromotionApplyService.apply.mockResolvedValueOnce({
      auditSummary: 'Sandbox patch promotion applied / checkpoint=run_checkpoint_patch_1 / files=notes.md',
      promotion: {
        id: 'sandbox_patch_promotion_1',
        checkpointId: 'run_checkpoint_patch_1',
        runId: 'run_review_1',
        taskId: 'task_1',
        artifactId: 'artifact_patch_1',
        sourceId: 'sandbox_1',
        decisionId: 'decision_patch_1',
        patchDigest: 'sha256:abc',
        expectedFiles: ['notes.md'],
        status: 'applied',
        auditSummary: 'Sandbox patch promotion applied / checkpoint=run_checkpoint_patch_1 / files=notes.md',
        blockedReasons: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:01:00.000Z',
        appliedAt: '2026-01-01T00:01:00.000Z',
      },
      status: 'applied',
      touchedFiles: ['notes.md'],
    });

    const handler = getRegisteredHandler<
      [{ checkpointId: string; operatorConfirmed: boolean }],
      unknown
    >('sandboxPatchPromotion:apply');

    await expect(handler({}, {
      checkpointId: 'run_checkpoint_patch_1',
      operatorConfirmed: true,
    })).resolves.toMatchObject({
      status: 'applied',
      touchedFiles: ['notes.md'],
    });
    expect(servicesMock.sandboxPatchPromotionApplyService.apply).toHaveBeenCalledWith(
      'run_checkpoint_patch_1',
      {
        operatorConfirmed: true,
        operatorId: 'local_operator',
      },
    );
    expect(servicesMock.runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_review_1',
      status: 'completed',
      title: '显式 promotion apply 已应用',
      output: expect.stringContaining('Touched files: notes.md'),
    }));
    expect(servicesMock.runRepository.updateResult).toHaveBeenCalledWith(
      'run_review_1',
      'completed',
      'Sandbox patch promotion applied / checkpoint=run_checkpoint_patch_1 / files=notes.md',
      'system',
      null,
    );
    expect(emitAppEventMock).toHaveBeenCalledWith('run.changed', 'run_review_1');
    expect(emitAppEventMock).toHaveBeenCalledWith('task.changed', 'task_1');
  });

  it('blocks explicit sandbox patch promotion apply when the apply flag is disabled', async () => {
    const handler = getRegisteredHandler<
      [{ checkpointId: string; operatorConfirmed: boolean }],
      unknown
    >('sandboxPatchPromotion:apply');

    await expect(handler({}, {
      checkpointId: 'run_checkpoint_patch_1',
      operatorConfirmed: true,
    })).rejects.toThrow('disabled by feature flag');
    expect(servicesMock.sandboxPatchPromotionApplyService.apply).not.toHaveBeenCalled();
  });

  it('imports legacy work habits without emitting task events', async () => {
    servicesMock.workHabitService.importLegacy.mockResolvedValue({
      version: 3,
      storage: 'main_db',
      privacyBoundary: { locality: 'device_only', contains: [], excludes: [] },
      habits: [],
    });

    const handler = getRegisteredHandler<
      [{ habits: Array<{ id: string; rule: string }> }],
      Awaited<ReturnType<typeof servicesMock.workHabitService.importLegacy>>
    >('workHabit:importLegacy');

    const result = await handler({}, {
      habits: [{ id: 'habit_1', rule: 'Run checks first' }],
    });

    expect(servicesMock.workHabitService.importLegacy).toHaveBeenCalledWith({
      habits: [{ id: 'habit_1', rule: 'Run checks first' }],
    });
    expect(emitAppEventMock).not.toHaveBeenCalled();
    expect(result.storage).toBe('main_db');
  });

  it('routes work habit proposals without emitting task events', async () => {
    servicesMock.workHabitService.propose.mockResolvedValue([]);

    const handler = getRegisteredHandler<
      [{ rule: string; taskTitle?: string }],
      Awaited<ReturnType<typeof servicesMock.workHabitService.propose>>
    >('workHabit:propose');

    await handler({}, {
      rule: '以后类似任务先内部评审再对外发送',
      taskTitle: '客户周报',
    });

    expect(servicesMock.workHabitService.propose).toHaveBeenCalledWith({
      rule: '以后类似任务先内部评审再对外发送',
      taskTitle: '客户周报',
    });
    expect(emitAppEventMock).not.toHaveBeenCalled();
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

  it('does not trigger retained API runs when Agent CLI is the selected runtime', async () => {
    servicesMock.aiConfigService.getStatus.mockResolvedValue({
      configured: true,
      apiKeyStored: true,
      apiKeySource: 'keychain',
      provider: 'openai',
      model: 'gpt-test',
      baseUrl: null,
      workspaceRoot: null,
      runtimeMode: 'codex',
      updatedAt: '2026-01-01T00:00:00.000Z',
      configPath: '/tmp/taskplane-config.json',
      featureFlags: {
        enableScheduler: false,
      },
    });
    const handler = getRegisteredHandler<
      [{ taskId: string; type: 'draft' | 'summarize'; instructions?: string }],
      Awaited<ReturnType<typeof servicesMock.runService.trigger>>
    >('run:trigger');

    await expect(handler({}, {
      taskId: 'task_1',
      type: 'summarize',
      instructions: 'Retry summary',
    })).rejects.toThrow('旧版 API Run 入口不会在未确认的情况下切换到 Agent API Runtime');
    expect(servicesMock.runService.trigger).not.toHaveBeenCalled();
  });

  it('emits run, task, and brief events after an operator-started run trigger', async () => {
    servicesMock.operatorStartedRunService.trigger.mockResolvedValue({
      id: 'run_operator_1',
      taskId: 'task_1',
      type: 'agent',
      status: 'completed',
      instructions: 'Operator-started browser_evidence_smoke.',
      output: 'Browser evidence captured.',
      outputSource: 'system',
      failureReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    const input = {
      descriptorId: 'browser.readonly_evidence',
      kind: 'browser_evidence_smoke',
      modelExposure: 'hidden',
      operatorConfirmed: true,
      policy: {
        credentialPolicy: 'explicit_config',
        descriptorId: 'browser.readonly_evidence',
        networkPolicy: 'allowlisted',
        outputLimitBytes: 64_000,
        sessionKind: 'browser',
        timeoutMs: 120_000,
      },
      providerCallAllowed: false,
      reason: 'Capture browser evidence.',
      schedulerAllowed: false,
      taskId: 'task_1',
    };

    const handler = getRegisteredHandler<
      [typeof input],
      Awaited<ReturnType<typeof servicesMock.operatorStartedRunService.trigger>>
    >('run:triggerOperatorStarted');

    const result = await handler({}, input);

    expect(servicesMock.operatorStartedRunService.trigger).toHaveBeenCalledWith(input);
    expect(emitAppEventMock).toHaveBeenNthCalledWith(1, 'run.changed', 'run_operator_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(2, 'task.changed', 'task_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(3, 'brief.changed');
    expect(result.id).toBe('run_operator_1');
  });

  it('delegates scheduled event Agent triggers through an explicit scheduler IPC boundary', async () => {
    const task = {
      id: 'task_auto',
      title: 'Weekly update',
      nextStep: 'Prepare the weekly update.',
      timeline: [],
    };
    servicesMock.taskService.getDetail.mockResolvedValue(task);
    servicesMock.schedulerService.triggerScheduledEventAgentRun.mockResolvedValue({
      status: 'started',
      run: {
        id: 'run_scheduled_1',
        taskId: 'task_auto',
        type: 'agent',
        status: 'running',
        instructions: 'Scheduled event Agent trigger.',
        output: null,
        outputSource: null,
        failureReason: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      plan: {
        status: 'ready',
        triggerPlanReady: true,
        runtimeStartAllowed: true,
        schedulerTriggerServiceConnected: true,
        triggerRunEvidenceRequired: ['context_readiness'],
        policy: null,
        runLimit: {
          maxRunsPerDay: null,
          runsStartedToday: null,
        },
        readiness: {},
        standingApproval: {},
        blockedReasons: [],
        evidence: [],
        summary: 'Scheduled/event trigger plan / status=ready',
      },
      terminalRunEvidenceStatus: 'pending',
      triggerRunEvidenceStatus: 'pending_terminal_run_evidence',
      summary: 'Scheduled/event trigger plan / trigger=started / runId=run_scheduled_1',
    });

    const handler = getRegisteredHandler<
      [{ taskId: string }],
      Awaited<ReturnType<typeof servicesMock.schedulerService.triggerScheduledEventAgentRun>>
    >('scheduler:triggerScheduledEventAgentRun');

    const result = await handler({}, { taskId: 'task_auto' });

    expect(servicesMock.taskService.getDetail).toHaveBeenCalledWith('task_auto');
    expect(servicesMock.schedulerService.triggerScheduledEventAgentRun).toHaveBeenCalledWith(task);
    expect(result.status).toBe('started');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(1, 'run.changed', 'run_scheduled_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(2, 'task.changed', 'task_auto');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(3, 'brief.changed');
  });

  it('refreshes scheduled event Agent recovery surfaces when IPC returns a blocked run', async () => {
    const task = {
      id: 'task_auto',
      title: 'Weekly update',
      nextStep: 'Prepare the weekly update.',
      timeline: [],
    };
    servicesMock.taskService.getDetail.mockResolvedValue(task);
    servicesMock.schedulerService.triggerScheduledEventAgentRun.mockResolvedValue({
      status: 'blocked',
      run: {
        id: 'run_wrong_task_1',
        taskId: 'task_other',
        type: 'agent',
        status: 'running',
        instructions: 'Scheduled event Agent trigger.',
        output: null,
        outputSource: null,
        failureReason: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      plan: {
        status: 'ready',
        triggerPlanReady: true,
        runtimeStartAllowed: true,
        schedulerTriggerServiceConnected: true,
        triggerRunEvidenceRequired: ['context_readiness'],
        policy: null,
        runLimit: {
          maxRunsPerDay: null,
          runsStartedToday: null,
        },
        readiness: {},
        standingApproval: {},
        blockedReasons: [],
        evidence: [],
        summary: 'Scheduled/event trigger plan / status=ready',
      },
      terminalRunEvidenceStatus: 'pending',
      triggerRunEvidenceStatus: 'pending_terminal_run_evidence',
      summary: 'Scheduled/event trigger plan / trigger=blocked / runId=run_wrong_task_1 / runIdentityDecisionProposal=proposed',
    });

    const handler = getRegisteredHandler<
      [{ taskId: string }],
      Awaited<ReturnType<typeof servicesMock.schedulerService.triggerScheduledEventAgentRun>>
    >('scheduler:triggerScheduledEventAgentRun');

    const result = await handler({}, { taskId: 'task_auto' });

    expect(servicesMock.taskService.getDetail).toHaveBeenCalledWith('task_auto');
    expect(servicesMock.schedulerService.triggerScheduledEventAgentRun).toHaveBeenCalledWith(task);
    expect(result.status).toBe('blocked');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(1, 'run.changed', 'run_wrong_task_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(2, 'task.changed', 'task_auto');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(3, 'task.changed', 'task_other');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(4, 'brief.changed');
  });

  it('blocks scheduled event Agent trigger IPC when the task is missing', async () => {
    servicesMock.taskService.getDetail.mockResolvedValue(null);
    const handler = getRegisteredHandler<
      [{ taskId: string }],
      Awaited<ReturnType<typeof servicesMock.schedulerService.triggerScheduledEventAgentRun>>
    >('scheduler:triggerScheduledEventAgentRun');

    await expect(handler({}, { taskId: 'task_missing' })).rejects.toThrow('Task not found: task_missing');
    expect(servicesMock.schedulerService.triggerScheduledEventAgentRun).not.toHaveBeenCalled();
  });

  it('delegates manual code-agent runs to the domain orchestration service', async () => {
    servicesMock.codeAgentRunService.trigger.mockResolvedValue({
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
    const input = {
      contextFiles: ['docs/code-agent-context.md'],
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test' as const],
      taskId: 'task_1',
      useModelProducer: true,
    };

    const handler = getRegisteredHandler<
      [typeof input],
      Awaited<ReturnType<typeof servicesMock.codeAgentRunService.trigger>>
    >('run:triggerCodeAgent');

    const result = await handler({}, input);

    expect(servicesMock.codeAgentRunService.trigger).toHaveBeenCalledWith(input);
    expect(emitAppEventMock).toHaveBeenNthCalledWith(1, 'run.changed', 'run_code_agent_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(2, 'task.changed', 'task_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(3, 'brief.changed');
    expect(result.status).toBe('completed');
    expect(servicesMock.runRepository.create).not.toHaveBeenCalled();
    expect(codeAgentExecutionRunMock).not.toHaveBeenCalled();
  });

  it('delegates Agent CLI run triggers and emits run, task, and brief events', async () => {
    servicesMock.agentCliRunService.trigger.mockResolvedValue({
      id: 'run_agent_cli_1',
      taskId: 'task_1',
      type: 'agent',
      status: 'completed',
      instructions: 'Agent CLI (Codex CLI) read-only: Inspect.',
      output: 'Codex completed.',
      outputSource: 'ai',
      failureReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    const input = {
      operatorConfirmed: true,
      prompt: 'Inspect.',
      runtimeId: 'codex' as const,
      taskId: 'task_1',
    };
    const handler = getRegisteredHandler<
      [typeof input],
      Awaited<ReturnType<typeof servicesMock.agentCliRunService.trigger>>
    >('run:triggerAgentCli');

    const result = await handler({}, input);

    expect(servicesMock.agentCliRunService.trigger).toHaveBeenCalledWith(input);
    expect(emitAppEventMock).toHaveBeenNthCalledWith(1, 'run.changed', 'run_agent_cli_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(2, 'task.changed', 'task_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(3, 'brief.changed');
    expect(result.status).toBe('completed');
  });

  it('delegates runtime-native goal audit runs and emits run, task, and brief events', async () => {
    servicesMock.agentCliRunService.recordNativeGoalRequest.mockResolvedValue({
      id: 'run_native_goal_audit',
      taskId: 'task_1',
      type: 'agent',
      status: 'completed',
      instructions: 'Runtime native goal request (Codex CLI): 跑完验收',
      output: 'Runtime-native goal request recorded without forwarding.',
      outputSource: 'system',
      failureReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    const input = {
      forwarded: false,
      objective: '跑完验收',
      operatorConfirmed: true,
      reason: 'Adapter native goal capability is disabled.',
      runtimeId: 'codex' as const,
      runtimeLabel: 'Codex CLI',
      supportsNativeGoalMode: false,
      taskId: 'task_1',
    };
    const handler = getRegisteredHandler<
      [typeof input],
      Awaited<ReturnType<typeof servicesMock.agentCliRunService.recordNativeGoalRequest>>
    >('run:recordRuntimeNativeGoalRequest');

    const result = await handler({}, input);

    expect(servicesMock.agentCliRunService.recordNativeGoalRequest).toHaveBeenCalledWith(input);
    expect(emitAppEventMock).toHaveBeenNthCalledWith(1, 'run.changed', 'run_native_goal_audit');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(2, 'task.changed', 'task_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(3, 'brief.changed');
    expect(result.outputSource).toBe('system');
  });

  it('delegates Agent CLI cancellation and emits scoped run events only when active', async () => {
    servicesMock.agentCliRunService.cancel.mockResolvedValue({
      cancelled: true,
      reason: 'Operator cancelled the Agent CLI run.',
      runId: 'run_agent_cli_1',
      summary: 'Agent CLI cancellation requested for run_agent_cli_1.',
    });
    const input = {
      operatorConfirmed: true,
      runId: 'run_agent_cli_1',
    };
    const handler = getRegisteredHandler<
      [typeof input],
      Awaited<ReturnType<typeof servicesMock.agentCliRunService.cancel>>
    >('run:cancelAgentCli');

    const result = await handler({}, input);

    expect(servicesMock.agentCliRunService.cancel).toHaveBeenCalledWith(input);
    expect(emitAppEventMock).toHaveBeenNthCalledWith(1, 'run.changed', 'run_agent_cli_1');
    expect(emitAppEventMock).toHaveBeenNthCalledWith(2, 'brief.changed');
    expect(emitAppEventMock).not.toHaveBeenCalledWith('task.changed', expect.anything());
    expect(result.cancelled).toBe(true);
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

  it('does not continue retained API paused runs when Agent CLI is the selected runtime', async () => {
    servicesMock.aiConfigService.getStatus.mockResolvedValue({
      configured: true,
      apiKeyStored: true,
      apiKeySource: 'keychain',
      provider: 'openai',
      model: 'gpt-test',
      baseUrl: null,
      workspaceRoot: null,
      runtimeMode: 'codex',
      updatedAt: '2026-01-01T00:00:00.000Z',
      configPath: '/tmp/taskplane-config.json',
      featureFlags: {
        enableScheduler: false,
      },
    });
    const handler = getRegisteredHandler<
      [string],
      Awaited<ReturnType<typeof servicesMock.runService.continuePausedRun>>
    >('run:continuePaused');

    await expect(handler({}, 'run_1')).rejects.toThrow('旧版 API Run 续跑入口不会在未确认的情况下切换到 Agent API Runtime');
    expect(servicesMock.runService.continuePausedRun).not.toHaveBeenCalled();
  });
});

function buildPilotDecisionSnapshotForTest() {
  return {
    backend: 'agent_api' as const,
    backendPlan: {
      backend: 'agent_api' as const,
      maxTurns: 1 as const,
      outputContract: 'pilot_decision_summary' as const,
      reason: 'A short model-assisted Pilot judgment may resolve ambiguous routing before execution.',
      status: 'requested' as const,
      triggers: ['multi_task_priority' as const],
    },
    confidence: 'model_assisted' as const,
    executor: 'agent_api' as const,
    messagePriority: 'follow_up' as const,
    movement: 'execute' as const,
    operationMode: 'bounded_decision_backend' as const,
    priorityLane: 'steady' as const,
    reason: 'Pilot selected execute via api_runtime; message priority is follow_up.',
  };
}
