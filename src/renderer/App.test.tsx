// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { HomeBriefData, HomeSourceContextRecord } from '@shared/types/brief';
import type { BlockerRecord } from '@shared/types/blocker';
import type { CompletionCriteriaRecord } from '@shared/types/completion-criteria';
import type { DecisionRecord } from '@shared/types/decision';
import type { ElectronApi } from '@shared/types/ipc';
import type {
  AppliedProcessTemplateRecord,
  ProcessTemplateRecord,
} from '@shared/types/process-template';
import type { RunCheckpointRecord, RunDetailRecord, RunRecord, RunStepRecord } from '@shared/types/run';
import type { AiConfigStatus } from '@shared/types/settings';
import type { SourceContextRecord } from '@shared/types/source-context';
import type { TaskDependencyRecord } from '@shared/types/task-dependency';
import type { TaskDetail, TaskListItemRecord, TaskRecord } from '@shared/types/task';
import type { ArtifactRecord } from '@shared/types/artifact';
import type { WaitingItemRecord } from '@shared/types/waiting-item';
import { buildDryRunAgentExecutorLifecycleAvailability } from '@shared/agent-executor-lifecycle-diagnostics';
import { summarizeAgentToolScaffoldFamilies } from '@shared/agent-tool-scaffold';
import { formatDependencyAgeLabel, getDependencyAgeReason } from '@shared/working-context/dependency';
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
    activeBlocker: partial.activeBlocker ?? null,
    activeDependency: partial.activeDependency ?? null,
    dependencyReevaluation: partial.dependencyReevaluation ?? null,
    riskLevel: partial.riskLevel ?? 'none',
    riskNote: partial.riskNote ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildBlocker(partial: Partial<BlockerRecord>): BlockerRecord {
  return {
    id: partial.id ?? 'blocker_1',
    taskId: partial.taskId ?? 'task_1',
    title: partial.title ?? 'Legal approval pending',
    kind: partial.kind ?? 'approval',
    detail: partial.detail ?? 'Need formal sign-off before launch',
    owner: partial.owner ?? 'Legal',
    responsibility: partial.responsibility ?? null,
    responsibilityLabel: partial.responsibilityLabel ?? null,
    sourceContextId: partial.sourceContextId ?? null,
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    resolvedAt: partial.resolvedAt ?? null,
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

function buildTaskDependency(partial: Partial<TaskDependencyRecord>): TaskDependencyRecord {
  return {
    id: partial.id ?? 'task_dependency_1',
    taskId: partial.taskId ?? 'task_1',
    blockedByTaskId: partial.blockedByTaskId ?? 'task_2',
    blockedByTaskTitle: partial.blockedByTaskTitle ?? 'Upstream task',
    reason: partial.reason ?? 'Need the upstream task to complete first',
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    resolvedAt: partial.resolvedAt ?? null,
  };
}

function buildCompletionCriteria(
  partial: Partial<CompletionCriteriaRecord>,
): CompletionCriteriaRecord {
  return {
    id: partial.id ?? 'criteria_1',
    taskId: partial.taskId ?? 'task_1',
    text: partial.text ?? 'Stakeholder approved final brief',
    verificationResponsibility: partial.verificationResponsibility ?? null,
    verificationResponsibilityLabel: partial.verificationResponsibilityLabel ?? null,
    status: partial.status ?? 'open',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    satisfiedAt: partial.satisfiedAt ?? null,
  };
}

function buildTaskDetail(task: TaskListItemRecord): TaskDetail {
  const isEarlyTask = task.state === 'captured' || task.state === 'triaged';
  const latestChangeSummary = isEarlyTask
    ? '这条任务刚进入系统，先补清摘要与下一步。'
    : '最近没有新的生命周期变化。';
  const nextSuggestedMove = task.nextStep
    ?? (isEarlyTask ? '先补一句任务摘要，再明确下一步。' : '先补一个明确的下一步。');

  return {
    ...task,
    resumeCard: {
      summary: `这条任务目前处于 ${task.state}。建议先做：${nextSuggestedMove}`,
      currentState: `状态：${task.state}`,
      latestChange: {
        summary: latestChangeSummary,
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
      currentBlocker: {
        blockerId: task.activeBlocker?.id ?? null,
        title: task.activeBlocker?.title ?? '暂无当前阻塞项',
        detail: task.activeBlocker?.detail ?? null,
        priorityReason: null,
        responsibilitySummary: null,
      },
      currentDependency: {
        dependencyId: task.activeDependency?.id ?? null,
        title: task.activeDependency?.blockedByTaskTitle ?? '暂无当前依赖',
        detail: task.activeDependency?.reason ?? null,
        priorityReason: null,
        ageLabel: null,
        responsibilitySummary: null,
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
      nextSuggestedMove,
    },
    artifacts: [],
    completionCriteria: [],
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

function buildActivity(
  partial: Partial<HomeBriefData['recentActivity'][number]>,
): HomeBriefData['recentActivity'][number] {
  return {
    id: partial.id ?? 'activity_1',
    sourceType: partial.sourceType ?? 'run',
    sourceId: partial.sourceId ?? 'run_1',
    lane: partial.lane,
    responsibilitySummary: partial.responsibilitySummary ?? null,
    relatedSourceContextId: partial.relatedSourceContextId ?? null,
    relatedTaskId: partial.relatedTaskId ?? null,
    taskId: partial.taskId ?? 'task_1',
    taskTitle: partial.taskTitle ?? 'Task',
    title: partial.title ?? 'draft',
    status: partial.status ?? 'completed',
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

function buildRunStep(partial: Partial<RunStepRecord>): RunStepRecord {
  return {
    id: partial.id ?? 'run_step_1',
    runId: partial.runId ?? 'run_1',
    index: partial.index ?? 1,
    kind: partial.kind ?? 'checkpoint',
    status: partial.status ?? 'pending',
    title: partial.title ?? 'Await confirmation',
    input: partial.input ?? null,
    output: partial.output ?? null,
    error: partial.error ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildRunCheckpoint(partial: Partial<RunCheckpointRecord>): RunCheckpointRecord {
  return {
    id: partial.id ?? 'run_checkpoint_1',
    runId: partial.runId ?? 'run_1',
    stepId: partial.stepId ?? null,
    kind: partial.kind ?? 'tool_permission',
    status: partial.status ?? 'open',
    payload: partial.payload ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    resolvedAt: partial.resolvedAt ?? null,
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
    apiKeySource: null,
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-latest',
    baseUrl: null,
    workspaceRoot: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    configPath: '/tmp/config.json',
    featureFlags: {
      enableScheduler: false,
    },
    executorLifecycleAvailability: buildDryRunAgentExecutorLifecycleAvailability(),
    toolScaffoldSummaries: summarizeAgentToolScaffoldFamilies({
      policy: {
        allowLocalWorkspaceRead: false,
        allowTaskMutationTools: false,
      },
    }),
  };

  const briefData: HomeBriefData = {
    activeTaskCount: 2,
    pendingDecisionCount: 1,
    completedTaskCount: 0,
    recentRunCount: 1,
    waitingTaskCount: 1,
    blockerTaskCount: 0,
    escalationTaskCount: 0,
    highRiskTaskCount: 1,
    missingNextStepTaskCount: 0,
    recentTasks: [waitingTask, riskTask],
    waitingTasks: [waitingTask],
    blockerTasks: [],
    escalationTasks: [],
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
        lane: 'escalate_now',
        currentState: '状态：running · 风险：high · Deadline slipping',
        latestChange: {
          summary: '最近决策动态：Approve escalation path · approved',
          action: {
            label: '查看 Decision',
            targetType: 'decision',
            targetId: 'decision_2',
          },
        },
        keySource: {
          sourceContextId: 'source_context_home_1',
          title: 'Owner escalation memo',
          priorityReason: '材料架中的关键来源：Contains the latest escalation framing.',
        },
        currentMethod: {
          title: 'Risk review skill',
          selectionReason: '当前方法最近用于执行：风险高且需要先复盘 blocker。',
        },
        nextSuggestedMove: '已获批准，继续推进：Approve escalation path',
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
        lane: 'clarify',
        currentState: '状态：waiting_external · 等待：Waiting for legal review',
        latestChange: {
          summary: '最近没有新的关键变化。',
          action: {
            label: null,
            targetType: null,
            targetId: null,
          },
        },
        keySource: {
          sourceContextId: null,
          title: null,
          priorityReason: null,
        },
        currentMethod: {
          title: null,
          selectionReason: null,
        },
        nextSuggestedMove: '跟进并确认是否解除等待：Waiting for legal review',
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
        id: 'decision:decision_4',
        sourceType: 'decision',
        sourceId: 'decision_4',
        taskId: riskTask.id,
        taskTitle: riskTask.title,
        title: 'Cancel unsafe checkpoint',
        status: 'cancelled',
        updatedAt: '2026-01-01T00:20:00.000Z',
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
    createBlocker: vi.fn().mockImplementation(async (input) =>
      buildBlocker({
        taskId: input.taskId,
        title: input.title,
        kind: input.kind,
        detail: input.detail ?? null,
        owner: input.owner ?? null,
        sourceContextId: input.sourceContextId ?? null,
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    ),
    updateBlocker: vi.fn().mockImplementation(async (input) =>
      buildBlocker({
        id: input.id,
        taskId: riskTask.id,
        title: input.title ?? 'Updated blocker',
        kind: input.kind ?? 'approval',
        detail: input.detail ?? 'Updated blocker detail',
        owner: input.owner ?? 'Legal',
        sourceContextId: input.sourceContextId ?? null,
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    ),
    resolveBlocker: vi.fn().mockImplementation(async (id) =>
      buildBlocker({
        id,
        taskId: riskTask.id,
        status: 'resolved',
        resolvedAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    ),
    createCompletionCriteria: vi.fn().mockImplementation(async (input) =>
      buildCompletionCriteria({
        taskId: input.taskId,
        text: input.text,
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    ),
    updateCompletionCriteria: vi.fn().mockImplementation(async (input) =>
      buildCompletionCriteria({
        id: input.id,
        taskId: riskTask.id,
        text: input.text,
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    ),
    satisfyCompletionCriteria: vi.fn().mockImplementation(async (id) =>
      buildCompletionCriteria({
        id,
        taskId: riskTask.id,
        status: 'satisfied',
        updatedAt: '2026-01-02T00:00:00.000Z',
        satisfiedAt: '2026-01-02T00:00:00.000Z',
      }),
    ),
    reopenCompletionCriteria: vi.fn().mockImplementation(async (id) =>
      buildCompletionCriteria({
        id,
        taskId: riskTask.id,
        status: 'open',
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    ),
    createTaskDependency: vi.fn().mockImplementation(async (input) => ({
      id: 'task_dependency_created',
      taskId: input.taskId,
      blockedByTaskId: input.blockedByTaskId,
      blockedByTaskTitle: waitingTask.id === input.blockedByTaskId ? waitingTask.title : riskTask.title,
      reason: input.reason ?? null,
      status: 'active' as const,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      resolvedAt: null,
    })),
    updateTaskDependency: vi.fn().mockImplementation(async (input) => ({
      id: input.id,
      taskId: riskTask.id,
      blockedByTaskId: waitingTask.id,
      blockedByTaskTitle: waitingTask.title,
      reason: input.reason ?? 'Waiting on upstream task completion',
      status: 'active' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      resolvedAt: null,
    })),
    resolveTaskDependency: vi.fn().mockImplementation(async (id) => ({
      id,
      taskId: riskTask.id,
      blockedByTaskId: waitingTask.id,
      blockedByTaskTitle: waitingTask.title,
      reason: 'Waiting on upstream task completion',
      status: 'resolved' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      resolvedAt: '2026-01-02T00:00:00.000Z',
    })),
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
    triggerOperatorStartedRun: vi.fn(),
    continuePausedRun: vi.fn(),
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

  it('shows partial executor lifecycle controls in settings diagnostics', async () => {
    const user = userEvent.setup();
    window.api = {
      ...mockApi,
      getAiConfigStatus: vi.fn().mockResolvedValue({
        ...aiStatus,
        executorLifecycleAvailability: buildDryRunAgentExecutorLifecycleAvailability({
          controlSupport: {
            cancel: false,
          },
        }),
      }),
    };

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /settings/i }));
    await screen.findByRole('heading', { name: 'AI Provider 与本地密钥存储' });

    const orchestrationDiagnostics = within(screen.getByLabelText('Orchestration diagnostics'));
    expect(orchestrationDiagnostics.getByText(
      'controlRequests=heartbeat,interrupt / controlMode=dry_run_planned',
    )).toBeTruthy();
    expect(orchestrationDiagnostics.getByText(
      'runtimeAuthority=diagnostic_only / executionAuthority=no',
    )).toBeTruthy();
    expect(orchestrationDiagnostics.getByText('unsupportedControlRequests=cancel')).toBeTruthy();
    expect(orchestrationDiagnostics.getByText(
      'settleResults=completed,failed,paused / settleMode=dry_run_planned',
    )).toBeTruthy();
    expect(orchestrationDiagnostics.queryByText(
      'controlRequests=heartbeat,interrupt,cancel / controlMode=dry_run_planned',
    )).toBeNull();
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
    const activeSlicesSection = screen.getByRole('heading', { name: 'Active Slices' }).closest('.detail-card-group');
    expect(activeSlicesSection).toBeTruthy();
    expect(
      within(activeSlicesSection as HTMLElement).getByText('waiting item · active · since 2026-01-01T00:00:00.000Z'),
    ).toBeTruthy();
  });

  it('shows a task resume card at the top of the current snapshot', async () => {
    const user = userEvent.setup();

    const resumeDetail = buildTaskDetail(riskTask);
    resumeDetail.resumeCard = {
      summary:
        '这条任务目前处于 running，且存在高风险“Deadline slipping”。 最近一次执行失败：Model overloaded。 当前最关键的来源材料是“Owner escalation memo”。 当前采用的方法模板是“Risk review skill”。 建议先做：处理当前风险并确认是否需要降级：Deadline slipping',
      currentState: '状态：running · 风险：high · Deadline slipping',
      latestChange: {
        summary: '最近一次执行失败：Model overloaded。',
        action: {
          label: '查看 Run',
          targetType: 'run',
          targetId: 'run_resume_latest',
        },
      },
      completionStatus: {
        total: 0,
        satisfied: 0,
        open: 0,
        summary: '尚未定义完成标准',
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
      currentBlocker: {
        blockerId: null,
        title: '暂无当前阻塞项',
        detail: null,
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
    expect(within(resumeSection as HTMLElement).getByText('立即升级')).toBeTruthy();
    expect(
      within(resumeSection as HTMLElement).getByText(
        '这条任务当前在跨任务队列里按这类优先级语义排序。',
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('heading', { name: 'Task Resume Card' })
        .compareDocumentPosition(screen.getByText('Task Basics')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Active Slices' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Context Slices' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Task Signals' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Key Source Materials' })).toBeNull();
  });

  it('shows a closeout-aware lane label on task resume cards', async () => {
    const user = userEvent.setup();

    const closeoutTask = buildTaskRecord({
      id: 'task_closeout_resume',
      title: 'Closeout resume task',
      state: 'planned',
      nextStep: 'Confirm final sign-off',
    });

    const closeoutDetail = buildTaskDetail(closeoutTask);
    closeoutDetail.resumeCard = {
      ...closeoutDetail.resumeCard,
      latestChange: {
        summary: '最近一条决策已获批准：Approve final launch brief，这可能说明某些完成标准已具备。',
        action: {
          label: '查看 Decision',
          targetType: 'decision',
          targetId: 'decision_closeout',
        },
      },
      completionStatus: {
        total: 2,
        satisfied: 1,
        open: 1,
        summary: '已满足 1/2 条完成标准',
      },
      nextSuggestedMove: '先对照 Completion Criteria，判断这次批准是否已满足完成标准。',
    };

    window.api = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([closeoutTask]),
      getTaskDetail: vi.fn(async (taskId: string) => (taskId === closeoutTask.id ? closeoutDetail : null)),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        recentTasks: [closeoutTask],
        completionReadyTaskCount: 0,
        nearCompletionTaskCount: 1,
        nearCompletionTasks: [
          {
            ...closeoutTask,
            completionProgress: { total: 2, satisfied: 1, open: 1 },
          },
        ],
      }),
    };

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /closeout resume task/i }));
    await screen.findByRole('heading', { name: 'Closeout resume task' });

    const resumeSection = screen.getByRole('heading', { name: 'Task Resume Card' }).closest('.detail-card-group');

    expect(resumeSection).not.toBeNull();
    expect(within(resumeSection as HTMLElement).getByText('继续推进/复核 · 收尾判断')).toBeTruthy();
    expect(
      within(resumeSection as HTMLElement).getByText(
        '最近一条决策已获批准：Approve final launch brief，这可能说明某些完成标准已具备。',
      ),
    ).toBeTruthy();
    expect(
      within(resumeSection as HTMLElement).getByText(
        '先对照 Completion Criteria，判断这次批准是否已满足完成标准。',
      ),
    ).toBeTruthy();

    const actionDesk = screen.getByRole('heading', { name: '动作与状态流转' }).closest('.detail-stage');
    expect(actionDesk).toBeTruthy();
    expect(within(actionDesk as HTMLElement).getByRole('button', { name: '核对完成标准' })).toBeTruthy();
    expect(within(actionDesk as HTMLElement).getByRole('button', { name: '调整任务状态' })).toBeTruthy();
    expect(within(actionDesk as HTMLElement).queryByRole('button', { name: '配置并触发 Run' })).toBeNull();
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
      latestChange: {
        summary: '最近更新了来源材料：Launch reference memo。',
        action: {
          label: '查看来源',
          targetType: 'source_context',
          targetId: 'source_context_resume_action',
        },
      },
      completionStatus: {
        total: 0,
        satisfied: 0,
        open: 0,
        summary: '尚未定义完成标准',
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
      currentBlocker: {
        blockerId: null,
        title: '暂无当前阻塞项',
        detail: null,
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
      within(resumeSection as HTMLElement).getByRole('button', { name: '打开 Material Shelf' }),
    );
    expect((screen.getByLabelText('来源标题') as HTMLInputElement).value).toBe(
      'Launch reference memo',
    );

    await user.click(
      within(resumeSection as HTMLElement).getByRole('button', { name: '打开 Active Methods' }),
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
      latestChange: {
        summary: '最近一条决策已获批准：Approve launch。',
        action: {
          label: '查看 Decision',
          targetType: 'decision',
          targetId: 'decision_resume_latest',
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

  it('shows lightweight priority lane labels on home key signal groups', async () => {
    render(<App />);

    const waitingSection = screen.getByText('Waiting Tasks').closest('section');
    const blockedSection = screen.getByText('Blocked Tasks').closest('section');
    const escalationSection = screen
      .getAllByText('Needs Escalation')
      .map((node) => node.closest('section'))
      .find((section) => section?.className.includes('timeline-list'));
    const nextStepSection = screen.getByText('Needs Next Step').closest('section');

    expect(waitingSection).toBeTruthy();
    expect(blockedSection).toBeTruthy();
    expect(escalationSection).toBeTruthy();
    expect(nextStepSection).toBeTruthy();

    expect(within(waitingSection as HTMLElement).getByText('先补清晰度')).toBeTruthy();
    expect(within(blockedSection as HTMLElement).getByText('先解阻塞/拍板')).toBeTruthy();
    expect(within(escalationSection as HTMLElement).getByText('立即升级')).toBeTruthy();
    expect(within(nextStepSection as HTMLElement).getByText('先补清晰度')).toBeTruthy();
  });

  it('surfaces closeout tasks on home key signals', async () => {
    const user = userEvent.setup();

    const readyTask = buildTaskRecord({
      id: 'task_ready_home',
      title: 'Ready to finish task',
      state: 'planned',
      nextStep: 'Do final sign-off',
    });
    const nearTask = buildTaskRecord({
      id: 'task_near_home',
      title: 'Almost done task',
      state: 'planned',
      nextStep: 'Finish last criterion',
    });

    window.api = {
      ...mockApi,
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        completionReadyTaskCount: 1,
        nearCompletionTaskCount: 1,
        completionReadyTasks: [
          {
            ...readyTask,
            completionProgress: {
              total: 2,
              satisfied: 2,
              open: 0,
              satisfiedCriteriaHighlights: ['Stakeholder approved', 'Draft delivered'],
              nextOpenCriterion: null,
            },
            closeoutEvidence: {
              sourceType: 'decision',
              sourceId: 'decision_2',
              title: 'Approve escalation path',
              status: 'approved',
            },
          },
        ],
        nearCompletionTasks: [
          {
            ...nearTask,
            completionProgress: {
              total: 2,
              satisfied: 1,
              open: 1,
              satisfiedCriteriaHighlights: ['Draft delivered'],
              nextOpenCriterion: 'Final review recorded',
              nextOpenResponsibilitySummary: '确认责任：客户确认',
            },
            closeoutEvidence: {
              sourceType: 'decision',
              sourceId: 'decision_2',
              title: 'Approve escalation path',
              status: 'approved',
            },
          },
        ],
      }),
      listTasks: vi.fn().mockResolvedValue([readyTask, nearTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        const task = taskId === readyTask.id ? readyTask : nearTask;
        const detail = buildTaskDetail(task);
        detail.resumeCard = {
          ...detail.resumeCard,
          completionStatus:
            taskId === readyTask.id
              ? {
                  total: 2,
                  satisfied: 2,
                  open: 0,
                  summary: '已满足全部完成标准',
                }
              : {
                  total: 2,
                  satisfied: 1,
                  open: 1,
                  summary: '还差 1 条完成标准',
                },
        };
        return detail;
      }),
    };

    render(<App />);

    const readyTaskText = await screen.findByText('Ready to finish task');
    const closeoutSection = screen.getByText('Closeout Tasks').closest('section');
    expect(closeoutSection).toBeTruthy();
    expect(within(closeoutSection as HTMLElement).getByText('继续推进/复核 · 收尾判断')).toBeTruthy();
    expect(
      within(closeoutSection as HTMLElement).getByText(
        '这里区分已经具备收尾条件的任务，和还需要先核对最后证据的接近完成任务。',
      ),
    ).toBeTruthy();
    expect(readyTaskText).toBeTruthy();
    expect(within(closeoutSection as HTMLElement).getByText('Almost done task')).toBeTruthy();
    expect(within(closeoutSection as HTMLElement).getByText('可收尾')).toBeTruthy();
    expect(within(closeoutSection as HTMLElement).getByText('待核对证据')).toBeTruthy();
    expect(within(closeoutSection as HTMLElement).getByText('完成标准已全部满足，建议做最终收尾判断。')).toBeTruthy();
    expect(
      within(closeoutSection as HTMLElement).getByText('已满足：Stakeholder approved；Draft delivered'),
    ).toBeTruthy();
    expect(
      within(closeoutSection as HTMLElement).getByText('当前最终收尾依据：决策批准 · Approve escalation path'),
    ).toBeTruthy();
    expect(within(closeoutSection as HTMLElement).getByRole('button', { name: '查看最终收尾依据' })).toBeTruthy();
    expect(
      within(closeoutSection as HTMLElement).getByText(
        '只差最后一条完成标准，先核对最后证据，再由客户确认是否收尾。',
      ),
    ).toBeTruthy();
    expect(
      within(closeoutSection as HTMLElement).getByText('当前收尾证据：决策批准 · Approve escalation path'),
    ).toBeTruthy();
    expect(within(closeoutSection as HTMLElement).getByText('已满足：Draft delivered')).toBeTruthy();
    expect(within(closeoutSection as HTMLElement).getByText('最后还差：Final review recorded')).toBeTruthy();
    expect(within(closeoutSection as HTMLElement).getByText('确认责任：客户确认')).toBeTruthy();
    expect(within(closeoutSection as HTMLElement).getByRole('button', { name: '查看收尾证据' })).toBeTruthy();

    await user.click(within(closeoutSection as HTMLElement).getByRole('button', { name: '查看最终收尾依据' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Approve escalation path' })).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /home/i }));
    const closeoutSectionAfterReadyEvidence = (await screen.findByText('Closeout Tasks')).closest('section');
    expect(closeoutSectionAfterReadyEvidence).toBeTruthy();

    await user.click(within(closeoutSectionAfterReadyEvidence as HTMLElement).getByRole('button', { name: '查看收尾证据' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Approve escalation path' })).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /home/i }));
    const closeoutSectionAfterReturn = (await screen.findByText('Closeout Tasks')).closest('section');
    expect(closeoutSectionAfterReturn).toBeTruthy();

    await user.click(
      within(closeoutSectionAfterReturn as HTMLElement).getByRole('button', { name: /Ready to finish task/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Ready to finish task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '确认完成标准已满足，并判断是否将“Ready to finish task”转到 completed。',
    );
    const readyActionDesk = screen.getByRole('heading', { name: '动作与状态流转' }).closest('.detail-stage');
    expect(readyActionDesk).toBeTruthy();
    expect(within(readyActionDesk as HTMLElement).getByRole('button', { name: '最终收尾判断' })).toBeTruthy();
    expect(within(readyActionDesk as HTMLElement).getByRole('button', { name: '调整任务状态' })).toBeTruthy();
  });

  it('orders tasks by priority lane and shows lane labels in the task list', async () => {
    const user = userEvent.setup();

    const laneRiskTask = buildTaskRecord({
      id: 'task_lane_risk',
      title: 'Lane risk task',
      state: 'planned',
      riskLevel: 'high',
      riskNote: 'Critical launch blocker',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    const laneWaitingTask = buildTaskRecord({
      id: 'task_lane_waiting',
      title: 'Lane waiting task',
      state: 'waiting_external',
      waitingReason: 'Waiting for reviewer confirmation',
      updatedAt: '2026-01-03T00:00:00.000Z',
    });
    const laneSteadyTask = buildTaskRecord({
      id: 'task_lane_steady',
      title: 'Lane steady task',
      state: 'planned',
      nextStep: 'Continue outreach',
      updatedAt: '2026-01-04T00:00:00.000Z',
    });

    window.api = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([laneSteadyTask, laneWaitingTask, laneRiskTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        const task = [laneSteadyTask, laneWaitingTask, laneRiskTask].find((item) => item.id === taskId) ?? laneRiskTask;
        return buildTaskDetail(task);
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 3,
        recentTasks: [laneRiskTask, laneWaitingTask, laneSteadyTask],
        highRiskTaskCount: 1,
        waitingTaskCount: 1,
        highRiskTasks: [laneRiskTask],
        waitingTasks: [laneWaitingTask],
        recommendedActions: [],
      }),
    };

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));

    const taskButtons = await screen.findAllByRole('button', { name: /Lane .* task/i });
    expect(taskButtons[0]?.textContent).toContain('Lane risk task');
    expect(taskButtons[1]?.textContent).toContain('Lane waiting task');
    expect(taskButtons[2]?.textContent).toContain('Lane steady task');

    expect(within(taskButtons[0]).getByText('立即升级')).toBeTruthy();
    expect(within(taskButtons[1]).getByText('先补清晰度')).toBeTruthy();
    expect(within(taskButtons[2]).getByText('稳态推进')).toBeTruthy();
  });

  it('prioritizes completion-ready tasks ahead of near-completion tasks within continue/review lane', async () => {
    const user = userEvent.setup();

    const readyTask = buildTaskRecord({
      id: 'task_lane_closeout_ready',
      title: 'Completion ready task',
      state: 'planned',
      nextStep: 'Finalize and close',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    const nearTask = buildTaskRecord({
      id: 'task_lane_closeout_near',
      title: 'Near completion task',
      state: 'planned',
      nextStep: 'Verify final evidence',
      updatedAt: '2026-01-03T00:00:00.000Z',
    });

    window.api = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([nearTask, readyTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        const task = taskId === readyTask.id ? readyTask : nearTask;
        return buildTaskDetail(task);
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 2,
        recentTasks: [readyTask, nearTask],
        completionReadyTaskCount: 1,
        nearCompletionTaskCount: 1,
        completionReadyTasks: [
          {
            ...readyTask,
            completionProgress: { total: 2, satisfied: 2, open: 0 },
          },
        ],
        nearCompletionTasks: [
          {
            ...nearTask,
            completionProgress: { total: 2, satisfied: 1, open: 1 },
          },
        ],
        recommendedActions: [],
      }),
    };

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));

    const taskButtons = await screen.findAllByRole('button', {
      name: /Completion ready task|Near completion task/i,
    });

    expect(taskButtons[0]?.textContent).toContain('Completion ready task');
    expect(taskButtons[1]?.textContent).toContain('Near completion task');
    expect(within(taskButtons[0] as HTMLElement).getByText('继续推进/复核')).toBeTruthy();
    expect(within(taskButtons[1] as HTMLElement).getByText('继续推进/复核')).toBeTruthy();
  });

  it('adds subtle lane section dividers to the task list when the lane changes', async () => {
    const user = userEvent.setup();

    const laneRiskTask = buildTaskRecord({
      id: 'task_lane_section_risk',
      title: 'Lane section risk task',
      state: 'planned',
      riskLevel: 'high',
      riskNote: 'Critical launch blocker',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    const laneWaitingTask = buildTaskRecord({
      id: 'task_lane_section_waiting',
      title: 'Lane section waiting task',
      state: 'waiting_external',
      waitingReason: 'Waiting for reviewer confirmation',
      updatedAt: '2026-01-03T00:00:00.000Z',
    });
    const laneSteadyTask = buildTaskRecord({
      id: 'task_lane_section_steady',
      title: 'Lane section steady task',
      state: 'planned',
      nextStep: 'Continue outreach',
      updatedAt: '2026-01-04T00:00:00.000Z',
    });

    window.api = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([laneSteadyTask, laneWaitingTask, laneRiskTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        const task =
          [laneSteadyTask, laneWaitingTask, laneRiskTask].find((item) => item.id === taskId) ??
          laneRiskTask;
        return buildTaskDetail(task);
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 3,
        recentTasks: [laneRiskTask, laneWaitingTask, laneSteadyTask],
        highRiskTaskCount: 1,
        waitingTaskCount: 1,
        highRiskTasks: [laneRiskTask],
        waitingTasks: [laneWaitingTask],
        recommendedActions: [],
      }),
    };

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await screen.findByRole('button', { name: /Lane section risk task/i });

    const laneSections = document.querySelectorAll('.task-lane-section');
    expect(laneSections).toHaveLength(3);
    expect(within(laneSections[0] as HTMLElement).getByText('立即升级')).toBeTruthy();
    expect(within(laneSections[1] as HTMLElement).getByText('先补清晰度')).toBeTruthy();
    expect(within(laneSections[2] as HTMLElement).getByText('稳态推进')).toBeTruthy();
  });

  it('shows a lane-aware summary above the task list', async () => {
    const user = userEvent.setup();

    const laneRiskTask = buildTaskRecord({
      id: 'task_lane_summary_risk',
      title: 'Lane summary risk task',
      state: 'planned',
      riskLevel: 'high',
      riskNote: 'Critical launch blocker',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    const laneWaitingTask = buildTaskRecord({
      id: 'task_lane_summary_waiting',
      title: 'Lane summary waiting task',
      state: 'waiting_external',
      waitingReason: 'Waiting for reviewer confirmation',
      updatedAt: '2026-01-03T00:00:00.000Z',
    });
    const laneSteadyTask = buildTaskRecord({
      id: 'task_lane_summary_steady',
      title: 'Lane summary steady task',
      state: 'planned',
      nextStep: 'Continue outreach',
      updatedAt: '2026-01-04T00:00:00.000Z',
    });

    window.api = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([laneSteadyTask, laneWaitingTask, laneRiskTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        const task =
          [laneSteadyTask, laneWaitingTask, laneRiskTask].find((item) => item.id === taskId) ??
          laneRiskTask;
        return buildTaskDetail(task);
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 3,
        recentTasks: [laneRiskTask, laneWaitingTask, laneSteadyTask],
        highRiskTaskCount: 1,
        waitingTaskCount: 1,
        highRiskTasks: [laneRiskTask],
        waitingTasks: [laneWaitingTask],
        recommendedActions: [],
      }),
    };

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));

    expect(
      await screen.findByText(/当前队列会先处理「立即升级」，再到「先补清晰度」；共 3 条任务，分布在 3 个优先级层次。/),
    ).toBeTruthy();
  });

  it('uses clarify-first task list copy for newly captured work', async () => {
    const user = userEvent.setup();

    const capturedTask = buildTaskRecord({
      id: 'task_lane_summary_captured',
      title: 'Captured lane task',
      state: 'captured',
      summary: null,
      nextStep: null,
      updatedAt: '2026-01-06T00:00:00.000Z',
    });
    const steadyTask = buildTaskRecord({
      id: 'task_lane_summary_steady_2',
      title: 'Steady lane task',
      state: 'planned',
      nextStep: 'Continue outreach',
      updatedAt: '2026-01-04T00:00:00.000Z',
    });

    window.api = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([steadyTask, capturedTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        const task =
          [steadyTask, capturedTask].find((item) => item.id === taskId) ??
          capturedTask;
        return buildTaskDetail(task);
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 2,
        recentTasks: [capturedTask, steadyTask],
        missingNextStepTaskCount: 1,
        missingNextStepTasks: [capturedTask],
        waitingTaskCount: 0,
        waitingTasks: [],
        recommendedActions: [],
      }),
    };

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));

    expect(
      await screen.findByText(
        /当前队列先处理新进入系统、还需整理清楚的任务；共 2 条任务，先补摘要、下一步和是否需要拍板。/,
      ),
    ).toBeTruthy();

    const capturedButton = await screen.findByRole('button', { name: /Captured lane task/i });
    expect(within(capturedButton).getByText('刚进入系统，先补一句任务摘要。')).toBeTruthy();
    expect(
      within(capturedButton).getByText('整理重点：先补一句任务摘要，再明确下一步。'),
    ).toBeTruthy();
  });

  it('explains dependency re-evaluation in the task list when an upstream task is ready', async () => {
    const user = userEvent.setup();

    const upstreamTask = buildTaskRecord({
      id: 'task_dependency_upstream',
      title: 'Publish partner list',
      state: 'completed',
      nextStep: null,
      updatedAt: '2026-01-08T00:00:00.000Z',
    });
    const dependencyTask = buildTaskRecord({
      id: 'task_dependency_downstream',
      title: 'Resume outreach draft',
      state: 'planned',
      summary: null,
      nextStep: null,
      updatedAt: '2026-01-09T00:00:00.000Z',
      activeDependency: {
        id: 'dependency_1',
        taskId: 'task_dependency_downstream',
        blockedByTaskId: 'task_dependency_upstream',
        blockedByTaskTitle: 'Publish partner list',
        reason: 'Need the final list before resuming outreach',
        status: 'active',
        createdAt: '2026-01-07T00:00:00.000Z',
        updatedAt: '2026-01-07T00:00:00.000Z',
        resolvedAt: null,
      },
      dependencyReevaluation: {
        dependencyId: 'dependency_1',
        upstreamTaskId: 'task_dependency_upstream',
        upstreamTaskTitle: 'Publish partner list',
        status: 'upstream_ready',
        updatedAt: '2026-01-08T00:00:00.000Z',
      },
    });

    window.api = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([upstreamTask, dependencyTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        const task =
          [upstreamTask, dependencyTask].find((item) => item.id === taskId) ??
          dependencyTask;
        return buildTaskDetail(task);
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 2,
        recentTasks: [dependencyTask, upstreamTask],
        recentActivity: [
          {
            id: 'dependency:dependency_1:upstream_ready',
            sourceType: 'dependency',
            sourceId: 'dependency_1',
            lane: 'continue_or_review',
            relatedTaskId: 'task_dependency_upstream',
            taskId: 'task_dependency_downstream',
            taskTitle: 'Resume outreach draft',
            title: 'Publish partner list',
            status: 'upstream_ready',
            updatedAt: '2026-01-08T00:00:00.000Z',
          },
        ],
        recommendedActions: [],
      }),
    };

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));

    expect(
      await screen.findByText(
        /当前队列先重新判断已具备条件的依赖任务；共 2 条任务，优先确认上游任务完成或解阻塞后是否可以恢复推进。/,
      ),
    ).toBeTruthy();

    const dependencyButton = await screen.findByRole('button', {
      name: /Resume outreach draft/i,
    });
    expect(
      within(dependencyButton).getByText('上游任务已完成，建议重新判断是否解除依赖。'),
    ).toBeTruthy();
    expect(
      within(dependencyButton).getByText(
        '重判重点：确认上游任务已完成后，这条任务是否可以恢复推进。',
      ),
    ).toBeTruthy();
    expect(
      within(dependencyButton).getByText('依赖重判：上游任务“Publish partner list”已完成。'),
    ).toBeTruthy();
  });

  it('adds dependency re-evaluation and upstream entry actions to current dependency on the task page', async () => {
    const user = userEvent.setup();

    const upstreamTask = buildTaskRecord({
      id: 'task_dependency_focus_upstream',
      title: 'Publish partner list',
      state: 'completed',
      nextStep: 'Share the final partner list',
      updatedAt: '2026-01-08T00:00:00.000Z',
    });
    const dependencyTask = buildTaskRecord({
      id: 'task_dependency_focus_downstream',
      title: 'Resume outreach draft',
      state: 'planned',
      nextStep: null,
      updatedAt: '2026-01-09T00:00:00.000Z',
      activeDependency: buildTaskDependency({
        id: 'dependency_focus_1',
        taskId: 'task_dependency_focus_downstream',
        blockedByTaskId: 'task_dependency_focus_upstream',
        blockedByTaskTitle: 'Publish partner list',
        reason: 'Need the final list before resuming outreach',
      }),
    });

    const dependencyDetail: TaskDetail = {
      ...buildTaskDetail(dependencyTask),
      dependencyReevaluation: {
        dependencyId: 'dependency_focus_1',
        upstreamTaskId: 'task_dependency_focus_upstream',
        upstreamTaskTitle: 'Publish partner list',
        status: 'upstream_ready',
        updatedAt: '2026-01-08T00:00:00.000Z',
      },
      resumeCard: {
        ...buildTaskDetail(dependencyTask).resumeCard,
        summary: '当前依赖已具备恢复推进条件：上游任务“Publish partner list”已完成。',
        currentDependency: {
          dependencyId: 'dependency_focus_1',
          title: 'Publish partner list',
          detail: '上游任务“Publish partner list”已完成，可重新判断是否解除依赖。',
          priorityReason: '上游任务“Publish partner list”已完成，可重新判断是否解除依赖。',
          ageLabel: 'depends since 2026-01-07',
        },
        latestChange: {
          summary: '上游任务已完成：Publish partner list，可重新判断当前依赖。',
          action: {
            label: null,
            targetType: null,
            targetId: null,
          },
        },
        nextSuggestedMove: '基于上游任务完成重新判断是否解除依赖：Publish partner list',
      },
    };

    window.api = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([dependencyTask, upstreamTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId === dependencyTask.id) {
          return dependencyDetail;
        }

        if (taskId === upstreamTask.id) {
          return buildTaskDetail(upstreamTask);
        }

        return null;
      }),
    };

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /Resume outreach draft/i }));

    const actionDesk = screen.getByRole('heading', { name: '动作与状态流转' }).closest('.detail-stage');
    expect(actionDesk).toBeTruthy();
    expect(within(actionDesk as HTMLElement).getByRole('button', { name: '重新判断依赖' })).toBeTruthy();
    expect(within(actionDesk as HTMLElement).getByRole('button', { name: '调整任务状态' })).toBeTruthy();
    expect(within(actionDesk as HTMLElement).queryByRole('button', { name: '草拟或创建 Decision' })).toBeNull();

    await user.click(await screen.findByRole('button', { name: '打开 Task Dependency' }));

    const dependencyHeading = await screen.findByRole('heading', { name: 'Active Slices' });
    const dependencySection = dependencyHeading.closest('.detail-card-group');
    expect(dependencySection).toBeTruthy();

    await user.click(
      await within(dependencySection as HTMLElement).findByRole('button', { name: '重新判断依赖' }),
    );

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '基于上游任务完成重新判断是否解除依赖：Publish partner list',
    );

    await user.click(
      within(dependencySection as HTMLElement).getByRole('button', { name: '打开上游任务' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Publish partner list' })).toBeTruthy();
    });
  });

  it('adds direct dependency escalation actions on the task page for stale dependencies', async () => {
    const user = userEvent.setup();

    const upstreamTask = buildTaskRecord({
      id: 'task_dependency_stale_upstream',
      title: 'Finalize legal brief',
      state: 'planned',
      nextStep: 'Confirm the final legal review notes',
      updatedAt: '2026-01-08T00:00:00.000Z',
    });
    const dependencyTask = buildTaskRecord({
      id: 'task_dependency_stale_downstream',
      title: 'Launch outreach sequence',
      state: 'planned',
      nextStep: null,
      updatedAt: '2026-01-09T00:00:00.000Z',
      activeDependency: buildTaskDependency({
        id: 'dependency_stale_1',
        taskId: 'task_dependency_stale_downstream',
        blockedByTaskId: 'task_dependency_stale_upstream',
        blockedByTaskTitle: 'Finalize legal brief',
        reason: 'Need the legal brief before sending outreach',
        createdAt: '2025-09-01T00:00:00.000Z',
        updatedAt: '2025-09-01T00:00:00.000Z',
      }),
    });

    const dependencyDetail: TaskDetail = {
      ...buildTaskDetail(dependencyTask),
      resumeCard: {
        ...buildTaskDetail(dependencyTask).resumeCard,
        currentDependency: {
          dependencyId: 'dependency_stale_1',
          title: 'Finalize legal brief',
          detail: 'Need the legal brief before sending outreach',
          priorityReason: '这条依赖链已持续 112 天，建议优先推动上游任务或重新判断是否解除依赖。',
          ageLabel: 'depends since 2025-09-01 · 已依赖 112 天',
        },
      },
    };

    window.api = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([dependencyTask, upstreamTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId === dependencyTask.id) {
          return dependencyDetail;
        }

        if (taskId === upstreamTask.id) {
          return buildTaskDetail(upstreamTask);
        }

        return null;
      }),
    };

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /Launch outreach sequence/i }));
    await user.click(await screen.findByRole('button', { name: '打开 Task Dependency' }));

    const dependencyHeading = await screen.findByRole('heading', { name: 'Active Slices' });
    const dependencySection = dependencyHeading.closest('.detail-card-group');
    expect(dependencySection).toBeTruthy();

    await user.click(
      await within(dependencySection as HTMLElement).findByRole('button', { name: '直接升级依赖链路' }),
    );

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '优先推动上游任务“Finalize legal brief”，并重新判断是否解除对“Launch outreach sequence”的依赖。',
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

    const artifactSection = screen.getByRole('heading', { name: 'Recent Artifact' }).closest('.detail-card-group');

    expect(artifactSection).toBeTruthy();
    expect(within(artifactSection as HTMLElement).getByText('draft output')).toBeTruthy();
    expect(within(artifactSection as HTMLElement).getByText('source: run · run_artifact_1')).toBeTruthy();
    expect(within(artifactSection as HTMLElement).getByText('Drafted message to the customer.')).toBeTruthy();
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

  it('opens paused run follow-up directly from home recent activity actions', async () => {
    const user = userEvent.setup();
    const pausedBriefData: HomeBriefData = {
      ...briefData,
      recentActivity: [
        buildActivity({
          id: 'run:run_paused',
          sourceType: 'run',
          sourceId: 'run_paused',
          taskId: riskTask.id,
          taskTitle: riskTask.title,
          title: 'agent',
          status: 'paused',
        }),
      ],
    };
    const pausedActivityApi: ElectronApi = {
      ...mockApi,
      getHomeBrief: vi.fn(async () => pausedBriefData),
    };

    window.api = pausedActivityApi;

    render(<App />);

    const actionButton = await screen.findByRole('button', { name: '复核暂停原因' });
    await user.click(actionButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '复核最近一次 agent run 的暂停原因，处理阻塞后再继续。',
    );
  });

  it('opens decision and run follow-up actions from home recent activity', async () => {
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

    const reassessDecisionButton = await screen.findByRole('button', { name: '重新评估决策' });
    await user.click(reassessDecisionButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '重新评估该决策并确定替代推进路径：Cancel unsafe checkpoint',
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
    const riskTaskCard = await screen.findByRole('button', { name: /High risk task/i });
    await user.click(riskTaskCard);
    await screen.findByRole('heading', { name: 'High risk task' });

    const actionDesk = screen.getByRole('heading', { name: '动作与状态流转' }).closest('.detail-stage');
    expect(actionDesk).toBeTruthy();
    expect(within(actionDesk as HTMLElement).getByRole('button', { name: '草拟或创建 Decision' })).toBeTruthy();
    expect(within(actionDesk as HTMLElement).getByRole('button', { name: '调整任务状态' })).toBeTruthy();
    expect(within(actionDesk as HTMLElement).queryByRole('button', { name: '配置并触发 Run' })).toBeNull();
    expect(
      within(actionDesk as HTMLElement)
        .getByText('Decision')
        .compareDocumentPosition(within(actionDesk as HTMLElement).getByText('Run')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

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
    const riskTaskCard = await screen.findByRole('button', { name: /High risk task/i });
    await user.click(riskTaskCard);
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

  it('adapts quick action defaults to the current priority lane', async () => {
    const user = userEvent.setup();

    const responsibilityAwareRiskDetail: TaskDetail = {
      ...buildTaskDetail(riskTask),
      resumeCard: {
        ...buildTaskDetail(riskTask).resumeCard,
        completionStatus: {
          total: 1,
          satisfied: 0,
          open: 1,
          summary: '还差 1 条完成标准',
          nextOpenCriterion: 'Approve escalation path',
          nextOpenResponsibilitySummary: '确认责任：客户确认',
        },
      },
    };

    window.api = {
      ...mockApi,
      getTaskDetail: vi.fn(async (taskId: string) =>
        taskId === riskTask.id ? responsibilityAwareRiskDetail : taskDetails[taskId] ?? null,
      ),
    };

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    const riskTaskCard = await screen.findByRole('button', { name: /High risk task/i });
    await user.click(riskTaskCard);
    await screen.findByRole('heading', { name: 'High risk task' });

    expect((screen.getByLabelText('拍板背景') as HTMLTextAreaElement).value).toContain(
      '优先明确升级路径',
    );
    expect(screen.getByText('当前按「立即升级」语义，草拟更偏向明确升级路径、责任归属和拍板点。')).toBeTruthy();
    expect(
      screen.getByText('如果这次拍板会影响收尾判断，也应顺手明确最后由谁确认完成标准。确认责任：客户确认'),
    ).toBeTruthy();
    expect((screen.getByLabelText('附加要求') as HTMLTextAreaElement).value).toContain(
      '本轮执行优先围绕升级处理当前高风险/阻塞',
    );
    expect(screen.getByText('当前按「立即升级」语义，本轮 run 默认更偏向输出可直接用于升级处理的结果。')).toBeTruthy();
  });

  it('places run setup before decision setup for steady tasks', async () => {
    const user = userEvent.setup();
    const steadyTask = buildTaskRecord({
      id: 'task_action_setup_steady',
      title: 'Steady action setup task',
      state: 'planned',
      nextStep: 'Continue the draft',
    });

    window.api = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([steadyTask]),
      getTaskDetail: vi.fn().mockResolvedValue(buildTaskDetail(steadyTask)),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 1,
        pendingDecisionCount: 0,
        waitingTaskCount: 0,
        highRiskTaskCount: 0,
        recentTasks: [steadyTask],
        waitingTasks: [],
        highRiskTasks: [],
        pendingDecisions: [],
        recommendedActions: [],
        recentArtifacts: [],
        recentSourceContexts: [],
        recentTaskResumes: [],
        recentActivity: [],
      }),
    };

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /Steady action setup task/i }));
    await screen.findByRole('heading', { name: 'Steady action setup task' });

    const actionDesk = screen.getByRole('heading', { name: '动作与状态流转' }).closest('.detail-stage');
    expect(actionDesk).toBeTruthy();
    expect(
      within(actionDesk as HTMLElement)
        .getByText('Run')
        .compareDocumentPosition(within(actionDesk as HTMLElement).getByText('Decision')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('submits a quick run from task detail', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    const riskTaskCard = await screen.findByRole('button', { name: /High risk task/i });
    await user.click(riskTaskCard);
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

  it('submits an agent quick run with read-only workspace access when enabled', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    const riskTaskCard = await screen.findByRole('button', { name: /High risk task/i });
    await user.click(riskTaskCard);
    await screen.findByRole('heading', { name: 'High risk task' });

    await user.selectOptions(screen.getByLabelText('Run 类型'), 'agent');
    expect(
      screen.getByText(
        'Agent 能力预览：anthropic / claude-3-5-sonnet-latest / text-only planning unavailable until AI config is ready / read-only workspace context disabled for this run / task update/evidence tools disabled for this run / structured tool calls unavailable until AI config is ready / sandbox coding lane disabled; workspace patch/commands unavailable',
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: '允许只读工作区上下文' }));
    await user.click(screen.getByRole('checkbox', { name: '允许任务内更新/证据工具' }));
    expect(
      screen.getByText(
        'Agent 能力预览：anthropic / claude-3-5-sonnet-latest / text-only planning unavailable until AI config is ready / read-only workspace context enabled for this run / task update/evidence tools enabled for this run / structured tool calls unavailable until AI config is ready / sandbox coding lane disabled; workspace patch/commands unavailable',
      ),
    ).toBeTruthy();

    const instructionsInput = screen.getByLabelText('附加要求');
    await user.clear(instructionsInput);
    await user.type(instructionsInput, 'Inspect local files before writing the note');
    await user.click(screen.getByRole('button', { name: '触发 Run' }));

    await waitFor(() => {
      expect(mockApi.triggerRun).toHaveBeenCalledWith({
        taskId: riskTask.id,
        type: 'agent',
        instructions: 'Inspect local files before writing the note',
        allowLocalWorkspaceRead: true,
        allowTaskMutationTools: true,
      });
    });
  });

  it('shows manual code-agent runtime readiness from task detail without starting a run', async () => {
    const user = userEvent.setup();
    const readySandboxStatus: Awaited<ReturnType<NonNullable<ElectronApi['probeSandboxBackend']>>> = {
      probe: {
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
      },
      profile: {
        credentialPassthrough: false,
        environmentPolicy: 'empty',
        id: 'local-container',
        isolation: 'container',
        kind: 'local_container',
        networkMode: 'disabled',
        supportsOutputLimits: true,
        supportsPatchArtifacts: true,
        supportsStagedWrites: true,
        supportsStructuredCommands: true,
        supportsTargetedCommands: true,
        supportsWorkspaceMount: true,
      },
      producerBackendReadiness: {
        blockedReasons: ['sandbox coding-agent feature flag is disabled'],
        ready: false,
        summary: 'Sandboxed coding producer backend blocked: sandbox coding-agent feature flag is disabled',
      },
      readiness: {
        blockedReasons: [],
        ready: true,
        summary: 'Sandbox backend ready: local-container.',
      },
      summary: 'Sandbox backend ready: local-container.',
    };
    const runtimeApi: ElectronApi = {
      ...mockApi,
      probeSandboxBackend: vi.fn(async () => readySandboxStatus),
    };
    window.api = runtimeApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    const riskTaskCard = await screen.findByRole('button', { name: /High risk task/i });
    await user.click(riskTaskCard);
    await screen.findByRole('heading', { name: 'High risk task' });

    expect(screen.getByText('Code Agent Runtime')).toBeTruthy();
    expect(screen.getByText(
      'ExecutionRuntime：未检查 / local_container / staged patch requires manual readiness check',
    )).toBeTruthy();
    expect(screen.getByText(
      'staged patch / network disabled / credentials none / Decision promotion',
    )).toBeTruthy();
    expect(screen.getByText(
      'Code Agent preflight：blocked / runtime=needs readiness check / checks=unavailable / producer=local diagnostic; no provider call / promotion=Decision required / next=check Code Agent runtime readiness first.',
    )).toBeTruthy();
    expect(screen.getByText('Start blocked：check Code Agent runtime readiness first.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '检查运行时' }));

    expect(runtimeApi.probeSandboxBackend).toHaveBeenCalledTimes(1);
    expect(runtimeApi.triggerRun).not.toHaveBeenCalled();
    expect(await screen.findByText(
      'ExecutionRuntime：blocked / Sandboxed coding producer backend blocked: sandbox coding-agent feature flag is disabled',
    )).toBeTruthy();
  });

  it('starts a manual code-agent sandbox preview run from explicit intent', async () => {
    const user = userEvent.setup();
    const codeAgentRun = buildRunRecord({
      id: 'run_code_agent_preview',
      taskId: riskTask.id,
      type: 'agent',
      status: 'completed',
      output: 'Manual sandbox preview ready',
      outputSource: 'system',
    });
    const readySandboxBackendStatus: NonNullable<AiConfigStatus['sandboxBackendStatus']> = {
      probe: {
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
      },
      profile: {
        credentialPassthrough: false,
        environmentPolicy: 'empty',
        id: 'local-container',
        isolation: 'container',
        kind: 'local_container',
        networkMode: 'disabled',
        supportsOutputLimits: true,
        supportsPatchArtifacts: true,
        supportsStagedWrites: true,
        supportsStructuredCommands: true,
        supportsTargetedCommands: true,
        supportsWorkspaceMount: true,
      },
      producerBackendReadiness: {
        blockedReasons: [],
        ready: true,
        summary: 'Sandboxed coding producer backend ready: local-container',
      },
      readiness: {
        blockedReasons: [],
        ready: true,
        summary: 'Sandbox backend ready: local-container.',
      },
      summary: 'Sandbox backend ready: local-container.',
    };
    const intentApi: ElectronApi = {
      ...mockApi,
      getAiConfigStatus: vi.fn(async () => ({
        ...aiStatus,
        codeAgentModelProducerEnabled: true,
        codeAgentWorkspaceChecks: {
          lint: {
            available: true,
            reason: 'package.json exposes npm run lint.',
          },
          test: {
            available: true,
            reason: 'package.json exposes npm run test.',
          },
        },
        sandboxBackendStatus: readySandboxBackendStatus,
        executorLifecycleAvailability: buildDryRunAgentExecutorLifecycleAvailability({
          controlSupport: {
            cancel: false,
          },
        }),
      })),
      getRunDetail: vi.fn(async (runId: string) => (runId === codeAgentRun.id ? codeAgentRun : null)),
      listRuns: vi.fn(async () => [codeAgentRun]),
      probeSandboxBackend: vi.fn(),
      triggerCodeAgentRun: vi.fn(async () => codeAgentRun),
    };
    taskDetails[riskTask.id] = {
      ...taskDetails[riskTask.id],
      artifacts: [
        buildArtifact({
          content: 'Update docs/notes.md and src/app.ts before review.',
          title: 'Patch notes',
        }),
      ],
      sourceContexts: [
        buildSourceContext({
          content: 'Relevant file: src/feature.ts',
          uri: null,
        }),
      ],
    };
    window.api = intentApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    const riskTaskCard = await screen.findByRole('button', { name: /High risk task/i });
    await user.click(riskTaskCard);
    await screen.findByRole('heading', { name: 'High risk task' });

    const intent = within(screen.getByLabelText('Code agent run intent'));
    const readiness = within(intent.getByLabelText('Orchestration readiness'));
    expect(intent.getByText('AgentProfile：manual sandbox producer')).toBeTruthy();
    expect(readiness.getByText('manual only')).toBeTruthy();
    expect(readiness.getByText(/Task：High risk task/)).toBeTruthy();
    expect(readiness.getByText(/Skill readiness：deferred until policy exists/)).toBeTruthy();
    expect(readiness.getByText(
      'AgentRunLifecycle：drafted / start=manual_or_operator_started / queue=no / claim=no / scheduler=no / autoStart=no',
    )).toBeTruthy();
    expect(readiness.getByText(
      'Hidden tool families / families=browser_playwright,mcp,skill,computer_use,creator_connector / modelVisible=no',
    )).toBeTruthy();
    expect(readiness.getByText(
      'Executor lifecycle：Executor lifecycle / status=dry_run_available',
    )).toBeTruthy();
    expect(readiness.getByText(
      'runtimeReady=no / queueWorker=no / automaticStart=no',
    )).toBeTruthy();
    expect(readiness.getByText(
      'runtimeAuthority=diagnostic_only / executionAuthority=no',
    )).toBeTruthy();
    expect(readiness.getByText(
      'controlRequests=heartbeat,interrupt / controlMode=dry_run_planned',
    )).toBeTruthy();
    expect(readiness.getByText('unsupportedControlRequests=cancel')).toBeTruthy();
    expect(readiness.getByText(
      'settleResults=completed,failed,paused / settleMode=dry_run_planned',
    )).toBeTruthy();
    expect(readiness.getByText(
      'modelExposure=hidden / modelVisibleTools=no',
    )).toBeTruthy();
    expect(readiness.getByText(
      'blocked=No real executor runtime is connected.; Lifecycle service is not wired into bootstrap, IPC, scheduler, or queue workers.; Model-visible tool exposure remains hidden.',
    )).toBeTruthy();
    expect(readiness.getByText(
      'next=Keep lifecycle service in dry-run diagnostics until a real executor adapter decision is accepted.',
    )).toBeTruthy();
    expect(readiness.getByText(
      'Automation readiness：diagnostic_only / evidence=inputs=present,runtime=ready / blocked=No applied skill or process template is attached to this task.; High-risk tasks require manual Decision or operator-started review before execution.; Task needs at least one open completion criterion to bound execution. / autoStart=no',
    )).toBeTruthy();
    expect(readiness.getByText(
      'Orchestration：runtime=ready / profile=manual_sandbox_producer / lifecycle=drafted / hidden=browser_playwright,mcp,skill,computer_use,creator_connector / modelVisibleHiddenTools=no / automation=diagnostic_only / autoStart=no',
    )).toBeTruthy();
    expect(intent.getByText(
      'Automatic start：disabled / requires mature skill or process, complete inputs, allowed tools, risk policy, accepted evidence or explicit enablement, and runtime readiness / no scheduler or auto-run flag is persisted',
    )).toBeTruthy();
    expect(intent.getByText(
      'Model producer：available by local env / provider calls require Use model producer, context files, and operator confirmation / sandbox preview and Decision promotion still apply',
    )).toBeTruthy();
    expect(intent.getByText(/Completion criteria：暂无/)).toBeTruthy();
    expect(intent.getByText(
      'Context selection：none selected / 3 suggestions available / files are not read until the run starts',
    )).toBeTruthy();
    expect(intent.queryByText(
      'Source context manifest：none selected / content=manifest only',
    )).toBeNull();

    const startButton = intent.getByRole('button', { name: '启动 sandbox preview run' });
    expect(startButton.hasAttribute('disabled')).toBe(true);
    expect(intent.getByText(
      'Code Agent preflight：blocked / runtime=ready / checks=test,lint / producer=local diagnostic; no provider call / promotion=Decision required / next=confirm Docker/Decision review before starting.',
    )).toBeTruthy();
    expect(intent.getByText('Start blocked：confirm Docker/Decision review before starting.')).toBeTruthy();

    await user.type(intent.getByLabelText('Patch intent'), 'Create a staged patch for the notes file');
    expect(intent.getByRole('button', { name: 'docs/notes.md' })).toBeTruthy();
    expect(intent.getByRole('button', { name: 'src/app.ts' })).toBeTruthy();
    await user.click(intent.getByRole('checkbox', {
      name: 'Use model producer（会调用已配置 provider；需要显式 context files）',
    }));
    expect(intent.getByText(
      'Source context manifest：none selected / content=manifest only',
    )).toBeTruthy();
    expect(intent.getByText(
      'Artifact manifest：none selected / content=manifest only',
    )).toBeTruthy();
    await user.click(intent.getByRole('checkbox', {
      name: '我确认后续执行可能启动 Docker 容器，但工作区只会收到 Decision 批准后的变更',
    }));
    expect(intent.getByText('Start blocked：select at least one context file before using model producer.')).toBeTruthy();
    expect(intent.getByText(
      'Code Agent preflight：blocked / runtime=ready / checks=test,lint / producer=model-backed; context required / promotion=Decision required / next=select at least one context file before using model producer.',
    )).toBeTruthy();
    expect(startButton.hasAttribute('disabled')).toBe(true);
    await user.click(intent.getByRole('button', { name: 'src/feature.ts' }));
    expect((intent.getByLabelText('Context files') as HTMLTextAreaElement).value).toBe('src/feature.ts');
    expect(intent.getByText(
      'Context selection：1 selected / src/feature.ts / files are not read until the run starts',
    )).toBeTruthy();
    await user.clear(intent.getByLabelText('Context files'));
    await user.type(intent.getByLabelText('Context files'), 'docs/notes.md\nsrc/app.ts');
    expect(intent.getByText(
      'Context selection：2 selected / docs/notes.md、src/app.ts / files are not read until the run starts',
    )).toBeTruthy();
    await user.click(intent.getByRole('checkbox', { name: 'Reference doc' }));
    expect(intent.getByText(
      'Source context manifest：1 selected / Reference doc / content=manifest only',
    )).toBeTruthy();
    await user.click(intent.getByRole('checkbox', { name: 'Patch notes' }));
    expect(intent.getByText(
      'Artifact manifest：1 selected / Patch notes / content=manifest only',
    )).toBeTruthy();
    await user.click(intent.getByRole('checkbox', {
      name: 'Include selected source content（bounded local snapshot only）',
    }));
    expect(intent.getByText(
      'Source context manifest：1 selected / Reference doc / content=will be sent as bounded read-only evidence',
    )).toBeTruthy();
    expect(intent.getByText(
      'Code Agent preflight：ready / runtime=ready / checks=test,lint / producer=model-backed; context=2 / promotion=Decision required / next=start sandbox preview',
    )).toBeTruthy();
    expect(startButton.hasAttribute('disabled')).toBe(false);

    await user.click(startButton);

    expect(intentApi.triggerRun).not.toHaveBeenCalled();
    expect(intentApi.probeSandboxBackend).not.toHaveBeenCalled();
    expect(intentApi.triggerCodeAgentRun).toHaveBeenCalledWith({
      artifactIds: ['artifact_1'],
      contextFiles: ['docs/notes.md', 'src/app.ts'],
      includeSourceContextContent: true,
      operatorConfirmed: true,
      patchIntent: 'Create a staged patch for the notes file',
      requestedChecks: ['test', 'lint'],
      sourceContextIds: ['source_context_1'],
      taskId: riskTask.id,
      useModelProducer: true,
    });
    expect(await screen.findByRole('heading', { name: 'agent / completed' })).toBeTruthy();
  });

  it('surfaces recent code-agent staged patch review actions on the task detail', async () => {
    const user = userEvent.setup();
    const codeAgentRun = buildRunRecord({
      id: 'run_code_agent_review',
      taskId: riskTask.id,
      type: 'agent',
      status: 'completed',
      instructions: null,
      output: null,
      outputSource: 'system',
      updatedAt: '2026-01-03T00:00:00.000Z',
    });
    const unrelatedAgentRun = buildRunRecord({
      id: 'run_unrelated_agent',
      taskId: riskTask.id,
      type: 'agent',
      status: 'completed',
      instructions: null,
      output: null,
      outputSource: 'system',
      updatedAt: '2026-01-03T00:00:02.000Z',
    });
    const codeAgentRunDetail: RunDetailRecord = {
      ...codeAgentRun,
      output: 'Code Agent review source ready',
      checkpoints: [
        buildRunCheckpoint({
          id: 'run_checkpoint_code_agent_review',
          runId: codeAgentRun.id,
          kind: 'patch_promotion',
          status: 'open',
        }),
      ],
    };
    const codeAgentDecision: DecisionRecord = {
      id: 'decision_code_agent_review',
      taskId: riskTask.id,
      title: 'Review Code Agent preview for High risk task',
      status: 'pending',
      sourceType: 'agent_checkpoint',
      sourceId: 'run_checkpoint_code_agent_review',
      sourceLabel: 'workspace.staged_patch',
      createdAt: '2026-01-03T00:00:01.000Z',
      updatedAt: '2026-01-03T00:00:01.000Z',
    };
    const codeAgentApi: ElectronApi = {
      ...mockApi,
      listDecisions: vi.fn(async () => [codeAgentDecision]),
      listRuns: vi.fn(async () => [unrelatedAgentRun, codeAgentRun]),
      getRunDetail: vi.fn(async (runId: string) => {
        if (runId === codeAgentRun.id) {
          return codeAgentRunDetail;
        }

        return runId === unrelatedAgentRun.id ? unrelatedAgentRun : null;
      }),
    };
    window.api = codeAgentApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    const [riskTaskCard] = await screen.findAllByRole('button', { name: /High risk task/i });
    await user.click(riskTaskCard!);

    expect(await screen.findByText('Code Agent Review')).toBeTruthy();
    expect(screen.getByText(
      '已有待处理的 Code Agent staged patch promotion Decision；先复核 Run 证据、staged patch 和 promotion Decision。',
    )).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '查看 Code Agent Run' }));
    expect(await screen.findByText('Code Agent review source ready')).toBeTruthy();
    expect(codeAgentApi.getRunDetail).toHaveBeenCalledWith('run_unrelated_agent');
    expect(codeAgentApi.getRunDetail).toHaveBeenCalledWith('run_code_agent_review');

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    const [riskTaskCardAfterRun] = await screen.findAllByRole('button', { name: /High risk task/i });
    await user.click(riskTaskCardAfterRun!);
    await user.click(screen.getByRole('button', { name: '准备重跑 Code Agent' }));
    expect((screen.getByLabelText('Patch intent') as HTMLTextAreaElement).value).toBe(
      'Re-run the Code Agent staged patch review for High risk task. Review prior promotion Decision: Review Code Agent preview for High risk task.',
    );

    await user.click(screen.getByRole('button', { name: '打开 promotion Decision' }));

    expect(await screen.findByRole('heading', {
      name: 'Review Code Agent preview for High risk task',
    })).toBeTruthy();
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

  it('routes paused run recovery from task detail to run evidence first', async () => {
    const user = userEvent.setup();
    const pausedRun = buildRunRecord({
      id: 'run_paused',
      taskId: riskTask.id,
      type: 'agent',
      status: 'paused',
      output: '观察到任务仍有阻塞项：Legal review。暂停执行 artifact.create_note，等待先解除阻塞。',
      outputSource: 'system',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    const pausedRunApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [pausedRun, ...runs]),
      continuePausedRun: vi.fn(),
    };

    window.api = pausedRunApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /High risk task/i }));
    await screen.findByRole('heading', { name: 'High risk task' });

    expect(screen.getByText(/最近一次 agent run 暂停待复核/)).toBeTruthy();
    expect(screen.getByText('续跑前先打开 Run 证据；只有存在唯一、有效、会话绑定可恢复的 open resume checkpoint 时，Runs 页才会显示继续入口。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '继续 paused run' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '查看恢复 checkpoint' }));

    await waitFor(() => {
      expect(window.location.hash).toBe('#runs');
    });

    expect(pausedRunApi.continuePausedRun).not.toHaveBeenCalled();
    expect(pausedRunApi.triggerRun).not.toHaveBeenCalled();
  });

  it('routes confirmation-needed Code Agent review through run evidence first', async () => {
    const user = userEvent.setup();
    const confirmationRun = buildRunRecord({
      id: 'run_code_agent_confirmation',
      taskId: riskTask.id,
      type: 'agent',
      status: 'needs_confirmation',
      output: 'Code Agent manual sandbox producer preview is waiting for staged patch checkpoint review.',
      outputSource: 'system',
      updatedAt: '2026-01-04T00:00:00.000Z',
    });
    const codeAgentRecoveryApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [confirmationRun, ...runs]),
      triggerRun: vi.fn(),
    };

    window.api = codeAgentRecoveryApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /High risk task/i }));
    await screen.findByRole('heading', { name: 'High risk task' });

    expect(screen.getByText('Code Agent Review')).toBeTruthy();
    expect(screen.getByText(
      '最近一次 Code Agent sandbox preview 正在等待 checkpoint / Decision 确认；先打开 Run 证据审查 staged patch / checkpoint，再决定是否续跑或重跑。',
    )).toBeTruthy();
    expect(screen.getByText('当前没有待处理的 promotion Decision；如检查失败，请先从 Run 证据判断是否需要重跑。')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '查看 Code Agent Run' }));

    await waitFor(() => {
      expect(window.location.hash).toBe('#runs');
    });

    expect(codeAgentRecoveryApi.triggerRun).not.toHaveBeenCalled();
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
    expect(screen.getByText('结果来源：system')).toBeTruthy();
  });

  it('shows browser evidence artifacts on the runs page', async () => {
    const user = userEvent.setup();
    const browserRun = buildRunRecord({
      id: 'run_browser_evidence',
      taskId: riskTask.id,
      type: 'agent',
      status: 'completed',
      output: 'Browser evidence captured.',
      outputSource: 'system',
    });
    const browserRunDetail: RunDetailRecord = {
      ...browserRun,
      artifacts: [
        buildArtifact({
          id: 'artifact_browser_evidence',
          kind: 'browser_evidence',
          sourceId: browserRun.id,
          taskId: riskTask.id,
          title: 'Browser evidence',
          content: JSON.stringify({
            artifacts: [
              {
                kind: 'page_summary',
                summary: 'Title: Taskplane Browser Evidence Smoke',
                title: 'Browser page summary',
              },
              {
                kind: 'visible_text',
                summary: '72 visible text characters captured.',
                title: 'Browser visible text',
              },
              {
                kind: 'screenshot',
                path: '/tmp/browser-evidence-screenshot.png',
                summary: 'Viewport screenshot captured from an isolated browser context.',
                title: 'Browser screenshot',
              },
            ],
            request: {
              url: 'http://127.0.0.1:4173/browser-evidence-smoke.html',
            },
            result: {
              status: 'captured',
              summary: 'Browser evidence captured / artifacts=page_summary,visible_text,screenshot / credentials=no / mutation=no',
            },
          }),
        }),
      ],
      steps: [
        buildRunStep({
          id: 'run_step_browser_capture',
          index: 1,
          kind: 'tool_result',
          runId: browserRun.id,
          status: 'completed',
          title: 'browser evidence captured',
          output: 'Browser evidence captured / artifacts=page_summary,visible_text,screenshot / credentials=no / mutation=no',
        }),
      ],
    };
    const browserEvidenceApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [browserRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === browserRun.id ? browserRunDetail : null,
      ),
    };

    window.api = browserEvidenceApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    await screen.findByRole('heading', { name: 'agent / completed' });

    expect(screen.getByText('Browser Evidence')).toBeTruthy();
    expect(screen.getByText('审阅这次浏览器证据采集')).toBeTruthy();
    expect(screen.getByText(
      /Browser evidence：url=http:\/\/127\.0\.0\.1:4173\/browser-evidence-smoke\.html \/ artifacts=page_summary, visible_text, screenshot \/ artifact=artifact_browser_evidence/,
    )).toBeTruthy();
    expect(screen.getAllByText(
      'Browser evidence captured / artifacts=page_summary,visible_text,screenshot / credentials=no / mutation=no',
    ).length).toBeGreaterThan(0);
    expect(screen.getByText('Screenshot：/tmp/browser-evidence-screenshot.png')).toBeTruthy();
  });

  it('shows browser controlled interaction review evidence on the runs page', async () => {
    const user = userEvent.setup();
    const browserControlledRun = buildRunRecord({
      id: 'run_browser_controlled',
      taskId: riskTask.id,
      type: 'agent',
      status: 'completed',
      output: 'Browser controlled local QA completed / url=http://127.0.0.1:53578/browser-controlled-local-qa.html / actions=navigate,click,type_text,select_option,capture_evidence / artifacts=page_summary,visible_text,screenshot / credentials=no / externalOrigin=no / modelExposure=hidden',
      outputSource: 'system',
    });
    const browserControlledDetail: RunDetailRecord = {
      ...browserControlledRun,
      checkpoints: [
        buildRunCheckpoint({
          id: 'run_checkpoint_browser_controlled',
          kind: 'external_wait',
          payload: JSON.stringify({
            version: 1,
            kind: 'browser_controlled_interaction',
            descriptorId: 'browser.controlled_interaction',
            action: {
              action: 'click',
              currentUrl: 'http://localhost:5173/draft',
              targetLabel: 'Publish post',
            },
            currentUrl: 'http://localhost:5173/draft',
            decisionId: 'decision_browser_1',
            decisionTitle: 'Approve browser publish click',
            origin: 'http://localhost:5173',
            policySnapshot: {
              allowCredentials: false,
              allowedActions: ['click'],
              allowedEvidenceKinds: ['screenshot', 'visible_text', 'page_summary'],
              allowedOrigins: ['http://localhost:5173'],
              isolatedProfile: true,
              maxActions: 8,
              networkPolicy: 'allowlisted',
              operatorStarted: true,
              outputLimitBytes: 128000,
              sensitiveFieldPolicy: 'block',
              sideEffectPolicy: 'checkpoint_required',
              timeoutMs: 60000,
            },
            screenshotArtifactId: 'artifact_screenshot_1',
            sideEffectClassification: 'possible_external_side_effect',
            visibleTextSummary: 'Draft publish page is visible.',
          }),
        }),
      ],
      steps: [
        buildRunStep({
          id: 'run_step_browser_controlled_plan',
          index: 1,
          kind: 'plan',
          runId: browserControlledRun.id,
          status: 'completed',
          title: 'browser controlled dry-run accepted',
          output: 'browserStart=no / networkCall=no / pageMutation=no / modelExposure=hidden / scheduler=no / providerCall=no',
        }),
        buildRunStep({
          id: 'run_step_browser_controlled_action',
          index: 2,
          kind: 'tool_call',
          runId: browserControlledRun.id,
          status: 'pending',
          title: 'Browser action planned: click',
        }),
        buildRunStep({
          id: 'run_step_browser_controlled_checkpoint',
          index: 3,
          kind: 'checkpoint',
          runId: browserControlledRun.id,
          status: 'pending',
          title: 'Browser action requires checkpoint',
          output: 'action=click / checkpoint=required / origin=http://localhost:5173',
        }),
      ],
    };
    const browserControlledApi: ElectronApi = {
      ...mockApi,
      listDecisions: vi.fn(async (): Promise<DecisionRecord[]> => [
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          id: 'decision_browser_1',
          sourceId: 'run_checkpoint_browser_controlled',
          sourceLabel: 'Browser controlled checkpoint',
          sourceType: 'agent_checkpoint',
          status: 'approved',
          taskId: riskTask.id,
          title: 'Approve browser publish click',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
      listRuns: vi.fn(async () => [browserControlledRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === browserControlledRun.id ? browserControlledDetail : null,
      ),
    };

    window.api = browserControlledApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    await screen.findByRole('heading', { name: 'agent / completed' });

    expect(screen.getByText('Browser Controlled Interaction')).toBeTruthy();
    expect(screen.getByText('审阅这次受控浏览器交互证据')).toBeTruthy();
    expect(screen.getByText(
      'Browser controlled：Browser controlled interaction review / status=checkpoint_required / actions=1 / blocked=0 / checkpoints=1',
    )).toBeTruthy();
    expect(screen.getByText(
      'Policy：modelExposure=hidden / scheduler=no / providerCall=no / genericPrompt=no',
    )).toBeTruthy();
    expect(screen.getByText(
      'Next review move：next=review checkpoint payload and Browser Controlled Resume state; approval can resume one recorded action only',
    )).toBeTruthy();
    expect(screen.getByText('Runtime boundary')).toBeTruthy();
    expect(screen.getByText('Action plan')).toBeTruthy();
    expect(screen.getByText('Checkpoint boundary')).toBeTruthy();
    expect(screen.getByText(
      'action=click / origin=http://localhost:5173 / targetLabel=Publish post / screenshot=artifact_screenshot_1 / visibleText=Draft publish page is visible. / resume=deferred',
    )).toBeTruthy();
    expect(screen.getByText('Browser Controlled Resume')).toBeTruthy();
    expect(screen.getByText('审阅 checkpoint 批准后的单动作恢复状态')).toBeTruthy();
    expect(screen.getByText(
      'Resume：Browser controlled resume ready: action=click / url=http://localhost:5173/draft / origin=http://localhost:5173 / targetLabel=Publish post / sideEffect=possible_external_side_effect',
    )).toBeTruthy();
    expect(screen.getByText('Decision：decision=approved / checkpoint=open')).toBeTruthy();
    expect(screen.getByText(
      'Consequence：approval resumes exactly one recorded click action; it does not grant a browser session',
    )).toBeTruthy();
    expect(screen.getByText(
      'Next review move：next=resume exactly one approved browser action after pre-launch validation',
    )).toBeTruthy();
  });

  it('shows run checkpoints on the runs page', async () => {
    const user = userEvent.setup();
    const checkpointRun = buildRunRecord({
      id: 'run_checkpointed',
      taskId: riskTask.id,
      type: 'agent',
      status: 'needs_confirmation',
      output: '需要确认 artifact.create_note 后才能继续。',
      outputSource: 'system',
    });
    const checkpointDetail: RunDetailRecord = {
      ...checkpointRun,
      steps: [
        buildRunStep({
          id: 'run_step_tool_call',
          runId: checkpointRun.id,
          index: 2,
          kind: 'checkpoint',
          title: 'Await tool permission',
        }),
      ],
      checkpoints: [
        buildRunCheckpoint({
          id: 'run_checkpoint_tool_permission',
          runId: checkpointRun.id,
          stepId: 'run_step_tool_call',
          payload: JSON.stringify({
            agentSessionId: 'agent_session_1',
            tool: 'artifact.create_note',
            risk: 'write',
            reason: '需要确认后再写入本地 note artifact。',
            decisionTitle: '确认本地写入：artifact.create_note',
          }),
        }),
      ],
    };

    const runCheckpointApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [checkpointRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === checkpointRun.id ? checkpointDetail : null,
      ),
    };

    window.api = runCheckpointApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    await screen.findByRole('heading', { name: '执行记录' });

    expect(await screen.findByRole('heading', { name: 'agent / needs_confirmation' })).toBeTruthy();
    expect(
      screen.getByText(
        '当前 run 正在等待 checkpoint / Decision 确认；先审阅下方 Checkpoints 和关联 Decision，批准后才会恢复执行。',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Checkpoints')).toBeTruthy();
    expect(screen.getByText('tool_permission')).toBeTruthy();
    expect(screen.getByText('open')).toBeTruthy();
    expect(screen.getByText('run_step_tool_call')).toBeTruthy();
    expect(
      screen.getByText(
        '会话：agent_session_1；工具：artifact.create_note；风险：write；原因：需要确认后再写入本地 note artifact。；Decision：确认本地写入：artifact.create_note',
      ),
    ).toBeTruthy();
    expect(runCheckpointApi.getRunDetail).toHaveBeenCalledWith('run_checkpointed');
  });

  it('shows task-domain checkpoint input summaries on the runs page', async () => {
    const user = userEvent.setup();
    const checkpointRun = buildRunRecord({
      id: 'run_task_checkpointed',
      taskId: riskTask.id,
      type: 'agent',
      status: 'needs_confirmation',
      output: '需要确认 task.update_next_step 后才能继续。',
      outputSource: 'system',
    });
    const checkpointDetail: RunDetailRecord = {
      ...checkpointRun,
      steps: [
        buildRunStep({
          id: 'run_step_task_update',
          runId: checkpointRun.id,
          index: 2,
          kind: 'checkpoint',
          title: 'Await task update permission',
        }),
      ],
      checkpoints: [
        buildRunCheckpoint({
          id: 'run_checkpoint_task_update',
          runId: checkpointRun.id,
          stepId: 'run_step_task_update',
          payload: JSON.stringify({
            tool: 'task.update_next_step',
            risk: 'local_write',
            input: {
              nextStep: 'Review launch evidence',
            },
            decisionTitle: '确认本地写入：task.update_next_step',
          }),
        }),
        buildRunCheckpoint({
          id: 'run_checkpoint_source_context',
          runId: checkpointRun.id,
          stepId: 'run_step_task_update',
          payload: JSON.stringify({
            tool: 'source_context.create',
            risk: 'local_write',
            input: {
              title: 'Launch readiness notes',
              kind: 'artifact',
              uri: 'taskplane://artifact/launch-readiness',
              content: 'Long evidence body should not be duplicated in the checkpoint summary.',
            },
            decisionTitle: '确认本地写入：source_context.create',
          }),
        }),
      ],
    };
    const runCheckpointApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [checkpointRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === checkpointRun.id ? checkpointDetail : null,
      ),
    };

    window.api = runCheckpointApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    await screen.findByRole('heading', { name: 'agent / needs_confirmation' });

    expect(
      screen.getByText(
        '工具：task.update_next_step；风险：local_write；下一步：Review launch evidence；Decision：确认本地写入：task.update_next_step',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        '工具：source_context.create；风险：local_write；来源：Launch readiness notes；类型：artifact；URI：taskplane://artifact/launch-readiness；Decision：确认本地写入：source_context.create',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Long evidence body should not be duplicated/)).toBeNull();
  });

  it('shows workspace patch checkpoint files and diff preview on the runs page', async () => {
    const user = userEvent.setup();
    const checkpointRun = buildRunRecord({
      id: 'run_patch_checkpointed',
      taskId: riskTask.id,
      type: 'agent',
      status: 'needs_confirmation',
      output: '需要确认 workspace.write_patch 后才能继续。',
      outputSource: 'system',
    });
    const checkpointDetail: RunDetailRecord = {
      ...checkpointRun,
      steps: [
        buildRunStep({
          id: 'run_step_patch_tool_call',
          runId: checkpointRun.id,
          index: 2,
          kind: 'checkpoint',
          title: 'Await patch permission',
        }),
      ],
      checkpoints: [
        buildRunCheckpoint({
          id: 'run_checkpoint_patch_permission',
          runId: checkpointRun.id,
          stepId: 'run_step_patch_tool_call',
          payload: JSON.stringify({
            version: 1,
            kind: 'tool_permission',
            agentSessionId: 'agent_session_patch',
            tool: 'workspace.write_patch',
            risk: 'local_write',
            input: {
              summary: 'Update notes',
              expectedFiles: ['notes.md'],
              diffPreview: [
                'Summary: Update notes',
                '',
                'Files: notes.md',
                '',
                '*** Begin Patch',
                '*** Update File: notes.md',
                '@@',
                '-alpha',
                '+beta',
                '*** End Patch',
              ].join('\n'),
            },
            decisionTitle: '确认本地写入：workspace.write_patch',
          }),
        }),
      ],
    };
    const runCheckpointApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [checkpointRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === checkpointRun.id ? checkpointDetail : null,
      ),
    };

    window.api = runCheckpointApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    await screen.findByRole('heading', { name: '执行记录' });

    expect(await screen.findByRole('heading', { name: 'agent / needs_confirmation' })).toBeTruthy();
    expect(
      screen.getByText(/会话：agent_session_patch；工具：workspace\.write_patch；风险：local_write；摘要：Update notes；文件：notes\.md；预览：\*\*\* Begin Patch \*\*\* Update File: notes\.md/),
    ).toBeTruthy();
  });

  it('shows workspace command checkpoint script and command preview on the runs page', async () => {
    const user = userEvent.setup();
    const checkpointRun = buildRunRecord({
      id: 'run_command_checkpointed',
      taskId: riskTask.id,
      type: 'agent',
      status: 'needs_confirmation',
      output: '需要确认 workspace.run_command 后才能继续。',
      outputSource: 'system',
    });
    const checkpointDetail: RunDetailRecord = {
      ...checkpointRun,
      steps: [
        buildRunStep({
          id: 'run_step_command_tool_call',
          runId: checkpointRun.id,
          index: 2,
          kind: 'checkpoint',
          title: 'Await command permission',
        }),
      ],
      checkpoints: [
        buildRunCheckpoint({
          id: 'run_checkpoint_command_permission',
          runId: checkpointRun.id,
          stepId: 'run_step_command_tool_call',
          payload: JSON.stringify({
            version: 1,
            kind: 'tool_permission',
            agentSessionId: 'agent_session_command',
            tool: 'workspace.run_command',
            risk: 'local_command',
            input: {
              summary: 'Run tests',
              script: 'test',
              args: ['--watch=false'],
              commandPreview: [
                'Summary: Run tests',
                'Command: npm run test -- --watch=false',
                'Timeout: 120000ms',
                'Cwd: /tmp/taskplane-workspace',
              ].join('\n'),
            },
            decisionTitle: '确认本地命令：workspace.run_command',
          }),
        }),
      ],
    };
    const runCheckpointApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [checkpointRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === checkpointRun.id ? checkpointDetail : null,
      ),
    };

    window.api = runCheckpointApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    await screen.findByRole('heading', { name: '执行记录' });

    expect(await screen.findByRole('heading', { name: 'agent / needs_confirmation' })).toBeTruthy();
    expect(
      screen.getByText(/会话：agent_session_command；工具：workspace\.run_command；风险：local_command；脚本：npm run test；限制：仅允许 package\.json 中的 test \/ lint 脚本；参数：--watch=false；超时：120000ms；工作目录：\/tmp\/taskplane-workspace；预览：Summary: Run tests Command: npm run test -- --watch=false/),
    ).toBeTruthy();
  });

  it('shows resume checkpoints on the runs page for paused agent runs', async () => {
    const user = userEvent.setup();
    const pausedRun = buildRunRecord({
      id: 'run_paused_checkpoint',
      taskId: riskTask.id,
      type: 'agent',
      status: 'paused',
      output: '等待先解除阻塞。',
      outputSource: 'system',
    });
    const pausedRunDetail: RunDetailRecord = {
      ...pausedRun,
      agentSessions: [
        {
          id: 'agent_session_resume',
          runId: pausedRun.id,
          mode: 'agent',
          status: 'paused',
          capabilities: {
            structuredToolCalls: false,
            textOnlyPlanning: true,
            streaming: false,
            fileContext: true,
            taskMutationTools: false,
            longRunningSessions: true,
          },
          metadata: 'executor=local_agent\nloop=local_note',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      steps: [
        buildRunStep({
          id: 'run_step_resume_checkpoint',
          runId: pausedRun.id,
          index: 4,
          kind: 'checkpoint',
          status: 'pending',
          title: '等待恢复 agent run',
          output: '等待先解除阻塞。',
        }),
      ],
      checkpoints: [
        buildRunCheckpoint({
          id: 'run_checkpoint_resume',
          runId: pausedRun.id,
          stepId: 'run_step_resume_checkpoint',
          kind: 'resume',
          payload: JSON.stringify({
            agentSessionId: 'agent_session_resume',
            reason: '等待先解除阻塞。',
            nextTool: 'artifact.create_note',
          }),
        }),
      ],
    };
    const runPausedCheckpointApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [pausedRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === pausedRun.id ? pausedRunDetail : null,
      ),
    };

    window.api = runPausedCheckpointApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));

    expect(await screen.findByRole('heading', { name: 'agent / paused' })).toBeTruthy();
    expect(screen.getByText('resume')).toBeTruthy();
    expect(screen.getByText('open')).toBeTruthy();
    expect(screen.getByText('会话：agent_session_resume；下一工具：artifact.create_note；原因：等待先解除阻塞。')).toBeTruthy();
    expect(screen.getByText(
      'Recovery anchors：run=run_paused_checkpoint / session=agent_session_resume / checkpoints=run_checkpoint_resume / action=manual_checkpoint_resume',
    )).toBeTruthy();
  });

  it('continues a paused agent run from the runs page', async () => {
    const user = userEvent.setup();
    const pausedRun = buildRunRecord({
      id: 'run_paused_retry',
      taskId: riskTask.id,
      type: 'agent',
      status: 'paused',
      output: '等待先解除阻塞。',
      outputSource: 'system',
    });
    const continuedRun = buildRunRecord({
      id: pausedRun.id,
      taskId: riskTask.id,
      type: 'agent',
      status: 'completed',
      output: 'Recovered note',
      outputSource: 'system',
    });
    let currentRuns: RunRecord[] = [pausedRun];
    const resumeCheckpoint = buildRunCheckpoint({
      id: 'run_checkpoint_resume',
      runId: pausedRun.id,
      kind: 'resume',
      status: 'open',
      payload: JSON.stringify({
        version: 1,
        kind: 'resume',
        runId: pausedRun.id,
        taskId: riskTask.id,
        nextTool: 'artifact.create_note',
        nextInput: { title: 'Recovered note', content: 'Recovered note' },
      }),
    });
    const runPausedRetryApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => currentRuns),
      getRunDetail: vi.fn(async (runId: string) => {
        const run = currentRuns.find((item) => item.id === runId);
        return run ? { ...run, checkpoints: run.status === 'paused' ? [resumeCheckpoint] : [] } : null;
      }),
      continuePausedRun: vi.fn(async (runId) => {
        currentRuns = currentRuns.map((run) => (run.id === runId ? continuedRun : run));
        return continuedRun;
      }),
    };

    window.api = runPausedRetryApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    expect(await screen.findByRole('heading', { name: 'agent / paused' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '继续 paused run' }));

    await waitFor(() => {
      expect(runPausedRetryApi.continuePausedRun).toHaveBeenCalledWith(pausedRun.id);
    });
    expect(runPausedRetryApi.triggerRun).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'agent / completed' })).toBeTruthy();
  });

  it('blocks paused run continuation on the runs page when no resume checkpoint is open', async () => {
    const user = userEvent.setup();
    const pausedRun = buildRunRecord({
      id: 'run_paused_continue_error',
      taskId: riskTask.id,
      type: 'agent',
      status: 'paused',
      output: '等待先解除阻塞。',
      outputSource: 'system',
    });
    const runPausedErrorApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [pausedRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === pausedRun.id ? { ...pausedRun, checkpoints: [] } : null,
      ),
      continuePausedRun: vi.fn(async () => {
        throw new Error('Open resume checkpoint not found for run: run_paused_continue_error');
      }),
    };

    window.api = runPausedErrorApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    expect(await screen.findByRole('heading', { name: 'agent / paused' })).toBeTruthy();

    expect(
      await screen.findByText(
        '当前 paused run 没有唯一、有效、会话绑定可恢复的 open resume checkpoint；先检查执行证据或关联 Decision，再决定是否启动新的 run。',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: '继续 paused run' })).toBeNull();
    expect(runPausedErrorApi.continuePausedRun).not.toHaveBeenCalled();
    expect(runPausedErrorApi.triggerRun).not.toHaveBeenCalled();
  });

  it('blocks paused run continuation when the open resume checkpoint payload is stale', async () => {
    const user = userEvent.setup();
    const pausedRun = buildRunRecord({
      id: 'run_paused_stale_payload',
      taskId: riskTask.id,
      type: 'agent',
      status: 'paused',
      output: '等待先解除阻塞。',
      outputSource: 'system',
    });
    const staleResumeCheckpoint = buildRunCheckpoint({
      id: 'run_checkpoint_resume_stale',
      runId: pausedRun.id,
      kind: 'resume',
      status: 'open',
      payload: JSON.stringify({
        version: 1,
        kind: 'resume',
        runId: 'run_other',
        taskId: riskTask.id,
        nextTool: 'artifact.create_note',
        nextInput: { title: 'Recovered note', content: 'Recovered note' },
      }),
    });
    const runPausedStaleApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [pausedRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === pausedRun.id ? { ...pausedRun, checkpoints: [staleResumeCheckpoint] } : null,
      ),
      continuePausedRun: vi.fn(),
    };

    window.api = runPausedStaleApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    expect(await screen.findByRole('heading', { name: 'agent / paused' })).toBeTruthy();
    expect(
      await screen.findByText(
        '当前 paused run 没有唯一、有效、会话绑定可恢复的 open resume checkpoint；先检查执行证据或关联 Decision，再决定是否启动新的 run。',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: '继续 paused run' })).toBeNull();
    expect(runPausedStaleApi.continuePausedRun).not.toHaveBeenCalled();
  });

  it('blocks paused run continuation when multiple valid resume checkpoints are open', async () => {
    const user = userEvent.setup();
    const pausedRun = buildRunRecord({
      id: 'run_paused_multiple_resume',
      taskId: riskTask.id,
      type: 'agent',
      status: 'paused',
      output: '等待先解除阻塞。',
      outputSource: 'system',
    });
    const buildResumeCheckpoint = (id: string, title: string) => buildRunCheckpoint({
      id,
      runId: pausedRun.id,
      kind: 'resume',
      status: 'open',
      payload: JSON.stringify({
        version: 1,
        kind: 'resume',
        runId: pausedRun.id,
        taskId: riskTask.id,
        nextTool: 'artifact.create_note',
        nextInput: { title, content: `${title} content` },
      }),
    });
    const runPausedMultipleApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [pausedRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === pausedRun.id
          ? {
              ...pausedRun,
              checkpoints: [
                buildResumeCheckpoint('run_checkpoint_resume_a', 'Recovered note A'),
                buildResumeCheckpoint('run_checkpoint_resume_b', 'Recovered note B'),
              ],
            }
          : null,
      ),
      continuePausedRun: vi.fn(),
    };

    window.api = runPausedMultipleApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    expect(await screen.findByRole('heading', { name: 'agent / paused' })).toBeTruthy();
    expect(
      await screen.findByText(
        '当前 paused run 没有唯一、有效、会话绑定可恢复的 open resume checkpoint；先检查执行证据或关联 Decision，再决定是否启动新的 run。',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: '继续 paused run' })).toBeNull();
    expect(runPausedMultipleApi.continuePausedRun).not.toHaveBeenCalled();
  });

  it('blocks paused run continuation when the resume checkpoint session binding is missing', async () => {
    const user = userEvent.setup();
    const pausedRun = buildRunRecord({
      id: 'run_paused_missing_resume_session',
      taskId: riskTask.id,
      type: 'agent',
      status: 'paused',
      output: '等待先解除阻塞。',
      outputSource: 'system',
    });
    const boundResumeCheckpoint = buildRunCheckpoint({
      id: 'run_checkpoint_resume_bound_missing',
      runId: pausedRun.id,
      kind: 'resume',
      status: 'open',
      payload: JSON.stringify({
        version: 1,
        kind: 'resume',
        agentSessionId: 'agent_session_missing',
        runId: pausedRun.id,
        taskId: riskTask.id,
        nextTool: 'artifact.create_note',
        nextInput: { title: 'Recovered note', content: 'Recovered note' },
      }),
    });
    const runPausedMissingSessionApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [pausedRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === pausedRun.id
          ? {
              ...pausedRun,
              agentSessions: [
                {
                  id: 'agent_session_paused_current',
                  runId: pausedRun.id,
                  mode: 'agent' as const,
                  status: 'paused' as const,
                  capabilities: {
                    structuredToolCalls: false,
                    textOnlyPlanning: true,
                    streaming: false,
                    fileContext: true,
                    taskMutationTools: false,
                    longRunningSessions: true,
                  },
                  metadata: 'executor=local_agent\nloop=local_note',
                  createdAt: '2026-01-01T00:00:00.000Z',
                  updatedAt: '2026-01-01T00:00:00.000Z',
                },
              ],
              steps: [
                buildRunStep({
                  id: 'run_step_missing_session_resume_checkpoint',
                  runId: pausedRun.id,
                  index: 3,
                  kind: 'checkpoint',
                  status: 'pending',
                  title: 'Resume checkpoint bound to missing session',
                }),
              ],
              checkpoints: [boundResumeCheckpoint],
            }
          : null,
      ),
      continuePausedRun: vi.fn(),
    };

    window.api = runPausedMissingSessionApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    expect(await screen.findByRole('heading', { name: 'agent / paused' })).toBeTruthy();
    expect(
      await screen.findByText(
        '当前 paused run 没有唯一、有效、会话绑定可恢复的 open resume checkpoint；先检查执行证据或关联 Decision，再决定是否启动新的 run。',
      ),
    ).toBeTruthy();
    const recoverySafety = within(screen.getByLabelText('Run recovery safety'));
    expect(
      recoverySafety.getByText(
        'Replay review：inspect paused evidence; no recovery checkpoint / mode=inspect_only / session=agent_session_paused_current / status=paused / restartSafety=checkpoint_missing / steps=1 / openCheckpoints=0 / recoveryCheckpoints=0 / latest=checkpoint:pending:Resume checkpoint bound to missing session / autoReplay=no',
      ),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText(
        'Recovery anchors：run=run_paused_missing_resume_session / session=agent_session_paused_current / checkpoints=none / action=inspect_evidence',
      ),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText(
        'Next safe move：复核最近一次 agent run 的暂停或确认原因；没有 recovery checkpoint 时，先查看执行证据再决定是否重跑。',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: '继续 paused run' })).toBeNull();
    expect(runPausedMissingSessionApi.continuePausedRun).not.toHaveBeenCalled();
  });

  it('shows readable agent plan source summaries on the runs page', async () => {
    const user = userEvent.setup();
    const agentPlanRun = buildRunRecord({
      id: 'run_agent_plan',
      taskId: riskTask.id,
      type: 'agent',
      status: 'completed',
      output: 'Agent result',
      outputSource: 'ai',
    });
    const agentPlanDetail: RunDetailRecord = {
      ...agentPlanRun,
      agentSessions: [
        {
          id: 'agent_session_1',
          runId: agentPlanRun.id,
          mode: 'agent',
          status: 'running',
          capabilities: {
            structuredToolCalls: false,
            textOnlyPlanning: true,
            streaming: false,
            fileContext: true,
            taskMutationTools: true,
            longRunningSessions: false,
          },
          metadata: 'executor=local_agent\nloop=local_note',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      steps: [
        buildRunStep({
          id: 'run_step_agent_plan',
          runId: agentPlanRun.id,
          index: 4,
          kind: 'plan',
          status: 'completed',
          title: '采用模型提出的 agent 步骤计划',
          output: '1. task.inspect_context\n2. task.inspect_timeline\n3. artifact.create_note',
        }),
      ],
      checkpoints: [],
    };
    const runAgentPlanApi: ElectronApi = {
      ...mockApi,
      getAiConfigStatus: vi.fn(async () => ({
        ...aiStatus,
        executorLifecycleAvailability: buildDryRunAgentExecutorLifecycleAvailability({
          controlSupport: {
            cancel: false,
          },
        }),
      })),
      listRuns: vi.fn(async () => [agentPlanRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === agentPlanRun.id ? agentPlanDetail : null,
      ),
    };

    window.api = runAgentPlanApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));

    expect(await screen.findByRole('heading', { name: 'agent / completed' })).toBeTruthy();
    const recoverySafety = within(screen.getByLabelText('Run recovery safety'));
    expect(recoverySafety.getByText('inspect first')).toBeTruthy();
    expect(
      screen.getByText('模型提出的步骤计划：读取任务上下文 -> 读取最近时间线 -> 写入本地 note'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Agent session：text-only planning / read-only workspace context enabled / task update/evidence tools enabled / structured tool calls unavailable / sandbox coding lane disabled; workspace patch/commands unavailable / single-session record',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'AgentRunLifecycleProjection / stage=completed / runStatus=completed / start=manual / queue=no / claim=no / autoStart=no',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Tool families：workspace=read_only / task=update_tools / provider_tools=not_exposed / coding=not_exposed / browser=not_exposed / computer_use=not_exposed / mcp=not_exposed / creator=not_exposed / restart=single_session_recorded',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Restart hint：restart=single_session_recorded / replay=inspect_latest_run_step',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Replay review：inspect latest step before any recovery / mode=inspect_only / session=agent_session_1 / status=running / restartSafety=interrupted_or_stale / steps=1 / openCheckpoints=0 / recoveryCheckpoints=0 / latest=plan:completed:采用模型提出的 agent 步骤计划 / autoReplay=no',
      ),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText(
        'Recovery intent：prepare new manual run / session=agent_session_1 / status=running / restartSafety=interrupted_or_stale / openCheckpoints=0 / recoveryCheckpoints=0 / recoveryCheckpointRequired=no / manualRunRequired=yes / autoReplay=no',
      ),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText(
        'Recovery anchors：run=run_agent_plan / session=agent_session_1 / checkpoints=none / action=prepare_new_manual_run',
      ),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText('Executor lifecycle：Executor lifecycle / status=dry_run_available'),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText('runtimeReady=no / queueWorker=no / automaticStart=no'),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText('runtimeAuthority=diagnostic_only / executionAuthority=no'),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText('controlRequests=heartbeat,interrupt / controlMode=dry_run_planned'),
    ).toBeTruthy();
    expect(recoverySafety.getByText('unsupportedControlRequests=cancel')).toBeTruthy();
    expect(
      recoverySafety.getByText('settleResults=completed,failed,paused / settleMode=dry_run_planned'),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText('modelExposure=hidden / modelVisibleTools=no'),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText(
        'blocked=No real executor runtime is connected.; Lifecycle service is not wired into bootstrap, IPC, scheduler, or queue workers.; Model-visible tool exposure remains hidden.',
      ),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText(
        'next=Keep lifecycle service in dry-run diagnostics until a real executor adapter decision is accepted.',
      ),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText(
        'Next safe move：确认最近一次 agent run 是否已中断；若没有活动执行器，先基于证据整理输入，再启动新的 run，不自动重放。',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Session metadata：executor=local_agent / loop=local_note')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '回到任务推进' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '确认最近一次 agent run 是否已中断；若没有活动执行器，先基于证据整理输入，再启动新的 run，不自动重放。',
    );
    expect((screen.getByLabelText('附加要求') as HTMLTextAreaElement).value).toBe(
      '基于最近一次 agent run 的证据准备新的手动 run。 来源：run=run_agent_plan / session=agent_session_1。 最近步骤：采用模型提出的 agent 步骤计划（completed）。 恢复判断：Recovery intent：prepare new manual run / session=agent_session_1 / status=running / restartSafety=interrupted_or_stale / openCheckpoints=0 / recoveryCheckpoints=0 / recoveryCheckpointRequired=no / manualRunRequired=yes / autoReplay=no 不要自动重放旧 session；先复核失败/取消/中断证据、补齐输入，再由用户手动启动。',
    );
  });

  it('routes running agent sessions with active steps to inspect-first recovery', async () => {
    const user = userEvent.setup();
    const activeAgentRun = buildRunRecord({
      id: 'run_agent_active_step',
      taskId: riskTask.id,
      type: 'agent',
      status: 'running',
      output: null,
      outputSource: null,
    });
    const activeAgentDetail: RunDetailRecord = {
      ...activeAgentRun,
      agentSessions: [
        {
          id: 'agent_session_active',
          runId: activeAgentRun.id,
          mode: 'agent',
          status: 'running',
          capabilities: {
            structuredToolCalls: false,
            textOnlyPlanning: true,
            streaming: false,
            fileContext: true,
            taskMutationTools: false,
            longRunningSessions: true,
          },
          metadata: 'executor=local_agent\nloop=local_note',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      steps: [
        buildRunStep({
          id: 'run_step_agent_active',
          runId: activeAgentRun.id,
          index: 5,
          kind: 'tool_call',
          status: 'running',
          title: '执行工具：workspace.read_file',
        }),
      ],
      checkpoints: [],
    };
    const activeAgentApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [activeAgentRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === activeAgentRun.id ? activeAgentDetail : null,
      ),
    };

    window.api = activeAgentApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));

    expect(await screen.findByRole('heading', { name: 'agent / running' })).toBeTruthy();
    const recoverySafety = within(screen.getByLabelText('Run recovery safety'));
    expect(
      recoverySafety.getByText(
        'Replay review：inspect latest step before any recovery / mode=inspect_only / session=agent_session_active / status=running / restartSafety=live_status_unknown / steps=1 / openCheckpoints=0 / recoveryCheckpoints=0 / latest=tool_call:running:执行工具：workspace.read_file / autoReplay=no',
      ),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText(
        'Recovery intent：inspect evidence / session=agent_session_active / status=running / restartSafety=live_status_unknown / openCheckpoints=0 / recoveryCheckpoints=0 / recoveryCheckpointRequired=no / manualRunRequired=no / autoReplay=no',
      ),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText(
        'Recovery anchors：run=run_agent_active_step / session=agent_session_active / checkpoints=none / action=inspect_evidence',
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '回到任务推进' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '确认最近一次 agent run 是否仍有活动执行器；若无法确认，先查看最新步骤和证据，不自动重放。',
    );
  });

  it('routes completed agent sessions to terminal evidence review', async () => {
    const user = userEvent.setup();
    const completedAgentRun = buildRunRecord({
      id: 'run_agent_terminal_evidence',
      taskId: riskTask.id,
      type: 'agent',
      status: 'completed',
      output: 'Agent final output.',
      outputSource: 'ai',
    });
    const completedAgentDetail: RunDetailRecord = {
      ...completedAgentRun,
      agentSessions: [
        {
          id: 'agent_session_completed',
          runId: completedAgentRun.id,
          mode: 'agent',
          status: 'completed',
          capabilities: {
            structuredToolCalls: false,
            textOnlyPlanning: true,
            streaming: false,
            fileContext: true,
            taskMutationTools: false,
            longRunningSessions: true,
          },
          metadata: 'executor=local_agent\nloop=local_note',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      steps: [
        buildRunStep({
          id: 'run_step_agent_completed',
          runId: completedAgentRun.id,
          index: 7,
          kind: 'final',
          status: 'completed',
          title: '最终输出已生成',
          output: 'Agent final output.',
        }),
      ],
      checkpoints: [],
    };
    const completedAgentApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [completedAgentRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === completedAgentRun.id ? completedAgentDetail : null,
      ),
    };

    window.api = completedAgentApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));

    expect(await screen.findByRole('heading', { name: 'agent / completed' })).toBeTruthy();
    const recoverySafety = within(screen.getByLabelText('Run recovery safety'));
    expect(
      recoverySafety.getByText(
        'Replay review：inspect completed evidence / mode=inspect_only / session=agent_session_completed / status=completed / restartSafety=terminal_evidence / steps=1 / openCheckpoints=0 / recoveryCheckpoints=0 / latest=final:completed:最终输出已生成 / autoReplay=no',
      ),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText(
        'Recovery intent：inspect evidence / session=agent_session_completed / status=completed / restartSafety=terminal_evidence / openCheckpoints=0 / recoveryCheckpoints=0 / recoveryCheckpointRequired=no / manualRunRequired=no / autoReplay=no',
      ),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText(
        'Recovery anchors：run=run_agent_terminal_evidence / session=agent_session_completed / checkpoints=none / action=inspect_evidence',
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '回到任务推进' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '审阅最近一次 agent run 的完成证据和输出；旧 session 已终止，不需要恢复或重放。',
    );
    expect((screen.getByLabelText('附加要求') as HTMLTextAreaElement).value).toBe('');
  });

  it('routes paused agent sessions without recovery checkpoints to evidence review', async () => {
    const user = userEvent.setup();
    const pausedAgentRun = buildRunRecord({
      id: 'run_agent_paused_missing_checkpoint',
      taskId: riskTask.id,
      type: 'agent',
      status: 'paused',
      output: 'Paused but checkpoint is missing.',
      outputSource: 'system',
    });
    const pausedAgentDetail: RunDetailRecord = {
      ...pausedAgentRun,
      agentSessions: [
        {
          id: 'agent_session_paused_missing_checkpoint',
          runId: pausedAgentRun.id,
          mode: 'agent',
          status: 'paused',
          capabilities: {
            structuredToolCalls: false,
            textOnlyPlanning: true,
            streaming: false,
            fileContext: true,
            taskMutationTools: false,
            longRunningSessions: true,
          },
          metadata: 'executor=local_agent\nloop=local_note',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      steps: [
        buildRunStep({
          id: 'run_step_missing_checkpoint',
          runId: pausedAgentRun.id,
          index: 3,
          kind: 'checkpoint',
          status: 'completed',
          title: 'Resolved checkpoint no longer open',
        }),
      ],
      checkpoints: [
        buildRunCheckpoint({
          id: 'run_checkpoint_resolved_only',
          runId: pausedAgentRun.id,
          kind: 'resume',
          status: 'resolved',
        }),
      ],
    };
    const pausedAgentApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [pausedAgentRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === pausedAgentRun.id ? pausedAgentDetail : null,
      ),
      continuePausedRun: vi.fn(),
    };

    window.api = pausedAgentApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));

    expect(await screen.findByRole('heading', { name: 'agent / paused' })).toBeTruthy();
    expect(
      screen.getByText(
        'Replay review：inspect paused evidence; no recovery checkpoint / mode=inspect_only / session=agent_session_paused_missing_checkpoint / status=paused / restartSafety=checkpoint_missing / steps=1 / openCheckpoints=0 / recoveryCheckpoints=0 / latest=checkpoint:completed:Resolved checkpoint no longer open / autoReplay=no',
      ),
    ).toBeTruthy();
    expect(screen.getByText(
      'Recovery anchors：run=run_agent_paused_missing_checkpoint / session=agent_session_paused_missing_checkpoint / checkpoints=none / action=inspect_evidence',
    )).toBeTruthy();
    expect(screen.queryByRole('button', { name: '继续 paused run' })).toBeNull();

    await user.click(screen.getByRole('button', { name: '回到任务推进' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '复核最近一次 agent run 的暂停或确认原因；没有 recovery checkpoint 时，先查看执行证据再决定是否重跑。',
    );
    expect(pausedAgentApi.continuePausedRun).not.toHaveBeenCalled();
  });

  it('routes failed agent sessions to new-run recovery instead of replay', async () => {
    const user = userEvent.setup();
    const failedAgentRun = buildRunRecord({
      id: 'run_agent_failed_session',
      taskId: riskTask.id,
      type: 'agent',
      status: 'failed',
      output: 'Tool execution failed.',
      outputSource: 'system',
      failureReason: 'workspace.read_file failed',
    });
    const failedAgentDetail: RunDetailRecord = {
      ...failedAgentRun,
      agentSessions: [
        {
          id: 'agent_session_failed',
          runId: failedAgentRun.id,
          mode: 'agent',
          status: 'failed',
          capabilities: {
            structuredToolCalls: false,
            textOnlyPlanning: true,
            streaming: false,
            fileContext: true,
            taskMutationTools: false,
            longRunningSessions: true,
          },
          metadata: 'executor=local_agent\nloop=local_note',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      steps: [
        buildRunStep({
          id: 'run_step_agent_failed',
          runId: failedAgentRun.id,
          index: 6,
          kind: 'tool_result',
          status: 'failed',
          title: '工具失败：workspace.read_file',
          error: 'File not found',
        }),
      ],
      checkpoints: [],
    };
    const failedAgentApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [failedAgentRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === failedAgentRun.id ? failedAgentDetail : null,
      ),
    };

    window.api = failedAgentApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));

    expect(await screen.findByRole('heading', { name: 'agent / failed' })).toBeTruthy();
    const recoverySafety = within(screen.getByLabelText('Run recovery safety'));
    expect(
      screen.getByText(
        'Replay review：inspect failed steps before starting a new run / mode=new_run / session=agent_session_failed / status=failed / restartSafety=new_run_required / steps=1 / openCheckpoints=0 / recoveryCheckpoints=0 / latest=tool_result:failed:工具失败：workspace.read_file / autoReplay=no',
      ),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText(
        'Recovery intent：prepare new manual run / session=agent_session_failed / status=failed / restartSafety=new_run_required / openCheckpoints=0 / recoveryCheckpoints=0 / recoveryCheckpointRequired=no / manualRunRequired=yes / autoReplay=no',
      ),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText(
        'Recovery anchors：run=run_agent_failed_session / session=agent_session_failed / checkpoints=none / action=prepare_new_manual_run',
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '回到任务推进' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '检查最近一次 agent run 的失败或取消证据，整理重试输入后再启动新的 run。',
    );
    expect((screen.getByLabelText('附加要求') as HTMLTextAreaElement).value).toBe(
      '基于最近一次 agent run 的证据准备新的手动 run。 来源：run=run_agent_failed_session / session=agent_session_failed。 最近步骤：工具失败：workspace.read_file（failed）。 恢复判断：Recovery intent：prepare new manual run / session=agent_session_failed / status=failed / restartSafety=new_run_required / openCheckpoints=0 / recoveryCheckpoints=0 / recoveryCheckpointRequired=no / manualRunRequired=yes / autoReplay=no 不要自动重放旧 session；先复核失败/取消/中断证据、补齐输入，再由用户手动启动。',
    );
  });

  it('routes cancelled agent sessions to new-run recovery instead of replay', async () => {
    const user = userEvent.setup();
    const cancelledAgentRun = buildRunRecord({
      id: 'run_agent_cancelled_session',
      taskId: riskTask.id,
      type: 'agent',
      status: 'failed',
      output: 'Agent session cancelled by operator.',
      outputSource: 'system',
      failureReason: 'cancelled by operator',
    });
    const cancelledAgentDetail: RunDetailRecord = {
      ...cancelledAgentRun,
      agentSessions: [
        {
          id: 'agent_session_cancelled',
          runId: cancelledAgentRun.id,
          mode: 'agent',
          status: 'cancelled',
          capabilities: {
            structuredToolCalls: false,
            textOnlyPlanning: true,
            streaming: false,
            fileContext: true,
            taskMutationTools: false,
            longRunningSessions: true,
          },
          metadata: 'executor=local_agent\nloop=local_note',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      steps: [
        buildRunStep({
          id: 'run_step_agent_cancelled',
          runId: cancelledAgentRun.id,
          index: 7,
          kind: 'final',
          status: 'failed',
          title: 'Agent session 已取消',
          output: 'Cancelled by operator.',
        }),
      ],
      checkpoints: [],
    };
    const cancelledAgentApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [cancelledAgentRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === cancelledAgentRun.id ? cancelledAgentDetail : null,
      ),
    };

    window.api = cancelledAgentApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));

    expect(await screen.findByRole('heading', { name: 'agent / failed' })).toBeTruthy();
    const recoverySafety = within(screen.getByLabelText('Run recovery safety'));
    expect(
      recoverySafety.getByText(
        'Replay review：inspect cancellation evidence before starting a new run / mode=new_run / session=agent_session_cancelled / status=cancelled / restartSafety=new_run_required / steps=1 / openCheckpoints=0 / recoveryCheckpoints=0 / latest=final:failed:Agent session 已取消 / autoReplay=no',
      ),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText(
        'Recovery intent：prepare new manual run / session=agent_session_cancelled / status=cancelled / restartSafety=new_run_required / openCheckpoints=0 / recoveryCheckpoints=0 / recoveryCheckpointRequired=no / manualRunRequired=yes / autoReplay=no',
      ),
    ).toBeTruthy();
    expect(
      recoverySafety.getByText(
        'Recovery anchors：run=run_agent_cancelled_session / session=agent_session_cancelled / checkpoints=none / action=prepare_new_manual_run',
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '回到任务推进' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '检查最近一次 agent run 的失败或取消证据，整理重试输入后再启动新的 run。',
    );
    expect((screen.getByLabelText('附加要求') as HTMLTextAreaElement).value).toBe(
      '基于最近一次 agent run 的证据准备新的手动 run。 来源：run=run_agent_cancelled_session / session=agent_session_cancelled。 最近步骤：Agent session 已取消（failed）。 恢复判断：Recovery intent：prepare new manual run / session=agent_session_cancelled / status=cancelled / restartSafety=new_run_required / openCheckpoints=0 / recoveryCheckpoints=0 / recoveryCheckpointRequired=no / manualRunRequired=yes / autoReplay=no 不要自动重放旧 session；先复核失败/取消/中断证据、补齐输入，再由用户手动启动。',
    );
  });

  it('shows sandbox producer session policy and staged source steps on the runs page', async () => {
    const user = userEvent.setup();
    const sandboxProducerRun = buildRunRecord({
      id: 'run_sandbox_producer',
      taskId: riskTask.id,
      type: 'agent',
      status: 'completed',
      output: 'Sandbox producer preview ready',
      outputSource: 'system',
    });
    const sandboxProducerDetail: RunDetailRecord = {
      ...sandboxProducerRun,
      agentSessions: [
        {
          id: 'agent_session_sandbox_producer',
          runId: sandboxProducerRun.id,
          mode: 'agent',
          status: 'completed',
          capabilities: {
            structuredToolCalls: false,
            textOnlyPlanning: false,
            streaming: false,
            fileContext: true,
            taskMutationTools: false,
            longRunningSessions: true,
          },
          metadata: [
            'executor=sandboxed_coding_producer',
            'loop=sandboxed_coding',
            'producerStatus=source_ready',
            'sessionId=sandboxed_producer:sandbox_source_1',
            'sourceId=sandbox_source_1',
            'provider=openai-compatible',
            'producerSource=local_diagnostic',
            'commands=test,lint',
            'network=disabled',
            'promotion=decision_required',
            'backend=local-container',
            'summary=Local container producer preview ready',
          ].join('\n'),
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      steps: [
        buildRunStep({
          id: 'run_step_context_manifest',
          runId: sandboxProducerRun.id,
          index: 1,
          kind: 'plan',
          status: 'completed',
          title: 'Code Agent provider-visible context manifest',
          input: [
            'Provider-visible context manifest / items=2 / workspace_files=docs/notes.md / source_context=0 / artifacts=1 / content=partial',
            'providerPromptContent=partial',
            'workspace_file:docs/notes.md:docs/notes.md:content=yes',
            'artifact:artifact_prior_1:Prior: run output:content=no:artifactKind=run_output:sourceType=run:sourceId=run_prior_1',
          ].join('\n'),
          output: 'Provider-visible context manifest / items=2 / workspace_files=docs/notes.md / source_context=0 / artifacts=1 / content=partial',
        }),
        buildRunStep({
          id: 'run_step_sandbox_check',
          runId: sandboxProducerRun.id,
          index: 2,
          kind: 'tool_result',
          status: 'completed',
          title: 'Sandbox producer check passed: lint',
          output: 'lint: passed',
        }),
        buildRunStep({
          id: 'run_step_sandbox_source',
          runId: sandboxProducerRun.id,
          index: 3,
          kind: 'artifact',
          status: 'completed',
          title: 'Sandbox producer source ready',
          input: 'session=sandboxed_producer:sandbox_source_1\nsource=sandbox_source_1\nfiles=src/notes.md',
          output: 'Sandbox patch review run plan ready: src/notes.md',
        }),
      ],
      checkpoints: [
        buildRunCheckpoint({
          id: 'run_checkpoint_sandbox_patch_promotion',
          runId: sandboxProducerRun.id,
          stepId: 'run_step_sandbox_source',
          kind: 'patch_promotion',
          status: 'open',
          payload: JSON.stringify({
            version: 1,
            kind: 'patch_promotion',
            artifactId: 'artifact_sandbox_patch_1',
            artifactSummary: '1 file(s): src/notes.md | Checks: lint: passed.',
            sessionId: 'sandboxed_producer:sandbox_source_1',
            descriptorId: 'workspace.staged_patch',
            decisionId: 'decision_sandbox_patch_1',
            decisionTitle: '确认提升 sandbox patch',
            policySnapshot: {
              descriptorId: 'workspace.staged_patch',
            },
            preview: [
              'Summary: Update notes',
              'Files: src/notes.md',
              '*** Begin Patch',
              '*** Update File: src/notes.md',
              '+Reviewable note',
              '*** End Patch',
            ].join('\n'),
          }),
        }),
      ],
    };
    const sandboxProducerApi: ElectronApi = {
      ...mockApi,
      listDecisions: vi.fn(async () => [
        {
          id: 'decision_sandbox_patch_1',
          taskId: riskTask.id,
          title: '确认提升 sandbox patch',
          status: 'pending' as const,
          sourceType: 'agent_checkpoint' as const,
          sourceId: 'run_checkpoint_sandbox_patch_promotion',
          sourceLabel: 'workspace.staged_patch',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
      listRuns: vi.fn(async () => [sandboxProducerRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === sandboxProducerRun.id ? sandboxProducerDetail : null,
      ),
    };

    window.api = sandboxProducerApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));

    expect(await screen.findByRole('heading', { name: 'agent / completed' })).toBeTruthy();
    expect(
      screen.getByText(
        'Agent session：sandboxed coding producer / status=source_ready / backend=local-container / checks=test,lint / network=disabled / promotion=decision_required / read-only workspace input / staged patch output / Decision review required',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Tool families：workspace=staged_patch_review / task=not_exposed / provider_tools=not_exposed / coding=sandboxed_producer / browser=not_exposed / computer_use=not_exposed / mcp=not_exposed / creator=not_exposed / restart=long_running_session_recorded',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Restart hint：restart=not_needed / replay=run_steps_and_artifacts',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Session metadata：Sandboxed coding producer / status=source_ready / producer=local diagnostic preview / provider=openai-compatible / session=sandboxed_producer:sandbox_source_1 / source=sandbox_source_1 / backend=local-container / commands=test,lint / network=disabled / promotion=decision_required / summary=Local container producer preview ready',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Producer source：local diagnostic preview / no provider call'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'AgentRunLifecycle：source-ready / source=sandbox_source_1 / checks=test,lint / policy=network=disabled, promotion=decision_required, workspace mutation requires approved Decision / next=review patch-promotion Decision; workspace changes only after approval',
      ),
    ).toBeTruthy();
    expect(screen.getByText('审阅 sandbox 产出的 staged patch 证据')).toBeTruthy();
    expect(
      screen.getByText(
        'Staged patch review：source=sandbox_source_1 / files=src/notes.md / checks=lint passed / promotion=open / readiness=missing_apply_metadata / Decision=确认提升 sandbox patch / workspace unchanged until Decision approval',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Artifact：1 file(s): src/notes.md | Checks: lint: passed.'),
    ).toBeTruthy();
    expect(
      screen.getByText('Promotion readiness：Sandbox patch promotion readiness: missing_apply_metadata / Patch promotion apply metadata is missing: expectedFiles. Patch promotion apply metadata is missing: patchDigest.'),
    ).toBeTruthy();
    expect(
      screen.getByText(/Patch preview：\*\*\* Begin Patch \*\*\* Update File: src\/notes\.md/),
    ).toBeTruthy();
    expect(
      screen.getByText('Next review move：next=open promotion Decision; workspace remains unchanged until approval'),
    ).toBeTruthy();
    expect(screen.getByText('Source evidence')).toBeTruthy();
    expect(screen.getByText('source=sandbox_source_1; files=src/notes.md')).toBeTruthy();
    expect(screen.getByText('Targeted checks')).toBeTruthy();
    expect(screen.getByText('passed=lint passed')).toBeTruthy();
    expect(screen.getByText('Promotion Decision')).toBeTruthy();
    expect(screen.getByText('open; 确认提升 sandbox patch')).toBeTruthy();
    expect(screen.getByText('Workspace mutation')).toBeTruthy();
    expect(screen.getByText('workspace unchanged until Decision approval')).toBeTruthy();
    expect(
      screen.getByText(
        'Provider-visible context manifest / items=2 / workspace_files=docs/notes.md / source_context=0 / artifacts=1 / content=partial；provider prompt content=partial；items=workspace_file docs/notes.md content=yes；artifact Prior: run output (kind=run_output source=run:run_prior_1) content=no；manifest only; selected content is not expanded here',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Check evidence：lint passed；lint: passed'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Patch source ready；source=sandbox_source_1；files=src/notes.md；Sandbox patch review run plan ready: src/notes.md；next=review patch-promotion Decision; workspace changes only after approval',
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '回到任务准备重跑' }));
    expect(await screen.findByRole('heading', { name: 'High risk task' })).toBeTruthy();
    expect((screen.getByLabelText('Patch intent') as HTMLTextAreaElement).value).toBe(
      'Re-run the Code Agent staged patch review for run run_sandbox_producer. Review affected files: src/notes.md. Compare against promotion Decision: 确认提升 sandbox patch. Prior workspace status: workspace unchanged until Decision approval.',
    );

    await user.click(screen.getByRole('button', { name: /runs/i }));
    expect(await screen.findByRole('heading', { name: 'agent / completed' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '打开 promotion Decision' }));
    expect(await screen.findByRole('heading', { name: '确认提升 sandbox patch' })).toBeTruthy();
  });

  it('shows applied sandbox patch promotion evidence on the runs page', async () => {
    const user = userEvent.setup();
    const appliedPromotionRun = buildRunRecord({
      id: 'run_sandbox_promotion_applied',
      taskId: riskTask.id,
      type: 'agent',
      status: 'completed',
      output: 'Sandbox patch promotion applied / checkpoint=run_checkpoint_sandbox_patch_promotion / files=src/notes.md',
      outputSource: 'system',
    });
    const appliedPromotionDetail: RunDetailRecord = {
      ...appliedPromotionRun,
      steps: [
        buildRunStep({
          id: 'run_step_sandbox_source_applied',
          runId: appliedPromotionRun.id,
          index: 1,
          kind: 'artifact',
          status: 'completed',
          title: 'Sandbox producer source ready',
          input: 'session=sandboxed_producer:sandbox_source_1\nsource=sandbox_source_1\nfiles=src/notes.md',
          output: 'Sandbox patch review run plan ready: src/notes.md',
        }),
        buildRunStep({
          id: 'run_step_sandbox_apply_applied',
          runId: appliedPromotionRun.id,
          index: 2,
          kind: 'checkpoint',
          status: 'completed',
          title: '提升已应用：确认提升 sandbox patch',
          output: [
            'Sandbox patch promotion applied / checkpoint=run_checkpoint_sandbox_patch_promotion / files=src/notes.md',
            'Touched files: src/notes.md',
          ].join('\n'),
        }),
      ],
      checkpoints: [
        buildRunCheckpoint({
          id: 'run_checkpoint_sandbox_patch_promotion',
          runId: appliedPromotionRun.id,
          stepId: 'run_step_sandbox_source_applied',
          kind: 'patch_promotion',
          status: 'resolved',
          payload: JSON.stringify({
            version: 1,
            kind: 'patch_promotion',
            artifactId: 'artifact_sandbox_patch_1',
            artifactSummary: '1 file(s): src/notes.md | Checks: lint: passed.',
            sessionId: 'sandboxed_producer:sandbox_source_1',
            descriptorId: 'workspace.staged_patch',
            decisionId: 'decision_sandbox_patch_1',
            decisionTitle: '确认提升 sandbox patch',
            expectedFiles: ['src/notes.md'],
            patchDigest: 'sha256:123456',
            policySnapshot: {
              descriptorId: 'workspace.staged_patch',
            },
            preview: [
              'Summary: Update notes',
              'Files: src/notes.md',
              '*** Begin Patch',
              '*** Update File: src/notes.md',
              '+Reviewable note',
              '*** End Patch',
            ].join('\n'),
          }),
        }),
      ],
    };
    const appliedPromotionApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [appliedPromotionRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === appliedPromotionRun.id ? appliedPromotionDetail : null,
      ),
    };

    window.api = appliedPromotionApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));

    expect(await screen.findByRole('heading', { name: 'agent / completed' })).toBeTruthy();
    expect(
      screen.getByText(
        'Staged patch review：source=sandbox_source_1 / files=src/notes.md / promotion=resolved / readiness=already_resolved / Decision=确认提升 sandbox patch / workspace promotion applied after Decision approval',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Promotion readiness：Sandbox patch promotion readiness: already_resolved / checkpoint is no longer open'),
    ).toBeTruthy();
    expect(
      screen.getByText('Next review move：next=return to task and verify completion criteria against promoted workspace changes'),
    ).toBeTruthy();
    expect(
      screen.getAllByText('Sandbox patch promotion applied / checkpoint=run_checkpoint_sandbox_patch_promotion / files=src/notes.md').length,
    ).toBeTruthy();
  });

  it('shows preflight-only sandbox patch promotion evidence on the runs page', async () => {
    const user = userEvent.setup();
    const preflightOnlyRun = buildRunRecord({
      id: 'run_sandbox_promotion_preflight_only',
      taskId: riskTask.id,
      type: 'agent',
      status: 'completed',
      output: 'Workspace file application is still deferred; no workspace files were written.',
      outputSource: 'system',
    });
    const preflightOnlyDetail: RunDetailRecord = {
      ...preflightOnlyRun,
      steps: [
        buildRunStep({
          id: 'run_step_sandbox_source_preflight_only',
          runId: preflightOnlyRun.id,
          index: 1,
          kind: 'artifact',
          status: 'completed',
          title: 'Sandbox producer source ready',
          input: 'session=sandboxed_producer:sandbox_source_1\nsource=sandbox_source_1\nfiles=src/notes.md',
          output: 'Sandbox patch review run plan ready: src/notes.md',
        }),
        buildRunStep({
          id: 'run_step_sandbox_preflight_only',
          runId: preflightOnlyRun.id,
          index: 2,
          kind: 'checkpoint',
          status: 'completed',
          title: '提升预检通过：确认提升 sandbox patch',
          output: 'Workspace file application is still deferred; no workspace files were written.',
        }),
      ],
      checkpoints: [
        buildRunCheckpoint({
          id: 'run_checkpoint_sandbox_patch_promotion',
          runId: preflightOnlyRun.id,
          stepId: 'run_step_sandbox_source_preflight_only',
          kind: 'patch_promotion',
          status: 'resolved',
          payload: JSON.stringify({
            version: 1,
            kind: 'patch_promotion',
            artifactId: 'artifact_sandbox_patch_1',
            artifactSummary: '1 file(s): src/notes.md | Checks: lint: passed.',
            sessionId: 'sandboxed_producer:sandbox_source_1',
            descriptorId: 'workspace.staged_patch',
            decisionId: 'decision_sandbox_patch_1',
            decisionTitle: '确认提升 sandbox patch',
            expectedFiles: ['src/notes.md'],
            patchDigest: 'sha256:123456',
            policySnapshot: {
              descriptorId: 'workspace.staged_patch',
            },
          }),
        }),
      ],
    };
    window.api = {
      ...mockApi,
      listRuns: vi.fn(async () => [preflightOnlyRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === preflightOnlyRun.id ? preflightOnlyDetail : null,
      ),
    };

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));

    expect(await screen.findByRole('heading', { name: 'agent / completed' })).toBeTruthy();
    expect(
      screen.getByText(
        'Staged patch review：source=sandbox_source_1 / files=src/notes.md / promotion=resolved / readiness=already_resolved / Decision=确认提升 sandbox patch / Decision resolved in preflight-only mode; workspace files were not written',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Decision resolved in preflight-only mode; workspace files were not written')).toBeTruthy();
    expect(
      screen.getByText('Next review move：next=return to task and prepare rerun or explicit apply validation'),
    ).toBeTruthy();
  });

  it('shows cancelled sandbox patch promotion as no-write evidence on the runs page', async () => {
    const user = userEvent.setup();
    const cancelledPromotionRun = buildRunRecord({
      id: 'run_sandbox_promotion_cancelled',
      taskId: riskTask.id,
      type: 'agent',
      status: 'failed',
      output: 'No workspace files were written.',
      outputSource: 'system',
      failureReason: 'Sandbox patch promotion cancelled by operator. No workspace files were written.',
    });
    const cancelledPromotionDetail: RunDetailRecord = {
      ...cancelledPromotionRun,
      steps: [
        buildRunStep({
          id: 'run_step_sandbox_source_cancelled',
          runId: cancelledPromotionRun.id,
          index: 1,
          kind: 'artifact',
          status: 'completed',
          title: 'Sandbox producer source ready',
          input: 'session=sandboxed_producer:sandbox_source_1\nsource=sandbox_source_1\nfiles=src/notes.md',
          output: 'Sandbox patch review run plan ready: src/notes.md',
        }),
      ],
      checkpoints: [
        buildRunCheckpoint({
          id: 'run_checkpoint_sandbox_patch_promotion',
          runId: cancelledPromotionRun.id,
          stepId: 'run_step_sandbox_source_cancelled',
          kind: 'patch_promotion',
          status: 'cancelled',
          payload: JSON.stringify({
            version: 1,
            kind: 'patch_promotion',
            artifactId: 'artifact_sandbox_patch_1',
            sessionId: 'sandboxed_producer:sandbox_source_1',
            descriptorId: 'workspace.staged_patch',
            decisionId: 'decision_sandbox_patch_1',
            decisionTitle: '确认提升 sandbox patch',
            policySnapshot: {
              descriptorId: 'workspace.staged_patch',
            },
          }),
        }),
      ],
    };
    window.api = {
      ...mockApi,
      listRuns: vi.fn(async () => [cancelledPromotionRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === cancelledPromotionRun.id ? cancelledPromotionDetail : null,
      ),
    };

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));

    expect(await screen.findByRole('heading', { name: 'agent / failed' })).toBeTruthy();
    expect(
      screen.getByText(
        'Staged patch review：source=sandbox_source_1 / files=src/notes.md / promotion=cancelled / readiness=already_resolved / Decision=确认提升 sandbox patch / promotion blocked or cancelled; workspace files were not written',
      ),
    ).toBeTruthy();
    expect(screen.getByText('promotion blocked or cancelled; workspace files were not written')).toBeTruthy();
    expect(
      screen.getByText('Next review move：next=return to task and prepare rerun or explicit apply validation'),
    ).toBeTruthy();
  });

  it('shows failed sandbox check review guidance before rerun', async () => {
    const user = userEvent.setup();
    const failedCheckRun = buildRunRecord({
      id: 'run_sandbox_failed_check',
      taskId: riskTask.id,
      type: 'agent',
      status: 'failed',
      output: 'Sandbox producer checks failed',
      outputSource: 'system',
      failureReason: 'lint failed',
    });
    const failedCheckDetail: RunDetailRecord = {
      ...failedCheckRun,
      steps: [
        buildRunStep({
          id: 'run_step_failed_check_source',
          runId: failedCheckRun.id,
          index: 1,
          kind: 'artifact',
          status: 'completed',
          title: 'Sandbox producer source ready',
          input: 'session=sandboxed_producer:sandbox_source_failed\nsource=sandbox_source_failed\nfiles=src/notes.md',
          output: 'Sandbox patch review run plan ready: src/notes.md',
        }),
        buildRunStep({
          id: 'run_step_failed_check_lint',
          runId: failedCheckRun.id,
          index: 2,
          kind: 'tool_result',
          status: 'failed',
          title: 'Sandbox producer check failed: lint',
          output: 'lint failed: expected semicolon',
        }),
      ],
      checkpoints: [],
    };
    const failedCheckApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [failedCheckRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === failedCheckRun.id ? failedCheckDetail : null,
      ),
    };

    window.api = failedCheckApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));

    expect(await screen.findByRole('heading', { name: 'agent / failed' })).toBeTruthy();
    expect(
      screen.getByText(
        'Staged patch review：source=sandbox_source_failed / files=src/notes.md / checks=lint failed / workspace unchanged until Decision approval',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Next review move：next=review failed check evidence before rerun: lint failed'),
    ).toBeTruthy();
    expect(screen.getByText('failed=lint failed')).toBeTruthy();
    expect(screen.getByText('missing promotion Decision link')).toBeTruthy();
  });

  it('shows blocked sandbox producer diagnostics on the runs page', async () => {
    const user = userEvent.setup();
    const sandboxBlockedRun = buildRunRecord({
      id: 'run_sandbox_producer_blocked',
      taskId: riskTask.id,
      type: 'agent',
      status: 'failed',
      output: 'Sandbox producer blocked before runner start',
      outputSource: 'system',
      failureReason: 'docker daemon unavailable',
    });
    const sandboxBlockedDetail: RunDetailRecord = {
      ...sandboxBlockedRun,
      agentSessions: [
        {
          id: 'agent_session_sandbox_blocked',
          runId: sandboxBlockedRun.id,
          mode: 'agent',
          status: 'failed',
          capabilities: {
            structuredToolCalls: false,
            textOnlyPlanning: false,
            streaming: false,
            fileContext: true,
            taskMutationTools: false,
            longRunningSessions: true,
          },
          metadata: [
            'executor=sandboxed_coding_producer',
            'loop=sandboxed_coding',
            'producerStatus=blocked',
            'sessionId=sandboxed_producer:sandbox_source_1',
            'sourceId=sandbox_source_1',
            'provider=openai-compatible',
            'producerSource=model_backed',
            'commands=test,lint',
            'network=disabled',
            'promotion=decision_required',
            'backend=local-container',
            'blockedReasons=docker daemon unavailable',
            'summary=Sandboxed coding producer backend connection plan blocked: docker daemon unavailable',
          ].join('\n'),
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      steps: [
        buildRunStep({
          id: 'run_step_sandbox_blocked',
          runId: sandboxBlockedRun.id,
          index: 1,
          kind: 'final',
          status: 'completed',
          title: 'Sandbox producer backend blocked',
          input: [
            'session=sandboxed_producer:sandbox_source_1',
            'source=sandbox_source_1',
            'gate=Sandboxed coding producer backend connection blocked: docker daemon unavailable',
            'blockedReasons=docker daemon unavailable',
          ].join('\n'),
          output: 'Sandboxed coding producer backend connection plan blocked: docker daemon unavailable',
        }),
      ],
      checkpoints: [],
    };
    const sandboxBlockedApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [sandboxBlockedRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === sandboxBlockedRun.id ? sandboxBlockedDetail : null,
      ),
    };

    window.api = sandboxBlockedApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));

    expect(await screen.findByRole('heading', { name: 'agent / failed' })).toBeTruthy();
    expect(
      screen.getByText(
        'Agent session：sandboxed coding producer / status=blocked / backend=local-container / checks=test,lint / network=disabled / promotion=decision_required / read-only workspace input / staged patch output / Decision review required',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Session metadata：Sandboxed coding producer / status=blocked / producer=model-backed / provider=openai-compatible / session=sandboxed_producer:sandbox_source_1 / source=sandbox_source_1 / backend=local-container / commands=test,lint / network=disabled / promotion=decision_required / blockedReasons=docker daemon unavailable / summary=Sandboxed coding producer backend connection plan blocked: docker daemon unavailable',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Producer source：model-backed / provider call already spent for this run / Decision promotion still required'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'AgentRunLifecycle：blocked / source=sandbox_source_1 / checks=test,lint / policy=network=disabled, promotion=decision_required, workspace mutation requires approved Decision / blocked=docker daemon unavailable / next=fix runtime readiness, then start a new manual run',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Producer blocked；Sandboxed coding producer backend connection plan blocked: docker daemon unavailable；next=fix runtime readiness, then start a new manual run',
      ),
    ).toBeTruthy();
  });

  it('shows readable agent tool observation summaries on the runs page', async () => {
    const user = userEvent.setup();
    const agentObservationRun = buildRunRecord({
      id: 'run_agent_observation',
      taskId: riskTask.id,
      type: 'agent',
      status: 'needs_confirmation',
      output: 'Needs confirmation',
      outputSource: 'system',
    });
    const agentObservationDetail: RunDetailRecord = {
      ...agentObservationRun,
      steps: [
        buildRunStep({
          id: 'run_step_agent_observations',
          runId: agentObservationRun.id,
          index: 5,
          kind: 'decision',
          status: 'pending',
          title: '汇总 agent 工具观察',
          output: [
            '1. task.inspect_context [completed] Inspected context',
            '2. task.inspect_timeline [completed] Inspected timeline',
            '3. artifact.create_note [needs_confirmation] Needs confirmation；checkpoint=run_checkpoint_1',
          ].join('\n'),
        }),
      ],
      checkpoints: [],
    };
    const runAgentObservationApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [agentObservationRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === agentObservationRun.id ? agentObservationDetail : null,
      ),
    };

    window.api = runAgentObservationApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));

    expect(await screen.findByRole('heading', { name: 'agent / needs_confirmation' })).toBeTruthy();
    expect(
      screen.getByText(
        '工具观察：读取任务上下文（已完成）：Inspected context；读取最近时间线（已完成）：Inspected timeline；写入本地 note（等待确认）：Needs confirmation；checkpoint=run_checkpoint_1',
      ),
    ).toBeTruthy();
  });

  it('refreshes the runs page and selects newly triggered runs from the runs form', async () => {
    const user = userEvent.setup();
    const existingRun = buildRunRecord({
      id: 'run_existing',
      taskId: 'task_runs_refresh',
      type: 'draft',
      status: 'completed',
      output: 'Existing summary',
      outputSource: 'ai',
    });
    let currentRuns: RunRecord[] = [existingRun];
    let createdRunCount = 0;
    const runsRefreshTask = buildTaskRecord({
      id: 'task_runs_refresh',
      title: 'Runs refresh task',
      nextStep: 'Summarize launch notes',
    });

    const runsRefreshApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn(async () => [runsRefreshTask]),
      getTaskDetail: vi.fn(async (taskId: string) =>
        taskId === runsRefreshTask.id ? buildTaskDetail(runsRefreshTask) : null,
      ),
      listRuns: vi.fn(async () => currentRuns),
      getRunDetail: vi.fn(async (runId: string) =>
        currentRuns.find((run) => run.id === runId) ?? null,
      ),
      getHomeBrief: vi.fn(async () => ({
        ...briefData,
        recentTasks: [runsRefreshTask],
        recentRunCount: currentRuns.length,
      })),
      triggerRun: vi.fn(async (input) => {
        createdRunCount += 1;
        const createdRun = buildRunRecord({
          id: `run_runs_refresh_${createdRunCount}`,
          taskId: input.taskId,
          type: input.type,
          status: 'completed',
          instructions: input.instructions ?? null,
          output: `Fresh summary ${createdRunCount}`,
          outputSource: 'ai',
          updatedAt: '2026-01-02T00:00:00.000Z',
        });

        currentRuns = [createdRun, ...currentRuns];

        return createdRun;
      }),
    };

    window.api = runsRefreshApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    await screen.findByRole('heading', { name: '执行记录' });
    await screen.findByText('Existing summary');

    await user.selectOptions(screen.getByLabelText('关联任务'), runsRefreshTask.id);
    await user.selectOptions(screen.getByLabelText('Run 类型'), 'summarize');
    await user.type(screen.getByLabelText('附加要求'), 'Summarize the launch notes');
    await user.click(screen.getByRole('button', { name: '触发 Run' }));

    await waitFor(() => {
      expect(runsRefreshApi.triggerRun).toHaveBeenCalledWith({
        taskId: runsRefreshTask.id,
        type: 'summarize',
        instructions: 'Summarize the launch notes',
      });
    });
    await waitFor(() => {
      expect(runsRefreshApi.listRuns).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByRole('heading', { name: 'summarize / completed' })).toBeTruthy();
    expect(screen.getByText('Fresh summary 1')).toBeTruthy();
    expect(runsRefreshApi.getRunDetail).toHaveBeenCalledWith('run_runs_refresh_1');

    const instructionsInput = screen.getByLabelText('附加要求');
    await user.clear(instructionsInput);
    await user.type(instructionsInput, 'Summarize the final launch notes');
    await user.click(screen.getByRole('button', { name: '触发 Run' }));

    await waitFor(() => {
      expect(runsRefreshApi.triggerRun).toHaveBeenLastCalledWith({
        taskId: runsRefreshTask.id,
        type: 'summarize',
        instructions: 'Summarize the final launch notes',
      });
    });
    await waitFor(() => {
      expect(runsRefreshApi.listRuns).toHaveBeenCalledTimes(3);
    });

    expect(await screen.findByText('Fresh summary 2')).toBeTruthy();
    expect(screen.queryByText('Fresh summary 1')).toBeNull();
    expect(runsRefreshApi.getRunDetail).toHaveBeenCalledWith('run_runs_refresh_2');
  });

  it('triggers operator-started browser evidence smoke from the runs page', async () => {
    const user = userEvent.setup();
    const operatorRun = buildRunRecord({
      id: 'run_operator_browser',
      taskId: riskTask.id,
      type: 'agent',
      status: 'completed',
      output: 'Browser evidence smoke captured.',
      outputSource: 'system',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    let currentRuns: RunRecord[] = [...runs];
    const operatorRunApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => currentRuns),
      getRunDetail: vi.fn(async (runId: string) =>
        currentRuns.find((run) => run.id === runId) ?? null,
      ),
      getHomeBrief: vi.fn(async () => ({
        ...briefData,
        recentRunCount: currentRuns.length,
      })),
      triggerOperatorStartedRun: vi.fn(async (input) => {
        currentRuns = [{
          ...operatorRun,
          taskId: input.taskId,
        }, ...currentRuns];

        return currentRuns[0]!;
      }),
    };

    window.api = operatorRunApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    await screen.findByRole('heading', { name: '执行记录' });

    expect(screen.getByText(
      'Browser QA 入口仅限 operator-started 本地验收：modelExposure=hidden / providerCall=no / scheduler=no； controlled interaction 仍是 allowlisted local QA，不开放通用浏览器控制。',
    )).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('关联任务'), riskTask.id);
    await user.click(screen.getByRole('button', { name: '运行 Browser Evidence Smoke' }));

    await waitFor(() => {
      expect(operatorRunApi.triggerOperatorStartedRun).toHaveBeenCalledWith(expect.objectContaining({
        descriptorId: 'browser.readonly_evidence',
        kind: 'browser_evidence_smoke',
        modelExposure: 'hidden',
        operatorConfirmed: true,
        providerCallAllowed: false,
        schedulerAllowed: false,
        taskId: riskTask.id,
      }));
    });
    expect(operatorRunApi.triggerOperatorStartedRun).toHaveBeenCalledWith(expect.objectContaining({
      policy: expect.objectContaining({
        descriptorId: 'browser.readonly_evidence',
      }),
      reason: 'Capture isolated Browser Evidence smoke output for Run review.',
    }));
    await waitFor(() => {
      expect(operatorRunApi.listRuns).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByRole('heading', { name: 'agent / completed' })).toBeTruthy();
    expect(screen.getByText('Browser evidence smoke captured.')).toBeTruthy();
    expect(operatorRunApi.getRunDetail).toHaveBeenCalledWith('run_operator_browser');
  });

  it('triggers operator-started browser controlled local QA from the runs page', async () => {
    const user = userEvent.setup();
    const operatorTask = buildTaskRecord({
      id: 'task_operator_browser_controlled',
      title: 'Operator browser controlled task',
    });
    const createdRun = buildRunRecord({
      id: 'run_operator_browser_controlled',
      taskId: operatorTask.id,
      type: 'agent',
      status: 'completed',
      output: 'Browser controlled local QA completed / artifacts=screenshot / credentials=no / externalOrigin=no / modelExposure=hidden',
      outputSource: 'system',
    });
    let currentRuns: RunRecord[] = [];
    const operatorRunApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn(async () => [operatorTask]),
      getTaskDetail: vi.fn(async (taskId: string) =>
        taskId === operatorTask.id ? buildTaskDetail(operatorTask) : null,
      ),
      listRuns: vi.fn(async () => currentRuns),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === createdRun.id ? {
          ...createdRun,
          steps: [
            buildRunStep({
              id: 'run_step_browser_controlled_dry',
              kind: 'plan',
              output: 'browserStart=no / networkCall=no / pageMutation=no / modelExposure=hidden / scheduler=no / providerCall=no',
              runId: createdRun.id,
              title: 'browser controlled dry-run accepted',
            }),
            buildRunStep({
              id: 'run_step_browser_controlled_action',
              index: 2,
              kind: 'tool_call',
              runId: createdRun.id,
              title: 'Browser action planned: capture_evidence',
            }),
          ],
        } : null,
      ),
      triggerOperatorStartedRun: vi.fn(async () => {
        currentRuns = [createdRun];
        return createdRun;
      }),
    };

    window.api = operatorRunApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    expect(screen.getByText(
      'Browser QA 入口仅限 operator-started 本地验收：modelExposure=hidden / providerCall=no / scheduler=no； controlled interaction 仍是 allowlisted local QA，不开放通用浏览器控制。',
    )).toBeTruthy();
    await user.selectOptions(await screen.findByLabelText('关联任务'), operatorTask.id);
    await user.click(screen.getByRole('button', { name: '运行 Browser Controlled Local QA' }));

    expect(operatorRunApi.triggerOperatorStartedRun).toHaveBeenCalledWith(expect.objectContaining({
      descriptorId: 'browser.controlled_interaction',
      kind: 'browser_controlled_local_qa',
      modelExposure: 'hidden',
      operatorConfirmed: true,
      providerCallAllowed: false,
      reason: 'Run controlled Browser local QA fixture for Run review.',
      schedulerAllowed: false,
      taskId: operatorTask.id,
      policy: expect.objectContaining({
        descriptorId: 'browser.controlled_interaction',
        sessionKind: 'browser',
      }),
    }));
    expect(operatorRunApi.getRunDetail).toHaveBeenCalledWith('run_operator_browser_controlled');
    expect(await screen.findByText('Browser Controlled Interaction')).toBeTruthy();
  });

  it('previews agent capabilities before triggering a run from the runs page', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    await screen.findByRole('heading', { name: '执行记录' });

    await user.selectOptions(screen.getByLabelText('Run 类型'), 'agent');

    expect(
      screen.getByText(
        'Agent 能力预览：anthropic / claude-3-5-sonnet-latest / text-only planning unavailable until AI config is ready / read-only workspace context disabled for this run / task update/evidence tools disabled for this run / structured tool calls unavailable until AI config is ready / sandbox coding lane disabled; workspace patch/commands unavailable',
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole('checkbox', { name: '允许只读工作区上下文' }));
    await user.click(screen.getByRole('checkbox', { name: '允许任务内更新/证据工具' }));

    expect(
      screen.getByText(
        'Agent 能力预览：anthropic / claude-3-5-sonnet-latest / text-only planning unavailable until AI config is ready / read-only workspace context enabled for this run / task update/evidence tools enabled for this run / structured tool calls unavailable until AI config is ready / sandbox coding lane disabled; workspace patch/commands unavailable',
      ),
    ).toBeTruthy();
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
              id: 'timeline_next_step',
              taskId: riskTask.id,
              type: 'task.next_step_changed',
              payload: JSON.stringify({
                from: null,
                to: '检查失败原因并决定是否重试',
              }),
              createdAt: '2026-01-01T03:00:00.000Z',
            },
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
          ],
        };
      }),
    };

    window.api = runTimelineApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    await screen.findByRole('heading', { name: '执行记录' });

    await screen.findByText('Related Task Timeline');
    expect(screen.getByText('2026-01-01')).toBeTruthy();
    expect(screen.getAllByText('关键事件').length).toBeGreaterThan(0);
    expect(screen.getAllByText('解释事件').length).toBeGreaterThan(0);
    expect(screen.getAllByText('执行记录').length).toBeGreaterThan(0);
    expect(screen.getAllByText('产物').length).toBeGreaterThan(0);
    expect(screen.getAllByText('任务字段').length).toBeGreaterThan(0);
    expect(screen.getByText('执行失败：Executor exploded。')).toBeTruthy();
    expect(screen.getByText('生成产物：draft output。')).toBeTruthy();
    expect(screen.getByText('下一步从“未填写”调整为“检查失败原因并决定是否重试”')).toBeTruthy();
    expect(
      screen
        .getByText('执行失败：Executor exploded。')
        .compareDocumentPosition(screen.getByText('下一步从“未填写”调整为“检查失败原因并决定是否重试”')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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

    const actionButton = await screen.findByRole('button', { name: '复核失败并重试' });
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

  it('only exposes formal decision actions while a decision is pending', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /decisions/i }));
    await screen.findByRole('heading', { name: '待拍板事项' });

    expect(screen.getByRole('button', { name: '批准' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '延后' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Approve escalation path.*approved/i }));

    expect(
      screen.getByText('这条拍板已批准，正式动作已完成；下一步应回到任务继续推进。'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: '回到任务推进' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '批准' })).toBeNull();
    expect(screen.queryByRole('button', { name: '延后' })).toBeNull();
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull();
  });

  it('explains checkpoint decision consequences on the decisions page', async () => {
    const user = userEvent.setup();
    const checkpointDecisionApi: ElectronApi = {
      ...mockApi,
      listDecisions: vi.fn(async () => [
        {
          id: 'decision_checkpoint',
          taskId: riskTask.id,
          title: '确认本地写入：artifact.create_note',
          status: 'pending' as const,
          sourceType: 'agent_checkpoint' as const,
          sourceId: 'run_checkpoint_1',
          sourceLabel: 'artifact.create_note',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    };

    window.api = checkpointDecisionApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /decisions/i }));

    expect(await screen.findByRole('heading', { name: '确认本地写入：artifact.create_note' })).toBeTruthy();
    expect(
      screen.getByText('来源：Agent checkpoint（artifact.create_note）。批准后会进入等待中的本地 note 产物写入恢复路径，恢复结果以 Run 证据为准；延后或取消会终止本次 run。'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: '批准' })).toBeTruthy();
  });

  it('explains approved checkpoint recovery results come from run evidence', async () => {
    const user = userEvent.setup();
    const checkpointDecisionApi: ElectronApi = {
      ...mockApi,
      listDecisions: vi.fn(async () => [
        {
          id: 'decision_checkpoint_approved',
          taskId: riskTask.id,
          title: '确认本地写入：artifact.create_note',
          status: 'approved' as const,
          sourceType: 'agent_checkpoint' as const,
          sourceId: 'run_checkpoint_approved',
          sourceLabel: 'artifact.create_note',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    };

    window.api = checkpointDecisionApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /decisions/i }));

    expect(await screen.findByRole('heading', { name: '确认本地写入：artifact.create_note' })).toBeTruthy();
    expect(
      screen.getByText('来源：Agent checkpoint（artifact.create_note）。该确认已批准；等待中的本地 note 产物写入恢复结果以 Run 证据为准。'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: '批准' })).toBeNull();
  });

  it('prefills task next step from a pending checkpoint decision', async () => {
    const user = userEvent.setup();
    const checkpointDecisionApi: ElectronApi = {
      ...mockApi,
      listDecisions: vi.fn(async () => [
        {
          id: 'decision_checkpoint_patch',
          taskId: riskTask.id,
          title: '确认本地写入：workspace.write_patch',
          status: 'pending' as const,
          sourceType: 'agent_checkpoint' as const,
          sourceId: 'run_checkpoint_patch',
          sourceLabel: 'workspace.write_patch',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    };

    window.api = checkpointDecisionApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /decisions/i }));
    await screen.findByRole('heading', { name: '确认本地写入：workspace.write_patch' });

    await user.click(screen.getByRole('button', { name: '回到任务推进' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect(window.location.hash).toBe('#tasks');
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '先审查 workspace.write_patch checkpoint 的 diff 和受影响文件；批准后再回到任务确认 patch 是否已应用。',
    );
  });

  it('explains workspace patch checkpoint consequences on the decisions page', async () => {
    const user = userEvent.setup();
    const workspacePatchRun = buildRunRecord({
      id: 'run_workspace_patch_review',
      taskId: riskTask.id,
      type: 'agent',
      status: 'needs_confirmation',
      output: 'Workspace patch checkpoint pending',
      outputSource: 'system',
    });
    const workspacePatchRunDetail: RunDetailRecord = {
      ...workspacePatchRun,
      steps: [
        buildRunStep({
          id: 'run_step_workspace_patch',
          runId: workspacePatchRun.id,
          index: 1,
          kind: 'checkpoint',
          status: 'pending',
          title: 'Workspace patch requires confirmation',
          output: 'checkpoint=run_checkpoint_patch',
        }),
      ],
      checkpoints: [
        buildRunCheckpoint({
          id: 'run_checkpoint_patch',
          runId: workspacePatchRun.id,
          kind: 'confirmation',
          status: 'open',
        }),
      ],
    };
    const checkpointDecisionApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [workspacePatchRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === workspacePatchRun.id ? workspacePatchRunDetail : null,
      ),
      listDecisions: vi.fn(async () => [
        {
          id: 'decision_checkpoint_patch',
          taskId: riskTask.id,
          title: '确认本地写入：workspace.write_patch',
          status: 'pending' as const,
          sourceType: 'agent_checkpoint' as const,
          sourceId: 'run_checkpoint_patch',
          sourceLabel: 'workspace.write_patch',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    };

    window.api = checkpointDecisionApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /decisions/i }));

    expect(await screen.findByRole('heading', { name: '确认本地写入：workspace.write_patch' })).toBeTruthy();
    expect(
      screen.getByText('来源：Agent checkpoint（workspace.write_patch）。批准后会恢复等待中的工作区 patch 应用并写入受影响文件；延后或取消会终止本次 run，不会继续应用该 patch。'),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '查看 Run 证据' }));

    expect(await screen.findByRole('heading', { name: 'agent / needs_confirmation' })).toBeTruthy();
    expect(checkpointDecisionApi.getRunDetail).toHaveBeenCalledWith('run_workspace_patch_review');
  });

  it('explains workspace command checkpoint consequences on the decisions page', async () => {
    const user = userEvent.setup();
    const checkpointDecisionApi: ElectronApi = {
      ...mockApi,
      listDecisions: vi.fn(async () => [
        {
          id: 'decision_checkpoint_command',
          taskId: riskTask.id,
          title: '确认本地命令：workspace.run_command',
          status: 'pending' as const,
          sourceType: 'agent_checkpoint' as const,
          sourceId: 'run_checkpoint_command',
          sourceLabel: 'workspace.run_command',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    };

    window.api = checkpointDecisionApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /decisions/i }));

    expect(await screen.findByRole('heading', { name: '确认本地命令：workspace.run_command' })).toBeTruthy();
    expect(
      screen.getByText('来源：Agent checkpoint（workspace.run_command）。批准后会恢复等待中的工作区命令运行，且仅限 package.json 中的 test / lint 脚本；请先在 Runs 查看脚本、参数、超时和工作目录；延后或取消会终止本次 run，不会继续运行该命令。'),
    ).toBeTruthy();
  });

  it('explains task update checkpoint consequences on the decisions page', async () => {
    const user = userEvent.setup();
    const checkpointDecisionApi: ElectronApi = {
      ...mockApi,
      listDecisions: vi.fn(async () => [
        {
          id: 'decision_checkpoint_task_update',
          taskId: riskTask.id,
          title: '确认本地写入：task.update_next_step',
          status: 'pending' as const,
          sourceType: 'agent_checkpoint' as const,
          sourceId: 'run_checkpoint_task_update',
          sourceLabel: 'task.update_next_step',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    };

    window.api = checkpointDecisionApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /decisions/i }));

    expect(await screen.findByRole('heading', { name: '确认本地写入：task.update_next_step' })).toBeTruthy();
    expect(
      screen.getByText('来源：Agent checkpoint（task.update_next_step）。批准后会进入等待中的任务下一步更新恢复路径，恢复结果以 Run 证据为准；延后或取消会终止本次 run。'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '回到任务推进' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '先审查 task.update_next_step checkpoint 的输入；批准后再回到任务确认任务下一步更新结果。',
    );
  });

  it('explains browser controlled checkpoint consequences on the decisions page', async () => {
    const user = userEvent.setup();
    const checkpointDecisionApi: ElectronApi = {
      ...mockApi,
      listDecisions: vi.fn(async () => [
        {
          id: 'decision_checkpoint_browser_controlled',
          taskId: riskTask.id,
          title: '确认浏览器动作：browser.controlled_interaction',
          status: 'pending' as const,
          sourceType: 'agent_checkpoint' as const,
          sourceId: 'run_checkpoint_browser_controlled',
          sourceLabel: 'browser.controlled_interaction',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    };

    window.api = checkpointDecisionApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /decisions/i }));

    expect(await screen.findByRole('heading', { name: '确认浏览器动作：browser.controlled_interaction' })).toBeTruthy();
    expect(
      screen.getByText('来源：Agent checkpoint（browser.controlled_interaction）。批准后只会恢复 checkpoint 中记录的一个受控浏览器动作；不会授予通用浏览器会话、调度器启动、provider 调用或模型可见浏览器工具。延后或取消会终止本次 run 的该动作恢复。'),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '回到任务推进' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '先审查 browser.controlled_interaction checkpoint 的 URL、origin、目标元素和截图/文本证据；批准后只恢复一个记录动作，不开放浏览器会话。',
    );
  });

  it('explains sandbox patch promotion checkpoints do not auto-apply workspace files', async () => {
    const user = userEvent.setup();
    const stagedPatchRun = buildRunRecord({
      id: 'run_staged_patch_review',
      taskId: riskTask.id,
      type: 'agent',
      status: 'completed',
      output: 'Sandbox patch source ready',
      outputSource: 'system',
    });
    const stagedPatchRunDetail: RunDetailRecord = {
      ...stagedPatchRun,
      steps: [
        buildRunStep({
          id: 'run_step_staged_patch_source',
          runId: stagedPatchRun.id,
          index: 1,
          kind: 'artifact',
          status: 'completed',
          title: 'Sandbox producer source ready',
          input: 'source=sandbox_source_1\nfiles=src/notes.md',
        }),
      ],
      checkpoints: [
        buildRunCheckpoint({
          id: 'run_checkpoint_staged_patch',
          runId: stagedPatchRun.id,
          kind: 'patch_promotion',
          status: 'open',
        }),
      ],
    };
    const checkpointDecisionApi: ElectronApi = {
      ...mockApi,
      listRuns: vi.fn(async () => [stagedPatchRun]),
      getRunDetail: vi.fn(async (runId: string) =>
        runId === stagedPatchRun.id ? stagedPatchRunDetail : null,
      ),
      listDecisions: vi.fn(async () => [
        {
          id: 'decision_checkpoint_staged_patch',
          taskId: riskTask.id,
          title: 'Review Code Agent preview',
          status: 'pending' as const,
          sourceType: 'agent_checkpoint' as const,
          sourceId: 'run_checkpoint_staged_patch',
          sourceLabel: 'workspace.staged_patch',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    };

    window.api = checkpointDecisionApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /decisions/i }));

    expect(await screen.findByRole('heading', { name: 'Review Code Agent preview' })).toBeTruthy();
    expect(
      screen.getByText('来源：Agent checkpoint（workspace.staged_patch）。这是 sandbox staged patch 的提升审查；请先查看 Run 证据与 promotion readiness；当前版本批准后只会确认并关闭 promotion checkpoint，不会自动写入工作区文件。'),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '查看 Run 证据' }));

    expect(await screen.findByRole('heading', { name: 'agent / completed' })).toBeTruthy();
    expect(checkpointDecisionApi.getRunDetail).toHaveBeenCalledWith('run_staged_patch_review');
  });

  it('explains enabled sandbox patch promotion apply writes through the gated service', async () => {
    const user = userEvent.setup();
    const checkpointDecisionApi: ElectronApi = {
      ...mockApi,
      getAiConfigStatus: vi.fn().mockResolvedValue({
        ...aiStatus,
        featureFlags: {
          ...aiStatus.featureFlags,
          enableSandboxPatchPromotionApply: true,
        },
      }),
      listDecisions: vi.fn(async () => [
        {
          id: 'decision_checkpoint_staged_patch_apply',
          taskId: riskTask.id,
          title: 'Apply Code Agent preview',
          status: 'pending' as const,
          sourceType: 'agent_checkpoint' as const,
          sourceId: 'run_checkpoint_staged_patch',
          sourceLabel: 'workspace.staged_patch',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    };

    window.api = checkpointDecisionApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /decisions/i }));

    expect(await screen.findByRole('heading', { name: 'Apply Code Agent preview' })).toBeTruthy();
    expect(
      screen.getByText('来源：Agent checkpoint（workspace.staged_patch）。这是 sandbox staged patch 的提升审查；请先查看 Run 证据与 promotion readiness；批准后会通过 promotion preflight/apply service 写入受影响文件；延后或取消不会写入工作区文件。'),
    ).toBeTruthy();
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
              id: 'timeline_next_step',
              taskId: riskTask.id,
              type: 'task.next_step_changed',
              payload: JSON.stringify({
                from: null,
                to: '已获批准，继续推进：Approve escalation path',
              }),
              createdAt: '2026-01-01T03:00:00.000Z',
            },
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
    expect(screen.getByText('2026-01-01')).toBeTruthy();
    expect(screen.getAllByText('关键事件').length).toBeGreaterThan(0);
    expect(screen.getAllByText('解释事件').length).toBeGreaterThan(0);
    expect(screen.getAllByText('决策').length).toBeGreaterThan(0);
    expect(screen.getAllByText('等待项').length).toBeGreaterThan(0);
    expect(screen.getAllByText('任务字段').length).toBeGreaterThan(0);
    expect(screen.getByText('决策已获批准：Approve escalation path。')).toBeTruthy();
    expect(screen.getByText('等待原因从“未填写”调整为“等待重新拍板：Approve escalation path”')).toBeTruthy();
    expect(screen.getByText('下一步从“未填写”调整为“已获批准，继续推进：Approve escalation path”')).toBeTruthy();
    expect(
      screen
        .getByText('决策已获批准：Approve escalation path。')
        .compareDocumentPosition(screen.getByText('下一步从“未填写”调整为“已获批准，继续推进：Approve escalation path”')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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

    const actionButton = await screen.findByRole('button', { name: '继续推进' });
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
    const riskTaskCard = await screen.findByRole('button', { name: /High risk task/i });
    await user.click(riskTaskCard);
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
    const riskTaskCard = await screen.findByRole('button', { name: /High risk task/i });
    await user.click(riskTaskCard);
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
    expect(screen.getByText('2026-01-01')).toBeTruthy();
    expect(screen.getAllByText('任务字段').length).toBeGreaterThan(0);
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
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `timeline_trace_${index}`,
        taskId: timelineTask.id,
        type: 'task.updated',
        payload: JSON.stringify({ summary: `Trace update ${index}` }),
        createdAt: `2026-01-02T00:${String(index).padStart(2, '0')}:00.000Z`,
      })),
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
        type: 'task.run_failed',
        payload: JSON.stringify({
          failureReason: 'Model overloaded',
        }),
        createdAt: '2026-01-01T05:00:00.000Z',
      },
      {
        id: 'timeline_3',
        taskId: timelineTask.id,
        type: 'task_dependency.created',
        payload: JSON.stringify({ blockedByTaskTitle: 'Upstream design' }),
        createdAt: '2026-01-01T04:00:00.000Z',
      },
      {
        id: 'timeline_4',
        taskId: timelineTask.id,
        type: 'source_context.updated',
        payload: JSON.stringify({ title: 'Customer notes' }),
        createdAt: '2026-01-01T03:00:00.000Z',
      },
      {
        id: 'timeline_5',
        taskId: timelineTask.id,
        type: 'completion_criteria.satisfied',
        payload: JSON.stringify({ text: 'Stakeholder approved final brief' }),
        createdAt: '2026-01-01T02:00:00.000Z',
      },
      {
        id: 'timeline_6',
        taskId: timelineTask.id,
        type: 'task.next_step_changed',
        payload: JSON.stringify({ from: null, to: 'Prepare draft' }),
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

    expect(screen.getByRole('button', { name: '展开全部 (18)' })).toBeTruthy();
    expect(screen.getByText('2026-01-01')).toBeTruthy();
    expect(screen.queryByText('2026-01-02')).toBeNull();
    expect(screen.getAllByText('关键事件').length).toBeGreaterThan(0);
    expect(screen.getAllByText('解释事件').length).toBeGreaterThan(0);
    expect(screen.getAllByText('执行记录').length).toBeGreaterThan(0);
    expect(screen.getAllByText('任务依赖').length).toBeGreaterThan(0);
    expect(screen.getAllByText('来源材料').length).toBeGreaterThan(0);
    expect(screen.getAllByText('完成标准').length).toBeGreaterThan(0);
    expect(screen.queryByText('留痕事件')).toBeNull();
    expect(screen.queryByText('任务字段已更新')).toBeNull();
    expect(screen.getByText('任务依赖更新：Upstream design。')).toBeTruthy();
    expect(screen.getByText('执行失败：Model overloaded。')).toBeTruthy();
    expect(screen.getByText('来源材料更新：Customer notes。')).toBeTruthy();
    expect(screen.getByText('完成标准已满足：Stakeholder approved final brief。')).toBeTruthy();
    expect(screen.getAllByText('解释').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '展开全部 (18)' }));

    expect(screen.getByText('执行失败：Model overloaded。')).toBeTruthy();
    expect(screen.getByText('2026-01-02')).toBeTruthy();
    expect(screen.getAllByText('任务字段').length).toBeGreaterThan(0);
    expect(screen.getAllByText('留痕事件').length).toBeGreaterThan(0);
    expect(screen.getAllByText('任务字段已更新').length).toBeGreaterThan(0);
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

    await user.click(screen.getByRole('button', { name: '复核失败并重试' }));

    expect((screen.getByLabelText('附加要求') as HTMLTextAreaElement).value).toContain(
      'Executor exploded',
    );

    await user.click(screen.getByRole('button', { name: '重新评估并拍板' }));

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

    expect(screen.getByText('决策已获批准：Legal sign-off。')).toBeTruthy();
    expect(screen.getByText('执行完成，任务恢复到 planned。')).toBeTruthy();

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

    await user.click(screen.getByRole('button', { name: '补清等待条件' }));

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

    await user.click(screen.getByRole('button', { name: '优先处理风险' }));

    expect((screen.getByLabelText('Risk Level') as HTMLSelectElement).value).toBe('high');
    expect((screen.getByLabelText('Risk Note') as HTMLTextAreaElement).value).toBe(
      'Dependency blocked',
    );
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '处理当前风险并确认是否需要降级：Dependency blocked',
    );
  });

  it('surfaces context creation shortcuts from the first task detail slices', async () => {
    const user = userEvent.setup();

    const contextShortcutTask = buildTaskRecord({
      id: 'task_context_shortcuts',
      title: 'Context shortcut task',
      state: 'planned',
    });

    const contextShortcutApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([contextShortcutTask]),
      getTaskDetail: vi.fn().mockResolvedValue(buildTaskDetail(contextShortcutTask)),
    };

    window.api = contextShortcutApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /context shortcut task/i }));
    await screen.findByRole('heading', { name: 'Context shortcut task' });

    expect(screen.getByRole('button', { name: '新增来源材料' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '新增方法模板' })).toBeTruthy();
  });

  it('offers compact jumps across long task detail sections', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      render(<App />);

      await user.click(screen.getByRole('button', { name: /tasks/i }));
      await user.click(await screen.findByRole('button', { name: /high risk task/i }));
      await screen.findByRole('heading', { name: 'High risk task' });

      const sectionNav = screen.getByRole('navigation', { name: 'Task detail sections' });

      expect(within(sectionNav).getByRole('button', { name: '当前' })).toBeTruthy();
      expect(within(sectionNav).getByRole('button', { name: '完成' })).toBeTruthy();
      expect(within(sectionNav).getByRole('button', { name: '动作' })).toBeTruthy();
      expect(within(sectionNav).getByRole('button', { name: '历史' })).toBeTruthy();
      expect(within(sectionNav).getByRole('button', { name: '管理' })).toBeTruthy();

      await user.click(within(sectionNav).getByRole('button', { name: '动作' }));

      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      });
    }
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

  it('creates and resolves blocker items from task detail', async () => {
    const user = userEvent.setup();

    const blockerTask = buildTaskRecord({
      id: 'task_blocker_context',
      title: 'Blocker context task',
      state: 'planned',
    });

    let currentDetail: TaskDetail = {
      ...buildTaskDetail(blockerTask),
      sourceContexts: [
        buildSourceContext({
          id: 'source_context_blocker',
          taskId: blockerTask.id,
          title: 'Legal brief',
          kind: 'doc',
          uri: 'https://example.com/legal-brief',
          note: 'Needed for sign-off',
        }),
      ],
    };

    const blockerApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([blockerTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== blockerTask.id) {
          return null;
        }

        return currentDetail;
      }),
      createBlocker: vi.fn().mockImplementation(async (input) => {
        const created = buildBlocker({
          id: 'blocker_created',
          taskId: input.taskId,
          title: input.title,
          kind: input.kind,
          detail: input.detail ?? null,
          owner: input.owner ?? null,
          sourceContextId: input.sourceContextId ?? null,
          updatedAt: '2026-01-02T00:00:00.000Z',
        });
        currentDetail = {
          ...currentDetail,
          activeBlocker: created,
          resumeCard: {
            ...currentDetail.resumeCard,
            currentBlocker: {
              blockerId: created.id,
              title: created.title,
              detail: created.detail,
            },
          },
        };
        return created;
      }),
      resolveBlocker: vi.fn().mockImplementation(async (id: string) => {
        const resolved = buildBlocker({
          id,
          taskId: blockerTask.id,
          status: 'resolved',
          resolvedAt: '2026-01-03T00:00:00.000Z',
          updatedAt: '2026-01-03T00:00:00.000Z',
        });
        currentDetail = {
          ...currentDetail,
          activeBlocker: null,
          resumeCard: {
            ...currentDetail.resumeCard,
            currentBlocker: {
              blockerId: null,
              title: '暂无当前阻塞项',
              detail: null,
            },
          },
        };
        return resolved;
      }),
    };

    window.api = blockerApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /blocker context task/i }));
    await screen.findByRole('heading', { name: 'Blocker context task' });

    await user.type(screen.getByLabelText('阻塞项标题'), 'Legal approval pending');
    await user.selectOptions(screen.getByLabelText('阻塞项类型'), 'approval');
    await user.type(screen.getByLabelText('阻塞说明'), 'Need legal sign-off before launch');
    await user.type(screen.getByLabelText('owner / 卡点对象'), 'Legal');
    await user.selectOptions(screen.getByLabelText('关联来源材料'), 'source_context_blocker');
    await user.click(screen.getByRole('button', { name: '新增阻塞项' }));

    expect(blockerApi.createBlocker).toHaveBeenCalledWith({
      taskId: 'task_blocker_context',
      title: 'Legal approval pending',
      kind: 'approval',
      detail: 'Need legal sign-off before launch',
      owner: 'Legal',
      responsibility: 'unknown',
      responsibilityLabel: '',
      sourceContextId: 'source_context_blocker',
    });
    expect((await screen.findAllByText('Legal approval pending')).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: '解除阻塞' })[0]!);

    expect(blockerApi.resolveBlocker).toHaveBeenCalledWith('blocker_created');
    expect(await screen.findByText('暂无当前阻塞项')).toBeTruthy();
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
      probeSandboxBackend: vi.fn(async () => ({
        probe: {
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
        },
        profile: {
          credentialPassthrough: false,
          environmentPolicy: 'empty',
          id: 'local-container',
          isolation: 'container',
          kind: 'local_container',
          networkMode: 'disabled',
          supportsOutputLimits: true,
          supportsPatchArtifacts: true,
          supportsStagedWrites: true,
          supportsStructuredCommands: true,
          supportsTargetedCommands: true,
          supportsWorkspaceMount: true,
        },
        readiness: {
          blockedReasons: [],
          ready: true,
          summary: 'Sandbox backend ready: local-container.',
        },
        producerBackendReadiness: {
          blockedReasons: [
            'sandbox coding-agent feature flag is disabled',
          ],
          ready: false,
          summary: 'Sandboxed coding producer backend blocked: sandbox coding-agent feature flag is disabled',
        },
        summary: 'Sandbox backend ready: local-container.',
      } satisfies Awaited<ReturnType<NonNullable<ElectronApi['probeSandboxBackend']>>>)),
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
          apiKeySource: 'keychain',
          provider: input.provider,
          model: input.model,
          baseUrl: input.baseUrl ?? null,
          workspaceRoot: input.workspaceRoot ?? null,
          updatedAt: '2026-01-02T00:00:00.000Z',
          configPath: '/tmp/config.json',
          featureFlags: {
            enableScheduler: input.featureFlags.enableScheduler,
          },
          executorLifecycleAvailability: buildDryRunAgentExecutorLifecycleAvailability(),
          toolScaffoldSummaries: summarizeAgentToolScaffoldFamilies({
            policy: {
              allowLocalWorkspaceRead: false,
              allowTaskMutationTools: false,
            },
          }),
        };

        currentBriefData = {
          ...currentBriefData,
          schedulerStatus: {
            enabled: input.featureFlags.enableScheduler,
            running: input.featureFlags.enableScheduler,
            lastBriefAt: input.featureFlags.enableScheduler
              ? '2026-01-02T00:05:00.000Z'
              : null,
            lastRunSweepAt: input.featureFlags.enableScheduler
              ? '2026-01-02T00:04:00.000Z'
              : null,
          },
        };

        subscriber?.({ type: 'settings.changed', at: '2026-01-02T00:00:00.000Z' });

        return currentAiStatus;
      }),
    };

    window.api = eventingApi;

    render(<App />);

    await screen.findByText(/Scheduler： 未启用/);
    expect(screen.getByText(/最近 brief：暂无/)).toBeTruthy();
    expect(screen.getByText(/最近 run sweep：暂无/)).toBeTruthy();

    await user.click(await screen.findByRole('button', { name: /settings/i }));
    await screen.findByRole('heading', { name: 'AI Provider 与本地密钥存储' });
    expect(
      screen.getByText(/已选择 anthropic \/ claude-3-5-sonnet-latest，但 AI config 未就绪/),
    ).toBeTruthy();
    expect(screen.getByText(/Sandbox Backend：未检测/)).toBeTruthy();
    expect(screen.getByText(/Sandbox Coding Lane：等待 Sandbox Backend 检测/)).toBeTruthy();
    expect(screen.getByText(
      'Browser Evidence：Browser evidence preflight: reserved / configuredOrigins=0 / modelExposure=hidden / browserStart=no / networkCall=no / next=manual isolated runner smoke available while runtime stays hidden',
    )).toBeTruthy();
    const orchestrationDiagnostics = within(screen.getByLabelText('Orchestration diagnostics'));
    expect(orchestrationDiagnostics.getByText('Orchestration Diagnostics')).toBeTruthy();
    expect(orchestrationDiagnostics.getByText(
      'Summary：runtime=not_checked / profile=manual_sandbox_producer / lifecycle=drafted / hidden=browser_playwright,mcp,skill,computer_use,creator_connector / modelVisibleHiddenTools=no / automation=disabled / autoStart=no',
    )).toBeTruthy();
    expect(orchestrationDiagnostics.getByText(
      'AgentRunLifecycle：drafted / start=manual_or_operator_started / queue=no / claim=no / scheduler=no / autoStart=no',
    )).toBeTruthy();
    expect(orchestrationDiagnostics.getByText(
      'Hidden tool families / families=browser_playwright,mcp,skill,computer_use,creator_connector / modelVisible=no',
    )).toBeTruthy();
    expect(orchestrationDiagnostics.getByText(
      'Executor lifecycle：Executor lifecycle / status=dry_run_available',
    )).toBeTruthy();
    expect(orchestrationDiagnostics.getByText(
      'runtimeReady=no / queueWorker=no / automaticStart=no',
    )).toBeTruthy();
    expect(orchestrationDiagnostics.getByText(
      'runtimeAuthority=diagnostic_only / executionAuthority=no',
    )).toBeTruthy();
    expect(orchestrationDiagnostics.getByText(
      'controlRequests=heartbeat,interrupt,cancel / controlMode=dry_run_planned',
    )).toBeTruthy();
    expect(orchestrationDiagnostics.getByText('unsupportedControlRequests=none')).toBeTruthy();
    expect(orchestrationDiagnostics.getByText(
      'settleResults=completed,failed,paused / settleMode=dry_run_planned',
    )).toBeTruthy();
    expect(orchestrationDiagnostics.getByText(
      'modelExposure=hidden / modelVisibleTools=no',
    )).toBeTruthy();
    expect(orchestrationDiagnostics.getByText(
      'blocked=No real executor runtime is connected.; Lifecycle service is not wired into bootstrap, IPC, scheduler, or queue workers.; Model-visible tool exposure remains hidden.',
    )).toBeTruthy();
    expect(orchestrationDiagnostics.getByText(
      'next=Keep lifecycle service in dry-run diagnostics until a real executor adapter decision is accepted.',
    )).toBeTruthy();
    expect(screen.getByText('Workspace Coding')).toBeTruthy();
    expect(screen.getByText('4 implemented / 1 reserved / 0 text / 0 native / 3 approval / 0 credential / 3 verification')).toBeTruthy();
    const toolScaffoldDiagnostics = screen.getByLabelText('Tool scaffold diagnostics');
    expect(within(toolScaffoldDiagnostics).getByText('Browser / Playwright')).toBeTruthy();
    expect(within(toolScaffoldDiagnostics).getAllByText(
      '0 implemented / 1 reserved / 0 text / 0 native / 0 approval / 1 credential / 1 verification',
    ).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '检测 Sandbox Backend' }));
    await screen.findByText(/Sandbox Backend：可用：Sandbox backend ready: local-container\./);
    expect(screen.getByText(/Sandbox Coding Lane：Sandbox coding lane unavailable/)).toBeTruthy();
    expect(screen.getByText(/Producer Backend：Sandboxed coding producer backend blocked/)).toBeTruthy();
    expect(screen.getAllByText(/sandbox coding-agent feature flag is disabled/)).toHaveLength(2);
    expect(eventingApi.probeSandboxBackend).toHaveBeenCalledTimes(1);

    await user.selectOptions(screen.getByLabelText('Provider'), 'openai');
    const modelInput = screen.getByLabelText('Model');
    await user.clear(modelInput);
    await user.type(modelInput, 'gpt-5.4-mini');
    await user.type(screen.getByLabelText('Base URL'), 'https://relay.example.com/v1');
    await user.type(screen.getByLabelText('API Key'), 'sk-test-key');
    await user.type(screen.getByLabelText('Workspace Root'), '/tmp/taskplane-workspace');
    await user.click(screen.getByLabelText('启用本地 scheduler'));
    await user.click(screen.getByRole('button', { name: '保存到 Main / Keychain' }));

    await waitFor(() => {
      expect(eventingApi.setAiConfig).toHaveBeenCalledWith({
        provider: 'openai',
        model: 'gpt-5.4-mini',
        baseUrl: 'https://relay.example.com/v1',
        workspaceRoot: '/tmp/taskplane-workspace',
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
    expect(screen.getByText(/Workspace Root：\/tmp\/taskplane-workspace/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /home/i }));

    await waitFor(() => {
      expect(screen.getByText(/已配置 openai \/ gpt-5.4-mini/i)).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText(/Scheduler： 已启用并运行中/)).toBeTruthy();
    });

    expect(screen.getByText(/最近 brief：2026-01-02T00:05:00.000Z/)).toBeTruthy();
    expect(screen.getByText(/最近 run sweep：2026-01-02T00:04:00.000Z/)).toBeTruthy();
    expect(eventingApi.getHomeBrief).toHaveBeenCalledTimes(2);
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

  it('opens blocked tasks from home key signals with blocker-focused guidance', async () => {
    const user = userEvent.setup();

    const blockedTask = buildTaskRecord({
      id: 'task_blocked_home',
      title: 'Blocked home task',
      state: 'planned',
      nextStep: null,
      activeBlocker: buildBlocker({
        id: 'blocker_home_1',
        taskId: 'task_blocked_home',
        title: 'Legal approval pending',
        detail: 'Need legal sign-off before launch',
        sourceContextId: 'source_context_blocked_home',
      }),
    });

    const sourceItem = buildSourceContext({
      id: 'source_context_blocked_home',
      taskId: blockedTask.id,
      title: 'Legal brief',
      note: 'Latest legal review notes',
    });

    const blockerHomeApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([blockedTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== blockedTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(blockedTask),
          sourceContexts: [sourceItem],
        };
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 1,
        waitingTaskCount: 0,
        blockerTaskCount: 1,
        escalationTaskCount: 1,
        highRiskTaskCount: 0,
        missingNextStepTaskCount: 0,
        recentTasks: [blockedTask],
        waitingTasks: [],
        blockerTasks: [blockedTask],
        escalationTasks: [],
        highRiskTasks: [],
        missingNextStepTasks: [],
        recommendedActions: [],
        recentArtifacts: [],
        recentSourceContexts: [],
        recentActivity: [],
      }),
    };

    window.api = blockerHomeApi;

    render(<App />);

    const blockedSection = screen.getByText('Blocked Tasks').closest('section');
    expect(blockedSection).toBeTruthy();

    const blockedButton = await within(blockedSection as HTMLElement).findByRole('button', {
      name: /Blocked home task/i,
    });
    await user.click(blockedButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Blocked home task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('来源标题') as HTMLInputElement).value).toBe('Legal brief');
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '先解除阻塞项，再继续推进：Legal approval pending',
    );
    const actionDesk = screen.getByRole('heading', { name: '动作与状态流转' }).closest('.detail-stage');
    expect(actionDesk).toBeTruthy();
    expect(within(actionDesk as HTMLElement).getByRole('button', { name: '处理当前阻塞' })).toBeTruthy();
    expect(within(actionDesk as HTMLElement).getByRole('button', { name: '调整任务状态' })).toBeTruthy();
    expect(within(actionDesk as HTMLElement).queryByRole('button', { name: '草拟或创建 Decision' })).toBeNull();
    expect(screen.getAllByText(/blocked since 2026-01-01/).length).toBeGreaterThan(0);
  });

  it('opens blocker sources from home key signals', async () => {
    const user = userEvent.setup();

    const blockedTask = buildTaskRecord({
      id: 'task_blocked_source_home',
      title: 'Blocked source task',
      state: 'planned',
      nextStep: null,
      activeBlocker: buildBlocker({
        id: 'blocker_source_home_1',
        taskId: 'task_blocked_source_home',
        title: 'Partner list missing',
        detail: 'Need the current partner list before outreach',
        sourceContextId: 'source_context_blocked_source_home',
      }),
    });

    const sourceItem = buildSourceContext({
      id: 'source_context_blocked_source_home',
      taskId: blockedTask.id,
      title: 'Partner master sheet',
      note: 'Latest partner inventory',
    });

    const blockerHomeApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([blockedTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== blockedTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(blockedTask),
          sourceContexts: [sourceItem],
        };
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 1,
        waitingTaskCount: 0,
        blockerTaskCount: 1,
        escalationTaskCount: 1,
        highRiskTaskCount: 0,
        missingNextStepTaskCount: 0,
        recentTasks: [blockedTask],
        waitingTasks: [],
        blockerTasks: [blockedTask],
        escalationTasks: [],
        highRiskTasks: [],
        missingNextStepTasks: [],
        recommendedActions: [],
        recentArtifacts: [],
        recentSourceContexts: [],
        recentActivity: [],
      }),
    };

    window.api = blockerHomeApi;

    render(<App />);

    const blockedSection = screen.getByText('Blocked Tasks').closest('section');
    expect(blockedSection).toBeTruthy();

    await user.click(await within(blockedSection as HTMLElement).findByRole('button', { name: '查看阻塞来源' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Blocked source task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('来源标题') as HTMLInputElement).value).toBe('Partner master sheet');
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe('');
  });

  it('opens upstream tasks from home dependency signals', async () => {
    const user = userEvent.setup();

    const upstreamTask = buildTaskRecord({
      id: 'task_upstream_home',
      title: 'Publish partner list',
      state: 'planned',
      nextStep: 'Finalize partner list',
    });
    const dependencyTask = buildTaskRecord({
      id: 'task_dependency_home',
      title: 'Draft outreach email',
      state: 'planned',
      nextStep: 'Prepare outreach draft',
      activeDependency: buildTaskDependency({
        id: 'task_dependency_home_link',
        taskId: 'task_dependency_home',
        blockedByTaskId: upstreamTask.id,
        blockedByTaskTitle: upstreamTask.title,
        reason: 'Need the approved partner list before drafting outreach.',
      }),
    });

    const dependencyHomeApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([dependencyTask, upstreamTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId === dependencyTask.id) {
          return buildTaskDetail(dependencyTask);
        }

        if (taskId === upstreamTask.id) {
          return buildTaskDetail(upstreamTask);
        }

        return null;
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 2,
        waitingTaskCount: 0,
        blockerTaskCount: 0,
        dependencyTaskCount: 1,
        escalationTaskCount: 0,
        highRiskTaskCount: 0,
        missingNextStepTaskCount: 0,
        recentTasks: [dependencyTask, upstreamTask],
        waitingTasks: [],
        blockerTasks: [],
        dependencyTasks: [dependencyTask],
        escalationTasks: [],
        highRiskTasks: [],
        missingNextStepTasks: [],
        recommendedActions: [],
        recentArtifacts: [],
        recentSourceContexts: [],
        recentActivity: [],
      }),
    };

    window.api = dependencyHomeApi;

    render(<App />);

    const dependencySection = screen.getByText('Blocked by Tasks').closest('section');
    expect(dependencySection).toBeTruthy();

    await user.click(
      await within(dependencySection as HTMLElement).findByRole('button', { name: '打开上游任务' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Publish partner list' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '先完成这条上游任务，以解除对“Draft outreach email”的依赖。',
    );
  });

  it('surfaces stale dependencies under escalation instead of blocked-by tasks on home', async () => {
    const user = userEvent.setup();
    const dependencyCreatedAt = '2026-01-01T00:00:00.000Z';

    const upstreamTask = buildTaskRecord({
      id: 'task_dependency_escalation_upstream',
      title: 'Finalize legal brief',
      state: 'planned',
      nextStep: 'Close legal feedback',
    });
    const staleDependencyTask = buildTaskRecord({
      id: 'task_dependency_escalation_downstream',
      title: 'Launch outreach sequence',
      state: 'planned',
      nextStep: 'Confirm whether the dependency can be removed',
      activeDependency: buildTaskDependency({
        id: 'task_dependency_escalation_link',
        taskId: 'task_dependency_escalation_downstream',
        blockedByTaskId: upstreamTask.id,
        blockedByTaskTitle: upstreamTask.title,
        reason: 'Need the legal brief to close before launch.',
        createdAt: dependencyCreatedAt,
      }),
    });

    const dependencyEscalationApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([staleDependencyTask, upstreamTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId === staleDependencyTask.id) {
          return buildTaskDetail(staleDependencyTask);
        }

        if (taskId === upstreamTask.id) {
          return buildTaskDetail(upstreamTask);
        }

        return null;
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 2,
        blockerTaskCount: 0,
        dependencyTaskCount: 0,
        escalationTaskCount: 1,
        priorityHeadline: '当前有 1 条任务因依赖链路过久需要升级处理',
        priorityLede:
          '当前最值得先处理的是依赖过久的任务；首页会优先把老化依赖链提成升级信号，并引导你先推动上游任务或重新判断是否解除依赖。',
        highRiskTaskCount: 0,
        waitingTaskCount: 0,
        missingNextStepTaskCount: 0,
        recentTasks: [staleDependencyTask, upstreamTask],
        waitingTasks: [],
        blockerTasks: [],
        dependencyTasks: [],
        escalationTasks: [staleDependencyTask],
        highRiskTasks: [],
        missingNextStepTasks: [],
        recentActivity: [],
        recommendedActions: [],
      }),
    };

    window.api = dependencyEscalationApi;

    render(<App />);

    expect(screen.getByText('当前没有被其他任务阻塞的任务。')).toBeTruthy();

    const escalationSection = (await screen.findAllByText('Needs Escalation'))
      .find((element) => element.tagName === 'STRONG')
      ?.closest('section');
    expect(escalationSection).toBeTruthy();
    expect(await within(escalationSection as HTMLElement).findByText('当前依赖上游任务：Finalize legal brief')).toBeTruthy();
    expect(
      await within(escalationSection as HTMLElement).findByText(formatDependencyAgeLabel(dependencyCreatedAt)),
    ).toBeTruthy();
    expect(
      await within(escalationSection as HTMLElement).findByText(
        getDependencyAgeReason(dependencyCreatedAt, 'home') ?? '',
      ),
    ).toBeTruthy();

    expect(
      await screen.findByRole('heading', { name: '当前有 1 条任务因依赖链路过久需要升级处理' }),
    ).toBeTruthy();
    expect(
      screen.getByText('当前最值得先处理的是依赖过久的任务；首页会优先把老化依赖链提成升级信号，并引导你先推动上游任务或重新判断是否解除依赖。'),
    ).toBeTruthy();

    await user.click(await within(escalationSection as HTMLElement).findByRole('button', { name: '直接升级处理' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Launch outreach sequence' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '优先推动上游任务“Finalize legal brief”，并重新判断是否解除对“Launch outreach sequence”的依赖。',
    );

    window.location.hash = '#home';
    cleanup();
    window.api = dependencyEscalationApi;
    render(<App />);

    const rerenderedEscalationSection = screen
      .getAllByText('Needs Escalation')
      .find((element) => element.tagName === 'STRONG')
      ?.closest('section');
    expect(rerenderedEscalationSection).toBeTruthy();

    await user.click(await within(rerenderedEscalationSection as HTMLElement).findByRole('button', { name: '打开上游任务' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Finalize legal brief' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '先完成这条上游任务，以解除对“Launch outreach sequence”的依赖。',
    );
  });

  it('routes blocker created activity back into blocker recovery from home', async () => {
    const user = userEvent.setup();

    const blockedTask = buildTaskRecord({
      id: 'task_blocker_activity_created',
      title: 'Blocker activity task',
      state: 'planned',
      nextStep: null,
    });

    const blockerActivityApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([blockedTask]),
      getTaskDetail: vi.fn().mockResolvedValue({
        ...buildTaskDetail(blockedTask),
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 1,
        recentTasks: [blockedTask],
        recentActivity: [
          buildActivity({
            id: 'blocker_activity_created',
            sourceType: 'blocker',
            sourceId: 'blocker_activity_created_id',
            taskId: blockedTask.id,
            taskTitle: blockedTask.title,
            title: 'Legal approval pending',
            status: 'created',
          }),
        ],
      }),
    };

    window.api = blockerActivityApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '跟进当前阻塞项' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Blocker activity task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '先解除阻塞项：Legal approval pending',
    );
  });

  it('routes blocker resolved activity into resume guidance from home', async () => {
    const user = userEvent.setup();

    const resolvedTask = buildTaskRecord({
      id: 'task_blocker_activity_resolved',
      title: 'Resolved blocker activity task',
      state: 'planned',
      nextStep: null,
    });

    const blockerActivityApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([resolvedTask]),
      getTaskDetail: vi.fn().mockResolvedValue({
        ...buildTaskDetail(resolvedTask),
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 1,
        recentTasks: [resolvedTask],
        recentActivity: [
          buildActivity({
            id: 'blocker_activity_resolved',
            sourceType: 'blocker',
            sourceId: 'blocker_activity_resolved_id',
            taskId: resolvedTask.id,
            taskTitle: resolvedTask.title,
            title: 'Legal approval pending',
            status: 'resolved',
          }),
        ],
      }),
    };

    window.api = blockerActivityApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '恢复任务推进' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Resolved blocker activity task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '阻塞项已解除，继续推进：Legal approval pending',
    );
  });

  it('routes blocker source-updated activity into blocker re-evaluation from home', async () => {
    const user = userEvent.setup();

    const blockerSourceTask = buildTaskRecord({
      id: 'task_blocker_activity_source_updated',
      title: 'Blocker source updated task',
      state: 'waiting_external',
      nextStep: null,
    });

    const blockerActivityApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([blockerSourceTask]),
      getTaskDetail: vi.fn().mockResolvedValue({
        ...buildTaskDetail(blockerSourceTask),
        sourceContexts: [
          buildSourceContext({
            id: 'source_context_blocker_activity_home',
            title: 'Partner master sheet',
          }),
        ],
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 1,
        recentTasks: [blockerSourceTask],
        recentActivity: [
          buildActivity({
            id: 'blocker_activity_source_updated',
            sourceType: 'blocker',
            sourceId: 'blocker_activity_source_updated_id',
            responsibilitySummary: '当前由 法务团队确认 推动解除',
            relatedSourceContextId: 'source_context_blocker_activity_home',
            taskId: blockerSourceTask.id,
            taskTitle: blockerSourceTask.title,
            title: 'Need revised outreach list',
            status: 'source_updated',
          }),
        ],
      }),
    };

    window.api = blockerActivityApi;

    render(<App />);

    expect(await screen.findByText('当前由 法务团队确认 推动解除')).toBeTruthy();

    await user.click(await screen.findByRole('button', { name: '重新判断阻塞' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Blocker source updated task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('来源标题') as HTMLInputElement).value).toBe('Partner master sheet');
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '基于来源更新重新判断是否解除阻塞：Need revised outreach list',
    );
  });

  it('routes dependency activity into dependency re-evaluation and upstream entry from home', async () => {
    const user = userEvent.setup();

    const upstreamTask = buildTaskRecord({
      id: 'task_dependency_upstream_activity',
      title: 'Publish partner list',
      state: 'completed',
      nextStep: 'Share the final partner list',
    });
    const dependentTask = buildTaskRecord({
      id: 'task_dependency_downstream_activity',
      title: 'Draft outreach email',
      state: 'planned',
      nextStep: null,
      activeDependency: buildTaskDependency({
        id: 'task_dependency_activity_link',
        taskId: 'task_dependency_downstream_activity',
        blockedByTaskId: upstreamTask.id,
        blockedByTaskTitle: upstreamTask.title,
        reason: 'Need the approved partner list before drafting outreach.',
      }),
    });

    const dependencyActivityApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([dependentTask, upstreamTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId === dependentTask.id) {
          return buildTaskDetail(dependentTask);
        }

        if (taskId === upstreamTask.id) {
          return buildTaskDetail(upstreamTask);
        }

        return null;
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 2,
        recentTasks: [dependentTask, upstreamTask],
        recentActivity: [
          buildActivity({
            id: 'dependency_activity_upstream_ready',
            sourceType: 'dependency',
            sourceId: 'task_dependency_activity_link',
            relatedTaskId: upstreamTask.id,
            taskId: dependentTask.id,
            taskTitle: dependentTask.title,
            title: upstreamTask.title,
            status: 'upstream_ready',
            lane: 'continue_or_review',
          }),
        ],
      }),
    };

    window.api = dependencyActivityApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '重新判断依赖' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Draft outreach email' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '基于上游任务完成重新判断是否解除依赖：Publish partner list',
    );

    window.location.hash = '#home';
    cleanup();
    window.api = dependencyActivityApi;
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '打开上游任务' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Publish partner list' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '先完成这条上游任务，以解除对“Draft outreach email”的依赖。',
    );
  });

  it('routes dependency created activity into upstream-push guidance from home', async () => {
    const user = userEvent.setup();

    const upstreamTask = buildTaskRecord({
      id: 'task_dependency_created_upstream',
      title: 'Publish partner list',
      state: 'planned',
      nextStep: 'Finalize the partner list',
    });
    const dependentTask = buildTaskRecord({
      id: 'task_dependency_created_downstream',
      title: 'Draft outreach email',
      state: 'planned',
      nextStep: null,
      activeDependency: buildTaskDependency({
        id: 'task_dependency_created_link',
        taskId: 'task_dependency_created_downstream',
        blockedByTaskId: upstreamTask.id,
        blockedByTaskTitle: upstreamTask.title,
        reason: 'Need the approved partner list before drafting outreach.',
      }),
    });

    const dependencyActivityApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([dependentTask, upstreamTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId === dependentTask.id) {
          return buildTaskDetail(dependentTask);
        }

        if (taskId === upstreamTask.id) {
          return buildTaskDetail(upstreamTask);
        }

        return null;
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 2,
        recentTasks: [dependentTask, upstreamTask],
        recentActivity: [
          buildActivity({
            id: 'dependency_activity_created',
            sourceType: 'dependency',
            sourceId: 'task_dependency_created_link',
            responsibilitySummary: '当前主要由上游任务“Publish partner list”推进',
            relatedTaskId: upstreamTask.id,
            taskId: dependentTask.id,
            taskTitle: dependentTask.title,
            title: upstreamTask.title,
            status: 'created',
            lane: 'unblock_or_decide',
          }),
        ],
      }),
    };

    window.api = dependencyActivityApi;

    render(<App />);

    expect(await screen.findByText('当前主要由上游任务“Publish partner list”推进')).toBeTruthy();

    await user.click(await screen.findByRole('button', { name: '先推动上游任务' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Draft outreach email' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '先推动上游任务，以解除当前依赖：Publish partner list',
    );

    window.location.hash = '#home';
    cleanup();
    window.api = dependencyActivityApi;
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '打开上游任务' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Publish partner list' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '先完成这条上游任务，以解除对“Draft outreach email”的依赖。',
    );
  });

  it('routes dependency resolved activity into continue guidance from home', async () => {
    const user = userEvent.setup();

    const upstreamTask = buildTaskRecord({
      id: 'task_dependency_resolved_upstream',
      title: 'Publish partner list',
      state: 'completed',
      nextStep: null,
    });
    const dependentTask = buildTaskRecord({
      id: 'task_dependency_resolved_downstream',
      title: 'Draft outreach email',
      state: 'planned',
      nextStep: null,
    });

    const dependencyActivityApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([dependentTask, upstreamTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId === dependentTask.id) {
          return buildTaskDetail(dependentTask);
        }

        if (taskId === upstreamTask.id) {
          return buildTaskDetail(upstreamTask);
        }

        return null;
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 2,
        recentTasks: [dependentTask, upstreamTask],
        recentActivity: [
          buildActivity({
            id: 'dependency_activity_resolved',
            sourceType: 'dependency',
            sourceId: 'task_dependency_resolved_link',
            relatedTaskId: upstreamTask.id,
            taskId: dependentTask.id,
            taskTitle: dependentTask.title,
            title: upstreamTask.title,
            status: 'resolved',
            lane: 'continue_or_review',
          }),
        ],
      }),
    };

    window.api = dependencyActivityApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '恢复任务推进' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Draft outreach email' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '依赖已解除，继续推进：Publish partner list',
    );
  });

  it('resolves blocked tasks from home and resumes waiting when the blocker clearly caused it', async () => {
    const user = userEvent.setup();

    let currentTask = buildTaskRecord({
      id: 'task_blocked_resolve_home',
      title: 'Blocked resolve task',
      state: 'waiting_external',
      waitingReason: 'Waiting for legal approval',
      activeWaitingItem: buildWaitingItem({
        id: 'waiting_blocked_resolve_home',
        taskId: 'task_blocked_resolve_home',
        reason: 'Waiting for legal approval',
      }),
      activeBlocker: buildBlocker({
        id: 'blocker_resolve_home_1',
        taskId: 'task_blocked_resolve_home',
        title: 'Legal approval pending',
        detail: 'Need legal sign-off before launch',
        createdAt: '2026-04-20T00:00:00.000Z',
      }),
    });

    const blockerHomeApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockImplementation(async () => [currentTask]),
      getTaskDetail: vi.fn().mockResolvedValue(buildTaskDetail(currentTask)),
      getHomeBrief: vi.fn().mockImplementation(async () => ({
        ...briefData,
        activeTaskCount: 1,
        waitingTaskCount: currentTask.state === 'waiting_external' ? 1 : 0,
        blockerTaskCount: currentTask.activeBlocker ? 1 : 0,
        escalationTaskCount: 0,
        highRiskTaskCount: 0,
        missingNextStepTaskCount: currentTask.nextStep ? 0 : 1,
        recentTasks: [currentTask],
        waitingTasks: currentTask.state === 'waiting_external' ? [currentTask] : [],
        blockerTasks: currentTask.activeBlocker ? [currentTask] : [],
        escalationTasks: [],
        highRiskTasks: [],
        missingNextStepTasks: currentTask.nextStep ? [] : [currentTask],
        recommendedActions: [],
        recentArtifacts: [],
        recentSourceContexts: [],
        recentActivity: [],
      })),
      resolveBlocker: vi.fn().mockImplementation(async (id: string) => {
        currentTask = {
          ...currentTask,
          activeBlocker: null,
          updatedAt: '2026-01-03T00:00:00.000Z',
        };

        return buildBlocker({
          id,
          taskId: currentTask.id,
          status: 'resolved',
          resolvedAt: '2026-01-03T00:00:00.000Z',
          updatedAt: '2026-01-03T00:00:00.000Z',
        });
      }),
      transitionTask: vi.fn().mockImplementation(async ({ id, nextState }: { id: string; nextState: string }) => {
        currentTask = {
          ...currentTask,
          id,
          state: nextState as TaskListItemRecord['state'],
          waitingReason: null,
          activeWaitingItem: null,
          updatedAt: '2026-01-03T00:00:00.000Z',
        };

        return currentTask;
      }),
    };

    window.api = blockerHomeApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '标记已解除' }));

    await waitFor(() => {
      expect(blockerHomeApi.resolveBlocker).toHaveBeenCalledWith('blocker_resolve_home_1');
    });

    expect(blockerHomeApi.transitionTask).toHaveBeenCalledWith({
      id: 'task_blocked_resolve_home',
      nextState: 'planned',
    });

    await waitFor(() => {
      expect(screen.getByText('当前没有阻塞中的任务。')).toBeTruthy();
    });
  });

  it('opens escalation tasks from home with escalation-focused guidance', async () => {
    const user = userEvent.setup();

    const escalationTask = buildTaskRecord({
      id: 'task_escalation_home',
      title: 'Escalation home task',
      state: 'planned',
      nextStep: null,
      activeBlocker: buildBlocker({
        id: 'blocker_escalation_home_1',
        taskId: 'task_escalation_home',
        title: 'Legal approval pending',
        detail: 'Need legal sign-off before launch',
        sourceContextId: 'source_context_escalation_home',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    });

    const sourceItem = buildSourceContext({
      id: 'source_context_escalation_home',
      taskId: escalationTask.id,
      title: 'Legal escalation brief',
      note: 'Latest escalation framing',
    });

    const escalationHomeApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([escalationTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== escalationTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(escalationTask),
          sourceContexts: [sourceItem],
        };
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 1,
        waitingTaskCount: 0,
        blockerTaskCount: 1,
        escalationTaskCount: 1,
        highRiskTaskCount: 0,
        missingNextStepTaskCount: 0,
        recentTasks: [escalationTask],
        waitingTasks: [],
        blockerTasks: [],
        escalationTasks: [escalationTask],
        highRiskTasks: [],
        missingNextStepTasks: [],
        recommendedActions: [],
        recentArtifacts: [],
        recentSourceContexts: [],
        recentActivity: [],
      }),
    };

    window.api = escalationHomeApi;

    render(<App />);

    const escalationHeading = screen
      .getAllByText('Needs Escalation')
      .find((element) => element.tagName === 'STRONG');
    expect(escalationHeading).toBeTruthy();

    const escalationSection = escalationHeading?.closest('section');
    expect(escalationSection).toBeTruthy();

    await user.click(
      await within(escalationSection as HTMLElement).findByRole('button', { name: /Escalation home task/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Escalation home task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('来源标题') as HTMLInputElement).value).toBe('Legal escalation brief');
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '优先升级当前阻塞项：Legal approval pending',
    );
  });

  it('opens direct escalation actions from home with blocker-focused next-step guidance', async () => {
    const user = userEvent.setup();

    const escalationTask = buildTaskRecord({
      id: 'task_escalation_direct_home',
      title: 'Escalation direct task',
      state: 'planned',
      nextStep: null,
      activeBlocker: buildBlocker({
        id: 'blocker_escalation_direct_home_1',
        taskId: 'task_escalation_direct_home',
        title: 'Partner approval pending',
        detail: 'Need partner leadership sign-off before publishing',
        sourceContextId: 'source_context_escalation_direct_home',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    });

    const sourceItem = buildSourceContext({
      id: 'source_context_escalation_direct_home',
      taskId: escalationTask.id,
      title: 'Partner escalation brief',
      note: 'Most recent escalation framing',
    });

    const escalationHomeApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([escalationTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== escalationTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(escalationTask),
          sourceContexts: [sourceItem],
        };
      }),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 1,
        waitingTaskCount: 0,
        blockerTaskCount: 1,
        escalationTaskCount: 1,
        highRiskTaskCount: 0,
        missingNextStepTaskCount: 0,
        recentTasks: [escalationTask],
        waitingTasks: [],
        blockerTasks: [],
        escalationTasks: [escalationTask],
        highRiskTasks: [],
        missingNextStepTasks: [],
        recommendedActions: [],
        recentArtifacts: [],
        recentSourceContexts: [],
        recentActivity: [],
      }),
    };

    window.api = escalationHomeApi;

    render(<App />);

    const escalationHeading = screen
      .getAllByText('Needs Escalation')
      .find((element) => element.tagName === 'STRONG');
    expect(escalationHeading).toBeTruthy();

    const escalationSection = escalationHeading?.closest('section');
    expect(escalationSection).toBeTruthy();

    await user.click(
      await within(escalationSection as HTMLElement).findByRole('button', { name: '直接升级处理' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Escalation direct task' })).toBeTruthy();
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '优先升级当前阻塞项：Partner approval pending',
    );
  });

  it('prioritizes escalation status in the home headline when stale blockers exist', async () => {
    const escalationTask = buildTaskRecord({
      id: 'task_escalation_headline_home',
      title: 'Escalation headline task',
      state: 'planned',
      nextStep: null,
      activeBlocker: buildBlocker({
        id: 'blocker_escalation_headline_home_1',
        taskId: 'task_escalation_headline_home',
        title: 'Approval still pending',
        detail: 'Need leadership approval before shipping',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    });

    const escalationHomeApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([escalationTask]),
      getTaskDetail: vi.fn().mockResolvedValue(buildTaskDetail(escalationTask)),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 1,
        waitingTaskCount: 0,
        blockerTaskCount: 0,
        escalationTaskCount: 1,
        highRiskTaskCount: 0,
        missingNextStepTaskCount: 0,
        recentTasks: [escalationTask],
        waitingTasks: [],
        blockerTasks: [],
        escalationTasks: [escalationTask],
        highRiskTasks: [],
        missingNextStepTasks: [],
        recommendedActions: [],
        recentArtifacts: [],
        recentSourceContexts: [],
        recentActivity: [],
      }),
    };

    window.api = escalationHomeApi;

    render(<App />);

    expect(await screen.findByRole('heading', { name: '当前有 1 条任务需要升级处理' })).toBeTruthy();
    expect(
      screen.getByText('首页会优先把需要升级处理的阻塞或依赖链路提成强信号，并把你直接带回相关任务继续推进。'),
    ).toBeTruthy();
  });

  it('uses priority lane headline copy from the home brief when provided', async () => {
    const laneTask = buildTaskRecord({
      id: 'task_lane_home',
      title: 'Lane summary task',
      state: 'planned',
      nextStep: 'Review the decision',
    });

    const laneHomeApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([laneTask]),
      getTaskDetail: vi.fn().mockResolvedValue(buildTaskDetail(laneTask)),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 1,
        pendingDecisionCount: 1,
        recentTasks: [laneTask],
        priorityLane: 'unblock_or_decide',
        priorityHeadline: '当前有 1 条任务需要先解阻塞或拍板',
        priorityLede: '当前最值得先处理的是解阻塞与拍板条件；首页会优先提示 pending decision、active blocker 和 blocker 来源更新后的重新判断。',
      }),
    };

    window.api = laneHomeApi;

    render(<App />);

    expect(await screen.findByRole('heading', { name: '当前有 1 条任务需要先解阻塞或拍板' })).toBeTruthy();
    expect(
      screen.getByText('当前最值得先处理的是解阻塞与拍板条件；首页会优先提示 pending decision、active blocker 和 blocker 来源更新后的重新判断。'),
    ).toBeTruthy();
  });

  it('shows lightweight priority lane labels on recommended actions', async () => {
    const laneTask = buildTaskRecord({
      id: 'task_lane_action',
      title: 'Lane action task',
      state: 'planned',
      nextStep: 'Resolve blocker',
    });

    window.api = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([laneTask]),
      getTaskDetail: vi.fn().mockResolvedValue(buildTaskDetail(laneTask)),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 1,
        recentTasks: [laneTask],
        recommendedActions: [
          {
            id: 'decision:lane',
            label: '跟进拍板任务',
            reason: '当前需要先完成拍板。',
            responsibilitySummary: '当前由产品负责人负责确认',
            taskId: 'task_lane_action',
            priority: 'high',
            lane: 'unblock_or_decide',
            intent: {
              type: 'open_task',
              focusArea: 'quick-actions',
            },
          },
        ],
      }),
    };

    render(<App />);

    const actionLabel = await screen.findByText('跟进拍板任务');
    const actionCard = actionLabel.closest('button');
    expect(actionCard).toBeTruthy();
    expect(within(actionCard as HTMLElement).getByText('先解阻塞/拍板')).toBeTruthy();
    expect(within(actionCard as HTMLElement).getByText('high')).toBeTruthy();
    expect(within(actionCard as HTMLElement).getByText('当前由产品负责人负责确认')).toBeTruthy();
  });

  it('shows lightweight priority lane labels on recent activity items', async () => {
    const laneActivityTask = buildTaskRecord({
      id: 'task_lane_activity',
      title: 'Lane activity task',
      state: 'planned',
      nextStep: 'Review the run result',
    });

    window.api = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([laneActivityTask]),
      getTaskDetail: vi.fn().mockResolvedValue(buildTaskDetail(laneActivityTask)),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        activeTaskCount: 1,
        recentTasks: [laneActivityTask],
        recentActivity: [
          buildActivity({
            id: 'run:lane',
            sourceType: 'run',
            sourceId: 'run_lane',
            taskId: 'task_lane_activity',
            taskTitle: 'Lane activity task',
            title: 'draft',
            status: 'completed',
            lane: 'continue_or_review',
          }),
        ],
      }),
    };

    render(<App />);

    const activityButton = await screen.findByRole('button', { name: /draft completed task: Lane activity task/i });
    expect(within(activityButton).getByText('继续推进/复核')).toBeTruthy();
    expect(within(activityButton).getByText('completed')).toBeTruthy();
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

  it('shows priority lane labels on home resume previews', async () => {
    window.api = mockApi;

    render(<App />);

    const resumePanel = (await screen.findByText('Resume Previews')).closest('.panel');
    expect(resumePanel).not.toBeNull();
    expect(within(resumePanel as HTMLElement).getByText('立即升级')).toBeTruthy();
    expect(within(resumePanel as HTMLElement).getByText('先补清晰度')).toBeTruthy();
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

  it('reorders task transitions around the current priority lane and explains the recommendation', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /high risk task/i }));
    await screen.findByRole('heading', { name: 'High risk task' });

    const transitionSection = screen
      .getByRole('heading', { name: '状态流转' })
      .closest('.transition-group');

    expect(transitionSection).toBeTruthy();
    expect(
      within(transitionSection as HTMLElement).getByText(
        '当前按「立即升级」语义，状态流转优先建议转到 planned，先把任务拉回可处理状态并明确升级动作，不建议继续挂起等待。',
      ),
    ).toBeTruthy();

    const transitionButtons = within(transitionSection as HTMLElement)
      .getAllByRole('button')
      .map((button) => button.textContent)
      .filter((label): label is string => Boolean(label?.startsWith('转到 ')));

    expect(transitionButtons.slice(0, 4)).toEqual([
      '转到 planned',
      '转到 waiting_external',
      '转到 completed（未定义完成标准）',
      '转到 archived',
    ]);
  });

  it('shows completion guidance before transitioning a task to completed', async () => {
    const user = userEvent.setup();

    const completionCriteria = [
      buildCompletionCriteria({
        id: 'criteria_open_1',
        taskId: riskTask.id,
        text: 'Stakeholder approved final brief',
      }),
      buildCompletionCriteria({
        id: 'criteria_satisfied_1',
        taskId: riskTask.id,
        text: 'Draft delivered',
        status: 'satisfied',
        satisfiedAt: '2026-01-03T00:00:00.000Z',
      }),
    ];

    const completionDetail: TaskDetail = {
      ...buildTaskDetail(riskTask),
      completionCriteria,
      resumeCard: {
        ...buildTaskDetail(riskTask).resumeCard,
        completionStatus: {
          total: 2,
          satisfied: 1,
          open: 1,
          summary: '已满足 1/2 条完成标准',
        },
      },
    };

    const completionApi: ElectronApi = {
      ...mockApi,
      getTaskDetail: vi.fn(async (taskId: string) =>
        taskId === riskTask.id ? completionDetail : taskDetails[taskId] ?? null,
      ),
    };

    window.api = completionApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /high risk task/i }));
    await screen.findByRole('heading', { name: 'High risk task' });

    const transitionSection = screen
      .getByRole('heading', { name: '状态流转' })
      .closest('.transition-group');

    expect(transitionSection).toBeTruthy();
    expect(
      within(transitionSection as HTMLElement).getByText(
        '当前还有 1 条完成标准未满足：Stakeholder approved final brief。你仍可完成任务，但更建议先补齐这些收尾标准。',
      ),
    ).toBeTruthy();

    expect(
      within(transitionSection as HTMLElement).getByRole('button', {
        name: '转到 completed（仍有 1 条未满足）',
      }),
    ).toBeTruthy();

    await user.click(
      within(transitionSection as HTMLElement).getByRole('button', { name: '打开 Completion Criteria' }),
    );

    expect(screen.getByRole('heading', { name: 'Current Completion Criteria' })).toBeTruthy();
  });

  it('puts the completed transition first when completion criteria are satisfied', async () => {
    const user = userEvent.setup();
    const readyTask = buildTaskRecord({
      id: 'task_ready_to_complete',
      title: 'Ready to complete task',
      state: 'running',
      nextStep: 'Run final closeout',
    });
    const readyDetail: TaskDetail = {
      ...buildTaskDetail(readyTask),
      completionCriteria: [
        buildCompletionCriteria({
          id: 'criteria_ready_1',
          taskId: readyTask.id,
          text: 'Final closeout verified',
          status: 'satisfied',
          satisfiedAt: '2026-01-03T00:00:00.000Z',
        }),
      ],
      resumeCard: {
        ...buildTaskDetail(readyTask).resumeCard,
        completionStatus: {
          total: 1,
          satisfied: 1,
          open: 0,
          summary: '已满足 1/1 条完成标准',
        },
      },
    };

    window.api = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([readyTask]),
      getTaskDetail: vi.fn(async (taskId: string) => (taskId === readyTask.id ? readyDetail : null)),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        recentTasks: [readyTask],
        completionReadyTaskCount: 1,
        completionReadyTasks: [
          {
            ...readyTask,
            completionProgress: { total: 1, satisfied: 1, open: 0 },
          },
        ],
      }),
    };

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /ready to complete task/i }));

    const transitionSection = screen
      .getByRole('heading', { name: '状态流转' })
      .closest('.transition-group');
    expect(transitionSection).toBeTruthy();
    expect(
      within(transitionSection as HTMLElement).getByText(
        '当前按「继续推进/复核」语义，状态流转优先建议转到 completed，让任务回到便于继续执行或复核结果的状态。',
      ),
    ).toBeTruthy();

    const transitionButtons = within(transitionSection as HTMLElement)
      .getAllByRole('button')
      .map((button) => button.textContent)
      .filter((label): label is string => Boolean(label?.startsWith('转到 ')));

    expect(transitionButtons[0]).toBe('转到 completed（完成标准已满足）');
  });

  it('surfaces recent decision, run, and artifact results as completion evidence', async () => {
    const user = userEvent.setup();

    const completionCriteria = [
      buildCompletionCriteria({
        id: 'criteria_open_1',
        taskId: riskTask.id,
        text: 'Approve escalation path',
        verificationResponsibility: 'self',
        verificationResponsibilityLabel: '我自己确认',
      }),
    ];

    const evidenceDetail: TaskDetail = {
      ...buildTaskDetail({
        ...riskTask,
        activeBlocker: buildBlocker({
          id: 'blocker_responsibility_1',
          taskId: riskTask.id,
          responsibility: 'external_team',
          responsibilityLabel: '法务团队确认',
        }),
      }),
      completionCriteria,
      artifacts: [
        buildArtifact({
          taskId: riskTask.id,
          sourceId: 'run_completion_1',
          title: 'Approve escalation draft',
          content: 'Approve escalation path for the owner.',
        }),
      ],
      resumeCard: {
        ...buildTaskDetail({
          ...riskTask,
          activeBlocker: buildBlocker({
            id: 'blocker_responsibility_1',
            taskId: riskTask.id,
            responsibility: 'external_team',
            responsibilityLabel: '法务团队确认',
          }),
        }).resumeCard,
        completionStatus: {
          total: 1,
          satisfied: 0,
          open: 1,
          summary: '还差 1 条完成标准',
          nextOpenCriterion: 'Approve escalation path',
          nextOpenResponsibilitySummary: '确认责任：我自己确认',
        },
        currentBlocker: {
          ...buildTaskDetail({
            ...riskTask,
            activeBlocker: buildBlocker({
              id: 'blocker_responsibility_1',
              taskId: riskTask.id,
              responsibility: 'external_team',
              responsibilityLabel: '法务团队确认',
            }),
          }).resumeCard.currentBlocker,
          responsibilitySummary: '解除责任：法务团队确认',
        },
      },
    };

    const completionRuns = [
      ...runs,
      buildRunRecord({
        id: 'run_completion_1',
        taskId: riskTask.id,
        type: 'draft',
        status: 'completed',
        instructions: 'Approve escalation path',
        output: 'Approve escalation path for the owner.',
        updatedAt: '2026-01-04T02:00:00.000Z',
      }),
    ];

    const evidenceApi: ElectronApi = {
      ...mockApi,
      getTaskDetail: vi.fn(async (taskId: string) =>
        taskId === riskTask.id ? evidenceDetail : taskDetails[taskId] ?? null,
      ),
      getRunDetail: vi.fn(async (runId: string) => completionRuns.find((run) => run.id === runId) ?? null),
      listDecisions: vi.fn().mockResolvedValue([
        ...decisions,
        {
          id: 'decision_completion_1',
          taskId: riskTask.id,
          title: 'Approve escalation path',
          status: 'approved',
          createdAt: '2026-01-04T00:00:00.000Z',
          updatedAt: '2026-01-04T01:00:00.000Z',
        },
      ]),
      listRuns: vi.fn().mockResolvedValue(completionRuns),
    };

    window.api = evidenceApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /high risk task/i }));
    await screen.findByRole('heading', { name: 'High risk task' });

    const resumePanel = screen.getByText('Task Resume Card').closest('.transition-group');
    expect(resumePanel).toBeTruthy();
    expect(within(resumePanel as HTMLElement).getByText('解除责任：法务团队确认')).toBeTruthy();
    expect(within(resumePanel as HTMLElement).getByText('确认责任：我自己确认')).toBeTruthy();
    expect(
      screen.getByText(
        '当前还有 1 条完成标准未满足：Approve escalation path。你仍可完成任务，但更建议先补齐这些收尾标准。 确认责任：我自己确认。',
      ),
    ).toBeTruthy();

    const evidenceSection = screen
      .getByRole('heading', { name: 'Potential Completion Evidence' })
      .closest('.detail-card-group');

    expect(evidenceSection).toBeTruthy();
    expect(within(evidenceSection as HTMLElement).getByText('Approve escalation path')).toBeTruthy();
    expect(within(evidenceSection as HTMLElement).getByText('Approve escalation draft')).toBeTruthy();
    expect(
      within(evidenceSection as HTMLElement).getAllByText(/可能对应：Approve escalation path/).length,
    ).toBeGreaterThan(0);
    expect(
      within(evidenceSection as HTMLElement).getAllByText(
        '如果这条证据对应当前未满足标准，仍需由我自己确认。',
      ).length,
    ).toBeGreaterThan(0);

    await user.click(
      within(evidenceSection as HTMLElement).getAllByRole('button', {
        name: '对照可能对应标准',
      })[0] as HTMLElement,
    );

    const criteriaSection = screen
      .getByRole('heading', { name: 'Current Completion Criteria' })
      .closest('.detail-card-group');

    expect(criteriaSection).toBeTruthy();
    expect(within(criteriaSection as HTMLElement).getByText('证据可能对应')).toBeTruthy();
    expect(within(criteriaSection as HTMLElement).getByText('确认责任：我自己确认')).toBeTruthy();

    await user.click(within(evidenceSection as HTMLElement).getByRole('button', { name: '查看 Decision' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Approve escalation path' })).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /tasks/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    const evidenceSectionAfterReturn = screen
      .getByRole('heading', { name: 'Potential Completion Evidence' })
      .closest('.detail-card-group');

    expect(evidenceSectionAfterReturn).toBeTruthy();

    await user.click(
      within(evidenceSectionAfterReturn as HTMLElement).getAllByRole('button', { name: '查看 Run' })[0] as HTMLElement,
    );

    await waitFor(() => {
      expect(evidenceApi.getRunDetail).toHaveBeenCalledWith('run_completion_1');
    });
  });

  it('opens newly created tasks in clarify mode and focuses the new task detail', async () => {
    const user = userEvent.setup();

    const createdTask = buildTaskRecord({
      id: 'task_created',
      title: 'Freshly captured task',
      state: 'captured',
      nextStep: null,
      updatedAt: '2026-01-03T00:00:00.000Z',
    });

    const createTaskApi: ElectronApi = {
      ...mockApi,
      createTask: vi.fn().mockResolvedValue(createdTask),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        recentTasks: [createdTask, ...briefData.recentTasks],
        missingNextStepTasks: [createdTask, ...briefData.missingNextStepTasks],
      }),
      getTaskDetail: vi.fn(async (taskId: string) =>
        taskId === createdTask.id ? buildTaskDetail(createdTask) : taskDetails[taskId] ?? null,
      ),
    };

    window.api = createTaskApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    expect(
      screen.getByText('新任务创建后会先按「先补清晰度」语义打开，方便立刻补下一步。'),
    ).toBeTruthy();

    await user.type(screen.getByLabelText('新任务标题'), 'Freshly captured task');
    await user.click(screen.getByRole('button', { name: '创建任务' }));

    await waitFor(() => {
      expect(createTaskApi.createTask).toHaveBeenCalledWith({ title: 'Freshly captured task' });
    });

    expect(await screen.findByRole('heading', { name: 'Freshly captured task' })).toBeTruthy();
    expect(screen.getByText('状态：captured')).toBeTruthy();
    const resumePanel = screen.getByText('Task Resume Card').closest('.transition-group');
    expect(resumePanel).toBeTruthy();
    expect(within(resumePanel as HTMLElement).getByText('先补清晰度')).toBeTruthy();
    expect(
      within(resumePanel as HTMLElement).getByText('这条任务刚进入系统，先补清摘要与下一步。'),
    ).toBeTruthy();
    expect(
      within(resumePanel as HTMLElement).getByText('先补一句任务摘要，再明确下一步。'),
    ).toBeTruthy();
  });

  it('reshapes the action desk toward task clarification for captured work', async () => {
    const user = userEvent.setup();

    const capturedTask = buildTaskRecord({
      id: 'task_captured_action',
      title: 'Captured action task',
      state: 'captured',
      nextStep: null,
      updatedAt: '2026-01-04T00:00:00.000Z',
    });

    const capturedApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([capturedTask, waitingTask, riskTask]),
      getTaskDetail: vi.fn(async (taskId: string) =>
        taskId === capturedTask.id ? buildTaskDetail(capturedTask) : taskDetails[taskId] ?? null,
      ),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        recentTasks: [capturedTask, ...briefData.recentTasks],
        missingNextStepTasks: [capturedTask, ...briefData.missingNextStepTasks],
      }),
    };

    window.api = capturedApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /captured action task/i }));
    await screen.findByRole('heading', { name: 'Captured action task' });

    const actionDesk = screen.getByRole('heading', { name: '动作与状态流转' }).closest('.detail-stage');
    expect(actionDesk).toBeTruthy();
    expect(
      within(actionDesk as HTMLElement).getByText(
        '当前任务还在捕获/整理阶段，先补清摘要、下一步和是否需要拍板，再考虑执行动作。',
      ),
    ).toBeTruthy();
    expect(within(actionDesk as HTMLElement).getByRole('button', { name: '补摘要与下一步' })).toBeTruthy();
    expect(within(actionDesk as HTMLElement).getByRole('button', { name: '判断是否需要拍板' })).toBeTruthy();
    expect(within(actionDesk as HTMLElement).queryByRole('button', { name: '调整任务状态' })).toBeNull();
    expect(within(actionDesk as HTMLElement).queryByRole('button', { name: '配置并触发 Run' })).toBeNull();
    expect(
      within(actionDesk as HTMLElement).getByText(
        '当前仍以整理任务为主，Run 放在补清摘要、下一步和拍板判断之后。',
      ),
    ).toBeTruthy();
  });

  it('opens clarify-first task activity from home recent activity', async () => {
    const user = userEvent.setup();

    const capturedTask = buildTaskRecord({
      id: 'task_captured_activity',
      title: 'Captured activity task',
      state: 'captured',
      nextStep: null,
      updatedAt: '2026-01-05T00:00:00.000Z',
    });

    const capturedActivityApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([capturedTask, waitingTask, riskTask]),
      getTaskDetail: vi.fn(async (taskId: string) =>
        taskId === capturedTask.id ? buildTaskDetail(capturedTask) : taskDetails[taskId] ?? null,
      ),
      getHomeBrief: vi.fn().mockResolvedValue({
        ...briefData,
        recentTasks: [capturedTask, ...briefData.recentTasks],
        missingNextStepTasks: [capturedTask, ...briefData.missingNextStepTasks],
        recentActivity: [
          buildActivity({
            id: 'task:task_captured_activity:2026-01-05T00:00:00.000Z',
            sourceType: 'task',
            sourceId: capturedTask.id,
            taskId: capturedTask.id,
            taskTitle: capturedTask.title,
            title: capturedTask.title,
            status: 'captured',
            lane: 'clarify',
            updatedAt: '2026-01-05T00:00:00.000Z',
          }),
        ],
      }),
    };

    window.api = capturedActivityApi;

    render(<App />);

    const recentActivity = await screen.findByRole('heading', { name: 'Recent Activity' });
    const activityCard = recentActivity.parentElement?.querySelector('.task-card');
    expect(activityCard).toBeTruthy();
    expect(within(activityCard as HTMLElement).getByText('新任务进入整理流程')).toBeTruthy();
    await user.click(within(activityCard as HTMLElement).getByRole('button', { name: '补摘要与下一步' }));

    expect(await screen.findByRole('heading', { name: 'Captured activity task' })).toBeTruthy();
    expect(screen.getByText('这条任务刚进入系统，先补清摘要与下一步。')).toBeTruthy();
    expect(screen.getByText('先补一句任务摘要，再明确下一步。')).toBeTruthy();
  });
});
