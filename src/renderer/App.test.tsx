// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { HomeBriefData } from '@shared/types/brief';
import type { BlockerRecord } from '@shared/types/blocker';
import type { DecisionRecord } from '@shared/types/decision';
import type { ElectronApi } from '@shared/types/ipc';
import type { AppliedProcessTemplateRecord, ProcessTemplateRecord } from '@shared/types/process-template';
import type { RunDetailRecord, RunRecord } from '@shared/types/run';
import type { AiConfigStatus } from '@shared/types/settings';
import type { TaskDetail, TaskListItemRecord } from '@shared/types/task';
import type { TaskDependencyRecord } from '@shared/types/task-dependency';
import { App } from './App';
import {
  createManualWorkHabit,
  deleteWorkHabit,
  loadWorkHabits,
  recordCompletionOverrideLearningSignal,
  recordSopTemplateHabit,
  resolveWorkHabitConflict,
  saveWorkHabits,
  updateWorkHabit,
  type WorkHabitRecord,
} from './lib/workHabits';
import { loadTaskAttributes, saveTaskAttributes } from './lib/taskAttributes';

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

function buildBlocker(partial: Partial<BlockerRecord> = {}): BlockerRecord {
  return {
    id: partial.id ?? 'blocker_1',
    taskId: partial.taskId ?? 'task_risk',
    title: partial.title ?? '等待 CFO 反馈',
    kind: partial.kind ?? 'approval',
    detail: partial.detail ?? null,
    owner: partial.owner ?? null,
    responsibility: partial.responsibility ?? null,
    responsibilityLabel: partial.responsibilityLabel ?? null,
    sourceContextId: partial.sourceContextId ?? null,
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    resolvedAt: partial.resolvedAt ?? null,
  };
}

function buildTaskDependency(partial: Partial<TaskDependencyRecord> = {}): TaskDependencyRecord {
  return {
    id: partial.id ?? 'task_dependency_1',
    taskId: partial.taskId ?? 'task_blocked',
    blockedByTaskId: partial.blockedByTaskId ?? 'task_upstream',
    blockedByTaskTitle: partial.blockedByTaskTitle ?? '上游任务',
    reason: partial.reason ?? '等待上游完成',
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    resolvedAt: partial.resolvedAt ?? null,
  };
}

function buildWorkHabit(partial: Partial<WorkHabitRecord> = {}): WorkHabitRecord {
  return {
    id: partial.id ?? 'habit_test',
    rule: partial.rule ?? '代码合入前必须先跑完整测试',
    source: partial.source ?? 'manual',
    scope: partial.scope ?? 'task_type',
    scopeLabel: partial.scopeLabel ?? '代码合入',
    status: partial.status ?? 'confirmed',
    examples: partial.examples ?? '发布前检查',
    createdAt: partial.createdAt ?? now,
    lastAppliedAt: partial.lastAppliedAt ?? null,
    applicationCount: partial.applicationCount ?? 1,
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
    artifacts: [
      {
        id: 'artifact_report',
        taskId: task.id,
        sourceType: 'run',
        sourceId: 'run_1',
        kind: 'note',
        title: 'report_v1.md',
        content: '# 初稿\n\n需要补现金流页。',
        createdAt: now,
        updatedAt: now,
      },
    ],
    completionCriteria: [
      {
        id: 'criterion_1',
        taskId: task.id,
        text: '确认最终材料',
        verificationResponsibility: 'unknown',
        verificationResponsibilityLabel: null,
        status: 'open',
        createdAt: now,
        updatedAt: now,
        satisfiedAt: null,
      },
    ],
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
      {
        id: 'event_completion_check',
        taskId: task.id,
        type: 'task.completion_check',
        payload: JSON.stringify({
          action: 'override_completed',
          criteriaTotal: 1,
          criteriaSatisfied: 0,
          criteriaOpen: 1,
          reason: '完成检查未通过：仍有 1 条完成标准未满足',
          runVerificationLabel: 'Run 验证通过',
          runVerificationDetail: '执行结果已有输出或步骤证据，可进入人工审查。',
        }),
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
  let createCounter = 0;

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
        id: createCounter === 0 ? 'task_created' : `task_created_${createCounter}`,
        title: input.title,
        summary: input.summary ?? null,
        state: 'captured',
        nextStep: null,
      });
      createCounter += 1;
      tasks.unshift(created);
      details[created.id] = buildTaskDetail(created);
      return created;
    }),
    getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => details[taskId] ?? null),
    updateTask: vi.fn().mockImplementation(async (input) => {
      const existing = tasks.find((task) => task.id === input.id) ?? tasks[0]!;
      const updated = {
        ...existing,
        ...input,
        updatedAt: now,
      };
      const index = tasks.findIndex((task) => task.id === input.id);
      if (index >= 0) tasks[index] = updated;
      if (details[input.id]) {
        details[input.id] = {
          ...details[input.id],
          ...input,
          updatedAt: now,
        };
      }
      return updated;
    }),
    transitionTask: vi.fn().mockImplementation(async (input) => ({
      ...tasks.find((task) => task.id === input.id) ?? tasks[0]!,
      state: input.nextState,
      waitingReason: input.waitingReason ?? null,
      updatedAt: now,
    })),
    recordTaskCompletionCheck: vi.fn().mockResolvedValue(undefined),
    getWorkHabitSnapshot: vi.fn().mockImplementation(async () => ({
      version: 3,
      storage: 'main_db',
      privacyBoundary: {
        locality: 'device_only',
        contains: [],
        excludes: [],
      },
      habits: loadWorkHabits(),
    })),
    importLegacyWorkHabits: vi.fn().mockImplementation(async (input) => ({
      version: 3,
      storage: 'main_db',
      privacyBoundary: {
        locality: 'device_only',
        contains: [],
        excludes: [],
      },
      habits: input.habits,
    })),
    updateWorkHabit: vi.fn().mockImplementation(async (input) => updateWorkHabit(input.id, input)),
    deleteWorkHabit: vi.fn().mockImplementation(async (id) => deleteWorkHabit(id)),
    createManualWorkHabit: vi.fn().mockImplementation(async (input) => createManualWorkHabit(input)),
    resolveWorkHabitConflict: vi.fn().mockImplementation(async (input) =>
      resolveWorkHabitConflict(input.candidateId, input.decision)),
    recordCompletionOverrideLearningSignal: vi.fn().mockImplementation(async (input) => {
      recordCompletionOverrideLearningSignal(input);
      return loadWorkHabits();
    }),
    recordSopTemplateHabit: vi.fn().mockImplementation(async (input) => recordSopTemplateHabit(input)),
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
    createProcessTemplate: vi.fn().mockImplementation(async (input): Promise<ProcessTemplateRecord> => ({
      id: 'process_template_sop',
      title: input.title,
      summary: input.summary ?? null,
      content: input.content,
      kind: input.kind,
      tags: input.tags ?? [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    })),
    updateProcessTemplate: vi.fn(),
    archiveProcessTemplate: vi.fn(),
    applyProcessTemplate: vi.fn().mockImplementation(async (input): Promise<AppliedProcessTemplateRecord> => {
      const binding: AppliedProcessTemplateRecord = {
        id: input.templateId,
        title: '「董事会材料修订」流程模板',
        summary: '董事会材料修订 的可复用 SOP 流程',
        content: '关键步骤：\n1. 收集并确认关键来源：董事会反馈邮件',
        kind: 'sop',
        tags: ['董事会材料修订'],
        status: 'active',
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        bindingId: 'task_process_binding_sop',
        taskId: input.taskId,
        bindingStatus: 'active',
        bindingNote: input.note ?? null,
        boundAt: now,
        bindingUpdatedAt: now,
        removedAt: null,
      };
      details[input.taskId] = {
        ...details[input.taskId]!,
        processTemplates: [binding, ...details[input.taskId]!.processTemplates],
      };
      return binding;
    }),
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
    decomposeProject: vi.fn().mockResolvedValue({
      parentGoal: '完成官网改版并上线。',
      subtasks: [
        {
          title: '确认官网改版范围',
          summary: '明确页面范围、目标用户和上线边界。',
          acceptanceCriteria: '范围清单被确认。',
          dependency: null,
          rationale: '这是后续执行的独立输入。',
        },
        {
          title: '产出官网改版方案',
          summary: '形成信息架构、文案和视觉方向。',
          acceptanceCriteria: '方案可供评审。',
          dependency: '确认官网改版范围',
          rationale: '这是一个可验收的大块交付。',
        },
      ],
      review: '子任务保持大块、边界清楚，暂不继续细拆。',
      nextStep: '确认是否创建这些子任务。',
    }),
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
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
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

  it('surfaces committed active tasks in the Brief stats strip', async () => {
    saveTaskAttributes('task_risk', { commitment: '今晚前给 CFO 过目' });
    render(<App />);

    expect(await screen.findByText('本周承诺: 1')).toBeTruthy();
  });

  it('marks waiting focus cards from Brief task state', async () => {
    render(<App />);

    const waitingCard = (await screen.findByText('合同盖章跟进')).closest('.focus-card');
    expect(waitingCard?.querySelector('.dot.waiting')).toBeTruthy();
  });

  it('marks blocked focus cards from Brief task blockers', async () => {
    const blockedTask = buildTask({
      id: 'task_blocked_brief',
      title: '发布口径确认',
      activeBlocker: buildBlocker({ taskId: 'task_blocked_brief', title: '等待 CEO 审批' }),
    });
    vi.mocked(harness.api.getHomeBrief).mockResolvedValue(buildBriefData([blockedTask], []));
    render(<App />);

    const blockedCard = (await screen.findByText('发布口径确认')).closest('.focus-card');
    expect(blockedCard?.querySelector('.dot.risk')).toBeTruthy();
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

  it('suggests a fresh task session when the right-panel conversation gets repetitive', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);

    for (let i = 0; i < 3; i += 1) {
      await user.type(input, '下一步怎么推进？');
      await user.click(screen.getByRole('button', { name: '发送' }));
      await waitFor(() => {
        expect(harness.api.chatWithAI).toHaveBeenCalledTimes(i + 1);
      });
    }

    expect(await screen.findByText(/建议开始一段新会话/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '开始新会话' }));
    await waitFor(() => {
      expect(screen.queryByText(/建议开始一段新会话/)).toBeNull();
    });
  });

  it('uses the compression threshold preference for right-panel session refresh suggestions', async () => {
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      featureFlags: {
        enableScheduler: false,
        enableProviderNativeToolCalls: true,
        enableSandboxCodingAgent: false,
        enableSandboxPatchPromotionApply: false,
        enableSelfCheck: true,
        enableSelfLearn: true,
        contextCompressionThreshold: 30,
      },
    }));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);

    for (const prompt of ['先看风险', '再看来源', '最后看下一步']) {
      await user.type(input, prompt);
      await user.click(screen.getByRole('button', { name: '发送' }));
      await waitFor(() => {
        expect(harness.api.chatWithAI).toHaveBeenCalled();
      });
    }

    expect(await screen.findByText(/建议开始一段新会话/)).toBeTruthy();
  });

  it('persists selected task completion from the Tasks inline row action', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByText('董事会材料修订'));
    expect(await screen.findByText('关键来源')).toBeTruthy();
    expect(await screen.findByText('董事会反馈邮件')).toBeTruthy();
    expect(await screen.findByRole('button', { name: /去拍板/ })).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: '完成' }));
    expect(await screen.findByText('完成确认')).toBeTruthy();
    expect(await screen.findByText('最近 Run 验证')).toBeTruthy();
    expect(await screen.findByText('Run 验证通过')).toBeTruthy();
    expect(screen.getByText(/建议先标记为等待中/)).toBeTruthy();
    expect(screen.getByText(/将记录：覆盖完成 · 完成标准 0\/1 · 未满足 1 条 · 最近 Run：Run 验证通过/)).toBeTruthy();
    expect(screen.getByText(/作为后续工作习惯提议的学习信号/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '仍然完成' }));

    await waitFor(() => {
      expect(harness.api.recordTaskCompletionCheck).toHaveBeenCalledWith(expect.objectContaining({
        runVerificationTone: 'pass',
        runVerificationLabel: 'Run 验证通过',
        runVerificationDetail: '执行结果已有输出或步骤证据，可进入人工审查。',
      }));
      expect(harness.api.transitionTask).toHaveBeenCalledWith({
        id: 'task_risk',
        nextState: 'completed',
        waitingReason: undefined,
      });
    });
    expect(harness.api.recordCompletionOverrideLearningSignal).toHaveBeenCalledWith(expect.objectContaining({
      runVerificationTone: 'pass',
      runVerificationLabel: 'Run 验证通过',
      runVerificationDetail: '执行结果已有输出或步骤证据，可进入人工审查。',
    }));

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

  it('runs low-frequency task row actions from the Tasks context menu', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    const taskRowTitle = async () => (await screen.findAllByText('董事会材料修订'))[0]!;
    fireEvent.contextMenu(await taskRowTitle());
    await user.click(await screen.findByRole('button', { name: '中' }));
    await waitFor(() => {
      expect(harness.api.updateTask).toHaveBeenCalledWith({
        id: 'task_risk',
        riskLevel: 'medium',
      });
    });

    fireEvent.contextMenu(await taskRowTitle());
    await user.click(await screen.findByRole('button', { name: '复制链接' }));
    expect(writeText).toHaveBeenCalledWith('taskplane://task/task_risk');

    fireEvent.contextMenu(await taskRowTitle());
    await user.click(await screen.findByRole('button', { name: '归档' }));
    await waitFor(() => {
      expect(harness.api.transitionTask).toHaveBeenCalledWith({
        id: 'task_risk',
        nextState: 'archived',
      });
    });
  });

  it('routes task preview primary action to Decisions when the task needs approval', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByText('董事会材料修订'));
    await user.click(await screen.findByRole('button', { name: /去拍板/ }));

    expect(await screen.findByText('是否批准本轮材料修改方案')).toBeTruthy();
  });

  it('refreshes task preview decisions when decision state changes', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByText('董事会材料修订'));
    expect(await screen.findByRole('button', { name: /去拍板/ })).toBeTruthy();

    vi.mocked(harness.api.listDecisions).mockResolvedValueOnce(
      harness.decisions.map((decision) => (
        decision.id === 'decision_pending' ? { ...decision, status: 'approved' } : decision
      )),
    );
    harness.emit('decision.changed', 'decision_pending');

    expect(await screen.findByRole('button', { name: /打开工作台/ })).toBeTruthy();
  });

  it('surfaces dependency recovery signals in the task list', async () => {
    const user = userEvent.setup();
    harness.tasks.unshift(buildTask({
      id: 'task_dependency_ready',
      title: '准备官网方案评审',
      activeDependency: buildTaskDependency({
        id: 'dependency_ready',
        taskId: 'task_dependency_ready',
        blockedByTaskId: 'task_upstream_done',
        blockedByTaskTitle: '确认官网改版范围',
      }),
      dependencyReevaluation: {
        dependencyId: 'dependency_ready',
        upstreamTaskId: 'task_upstream_done',
        upstreamTaskTitle: '确认官网改版范围',
        status: 'upstream_ready',
        updatedAt: now,
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));

    expect(await screen.findByText('准备官网方案评审')).toBeTruthy();
    expect(screen.getByText('依赖可复核：确认官网改版范围')).toBeTruthy();
    await user.click(screen.getByText('准备官网方案评审'));
    await user.click(await screen.findByRole('button', { name: '解除依赖' }));
    expect(harness.api.resolveTaskDependency).toHaveBeenCalledWith('dependency_ready');
    await waitFor(() => {
      expect(screen.queryByText('依赖可复核：确认官网改版范围')).toBeNull();
    });
  });

  it('shows only pending decisions and dispatches formal decision actions', async () => {
    const user = userEvent.setup();
    harness.decisions.push(buildDecision({
      id: 'decision_checkpoint',
      taskId: 'task_risk',
      title: '是否恢复暂停的 Agent 执行',
      sourceType: 'agent_checkpoint',
      sourceLabel: '董事会材料修订',
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Decisions/ }));

    expect(await screen.findByText('是否批准本轮材料修改方案')).toBeTruthy();
    expect(await screen.findByText('是否恢复暂停的 Agent 执行')).toBeTruthy();
    expect(screen.getByText('待拍板')).toBeTruthy();
    expect(screen.getAllByText('今天必须处理').length).toBeGreaterThan(0);
    expect(screen.getAllByText('本周内').length).toBeGreaterThan(0);
    expect(screen.getByText('Agent 检查点')).toBeTruthy();
    expect(screen.getByText('需要复核')).toBeTruthy();
    expect(screen.getByText('人工决策')).toBeTruthy();
    expect(screen.getByText('推荐路径清晰')).toBeTruthy();
    expect(screen.getAllByText('更新 2026-01-01').length).toBeGreaterThan(0);
    expect(screen.queryByText('decision_done')).toBeNull();
    await user.type(screen.getByPlaceholderText('搜索决策或任务'), '合同');
    expect(await screen.findByText('没有匹配的待拍板事项。')).toBeTruthy();
    await user.clear(screen.getByPlaceholderText('搜索决策或任务'));

    await user.click(screen.getByText('是否批准本轮材料修改方案'));
    expect(await screen.findByText('为什么现在')).toBeTruthy();
    expect(screen.getByText(/等待拍板状态/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '修改后批准' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '要求补充信息' }));
    expect((await screen.findAllByText('董事会材料修订')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '查看任务详情' }));
    expect(await screen.findByText('工作台')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: /Decisions/ })[0]!);
    await user.click(await screen.findByText('是否批准本轮材料修改方案'));
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

  it('creates a project parent task and guides AI decomposition instead of hard-coded subtasks', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: '+ 新建任务' }));
    await user.type(await screen.findByPlaceholderText(/任务标题/), '官网改版项目');
    expect(screen.getByRole('button', { name: '项目' }).className).toContain('active');
    await user.click(screen.getByRole('button', { name: '创建' }));

    await user.click(screen.getByRole('button', { name: /项目型/ }));
    expect((await screen.findAllByText('官网改版项目')).length).toBeGreaterThan(0);
    expect(screen.getByText('0/0 子任务完成')).toBeTruthy();
    expect(screen.getByText(/等待 AI 根据项目目标拆解子任务/)).toBeTruthy();
    expect(screen.queryByText('明确范围：官网改版项目')).toBeNull();
    expect(harness.api.createTask).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '生成拆解草稿' }));
    expect(await screen.findByText('确认官网改版范围')).toBeTruthy();
    expect(screen.getByText('子任务保持大块、边界清楚，暂不继续细拆。')).toBeTruthy();
    expect(harness.api.decomposeProject).toHaveBeenCalledWith({ taskId: 'task_created' });
    await user.click(screen.getByRole('button', { name: '创建这些子任务' }));
    expect(await screen.findByText('产出官网改版方案')).toBeTruthy();
    expect(screen.getByText('0/2 子任务完成')).toBeTruthy();
    expect(screen.getByText('依赖：确认官网改版范围')).toBeTruthy();
    expect(harness.api.createTask).toHaveBeenCalledTimes(3);
    expect(harness.api.createCompletionCriteria).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_created_1',
      text: '范围清单被确认。',
      verificationResponsibility: 'unknown',
    }));
    expect(harness.api.createCompletionCriteria).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_created_2',
      text: '方案可供评审。',
      verificationResponsibility: 'unknown',
    }));
    expect(harness.api.createCompletionCriteria).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_created',
      text: '完成并验收 2 个项目子任务。',
      verificationResponsibility: 'unknown',
    }));
    expect(harness.api.createTaskDependency).toHaveBeenCalledWith({
      taskId: 'task_created_2',
      blockedByTaskId: 'task_created_1',
      reason: '确认官网改版范围',
    });
    expect(harness.api.updateTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task_created',
      summary: '完成官网改版并上线。',
      nextStep: '确认是否创建这些子任务。',
    }));
    expect(harness.api.createSourceContext).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_created',
      title: 'AI 项目拆解自检',
      kind: 'note',
      isKey: true,
      content: '子任务保持大块、边界清楚，暂不继续细拆。',
    }));

    await user.click(screen.getByRole('button', { name: /让 AI 拆解并检查/ }));
    await user.click(await screen.findByRole('button', { name: '拆解项目结构' }));
    const decompositionInput = screen.getByPlaceholderText(/关于「官网改版项目」/) as HTMLTextAreaElement;
    expect(decompositionInput.value).toContain('先拆一版');
    expect(decompositionInput.value).toContain('再自检查');
  });

  it('lets users correct and clear task memory from Context', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Context/ }));
    await user.click(await screen.findByText('董事会材料修订'));
    expect(await screen.findByText(/需要按最新反馈更新董事会材料/)).toBeTruthy();
    expect(screen.getByText(/工作习惯记录仅保存在本机/)).toBeTruthy();
    expect(screen.getByText(/不保存：聊天消息全文/)).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: '编辑' })[0]!);
    const summaryInput = screen.getByDisplayValue('需要按最新反馈更新董事会材料。');
    await user.clear(summaryInput);
    await user.type(summaryInput, '记忆已校正：只需要更新现金流页。');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(harness.api.updateTask).toHaveBeenCalledWith(expect.objectContaining({
        id: 'task_risk',
        summary: '记忆已校正：只需要更新现金流页。',
      }));
    });
    expect(await screen.findByText('记忆已校正：只需要更新现金流页。')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '清除' }));
    await waitFor(() => {
      expect(harness.api.updateTask).toHaveBeenCalledWith({
        id: 'task_risk',
        summary: null,
        nextStep: null,
        waitingReason: null,
      });
    });
    expect(await screen.findByText('暂无详细上下文。')).toBeTruthy();
  });

  it('lets users resolve conflicting learned work habits from Context', async () => {
    const user = userEvent.setup();
    saveWorkHabits([
      buildWorkHabit({
        id: 'habit_candidate',
        rule: '代码合入前只需要跑受影响测试',
        source: 'proposal',
        status: 'pending',
        examples: '小范围样式调整',
      }),
      buildWorkHabit({ id: 'habit_existing' }),
    ]);
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Context/ }));

    expect(await screen.findByText(/与已确认规则冲突/)).toBeTruthy();
    expect(screen.getByText('待确认规则只作为提议展示，不会自动改变后续执行流程。')).toBeTruthy();
    expect(screen.getByText('来源分布')).toBeTruthy();
    expect(screen.getByText('提议确认 1')).toBeTruthy();
    expect(screen.getByText('用户创建 1')).toBeTruthy();
    expect(screen.getByText('待你确认')).toBeTruthy();
    const candidate = screen.getByText('代码合入前只需要跑受影响测试');
    const existing = screen.getByText('代码合入前必须先跑完整测试');
    expect(candidate.compareDocumentPosition(existing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '采用新规则' }));

    expect(screen.queryByText(/与已确认规则冲突/)).toBeNull();
    expect((await screen.findAllByText('已确认')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('已停用')).length).toBeGreaterThan(0);
  });

  it('lets users manually add a confirmed work habit from Context', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Context/ }));
    await user.click(await screen.findByRole('button', { name: '新增规则' }));
    await user.type(screen.getByPlaceholderText('例如：代码合入前先跑完整测试'), '董事会材料发出前先更新现金流页');
    await user.selectOptions(screen.getByRole('combobox'), 'task_type');
    await user.clear(screen.getByPlaceholderText('适用范围'));
    await user.type(screen.getByPlaceholderText('适用范围'), '董事会材料');
    await user.type(screen.getByPlaceholderText('例子或触发场景'), '月度董事会包');
    await user.click(screen.getByRole('button', { name: '保存规则' }));

    expect(await screen.findByText('董事会材料发出前先更新现金流页')).toBeTruthy();
    expect(screen.getByText('用户创建')).toBeTruthy();
    expect(screen.getByText('董事会材料')).toBeTruthy();
    await user.click(screen.getByText('董事会材料发出前先更新现金流页'));
    expect(await screen.findByText('优先级：中 · 任务类型规则')).toBeTruthy();
  });

  it('surfaces repeated completion overrides as a cross-task observation in Context', async () => {
    const user = userEvent.setup();
    recordCompletionOverrideLearningSignal({
      taskId: 'task_override_a',
      taskTitle: '董事会材料修订',
      reason: '完成检查未通过：仍有 1 条完成标准未满足',
    });
    recordCompletionOverrideLearningSignal({
      taskId: 'task_override_b',
      taskTitle: '官网改版方案',
      reason: '完成检查未通过：仍有 2 条完成标准未满足',
    });
    recordCompletionOverrideLearningSignal({
      taskId: 'task_override_c',
      taskTitle: '周报发送',
      reason: '完成检查需要补充完成标准',
    });
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Context/ }));

    expect(await screen.findByText(/跨任务观察：你经常会在完成检查未全部满足时主动确认够用/)).toBeTruthy();
    expect(screen.getByText('跨任务观察窗口 · 累计 3 次')).toBeTruthy();
  });

  it('opens a task workbench and keeps Runs scoped under the task instead of global navigation', async () => {
    const user = userEvent.setup();
    saveTaskAttributes('task_waiting', { type: 'project' });
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.dblClick(await screen.findByText('董事会材料修订'));

    expect(await screen.findByText('工作台')).toBeTruthy();
    expect(screen.getByRole('button', { name: '执行' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '来源' })).toBeTruthy();
    expect(await screen.findByText('完成标准')).toBeTruthy();
    expect(screen.getByText('0/1')).toBeTruthy();
    expect(screen.getByText('下一项：确认最终材料')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Runs$/ })).toBeNull();
    expect(await screen.findByText('自检查记录')).toBeTruthy();
    expect(screen.getByText('Run 1')).toBeTruthy();
    await user.click(await screen.findByText(/Run #1 · 已完成/));
    expect(await screen.findByText('Step 1')).toBeTruthy();
    expect(await screen.findByText('Run 验证通过')).toBeTruthy();
    expect(await screen.findByText('整理反馈')).toBeTruthy();
    expect(await screen.findByText('检查通过')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /重新生成/ }));
    expect(await screen.findByText(/最近 Run 结论：Run 验证通过/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '来源' }));
    expect(await screen.findByText('董事会反馈邮件')).toBeTruthy();
    expect(screen.getByText('关键来源')).toBeTruthy();
    expect(screen.getByText('最近更新：1/1')).toBeTruthy();
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

    await user.click(screen.getByRole('button', { name: '产物' }));
    expect(await screen.findByText('工作文件夹产物')).toBeTruthy();
    expect(screen.getByText('可内联编辑')).toBeTruthy();
    await user.click(await screen.findByText('report_v1.md'));
    expect(await screen.findByText(/需要补现金流页/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '编辑' }));
    const artifactEditor = screen.getByDisplayValue(/需要补现金流页/);
    await user.clear(artifactEditor);
    await user.type(artifactEditor, '# 终稿\n\n现金流页已补齐。');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText(/现金流页已补齐/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '重命名' }));
    const titleEditor = screen.getByDisplayValue('report_v1.md');
    await user.clear(titleEditor);
    await user.type(titleEditor, 'board_report_final.md');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('board_report_final.md')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(screen.queryByText('board_report_final.md')).toBeNull();

    await user.click(screen.getByRole('button', { name: '活动' }));
    expect(await screen.findByText('活动记录')).toBeTruthy();
    expect(screen.getByText('需关注')).toBeTruthy();
    expect(screen.getByText('最近更新：1/1')).toBeTruthy();
    expect(screen.getByText('完成检查被用户覆盖：0/1 · Run 验证通过')).toBeTruthy();
    expect(screen.getByText(/完成检查未通过：仍有 1 条完成标准未满足/)).toBeTruthy();

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
    expect(await screen.findByRole('button', { name: '延期到明天' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '改优先级' })).toBeTruthy();
    expect(screen.getByText('移至项目')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '合同盖章跟进' }));
    expect(loadTaskAttributes().task_risk?.parentTaskId).toBe('task_waiting');
    expect(await screen.findByText('📁 合同盖章跟进')).toBeTruthy();
    await user.click(screen.getByTitle('更多操作'));
    await user.click(screen.getByRole('button', { name: '改优先级' }));
    expect(await screen.findByText('风险等级')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '中' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => {
      expect(harness.api.updateTask).toHaveBeenCalledWith(expect.objectContaining({
        id: 'task_risk',
        riskLevel: 'medium',
      }));
    });
    await user.click(screen.getByTitle('更多操作'));
    await user.click(screen.getByRole('button', { name: '延期到明天' }));
    await waitFor(() => {
      expect(harness.api.transitionTask).toHaveBeenCalledWith({
        id: 'task_risk',
        nextState: 'waiting_external',
        waitingReason: '延后处理：明天',
      });
    });
    await user.click(screen.getByTitle('更多操作'));
    await user.click(await screen.findByRole('button', { name: '提取流程模板' }));
    expect(await screen.findByText('提取流程模板')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '+ 新增步骤' }));
    const sopInputs = screen.getAllByRole('textbox');
    await user.type(sopInputs[sopInputs.length - 1]!, '复盘本次执行并更新默认流程');
    await user.click(screen.getByRole('button', { name: '保存为模板' }));

    await waitFor(() => {
      expect(harness.api.createProcessTemplate).toHaveBeenCalledWith(expect.objectContaining({
        title: '「董事会材料修订」流程模板',
        kind: 'sop',
        tags: ['董事会材料修订'],
        content: expect.stringContaining('复盘本次执行并更新默认流程'),
      }));
      expect(harness.api.applyProcessTemplate).toHaveBeenCalledWith({
        taskId: 'task_risk',
        templateId: 'process_template_sop',
        note: '从任务工作台提取并保存的 SOP 模板',
      });
    });

    await user.click(screen.getByRole('button', { name: /Context/ }));
    expect(await screen.findByText('「董事会材料修订」流程模板')).toBeTruthy();
    expect(screen.getByText('SOP 提取')).toBeTruthy();
  });
});
