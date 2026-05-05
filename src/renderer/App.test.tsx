// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { HomeBriefData } from '@shared/types/brief';
import type { DecisionRecord } from '@shared/types/decision';
import type { ElectronApi } from '@shared/types/ipc';
import type { RunDetailRecord, RunRecord } from '@shared/types/run';
import type { AiConfigStatus } from '@shared/types/settings';
import type { TaskDetail, TaskListItemRecord } from '@shared/types/task';
import { App } from './App';

const now = '2026-01-01T00:00:00.000Z';

function buildTask(partial: Partial<TaskListItemRecord> = {}): TaskListItemRecord {
  return {
    id: partial.id ?? 'task_1',
    title: partial.title ?? '董事会材料修订',
    summary: partial.summary ?? '需要按最新反馈更新董事会材料。',
    state: partial.state ?? 'planned',
    nextStep: partial.nextStep ?? '整理反馈并启动下一轮修改',
    waitingReason: partial.waitingReason ?? null,
    activeWaitingItem: partial.activeWaitingItem ?? null,
    activeBlocker: partial.activeBlocker ?? null,
    activeDependency: partial.activeDependency ?? null,
    dependencyReevaluation: partial.dependencyReevaluation ?? null,
    riskLevel: partial.riskLevel ?? 'none',
    riskNote: partial.riskNote ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function buildTaskDetail(task: TaskListItemRecord): TaskDetail {
  return {
    ...task,
    resumeCard: {
      summary: `当前任务是「${task.title}」，需要继续推进。`,
      currentState: `状态：${task.state}`,
      latestChange: {
        summary: '最近更新了下一步。',
        action: { label: null, targetType: null, targetId: null },
      },
      completionStatus: {
        total: 1,
        satisfied: 0,
        open: 1,
        summary: '还有 1 条完成标准未满足',
        nextOpenCriterion: '确认最终材料',
      },
      currentBlocker: {
        blockerId: task.activeBlocker?.id ?? null,
        title: task.activeBlocker?.title ?? '暂无当前阻塞项',
        detail: task.activeBlocker?.detail ?? null,
      },
      keySource: {
        sourceContextId: 'source_1',
        title: '董事会反馈邮件',
        detail: 'CFO 要求调整现金流说明。',
        priorityReason: '这是本轮修改的关键来源。',
      },
      currentMethod: {
        templateId: null,
        title: '常规推进',
        detail: null,
        selectionReason: null,
      },
      nextSuggestedMove: task.nextStep ?? '明确下一步。',
    },
    artifacts: [],
    completionCriteria: [],
    sourceContexts: [
      {
        id: 'source_1',
        taskId: task.id,
        title: '董事会反馈邮件',
        kind: 'doc',
        isKey: true,
        uri: 'https://example.com/feedback',
        content: null,
        note: null,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      },
    ],
    processTemplates: [],
    availableProcessTemplates: [],
    timeline: [
      {
        id: 'event_1',
        taskId: task.id,
        type: 'task.updated',
        payload: '下一步已更新',
        createdAt: now,
      },
    ],
  };
}

function buildDecision(partial: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: partial.id ?? 'decision_1',
    taskId: partial.taskId ?? 'task_1',
    title: partial.title ?? '是否批准本轮材料修改方案',
    status: partial.status ?? 'pending',
    sourceType: partial.sourceType ?? 'manual',
    sourceId: partial.sourceId ?? null,
    sourceLabel: partial.sourceLabel ?? '董事会材料修订',
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function buildRun(partial: Partial<RunRecord> = {}): RunRecord {
  return {
    id: partial.id ?? 'run_1',
    taskId: partial.taskId ?? 'task_1',
    type: partial.type ?? 'agent',
    status: partial.status ?? 'completed',
    instructions: partial.instructions ?? null,
    output: partial.output ?? '已生成材料修改建议。',
    outputSource: partial.outputSource ?? 'ai',
    failureReason: partial.failureReason ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function buildRunDetail(run: RunRecord): RunDetailRecord {
  return {
    ...run,
    artifacts: [],
    checkpoints: [],
    steps: [
      {
        id: 'step_1',
        runId: run.id,
        index: 0,
        kind: 'final',
        title: '整理反馈',
        status: 'completed',
        input: null,
        output: '已完成',
        error: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function buildBriefData(tasks: TaskListItemRecord[], decisions: DecisionRecord[]): HomeBriefData {
  return {
    activeTaskCount: tasks.filter((task) => task.state !== 'completed' && task.state !== 'archived').length,
    pendingDecisionCount: decisions.filter((decision) => decision.status === 'pending').length,
    completedTaskCount: tasks.filter((task) => task.state === 'completed').length,
    recentRunCount: 1,
    waitingTaskCount: tasks.filter((task) => task.state === 'waiting_external').length,
    blockerTaskCount: tasks.filter((task) => task.activeBlocker).length,
    escalationTaskCount: tasks.filter((task) => task.riskLevel === 'high').length,
    highRiskTaskCount: tasks.filter((task) => task.riskLevel === 'high').length,
    missingNextStepTaskCount: tasks.filter((task) => !task.nextStep).length,
    recentTasks: tasks,
    waitingTasks: tasks.filter((task) => task.state === 'waiting_external'),
    blockerTasks: tasks.filter((task) => task.activeBlocker),
    escalationTasks: tasks.filter((task) => task.riskLevel === 'high'),
    highRiskTasks: tasks.filter((task) => task.riskLevel === 'high'),
    missingNextStepTasks: tasks.filter((task) => !task.nextStep),
    pendingDecisions: decisions.filter((decision) => decision.status === 'pending'),
    recommendedActions: tasks.slice(0, 5).map((task, index) => ({
      id: `action_${index}`,
      label: task.state === 'waiting_external' ? '跟进等待项' : '继续推进',
      reason: task.riskNote ?? task.summary ?? '这是当前值得推进的事项。',
      taskId: task.id,
      priority: index === 0 ? 'high' : 'medium',
      lane: task.riskLevel === 'high'
        ? 'escalate_now'
        : task.state === 'waiting_external'
          ? 'unblock_or_decide'
          : task.state === 'captured'
            ? 'clarify'
            : 'continue_or_review',
    })),
    recentArtifacts: [],
    recentSourceContexts: [],
    recentTaskResumes: [],
    recentActivity: [],
    recentBriefSnapshots: [],
    schedulerStatus: {
      enabled: false,
      running: false,
      lastBriefAt: null,
      lastRunSweepAt: null,
    },
    priorityLane: 'continue_or_review',
    priorityHeadline: '今天 2 件最值得处理。',
    priorityLede: '先处理高风险和等待项。',
  };
}

function buildAiStatus(partial: Partial<AiConfigStatus> = {}): AiConfigStatus {
  return {
    configured: true,
    apiKeyStored: true,
    apiKeySource: 'keychain',
    configuredProviders: ['fal-openrouter'],
    provider: 'fal-openrouter',
    model: 'google/gemini-2.5-flash',
    baseUrl: null,
    workspaceRoot: null,
    updatedAt: now,
    configPath: '/tmp/taskplane-config.json',
    featureFlags: {
      enableScheduler: false,
      enableProviderNativeToolCalls: true,
      enableSandboxCodingAgent: false,
      enableSandboxPatchPromotionApply: false,
      enableSelfCheck: true,
      enableSelfLearn: true,
      contextCompressionThreshold: 45,
    },
    ...partial,
  };
}

function createMockApi() {
  const tasks = [
    buildTask({
      id: 'task_risk',
      title: '董事会材料修订',
      riskLevel: 'high',
      riskNote: '今晚前需要给 CFO 过目。',
    }),
    buildTask({
      id: 'task_waiting',
      title: '合同盖章跟进',
      state: 'waiting_external',
      waitingReason: '等待法务确认盖章版本',
      nextStep: '明天上午跟进法务',
    }),
  ];
  const details: Record<string, TaskDetail> = Object.fromEntries(tasks.map((task) => [task.id, buildTaskDetail(task)]));
  const decisions = [
    buildDecision({ id: 'decision_pending', taskId: tasks[0]!.id }),
    buildDecision({ id: 'decision_done', taskId: tasks[1]!.id, status: 'approved' }),
  ];
  const runs = [buildRun({ taskId: tasks[0]!.id })];
  let subscriber: Parameters<ElectronApi['subscribeToEvents']>[0] | null = null;

  const api: ElectronApi = {
    ping: vi.fn().mockResolvedValue({ message: 'pong', timestamp: now }),
    getAiConfigStatus: vi.fn().mockResolvedValue(buildAiStatus()),
    setAiConfig: vi.fn().mockImplementation(async (input) => buildAiStatus({
      provider: input.provider,
      model: input.model,
      featureFlags: input.featureFlags,
    })),
    listTasks: vi.fn().mockResolvedValue(tasks),
    createTask: vi.fn().mockImplementation(async (input) => {
      const created = buildTask({
        id: 'task_created',
        title: input.title,
        summary: input.summary ?? null,
        state: 'captured',
        nextStep: null,
      });
      tasks.unshift(created);
      details[created.id] = buildTaskDetail(created);
      return created;
    }),
    getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => details[taskId] ?? null),
    updateTask: vi.fn().mockImplementation(async (input) => ({
      ...tasks[0]!,
      ...input,
      updatedAt: now,
    })),
    transitionTask: vi.fn().mockImplementation(async (input) => ({
      ...tasks.find((task) => task.id === input.id) ?? tasks[0]!,
      state: input.nextState,
      waitingReason: input.waitingReason ?? null,
      updatedAt: now,
    })),
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
    createSourceContext: vi.fn().mockImplementation(async (input) => ({
      id: 'source_created',
      taskId: input.taskId,
      title: input.title,
      kind: input.kind,
      isKey: input.isKey ?? false,
      uri: input.uri ?? null,
      content: input.content ?? null,
      note: input.note ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    })),
    updateSourceContext: vi.fn().mockImplementation(async (input) => ({
      ...details.task_risk.sourceContexts[0]!,
      ...input,
      updatedAt: now,
    })),
    archiveSourceContext: vi.fn().mockImplementation(async (id) => ({
      ...details.task_risk.sourceContexts[0]!,
      id,
      status: 'archived',
      archivedAt: now,
      updatedAt: now,
    })),
    createProcessTemplate: vi.fn(),
    updateProcessTemplate: vi.fn(),
    archiveProcessTemplate: vi.fn(),
    applyProcessTemplate: vi.fn(),
    removeProcessTemplate: vi.fn(),
    listDecisions: vi.fn().mockResolvedValue(decisions),
    draftDecision: vi.fn(),
    createDecision: vi.fn(),
    actOnDecision: vi.fn().mockImplementation(async (input) => ({
      ...decisions.find((decision) => decision.id === input.id) ?? decisions[0]!,
      status: input.action === 'approve' ? 'approved' : input.action === 'defer' ? 'deferred' : 'cancelled',
      updatedAt: now,
    })),
    getHomeBrief: vi.fn().mockResolvedValue(buildBriefData(tasks, decisions)),
    listRuns: vi.fn().mockResolvedValue(runs),
    getRunDetail: vi.fn().mockImplementation(async (runId) => {
      const run = runs.find((item) => item.id === runId);
      return run ? buildRunDetail(run) : null;
    }),
    triggerRun: vi.fn().mockImplementation(async (input) => buildRun({
      id: 'run_created',
      taskId: input.taskId,
      type: input.type,
    })),
    continuePausedRun: vi.fn(),
    subscribeToEvents: vi.fn().mockImplementation((listener) => {
      subscriber = listener;
      return () => { subscriber = null; };
    }),
    chatWithAI: vi.fn().mockResolvedValue({ text: '我会基于任务上下文给出下一步建议。' }),
  };

  return {
    api,
    tasks,
    decisions,
    emit: (type: Parameters<NonNullable<typeof subscriber>>[0]['type'], entityId?: string) => {
      subscriber?.({ type, entityId, at: now });
    },
  };
}

describe('App redesign v1', () => {
  let harness: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    window.location.hash = '';
    window.localStorage.clear();
    harness = createMockApi();
    window.api = harness.api;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the redesigned navigation zones and keeps the external signal hint visible', async () => {
    render(<App />);

    expect(await screen.findByRole('button', { name: /Brief/ })).toBeTruthy();
    expect(screen.getByText('Work')).toBeTruthy();
    expect(screen.getByText('Capabilities')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tasks/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Runs/ })).toBeNull();
    expect(await screen.findByText('外部信号')).toBeTruthy();
    expect(screen.getByText('暂无外部信号。')).toBeTruthy();
  });

  it('opens task context in the right panel from a Brief focus card and sends task-aware chat', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));

    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();
    const input = screen.getByPlaceholderText(/关于「董事会材料修订」/);
    await user.type(input, '下一步怎么推进？');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.chatWithAI).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
        workHabits: expect.arrayContaining([
          expect.stringContaining('数据报告初稿完成后先内部评审再对外发送'),
        ]),
      }));
    });
    expect(await screen.findByText('我会基于任务上下文给出下一步建议。')).toBeTruthy();
  });

  it('persists selected task completion from the Tasks inline row action', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByText('董事会材料修订'));
    await user.click(await screen.findByRole('button', { name: '完成' }));
    expect(await screen.findByText('完成确认')).toBeTruthy();
    expect(screen.getByText(/建议先标记为等待中/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '仍然完成' }));

    await waitFor(() => {
      expect(harness.api.transitionTask).toHaveBeenCalledWith({
        id: 'task_risk',
        nextState: 'completed',
        waitingReason: undefined,
      });
    });

    await user.click(screen.getByRole('button', { name: /Context/ }));
    expect(await screen.findByText(/允许覆盖未满足的完成检查/)).toBeTruthy();
    expect(screen.getAllByText('提议确认').length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: '确认' })[0]!);
    expect((await screen.findAllByText('已确认')).length).toBeGreaterThan(0);
  });

  it('persists task defer as a waiting task with a reason', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByText('董事会材料修订'));
    await user.click(await screen.findByRole('button', { name: '延后 ▾' }));
    await user.click(await screen.findByRole('button', { name: '明天' }));

    await waitFor(() => {
      expect(harness.api.transitionTask).toHaveBeenCalledWith({
        id: 'task_risk',
        nextState: 'waiting_external',
        waitingReason: '延后处理：明天',
      });
    });
  });

  it('shows only pending decisions and dispatches formal decision actions', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Decisions/ }));

    expect(await screen.findByText('是否批准本轮材料修改方案')).toBeTruthy();
    expect(screen.queryByText('decision_done')).toBeNull();

    await user.click(screen.getByText('是否批准本轮材料修改方案'));
    await user.click((await screen.findAllByRole('button', { name: '选择此方案' }))[0]!);

    await waitFor(() => {
      expect(harness.api.actOnDecision).toHaveBeenCalledWith({
        id: 'decision_pending',
        action: 'approve',
      });
    });
  });

  it('saves self-check, self-learn, and compression preferences as dedicated feature flags', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Settings/ }));
    const switches = await screen.findAllByRole('switch');
    await user.click(switches[0]!);
    await user.click(switches[1]!);

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '50' } });
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    await waitFor(() => {
      expect(harness.api.setAiConfig).toHaveBeenCalledWith(expect.objectContaining({
        featureFlags: expect.objectContaining({
          enableSelfCheck: false,
          enableSelfLearn: false,
          contextCompressionThreshold: 50,
        }),
      }));
    });
  });

  it('keeps task type and commitment lenses usable from capture through workbench config', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: '+ 新建任务' }));
    await user.type(await screen.findByPlaceholderText(/任务标题/), '每周一准备经营周报');
    expect(screen.getByRole('button', { name: '定时' }).className).toContain('active');
    await user.type(screen.getByPlaceholderText(/已承诺时间/), '周五 17:00 前发给 CEO');
    await user.click(screen.getByRole('button', { name: '创建' }));

    await user.click(screen.getByRole('button', { name: /定时任务/ }));
    expect(await screen.findByText('每周一准备经营周报')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /已承诺/ }));
    expect(await screen.findByText('每周一准备经营周报')).toBeTruthy();

    await user.dblClick(screen.getByText('每周一准备经营周报'));
    expect(await screen.findByText('定时任务')).toBeTruthy();
    expect(screen.getByText(/每周一 09:00/)).toBeTruthy();
    expect(screen.getByText(/周五 17:00 前发给 CEO/)).toBeTruthy();
  });

  it('opens a task workbench and keeps Runs scoped under the task instead of global navigation', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.dblClick(await screen.findByText('董事会材料修订'));

    expect(await screen.findByText('工作台')).toBeTruthy();
    expect(screen.getByRole('button', { name: '执行' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '来源' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Runs$/ })).toBeNull();
    await user.click(await screen.findByText(/Run #1 · 已完成/));
    expect(await screen.findByText('Run 验证通过')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '来源' }));
    expect(await screen.findByText('董事会反馈邮件')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '取消关键' }));
    await waitFor(() => {
      expect(harness.api.updateSourceContext).toHaveBeenCalledWith({
        id: 'source_1',
        isKey: false,
      });
    });
    await user.click(await screen.findByRole('button', { name: '归档' }));
    await waitFor(() => {
      expect(harness.api.archiveSourceContext).toHaveBeenCalledWith('source_1');
    });

    await user.click(screen.getByRole('button', { name: '执行' }));
    await user.click(screen.getByRole('button', { name: /启动 Run/ }));
    const runInput = await screen.findByPlaceholderText(/给 AI 的指令/);
    await user.type(runInput, '请先整理 CFO 反馈再生成修改建议');
    await user.click(screen.getByRole('button', { name: '启动 Run' }));

    await waitFor(() => {
      expect(harness.api.triggerRun).toHaveBeenCalledWith({
        taskId: 'task_risk',
        type: 'agent',
        instructions: '请先整理 CFO 反馈再生成修改建议',
      });
    });

    await user.click(screen.getByTitle('更多操作'));
    await user.click(await screen.findByRole('button', { name: '提取流程模板' }));
    expect(await screen.findByText('提取流程模板')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '保存为模板' }));

    await user.click(screen.getByRole('button', { name: /Context/ }));
    expect(await screen.findByText('「董事会材料修订」流程模板')).toBeTruthy();
    expect(screen.getByText('SOP 提取')).toBeTruthy();
  });
});
