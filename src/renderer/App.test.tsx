// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { HomeBriefData, HomeSourceContextRecord } from '@shared/types/brief';
import type { DecisionRecord } from '@shared/types/decision';
import type { ElectronApi } from '@shared/types/ipc';
import type {
  AppliedProcessTemplateRecord,
  ProcessTemplateRecord,
} from '@shared/types/process-template';
import type { RunRecord } from '@shared/types/run';
import type { AiConfigStatus } from '@shared/types/settings';
import type { SourceContextRecord } from '@shared/types/source-context';
import type { TaskDetail, TaskListItemRecord, TaskRecord } from '@shared/types/task';
import type { ArtifactRecord } from '@shared/types/artifact';
import type { WaitingItemRecord } from '@shared/types/waiting-item';
import { App } from './App';

function buildTaskRecord(partial: Partial<TaskListItemRecord>): TaskListItemRecord {
  return {
    id: partial.id ?? 'task_1',
    title: partial.title ?? 'Task',
    summary: partial.summary ?? null,
    state: partial.state ?? 'planned',
    nextStep: partial.nextStep ?? null,
    waitingReason: partial.waitingReason ?? null,
    activeWaitingItem: partial.activeWaitingItem ?? null,
    riskLevel: partial.riskLevel ?? 'none',
    riskNote: partial.riskNote ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildWaitingItem(partial: Partial<WaitingItemRecord>): WaitingItemRecord {
  return {
    id: partial.id ?? 'waiting_1',
    taskId: partial.taskId ?? 'task_1',
    reason: partial.reason ?? 'Waiting',
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    resolvedAt: partial.resolvedAt ?? null,
  };
}

function buildTaskDetail(task: TaskListItemRecord): TaskDetail {
  return {
    ...task,
    resumeCard: {
      summary: `这条任务目前处于 ${task.state}。建议先做：${task.nextStep ?? '先补一个明确的下一步。'}`,
      currentState: `状态：${task.state}`,
      latestChange: '最近没有新的生命周期变化。',
      latestChangeAction: {
        label: null,
        targetType: null,
        targetId: null,
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
      nextSuggestedMove: task.nextStep ?? '先补一个明确的下一步。',
    },
    artifacts: [],
    sourceContexts: [],
    processTemplates: [],
    availableProcessTemplates: [],
    timeline: [],
  };
}

function buildProcessTemplate(
  partial: Partial<ProcessTemplateRecord>,
): ProcessTemplateRecord {
  return {
    id: partial.id ?? 'process_template_1',
    title: partial.title ?? 'Outreach skill',
    summary: partial.summary ?? 'Use the outreach workflow',
    content: partial.content ?? '1. Review sources\n2. Draft outreach',
    kind: partial.kind ?? 'skill',
    tags: partial.tags ?? ['outreach'],
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    archivedAt: partial.archivedAt ?? null,
  };
}

function buildAppliedProcessTemplate(
  partial: Partial<AppliedProcessTemplateRecord>,
): AppliedProcessTemplateRecord {
  const template = buildProcessTemplate(partial);

  return {
    ...template,
    bindingId: partial.bindingId ?? 'task_process_binding_1',
    taskId: partial.taskId ?? 'task_1',
    bindingStatus: partial.bindingStatus ?? 'active',
    bindingNote: partial.bindingNote ?? null,
    boundAt: partial.boundAt ?? '2026-01-01T00:00:00.000Z',
    bindingUpdatedAt: partial.bindingUpdatedAt ?? '2026-01-01T00:00:00.000Z',
    removedAt: partial.removedAt ?? null,
  };
}

function buildSourceContext(partial: Partial<SourceContextRecord>): SourceContextRecord {
  return {
    id: partial.id ?? 'source_context_1',
    taskId: partial.taskId ?? 'task_1',
    title: partial.title ?? 'Reference doc',
    kind: partial.kind ?? 'doc',
    isKey: partial.isKey ?? false,
    uri: partial.uri ?? 'https://example.com/reference',
    content: partial.content ?? null,
    note: partial.note ?? 'Helpful source',
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    archivedAt: partial.archivedAt ?? null,
  };
}

function buildHomeSourceContext(
  partial: Partial<HomeSourceContextRecord>,
): HomeSourceContextRecord {
  return {
    id: partial.id ?? 'source_context_home_1',
    taskId: partial.taskId ?? 'task_1',
    taskTitle: partial.taskTitle ?? 'Task',
    title: partial.title ?? 'Reference doc',
    kind: partial.kind ?? 'doc',
    isKey: partial.isKey ?? false,
    uri: partial.uri ?? 'https://example.com/reference',
    note: partial.note ?? 'Helpful source',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildArtifact(partial: Partial<ArtifactRecord>): ArtifactRecord {
  return {
    id: partial.id ?? 'artifact_1',
    taskId: partial.taskId ?? 'task_1',
    sourceType: partial.sourceType ?? 'run',
    sourceId: partial.sourceId ?? 'run_1',
    kind: partial.kind ?? 'run_output',
    title: partial.title ?? 'draft output',
    content: partial.content ?? 'Generated output',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildRunRecord(partial: Partial<RunRecord>): RunRecord {
  return {
    id: partial.id ?? 'run_1',
    taskId: partial.taskId ?? 'task_1',
    type: partial.type ?? 'draft',
    status: partial.status ?? 'completed',
    instructions: partial.instructions ?? null,
    output: partial.output ?? null,
    outputSource: partial.outputSource ?? null,
    failureReason: partial.failureReason ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('App UI flow', () => {
  const waitingTask = buildTaskRecord({
    id: 'task_waiting',
    title: 'Waiting task',
    state: 'waiting_external',
    waitingReason: 'Waiting for reply',
    activeWaitingItem: buildWaitingItem({
      taskId: 'task_waiting',
      reason: 'Waiting for reviewer confirmation',
    }),
    nextStep: 'Follow up tomorrow',
  });
  const riskTask = buildTaskRecord({
    id: 'task_risk',
    title: 'High risk task',
    state: 'running',
    summary: 'Needs attention',
    nextStep: 'Escalate to owner',
    riskLevel: 'high',
    riskNote: 'Deadline slipping',
  });

  const taskDetails: Record<string, TaskDetail> = {
    [waitingTask.id]: buildTaskDetail(waitingTask),
    [riskTask.id]: buildTaskDetail(riskTask),
  };

  const aiStatus: AiConfigStatus = {
    configured: false,
    apiKeyStored: false,
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-latest',
    updatedAt: '2026-01-01T00:00:00.000Z',
    configPath: '/tmp/config.json',
    featureFlags: {
      enableScheduler: false,
    },
  };

  const briefData: HomeBriefData = {
    activeTaskCount: 2,
    pendingDecisionCount: 1,
    completedTaskCount: 0,
    recentRunCount: 1,
    waitingTaskCount: 1,
    highRiskTaskCount: 1,
    missingNextStepTaskCount: 0,
    recentTasks: [waitingTask, riskTask],
    waitingTasks: [waitingTask],
    highRiskTasks: [riskTask],
    missingNextStepTasks: [],
    pendingDecisions: [
      {
        id: 'decision_1',
        taskId: riskTask.id,
        title: 'Approve escalation path',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    recommendedActions: [
      {
        id: `risk:${riskTask.id}`,
        label: `优先处理高风险任务：${riskTask.title}`,
        reason: riskTask.riskNote ?? 'High risk',
        taskId: riskTask.id,
        priority: 'high',
        intent: {
          type: 'focus_risk_review',
          focusArea: 'detail',
          prefillNextStep: '处理当前风险并确认是否需要降级：Deadline slipping',
          prefillRiskLevel: 'high',
          prefillRiskNote: 'Deadline slipping',
        },
      },
      {
        id: 'artifact:artifact_home_1',
        label: `基于最新产物继续推进：${riskTask.title}`,
        reason: 'draft output 已生成，可继续整理、扩展或发起下一轮执行。',
        taskId: riskTask.id,
        priority: 'low',
        intent: {
          type: 'continue_from_artifact',
          focusArea: 'detail',
          prefillNextStep: '基于产物继续推进：draft output',
          prefillRunInstructions: '请基于这份已有产物继续扩展、改写或整理：Escalation draft for the owner.',
        },
      },
    ],
    recentArtifacts: [
      buildArtifact({
        taskId: riskTask.id,
        sourceId: 'run_home_1',
        title: 'draft output',
        content: 'Escalation draft for the owner.',
      }),
    ],
    recentSourceContexts: [
      buildHomeSourceContext({
        id: 'source_context_home_1',
        taskId: riskTask.id,
        taskTitle: riskTask.title,
        title: 'Owner escalation memo',
        kind: 'doc',
        uri: 'https://example.com/escalation-memo',
        note: 'Contains the latest escalation framing.',
        updatedAt: '2026-01-01T00:45:00.000Z',
      }),
    ],
    recentTaskResumes: [
      {
        taskId: riskTask.id,
        taskTitle: riskTask.title,
        currentState: '状态：running · 风险：high · Deadline slipping',
        latestChange: '最近决策动态：Approve escalation path · approved',
        latestChangeAction: {
          label: '查看 Decision',
          targetType: 'decision',
          targetId: 'decision_2',
        },
        keySourceTitle: 'Owner escalation memo',
        keySourceReason: '材料架中的关键来源：Contains the latest escalation framing.',
        currentMethodTitle: 'Risk review skill',
        currentMethodReason: '当前方法最近用于执行：风险高且需要先复盘 blocker。',
        nextSuggestedMove: '已获批准，继续推进：Approve escalation path',
        sourceContextId: 'source_context_home_1',
        contextActionLabel: '继续推进任务',
        contextActionIntent: {
          type: 'focus_next_step',
          focusArea: 'detail',
          prefillNextStep: '已获批准，继续推进：Approve escalation path',
        },
      },
      {
        taskId: waitingTask.id,
        taskTitle: waitingTask.title,
        currentState: '状态：waiting_external · 等待：Waiting for legal review',
        latestChange: '最近没有新的关键变化。',
        latestChangeAction: {
          label: null,
          targetType: null,
          targetId: null,
        },
        keySourceTitle: null,
        keySourceReason: null,
        currentMethodTitle: null,
        currentMethodReason: null,
        nextSuggestedMove: '跟进并确认是否解除等待：Waiting for legal review',
        sourceContextId: null,
        contextActionLabel: '跟进等待项',
        contextActionIntent: {
          type: 'focus_waiting_follow_up',
          focusArea: 'detail',
          prefillNextStep: '跟进并确认是否解除等待：Waiting for legal review',
        },
      },
    ],
    recentActivity: [
      {
        id: 'decision:decision_2',
        sourceType: 'decision',
        sourceId: 'decision_2',
        taskId: riskTask.id,
        taskTitle: riskTask.title,
        title: 'Approve escalation path',
        status: 'approved',
        updatedAt: '2026-01-01T01:00:00.000Z',
      },
      {
        id: 'decision:decision_3',
        sourceType: 'decision',
        sourceId: 'decision_3',
        taskId: riskTask.id,
        taskTitle: riskTask.title,
        title: 'Follow up compliance sign-off',
        status: 'deferred',
        updatedAt: '2026-01-01T00:30:00.000Z',
      },
      {
        id: 'run:run_1',
        sourceType: 'run',
        sourceId: 'run_1',
        taskId: riskTask.id,
        taskTitle: riskTask.title,
        title: 'draft',
        status: 'failed',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'run:run_2',
        sourceType: 'run',
        sourceId: 'run_2',
        taskId: riskTask.id,
        taskTitle: riskTask.title,
        title: 'summarize',
        status: 'completed',
        updatedAt: '2025-12-31T23:30:00.000Z',
      },
    ],
    recentBriefSnapshots: [],
    schedulerStatus: {
      enabled: false,
      running: false,
      lastBriefAt: null,
      lastRunSweepAt: null,
    },
  };

  const decisions: DecisionRecord[] = [
    briefData.pendingDecisions[0]!,
    {
      id: 'decision_2',
      taskId: riskTask.id,
      title: 'Approve escalation path',
      status: 'approved',
      createdAt: '2026-01-01T00:30:00.000Z',
      updatedAt: '2026-01-01T01:00:00.000Z',
    },
  ];

  const runs: RunRecord[] = [
    buildRunRecord({
      id: 'run_1',
      taskId: riskTask.id,
      type: 'draft',
      status: 'failed',
      outputSource: 'system',
      failureReason: 'Executor exploded',
    }),
  ];

  const createdDecision = {
    id: 'decision_created',
    taskId: riskTask.id,
    title: 'Escalate budget approval now',
    status: 'pending' as const,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };

  const createdRun = buildRunRecord({
    id: 'run_created',
    taskId: riskTask.id,
    type: 'summarize',
    status: 'pending',
    instructions: 'Summarize blockers before escalation',
    updatedAt: '2026-01-02T00:00:00.000Z',
  });

  const mockApi: ElectronApi = {
    ping: vi.fn().mockResolvedValue({
      message: 'pong from main',
      timestamp: '2026-01-01T00:00:00.000Z',
    }),
    getAiConfigStatus: vi.fn().mockResolvedValue(aiStatus),
    setAiConfig: vi.fn(),
    listTasks: vi.fn().mockResolvedValue([waitingTask, riskTask]),
    createTask: vi.fn(),
    getTaskDetail: vi.fn(async (taskId: string) => taskDetails[taskId] ?? null),
    updateTask: vi.fn(),
    transitionTask: vi.fn(),
    createSourceContext: vi.fn().mockImplementation(async (input) =>
      buildSourceContext({
        taskId: input.taskId,
        title: input.title,
        kind: input.kind,
        uri: input.uri ?? null,
        content: input.content ?? null,
        note: input.note ?? null,
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    ),
    updateSourceContext: vi.fn().mockImplementation(async (input) =>
      buildSourceContext({
        id: input.id,
        taskId: riskTask.id,
        title: 'Reference doc',
        kind: 'doc',
        uri: 'https://example.com/reference',
        content: null,
        note: input.note ?? 'Updated note',
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    ),
    archiveSourceContext: vi.fn().mockImplementation(async (id) =>
      buildSourceContext({
        id,
        taskId: riskTask.id,
        status: 'archived',
        archivedAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    ),
    createProcessTemplate: vi.fn().mockImplementation(async (input) =>
      buildProcessTemplate({
        title: input.title,
        summary: input.summary ?? null,
        content: input.content,
        kind: input.kind,
        tags: input.tags ?? [],
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    ),
    updateProcessTemplate: vi.fn().mockImplementation(async (input) =>
      buildProcessTemplate({
        id: input.id,
        title: input.title ?? 'Outreach skill',
        summary: input.summary ?? 'Updated summary',
        content: input.content ?? '1. Review sources\n2. Draft outreach',
        kind: input.kind ?? 'skill',
        tags: input.tags ?? ['outreach'],
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    ),
    archiveProcessTemplate: vi.fn().mockImplementation(async (id) =>
      buildProcessTemplate({
        id,
        status: 'archived',
        archivedAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    ),
    applyProcessTemplate: vi.fn().mockImplementation(async (input) =>
      buildAppliedProcessTemplate({
        id: input.templateId,
        taskId: input.taskId,
      }),
    ),
    removeProcessTemplate: vi.fn().mockImplementation(async (bindingId) =>
      buildAppliedProcessTemplate({
        bindingId,
        bindingStatus: 'removed',
        removedAt: '2026-01-02T00:00:00.000Z',
      }),
    ),
    listDecisions: vi.fn().mockResolvedValue(decisions),
    draftDecision: vi.fn().mockResolvedValue({
      taskId: riskTask.id,
      title: 'Approve escalation path',
      rationale: 'Current task needs explicit approval before budget escalation.',
      source: 'ai',
      selectedTemplateIds: ['process_template_1'],
      selectedTemplateTitles: ['Approval skill'],
      selectionReason: 'This task is awaiting stakeholder approval.',
    }),
    createDecision: vi.fn().mockResolvedValue(createdDecision),
    actOnDecision: vi.fn(),
    getHomeBrief: vi.fn().mockResolvedValue(briefData),
    listRuns: vi.fn().mockResolvedValue(runs),
    getRunDetail: vi.fn(async (runId: string) => runs.find((run) => run.id === runId) ?? null),
    triggerRun: vi.fn().mockResolvedValue(createdRun),
    subscribeToEvents: vi.fn().mockImplementation(() => () => {}),
  };

  beforeEach(() => {
    window.location.hash = '#home';
    window.api = mockApi;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.location.hash = '';
  });

  it('opens the related task and prefills detail guidance when a risk action is clicked', async () => {
    const user = userEvent.setup();

    render(<App />);

    const actionButton = await screen.findByRole('button', {
      name: /优先处理高风险任务：High risk task/i,
    });

    await user.click(actionButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect(window.location.hash).toBe('#tasks');
    expect(mockApi.getTaskDetail).toHaveBeenCalledWith(riskTask.id);
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '处理当前风险并确认是否需要降级：Deadline slipping',
    );
    expect((screen.getByLabelText('Risk Note') as HTMLTextAreaElement).value).toBe('Deadline slipping');
  });

  it('prefills continuation inputs when an artifact action is clicked from home', async () => {
    const user = userEvent.setup();

    render(<App />);

    const actionButton = await screen.findByRole('button', {
      name: /基于最新产物继续推进：High risk task/i,
    });

    await user.click(actionButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '基于产物继续推进：draft output',
    );
    expect((screen.getByLabelText('附加要求') as HTMLTextAreaElement).value).toContain(
      'Escalation draft for the owner.',
    );
  });

  it('prefers active waiting items in waiting surfaces', async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText('Waiting for reviewer confirmation');
    expect(
      screen.getByText('active waiting item · since 2026-01-01T00:00:00.000Z'),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /waiting task/i }));
    await screen.findByRole('heading', { name: 'Waiting task' });

    expect(screen.getAllByText('Waiting for reviewer confirmation').length).toBeGreaterThan(0);
    expect(
      screen.getByText('waiting item · active · since 2026-01-01T00:00:00.000Z'),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Current Waiting Item' })).toBeTruthy();
    expect(screen.getByText('Started at 2026-01-01T00:00:00.000Z')).toBeTruthy();
    expect(screen.getByText("Linked to the task's current waiting state.")).toBeTruthy();
  });

  it('shows a task resume card at the top of the current snapshot', async () => {
    const user = userEvent.setup();

    const resumeDetail = buildTaskDetail(riskTask);
    resumeDetail.resumeCard = {
      summary:
        '这条任务目前处于 running，且存在高风险“Deadline slipping”。 最近一次执行失败：Model overloaded。 当前最关键的来源材料是“Owner escalation memo”。 当前采用的方法模板是“Risk review skill”。 建议先做：处理当前风险并确认是否需要降级：Deadline slipping',
      currentState: '状态：running · 风险：high · Deadline slipping',
      latestChange: '最近一次执行失败：Model overloaded。',
      latestChangeAction: {
        label: '查看 Run',
        targetType: 'run',
        targetId: 'run_resume_latest',
      },
      keySource: {
        sourceContextId: 'source_context_resume',
        title: 'Owner escalation memo',
        detail: 'Contains the latest owner-facing language',
        priorityReason: '当前在材料架中被标记为关键来源：Contains the latest owner-facing language',
      },
      currentMethod: {
        templateId: 'process_template_resume',
        title: 'Risk review skill',
        detail: 'Prioritize blockers before drafting',
        selectionReason: '当前任务最近采用该方法：风险高且存在阻塞，适合优先参考该方法。',
      },
      nextSuggestedMove: '处理当前风险并确认是否需要降级：Deadline slipping',
    };

    const resumeApi: ElectronApi = {
      ...mockApi,
      getTaskDetail: vi.fn(async (taskId: string) => (taskId === riskTask.id ? resumeDetail : null)),
    };

    window.api = resumeApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /high risk task/i }));
    await screen.findByRole('heading', { name: 'High risk task' });

    const resumeSection = screen.getByRole('heading', { name: 'Task Resume Card' }).closest('.detail-card-group');

    expect(resumeSection).not.toBeNull();
    expect(
      within(resumeSection as HTMLElement).getAllByText(/最近一次执行失败：Model overloaded/).length,
    ).toBeGreaterThan(0);
    expect(within(resumeSection as HTMLElement).getByText('Owner escalation memo')).toBeTruthy();
    expect(
      within(resumeSection as HTMLElement).getByText(
        '当前在材料架中被标记为关键来源：Contains the latest owner-facing language',
      ),
    ).toBeTruthy();
    expect(within(resumeSection as HTMLElement).getByText('Risk review skill')).toBeTruthy();
    expect(
      within(resumeSection as HTMLElement).getByText(
        '当前任务最近采用该方法：风险高且存在阻塞，适合优先参考该方法。',
      ),
    ).toBeTruthy();
    expect(
      within(resumeSection as HTMLElement).getByText(
        '处理当前风险并确认是否需要降级：Deadline slipping',
      ),
    ).toBeTruthy();
  });

  it('uses task resume card actions to focus context and prefill the next step', async () => {
    const user = userEvent.setup();

    const resumeTask = buildTaskRecord({
      id: 'task_resume_actions',
      title: 'Resume action task',
      state: 'planned',
      nextStep: 'Old next step',
    });

    const resumeDetail = buildTaskDetail(resumeTask);
    resumeDetail.sourceContexts = [
      buildSourceContext({
        id: 'source_context_resume_action',
        taskId: resumeTask.id,
        title: 'Launch reference memo',
        isKey: true,
        note: 'Most important source',
      }),
    ];
    resumeDetail.processTemplates = [
      buildAppliedProcessTemplate({
        id: 'process_template_resume_action',
        taskId: resumeTask.id,
        title: 'Launch workflow',
        summary: 'Use the launch workflow',
      }),
    ];
    resumeDetail.resumeCard = {
      summary: 'Resume summary',
      currentState: '状态：planned',
      latestChange: '最近更新了来源材料：Launch reference memo。',
      latestChangeAction: {
        label: '查看来源',
        targetType: 'source_context',
        targetId: 'source_context_resume_action',
      },
      keySource: {
        sourceContextId: 'source_context_resume_action',
        title: 'Launch reference memo',
        detail: 'Most important source',
        priorityReason: '当前在材料架中被标记为关键来源：Most important source',
      },
      currentMethod: {
        templateId: 'process_template_resume_action',
        title: 'Launch workflow',
        detail: 'Use the launch workflow',
        selectionReason: null,
      },
      nextSuggestedMove: '基于来源材料继续推进：Launch reference memo',
    };

    const resumeApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([resumeTask]),
      getTaskDetail: vi.fn(async (taskId: string) => (taskId === resumeTask.id ? resumeDetail : null)),
    };

    window.api = resumeApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /resume action task/i }));
    await screen.findByRole('heading', { name: 'Resume action task' });

    const resumeSection = screen.getByRole('heading', { name: 'Task Resume Card' }).closest('.detail-card-group');

    expect(resumeSection).not.toBeNull();

    await user.click(
      within(resumeSection as HTMLElement).getByRole('button', { name: '查看关键来源' }),
    );
    expect((screen.getByLabelText('来源标题') as HTMLInputElement).value).toBe(
      'Launch reference memo',
    );

    await user.click(
      within(resumeSection as HTMLElement).getByRole('button', { name: '打开当前方法模板' }),
    );
    expect((screen.getByLabelText('模板标题') as HTMLInputElement).value).toBe('Launch workflow');

    await user.click(
      within(resumeSection as HTMLElement).getByRole('button', { name: '采用建议下一步' }),
    );
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '基于来源材料继续推进：Launch reference memo',
    );
  });

  it('opens latest-change context from the task resume card', async () => {
    const user = userEvent.setup();

    const resumeTask = buildTaskRecord({
      id: 'task_resume_latest',
      title: 'Resume latest task',
      state: 'planned',
    });

    const resumeDetail = buildTaskDetail(resumeTask);
    resumeDetail.resumeCard = {
      summary: 'Resume summary',
      currentState: '状态：planned',
      latestChange: '最近一条决策已获批准：Approve launch。',
      latestChangeAction: {
        label: '查看 Decision',
        targetType: 'decision',
        targetId: 'decision_resume_latest',
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
      nextSuggestedMove: '已获批准：Approve launch，继续推进下一步。',
    };

    const resumeApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([resumeTask]),
      getTaskDetail: vi.fn(async (taskId: string) => (taskId === resumeTask.id ? resumeDetail : null)),
      listDecisions: vi.fn().mockResolvedValue([
        {
          id: 'decision_resume_latest',
          taskId: resumeTask.id,
          title: 'Approve launch',
          status: 'approved',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T01:00:00.000Z',
        },
      ]),
    };

    window.api = resumeApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /resume latest task/i }));
    await screen.findByRole('heading', { name: 'Resume latest task' });

    const resumeSection = screen.getByRole('heading', { name: 'Task Resume Card' }).closest('.detail-card-group');
    expect(resumeSection).not.toBeNull();

    await user.click(
      within(resumeSection as HTMLElement).getByRole('button', { name: '查看 Decision' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '待拍板事项' })).toBeTruthy();
    });
    expect(screen.getAllByText('Approve launch').length).toBeGreaterThan(0);
  });

  it('opens waiting tasks from home key signals with follow-up guidance', async () => {
    const user = userEvent.setup();

    render(<App />);

    const waitingSignalButton = await screen.findByRole('button', {
      name: /Waiting task.*waiting_external.*Waiting for reviewer confirmation/i,
    });

    await user.click(waitingSignalButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Waiting task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '跟进并确认是否解除等待：Waiting for reviewer confirmation',
    );
  });

  it('opens high-risk tasks from home key signals with risk review guidance', async () => {
    const user = userEvent.setup();

    render(<App />);

    const riskSignalButton = (await screen.findAllByText('High risk task'))
      .map((node) => node.closest('button'))
      .find((button) => button?.className.includes('task-card-danger task-card-button'));
    expect(riskSignalButton).toBeTruthy();

    await user.click(riskSignalButton!);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '处理当前风险并确认是否需要降级：Deadline slipping',
    );
    expect((screen.getByLabelText('Risk Note') as HTMLTextAreaElement).value).toBe(
      'Deadline slipping',
    );
  });

  it('offers a direct action to resolve the current waiting item', async () => {
    const user = userEvent.setup();

    const resolveWaitingApi: ElectronApi = {
      ...mockApi,
      transitionTask: vi.fn().mockResolvedValue(
        buildTaskRecord({
          ...waitingTask,
          state: 'planned',
          waitingReason: null,
          activeWaitingItem: null,
          updatedAt: '2026-01-02T00:00:00.000Z',
        }),
      ),
    };

    window.api = resolveWaitingApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /waiting task/i }));
    await screen.findByRole('heading', { name: 'Waiting task' });

    await user.click(screen.getByRole('button', { name: '解除等待' }));

    await waitFor(() => {
      expect(resolveWaitingApi.transitionTask).toHaveBeenCalledWith({
        id: waitingTask.id,
        nextState: 'planned',
        waitingReason: undefined,
      });
    });
  });

  it('shows recent artifacts on task detail', async () => {
    const user = userEvent.setup();

    const artifactTask = buildTaskRecord({
      id: 'task_artifact',
      title: 'Artifact task',
      state: 'running',
    });

    const artifactApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([artifactTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== artifactTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(artifactTask),
          artifacts: [
            buildArtifact({
              taskId: artifactTask.id,
              sourceId: 'run_artifact_1',
              title: 'draft output',
              content: 'Drafted message to the customer.',
            }),
          ],
        };
      }),
    };

    window.api = artifactApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /artifact task/i }));
    await screen.findByRole('heading', { name: 'Artifact task' });

    expect(screen.getByRole('heading', { name: 'Recent Artifact' })).toBeTruthy();
    expect(screen.getByText('draft output')).toBeTruthy();
    expect(screen.getByText('source: run · run_artifact_1')).toBeTruthy();
    expect(screen.getByText('Drafted message to the customer.')).toBeTruthy();
  });

  it('shows recent artifacts on the home brief', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Recent Artifacts' })).toBeTruthy();
    expect(screen.getByText('draft output')).toBeTruthy();
    expect(screen.getByText('source: run · run_home_1')).toBeTruthy();
    expect(screen.getByText('Escalation draft for the owner.')).toBeTruthy();
  });

  it('opens artifact continuation from the home artifact list', async () => {
    const user = userEvent.setup();

    render(<App />);

    const artifactButton = await screen.findByRole('button', {
      name: /draft output.*run_output.*source: run/i,
    });

    await user.click(artifactButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '基于产物继续推进：draft output',
    );
    expect((screen.getByLabelText('附加要求') as HTMLTextAreaElement).value).toContain(
      'Escalation draft for the owner.',
    );
  });

  it('opens key source materials from home and focuses the source context editor', async () => {
    const user = userEvent.setup();

    const sourceTask = buildTaskRecord({
      id: 'task_source_home',
      title: 'Source home task',
      state: 'planned',
      nextStep: '整理来源材料',
    });

    const sourceItem = buildSourceContext({
      id: 'source_context_home_focus',
      taskId: sourceTask.id,
      title: 'Partner domain list',
      kind: 'website_list',
      uri: null,
      note: '外链建设的目标站点列表',
      content: 'example.com\nsample.org',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const sourceHomeApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([sourceTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== sourceTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(sourceTask),
          sourceContexts: [sourceItem],
        };
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 1,
        waitingTaskCount: 0,
        highRiskTaskCount: 0,
        missingNextStepTaskCount: 0,
        recentTasks: [sourceTask],
        waitingTasks: [],
        highRiskTasks: [],
        missingNextStepTasks: [],
        recommendedActions: [],
        recentArtifacts: [],
        recentSourceContexts: [
          buildHomeSourceContext({
            id: sourceItem.id,
            taskId: sourceTask.id,
            taskTitle: sourceTask.title,
            title: sourceItem.title,
            kind: sourceItem.kind,
            uri: sourceItem.uri,
            note: sourceItem.note,
            updatedAt: sourceItem.updatedAt,
          }),
        ],
        recentActivity: [],
      }),
    };

    window.api = sourceHomeApi;

    render(<App />);

    const sourceButton = await screen.findByRole('button', {
      name: /Partner domain list.*website_list.*task: Source home task/i,
    });
    await user.click(sourceButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Source home task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('来源标题') as HTMLInputElement).value).toBe('Partner domain list');
    expect((screen.getByLabelText('来源类型') as HTMLSelectElement).value).toBe('website_list');
    expect((screen.getByLabelText('说明') as HTMLTextAreaElement).value).toBe('外链建设的目标站点列表');
    expect((screen.getByLabelText('补充内容') as HTMLTextAreaElement).value).toContain('example.com');
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '基于来源材料继续推进：Partner domain list',
    );
  });

  it('opens source-context recommended actions with source-focused guidance', async () => {
    const user = userEvent.setup();

    const sourceTask = buildTaskRecord({
      id: 'task_source_action',
      title: 'Source action task',
      state: 'planned',
      nextStep: null,
    });

    const sourceItem = buildSourceContext({
      id: 'source_context_action',
      taskId: sourceTask.id,
      title: 'Outreach research notes',
      kind: 'note',
      uri: null,
      note: '先看这些资料再补下一步',
      content: 'Need to compare domain authority and contactability.',
    });

    const sourceActionApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([sourceTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== sourceTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(sourceTask),
          sourceContexts: [sourceItem],
        };
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 1,
        waitingTaskCount: 0,
        highRiskTaskCount: 0,
        missingNextStepTaskCount: 1,
        recentTasks: [sourceTask],
        waitingTasks: [],
        highRiskTasks: [],
        missingNextStepTasks: [sourceTask],
        recommendedActions: [
          {
            id: 'source-context:next-step:source_context_action',
            label: `先查看关键来源，再补下一步：${sourceTask.title}`,
            reason: '该任务还缺少明确下一步，先参考来源材料“Outreach research notes”。',
            taskId: sourceTask.id,
            priority: 'medium',
            intent: {
              type: 'focus_source_context',
              focusArea: 'detail',
              sourceContextId: sourceItem.id,
              prefillNextStep: '先吸收来源材料，再补下一步：Outreach research notes',
            },
          },
        ],
        recentArtifacts: [],
        recentSourceContexts: [],
        recentActivity: [],
      }),
    };

    window.api = sourceActionApi;

    render(<App />);

    const actionButton = await screen.findByRole('button', {
      name: /先查看关键来源，再补下一步：Source action task/i,
    });
    await user.click(actionButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Source action task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('来源标题') as HTMLInputElement).value).toBe(
      'Outreach research notes',
    );
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '先吸收来源材料，再补下一步：Outreach research notes',
    );
  });

  it('opens recent activity from home with follow-up guidance', async () => {
    const user = userEvent.setup();

    render(<App />);

    const activityButton = await screen.findByRole('button', {
      name: /Approve escalation path.*approved.*task: High risk task/i,
    });

    await user.click(activityButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '已获批准，继续推进：Approve escalation path',
    );
  });

  it('opens task follow-up directly from home recent activity actions', async () => {
    const user = userEvent.setup();

    render(<App />);

    const actionButton = await screen.findByRole('button', { name: '处理失败结果' });
    await user.click(actionButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect(window.location.hash).toBe('#tasks');
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '检查最近一次 draft run 的失败原因，并决定是否重试。',
    );
  });

  it('opens deferred decision and completed run follow-up actions from home recent activity', async () => {
    const user = userEvent.setup();

    render(<App />);

    const followDecisionButton = await screen.findByRole('button', { name: '跟进拍板进度' });
    await user.click(followDecisionButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '跟进该决策是否可以恢复拍板，或准备替代推进路径。',
    );

    await user.click(screen.getByRole('button', { name: /home/i }));

    const continueRunButton = await screen.findByRole('button', { name: '基于结果继续推进' });
    await user.click(continueRunButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '审阅最近一次 summarize run 的结果，并决定是否继续推进。',
    );
  });

  it('opens decision and run objects directly from home recent activity', async () => {
    const user = userEvent.setup();

    render(<App />);

    const viewDecisionButton = (await screen.findAllByRole('button', { name: '查看 Decision' }))[0];
    await user.click(viewDecisionButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Approve escalation path' })).toBeTruthy();
    });

    expect(window.location.hash).toBe('#decisions');

    await user.click(screen.getByRole('button', { name: /home/i }));

    const viewRunButton = (await screen.findAllByRole('button', { name: '查看 Run' }))[0];
    await user.click(viewRunButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'draft / failed' })).toBeTruthy();
    });

    expect(window.location.hash).toBe('#runs');
    expect(screen.getByText('Executor exploded')).toBeTruthy();
  });

  it('prefills next step and run input from artifact timeline suggestions', async () => {
    const user = userEvent.setup();

    const artifactActionTask = buildTaskRecord({
      id: 'task_timeline_artifact_action',
      title: 'Timeline artifact task',
      state: 'running',
    });

    const artifact = buildArtifact({
      id: 'artifact_action_1',
      taskId: artifactActionTask.id,
      sourceId: 'run_artifact_action_1',
      title: 'draft output',
      content: 'Drafted message to the customer.',
    });

    const artifactActionApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([artifactActionTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== artifactActionTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(artifactActionTask),
          artifacts: [artifact],
          timeline: [
            {
              id: 'timeline_artifact_action',
              taskId: artifactActionTask.id,
              type: 'artifact.created',
              payload: JSON.stringify({
                artifactId: artifact.id,
                sourceType: 'run',
                sourceId: artifact.sourceId,
                kind: artifact.kind,
                title: artifact.title,
              }),
              createdAt: '2026-01-01T01:00:00.000Z',
            },
          ],
        };
      }),
    };

    window.api = artifactActionApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /timeline artifact task/i }));
    await screen.findByRole('heading', { name: 'Timeline artifact task' });

    await user.click(screen.getByRole('button', { name: '基于产物继续推进' }));

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '基于产物继续推进：draft output',
    );
    expect((screen.getByLabelText('附加要求') as HTMLTextAreaElement).value).toContain(
      'Drafted message to the customer.',
    );
  });

  it('submits a quick decision from task detail', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    const riskTaskCard = (await screen.findByText('High risk task')).closest('button');
    expect(riskTaskCard).toBeTruthy();
    await user.click(riskTaskCard!);
    await screen.findByRole('heading', { name: 'High risk task' });

    const decisionTitleInput = screen.getByLabelText('决策标题');
    await user.clear(decisionTitleInput);
    await user.type(decisionTitleInput, 'Escalate budget approval now');

    await user.click(screen.getByRole('button', { name: '提交 Decision' }));

    await waitFor(() => {
      expect(mockApi.createDecision).toHaveBeenCalledWith({
        taskId: riskTask.id,
        title: 'Escalate budget approval now',
      });
    });
  });

  it('drafts a quick decision from task detail', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    const riskTaskCard = (await screen.findByText('High risk task')).closest('button');
    expect(riskTaskCard).toBeTruthy();
    await user.click(riskTaskCard!);
    await screen.findByRole('heading', { name: 'High risk task' });

    const backgroundInput = screen.getByLabelText('拍板背景');
    await user.clear(backgroundInput);
    await user.type(backgroundInput, 'Need stakeholder sign-off');
    await user.click(screen.getByRole('button', { name: '草拟 Decision' }));

    await waitFor(() => {
      expect(mockApi.draftDecision).toHaveBeenCalledWith({
        taskId: riskTask.id,
        note: 'Need stakeholder sign-off',
      });
    });

    expect((screen.getByLabelText('决策标题') as HTMLInputElement).value).toBe(
      'Approve escalation path',
    );
    expect(screen.getByText(/AI 草拟：Current task needs explicit approval before budget escalation\./)).toBeTruthy();
  });

  it('submits a quick run from task detail', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    const riskTaskCard = (await screen.findByText('High risk task')).closest('button');
    expect(riskTaskCard).toBeTruthy();
    await user.click(riskTaskCard!);
    await screen.findByRole('heading', { name: 'High risk task' });

    await user.selectOptions(screen.getByLabelText('Run 类型'), 'summarize');

    const instructionsInput = screen.getByLabelText('附加要求');
    await user.clear(instructionsInput);
    await user.type(instructionsInput, 'Summarize blockers before escalation');

    await user.click(screen.getByRole('button', { name: '触发 Run' }));

    await waitFor(() => {
      expect(mockApi.triggerRun).toHaveBeenCalledWith({
        taskId: riskTask.id,
        type: 'summarize',
        instructions: 'Summarize blockers before escalation',
      });
    });
  });

  it('blocks saving a high-risk task without a risk note', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /waiting task/i }));
    await screen.findByRole('heading', { name: 'Waiting task' });

    await user.selectOptions(screen.getByLabelText('Risk Level'), 'high');
    const riskNoteInput = screen.getByLabelText('Risk Note');
    await user.clear(riskNoteInput);

    await user.click(screen.getByRole('button', { name: '保存详情' }));

    await waitFor(() => {
      expect(screen.getByText('将风险等级设为 high 前，请先填写风险说明。')).toBeTruthy();
    });

    expect(mockApi.updateTask).not.toHaveBeenCalled();
  });

  it('clears the visible risk note when lowering a high-risk task', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole('button', {
      name: /优先处理高风险任务：High risk task/i,
    }));
    await screen.findByRole('heading', { name: 'High risk task' });

    await user.selectOptions(screen.getByLabelText('Risk Level'), 'medium');

    await waitFor(() => {
      expect((screen.getByLabelText('Risk Note') as HTMLTextAreaElement).value).toBe('');
    });
  });

  it('shows failed run detail on the runs page', async () => {
    const user = userEvent.setup();

    const runDetailApi: ElectronApi = {
      ...mockApi,
      getRunDetail: vi.fn(async (runId: string) =>
        runs.find((run) => run.id === runId) ?? null,
      ),
    };

    window.api = runDetailApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    await screen.findByRole('heading', { name: '执行记录' });
    await screen.findByRole('heading', { name: 'Run Queue' });
    await screen.findByText('Current Focus');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'draft / failed' })).toBeTruthy();
    });

    expect(runDetailApi.getRunDetail).toHaveBeenCalledWith('run_1');
    expect(screen.getByText('Executor exploded')).toBeTruthy();
    expect(screen.getByText('system')).toBeTruthy();
  });

  it('shows related task timeline context on the runs page', async () => {
    const user = userEvent.setup();

    const runTimelineApi: ElectronApi = {
      ...mockApi,
      getRunDetail: vi.fn(async (runId: string) =>
        runs.find((run) => run.id === runId) ?? null,
      ),
      getTaskDetail: vi.fn(async (taskId: string) => {
        if (taskId !== riskTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(riskTask),
          timeline: [
            {
              id: 'timeline_run_failed',
              taskId: riskTask.id,
              type: 'task.run_failed',
              payload: JSON.stringify({
                runId: 'run_1',
                failureReason: 'Executor exploded',
              }),
              createdAt: '2026-01-01T02:00:00.000Z',
            },
            {
              id: 'timeline_artifact',
              taskId: riskTask.id,
              type: 'artifact.created',
              payload: JSON.stringify({
                artifactId: 'artifact_1',
                sourceType: 'run',
                sourceId: 'run_1',
                title: 'draft output',
              }),
              createdAt: '2026-01-01T01:30:00.000Z',
            },
            {
              id: 'timeline_next_step',
              taskId: riskTask.id,
              type: 'task.next_step_changed',
              payload: JSON.stringify({
                from: null,
                to: '检查失败原因并决定是否重试',
              }),
              createdAt: '2026-01-01T01:00:00.000Z',
            },
          ],
        };
      }),
    };

    window.api = runTimelineApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    await screen.findByRole('heading', { name: '执行记录' });

    await screen.findByText('Related Task Timeline');
    expect(screen.getByText('最近一次执行失败：Executor exploded。')).toBeTruthy();
    expect(screen.getByText('最近生成了产物：draft output。')).toBeTruthy();
    expect(screen.getByText('下一步从“未填写”调整为“检查失败原因并决定是否重试”')).toBeTruthy();
  });

  it('opens related runs from the run page timeline context', async () => {
    const user = userEvent.setup();

    const runTimelineApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [
        ...runs,
        buildRunRecord({
          id: 'run_2',
          taskId: riskTask.id,
          type: 'summarize',
          status: 'completed',
        }),
      ]),
      getRunDetail: vi.fn(async (runId: string) =>
        [
          ...runs,
          buildRunRecord({
            id: 'run_2',
            taskId: riskTask.id,
            type: 'summarize',
            status: 'completed',
          }),
        ].find((run) => run.id === runId) ?? null,
      ),
      getTaskDetail: vi.fn(async (taskId: string) => {
        if (taskId !== riskTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(riskTask),
          timeline: [
            {
              id: 'timeline_run_completed',
              taskId: riskTask.id,
              type: 'task.run_completed',
              payload: JSON.stringify({
                runId: 'run_2',
                nextState: 'planned',
              }),
              createdAt: '2026-01-01T02:00:00.000Z',
            },
          ],
        };
      }),
    };

    window.api = runTimelineApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    await screen.findByRole('heading', { name: '执行记录' });

    const objectButton = await screen.findByRole('button', { name: '查看 Run' });
    await user.click(objectButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'summarize / completed' })).toBeTruthy();
    });
  });

  it('opens task follow-up from run timeline actions on the runs page', async () => {
    const user = userEvent.setup();

    const runTimelineApi: ElectronApi = {
      ...mockApi,
      getRunDetail: vi.fn(async (runId: string) =>
        runs.find((run) => run.id === runId) ?? null,
      ),
      getTaskDetail: vi.fn(async (taskId: string) => {
        if (taskId !== riskTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(riskTask),
          timeline: [
            {
              id: 'timeline_run_failed',
              taskId: riskTask.id,
              type: 'task.run_failed',
              payload: JSON.stringify({
                runId: 'run_1',
                failureReason: 'Executor exploded',
              }),
              createdAt: '2026-01-01T02:00:00.000Z',
            },
          ],
        };
      }),
    };

    window.api = runTimelineApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    await screen.findByRole('heading', { name: '执行记录' });

    const actionButton = await screen.findByRole('button', { name: '准备重试 Run' });
    await user.click(actionButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect(window.location.hash).toBe('#tasks');
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '检查最近一次 draft run 的失败原因，并决定是否重试。',
    );
  });

  it('returns from the decisions page to the related task with follow-up guidance', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /home/i }));
    await user.click((await screen.findAllByRole('button', { name: '查看 Decision' }))[0]);

    await screen.findByRole('heading', { name: '待拍板事项' });

    const backToTaskButton = await screen.findByRole('button', { name: '回到任务推进' });
    await user.click(backToTaskButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect(window.location.hash).toBe('#tasks');
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '已获批准，继续推进：Approve escalation path',
    );
  });

  it('shows related task timeline context on the decisions page', async () => {
    const user = userEvent.setup();

    const decisionTimelineApi: ElectronApi = {
      ...mockApi,
      getTaskDetail: vi.fn(async (taskId: string) => {
        if (taskId !== riskTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(riskTask),
          timeline: [
            {
              id: 'timeline_decision_approved',
              taskId: riskTask.id,
              type: 'task.decision_approved',
              payload: JSON.stringify({
                decisionId: 'decision_2',
                decisionTitle: 'Approve escalation path',
                nextState: 'planned',
              }),
              createdAt: '2026-01-01T02:00:00.000Z',
            },
            {
              id: 'timeline_waiting',
              taskId: riskTask.id,
              type: 'task.waiting_changed',
              payload: JSON.stringify({
                from: null,
                to: '等待重新拍板：Approve escalation path',
              }),
              createdAt: '2026-01-01T01:30:00.000Z',
            },
            {
              id: 'timeline_next_step',
              taskId: riskTask.id,
              type: 'task.next_step_changed',
              payload: JSON.stringify({
                from: null,
                to: '已获批准，继续推进：Approve escalation path',
              }),
              createdAt: '2026-01-01T01:00:00.000Z',
            },
          ],
        };
      }),
    };

    window.api = decisionTimelineApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /home/i }));
    await user.click((await screen.findAllByRole('button', { name: '查看 Decision' }))[0]);

    await screen.findByRole('heading', { name: '待拍板事项' });
    await screen.findByText('Related Task Timeline');
    expect(screen.getByText('最近一条决策已获批准：Approve escalation path。')).toBeTruthy();
    expect(screen.getByText('等待原因调整为“等待重新拍板：Approve escalation path”')).toBeTruthy();
    expect(screen.getByText('下一步从“未填写”调整为“已获批准，继续推进：Approve escalation path”')).toBeTruthy();
  });

  it('opens related decisions from the decision page timeline context', async () => {
    const user = userEvent.setup();

    const decisionTimelineApi: ElectronApi = {
      ...mockApi,
      listDecisions: vi.fn(async () => [
        {
          id: 'decision_1',
          taskId: riskTask.id,
          title: 'Escalate issue to legal',
          status: 'pending' as const,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        ...decisions,
      ]),
      getTaskDetail: vi.fn(async (taskId: string) => {
        if (taskId !== riskTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(riskTask),
          timeline: [
            {
              id: 'timeline_decision_approved',
              taskId: riskTask.id,
              type: 'task.decision_approved',
              payload: JSON.stringify({
                decisionId: 'decision_2',
                decisionTitle: 'Approve escalation path',
                nextState: 'planned',
              }),
              createdAt: '2026-01-01T02:00:00.000Z',
            },
          ],
        };
      }),
    };

    window.api = decisionTimelineApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /decisions/i }));
    await user.click(screen.getByRole('button', { name: /Approve escalation path.*approved/i }));

    await screen.findByRole('heading', { name: '待拍板事项' });
    const objectButton = await screen.findByRole('button', { name: '查看 Decision' });
    await user.click(objectButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Approve escalation path' })).toBeTruthy();
    });
  });

  it('opens task follow-up from decision timeline actions on the decisions page', async () => {
    const user = userEvent.setup();

    const decisionTimelineApi: ElectronApi = {
      ...mockApi,
      getTaskDetail: vi.fn(async (taskId: string) => {
        if (taskId !== riskTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(riskTask),
          timeline: [
            {
              id: 'timeline_decision_approved',
              taskId: riskTask.id,
              type: 'task.decision_approved',
              payload: JSON.stringify({
                decisionId: 'decision_2',
                decisionTitle: 'Approve escalation path',
                nextState: 'planned',
              }),
              createdAt: '2026-01-01T02:00:00.000Z',
            },
          ],
        };
      }),
    };

    window.api = decisionTimelineApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /home/i }));
    await user.click((await screen.findAllByRole('button', { name: '查看 Decision' }))[0]);

    await screen.findByRole('heading', { name: '待拍板事项' });

    const actionButton = await screen.findByRole('button', { name: '继续推进任务' });
    await user.click(actionButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect(window.location.hash).toBe('#tasks');
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '已获批准，继续推进：Approve escalation path',
    );
  });

  it('returns from the runs page to the related task with follow-up guidance', async () => {
    const user = userEvent.setup();

    const runDetailApi: ElectronApi = {
      ...mockApi,
      getRunDetail: vi.fn(async (runId: string) =>
        runs.find((run) => run.id === runId) ?? null,
      ),
    };

    window.api = runDetailApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    await screen.findByRole('heading', { name: '执行记录' });

    const backToTaskButton = await screen.findByRole('button', { name: '回到任务推进' });
    await user.click(backToTaskButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect(window.location.hash).toBe('#tasks');
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '检查最近一次 draft run 的失败原因，并决定是否重试。',
    );
  });

  it('opens related decisions from the task activity feed', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    const riskTaskCard = (await screen.findByText('High risk task')).closest('button');
    expect(riskTaskCard).toBeTruthy();
    await user.click(riskTaskCard!);
    await screen.findByRole('heading', { name: 'High risk task' });

    await user.click(screen.getByRole('button', { name: /Approve escalation path.*pending/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '待拍板事项' })).toBeTruthy();
    });

    expect(window.location.hash).toBe('#decisions');
  });

  it('opens related runs from the task activity feed', async () => {
    const user = userEvent.setup();

    const runDetailApi: ElectronApi = {
      ...mockApi,
      getRunDetail: vi.fn(async (runId: string) =>
        runs.find((run) => run.id === runId) ?? null,
      ),
    };

    window.api = runDetailApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    const riskTaskCard = (await screen.findByText('High risk task')).closest('button');
    expect(riskTaskCard).toBeTruthy();
    await user.click(riskTaskCard!);
    await screen.findByRole('heading', { name: 'High risk task' });

    await user.click(screen.getByRole('button', { name: /draft.*failed.*来源：system/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'draft / failed' })).toBeTruthy();
    });

    expect(window.location.hash).toBe('#runs');
    expect(runDetailApi.getRunDetail).toHaveBeenCalledWith('run_1');
  });

  it('renders timeline events as readable summaries with badges', async () => {
    const user = userEvent.setup();

    const timelineTask = buildTaskRecord({
      id: 'task_timeline',
      title: 'Timeline task',
      state: 'running',
      riskLevel: 'high',
      riskNote: 'Dependency blocked',
    });

    const timelineApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([timelineTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== timelineTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(timelineTask),
          timeline: [
            {
              id: 'timeline_risk',
              taskId: timelineTask.id,
              type: 'task.risk_changed',
              payload: JSON.stringify({
                from: { level: 'medium', note: 'Review lagging' },
                to: { level: 'high', note: 'Dependency blocked' },
              }),
              createdAt: '2026-01-01T01:00:00.000Z',
            },
            {
              id: 'timeline_next',
              taskId: timelineTask.id,
              type: 'task.next_step_changed',
              payload: JSON.stringify({
                from: 'Check status',
                to: 'Escalate dependency owner',
              }),
              createdAt: '2026-01-01T00:30:00.000Z',
            },
            {
              id: 'timeline_waiting_item',
              taskId: timelineTask.id,
              type: 'waiting_item.created',
              payload: JSON.stringify({
                waitingItemId: 'waiting_1',
                reason: 'Waiting for vendor confirmation',
                status: 'active',
              }),
              createdAt: '2026-01-01T00:00:00.000Z',
            },
            {
              id: 'timeline_waiting_item_resolved',
              taskId: timelineTask.id,
              type: 'waiting_item.resolved',
              payload: JSON.stringify({
                waitingItemId: 'waiting_1',
                reason: 'Waiting for vendor confirmation',
                resolvedAt: '2026-01-01T02:00:00.000Z',
                nextState: 'planned',
              }),
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        };
      }),
    };

    window.api = timelineApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /timeline task/i }));
    await screen.findByRole('heading', { name: 'Timeline task' });

    expect(
      screen.getByText('风险从 medium（Review lagging）调整为 high（Dependency blocked）'),
    ).toBeTruthy();
    expect(
      screen.getByText('下一步从“Check status”调整为“Escalate dependency owner”'),
    ).toBeTruthy();
    expect(screen.getByText('创建等待项：Waiting for vendor confirmation')).toBeTruthy();
    expect(
      screen.getByText('解除等待项：Waiting for vendor confirmation，任务恢复到 planned'),
    ).toBeTruthy();
    expect(screen.getByText('风险')).toBeTruthy();
    expect(screen.getByText('下一步')).toBeTruthy();
    expect(screen.getAllByText('等待项').length).toBeGreaterThan(0);
  });

  it('shows a compact timeline preview with expand and collapse controls', async () => {
    const user = userEvent.setup();

    const timelineTask = buildTaskRecord({
      id: 'task_timeline_preview',
      title: 'Timeline preview task',
      state: 'running',
    });

    const timelineEvents = [
      {
        id: 'timeline_1',
        taskId: timelineTask.id,
        type: 'task.created',
        payload: JSON.stringify({ title: timelineTask.title }),
        createdAt: '2026-01-01T06:00:00.000Z',
      },
      {
        id: 'timeline_2',
        taskId: timelineTask.id,
        type: 'task.updated',
        payload: JSON.stringify({ summary: 'Updated summary' }),
        createdAt: '2026-01-01T05:00:00.000Z',
      },
      {
        id: 'timeline_3',
        taskId: timelineTask.id,
        type: 'task.next_step_changed',
        payload: JSON.stringify({ from: null, to: 'Prepare draft' }),
        createdAt: '2026-01-01T04:00:00.000Z',
      },
      {
        id: 'timeline_4',
        taskId: timelineTask.id,
        type: 'task.waiting_changed',
        payload: JSON.stringify({ from: null, to: 'Waiting for review' }),
        createdAt: '2026-01-01T03:00:00.000Z',
      },
      {
        id: 'timeline_5',
        taskId: timelineTask.id,
        type: 'task.risk_changed',
        payload: JSON.stringify({
          from: { level: 'low', note: null },
          to: { level: 'medium', note: 'Review may slip' },
        }),
        createdAt: '2026-01-01T02:00:00.000Z',
      },
      {
        id: 'timeline_6',
        taskId: timelineTask.id,
        type: 'task.transitioned',
        payload: JSON.stringify({ from: 'planned', to: 'running' }),
        createdAt: '2026-01-01T01:00:00.000Z',
      },
    ];

    const timelineApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([timelineTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== timelineTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(timelineTask),
          timeline: timelineEvents,
        };
      }),
    };

    window.api = timelineApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /timeline preview task/i }));
    await screen.findByRole('heading', { name: 'Timeline preview task' });

    expect(screen.getByRole('button', { name: '展开全部 (6)' })).toBeTruthy();
    expect(screen.queryByText('任务字段已更新')).toBeNull();
    expect(screen.getByText('状态从 planned 变更为 running')).toBeTruthy();
    expect(screen.getAllByText('解释').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '展开全部 (6)' }));

    expect(screen.getByText('状态从 planned 变更为 running')).toBeTruthy();
    expect(screen.getByText('任务字段已更新')).toBeTruthy();
    expect(screen.getAllByText('留痕').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '收起旧事件' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '收起旧事件' }));

    await waitFor(() => {
      expect(screen.queryByText('任务字段已更新')).toBeNull();
    });
  });

  it('prefills quick actions from failure timeline suggestions', async () => {
    const user = userEvent.setup();

    const actionTask = buildTaskRecord({
      id: 'task_timeline_action',
      title: 'Timeline action task',
      state: 'running',
    });

    const actionApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([actionTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== actionTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(actionTask),
          timeline: [
            {
              id: 'timeline_cancelled',
              taskId: actionTask.id,
              type: 'task.decision_cancelled',
              payload: JSON.stringify({
                decisionId: 'decision_1',
                decisionTitle: 'Approve budget path',
              }),
              createdAt: '2026-01-01T02:00:00.000Z',
            },
            {
              id: 'timeline_failed',
              taskId: actionTask.id,
              type: 'task.run_failed',
              payload: JSON.stringify({
                runId: 'run_1',
                failureReason: 'Executor exploded',
              }),
              createdAt: '2026-01-01T01:00:00.000Z',
            },
          ],
        };
      }),
    };

    window.api = actionApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /timeline action task/i }));
    await screen.findByRole('heading', { name: 'Timeline action task' });

    await user.click(screen.getByRole('button', { name: '准备重试 Run' }));

    expect((screen.getByLabelText('附加要求') as HTMLTextAreaElement).value).toContain(
      'Executor exploded',
    );

    await user.click(screen.getByRole('button', { name: '生成新的 Decision' }));

    expect((screen.getByLabelText('决策标题') as HTMLInputElement).value).toBe(
      'Timeline action task 重新拍板',
    );
  });

  it('opens related decision and run objects from task timeline events', async () => {
    const user = userEvent.setup();

    const timelineObjectTask = buildTaskRecord({
      id: 'task_timeline_objects',
      title: 'Timeline object task',
      state: 'planned',
    });

    const timelineObjectApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([timelineObjectTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== timelineObjectTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(timelineObjectTask),
          timeline: [
            {
              id: 'timeline_decision_object',
              taskId: timelineObjectTask.id,
              type: 'task.decision_approved',
              payload: JSON.stringify({
                decisionId: 'decision_1',
                decisionTitle: 'Legal sign-off',
                nextState: 'planned',
              }),
              createdAt: '2026-01-01T02:00:00.000Z',
            },
            {
              id: 'timeline_run_object',
              taskId: timelineObjectTask.id,
              type: 'task.run_completed',
              payload: JSON.stringify({
                runId: 'run_1',
                runType: 'draft',
                nextState: 'planned',
                hasOutput: true,
              }),
              createdAt: '2026-01-01T01:00:00.000Z',
            },
          ],
        };
      }),
    };

    window.api = timelineObjectApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /timeline object task/i }));
    await screen.findByRole('heading', { name: 'Timeline object task' });

    const timelineObjectButtons = await screen.findAllByRole('button', { name: '查看 Decision' });
    await user.click(timelineObjectButtons[0]!);

    await waitFor(() => {
      expect(window.location.hash).toBe('#decisions');
      expect(screen.getByRole('heading', { name: '待拍板事项' })).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /timeline object task/i }));
    await screen.findByRole('heading', { name: 'Timeline object task' });

    const runObjectButtons = await screen.findAllByRole('button', { name: '查看 Run' });
    await user.click(runObjectButtons[0]!);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'draft / failed' })).toBeTruthy();
    });
  });

  it('prefills next step from waiting timeline suggestions', async () => {
    const user = userEvent.setup();

    const waitingActionTask = buildTaskRecord({
      id: 'task_timeline_waiting_action',
      title: 'Timeline waiting task',
      state: 'waiting_external',
    });

    const waitingActionApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([waitingActionTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== waitingActionTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(waitingActionTask),
          timeline: [
            {
              id: 'timeline_waiting_action',
              taskId: waitingActionTask.id,
              type: 'task.waiting_changed',
              payload: JSON.stringify({
                from: null,
                to: 'Waiting for legal review',
              }),
              createdAt: '2026-01-01T01:00:00.000Z',
            },
          ],
        };
      }),
    };

    window.api = waitingActionApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /timeline waiting task/i }));
    await screen.findByRole('heading', { name: 'Timeline waiting task' });

    await user.click(screen.getByRole('button', { name: '补跟进动作' }));

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '跟进并确认是否解除等待：Waiting for legal review',
    );
  });

  it('prefills risk recovery fields from risk timeline suggestions', async () => {
    const user = userEvent.setup();

    const riskActionTask = buildTaskRecord({
      id: 'task_timeline_risk_action',
      title: 'Timeline risk task',
      state: 'running',
      riskLevel: 'high',
    });

    const riskActionApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([riskActionTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== riskActionTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(riskActionTask),
          timeline: [
            {
              id: 'timeline_risk_action',
              taskId: riskActionTask.id,
              type: 'task.risk_changed',
              payload: JSON.stringify({
                from: { level: 'medium', note: 'Review lagging' },
                to: { level: 'high', note: 'Dependency blocked' },
              }),
              createdAt: '2026-01-01T01:00:00.000Z',
            },
          ],
        };
      }),
    };

    window.api = riskActionApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /timeline risk task/i }));
    await screen.findByRole('heading', { name: 'Timeline risk task' });

    await user.click(screen.getByRole('button', { name: '处理风险' }));

    expect((screen.getByLabelText('Risk Level') as HTMLSelectElement).value).toBe('high');
    expect((screen.getByLabelText('Risk Note') as HTMLTextAreaElement).value).toBe(
      'Dependency blocked',
    );
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '处理当前风险并确认是否需要降级：Dependency blocked',
    );
  });

  it('creates and edits source context items from task detail', async () => {
    const user = userEvent.setup();

    const sourceTask = buildTaskRecord({
      id: 'task_source_context',
      title: 'Source context task',
      state: 'planned',
    });

    let currentDetail: TaskDetail = {
      ...buildTaskDetail(sourceTask),
      sourceContexts: [
        buildSourceContext({
          id: 'source_context_existing',
          taskId: sourceTask.id,
          title: 'Launch brief',
          kind: 'doc',
          uri: 'https://example.com/brief',
          note: 'Original brief',
        }),
      ],
    };

    const sourceApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([sourceTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== sourceTask.id) {
          return null;
        }

        return currentDetail;
      }),
      createSourceContext: vi.fn().mockImplementation(async (input) => {
        const created = buildSourceContext({
          id: 'source_context_created',
          taskId: input.taskId,
          title: input.title,
          kind: input.kind,
          isKey: input.isKey ?? false,
          uri: input.uri ?? null,
          content: input.content ?? null,
          note: input.note ?? null,
          updatedAt: '2026-01-02T00:00:00.000Z',
        });
        currentDetail = {
          ...currentDetail,
          sourceContexts: [created, ...currentDetail.sourceContexts],
        };
        return created;
      }),
      updateSourceContext: vi.fn().mockImplementation(async (input) => {
        const updated = buildSourceContext({
          id: input.id,
          taskId: sourceTask.id,
          title: input.title ?? 'Launch brief',
          kind: input.kind ?? 'doc',
          isKey: input.isKey ?? false,
          uri: input.uri ?? 'https://example.com/brief',
          content: input.content ?? null,
          note: input.note ?? null,
          updatedAt: '2026-01-03T00:00:00.000Z',
        });
        currentDetail = {
          ...currentDetail,
          sourceContexts: currentDetail.sourceContexts.map((item) =>
            item.id === updated.id ? updated : item,
          ),
        };
        return updated;
      }),
      archiveSourceContext: vi.fn().mockImplementation(async (id: string) => {
        const archived = buildSourceContext({
          id,
          taskId: sourceTask.id,
          title: 'Launch brief',
          kind: 'doc',
          uri: 'https://example.com/brief',
          note: 'Updated brief note',
          status: 'archived',
          archivedAt: '2026-01-04T00:00:00.000Z',
        });
        currentDetail = {
          ...currentDetail,
          sourceContexts: currentDetail.sourceContexts.filter((item) => item.id !== id),
        };
        return archived;
      }),
    };

    window.api = sourceApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /source context task/i }));
    await screen.findByRole('heading', { name: 'Source context task' });

    await user.type(screen.getByLabelText('来源标题'), 'Reference PR');
    await user.selectOptions(screen.getByLabelText('来源类型'), 'pr');
    await user.type(screen.getByLabelText('链接 / URI'), 'https://example.com/pr/1');
    await user.type(screen.getByLabelText('说明'), 'Primary rollout PR');

    await user.click(screen.getByRole('button', { name: '新增来源' }));

    expect(sourceApi.createSourceContext).toHaveBeenCalledWith({
      taskId: sourceTask.id,
      title: 'Reference PR',
      kind: 'pr',
      isKey: false,
      uri: 'https://example.com/pr/1',
      content: '',
      note: 'Primary rollout PR',
    });

    expect((await screen.findAllByText('Reference PR')).length).toBeGreaterThan(0);

    const sourceContextSection = screen
      .getByRole('heading', { name: 'Source Context' })
      .closest('.transition-group');
    const existingSourceCard = within(sourceContextSection as HTMLElement)
      .getAllByText('Launch brief')[0]
      ?.closest('.timeline-item');
    expect(existingSourceCard).not.toBeNull();

    await user.click(
      within(existingSourceCard as HTMLElement).getByRole('button', { name: '编辑来源' }),
    );
    const noteField = screen.getByLabelText('说明') as HTMLTextAreaElement;
    await user.clear(noteField);
    await user.type(noteField, 'Updated brief note');
    await user.click(screen.getByLabelText('标记为关键来源'));
    await user.click(screen.getByRole('button', { name: '保存来源' }));

    expect(sourceApi.updateSourceContext).toHaveBeenCalledWith({
      id: 'source_context_existing',
      title: 'Launch brief',
      kind: 'doc',
      isKey: true,
      uri: 'https://example.com/brief',
      content: '',
      note: 'Updated brief note',
    });
    expect((await screen.findAllByText('Updated brief note')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/key/).length).toBeGreaterThan(0);

    await user.click(
      within(existingSourceCard as HTMLElement).getByRole('button', { name: '归档来源' }),
    );

    expect(sourceApi.archiveSourceContext).toHaveBeenCalled();
  });

  it('creates and applies process templates from task detail', async () => {
    const user = userEvent.setup();

    const processTask = buildTaskRecord({
      id: 'task_process_context',
      title: 'Process context task',
      state: 'planned',
    });

    let currentDetail: TaskDetail = {
      ...buildTaskDetail(processTask),
      processTemplates: [
        buildAppliedProcessTemplate({
          id: 'process_template_existing',
          bindingId: 'task_process_binding_existing',
          taskId: processTask.id,
          title: 'Launch checklist',
          kind: 'checklist',
          tags: ['launch'],
        }),
      ],
      availableProcessTemplates: [
        buildProcessTemplate({
          id: 'process_template_library',
          title: 'Outreach workflow',
          kind: 'workflow',
          tags: ['outreach'],
        }),
      ],
    };

    const processApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([processTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== processTask.id) {
          return null;
        }

        return currentDetail;
      }),
      createProcessTemplate: vi.fn().mockImplementation(async (input) => {
        const created = buildProcessTemplate({
          id: 'process_template_created',
          title: input.title,
          summary: input.summary ?? null,
          content: input.content,
          kind: input.kind,
          tags: input.tags ?? [],
          updatedAt: '2026-01-02T00:00:00.000Z',
        });
        currentDetail = {
          ...currentDetail,
          availableProcessTemplates: [created, ...currentDetail.availableProcessTemplates],
        };
        return created;
      }),
      applyProcessTemplate: vi.fn().mockImplementation(async (input) => {
        const template =
          currentDetail.availableProcessTemplates.find((item) => item.id === input.templateId) ??
          buildProcessTemplate({
            id: input.templateId,
            title: 'Cold outreach skill',
            kind: 'skill',
            tags: ['outreach'],
          });
        const applied = buildAppliedProcessTemplate({
          ...template,
          bindingId: `binding:${input.templateId}`,
          taskId: input.taskId,
        });
        currentDetail = {
          ...currentDetail,
          processTemplates: [applied, ...currentDetail.processTemplates],
          availableProcessTemplates: currentDetail.availableProcessTemplates.filter(
            (item) => item.id !== input.templateId,
          ),
        };
        return applied;
      }),
      updateProcessTemplate: vi.fn().mockImplementation(async (input) => {
        currentDetail = {
          ...currentDetail,
          processTemplates: currentDetail.processTemplates.map((item) =>
            item.id === input.id
              ? {
                  ...item,
                  summary: input.summary ?? item.summary,
                }
              : item,
          ),
        };
        return buildProcessTemplate({
          id: input.id,
          title: 'Launch checklist',
          kind: 'checklist',
          tags: ['launch'],
          summary: input.summary ?? 'Updated checklist',
        });
      }),
      archiveProcessTemplate: vi.fn().mockImplementation(async (id: string) =>
        buildProcessTemplate({
          id,
          status: 'archived',
          archivedAt: '2026-01-03T00:00:00.000Z',
        }),
      ),
      removeProcessTemplate: vi.fn().mockImplementation(async (bindingId: string) => {
        const removed = currentDetail.processTemplates.find((item) => item.bindingId === bindingId)!;
        currentDetail = {
          ...currentDetail,
          processTemplates: currentDetail.processTemplates.filter((item) => item.bindingId !== bindingId),
          availableProcessTemplates: [
            buildProcessTemplate(removed),
            ...currentDetail.availableProcessTemplates,
          ],
        };
        return {
          ...removed,
          bindingStatus: 'removed',
          removedAt: '2026-01-04T00:00:00.000Z',
        };
      }),
    };

    window.api = processApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /process context task/i }));
    await screen.findByRole('heading', { name: 'Process context task' });

    await user.type(screen.getByLabelText('模板标题'), 'Cold outreach skill');
    await user.type(screen.getByLabelText('简述'), 'Template for outreach tasks');
    await user.type(screen.getByLabelText('标签'), 'outreach, review');
    await user.type(screen.getByLabelText('模板内容'), '1. Review sources\n2. Draft outreach email');
    await user.click(screen.getByRole('button', { name: '创建模板并挂载' }));

    expect(processApi.createProcessTemplate).toHaveBeenCalledWith({
      title: 'Cold outreach skill',
      summary: 'Template for outreach tasks',
      kind: 'skill',
      tags: ['outreach', 'review'],
      content: '1. Review sources\n2. Draft outreach email',
    });
    expect(processApi.applyProcessTemplate).toHaveBeenCalledWith({
      taskId: processTask.id,
      templateId: 'process_template_created',
    });

    expect((await screen.findAllByText('Cold outreach skill')).length).toBeGreaterThan(0);

    const processSection = screen.getByRole('heading', { name: 'Process Context' }).closest('.transition-group');
    expect(processSection).not.toBeNull();
    const existingTemplateCard = within(processSection as HTMLElement)
      .getAllByText('Launch checklist')[0]
      ?.closest('.timeline-item');
    expect(existingTemplateCard).not.toBeNull();
    await user.click(
      within(existingTemplateCard as HTMLElement).getByRole('button', { name: '编辑模板' }),
    );

    const summaryField = screen.getByLabelText('简述') as HTMLInputElement;
    await user.clear(summaryField);
    await user.type(summaryField, 'Updated checklist summary');
    await user.click(screen.getByRole('button', { name: '保存模板' }));
    expect(processApi.updateProcessTemplate).toHaveBeenCalled();

    await user.click(
      within(existingTemplateCard as HTMLElement).getByRole('button', { name: '移除模板' }),
    );
    expect(processApi.removeProcessTemplate).toHaveBeenCalledWith('task_process_binding_existing');
  });

  it('reflects cancelled decisions in task signals after a refresh event', async () => {
    const user = userEvent.setup();

    let currentTasks: TaskListItemRecord[] = [waitingTask, riskTask];
    let currentTaskDetails: Record<string, TaskDetail> = {
      [waitingTask.id]: buildTaskDetail(waitingTask),
      [riskTask.id]: buildTaskDetail(riskTask),
    };
    let currentDecisions: DecisionRecord[] = [...briefData.pendingDecisions];
    let currentBriefData: HomeBriefData = {
      ...briefData,
      pendingDecisions: [...briefData.pendingDecisions],
    };
    let subscriber: ((event: { type: 'task.changed' | 'decision.changed'; at: string }) => void) | null =
      null;

    const eventingApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn(async () => currentTasks),
      getTaskDetail: vi.fn(async (taskId: string) => currentTaskDetails[taskId] ?? null),
      listDecisions: vi.fn(async () => currentDecisions),
      getHomeBrief: vi.fn(async () => currentBriefData),
      subscribeToEvents: vi.fn().mockImplementation((callback) => {
        subscriber = callback;
        return () => {
          subscriber = null;
        };
      }),
      actOnDecision: vi.fn().mockImplementation(async ({ id, action }) => {
        const updatedDecision: DecisionRecord = {
          ...currentDecisions.find((decision) => decision.id === id)!,
          status: action === 'cancel' ? 'cancelled' : 'pending',
          updatedAt: '2026-01-02T00:00:00.000Z',
        };

        currentDecisions = currentDecisions.map((decision) =>
          decision.id === id ? updatedDecision : decision,
        );

        const updatedTask = buildTaskRecord({
          ...riskTask,
          nextStep: '确认该任务是否还需要继续推进，或改走无需拍板的路径。',
          riskLevel: 'high',
          riskNote: `相关决策已取消：${updatedDecision.title}`,
          updatedAt: '2026-01-02T00:00:00.000Z',
        });

        currentTasks = currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
        currentTaskDetails = {
          ...currentTaskDetails,
          [updatedTask.id]: buildTaskDetail(updatedTask),
        };
        currentBriefData = {
          ...currentBriefData,
          pendingDecisionCount: 0,
          pendingDecisions: [],
          highRiskTasks: [updatedTask],
          recentTasks: [waitingTask, updatedTask],
        };

        subscriber?.({ type: 'decision.changed', at: '2026-01-02T00:00:00.000Z' });
        subscriber?.({ type: 'task.changed', at: '2026-01-02T00:00:00.000Z' });

        return updatedDecision;
      }),
    };

    window.api = eventingApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /decisions/i }));
    await screen.findByRole('heading', { name: '待拍板事项' });

    await user.click(screen.getByRole('button', { name: '取消' }));

    await waitFor(() => {
      expect(eventingApi.actOnDecision).toHaveBeenCalledWith({
        id: 'decision_1',
        action: 'cancel',
      });
    });

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /high risk task/i }));

    await waitFor(() => {
      expect((screen.getByLabelText('Risk Note') as HTMLTextAreaElement).value).toBe(
        '相关决策已取消：Approve escalation path',
      );
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '确认该任务是否还需要继续推进，或改走无需拍板的路径。',
    );
  });

  it('reflects failed runs in task signals after a refresh event', async () => {
    const user = userEvent.setup();

    let currentTasks: TaskListItemRecord[] = [waitingTask, riskTask];
    let currentTaskDetails: Record<string, TaskDetail> = {
      [waitingTask.id]: buildTaskDetail(waitingTask),
      [riskTask.id]: buildTaskDetail(riskTask),
    };
    let currentRuns: RunRecord[] = [...runs];
    let currentBriefData: HomeBriefData = {
      ...briefData,
      recentRunCount: runs.length,
    };
    let subscriber:
      | ((event: {
          type: 'run.changed' | 'task.changed' | 'brief.changed';
          at: string;
        }) => void)
      | null = null;

    const eventingApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn(async () => currentTasks),
      getTaskDetail: vi.fn(async (taskId: string) => currentTaskDetails[taskId] ?? null),
      listRuns: vi.fn(async () => currentRuns),
      getHomeBrief: vi.fn(async () => currentBriefData),
      subscribeToEvents: vi.fn().mockImplementation((callback) => {
        subscriber = callback;
        return () => {
          subscriber = null;
        };
      }),
      triggerRun: vi.fn().mockImplementation(async (input) => {
        const failedRun = buildRunRecord({
          id: 'run_failed',
          taskId: input.taskId,
          type: input.type,
          status: 'failed',
          instructions: input.instructions ?? null,
          output: 'Missing API key',
          outputSource: 'system',
          failureReason: 'Missing API key',
          updatedAt: '2026-01-02T00:00:00.000Z',
        });

        currentRuns = [failedRun, ...currentRuns];

        const updatedTask = buildTaskRecord({
          ...riskTask,
          nextStep: '检查失败原因，修正输入或上下文后再决定是否重试。',
          riskLevel: 'high',
          riskNote: 'Missing API key',
          updatedAt: '2026-01-02T00:00:00.000Z',
        });

        currentTasks = currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
        currentTaskDetails = {
          ...currentTaskDetails,
          [updatedTask.id]: buildTaskDetail(updatedTask),
        };
        currentBriefData = {
          ...currentBriefData,
          highRiskTasks: [updatedTask],
          recentTasks: [waitingTask, updatedTask],
          recentRunCount: currentRuns.length,
        };

        subscriber?.({ type: 'run.changed', at: '2026-01-02T00:00:00.000Z' });
        subscriber?.({ type: 'task.changed', at: '2026-01-02T00:00:00.000Z' });
        subscriber?.({ type: 'brief.changed', at: '2026-01-02T00:00:00.000Z' });

        return failedRun;
      }),
    };

    window.api = eventingApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /high risk task/i }));
    await screen.findByRole('heading', { name: 'High risk task' });

    await user.selectOptions(screen.getByLabelText('Run 类型'), 'summarize');

    const instructionsInput = screen.getByLabelText('附加要求');
    await user.clear(instructionsInput);
    await user.type(instructionsInput, 'Summarize blockers with current config');

    await user.click(screen.getByRole('button', { name: '触发 Run' }));

    await waitFor(() => {
      expect(eventingApi.triggerRun).toHaveBeenCalledWith({
        taskId: riskTask.id,
        type: 'summarize',
        instructions: 'Summarize blockers with current config',
      });
    });

    await waitFor(() => {
      expect((screen.getByLabelText('Risk Note') as HTMLTextAreaElement).value).toBe(
        'Missing API key',
      );
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '检查失败原因，修正输入或上下文后再决定是否重试。',
    );
  });

  it('refreshes home brief after a decision action changes the dashboard state', async () => {
    const user = userEvent.setup();

    let currentTasks: TaskListItemRecord[] = [waitingTask, riskTask];
    let currentDecisions: DecisionRecord[] = [...briefData.pendingDecisions];
    let currentBriefData: HomeBriefData = {
      ...briefData,
      pendingDecisions: [...briefData.pendingDecisions],
      recommendedActions: [
        {
          id: `decision:decision_1`,
          label: '尽快拍板：Approve escalation path',
          reason: '该决策仍处于 pending，可能阻塞相关任务推进。',
          taskId: riskTask.id,
          priority: 'high',
        },
        ...briefData.recommendedActions,
      ],
    };
    let subscriber:
      | ((event: {
          type: 'decision.changed' | 'task.changed';
          at: string;
        }) => void)
      | null = null;

    const eventingApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn(async () => currentTasks),
      listDecisions: vi.fn(async () => currentDecisions),
      getHomeBrief: vi.fn(async () => currentBriefData),
      subscribeToEvents: vi.fn().mockImplementation((callback) => {
        subscriber = callback;
        return () => {
          subscriber = null;
        };
      }),
      actOnDecision: vi.fn().mockImplementation(async ({ id, action }) => {
        const updatedDecision: DecisionRecord = {
          ...currentDecisions.find((decision) => decision.id === id)!,
          status: action === 'cancel' ? 'cancelled' : 'pending',
          updatedAt: '2026-01-02T00:00:00.000Z',
        };

        currentDecisions = currentDecisions.map((decision) =>
          decision.id === id ? updatedDecision : decision,
        );
        currentBriefData = {
          ...currentBriefData,
          pendingDecisionCount: 0,
          pendingDecisions: [],
          recommendedActions: briefData.recommendedActions,
        };

        subscriber?.({ type: 'decision.changed', at: '2026-01-02T00:00:00.000Z' });
        subscriber?.({ type: 'task.changed', at: '2026-01-02T00:00:00.000Z' });

        return updatedDecision;
      }),
    };

    window.api = eventingApi;

    render(<App />);

    await screen.findByRole('button', { name: /尽快拍板：Approve escalation path/i });
    expect(screen.getAllByText('Approve escalation path').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /decisions/i }));
    await screen.findByRole('heading', { name: '待拍板事项' });
    await user.click(screen.getByRole('button', { name: '取消' }));

    await waitFor(() => {
      expect(eventingApi.actOnDecision).toHaveBeenCalledWith({
        id: 'decision_1',
        action: 'cancel',
      });
    });

    await user.click(screen.getByRole('button', { name: /home/i }));

    await waitFor(() => {
      expect(screen.getByText('当前没有待拍板事项。')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /尽快拍板：Approve escalation path/i })).toBeNull();
  });

  it('refreshes home brief after a failed run changes risk and recommendations', async () => {
    const user = userEvent.setup();

    let currentTasks: TaskListItemRecord[] = [waitingTask, riskTask];
    let currentRuns: RunRecord[] = [...runs];
    let currentBriefData: HomeBriefData = {
      ...briefData,
      recentRunCount: currentRuns.length,
      recommendedActions: [
        {
          id: `risk:${riskTask.id}`,
          label: `优先处理高风险任务：${riskTask.title}`,
          reason: 'Deadline slipping',
          taskId: riskTask.id,
          priority: 'high',
        },
      ],
    };
    let subscriber:
      | ((event: {
          type: 'run.changed' | 'task.changed' | 'brief.changed';
          at: string;
        }) => void)
      | null = null;

    const eventingApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn(async () => currentTasks),
      listRuns: vi.fn(async () => currentRuns),
      getHomeBrief: vi.fn(async () => currentBriefData),
      subscribeToEvents: vi.fn().mockImplementation((callback) => {
        subscriber = callback;
        return () => {
          subscriber = null;
        };
      }),
      triggerRun: vi.fn().mockImplementation(async (input) => {
        const failedRun = buildRunRecord({
          id: 'run_failed_home',
          taskId: input.taskId,
          type: input.type,
          status: 'failed',
          instructions: input.instructions ?? null,
          output: 'Missing API key',
          outputSource: 'system',
          failureReason: 'Missing API key',
          updatedAt: '2026-01-02T00:00:00.000Z',
        });

        currentRuns = [failedRun, ...currentRuns];

        const updatedTask = buildTaskRecord({
          ...riskTask,
          nextStep: '检查失败原因，修正输入或上下文后再决定是否重试。',
          riskLevel: 'high',
          riskNote: 'Missing API key',
          updatedAt: '2026-01-02T00:00:00.000Z',
        });

        currentTasks = currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
        currentBriefData = {
          ...currentBriefData,
          recentRunCount: currentRuns.length,
          highRiskTasks: [updatedTask],
          recentTasks: [waitingTask, updatedTask],
          recommendedActions: [
            {
              id: `risk:${updatedTask.id}`,
              label: `优先处理高风险任务：${updatedTask.title}`,
              reason: 'Missing API key',
              taskId: updatedTask.id,
              priority: 'high',
            },
          ],
        };

        subscriber?.({ type: 'run.changed', at: '2026-01-02T00:00:00.000Z' });
        subscriber?.({ type: 'task.changed', at: '2026-01-02T00:00:00.000Z' });
        subscriber?.({ type: 'brief.changed', at: '2026-01-02T00:00:00.000Z' });

        return failedRun;
      }),
    };

    window.api = eventingApi;

    render(<App />);

    await screen.findByRole('button', { name: /优先处理高风险任务：High risk task/i });
    expect(screen.getAllByText('Deadline slipping').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /high risk task/i }));
    await screen.findByRole('heading', { name: 'High risk task' });

    await user.selectOptions(screen.getByLabelText('Run 类型'), 'summarize');
    const instructionsInput = screen.getByLabelText('附加要求');
    await user.clear(instructionsInput);
    await user.type(instructionsInput, 'Retry with missing key state');
    await user.click(screen.getByRole('button', { name: '触发 Run' }));

    await waitFor(() => {
      expect(eventingApi.triggerRun).toHaveBeenCalledWith({
        taskId: riskTask.id,
        type: 'summarize',
        instructions: 'Retry with missing key state',
      });
    });

    await user.click(screen.getByRole('button', { name: /home/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Missing API key').length).toBeGreaterThan(0);
    });

    expect(screen.queryAllByText('Deadline slipping').length).toBe(0);
  });

  it('saves settings and refreshes scheduler state across pages', async () => {
    const user = userEvent.setup();

    let currentAiStatus: AiConfigStatus = { ...aiStatus };
    let currentBriefData: HomeBriefData = {
      ...briefData,
      schedulerStatus: {
        enabled: false,
        running: false,
        lastBriefAt: null,
        lastRunSweepAt: null,
      },
    };
    let subscriber: ((event: { type: 'settings.changed'; at: string }) => void) | null = null;

    const eventingApi: ElectronApi = {
      ...mockApi,
      getAiConfigStatus: vi.fn(async () => currentAiStatus),
      getHomeBrief: vi.fn(async () => currentBriefData),
      subscribeToEvents: vi.fn().mockImplementation((callback) => {
        subscriber = callback;
        return () => {
          subscriber = null;
        };
      }),
      setAiConfig: vi.fn().mockImplementation(async (input) => {
        currentAiStatus = {
          configured: true,
          apiKeyStored: true,
          provider: input.provider,
          model: input.model,
          updatedAt: '2026-01-02T00:00:00.000Z',
          configPath: '/tmp/config.json',
          featureFlags: {
            enableScheduler: input.featureFlags.enableScheduler,
          },
        };

        currentBriefData = {
          ...currentBriefData,
          schedulerStatus: {
            enabled: input.featureFlags.enableScheduler,
            running: input.featureFlags.enableScheduler,
            lastBriefAt: null,
            lastRunSweepAt: null,
          },
        };

        subscriber?.({ type: 'settings.changed', at: '2026-01-02T00:00:00.000Z' });

        return currentAiStatus;
      }),
    };

    window.api = eventingApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /settings/i }));
    await screen.findByRole('heading', { name: 'AI Provider 与本地密钥存储' });

    await user.selectOptions(screen.getByLabelText('Provider'), 'openai');
    const modelInput = screen.getByLabelText('Model');
    await user.clear(modelInput);
    await user.type(modelInput, 'gpt-5.4-mini');
    await user.type(screen.getByLabelText('API Key'), 'sk-test-key');
    await user.click(screen.getByLabelText('启用本地 scheduler'));
    await user.click(screen.getByRole('button', { name: '保存到 Main / Keychain' }));

    await waitFor(() => {
      expect(eventingApi.setAiConfig).toHaveBeenCalledWith({
        provider: 'openai',
        model: 'gpt-5.4-mini',
        apiKey: 'sk-test-key',
        featureFlags: {
          enableScheduler: true,
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/已配置 openai \/ gpt-5.4-mini/i)).toBeTruthy();
    });

    expect(screen.getByText(/Scheduler 开关：启用/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /home/i }));

    await waitFor(() => {
      expect(screen.getByText(/已配置 openai \/ gpt-5.4-mini/i)).toBeTruthy();
    });
  });

  it('refreshes home signals after a task transitions into waiting', async () => {
    const user = userEvent.setup();

    let currentTasks: TaskListItemRecord[] = [waitingTask, riskTask];
    let currentTaskDetails: Record<string, TaskDetail> = {
      [waitingTask.id]: buildTaskDetail(waitingTask),
      [riskTask.id]: buildTaskDetail(riskTask),
    };
    let currentBriefData: HomeBriefData = {
      ...briefData,
      waitingTaskCount: 1,
      waitingTasks: [waitingTask],
      recommendedActions: [
        {
          id: `risk:${riskTask.id}`,
          label: `优先处理高风险任务：${riskTask.title}`,
          reason: 'Deadline slipping',
          taskId: riskTask.id,
          priority: 'high',
        },
      ],
    };

    const eventingApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn(async () => currentTasks),
      getTaskDetail: vi.fn(async (taskId: string) => currentTaskDetails[taskId] ?? null),
      getHomeBrief: vi.fn(async () => currentBriefData),
      transitionTask: vi.fn().mockImplementation(async ({ id, nextState }) => {
        const updatedTask = buildTaskRecord({
          ...riskTask,
          id,
          state: nextState,
          waitingReason: 'Waiting on stakeholder approval',
          updatedAt: '2026-01-02T00:00:00.000Z',
        });

        currentTasks = currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
        currentTaskDetails = {
          ...currentTaskDetails,
          [updatedTask.id]: buildTaskDetail(updatedTask),
        };
        currentBriefData = {
          ...currentBriefData,
          waitingTaskCount: 2,
          waitingTasks: [waitingTask, updatedTask],
          recentTasks: [waitingTask, updatedTask],
          recommendedActions: [
            {
              id: `waiting:${updatedTask.id}`,
              label: `跟进等待中的任务：${updatedTask.title}`,
              reason: 'Waiting on stakeholder approval',
              taskId: updatedTask.id,
              priority: 'medium',
            },
          ],
        };

        return updatedTask;
      }),
    };

    window.api = eventingApi;

    render(<App />);

    expect(screen.queryByRole('button', { name: /跟进等待中的任务：High risk task/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /high risk task/i }));
    await screen.findByRole('heading', { name: 'High risk task' });
    await user.clear(screen.getByLabelText('Waiting Transition Reason'));
    await user.type(screen.getByLabelText('Waiting Transition Reason'), 'Waiting on stakeholder approval');
    await user.click(screen.getByRole('button', { name: '转到 waiting_external' }));

    await waitFor(() => {
      expect(eventingApi.transitionTask).toHaveBeenCalledWith({
        id: riskTask.id,
        nextState: 'waiting_external',
        waitingReason: 'Waiting on stakeholder approval',
      });
    });

    await user.click(screen.getByRole('button', { name: /home/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /跟进等待中的任务：High risk task/i }),
      ).toBeTruthy();
    });

    expect(screen.getAllByText('Waiting on stakeholder approval').length).toBeGreaterThan(0);
  });

  it('opens task resume previews from home with a prefilled next step', async () => {
    const user = userEvent.setup();

    window.api = mockApi;

    render(<App />);

    await screen.findByText('Home / Brief');
    await user.click(screen.getByRole('button', { name: /恢复任务 High risk task/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '已获批准，继续推进：Approve escalation path',
    );
  });

  it('opens contextual resume actions from home previews', async () => {
    const user = userEvent.setup();

    window.api = mockApi;

    render(<App />);

    const resumePanel = (await screen.findByText('Resume Previews')).closest('.panel');
    expect(resumePanel).not.toBeNull();
    expect(screen.getByText('材料架中的关键来源：Contains the latest escalation framing.')).toBeTruthy();
    expect(screen.getByText('当前方法最近用于执行：风险高且需要先复盘 blocker。')).toBeTruthy();
    const firstResumeCard = within(resumePanel as HTMLElement)
      .getByRole('button', { name: /恢复任务 High risk task/i })
      .closest('.task-card');
    expect(firstResumeCard).not.toBeNull();
    await user.click(
      within(firstResumeCard as HTMLElement).getByRole('button', { name: '继续推进任务' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '已获批准，继续推进：Approve escalation path',
    );
  });

  it('opens latest-change objects from home resume previews', async () => {
    const user = userEvent.setup();

    window.api = mockApi;

    render(<App />);

    const resumePanel = (await screen.findByText('Resume Previews')).closest('.panel');
    expect(resumePanel).not.toBeNull();
    const resumeCards = within(resumePanel as HTMLElement).getAllByText(/High risk task|Waiting task/);
    expect(resumeCards.length).toBeGreaterThan(0);
    const firstResumeCard = resumeCards[0]?.closest('.task-card');
    expect(firstResumeCard).not.toBeNull();
    await user.click(
      within(firstResumeCard as HTMLElement).getByRole('button', { name: '查看 Decision' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Approve escalation path' })).toBeTruthy();
    });
  });

  it('clears waiting signals after a task leaves waiting_external', async () => {
    const user = userEvent.setup();

    let currentTasks: TaskListItemRecord[] = [waitingTask, riskTask];
    let currentTaskDetails: Record<string, TaskDetail> = {
      [waitingTask.id]: buildTaskDetail(waitingTask),
      [riskTask.id]: buildTaskDetail(riskTask),
    };
    let currentBriefData: HomeBriefData = {
      ...briefData,
      waitingTaskCount: 1,
      waitingTasks: [waitingTask],
      recommendedActions: [
        {
          id: `waiting:${waitingTask.id}`,
          label: `跟进等待中的任务：${waitingTask.title}`,
          reason: waitingTask.waitingReason ?? 'Waiting',
          taskId: waitingTask.id,
          priority: 'medium',
        },
      ],
    };

    const eventingApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn(async () => currentTasks),
      getTaskDetail: vi.fn(async (taskId: string) => currentTaskDetails[taskId] ?? null),
      getHomeBrief: vi.fn(async () => currentBriefData),
      transitionTask: vi.fn().mockImplementation(async ({ id, nextState }) => {
        const updatedTask = buildTaskRecord({
          ...waitingTask,
          id,
          state: nextState,
          waitingReason: null,
          updatedAt: '2026-01-02T00:00:00.000Z',
        });

        currentTasks = currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
        currentTaskDetails = {
          ...currentTaskDetails,
          [updatedTask.id]: buildTaskDetail(updatedTask),
        };
        currentBriefData = {
          ...currentBriefData,
          waitingTaskCount: 0,
          waitingTasks: [],
          recentTasks: [updatedTask, riskTask],
          recommendedActions: [
            {
              id: `risk:${riskTask.id}`,
              label: `优先处理高风险任务：${riskTask.title}`,
              reason: 'Deadline slipping',
              taskId: riskTask.id,
              priority: 'high',
            },
          ],
        };

        return updatedTask;
      }),
    };

    window.api = eventingApi;

    render(<App />);

    await screen.findByRole('button', { name: /跟进等待中的任务：Waiting task/i });
    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /waiting task/i }));
    await screen.findByRole('heading', { name: 'Waiting task' });
    await user.click(screen.getByRole('button', { name: '转到 planned' }));

    await waitFor(() => {
      expect(eventingApi.transitionTask).toHaveBeenCalledWith({
        id: waitingTask.id,
        nextState: 'planned',
        waitingReason: undefined,
      });
    });

    await user.click(screen.getByRole('button', { name: /home/i }));

    await waitFor(() => {
      expect(screen.getByText('当前没有等待中任务。')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /跟进等待中的任务：Waiting task/i })).toBeNull();
  });

  it('blocks waiting transitions in the UI until a waiting reason is provided', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /high risk task/i }));
    await screen.findByRole('heading', { name: 'High risk task' });

    await user.clear(screen.getByLabelText('Waiting Transition Reason'));
    await user.click(screen.getByRole('button', { name: '转到 waiting_external' }));

    expect(screen.getByText('转入 waiting_external 前，请先填写等待原因。')).toBeTruthy();
    expect(mockApi.transitionTask).not.toHaveBeenCalled();
  });
});
