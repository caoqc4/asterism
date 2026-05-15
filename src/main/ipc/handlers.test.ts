import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  codeAgentExecutionRunMock,
  generateTextMock,
  getLanguageModelMock,
  handleMock,
  emitAppEventMock,
  probeLocalContainerSandboxBackendMock,
  servicesMock,
} = vi.hoisted(() => ({
  codeAgentExecutionRunMock: vi.fn(),
  generateTextMock: vi.fn(),
  getLanguageModelMock: vi.fn(),
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
    codeAgentRunService: {
      trigger: vi.fn(),
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
    servicesMock.taskService.list.mockResolvedValue([]);
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
      [{ messages: Array<{ role: 'user' | 'assistant'; content: string }>; taskId?: string | null }],
      { text: string }
    >('ai:chat');

    const result = await handler({}, {
      taskId: null,
      messages: [{ role: 'user', content: '帮我规划今天' }],
    });

    expect(result.text).toBe('AI response');
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

    await handler({}, {
      taskId: 'task_1',
      messages: [{ role: 'user', content: '现在该看什么？' }],
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

    await handler({}, { taskId: 'task_1' });

    const system = generateTextMock.mock.calls[0]?.[0]?.system as string;
    const prompt = generateTextMock.mock.calls[0]?.[0]?.prompt as string;
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
