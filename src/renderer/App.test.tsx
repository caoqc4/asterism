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
  recordWorkHabitApplications,
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
      {
        id: 'artifact_screenshot',
        taskId: task.id,
        sourceType: 'run',
        sourceId: 'run_1',
        kind: 'browser_evidence',
        title: 'mockup.png',
        content: 'binary image placeholder',
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
    verifications: [
      {
        id: 'verification_run_1',
        runId: run.id,
        targetType: 'run',
        targetId: run.id,
        tone: 'pass',
        label: 'Run 验证通过',
        detail: '验证子 Agent 已对照 Run 目标完成审查。',
        source: 'ai_verifier',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'verification_step_1',
        runId: run.id,
        targetType: 'step',
        targetId: 'step_1',
        tone: 'pass',
        label: '检查通过',
        detail: '验证子 Agent 已对照步骤预期输出完成审查。',
        source: 'ai_verifier',
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
      selfCheckRetryLimit: 2,
      communicationStyle: 'balanced',
      confirmationThreshold: 'normal',
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
    recordWorkHabitApplications: vi.fn().mockImplementation(async (input) => recordWorkHabitApplications(input.habitIds)),
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
    details,
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
    expect(screen.getByText(/任务级 Agent · 通用任务流/)).toBeTruthy();
    expect(screen.getByTitle(/搜索、提问或捕获任务想法/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tasks/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Runs/ })).toBeNull();
    expect(await screen.findByText('外部信号')).toBeTruthy();
    expect(screen.getByText(/按共享 Priority Lane 排序/)).toBeTruthy();
    expect(screen.getByText(/这里不是单独看板/)).toBeTruthy();
    expect(screen.getByText('暂无外部信号。')).toBeTruthy();
    expect(screen.getByText(/等待你确认是否长成任务/)).toBeTruthy();
  });

  it('clarifies Model configuration stays local and separate from task memory', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Model/ }));

    expect(await screen.findByText(/Provider 密钥保存在本机系统钥匙串/)).toBeTruthy();
    expect(screen.getByText(/不会写入任务记忆/)).toBeTruthy();
  });

  it('keeps task management available before AI setup', async () => {
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValueOnce(buildAiStatus({ configured: false }));
    render(<App />);

    expect(await screen.findByText(/AI 尚未配置/)).toBeTruthy();
    expect(screen.getByText(/任务管理仍可继续使用/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tasks/ })).toBeTruthy();
  });

  it('clarifies enabled Skills are only available tools, not automatic execution', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Skills/ }));

    expect(await screen.findByText(/AI 执行任务时可调用的工具模块/)).toBeTruthy();
    expect(screen.getByText(/启用技能只会把工具加入 AI 能力库/)).toBeTruthy();
    expect(screen.getByText(/是否调用仍由任务上下文、用户指令和执行确认决定/)).toBeTruthy();
  });

  it('clarifies MCP servers expose tools without automatic execution', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /MCP/ }));

    expect(await screen.findByText(/Model Context Protocol 工具服务端/)).toBeTruthy();
    expect(screen.getByText(/连接服务器只会让工具进入 AI 能力库/)).toBeTruthy();
    expect(screen.getByText(/具体调用仍由任务上下文、用户指令和执行确认决定/)).toBeTruthy();
    expect(screen.getByText(/可将工具注册到 AI 能力库/)).toBeTruthy();
  });

  it('surfaces committed active tasks in the Brief stats strip', async () => {
    saveTaskAttributes('task_risk', { commitment: '今晚前给 CFO 过目' });
    render(<App />);

    expect(await screen.findByText('本周承诺: 1')).toBeTruthy();
  });

  it('opens recent Brief snapshots from yesterday summary', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getHomeBrief).mockResolvedValueOnce({
      ...buildBriefData(harness.tasks, harness.decisions),
      recentBriefSnapshots: [
        {
          id: 'brief_snapshot_1',
          kind: 'home',
          payload: '昨天完成了董事会材料修订初稿，并留下 1 个等待法务确认的事项。',
          source: 'ai',
          fallbackReason: null,
          createdAt: '2026-05-07T09:00:00.000Z',
        },
      ],
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '昨日总结' }));

    expect(await screen.findByText(/昨天完成了董事会材料修订初稿/)).toBeTruthy();
    expect(screen.getByText('AI 生成')).toBeTruthy();
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

  it('plans captured Brief focus tasks before completing them', async () => {
    const user = userEvent.setup();
    const capturedTask = buildTask({
      id: 'task_captured_brief_complete',
      title: '整理临时线索',
      state: 'captured',
      summary: '从临时讨论捕获，还未进入正式计划。',
    });
    vi.mocked(harness.api.getHomeBrief).mockResolvedValue(buildBriefData([capturedTask], []));
    vi.mocked(harness.api.getTaskDetail).mockImplementation(async (taskId: string) =>
      taskId === capturedTask.id ? buildTaskDetail(capturedTask) : null);
    render(<App />);

    const capturedCard = (await screen.findByText('整理临时线索')).closest('.focus-card')!;
    const completeButton = Array.from(capturedCard.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === '完成') as HTMLButtonElement;
    await user.click(completeButton);
    expect(await screen.findByText('完成确认')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '仍然完成' }));

    await waitFor(() => {
      expect(harness.api.transitionTask).toHaveBeenNthCalledWith(1, {
        id: 'task_captured_brief_complete',
        nextState: 'planned',
      });
      expect(harness.api.transitionTask).toHaveBeenNthCalledWith(2, {
        id: 'task_captured_brief_complete',
        nextState: 'completed',
        waitingReason: undefined,
      });
    });
  });

  it('plans captured Brief focus tasks before deferring them', async () => {
    const user = userEvent.setup();
    const capturedTask = buildTask({
      id: 'task_captured_brief_defer',
      title: '延后临时线索',
      state: 'captured',
      summary: '从临时讨论捕获，稍后再处理。',
    });
    vi.mocked(harness.api.getHomeBrief).mockResolvedValue(buildBriefData([capturedTask], []));
    render(<App />);

    const capturedCard = (await screen.findByText('延后临时线索')).closest('.focus-card')!;
    fireEvent.mouseEnter(capturedCard);
    fireEvent.click(Array.from(capturedCard.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === '延后 ▾') as HTMLButtonElement);
    await user.click(await screen.findByRole('button', { name: '明天' }));

    await waitFor(() => {
      expect(harness.api.transitionTask).toHaveBeenNthCalledWith(1, {
        id: 'task_captured_brief_defer',
        nextState: 'planned',
      });
      expect(harness.api.transitionTask).toHaveBeenNthCalledWith(2, {
        id: 'task_captured_brief_defer',
        nextState: 'waiting_external',
        waitingReason: '延后处理：明天',
      });
    });
  });

  it('keeps Brief defer conflict choices aligned with the selected day', async () => {
    const user = userEvent.setup();
    render(<App />);

    const focusCard = (await screen.findByText('董事会材料修订')).closest('.focus-card')!;
    fireEvent.mouseEnter(focusCard);
    fireEvent.click(Array.from(focusCard.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === '延后 ▾') as HTMLButtonElement);
    await user.click(await screen.findByRole('button', { name: '下周一' }));

    expect(await screen.findByText(/下周一已有 4 件任务/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '我来选' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '我来选' }));
    expect(screen.queryByText(/下周一已有 4 件任务/)).toBeNull();
    expect(await screen.findByRole('button', { name: '选日期…' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '下周一' }));
    await user.click(await screen.findByRole('button', { name: '周二' }));

    await waitFor(() => {
      expect(harness.api.transitionTask).toHaveBeenCalledWith({
        id: 'task_risk',
        nextState: 'waiting_external',
        waitingReason: '延后处理：周二',
      });
    });
  });

  it('routes running Brief focus primary action to the task workbench', async () => {
    const user = userEvent.setup();
    const runningTask = buildTask({
      id: 'task_running_brief',
      title: '生成投资人更新稿',
      state: 'running',
      summary: 'Run 正在生成投资人更新稿。',
    });
    vi.mocked(harness.api.getHomeBrief).mockResolvedValue(buildBriefData([runningTask], []));
    vi.mocked(harness.api.getTaskDetail).mockImplementation(async (taskId: string) =>
      taskId === runningTask.id ? buildTaskDetail(runningTask) : null);
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /查看 Run/ }));

    expect(await screen.findByText('工作台')).toBeTruthy();
    expect(await screen.findByText('生成投资人更新稿')).toBeTruthy();
  });

  it('prefills waiting Brief focus actions with a follow-up prompt', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /起草跟进/ }));

    const input = await screen.findByPlaceholderText(/关于「合同盖章跟进」/) as HTMLTextAreaElement;
    expect(input.value).toContain('起草一条跟进等待项的消息');
    expect(input.value).toContain('合同盖章跟进');
  });

  it('lets users adjust Brief focus order for today without changing lanes', async () => {
    render(<App />);

    const firstCard = (await screen.findByText('董事会材料修订')).closest('.focus-card')!;
    const secondCard = (await screen.findByText('合同盖章跟进')).closest('.focus-card')!;
    fireEvent.dragStart(firstCard);
    fireEvent.dragOver(secondCard);
    fireEvent.drop(secondCard);

    expect(await screen.findByText(/今日顺序已调整，仅今天有效/)).toBeTruthy();
    const cards = Array.from(document.querySelectorAll('.focus-card'));
    expect(cards[0]?.textContent).toContain('合同盖章跟进');
    expect(cards[1]?.textContent).toContain('董事会材料修订');
    expect(cards[1]?.textContent).toContain('Escalate now');
  });

  it('opens task context in the right panel from a Brief focus card and sends task-aware chat', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));

    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();
    expect(screen.getByText(/从任务记忆、执行记录、关键来源和工作习惯重新组装上下文/)).toBeTruthy();
    await user.click(await screen.findByText('合同盖章跟进'));
    expect(await screen.findByText(/不会中断当前对话/)).toBeTruthy();
    expect(screen.getByText(/上下文切换由你确认/)).toBeTruthy();
    fireEvent.click(screen.getByTitle('全屏显示'));
    expect(screen.getByTitle('退出全屏')).toBeTruthy();
    fireEvent.click(screen.getByTitle('退出全屏'));
    fireEvent.click(screen.getByTitle('历史记录'));
    expect(screen.getByText('当前会话')).toBeTruthy();
    expect(screen.getByText('消息')).toBeTruthy();
    expect(screen.getByText(/临时工作内存/)).toBeTruthy();
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
      expect(harness.api.recordWorkHabitApplications).toHaveBeenCalledWith({
        habitIds: ['habit_seed_review_before_send'],
      });
    });
    expect(await screen.findByText('我会基于任务上下文给出下一步建议。')).toBeTruthy();

    fireEvent.click(screen.getByTitle('关闭面板'));
    expect(screen.getByText('挂起')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Search or ask/ }));
    expect(screen.getByPlaceholderText(/关于「董事会材料修订」/)).toBeTruthy();
  });

  it('captures a global right-panel discussion as a task before planning', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Search or ask/ }));
    expect(await screen.findByText(/重要内容会进入任务记忆/)).toBeTruthy();
    expect(await screen.findByText('把待办整理成任务')).toBeTruthy();
    const input = await screen.findByPlaceholderText(/搜索、提问或捕获任务想法/);
    await user.type(input, '准备投资人沟通材料');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.chatWithAI).toHaveBeenCalledWith(expect.objectContaining({
        taskId: null,
      }));
    });
    expect(await screen.findByText(/这段讨论可以先捕获为任务/)).toBeTruthy();
    expect(screen.getByText(/不会直接执行/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '捕获为任务' }));

    await waitFor(() => {
      expect(harness.api.createTask).toHaveBeenCalledWith({
        title: '准备投资人沟通材料',
        summary: '从右侧面板捕获：准备投资人沟通材料',
      });
    });
    expect(await screen.findByText(/已捕获为任务/)).toBeTruthy();
    expect(screen.getByText(/确认后才进入 Tasks/)).toBeTruthy();
    expect(screen.getByText(/真实子任务仍需你确认/)).toBeTruthy();
    expect(screen.getByText(/这是待确认任务/)).toBeTruthy();
    expect(await screen.findByPlaceholderText(/关于「准备投资人沟通材料」/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '判断任务类型' }));
    const taskInput = screen.getByPlaceholderText(/关于「准备投资人沟通材料」/) as HTMLTextAreaElement;
    expect(taskInput.value).toContain('一次性 / 定时重复 / 事件触发 / 项目型');
    expect(taskInput.value).toContain('不要直接生成真实子任务');
    expect(harness.api.transitionTask).not.toHaveBeenCalledWith({
      id: 'task_created',
      nextState: 'planned',
    });
    await user.click(screen.getByRole('button', { name: '确认加入 Tasks' }));
    await waitFor(() => {
      expect(harness.api.transitionTask).toHaveBeenCalledWith({
        id: 'task_created',
        nextState: 'planned',
      });
    });
    expect(await screen.findByText(/已确认加入 Tasks/)).toBeTruthy();
  });

  it('keeps unconfirmed right-panel captures out of the Tasks main list', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.listTasks).mockResolvedValueOnce([
      buildTask({
        id: 'task_panel_capture',
        title: '准备投资人沟通材料',
        state: 'captured',
        summary: '从右侧面板捕获：准备投资人沟通材料',
      }),
      buildTask({
        id: 'task_confirmed',
        title: '董事会材料修订',
        state: 'planned',
      }),
    ]);
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));

    expect(await screen.findByText('董事会材料修订')).toBeTruthy();
    expect(screen.queryByText('准备投资人沟通材料')).toBeNull();
  });

  it('abandons an unconfirmed right-panel capture only after a second confirmation', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Search or ask/ }));
    const input = await screen.findByPlaceholderText(/搜索、提问或捕获任务想法/);
    await user.type(input, '整理下周路演安排');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(await screen.findByText(/这段讨论可以先捕获为任务/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '捕获为任务' }));

    await user.click(await screen.findByRole('button', { name: '放弃' }));
    expect(harness.api.transitionTask).not.toHaveBeenCalledWith({
      id: 'task_created',
      nextState: 'archived',
    });
    await user.click(screen.getByRole('button', { name: '确认放弃' }));

    await waitFor(() => {
      expect(harness.api.transitionTask).toHaveBeenCalledWith({
        id: 'task_created',
        nextState: 'archived',
      });
    });
    expect(await screen.findByText(/已放弃这条待确认任务/)).toBeTruthy();
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

    expect(await screen.findByText(/开始新会话前会先保全关键决策、偏好变化和未解决问题/)).toBeTruthy();
    expect(screen.getByText(/只保存精选信号，不保存完整聊天全文/)).toBeTruthy();
    expect(screen.getByText(/同一个问题已重复出现 3 次/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '开始新会话' }));
    await waitFor(() => {
      expect(harness.api.createSourceContext).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
        title: '会话刷新前保全',
        kind: 'note',
        isKey: false,
        content: expect.stringContaining('只保存精选信号，不保存完整聊天全文'),
        note: '自学习观察：会话刷新前保全关键决策、偏好变化和未解决问题。',
      }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/开始新会话前会先保全关键决策、偏好变化和未解决问题/)).toBeNull();
    });
  });

  it('suggests a fresh task session when recent AI replies stay generic', async () => {
    vi.mocked(harness.api.chatWithAI!).mockResolvedValue({
      text: '我会基于任务上下文给出下一步建议。你希望我重点关注哪个方向？',
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);

    for (const prompt of ['先整理目标', '再看看风险', '帮我判断推进路径']) {
      await user.type(input, prompt);
      await user.click(screen.getByRole('button', { name: '发送' }));
      await waitFor(() => {
        expect(harness.api.chatWithAI).toHaveBeenCalled();
      });
    }

    expect(await screen.findByText(/开始新会话前会先保全关键决策、偏好变化和未解决问题/)).toBeTruthy();
    expect(screen.getByText(/最近 3 次回复都偏泛化/)).toBeTruthy();
  });

  it('suggests a fresh task session when the task discussion keeps correcting itself', async () => {
    vi.mocked(harness.api.chatWithAI!).mockResolvedValue({
      text: '收到，我会按这次修正继续推进。',
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);

    for (const prompt of ['先看现金流页', '不对，先处理 CEO 批注', '改成先补法务意见']) {
      await user.type(input, prompt);
      await user.click(screen.getByRole('button', { name: '发送' }));
      await waitFor(() => {
        expect(harness.api.chatWithAI).toHaveBeenCalled();
      });
    }

    expect(await screen.findByText(/开始新会话前会先保全关键决策、偏好变化和未解决问题/)).toBeTruthy();
    expect(screen.getByText(/最近多次出现改口或纠正/)).toBeTruthy();
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

    expect(await screen.findByText(/开始新会话前会先保全关键决策、偏好变化和未解决问题/)).toBeTruthy();
    expect(screen.getByText(/达到刷新阈值 3/)).toBeTruthy();
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
    expect(screen.getByText(/检查建议不阻断操作/)).toBeTruthy();
    expect(screen.getByText(/将记录：覆盖完成 · 完成标准 0\/1 · 未满足 1 条 · 最近 Run：Run 验证通过/)).toBeTruthy();
    expect(screen.getByText(/作为后续工作习惯提议的学习信号/)).toBeTruthy();
    expect(screen.getByText(/用户确认后的完成判断/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '仍然完成' }));

    await waitFor(() => {
      expect(harness.api.recordTaskCompletionCheck).toHaveBeenCalledWith(expect.objectContaining({
        runVerificationTone: 'pass',
        runVerificationLabel: 'Run 验证通过',
        runVerificationDetail: '验证子 Agent 已对照 Run 目标完成审查。',
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
      runVerificationDetail: '验证子 Agent 已对照 Run 目标完成审查。',
    }));

    await user.click(screen.getByRole('button', { name: /Context/ }));
    expect(await screen.findByText(/允许覆盖未满足的完成检查/)).toBeTruthy();
    expect(screen.getAllByText('提议确认').length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: '确认' })[0]!);
    expect((await screen.findAllByText('已确认')).length).toBeGreaterThan(0);
  });

  it('does not create completion-override habit proposals when self-learn is disabled', async () => {
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      featureFlags: {
        enableScheduler: false,
        enableProviderNativeToolCalls: true,
        enableSandboxCodingAgent: false,
        enableSandboxPatchPromotionApply: false,
        enableSelfCheck: true,
        enableSelfLearn: false,
      },
    }));
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByText('董事会材料修订'));
    await user.click(await screen.findByRole('button', { name: '完成' }));

    expect(await screen.findByText('完成确认')).toBeTruthy();
    expect(screen.getByText(/自学习已关闭，不会生成新的工作习惯提议/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '仍然完成' }));

    await waitFor(() => {
      expect(harness.api.recordTaskCompletionCheck).toHaveBeenCalledWith(expect.objectContaining({
        action: 'override_completed',
        source: 'task_completion_modal',
      }));
      expect(harness.api.transitionTask).toHaveBeenCalledWith({
        id: 'task_risk',
        nextState: 'completed',
        waitingReason: undefined,
      });
    });
    expect(harness.api.recordCompletionOverrideLearningSignal).not.toHaveBeenCalled();
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

  it('uses the Brief-style fullness prompt for Tasks row defer', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByText('董事会材料修订'));
    await user.click(await screen.findByRole('button', { name: '延后 ▾' }));
    await user.click(await screen.findByRole('button', { name: '下周一' }));

    expect(await screen.findByText(/下周一已有 4 件任务/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '我来选' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '我来选' }));
    expect(screen.queryByText(/下周一已有 4 件任务/)).toBeNull();
    expect(await screen.findByRole('button', { name: '选日期…' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '下周一' }));
    await user.click(await screen.findByRole('button', { name: '周二' }));

    await waitFor(() => {
      expect(harness.api.transitionTask).toHaveBeenCalledWith({
        id: 'task_risk',
        nextState: 'waiting_external',
        waitingReason: '延后处理：周二',
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
    const baseSource = harness.details.task_risk!.sourceContexts[0]!;
    harness.details.task_risk!.sourceContexts = [
      baseSource,
      { ...baseSource, id: 'source_2', title: 'CEO 批注', updatedAt: '2026-01-02T00:00:00.000Z' },
      { ...baseSource, id: 'source_3', title: '法务意见', updatedAt: '2026-01-03T00:00:00.000Z' },
      { ...baseSource, id: 'source_4', title: '财务复核', updatedAt: '2026-01-04T00:00:00.000Z' },
    ];
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByText('董事会材料修订'));
    expect(await screen.findByText('财务复核')).toBeTruthy();
    expect(screen.getByText('法务意见')).toBeTruthy();
    expect(screen.getByText('CEO 批注')).toBeTruthy();
    expect(screen.getByText(/预览只展示最近更新的 3 条关键来源/)).toBeTruthy();
    expect(screen.queryByText('董事会反馈邮件')).toBeNull();
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

    expect(await screen.findByText(/AI 只给建议，不替你选择/)).toBeTruthy();
    expect(await screen.findByText('是否批准本轮材料修改方案')).toBeTruthy();
    expect(await screen.findByText('是否恢复暂停的 Agent 执行')).toBeTruthy();
    expect(screen.getByText('待拍板')).toBeTruthy();
    expect(screen.getAllByText('今天必须处理').length).toBeGreaterThan(0);
    expect(screen.getAllByText('本周内').length).toBeGreaterThan(0);
    expect(screen.getByText(/检查点暂停的事项优先处理/)).toBeTruthy();
    expect(screen.getByText(/影响面 × 不可逆程度/)).toBeTruthy();
    expect(screen.getByText('Agent 检查点')).toBeTruthy();
    expect(screen.getByText('需要复核')).toBeTruthy();
    expect(screen.getByText('高影响')).toBeTruthy();
    expect(screen.getByText('需谨慎恢复')).toBeTruthy();
    expect(screen.getByText('恢复执行')).toBeTruthy();
    expect(screen.getByText('人工决策')).toBeTruthy();
    expect(screen.getByText('推荐路径清晰')).toBeTruthy();
    expect(screen.getByText('中影响')).toBeTruthy();
    expect(screen.getByText('可回退')).toBeTruthy();
    expect(screen.getAllByText('展开可比较备选').length).toBeGreaterThan(0);
    expect(screen.getAllByText('更新 2026-01-01').length).toBeGreaterThan(0);
    expect(screen.queryByText('decision_done')).toBeNull();
    await user.type(screen.getByPlaceholderText('搜索决策或任务'), '合同');
    expect(await screen.findByText('没有匹配的待拍板事项。')).toBeTruthy();
    await user.clear(screen.getByPlaceholderText('搜索决策或任务'));

    await user.click(screen.getByText('是否恢复暂停的 Agent 执行'));
    expect(await screen.findByText(/Agent 在「董事会材料修订」的执行检查点暂停/)).toBeTruthy();
    expect(screen.getByText(/不会授予后续同类动作的长期权限/)).toBeTruthy();
    expect(screen.getByText('暂停等待')).toBeTruthy();
    expect(screen.getByText('取消本次执行')).toBeTruthy();

    await user.click(screen.getByText('是否批准本轮材料修改方案'));
    expect((await screen.findAllByText('为什么现在')).length).toBeGreaterThan(0);
    expect(screen.getByText(/等待拍板状态/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '修改后批准' }).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: '要求补充信息' })[0]!);
    expect((await screen.findAllByText('董事会材料修订')).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: '查看任务详情' })[0]!);
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

  it('keeps the empty Decisions state anchored on user approval', async () => {
    const user = userEvent.setup();
    harness.decisions.length = 0;
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Decisions/ }));

    expect(await screen.findByText('当前没有待拍板事项。')).toBeTruthy();
    expect(screen.getByText(/汇总到这里等待你拍板/)).toBeTruthy();
  });

  it('saves AI behavior preferences as dedicated feature flags', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Settings/ }));
    expect(await screen.findByText(/不做持续行为监控/)).toBeTruthy();
    expect(screen.getByText('Run / Task 自检查')).toBeTruthy();
    expect(screen.getByText(/Step 级检查是执行质量基线/)).toBeTruthy();
    expect(screen.getByText(/Run \/ Task 检查只在失败、等待拍板或完成确认时提示/)).toBeTruthy();
    expect(screen.getByText(/完成、覆盖、SOP 提取等节点提炼工作习惯/)).toBeTruthy();
    expect(screen.getByText(/关闭后不生成新的习惯提议/)).toBeTruthy();
    expect(screen.getByText(/Context 展示，可停用或删除/)).toBeTruthy();
    expect(screen.getByText(/真正压缩前会先保留关键决策、偏好变化和未解决问题/)).toBeTruthy();
    expect(screen.getByText('沟通风格')).toBeTruthy();
    expect(screen.getByText('确认阈值')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '详细' }));
    await user.click(screen.getByRole('button', { name: '高' }));
    const switches = await screen.findAllByRole('switch');
    await user.click(switches[0]!);
    await user.click(switches[1]!);

    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0]!, { target: { value: '3' } });
    fireEvent.change(sliders[1]!, { target: { value: '50' } });
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    await waitFor(() => {
      expect(harness.api.setAiConfig).toHaveBeenCalledWith(expect.objectContaining({
        featureFlags: expect.objectContaining({
          enableSelfCheck: false,
          enableSelfLearn: false,
          selfCheckRetryLimit: 3,
          contextCompressionThreshold: 50,
          communicationStyle: 'detailed',
          confirmationThreshold: 'high',
        }),
      }));
    });
  });

  it('keeps task type and commitment lenses usable from capture through workbench config', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: '+ 新建任务' }));
    const captureInput = await screen.findByPlaceholderText(/任务标题/);
    await user.type(captureInput, '每周一准备经营周报');
    expect(screen.getByText('AI 建议类型')).toBeTruthy();
    expect(screen.getByRole('button', { name: '定时' }).className).toContain('active');
    await user.clear(captureInput);
    await user.type(captureInput, '官网改版项目');
    expect(screen.getByRole('button', { name: '项目' }).className).toContain('active');
    await user.click(screen.getByRole('button', { name: '一次性' }));
    expect(screen.getByText('用户确认类型')).toBeTruthy();
    expect(screen.getByText(/你已确认为一次性任务/)).toBeTruthy();
    await user.clear(captureInput);
    await user.type(captureInput, '每周一准备经营周报');
    expect(screen.getByRole('button', { name: '一次性' }).className).toContain('active');
    await user.click(screen.getByRole('button', { name: '+ 新建任务' }));
    await user.click(screen.getByRole('button', { name: '+ 新建任务' }));
    const reopenedCaptureInput = await screen.findByPlaceholderText(/任务标题/);
    await user.type(reopenedCaptureInput, '每周一准备经营周报');
    expect(screen.getByText('AI 建议类型')).toBeTruthy();
    expect(screen.getByText(/AI 建议为定时任务/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '定时' }).className).toContain('active');
    expect(screen.getByText('捕获意图')).toBeTruthy();
    expect(screen.getByText('确认类型')).toBeTruthy();
    expect(screen.getByText('创建后推进')).toBeTruthy();
    expect(screen.getAllByText(/只需要确认或调整建议/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/周期和触发条件可在工作台 Header 调整/).length).toBeGreaterThan(0);
    expect(screen.getByText(/定时任务创建后可确认周期与执行节奏/)).toBeTruthy();
    await user.type(screen.getByPlaceholderText(/已承诺时间/), '周五 17:00 前发给 CEO');
    await user.click(screen.getByRole('button', { name: '创建' }));
    await waitFor(() => {
      expect(harness.api.transitionTask).toHaveBeenCalledWith({
        id: 'task_created',
        nextState: 'planned',
      });
    });
    expect(screen.getByRole('button', { name: /确认周期与节奏/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /确认周期与节奏/ }));
    const scheduledInput = screen.getByPlaceholderText(/关于「每周一准备经营周报」/) as HTMLTextAreaElement;
    expect(scheduledInput.value).toContain('定时任务');
    expect(scheduledInput.value).toContain('周期');
    await user.click(screen.getByTitle('关闭面板'));

    await user.click(screen.getByRole('button', { name: /定时任务/ }));
    expect((await screen.findAllByText('每周一准备经营周报')).length).toBeGreaterThan(0);
    await user.click((await screen.findAllByText('每周一准备经营周报'))[0]!);
    expect(await screen.findByText(/周期配置保存在任务属性中/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /确认周期与节奏/ }));
    const previewPlanningInput = screen.getByPlaceholderText(/关于「每周一准备经营周报」/) as HTMLTextAreaElement;
    expect(previewPlanningInput.value).toContain('定时任务');
    expect(previewPlanningInput.value).toContain('第一次执行前');
    await user.click(screen.getByTitle('关闭面板'));
    await user.click(screen.getByRole('button', { name: /已承诺/ }));
    expect((await screen.findAllByText('每周一准备经营周报')).length).toBeGreaterThan(0);

    await user.dblClick((await screen.findAllByText('每周一准备经营周报'))[0]!);
    expect(await screen.findByText('定时任务')).toBeTruthy();
    expect(screen.getByText('定时执行')).toBeTruthy();
    expect(screen.getByText(/每次触发会在这里形成一条独立 Run 实例/)).toBeTruthy();
    expect(screen.getByText(/每周一 09:00/)).toBeTruthy();
    expect(screen.getByText(/周五 17:00 前发给 CEO/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /确认周期与节奏/ }));
    const workbenchPlanningInput = screen.getByPlaceholderText(/关于「每周一准备经营周报」/) as HTMLTextAreaElement;
    expect(workbenchPlanningInput.value).toContain('定时任务');
    expect(workbenchPlanningInput.value).toContain('第一次执行前');
    await user.click(screen.getByTitle('关闭面板'));
    await user.click(screen.getByRole('button', { name: /每周一 09:00/ }));
    expect(await screen.findByText('定时配置')).toBeTruthy();
    expect(screen.getByText(/频率、执行时间、结束条件/)).toBeTruthy();
    expect(screen.getByText(/下次执行时间由后续调度器预览/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '取消' }));

    await user.click(screen.getAllByRole('button', { name: /Tasks/ })[0]!);
    await user.click(await screen.findByRole('button', { name: '+ 新建任务' }));
    await user.type(await screen.findByPlaceholderText(/任务标题/), '收到品牌合作邮件时跟进');
    expect(screen.getByRole('button', { name: '事件' }).className).toContain('active');
    await user.click(screen.getByRole('button', { name: '创建' }));
    await user.click(screen.getByRole('button', { name: /事件触发/ }));
    await user.click(await screen.findByText('收到品牌合作邮件时跟进'));
    expect(await screen.findByText(/追加到任务产物和执行记录/)).toBeTruthy();
    await user.dblClick((await screen.findAllByText('收到品牌合作邮件时跟进'))[0]!);
    expect(await screen.findByText('事件监听')).toBeTruthy();
    expect(screen.getByText('等待触发')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /外部信号更新时/ }));
    expect(await screen.findByText(/来源与触发条件/)).toBeTruthy();
    expect(screen.getByText(/触发后的摘要追加到执行记录和产物/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '取消' }));
    await user.click(screen.getByRole('button', { name: '产物' }));
    expect(screen.getByText(/事件信号默认追加到同一份积累式记录/)).toBeTruthy();
  });

  it('creates a project parent task and guides AI decomposition instead of hard-coded subtasks', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: '+ 新建任务' }));
    await user.type(await screen.findByPlaceholderText(/任务标题/), '官网改版项目');
    expect(screen.getByRole('button', { name: '项目' }).className).toContain('active');
    expect(screen.getAllByText(/类型由 AI 根据标题预判/).length).toBeGreaterThan(0);
    expect(screen.getByText(/点击创建即确认当前建议/)).toBeTruthy();
    expect(screen.getAllByText(/确认后才创建真实子任务/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '创建' }));
    await waitFor(() => {
      expect(harness.api.transitionTask).toHaveBeenCalledWith({
        id: 'task_created',
        nextState: 'planned',
      });
    });

    await user.click(screen.getByRole('button', { name: /项目型/ }));
    expect((await screen.findAllByText('官网改版项目')).length).toBeGreaterThan(0);
    expect(screen.getByText('0/0 子任务完成')).toBeTruthy();
    expect(screen.getByText(/等待 AI 根据项目目标拆解子任务/)).toBeTruthy();
    expect(screen.queryByText('明确范围：官网改版项目')).toBeNull();
    expect(harness.api.createTask).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '生成拆解草稿' }));
    expect(await screen.findByText('确认官网改版范围')).toBeTruthy();
    expect(screen.getByText('拆解自检')).toBeTruthy();
    expect(screen.getByText('大块任务')).toBeTruthy();
    expect(screen.getByText('边界独立')).toBeTruthy();
    expect(screen.getByText('依赖明确')).toBeTruthy();
    expect(screen.getByText('验收可见')).toBeTruthy();
    expect(screen.getByText('独立性：这是后续执行的独立输入。')).toBeTruthy();
    expect(screen.getByText('依赖：确认官网改版范围')).toBeTruthy();
    expect(screen.getByText('确认是否创建这些子任务。')).toBeTruthy();
    expect(screen.getByText('子任务保持大块、边界清楚，暂不继续细拆。')).toBeTruthy();
    expect(screen.getByText(/最多保持项目 → 子任务两层/)).toBeTruthy();
    expect(harness.api.decomposeProject).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_created',
      instructions: expect.stringContaining('最多两层'),
    }));
    await user.click(screen.getByRole('button', { name: '创建这些子任务' }));
    await waitFor(() => {
      expect(harness.api.transitionTask).toHaveBeenCalledWith({
        id: 'task_created_1',
        nextState: 'planned',
      });
      expect(harness.api.transitionTask).toHaveBeenCalledWith({
        id: 'task_created_2',
        nextState: 'planned',
      });
    });
    expect(await screen.findByText('产出官网改版方案')).toBeTruthy();
    expect(screen.getByText('0/2 子任务完成')).toBeTruthy();
    expect(screen.getByText('依赖：确认官网改版范围')).toBeTruthy();
    expect(screen.getByText('归属')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /官网改版项目2/ }));
    expect(screen.getByText('确认官网改版范围')).toBeTruthy();
    expect(screen.getByText('产出官网改版方案')).toBeTruthy();
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
    const decompositionInput = screen.getByPlaceholderText(/关于「官网改版项目」/) as HTMLTextAreaElement;
    expect(decompositionInput.value).toContain('先拆一版');
    expect(decompositionInput.value).toContain('再自检查');
    await user.click(screen.getByTitle('关闭面板'));

    await user.dblClick((await screen.findAllByText('官网改版项目'))[1]!);
    expect(await screen.findByText('项目子任务执行概览')).toBeTruthy();
    expect(screen.getByText('0/2 子任务完成')).toBeTruthy();
    expect(screen.getByText('确认官网改版范围')).toBeTruthy();
    expect(screen.getByText('产出官网改版方案')).toBeTruthy();
    expect(screen.getByText(/下一步：/)).toBeTruthy();
    expect(screen.getByText(/父任务工作台负责汇总子任务进度/)).toBeTruthy();
    expect(screen.getByText(/复杂子任务应先升级为项目型再重新拆解/)).toBeTruthy();
  });

  it('lets users correct and clear task memory from Context', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Context/ }));
    expect(await screen.findByText('AI 可见来源')).toBeTruthy();
    expect(screen.getByText(/这里不是文件库/)).toBeTruthy();
    expect(screen.getByText('外部信号不确定')).toBeTruthy();
    expect(screen.getByText(/进入 Brief 的新捕获线索/)).toBeTruthy();
    expect(screen.getByText('任务推进疑问')).toBeTruthy();
    expect(screen.getByText(/不沉积为 Context 待确认项/)).toBeTruthy();
    expect(screen.getByText(/外部信号只会在授权连接后进入 Brief/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '管理连接' }));
    expect(await screen.findByText(/AI 可感知的外部信号源/)).toBeTruthy();
    expect(screen.getByText(/授权后只处理相关新信号/)).toBeTruthy();
    expect(screen.getByText('已连接来源')).toBeTruthy();
    expect(screen.getByText(/只在任务上下文需要时引用相关信号/)).toBeTruthy();
    expect(screen.getByText(/相关新信号带入 Brief 和任务上下文，等待你确认/)).toBeTruthy();
    expect(screen.getByText(/未授权的来源不会进入 AI 上下文/)).toBeTruthy();
    expect(screen.getByText('Gmail / Email')).toBeTruthy();
    expect(screen.getByText('Calendar')).toBeTruthy();
    expect(screen.getByText('GitHub')).toBeTruthy();
    expect(screen.getByText('EMAIL')).toBeTruthy();
    expect(screen.getByText('CAL')).toBeTruthy();
    expect(screen.getByText('GIT')).toBeTruthy();
    expect(screen.getByText(/授权后提取频道里的任务信号/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Context/ }));
    expect(await screen.findByText('AI 可见来源')).toBeTruthy();
    await user.click(await screen.findByText('董事会材料修订'));
    expect(await screen.findByText(/需要按最新反馈更新董事会材料/)).toBeTruthy();
    expect(screen.getByText(/工作习惯记录仅保存在本机/)).toBeTruthy();
    expect(screen.getByText(/不保存：聊天消息全文/)).toBeTruthy();
    expect(screen.getByText(/优先级：项目规则 > 任务类型规则 > 全局规则/)).toBeTruthy();

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
    expect(screen.queryByText('记忆已校正：只需要更新现金流页。')).toBeNull();
    expect(await screen.findByText(/记忆来源：董事会反馈邮件/)).toBeTruthy();
    expect(screen.getByText(/近期活动：task › completion_check/)).toBeTruthy();
  });

  it('explains how task memory starts when Context has no active memories', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.listTasks).mockResolvedValueOnce([
      {
        ...buildTask({ id: 'task_plain', title: '普通任务' }),
        summary: null,
        nextStep: null,
        waitingReason: null,
      },
    ]);
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Context/ }));

    expect(await screen.findByText(/任务记忆会随任务说明、执行记录和你的修正逐步建立/)).toBeTruthy();
  });

  it('surfaces source-context-only task memory in Context', async () => {
    const user = userEvent.setup();
    const sourceOnlyTask = {
      ...buildTask({ id: 'task_source_only', title: '来源驱动任务' }),
      summary: null,
      nextStep: null,
      waitingReason: null,
    };
    vi.mocked(harness.api.listTasks).mockResolvedValueOnce([sourceOnlyTask]);
    vi.mocked(harness.api.getTaskDetail).mockImplementation(async (taskId: string) =>
      taskId === 'task_source_only'
        ? {
            ...buildTaskDetail(sourceOnlyTask),
            sourceContexts: [
              {
                ...buildTaskDetail(sourceOnlyTask).sourceContexts[0]!,
                title: '会话刷新前保全',
                note: '自学习观察：会话刷新前保全关键决策、偏好变化和未解决问题。',
              },
            ],
          }
        : null);
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Context/ }));
    await user.click(await screen.findByText('来源驱动任务'));

    expect(await screen.findByText(/记忆来源：会话刷新前保全/)).toBeTruthy();
    expect(screen.getByText(/自学习观察：会话刷新前保全关键决策/)).toBeTruthy();
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
    expect(screen.getByText(/显著流程、步骤顺序和工具选择必须提议确认/)).toBeTruthy();
    expect(screen.getByText(/SOP 模板只由你主动保存/)).toBeTruthy();
    expect(screen.getByText(/停用、删除和覆盖已有规则都由你主动操作/)).toBeTruthy();
    expect(screen.getByText(/只在 Step\/Run\/Task 完成、你编辑 AI 产物、或会话压缩前提取学习信号/)).toBeTruthy();
    expect(screen.getByText(/不做持续行为监控/)).toBeTruthy();
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

  it('lets users suppress a pending work habit proposal from Context', async () => {
    const user = userEvent.setup();
    saveWorkHabits([
      buildWorkHabit({
        id: 'habit_suppress',
        rule: '所有外部合作回复都先走人工确认',
        source: 'proposal',
        status: 'pending',
        examples: '合作邮件回复',
      }),
    ]);
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Context/ }));
    await user.click(await screen.findByText('所有外部合作回复都先走人工确认'));
    expect(screen.getByText(/显著流程、步骤顺序或工具选择必须由你确认后才应用/)).toBeTruthy();
    expect(screen.getByText(/待确认提议不会进入后续 AI 提示词/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '以后不再提示' }));

    expect((await screen.findAllByText('已停用')).length).toBeGreaterThan(0);
    expect(screen.getByText(/已停用规则不会进入后续 AI 提示词/)).toBeTruthy();
  });

  it('lets users delete learned work habits from Context', async () => {
    const user = userEvent.setup();
    saveWorkHabits([
      buildWorkHabit({
        id: 'habit_delete',
        rule: '临时规则可被用户删除',
        source: 'manual',
        status: 'confirmed',
        examples: '用户主动清理',
      }),
    ]);
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Context/ }));
    expect(await screen.findByText('临时规则可被用户删除')).toBeTruthy();
    await user.click(screen.getByTitle('删除'));

    await waitFor(() => {
      expect(screen.queryByText('临时规则可被用户删除')).toBeNull();
    });
    expect(harness.api.deleteWorkHabit).toHaveBeenCalledWith('habit_delete');
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
    expect(screen.getByText(/跨任务观察窗口 · 累计 3 次/)).toBeTruthy();
    expect(screen.getByText(/达到 3 次才作为待确认提议，确认前不应用/)).toBeTruthy();
  });

  it('invites correction when the workbench resume has thin context signals', async () => {
    const thinTask = buildTask({ id: 'task_thin', title: '低信号任务' });
    thinTask.summary = null;
    thinTask.nextStep = null;
    harness.tasks.unshift(thinTask);
    const baseDetail = buildTaskDetail(thinTask);
    const thinDetail: TaskDetail = {
      ...baseDetail,
      artifacts: [],
      completionCriteria: [],
      sourceContexts: [],
      processTemplates: [],
      availableProcessTemplates: [],
      timeline: [],
      resumeCard: {
        ...baseDetail.resumeCard,
        summary: '这个任务还没有足够信号，适合先补齐目标。',
        nextSuggestedMove: '下一步建议：补充任务摘要和完成标准。',
      },
    };
    const originalGetTaskDetail = harness.api.getTaskDetail;
    vi.mocked(harness.api.getTaskDetail).mockImplementation(async (taskId: string) => (
      taskId === 'task_thin' ? thinDetail : originalGetTaskDetail(taskId)
    ));

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.dblClick(await screen.findByText('低信号任务'));

    expect(await screen.findByText('信号不足，先补齐目标')).toBeTruthy();
    expect(screen.getByText(/可通过规划下一步或补充来源纠正这段叙事/)).toBeTruthy();
  });

  it('opens a task workbench and keeps Runs scoped under the task instead of global navigation', async () => {
    const user = userEvent.setup();
    saveTaskAttributes('task_waiting', { type: 'project' });
    const baseSource = harness.details.task_risk!.sourceContexts[0]!;
    harness.details.task_risk!.sourceContexts = [
      baseSource,
      { ...baseSource, id: 'source_2', title: 'CEO 批注', updatedAt: '2026-01-02T00:00:00.000Z' },
      { ...baseSource, id: 'source_3', title: '法务意见', updatedAt: '2026-01-03T00:00:00.000Z' },
      { ...baseSource, id: 'source_4', title: '财务复核', updatedAt: '2026-01-04T00:00:00.000Z' },
    ];
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.dblClick(await screen.findByText('董事会材料修订'));

    expect(await screen.findByText('工作台')).toBeTruthy();
    expect(screen.getByRole('button', { name: '执行' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '来源' })).toBeTruthy();
    expect(await screen.findByText('完成标准')).toBeTruthy();
    expect(screen.getByText('0/1')).toBeTruthy();
    expect(screen.getByText('下一项：确认最终材料')).toBeTruthy();
    expect(screen.getByLabelText('推进依据')).toBeTruthy();
    expect(screen.getByText('Priority Lane · Escalate now')).toBeTruthy();
    expect(screen.getByText('关键来源 4')).toBeTruthy();
    expect(screen.getAllByText('Run 1').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^Runs$/ })).toBeNull();
    expect(await screen.findByText('自检查记录')).toBeTruthy();
    expect(screen.getByText(/Step 检查当前采用轻量规则引擎/)).toBeTruthy();
    expect(screen.getByText(/对照执行状态、结果记录和已确认工作习惯/)).toBeTruthy();
    expect(screen.getByText(/失败自动修正上限 2 次/)).toBeTruthy();
    expect(screen.getByText(/标明轻量规则对照或验证子 Agent 来源/)).toBeTruthy();
    expect(screen.getAllByText('Run 1').length).toBeGreaterThan(0);
    await user.click(await screen.findByText(/Run #1 · 已完成/));
    expect(await screen.findByText('Step 1')).toBeTruthy();
    expect(await screen.findByText('Run 验证通过')).toBeTruthy();
    expect(await screen.findAllByText('验证子 Agent')).toHaveLength(2);
    expect(await screen.findByText('整理反馈')).toBeTruthy();
    expect(await screen.findByText('检查通过')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /重新生成/ }));
    expect(await screen.findByText(/最近 Run 结论：Run 验证通过/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '来源' }));
    expect(await screen.findByText('董事会反馈邮件')).toBeTruthy();
    expect(screen.getByText('关键来源')).toBeTruthy();
    expect(screen.getByText('最近更新：1/4')).toBeTruthy();
    expect(screen.getByText(/AI 上下文优先读取最多 3 条关键来源/)).toBeTruthy();
    expect(screen.getByText(/已标记 4 条关键来源；最近更新的 3 条会优先进入 AI 上下文/)).toBeTruthy();
    expect(screen.getByText(/设为关键或归档会影响后续任务上下文/)).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: '取消关键' })[0]!);
    await waitFor(() => {
      expect(harness.api.updateSourceContext).toHaveBeenCalledWith({
        id: 'source_1',
        isKey: false,
      });
    });
    await user.click(screen.getAllByRole('button', { name: '归档' })[0]!);
    await waitFor(() => {
      expect(harness.api.archiveSourceContext).toHaveBeenCalledWith('source_1');
    });
    expect(await screen.findByText('CEO 批注')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '产物' }));
    expect(await screen.findByText('工作文件夹产物')).toBeTruthy();
    expect(screen.getByText('可内联编辑')).toBeTruthy();
    expect(screen.getByText(/任务产出的持久存储/)).toBeTruthy();
    expect(screen.getByText(/仅 Markdown \/ 纯文本内联编辑/)).toBeTruthy();
    expect(screen.getByText(/其他格式交给系统默认应用/)).toBeTruthy();
    expect(screen.getAllByText('AI 生成').length).toBeGreaterThan(0);
    await user.click(await screen.findByText('mockup.png'));
    expect(screen.queryByRole('button', { name: '编辑' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '重命名' }));
    expect(await screen.findByText(/此类产物只在 Taskplane 内重命名/)).toBeTruthy();
    expect(screen.queryByDisplayValue('binary image placeholder')).toBeNull();
    await user.click(screen.getByRole('button', { name: '取消' }));
    await user.click(await screen.findByText('report_v1.md'));
    expect(await screen.findByText(/需要补现金流页/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '编辑' }));
    expect(await screen.findByText(/编辑产物会作为自学习观察信号/)).toBeTruthy();
    const artifactEditor = screen.getByDisplayValue(/需要补现金流页/);
    await user.clear(artifactEditor);
    await user.type(artifactEditor, '# 终稿\n\n现金流页已补齐。');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText(/已把本次产物改动方向写入任务记忆/)).toBeTruthy();
    expect(await screen.findByText(/现金流页已补齐/)).toBeTruthy();
    expect(harness.api.createSourceContext).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_risk',
      title: '产物编辑观察',
      kind: 'note',
      isKey: false,
      content: expect.stringContaining('用途：作为任务完成或复盘时的自学习输入'),
      note: '自学习观察：用户编辑了 AI 产物。',
    }));
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
    expect(screen.getByText(/P1 是阻塞或失败/)).toBeTruthy();
    expect(screen.getByText(/P2 是等待、决策和完成检查/)).toBeTruthy();
    expect(screen.getByText(/筛选只影响时间线显示/)).toBeTruthy();
    expect(screen.getByText(/完成检查覆盖已保留为自学习观察/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /P2 需关注/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /P3 记录/ })).toBeTruthy();
    expect(screen.getAllByText('P2').length).toBeGreaterThan(0);
    expect(screen.getByText('完成检查被用户覆盖：0/1 · Run 验证通过')).toBeTruthy();
    expect(screen.getByText(/完成检查未通过：仍有 1 条完成标准未满足/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /P3 记录/ }));
    expect(screen.getByText('任务信息已更新')).toBeTruthy();
    expect(screen.queryByText('完成检查被用户覆盖：0/1 · Run 验证通过')).toBeNull();
    await user.click(screen.getByRole('button', { name: /P2 需关注/ }));
    expect(screen.getByText('完成检查被用户覆盖：0/1 · Run 验证通过')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '执行' }));
    await user.click(screen.getByRole('button', { name: /启动 Run/ }));
    const runInput = await screen.findByPlaceholderText(/给 AI 的指令/);
    expect(screen.getByPlaceholderText(/按任务上下文生成下一步/)).toBeTruthy();
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
    expect(screen.getByText(/周期和触发条件属于任务属性/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '项目型' }));
    expect(screen.getByText(/这个子任务会升级为新的项目型任务/)).toBeTruthy();
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
    expect(screen.getByText(/只有点击保存才会写入模板/)).toBeTruthy();
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
      expect(harness.api.createProcessTemplate).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('收集并确认关键来源：财务复核、法务意见'),
      }));
      expect(harness.api.createProcessTemplate).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.not.stringContaining('董事会反馈邮件'),
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

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: '+ 新建任务' }));
    await user.type(await screen.findByPlaceholderText(/任务标题/), '董事会材料修订复盘');
    expect(await screen.findByText('可参考流程模板')).toBeTruthy();
    expect(screen.getAllByText('「董事会材料修订」流程模板').length).toBeGreaterThan(0);
    expect(screen.getByText(/不会自动套用/)).toBeTruthy();
  });

  it('keeps Step checks visible while hiding Run checks when self-check is disabled', async () => {
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      featureFlags: {
        enableScheduler: false,
        enableProviderNativeToolCalls: true,
        enableSandboxCodingAgent: false,
        enableSandboxPatchPromotionApply: false,
        enableSelfCheck: false,
        enableSelfLearn: true,
        selfCheckRetryLimit: 2,
      },
    }));
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.dblClick(await screen.findByText('董事会材料修订'));

    expect(await screen.findByText('Run 检查已关闭')).toBeTruthy();
    expect(screen.getByText(/Step 检查当前采用轻量规则引擎/)).toBeTruthy();
    await user.click(await screen.findByText(/Run #1 · 已完成/));
    expect(await screen.findByText('Step 1')).toBeTruthy();
    expect(await screen.findByText('检查通过')).toBeTruthy();
    expect(screen.getByText(/Step 级轻量对照仍会保留/)).toBeTruthy();
    expect(screen.queryByText('Run 验证通过')).toBeNull();
  });

  it('saves SOP templates without creating work habits when self-learn is disabled', async () => {
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      featureFlags: {
        enableScheduler: false,
        enableProviderNativeToolCalls: true,
        enableSandboxCodingAgent: false,
        enableSandboxPatchPromotionApply: false,
        enableSelfCheck: true,
        enableSelfLearn: false,
        selfCheckRetryLimit: 2,
      },
    }));
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.dblClick(await screen.findByText('董事会材料修订'));
    await user.click(screen.getByTitle('更多操作'));
    await user.click(await screen.findByRole('button', { name: '提取流程模板' }));

    expect(await screen.findByText(/自学习已关闭，不会生成新的工作习惯记录/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '保存为模板' }));

    await waitFor(() => {
      expect(harness.api.createProcessTemplate).toHaveBeenCalledWith(expect.objectContaining({
        title: '「董事会材料修订」流程模板',
        kind: 'sop',
      }));
      expect(harness.api.applyProcessTemplate).toHaveBeenCalledWith({
        taskId: 'task_risk',
        templateId: 'process_template_sop',
        note: '从任务工作台提取并保存的 SOP 模板',
      });
    });
    expect(harness.api.recordSopTemplateHabit).not.toHaveBeenCalled();
  });
});
