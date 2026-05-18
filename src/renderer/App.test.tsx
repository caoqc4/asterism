// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import type { TaskFileRecord } from '@shared/types/task-file';
import type { TaskMemoryGuidanceState } from '@shared/task-memory-guidance-state';
import type { TaskMemoryWriteProposal } from '@shared/task-memory-write-proposal';
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
    taskType: partial.taskType,
    taskFacets: partial.taskFacets,
    parentTaskId: partial.parentTaskId,
    childTaskIds: partial.childTaskIds,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

async function findTaskFileButton(name: RegExp | string): Promise<HTMLElement> {
  const tree = document.querySelector('.task-file-tree') as HTMLElement | null;
  expect(tree).toBeTruthy();
  return within(tree!).findByRole('button', { name });
}

async function expectOpenFileKind(label: string): Promise<void> {
  await waitFor(() => {
    const header = document.querySelector('.file-workspace-header') as HTMLElement | null;
    expect(header).toBeTruthy();
    expect(within(header!).getByText(label)).toBeTruthy();
  });
}

async function createTaskFileViaMenu(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: '+ 新建' }));
  await user.click(screen.getByRole('button', { name }));
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
  const taskId = Object.prototype.hasOwnProperty.call(partial, 'taskId') ? partial.taskId! : 'task_1';
  return {
    id: partial.id ?? 'decision_1',
    taskId,
    title: partial.title ?? '是否批准本轮材料修改方案',
    status: partial.status ?? 'pending',
    scope: partial.scope ?? (taskId === null ? 'global' : 'task'),
    kind: partial.kind ?? 'direction_choice',
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

function buildRunDetail(
  run: RunRecord,
  partial: Partial<Pick<RunDetailRecord, 'taskMemoryGuidance' | 'taskMemoryWriteProposals'>> = {},
): RunDetailRecord {
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
    ...partial,
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
  const taskFiles: Record<string, TaskFileRecord[]> = {};
  let subscriber: Parameters<ElectronApi['subscribeToEvents']>[0] | null = null;
  let createCounter = 0;
  let taskFileCounter = 0;

  const api: ElectronApi = {
    ping: vi.fn().mockResolvedValue({ message: 'pong', timestamp: now }),
    getAiConfigStatus: vi.fn().mockResolvedValue(buildAiStatus()),
    setAiConfig: vi.fn().mockImplementation(async (input) => buildAiStatus({
      provider: input.provider,
      model: input.model,
      featureFlags: input.featureFlags,
    })),
    connectGmailOAuth: vi.fn().mockResolvedValue({
      status: 'connected',
      connectorId: 'gmail',
      openedAuthorizationUrl: true,
      accountLabel: 'user@example.com',
      redirectUri: 'http://127.0.0.1:40000/oauth/gmail/callback',
      errorReason: null,
    }),
    disconnectGmailOAuth: vi.fn().mockResolvedValue({
      status: 'disconnected',
      connectorId: 'gmail',
      hadRefreshToken: true,
      revoked: true,
      localTokenCleared: true,
      errorReason: null,
    }),
    previewExternalAccessSourceIngestion: vi.fn().mockResolvedValue({
      taskId: 'task_risk',
      createCount: 1,
      reviewCount: 1,
      skipCount: 0,
      plans: [{
        planId: 'connector:gmail:message_1',
        decision: 'create',
        trace: {
          connectorId: 'gmail',
          connectorName: 'Gmail',
          externalId: 'message_1',
          originLabel: 'Gmail:message_1',
        },
        sourceContext: {
          taskId: 'task_risk',
          title: '客户确认邮件',
          kind: 'doc',
          isKey: false,
          uri: 'gmail://message/message_1',
          content: null,
          note: 'Connector source: Gmail:message_1',
          capturedAt: now,
          batchId: 'connector:gmail:message_1',
          sourceRole: 'raw',
          credibility: 'verified',
          isDuplicate: false,
          containsSensitiveData: false,
        },
        quality: {
          decision: 'include',
          reason: 'traceable',
          traceable: true,
          credibility: 'verified',
          duplicate: false,
          sensitive: false,
          summary: '客户确认邮件具备基本追溯信息，可以作为任务上下文来源。',
        },
        reviewReason: null,
      }, {
        planId: 'connector:gmail:message_2',
        decision: 'review',
        trace: {
          connectorId: 'gmail',
          connectorName: 'Gmail',
          externalId: 'message_2',
          originLabel: 'Gmail:message_2',
        },
        sourceContext: {
          taskId: 'task_risk',
          title: '含敏感信息邮件',
          kind: 'doc',
          isKey: false,
          uri: 'gmail://message/message_2',
          content: 'token=secret',
          note: 'Connector source: Gmail:message_2',
          capturedAt: now,
          batchId: 'connector:gmail:message_2',
          sourceRole: 'raw',
          credibility: 'unknown',
          isDuplicate: false,
          containsSensitiveData: true,
        },
        quality: {
          decision: 'caution',
          reason: 'sensitive',
          traceable: true,
          credibility: 'unknown',
          duplicate: false,
          sensitive: true,
          summary: '含敏感信息邮件可能包含敏感信息，纳入上下文前应确认可见范围。',
        },
        reviewReason: '含敏感信息邮件可能包含敏感信息，纳入上下文前应确认可见范围。',
      }],
    }),
    commitExternalAccessSourceIngestion: vi.fn().mockResolvedValue({
      taskId: 'task_risk',
      created: [],
      skippedPlanIds: [],
    }),
    listTasks: vi.fn().mockResolvedValue(tasks),
    getTaskHierarchyConsistency: vi.fn().mockResolvedValue({
      consistent: true,
      issues: [],
      issueCount: 0,
      summary: '任务层级关系一致。',
    }),
    getTaskHierarchyManualReviewPolicy: vi.fn().mockResolvedValue({
      required: false,
      items: [],
      summary: '没有需要人工确认的层级关系。',
    }),
    applySafeTaskHierarchyRepairs: vi.fn().mockResolvedValue({
      before: {
        canAutoApplyAll: false,
        actions: [],
        safeActionCount: 0,
        manualReviewCount: 0,
        summary: '任务层级关系一致，无需修复。',
      },
      after: {
        canAutoApplyAll: false,
        actions: [],
        safeActionCount: 0,
        manualReviewCount: 0,
        summary: '任务层级关系一致，无需修复。',
      },
      appliedActionCount: 0,
      skippedManualReviewCount: 0,
      summary: '已应用 0 项安全层级修复，保留 0 项人工确认。',
    }),
    applyTaskHierarchyManualResolution: vi.fn().mockResolvedValue({
      before: {
        required: false,
        items: [],
        summary: '没有需要人工确认的层级关系。',
      },
      after: {
        required: false,
        items: [],
        summary: '没有需要人工确认的层级关系。',
      },
      applied: true,
      summary: '已应用人工确认的层级维护动作。',
    }),
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
    recordTaskTimelineEvent: vi.fn().mockResolvedValue(undefined),
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
    proposeWorkHabit: vi.fn().mockImplementation(async () => loadWorkHabits()),
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
    createManualArtifact: vi.fn().mockImplementation(async (input) => {
      const artifact = {
        id: 'artifact_manual',
        taskId: input.taskId,
        sourceType: 'manual' as const,
        sourceId: 'task_files',
        kind: input.kind ?? 'note' as const,
        title: input.title,
        content: input.content ?? '',
        createdAt: now,
        updatedAt: now,
      };
      if (details[input.taskId]) {
        details[input.taskId] = {
          ...details[input.taskId],
          artifacts: [artifact, ...details[input.taskId]!.artifacts],
        };
      }
      return artifact;
    }),
    updateArtifact: vi.fn().mockImplementation(async (input) => {
      const detail = details.task_risk;
      const existing = detail.artifacts.find((artifact) => artifact.id === input.id) ?? detail.artifacts[0]!;
      const updated = {
        ...existing,
        ...input,
        updatedAt: now,
      };
      detail.artifacts = detail.artifacts.map((artifact) => artifact.id === updated.id ? updated : artifact);
      return updated;
    }),
    deleteArtifact: vi.fn().mockImplementation(async (id) => {
      const detail = details.task_risk;
      const existing = detail.artifacts.find((artifact) => artifact.id === id) ?? detail.artifacts[0]!;
      detail.artifacts = detail.artifacts.filter((artifact) => artifact.id !== id);
      return existing;
    }),
    listTaskFiles: vi.fn().mockImplementation(async (taskId) => taskFiles[taskId] ?? []),
    createTaskFile: vi.fn().mockImplementation(async (input) => {
      taskFileCounter += 1;
      const created: TaskFileRecord = {
        id: `task_file_${taskFileCounter}`,
        taskId: input.taskId,
        name: input.name,
        path: input.path ?? input.name,
        kind: input.kind,
        content: input.content ?? '',
        createdAt: now,
        updatedAt: now,
      };
      taskFiles[input.taskId] = [created, ...(taskFiles[input.taskId] ?? [])];
      return created;
    }),
    updateTaskFile: vi.fn().mockImplementation(async (input) => {
      const taskId = Object.keys(taskFiles).find((id) => taskFiles[id]?.some((file) => file.id === input.id)) ?? 'task_risk';
      const existing = taskFiles[taskId]?.find((file) => file.id === input.id) ?? {
        id: input.id,
        taskId,
        name: input.name ?? 'notes.md',
        path: input.path ?? input.name ?? 'notes.md',
        kind: 'file' as const,
        content: input.content ?? '',
        createdAt: now,
        updatedAt: now,
      };
      const updated: TaskFileRecord = {
        ...existing,
        ...input,
        updatedAt: now,
      };
      taskFiles[taskId] = [updated, ...(taskFiles[taskId] ?? []).filter((file) => file.id !== updated.id)];
      return updated;
    }),
    deleteTaskFile: vi.fn().mockImplementation(async (id) => {
      const taskId = Object.keys(taskFiles).find((key) => taskFiles[key]?.some((file) => file.id === id)) ?? 'task_risk';
      const existing = taskFiles[taskId]?.find((file) => file.id === id) ?? {
        id,
        taskId,
        name: 'notes.md',
        path: 'notes.md',
        kind: 'file' as const,
        content: '',
        createdAt: now,
        updatedAt: now,
      };
      taskFiles[taskId] = (taskFiles[taskId] ?? []).filter((file) => file.id !== id);
      return existing;
    }),
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
    runs,
    taskFiles,
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
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('button', { name: /Brief/ })).toBeTruthy();
    expect(screen.getByText('Work')).toBeTruthy();
    expect(screen.getByText('Capabilities')).toBeTruthy();
    expect(screen.getByText(/任务级 Agent · 通用任务流/)).toBeTruthy();
    expect(screen.getByTitle(/搜索、提问或捕获任务想法/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tasks/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Runs/ })).toBeNull();
    expect(await screen.findByText('外部信号')).toBeTruthy();
    expect(screen.getByText(/与 Tasks 共用/)).toBeTruthy();
    expect(screen.getAllByText(/入选依据/).length).toBeGreaterThan(0);
    expect(screen.getByText('暂无外部信号。')).toBeTruthy();
    expect(screen.getByText(/等待你确认是否长成任务/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /External Access/ }));
    expect(await screen.findByText('连接器状态')).toBeTruthy();
    expect(screen.getByText('仅手动')).toBeTruthy();
    expect(screen.getByText('先质检，再确认')).toBeTruthy();
  });

  it('renders Brief attention count and inclusion reasons from shared projection data', async () => {
    const task = buildTask({
      id: 'task_attention',
      title: '证据复核任务',
      state: 'running',
      summary: '需要复核新材料。',
    });
    const homeBrief = buildBriefData([task], []);
    homeBrief.briefAttention = {
      items: [{
        actionId: 'source-context:task_attention',
        taskId: task.id,
        lane: 'review_evidence',
        reason: 'New or important evidence may change the next action.',
      }],
      totalCount: 7,
      displayedCount: 1,
      displayLimit: 1,
      truncated: true,
      summary: 'Brief shows 1 of 7 attention items; Tasks owns the full queue.',
    };
    homeBrief.briefFocusTasks = [{
      id: task.id,
      title: task.title,
      lane: 'continue',
      whyNow: '共享优先队列提示有新证据需要复核。',
      action: '查看材料',
      sourceActionId: 'source-context:task_attention',
      rank: 1,
      attentionLane: 'review_evidence',
      attentionReason: 'New or important evidence may change the next action.',
      state: 'running',
      status: 'running',
      parentTaskId: null,
      parentTitle: null,
    }];
    vi.mocked(harness.api.getHomeBrief).mockResolvedValueOnce(homeBrief);

    render(<App />);

    expect(await screen.findByText('证据复核任务')).toBeTruthy();
    expect(screen.getByText(/显示前 1\/7 件/)).toBeTruthy();
    expect(screen.getByText(/Brief 只做今日注意力摘要/)).toBeTruthy();
    expect(screen.getByText(/入选依据：有新的来源或产出可能影响下一步/)).toBeTruthy();

    expect(harness.api.getHomeBrief).toHaveBeenCalled();
  });

  it('clarifies Model configuration stays local and separate from task memory', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      configurationSafetyReport: {
        secretExposureSafe: true,
        blockedReasons: [],
        summary: 'configured=2 / approvalRequired=0 / blocked=0',
        surfaces: [
          {
            id: 'model.provider',
            state: 'configured',
            reason: 'Provider configured: fal-openrouter / google/gemini-2.5-flash.',
            requiresApproval: false,
            startupProbePolicy: 'safe_read_only',
            exposesSecretValue: false,
          },
          {
            id: 'model.api_key',
            state: 'configured',
            reason: 'API key source is keychain; secret value is not exposed.',
            requiresApproval: false,
            startupProbePolicy: 'never',
            exposesSecretValue: false,
          },
        ],
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Model/ }));

    expect(await screen.findByText(/Provider 密钥保存在本机系统钥匙串/)).toBeTruthy();
    expect(screen.getByText(/不会写入任务记忆/)).toBeTruthy();
    expect(screen.getByText('模型配置边界')).toBeTruthy();
    expect(screen.getByText('model.provider')).toBeTruthy();
    expect(screen.getByText('model.api_key')).toBeTruthy();
    expect(screen.getByText(/secret value is not exposed/)).toBeTruthy();
  });

  it('renders structured External Access connector status from runtime config', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      externalAccessStatus: {
        sources: [{
          id: 'gmail_fixture',
          label: 'Gmail',
          kind: 'email',
          accountLabel: 'user@example.com',
          status: 'connected',
          lastSyncAt: '2026-05-17T09:30:00.000Z',
        }],
        connectedCount: 1,
        pendingCount: 0,
        errorCount: 0,
        updatedAt: '2026-05-17T10:00:00.000Z',
      },
      capabilityRegistry: [{
        id: 'external_access.connectors',
        label: 'External Access',
        family: 'external_access',
        status: 'available',
        configured: true,
        missingReason: null,
        visibility: 'hidden',
        access: 'read_only',
        requiresApproval: true,
        requiredGate: 'runtime_entrypoint_coverage',
        summary: 'connected=1 / pending=0 / errors=0',
      }],
      configurationSafetyReport: {
        secretExposureSafe: true,
        blockedReasons: [],
        summary: 'configured=1 / approvalRequired=1 / blocked=0',
        surfaces: [{
          id: 'external_access.connectors',
          state: 'approval_required',
          reason: 'connected=1 / pending=0 / errors=0',
          requiresApproval: true,
          startupProbePolicy: 'manual_only',
          exposesSecretValue: false,
        }],
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /External Access/ }));

    expect(await screen.findByText('Gmail')).toBeTruthy();
    expect(screen.getByText('user@example.com')).toBeTruthy();
    expect(screen.getByText('已连接')).toBeTruthy();
    expect(screen.queryByText('尚未连接任何来源。')).toBeNull();
    expect(screen.getByText('可用')).toBeTruthy();
    expect(screen.getByText('connected=1 / pending=0 / errors=0')).toBeTruthy();
  });

  it('routes Gmail connect through confirmed External Access controls', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);

    await user.click(screen.getByRole('button', { name: /External Access/ }));
    await user.click(await screen.findByRole('button', { name: '连接' }));

    expect(harness.api.connectGmailOAuth).toHaveBeenCalledWith({ confirmed: true });
    expect(await screen.findByText('Gmail 已连接。')).toBeTruthy();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it('routes Gmail disconnect through confirmed External Access controls', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      externalAccessStatus: {
        sources: [{
          id: 'gmail',
          label: 'Gmail',
          kind: 'email',
          accountLabel: 'user@example.com',
          status: 'connected',
          lastSyncAt: '2026-05-17T09:30:00.000Z',
        }],
        connectedCount: 1,
        pendingCount: 0,
        errorCount: 0,
        updatedAt: '2026-05-17T10:00:00.000Z',
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /External Access/ }));
    await user.click(screen.getByRole('button', { name: '断开' }));

    expect(harness.api.disconnectGmailOAuth).toHaveBeenCalledWith({ confirmed: true });
    expect(await screen.findByText('Gmail 已断开。')).toBeTruthy();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it('reviews and commits External Access source ingestion from the connections page', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);

    await user.click(screen.getByRole('button', { name: /External Access/ }));
    await user.click(await screen.findByRole('button', { name: '预览来源' }));

    expect(harness.api.previewExternalAccessSourceIngestion).toHaveBeenCalledWith({ taskId: 'task_risk' });
    expect(await screen.findByText('客户确认邮件')).toBeTruthy();
    expect(screen.getByText('含敏感信息邮件')).toBeTruthy();
    expect(screen.getByText('可写入')).toBeTruthy();
    expect(screen.getByText('需复核')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '确认写入' }));

    expect(harness.api.commitExternalAccessSourceIngestion).toHaveBeenCalledWith({
      taskId: 'task_risk',
      planIds: ['connector:gmail:message_1', 'connector:gmail:message_2'],
      confirmed: true,
    });
    expect(await screen.findByText(/已写入 0 条来源/)).toBeTruthy();
    confirmSpy.mockRestore();
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
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      capabilityRegistry: [{
        id: 'skills.catalogue',
        label: 'Skills',
        family: 'skill',
        status: 'unconfigured',
        configured: false,
        missingReason: 'Capability family is not configured for model-visible use.',
        visibility: 'hidden',
        access: 'read_only',
        requiresApproval: true,
        requiredGate: 'runtime_context_assembly',
        summary: 'reserved=4 / exposed=0',
      }],
      configurationSafetyReport: {
        secretExposureSafe: true,
        blockedReasons: ['skills.catalogue: Capability family is not configured for model-visible use.'],
        summary: 'configured=0 / approvalRequired=0 / blocked=1',
        surfaces: [{
          id: 'skills.catalogue',
          state: 'missing',
          reason: 'Capability family is not configured for model-visible use.',
          requiresApproval: true,
          startupProbePolicy: 'manual_only',
          exposesSecretValue: false,
        }],
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Skills/ }));

    expect(await screen.findByText(/AI 执行任务时可调用的工具模块/)).toBeTruthy();
    expect(screen.getByText(/启用技能只会把工具加入 AI 能力库/)).toBeTruthy();
    expect(screen.getByText(/是否调用仍由任务上下文、用户指令和执行确认决定/)).toBeTruthy();
    expect(screen.getByText('能力状态')).toBeTruthy();
    expect(screen.getByText('未配置')).toBeTruthy();
    expect(screen.getByText(/Capability family is not configured/)).toBeTruthy();
  });

  it('clarifies MCP servers expose tools without automatic execution', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      capabilityRegistry: [{
        id: 'mcp.servers',
        label: 'MCP Servers',
        family: 'mcp',
        status: 'disabled',
        configured: false,
        missingReason: 'No connected MCP server exposes tools.',
        visibility: 'hidden',
        access: 'mixed',
        requiresApproval: true,
        requiredGate: 'runtime_context_assembly',
        summary: 'connectedServers=0 / tools=0 / errors=0',
      }],
      configurationSafetyReport: {
        secretExposureSafe: true,
        blockedReasons: ['mcp.servers: No connected MCP server exposes tools.'],
        summary: 'configured=0 / approvalRequired=0 / blocked=1',
        surfaces: [{
          id: 'mcp.servers',
          state: 'disabled_by_flag',
          reason: 'No connected MCP server exposes tools.',
          requiresApproval: true,
          startupProbePolicy: 'manual_only',
          exposesSecretValue: false,
        }],
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /MCP/ }));

    expect(await screen.findByText(/Model Context Protocol 工具服务端/)).toBeTruthy();
    expect(screen.getByText(/连接服务器只会让工具进入 AI 能力库/)).toBeTruthy();
    expect(screen.getByText(/具体调用仍由任务上下文、用户指令和执行确认决定/)).toBeTruthy();
    expect(screen.getByText(/可将工具注册到 AI 能力库/)).toBeTruthy();
    expect(screen.getByText('能力状态')).toBeTruthy();
    expect(screen.getByText('已关闭')).toBeTruthy();
    expect(screen.getByText(/No connected MCP server exposes tools/)).toBeTruthy();
  });

  it('does not expose committed tasks as a first-version Brief stat', async () => {
    saveTaskAttributes('task_risk', { commitment: '今晚前给 CFO 过目' });
    render(<App />);

    expect(await screen.findByText('外部信号')).toBeTruthy();
    expect(screen.queryByText(/本周承诺/)).toBeNull();
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

  it('routes running Brief focus primary action back to task management', async () => {
    const user = userEvent.setup();
    const runningTask = buildTask({
      id: 'task_running_brief',
      title: '生成投资人更新稿',
      state: 'running',
      summary: 'Run 正在生成投资人更新稿。',
    });
    harness.tasks.unshift(runningTask);
    vi.mocked(harness.api.getHomeBrief).mockResolvedValue(buildBriefData([runningTask], []));
    vi.mocked(harness.api.getTaskDetail).mockImplementation(async (taskId: string) =>
      taskId === runningTask.id ? buildTaskDetail(runningTask) : null);
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /查看 Run/ }));

    expect(await screen.findByRole('button', { name: /任务管理/ })).toBeTruthy();
    expect(await screen.findByText('生成投资人更新稿')).toBeTruthy();
  });

  it('opens waiting Brief focus actions without exposing internal prompts in the input', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /起草跟进/ }));

    const input = await screen.findByPlaceholderText(/关于「合同盖章跟进」/) as HTMLTextAreaElement;
    expect(input.value).toBe('');
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
    expect(cards[1]?.textContent).toContain('推进中');
  });

  it('shows actionable child tasks in Brief without duplicating their project parent', async () => {
    const parent = buildTask({
      id: 'task_project_parent',
      title: '开发小程序',
      summary: '开发一个微信小程序。',
      taskType: 'project',
      taskFacets: ['project'],
      childTaskIds: ['task_project_child'],
      state: 'planned',
      nextStep: '推进项目',
    });
    const child = buildTask({
      id: 'task_project_child',
      title: '小程序需求分析与功能设计',
      summary: '明确核心功能和业务流程。',
      taskType: 'simple',
      taskFacets: ['simple'],
      parentTaskId: parent.id,
      childTaskIds: [],
      state: 'planned',
      nextStep: '确认需求',
    });
    saveTaskAttributes(parent.id, {
      type: 'simple',
      typeConfirmed: true,
      childTaskIds: [],
    });
    saveTaskAttributes(child.id, {
      type: 'project',
      typeConfirmed: true,
      parentTaskId: null,
    });
    vi.mocked(harness.api.getHomeBrief).mockResolvedValue(buildBriefData([child, parent], []));

    render(<App />);

    expect(await screen.findByText('小程序需求分析与功能设计')).toBeTruthy();
    expect(screen.getByText('所属项目：开发小程序')).toBeTruthy();
    expect(document.querySelectorAll('.focus-card')).toHaveLength(1);
  });

  it('opens task context in the right panel from a Brief focus card and sends task-aware chat', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));

    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();
    expect(screen.getByText(/从任务记忆、执行记录、关键来源和工作习惯重新组装上下文/)).toBeTruthy();
    expect(screen.getByTitle('离开任务上下文')).toBeTruthy();
    const focusCards = () => Array.from(document.querySelectorAll('.focus-card')) as HTMLElement[];
    await user.click(focusCards().find((card) => card.textContent?.includes('合同盖章跟进'))!);
    expect(await screen.findByText(/不会中断当前对话/)).toBeTruthy();
    expect(screen.getByText(/上下文切换由你确认/)).toBeTruthy();
    await user.click(focusCards().find((card) => card.textContent?.includes('董事会材料修订'))!);
    await waitFor(() => {
      expect(screen.queryByText(/不会中断当前对话/)).toBeNull();
    });
    fireEvent.click(screen.getByTitle('全屏显示'));
    expect(screen.getByTitle('退出全屏')).toBeTruthy();
    fireEvent.click(screen.getByTitle('退出全屏'));
    fireEvent.click(screen.getByTitle('历史记录'));
    expect(screen.getByText('当前会话')).toBeTruthy();
    expect(screen.getByText('消息')).toBeTruthy();
    expect(screen.getByText(/开始新会话会先归档有用任务信号/)).toBeTruthy();
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
    expect(screen.getByText(/放弃需要二次确认/)).toBeTruthy();
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

  it('does not offer task capture for underspecified global discussion', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Search or ask/ }));
    const input = await screen.findByPlaceholderText(/搜索、提问或捕获任务想法/);
    await user.type(input, '这个方案你怎么看，是否合理？');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.chatWithAI).toHaveBeenCalledWith(expect.objectContaining({
        taskId: null,
      }));
    });
    expect(screen.queryByRole('button', { name: '捕获为任务' })).toBeNull();
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

  it('keeps low-signal repetitive task chat instead of auto clearing it', async () => {
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

    expect(await screen.findByText(/自动刷新已暂停/)).toBeTruthy();
    expect(screen.getByText(/缺少明确可恢复信号/)).toBeTruthy();
    expect(harness.api.createSourceContext).not.toHaveBeenCalledWith(expect.objectContaining({
      title: '会话刷新前保全',
    }));
    expect(harness.api.createTaskFile).not.toHaveBeenCalledWith(expect.objectContaining({
      path: expect.stringContaining('Task Records/'),
    }));
    expect(await screen.findByPlaceholderText(/关于「董事会材料修订」/)).toBeTruthy();
  });

  it('lets users switch right-panel context cleanup to reminder-only mode', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.click(screen.getByRole('button', { name: '仅提醒' }));
    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);

    for (let i = 0; i < 3; i += 1) {
      await user.type(input, '下一步怎么推进？');
      await user.click(screen.getByRole('button', { name: '发送' }));
      await waitFor(() => {
        expect(harness.api.chatWithAI).toHaveBeenCalledTimes(i + 1);
      });
    }

    expect(await screen.findByText(/当前为仅提醒模式/)).toBeTruthy();
    expect(screen.getByText(/同一个问题已重复出现 3 次/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '刷新任务会话' })).toBeNull();
  });

  it('requires a second confirmation before manually refreshing a task session', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.click(screen.getByRole('button', { name: '手动确认' }));
    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);
    await user.type(input, '这轮先保留 Playwright 作为动态页面候选');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => {
      expect(harness.api.chatWithAI).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
      }));
    });

    await user.click(await screen.findByRole('button', { name: '整理归档' }));
    expect(await screen.findByText(/已整理并归档当前任务讨论的关键记录/)).toBeTruthy();
    expect(await screen.findByText(/归档摘要：用户消息 1 条/)).toBeTruthy();
    expect(screen.getAllByText(/Playwright 作为动态页面候选/).length).toBeGreaterThan(0);
    expect(await screen.findByRole('button', { name: '确认刷新' })).toBeTruthy();
    expect(await screen.findByPlaceholderText(/关于「董事会材料修订」/)).toBeTruthy();
    expect(harness.api.createTaskFile).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_risk',
      path: expect.stringMatching(/^Task Records\/\d{4}-\d{2}-\d{2}-context-refresh-handoff\.md$/),
      content: expect.stringContaining('Playwright'),
    }));

    await user.click(screen.getByRole('button', { name: '确认刷新' }));
    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '确认刷新' })).toBeNull();
  });

  it('blocks right-panel session refresh while latest task memory guidance is pending', async () => {
    const user = userEvent.setup();
    const pendingGuidance: TaskMemoryGuidanceState = {
      latestGuidanceAt: now,
      outcome: 'pending',
      pendingTargets: ['task_record'],
      reason: '最新任务记忆建议仍缺少对应写入：Task Record。',
      targets: ['task_record'],
    };
    const pendingProposal: TaskMemoryWriteProposal = {
      contentTemplate: '# Task Record: 董事会材料修订\n\n## Trigger\n最新任务记忆建议仍缺少对应写入：Task Record。\n',
      operation: 'create',
      path: 'Task Records/2026-01-01-memory-guidance.md',
      reason: '最新任务记忆建议仍缺少对应写入：Task Record。',
      target: 'task_record',
      title: '创建任务记录',
    };
    harness.runs.push(buildRun({
      id: 'run_newer_without_guidance',
      taskId: 'task_risk',
      updatedAt: '2026-01-01T00:05:00.000Z',
    }));
    harness.api.getRunDetail = vi.fn().mockImplementation(async (runId) => {
      const run = harness.runs.find((item) => item.id === runId);
      if (!run) return null;
      return buildRunDetail(run, {
        taskMemoryGuidance: run.id === 'run_newer_without_guidance' ? undefined : pendingGuidance,
        taskMemoryWriteProposals: run.id === 'run_newer_without_guidance' ? [] : [pendingProposal],
      });
    });
    window.api = harness.api;
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);
    for (let i = 0; i < 3; i += 1) {
      await user.type(input, '这轮先保留 Playwright 作为动态页面候选');
      await user.click(screen.getByRole('button', { name: '发送' }));
      await waitFor(() => {
        expect(harness.api.chatWithAI).toHaveBeenCalledTimes(i + 1);
      });
    }

    expect((await screen.findAllByText(/最新任务记忆建议仍缺少对应写入：Task Record/)).length).toBeGreaterThan(0);
    expect(await screen.findByText('任务记忆写入提案')).toBeTruthy();
    expect(await screen.findByText('建议归类：任务记录')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '确认补写记忆' }));
    await waitFor(() => {
      expect(harness.api.createTaskFile).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
        name: '2026-01-01-memory-guidance.md',
        path: 'Task Records/2026-01-01-memory-guidance.md',
        kind: 'file',
        content: expect.stringContaining('最新任务记忆建议仍缺少对应写入'),
      }));
    });
    expect(await screen.findByText(/已补写任务记忆/)).toBeTruthy();
    expect(await screen.findByPlaceholderText(/关于「董事会材料修订」/)).toBeTruthy();
  });

  it('creates a task-file write proposal before writing discussion notes', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);
    await user.type(input, '把三份优化文档的布局结论整理成任务产出文档');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => {
      expect(harness.api.chatWithAI).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
      }));
    });

    await user.click(await screen.findByRole('button', { name: '生成文件提案' }));
    expect(await screen.findByText('任务文件写入提案')).toBeTruthy();
    expect(await screen.findByText('建议归类：任务文件')).toBeTruthy();
    const pathInput = screen.getByLabelText('任务文件路径') as HTMLInputElement;
    await user.clear(pathInput);
    await user.type(pathInput, 'Task Records/layout-handoff.md');
    expect(await screen.findByText('建议归类：任务记录')).toBeTruthy();
    await user.clear(pathInput);
    await user.type(pathInput, 'docs/layout-notes.md');
    expect(await screen.findByText('建议归类：任务文件')).toBeTruthy();
    const contentInput = screen.getByLabelText('任务文件内容') as HTMLTextAreaElement;
    expect(contentInput.value).toContain('把三份优化文档的布局结论整理成任务产出文档');

    await user.click(screen.getByRole('button', { name: '确认写入文件' }));
    await waitFor(() => {
      expect(harness.api.createTaskFile).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
        name: 'layout-notes.md',
        path: 'docs/layout-notes.md',
        kind: 'file',
        content: expect.stringContaining('把三份优化文档的布局结论整理成任务产出文档'),
      }));
      expect(harness.api.createTaskFile).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
        name: 'Task.md',
        path: 'Task.md',
        kind: 'file',
        content: expect.stringContaining('- docs/layout-notes.md'),
      }));
    });
    expect(await screen.findByText(/已写入任务文件/)).toBeTruthy();
  });

  it('starts a user-initiated new conversation as global after archiving task signals', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);
    await user.type(input, '这轮先保留 Playwright 作为动态页面候选');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => {
      expect(harness.api.chatWithAI).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
      }));
    });

    fireEvent.click(screen.getByTitle('历史记录'));
    await user.click(screen.getByRole('button', { name: '开始新会话' }));

    await waitFor(() => {
      expect(harness.api.createSourceContext).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
        title: '会话刷新前保全',
        content: expect.stringContaining('Playwright'),
      }));
      expect(harness.api.createTaskFile).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
        name: expect.stringMatching(/^\d{4}-\d{2}-\d{2}-context-refresh-handoff\.md$/),
        path: expect.stringMatching(/^Task Records\/\d{4}-\d{2}-\d{2}-context-refresh-handoff\.md$/),
        kind: 'file',
        content: expect.stringContaining('Playwright'),
      }));
    });
    expect(await screen.findByText('全局')).toBeTruthy();
    expect(await screen.findByPlaceholderText(/搜索、提问或捕获任务想法/)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/关于「董事会材料修订」/)).toBeNull();
  });

  it('archives an active task discussion as a phase closeout record', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);
    await user.type(input, '这轮已经确定三份优化文档，可以进入下一步任务拆解');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => {
      expect(harness.api.chatWithAI).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
      }));
    });

    expect(await screen.findByText(/这段任务讨论可以收成阶段记录/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '收尾本阶段' }));

    await waitFor(() => {
      expect(harness.api.createSourceContext).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
        title: '阶段收尾记录',
        kind: 'note',
        isKey: false,
        content: expect.stringContaining('# Record: 阶段收尾'),
        note: '任务记录：阶段收尾、质量检查和执行交接。',
      }));
      expect(harness.api.createTaskFile).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
        name: expect.stringMatching(/^\d{4}-\d{2}-\d{2}-phase-closeout\.md$/),
        path: expect.stringMatching(/^Task Records\/\d{4}-\d{2}-\d{2}-phase-closeout\.md$/),
        kind: 'file',
        content: expect.stringContaining('# Record: 阶段收尾'),
      }));
    });
    expect(harness.api.recordTaskCompletionCheck).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_risk',
      source: 'lightweight_rule_engine',
      runVerificationLabel: expect.stringContaining('阶段收尾检查'),
    }));
    expect((await screen.findAllByText(/质量检查已记录/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '收尾本阶段' })).toBeNull();
    expect(screen.queryByRole('button', { name: '创建后续任务' })).toBeNull();
    expect(harness.api.createTask).not.toHaveBeenCalledWith(expect.objectContaining({
      title: '拆解下一步：董事会材料修订',
    }));
  });

  it('blocks phase closeout handoff while latest task memory guidance is pending', async () => {
    const user = userEvent.setup();
    const pendingGuidance: TaskMemoryGuidanceState = {
      latestGuidanceAt: now,
      outcome: 'pending',
      pendingTargets: ['task_md'],
      reason: '最新任务记忆建议仍缺少对应写入：Task.md。',
      targets: ['task_md'],
    };
    harness.api.getRunDetail = vi.fn().mockImplementation(async (runId) => {
      const run = harness.runs.find((item) => item.id === runId);
      if (!run) return null;
      return buildRunDetail(run, { taskMemoryGuidance: pendingGuidance });
    });
    window.api = harness.api;
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);
    await user.type(input, '这轮已经确定三份优化文档，可以进入下一步任务拆解');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => {
      expect(harness.api.chatWithAI).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
      }));
    });

    await user.click(await screen.findByRole('button', { name: '收尾本阶段' }));

    expect(await screen.findByText(/最新任务记忆建议仍缺少对应写入：Task.md/)).toBeTruthy();
    expect(harness.api.recordTaskCompletionCheck).not.toHaveBeenCalled();
    expect(await screen.findByPlaceholderText(/关于「董事会材料修订」/)).toBeTruthy();
  });

  it('does not create generic phase follow-up tasks when a project already has child tasks', async () => {
    const firstChild = buildTask({
      id: 'existing_child_1',
      title: '整理需求边界',
      state: 'planned',
      updatedAt: '2026-01-01T01:00:00.000Z',
    });
    const secondChild = buildTask({
      id: 'existing_child_2',
      title: '实现核心流程',
      state: 'planned',
      updatedAt: '2026-01-01T02:00:00.000Z',
    });
    const parent = harness.tasks.find((task) => task.id === 'task_risk')!;
    parent.taskType = 'project';
    parent.taskFacets = ['project'];
    parent.childTaskIds = [firstChild.id, secondChild.id];
    firstChild.parentTaskId = parent.id;
    secondChild.parentTaskId = parent.id;
    harness.tasks.push(firstChild, secondChild);
    harness.details[parent.id] = buildTaskDetail(parent);
    harness.details[firstChild.id] = buildTaskDetail(firstChild);
    harness.details[secondChild.id] = buildTaskDetail(secondChild);
    saveTaskAttributes('task_risk', {
      type: 'project',
      typeConfirmed: true,
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);
    await user.type(input, '这轮已经收尾，可以拆出后续执行、实现和验收任务');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(await screen.findByText(/这段任务讨论可以收成阶段记录/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '收尾本阶段' }));
    expect(await screen.findByText(/现在进入第一项子任务/)).toBeTruthy();
    expect((await screen.findAllByText(/整理需求边界/)).length).toBeGreaterThan(0);
    expect(harness.api.transitionTask).toHaveBeenCalledWith({
      id: 'existing_child_1',
      nextState: 'running',
    });
    expect(screen.queryByRole('button', { name: '创建后续任务' })).toBeNull();

    expect(harness.tasks.find((task) => task.id === 'task_risk')?.childTaskIds).toEqual([
      'existing_child_1',
      'existing_child_2',
    ]);
    expect(harness.api.createTask).not.toHaveBeenCalledWith(expect.objectContaining({
      title: '拆解下一步：董事会材料修订',
    }));
  });

  it('does not offer task capture for task-context follow-up discussion', async () => {
    const child = buildTask({
      id: 'existing_child_for_capture',
      title: '整理需求边界',
      state: 'planned',
      updatedAt: '2026-01-01T01:00:00.000Z',
    });
    const parent = harness.tasks.find((task) => task.id === 'task_risk')!;
    parent.taskType = 'project';
    parent.taskFacets = ['project'];
    parent.childTaskIds = [child.id];
    child.parentTaskId = parent.id;
    harness.tasks.push(child);
    harness.details[parent.id] = buildTaskDetail(parent);
    harness.details[child.id] = buildTaskDetail(child);

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);
    await user.type(input, '把这个作为后续任务创建：补充验收回归');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.chatWithAI).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
      }));
    });
    expect(screen.queryByRole('button', { name: '捕获为任务' })).toBeNull();
    expect(harness.api.createTask).not.toHaveBeenCalledWith(expect.objectContaining({
      title: '把这个作为后续任务创建：补充验收回归',
    }));
  });

  it('does not enter the next child task after phase closeout when subtask start is blocked', async () => {
    const blockedChild = buildTask({
      id: 'blocked_child_1',
      title: '等待评审子任务',
      state: 'planned',
      updatedAt: '2026-01-01T01:00:00.000Z',
      activeBlocker: {
        id: 'blocker_child_1',
        taskId: 'blocked_child_1',
        title: '等待评审确认',
        kind: 'approval',
        detail: null,
        owner: null,
        responsibility: null,
        responsibilityLabel: null,
        sourceContextId: null,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
      },
    });
    const parent = harness.tasks.find((task) => task.id === 'task_risk')!;
    parent.taskType = 'project';
    parent.taskFacets = ['project'];
    parent.childTaskIds = [blockedChild.id];
    blockedChild.parentTaskId = parent.id;
    harness.tasks.push(blockedChild);
    harness.details[parent.id] = buildTaskDetail(parent);
    harness.details[blockedChild.id] = buildTaskDetail(blockedChild);
    saveTaskAttributes('task_risk', {
      type: 'project',
      typeConfirmed: true,
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);
    await user.type(input, '这轮已经收尾，可以进入下一项子任务');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(await screen.findByText(/这段任务讨论可以收成阶段记录/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '收尾本阶段' }));

    expect(await screen.findByText(/进入「等待评审子任务」前需要先处理/)).toBeTruthy();
    expect((await screen.findAllByText(/仍有阻塞、依赖或等待状态/)).length).toBeGreaterThan(0);
    expect(harness.api.transitionTask).not.toHaveBeenCalledWith({
      id: 'blocked_child_1',
      nextState: 'running',
    });
  });

  it('does not silently repair phase follow-up tasks from title patterns', async () => {
    const project = buildTask({
      id: 'task_project_repair',
      title: '开发小程序',
      taskType: 'project',
      taskFacets: ['project'],
      childTaskIds: ['existing_child_1', 'existing_child_2', 'existing_child_3', 'existing_child_4', 'existing_child_5'],
      state: 'planned',
      updatedAt: '2026-05-13T12:00:00.000Z',
    });
    const followups = [
      buildTask({ id: 'task_followup_repair_1', title: '拆解下一步：开发小程序', taskType: 'simple', parentTaskId: null, childTaskIds: [], state: 'planned' }),
      buildTask({ id: 'task_followup_repair_2', title: '实现调整：开发小程序', taskType: 'simple', parentTaskId: null, childTaskIds: [], state: 'planned' }),
      buildTask({ id: 'task_followup_repair_3', title: '验收回归：开发小程序', taskType: 'simple', parentTaskId: null, childTaskIds: [], state: 'planned' }),
    ];
    harness.tasks.unshift(project, ...followups);
    harness.details[project.id] = buildTaskDetail(project);
    for (const task of followups) {
      harness.details[task.id] = buildTaskDetail(task);
      saveTaskAttributes(task.id, { type: 'project', typeConfirmed: true });
    }
    saveTaskAttributes(project.id, {
      type: 'project',
      typeConfirmed: true,
      childTaskIds: ['existing_child_1', 'existing_child_2', 'existing_child_3', 'existing_child_4', 'existing_child_5'],
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    expect(await screen.findByText('开发小程序')).toBeTruthy();

    const attrs = loadTaskAttributes();
    expect(project.childTaskIds).toEqual([
      'existing_child_1',
      'existing_child_2',
      'existing_child_3',
      'existing_child_4',
      'existing_child_5',
    ]);
    expect(attrs.task_project_repair).not.toHaveProperty('childTaskIds');
    for (const task of followups) {
      expect(attrs[task.id]).toMatchObject({
        type: 'project',
        typeConfirmed: true,
      });
      expect(attrs[task.id]).not.toHaveProperty('parentTaskId');
    }
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

    expect(await screen.findByText(/已自动整理并刷新/)).toBeTruthy();
    expect(harness.api.createTaskFile).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_risk',
      path: expect.stringMatching(/^Task Records\/\d{4}-\d{2}-\d{2}-context-refresh-handoff\.md$/),
      content: expect.stringContaining('帮我判断推进路径'),
    }));
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

    expect(await screen.findByText(/已自动整理并刷新/)).toBeTruthy();
    expect(harness.api.createTaskFile).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_risk',
      path: expect.stringMatching(/^Task Records\/\d{4}-\d{2}-\d{2}-context-refresh-handoff\.md$/),
      content: expect.stringContaining('改成先补法务意见'),
    }));
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

    expect(await screen.findByText(/自动刷新已暂停/)).toBeTruthy();
    expect(screen.getByText(/达到会话检查阈值 3/)).toBeTruthy();
    expect(screen.getByText(/缺少明确可恢复信号/)).toBeTruthy();
  });

  it('persists selected task completion from the Tasks inline row action', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByText('董事会材料修订'));
    expect((await screen.findAllByText(/董事会反馈邮件/)).length).toBeGreaterThan(0);
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

    await user.click(screen.getByRole('button', { name: /Work Habits/ }));
    expect(await screen.findByText(/允许覆盖未满足的完成检查/)).toBeTruthy();
    expect(screen.getAllByText('提议确认').length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: '确认' })[0]!);
    expect((await screen.findAllByText('已确认')).length).toBeGreaterThan(0);
  });

  it('surfaces pending task memory guidance from older runs during completion checks', async () => {
    const user = userEvent.setup();
    const pendingGuidance: TaskMemoryGuidanceState = {
      latestGuidanceAt: now,
      outcome: 'pending',
      pendingTargets: ['task_record'],
      reason: '最新任务记忆建议仍缺少对应写入：Task Record。',
      targets: ['task_record'],
    };
    harness.runs.push(buildRun({
      id: 'run_newer_without_guidance',
      taskId: 'task_risk',
      updatedAt: '2026-01-01T00:05:00.000Z',
    }));
    harness.api.getRunDetail = vi.fn().mockImplementation(async (runId) => {
      const run = harness.runs.find((item) => item.id === runId);
      if (!run) return null;
      return buildRunDetail(run, {
        taskMemoryGuidance: run.id === 'run_newer_without_guidance' ? undefined : pendingGuidance,
      });
    });
    window.api = harness.api;
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByText('董事会材料修订'));
    await user.click(await screen.findByRole('button', { name: '完成' }));

    expect(await screen.findByText('完成确认')).toBeTruthy();
    expect(screen.getAllByText(/Run 任务记忆待处理/).length).toBeGreaterThan(0);
    expect(screen.getByText(/最新任务记忆建议仍缺少对应写入：Task Record/)).toBeTruthy();
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
    expect((await screen.findAllByText(/财务复核/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/法务意见/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/CEO 批注/).length).toBeGreaterThan(0);
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

    expect(await screen.findByRole('button', { name: /开始执行/ })).toBeTruthy();
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

  it('keeps project child dependency chains inside the parent instead of duplicating them in the priority queue', async () => {
    const user = userEvent.setup();
    const project = buildTask({
      id: 'task_project_chain',
      title: '开发小程序',
      nextStep: '推进项目',
      taskType: 'project',
      taskFacets: ['project'],
      childTaskIds: ['task_chain_requirement', 'task_chain_development', 'task_chain_testing', 'task_chain_launch'],
    });
    const requirement = buildTask({
      id: 'task_chain_requirement',
      title: '小程序需求分析与功能设计',
      nextStep: '确认需求',
      parentTaskId: project.id,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const development = buildTask({
      id: 'task_chain_development',
      title: '小程序前后端开发与联调',
      parentTaskId: project.id,
      activeDependency: buildTaskDependency({
        id: 'dependency_development',
        taskId: 'task_chain_development',
        blockedByTaskId: requirement.id,
        blockedByTaskTitle: requirement.title,
      }),
      updatedAt: '2026-01-05T00:00:00.000Z',
    });
    const testing = buildTask({
      id: 'task_chain_testing',
      title: '小程序测试、安全加固与性能优化',
      parentTaskId: project.id,
      activeDependency: buildTaskDependency({
        id: 'dependency_testing',
        taskId: 'task_chain_testing',
        blockedByTaskId: development.id,
        blockedByTaskTitle: development.title,
      }),
      updatedAt: '2026-01-04T00:00:00.000Z',
    });
    const launch = buildTask({
      id: 'task_chain_launch',
      title: '小程序上线准备与发布',
      parentTaskId: project.id,
      activeDependency: buildTaskDependency({
        id: 'dependency_launch',
        taskId: 'task_chain_launch',
        blockedByTaskId: testing.id,
        blockedByTaskTitle: testing.title,
      }),
      updatedAt: '2026-01-06T00:00:00.000Z',
    });

    saveTaskAttributes(project.id, {
      type: 'project',
      typeConfirmed: true,
      childTaskIds: [requirement.id, development.id, testing.id, launch.id],
    });
    for (const child of [requirement, development, testing, launch]) {
      saveTaskAttributes(child.id, {
        type: 'simple',
        typeConfirmed: true,
        parentTaskId: project.id,
      });
    }
    harness.tasks.unshift(launch, testing, development, requirement, project);

    render(<App />);
    await user.click(screen.getByRole('button', { name: /Tasks/ }));

    const cards = Array.from(document.querySelectorAll('.execution-queue-card')) as HTMLElement[];
    const orderedTitles = cards.map((card) => card.textContent ?? '').filter((text) => text.includes('小程序'));
    expect(orderedTitles).toHaveLength(1);
    expect(orderedTitles[0]).toContain('开发小程序');
    expect(orderedTitles[0]).not.toContain('小程序需求分析与功能设计');
    expect(orderedTitles[0]).not.toContain('小程序前后端开发与联调');
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
    expect(screen.getAllByText('Agent 暂停').length).toBeGreaterThan(0);
    expect(screen.getAllByText('风险确认').length).toBeGreaterThan(0);
    expect(screen.getAllByText('推进中').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Agent 检查点').length).toBeGreaterThan(0);
    expect(screen.getByText('需要复核')).toBeTruthy();
    expect(screen.getAllByText('高影响').length).toBeGreaterThan(0);
    expect(screen.getByText('需谨慎恢复')).toBeTruthy();
    expect(screen.getAllByText('同组 2 项').length).toBeGreaterThan(0);
    expect(screen.getByText('恢复执行')).toBeTruthy();
    expect(screen.getByText('人工决策')).toBeTruthy();
    expect(screen.getByText('推荐路径清晰')).toBeTruthy();
    expect(screen.getByText('需留痕')).toBeTruthy();
    expect(screen.getAllByText('展开可比较备选').length).toBeGreaterThan(0);
    expect(screen.getAllByText('更新 2026-01-01').length).toBeGreaterThan(0);
    expect(screen.queryByText('decision_done')).toBeNull();
    await user.type(screen.getByPlaceholderText('搜索决策或任务'), '合同');
    expect(await screen.findByText('没有匹配的待拍板事项。')).toBeTruthy();
    await user.clear(screen.getByPlaceholderText('搜索决策或任务'));

    await user.click(screen.getByText('是否恢复暂停的 Agent 执行'));
    expect(await screen.findByText(/Agent 在「董事会材料修订」的执行检查点暂停/)).toBeTruthy();
    expect(screen.getByText(/仍有 2 个待决策事项/)).toBeTruthy();
    expect(screen.getAllByText(/不会授予后续同类动作的长期权限/).length).toBeGreaterThan(0);
    expect(screen.getByText('暂停等待')).toBeTruthy();
    expect(screen.getByText('取消本次执行')).toBeTruthy();

    await user.click(screen.getByText('是否批准本轮材料修改方案'));
    expect((await screen.findAllByText('为什么现在')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/任务信号/).length).toBeGreaterThan(0);
    expect(screen.getByText(/确认风险边界/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '修改后批准' }).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: '要求补充信息' })[0]!);
    expect((await screen.findAllByText('董事会材料修订')).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: '查看任务' })[0]!);
    expect(await screen.findByText('任务动态')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
    await user.click(screen.getAllByRole('button', { name: /Decisions/ })[0]!);
    await user.click(await screen.findByText('是否批准本轮材料修改方案'));
    await user.click((await screen.findAllByRole('button', { name: '选择此方案' }))[0]!);

    await waitFor(() => {
      expect(harness.api.actOnDecision).toHaveBeenCalledWith({
        id: 'decision_pending',
        action: 'approve',
      });
    });
    expect(await screen.findByLabelText('拍板结果')).toBeTruthy();
    expect(screen.getByText('已批准')).toBeTruthy();
    expect(screen.getByText('拍板已通过')).toBeTruthy();
    expect(screen.getByText(/已有 1 个决策通过/)).toBeTruthy();
  });

  it('keeps the empty Decisions state anchored on user approval', async () => {
    const user = userEvent.setup();
    harness.decisions.length = 0;
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Decisions/ }));

    expect(await screen.findByText('当前没有待拍板事项。')).toBeTruthy();
    expect(screen.getByText(/汇总到这里等待你拍板/)).toBeTruthy();
  });

  it('surfaces task hierarchy manual review in Decisions without using the task list', async () => {
    const user = userEvent.setup();
    harness.decisions.length = 0;
    vi.mocked(harness.api.getTaskHierarchyConsistency).mockResolvedValue({
      consistent: false,
      issues: [],
      issueCount: 2,
      summary: '任务层级存在 2 个一致性问题。',
    });
    vi.mocked(harness.api.getTaskHierarchyManualReviewPolicy).mockResolvedValue({
      required: true,
      items: [
        {
          reason: 'missing_record',
          decisionQuestion: '缺失的任务记录是否应恢复，还是应移除这条层级引用？',
          recommendedResolution: '先确认缺失记录来源；无法恢复时再移除悬空引用。',
          issue: {
            code: 'missing_child_record',
            taskId: 'task_risk',
            relatedTaskId: 'missing_child',
            message: '任务引用了不存在的子任务。',
          },
        },
      ],
      summary: '有 1 个层级关系需要人工确认。',
    });
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Decisions/ }));

    expect(await screen.findByText('任务结构待确认')).toBeTruthy();
    expect(screen.queryByText('当前没有待拍板事项。')).toBeNull();
    expect(screen.getByText('存在可安全修复的任务层级关系')).toBeTruthy();
    expect(screen.getByText('缺失的任务记录是否应恢复，还是应移除这条层级引用？')).toBeTruthy();
    expect(screen.getByText('先确认缺失记录来源；无法恢复时再移除悬空引用。')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '应用安全修复 →' }));
    await waitFor(() => {
      expect(harness.api.applySafeTaskHierarchyRepairs).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: '移除悬空引用 →' }));
    await waitFor(() => {
      expect(harness.api.applyTaskHierarchyManualResolution).toHaveBeenCalledWith({
        kind: 'remove_child_reference',
        taskId: 'task_risk',
        relatedTaskId: 'missing_child',
      });
    });
  });

  it('keeps a decision visible when the formal action fails', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.actOnDecision).mockRejectedValueOnce(new Error('network failed'));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Decisions/ }));
    expect(await screen.findByText('是否批准本轮材料修改方案')).toBeTruthy();
    await user.click(await screen.findByText('是否批准本轮材料修改方案'));
    await user.click((await screen.findAllByRole('button', { name: '选择此方案' }))[0]!);

    await waitFor(() => {
      expect(harness.api.actOnDecision).toHaveBeenCalledWith({
        id: 'decision_pending',
        action: 'approve',
      });
    });
    expect(await screen.findByText('是否批准本轮材料修改方案')).toBeTruthy();
    expect(screen.queryByLabelText('拍板结果')).toBeNull();
    expect(await screen.findByLabelText('拍板失败')).toBeTruthy();
    expect(screen.getByText(/事项已保留在列表中/)).toBeTruthy();
  });

  it('prevents duplicate decision actions while a decision is being processed', async () => {
    const user = userEvent.setup();
    let resolveAction: (decision: DecisionRecord) => void = () => {};
    vi.mocked(harness.api.actOnDecision).mockImplementationOnce(() => new Promise((resolve) => {
      resolveAction = resolve;
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Decisions/ }));
    const decisionTitle = await screen.findByText('是否批准本轮材料修改方案');
    await user.click(decisionTitle);
    const approveButton = (await screen.findAllByRole('button', { name: '选择此方案' }))[0]!;
    await user.click(approveButton);

    expect((await screen.findByRole('button', { name: '处理中…' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(approveButton);
    expect(harness.api.actOnDecision).toHaveBeenCalledTimes(1);

    resolveAction(buildDecision({ id: 'decision_pending', status: 'approved' }));
    expect(await screen.findByLabelText('拍板结果')).toBeTruthy();
  });

  it('counts only active task-linked decisions in the task decision lens', async () => {
    const user = userEvent.setup();
    harness.decisions.length = 0;
    harness.decisions.push(buildDecision({
      id: 'decision_orphan',
      taskId: 'task_missing',
      title: '确认外部写入',
      sourceLabel: '外部系统权限',
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));

    const taskDecisionLens = await screen.findByRole('button', { name: /待拍板/ });
    expect(taskDecisionLens).toBeTruthy();
    expect(taskDecisionLens.textContent).not.toContain('1');
    await user.click(taskDecisionLens);
    expect(await screen.findByText('当前视角下没有任务。')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Decisions/ }));
    expect(await screen.findByText('确认外部写入')).toBeTruthy();
    expect(screen.getByText('未关联到当前任务')).toBeTruthy();
  });

  it('saves AI behavior preferences as dedicated feature flags', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      configurationSafetyReport: {
        secretExposureSafe: true,
        blockedReasons: ['workspace.root: Workspace root is missing.'],
        summary: 'configured=2 / approvalRequired=1 / blocked=1',
        surfaces: [
          {
            id: 'model.api_key',
            state: 'configured',
            reason: 'API key source is keychain; secret value is not exposed.',
            requiresApproval: false,
            startupProbePolicy: 'never',
            exposesSecretValue: false,
          },
          {
            id: 'sandbox.patch_promotion',
            state: 'approval_required',
            reason: 'Sandbox patch promotion apply is enabled but still requires explicit approval.',
            requiresApproval: true,
            startupProbePolicy: 'manual_only',
            exposesSecretValue: false,
          },
          {
            id: 'workspace.root',
            state: 'missing',
            reason: 'Workspace root is missing.',
            requiresApproval: true,
            startupProbePolicy: 'safe_read_only',
            exposesSecretValue: false,
          },
        ],
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Settings/ }));
    expect(await screen.findByText(/不做持续行为监控/)).toBeTruthy();
    expect(screen.getByText('Run / Task 自检查')).toBeTruthy();
    expect(screen.getByText(/Step 级检查是执行质量基线/)).toBeTruthy();
    expect(screen.getByText(/Run \/ Task 检查只在失败、等待拍板或完成确认时提示/)).toBeTruthy();
    expect(screen.getByText(/完成、覆盖、SOP 提取等节点提炼工作习惯/)).toBeTruthy();
    expect(screen.getByText(/关闭后不生成新的习惯提议/)).toBeTruthy();
    expect(screen.getByText(/Work Habits 展示，可停用或删除/)).toBeTruthy();
    expect(screen.getByText(/真正压缩前会先保留关键决策、偏好变化和未解决问题/)).toBeTruthy();
    expect(screen.getByText('沟通风格')).toBeTruthy();
    expect(screen.getByText('确认阈值')).toBeTruthy();
    expect(screen.getByText(/低：更少打断/)).toBeTruthy();
    expect(screen.getByText(/高：不确定结论也更常请你拍板/)).toBeTruthy();
    expect(screen.getByText('配置安全边界')).toBeTruthy();
    expect(screen.getByText('密钥不外显')).toBeTruthy();
    expect(screen.getByText('sandbox.patch_promotion')).toBeTruthy();
    expect(screen.getByText(/探测：仅手动 · 需用户确认/)).toBeTruthy();
    expect(screen.getByText(/当前不会自动启用受阻能力/)).toBeTruthy();
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

  it('creates a project parent task and guides AI decomposition instead of hard-coded subtasks', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: '+ 新建任务' }));
    await user.type(await screen.findByPlaceholderText(/任务标题/), '官网改版项目');
    await user.type(await screen.findByPlaceholderText(/交付备注/), '围绕首页、案例页和转化路径完成改版。');
    expect(screen.getByRole('button', { name: '项目型' }).className).toContain('active');
    expect(screen.getAllByText(/类型由 AI 根据标题预判/).length).toBeGreaterThan(0);
    expect(screen.getByText(/点击创建即确认当前建议/)).toBeTruthy();
    expect(screen.getAllByText(/确认后才创建真实子任务/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '创建' }));
    await waitFor(() => {
      expect(harness.api.createTask).toHaveBeenCalledWith({
        title: '官网改版项目',
        summary: '围绕首页、案例页和转化路径完成改版。',
        taskType: 'project',
        taskFacets: ['project'],
      });
      expect(harness.api.transitionTask).toHaveBeenCalledWith({
        id: 'task_created',
        nextState: 'planned',
      });
    });

    await user.click(screen.getByRole('button', { name: /项目型/ }));
    expect((await screen.findAllByText('官网改版项目')).length).toBeGreaterThan(0);
    await user.click(await screen.findByRole('button', { name: '官网改版项目' }));
    expect(screen.getByText(/先在右侧 AI 面板讨论拆解方案/)).toBeTruthy();
    expect(screen.getByText(/在 AI 面板确认拆解方案后/)).toBeTruthy();
    expect(screen.queryByText('明确范围：官网改版项目')).toBeNull();
    expect(harness.api.createTask).toHaveBeenCalledTimes(1);

    vi.mocked(harness.api.chatWithAI!).mockResolvedValueOnce({
      text: '我会先给出一版项目拆解方案，并等待你补充边界后再创建子任务。',
    });
    await user.click(screen.getByRole('button', { name: /拆解任务/ }));
    await waitFor(() => {
      expect(harness.api.chatWithAI).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_created',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('官网改版项目'),
          }),
        ]),
      }));
    });
    const chatCalls = vi.mocked(harness.api.chatWithAI!).mock.calls;
    const lastChatCall = chatCalls[chatCalls.length - 1];
    const lastChatInput = lastChatCall ? lastChatCall[0] : null;
    const decompositionMessage = lastChatInput?.messages.at(-1)?.content ?? '';
    expect(decompositionMessage).not.toContain('Taskplane Agent Operating Principles');
    expect(decompositionMessage).not.toContain('## Task Creation Protocol');
    expect(await screen.findByText(/我会先给出一版项目拆解方案/)).toBeTruthy();
    expect(screen.queryByText('AI 拆解草稿')).toBeNull();
    expect(harness.api.decomposeProject).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /项目型/ }));
    expect(screen.getAllByText('官网改版项目').length).toBeGreaterThan(0);
    expect(harness.api.createTask).toHaveBeenCalledTimes(1);
  });

  it('surfaces task files and external access after the Context split', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    expect((await screen.findAllByText('待拍板')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /任务文件/ }).getAttribute('aria-expanded')).toBe('true');
    expect(await screen.findByText('任务文件')).toBeTruthy();
    expect(screen.getByText('选择任务后显示文件')).toBeTruthy();
    await user.click(await screen.findByText('董事会材料修订'));
    await user.click(await findTaskFileButton(/Task.md/));
    expect(await screen.findByText('Primary task record')).toBeTruthy();
    expect(screen.getByDisplayValue(/# Task/)).toBeTruthy();
    expect(screen.getByDisplayValue(/董事会材料修订/)).toBeTruthy();
    expect(screen.getByDisplayValue(/董事会反馈邮件/)).toBeTruthy();
    expect(screen.queryByDisplayValue(/Agent Principles/)).toBeNull();
    expect(await findTaskFileButton(/report_v1.md/)).toBeTruthy();
    await user.click(await findTaskFileButton(/report_v1.md/));
    expect(await screen.findByText('Projected artifact')).toBeTruthy();
    await user.click(await findTaskFileButton(/董事会反馈邮件.md/));
    expect(await screen.findByText('Projected source material')).toBeTruthy();
    expect(screen.getByDisplayValue(/URI: https:\/\/example.com\/feedback/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /External Access/ }));
    expect(await screen.findByText(/外部账号与数据源授权/)).toBeTruthy();
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
  });

  it('shows an empty task-file prompt before a task is selected', async () => {
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

    await user.click(screen.getByRole('button', { name: /Tasks/ }));

    expect(await screen.findByText('任务文件')).toBeTruthy();
    expect(screen.getByText('选择任务后显示文件')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /任务文件/ }));
    expect(screen.queryByText('选择任务后显示文件')).toBeNull();
    await user.click(screen.getByRole('button', { name: /任务文件/ }));
    expect(screen.getByText('选择任务后显示文件')).toBeTruthy();
  });

  it('keeps task management and task dynamics as task-level tabs without exposing Run', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));

    expect(await screen.findByRole('button', { name: '任务管理' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '任务动态' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /去拍板/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Overview' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Timeline' })).toBeNull();
    expect(screen.queryByText('任务信息已更新')).toBeNull();
    expect(screen.queryByText(/1 条执行记录/)).toBeNull();

    await user.click(screen.getByRole('button', { name: '任务动态' }));
    expect(screen.getByRole('button', { name: '任务动态' }).className).toContain('active');
    expect(screen.getByLabelText('任务动态关键脉络')).toBeTruthy();
    expect(screen.getByText('关键脉络')).toBeTruthy();
    expect(screen.getByText('任务状态变化')).toBeTruthy();
    expect(screen.getAllByText('任务事件').length).toBeGreaterThan(0);
    expect(screen.getAllByText('任务信息已更新').length).toBeGreaterThan(0);
    expect(screen.getByText(/1 条执行记录/)).toBeTruthy();
    expect((await screen.findAllByText(/整理反馈/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('任务信息已更新').length).toBeGreaterThan(0);

    await user.click(await screen.findByRole('button', { name: /合同盖章跟进/ }));
    expect(await screen.findByText(/等待法务确认盖章版本/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '任务管理' }).className).toContain('active');
    expect(screen.queryByText('任务信息已更新')).toBeNull();
  });

  it('renders completion checks as quality-gate replay groups in task dynamics', async () => {
    const task = buildTask({
      id: 'task_quality_replay',
      title: '阶段收尾检查',
      summary: '验证阶段收尾记录是否可回放。',
    });
    harness.tasks.unshift(task);
    harness.details[task.id] = {
      ...buildTaskDetail(task),
      timeline: [{
        id: 'timeline_quality_check',
        taskId: task.id,
        type: 'task.completion_check',
        payload: JSON.stringify({
          action: 'quality_check',
          reason: '阶段收尾质量检查已完成，准备进入下一项任务。',
        }),
        createdAt: now,
      }],
    };

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: /阶段收尾检查/ }));
    await user.click(screen.getByRole('button', { name: '任务动态' }));

    expect(screen.getByLabelText('任务动态关键脉络')).toBeTruthy();
    expect(screen.getByText('质量检查')).toBeTruthy();
    expect(screen.getByText(/1 条动态 · 质量/)).toBeTruthy();
    expect(screen.getAllByText(/阶段收尾质量检查已完成/).length).toBeGreaterThan(0);
  });

  it('opens timeline tasks inside Tasks instead of the legacy workbench', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(screen.getByRole('button', { name: '任务动态' }));
    await user.click(await screen.findByText('董事会材料修订'));

    expect(await screen.findByRole('button', { name: '任务管理' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '任务管理' }).className).toContain('active');
    expect(screen.queryByText('工作台')).toBeNull();
    expect(screen.queryByRole('button', { name: '执行' })).toBeNull();
    expect(screen.getByText(/需要按最新反馈更新董事会材料/)).toBeTruthy();
  });

  it('respects a confirmed simple task type even when the title looks like a project', async () => {
    const task = buildTask({
      id: 'task_confirmed_simple_type',
      title: '开发一个一次性演示说明',
      state: 'planned',
    });
    harness.tasks.unshift(task);
    harness.details[task.id] = buildTaskDetail(task);
    saveTaskAttributes(task.id, { type: 'simple', typeConfirmed: true });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));

    await screen.findByRole('button', { name: /一次性任务/ });
    await user.click(screen.getByRole('button', { name: /项目型/ }));
    const taskWorkspace = document.querySelector('.task-list') as HTMLElement;
    expect(within(taskWorkspace).queryByText('开发一个一次性演示说明')).toBeNull();
    await user.click(screen.getByRole('button', { name: /一次性任务/ }));
    await user.click(screen.getByRole('button', { name: /开发一个一次性演示说明/ }));
    expect(await screen.findByText('一次性')).toBeTruthy();
  });

  it('orders project child tasks by recorded execution order in the parent task workspace', async () => {
    const project = buildTask({
      id: 'task_project_order',
      title: '上线项目',
      taskType: 'project',
      taskFacets: ['project'],
      childTaskIds: ['task_project_order_first', 'task_project_order_second', 'task_project_order_third'],
      state: 'planned',
      updatedAt: '2026-05-13T12:00:00.000Z',
    });
    const first = buildTask({
      id: 'task_project_order_first',
      title: '1 需求确认',
      parentTaskId: project.id,
      state: 'planned',
      updatedAt: '2026-05-13T12:05:00.000Z',
    });
    const second = buildTask({
      id: 'task_project_order_second',
      title: '2 界面设计',
      parentTaskId: project.id,
      state: 'planned',
      updatedAt: '2026-05-13T12:04:00.000Z',
    });
    const third = buildTask({
      id: 'task_project_order_third',
      title: '3 开发联调',
      parentTaskId: project.id,
      state: 'planned',
      updatedAt: '2026-05-13T12:03:00.000Z',
    });
    harness.tasks.unshift(third, second, first, project);
    [project, first, second, third].forEach((task) => {
      harness.details[task.id] = buildTaskDetail(task);
    });
    saveTaskAttributes(project.id, {
      type: 'project',
      typeConfirmed: true,
      childTaskIds: [first.id, second.id, third.id],
    });
    saveTaskAttributes(first.id, { type: 'simple', typeConfirmed: true, parentTaskId: project.id });
    saveTaskAttributes(second.id, { type: 'simple', typeConfirmed: true, parentTaskId: project.id });
    saveTaskAttributes(third.id, { type: 'simple', typeConfirmed: true, parentTaskId: project.id });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(screen.getByRole('button', { name: /项目型/ }));
    await user.click(await screen.findByRole('button', { name: '上线项目' }));

    const taskWorkspace = document.querySelector('.task-list') as HTMLElement;
    const childList = document.querySelector('.project-child-list') as HTMLElement;
    const firstNode = await within(childList).findByRole('button', { name: /1 需求确认/ });
    const secondNode = await within(childList).findByRole('button', { name: /2 界面设计/ });
    const thirdNode = await within(childList).findByRole('button', { name: /3 开发联调/ });
    expect(firstNode.compareDocumentPosition(secondNode) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(secondNode.compareDocumentPosition(thirdNode) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(secondNode);
    expect(within(taskWorkspace).getByText('项目子任务')).toBeTruthy();
    expect(within(taskWorkspace).queryByText('一次性')).toBeNull();
    expect(screen.getByRole('button', { name: '上线项目' }).className).toContain('parent-active');
    expect(within(taskWorkspace).getByRole('button', { name: /返回父任务：上线项目/ })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '任务动态' }));
    expect(await within(taskWorkspace).findByText(/当前显示子任务动态/)).toBeTruthy();

    await user.click(within(taskWorkspace).getByRole('button', { name: /返回父任务：上线项目/ }));
    expect(await within(taskWorkspace).findByText('项目结构')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '任务动态' }));
    expect(await within(taskWorkspace).findByText(/当前显示父任务的项目层任务动态/)).toBeTruthy();
  });

  it('does not ask to switch panel context back to the selected parent when a child task context is already active', async () => {
    const project = buildTask({
      id: 'task_project_panel_parent',
      title: '开发小程序',
      taskType: 'project',
      taskFacets: ['project'],
      childTaskIds: ['task_project_panel_child'],
      state: 'planned',
      updatedAt: '2026-05-13T12:00:00.000Z',
    });
    const child = buildTask({
      id: 'task_project_panel_child',
      title: '小程序需求分析与功能设计',
      parentTaskId: project.id,
      state: 'planned',
      nextStep: '确认需求范围',
      updatedAt: '2026-05-13T12:01:00.000Z',
    });
    const unrelated = buildTask({
      id: 'task_project_panel_unrelated',
      title: 'Packaged jump nav check',
      state: 'waiting_external',
      updatedAt: '2026-04-24T12:00:00.000Z',
    });
    harness.tasks.unshift(child, project, unrelated);
    harness.details[project.id] = buildTaskDetail(project);
    harness.details[child.id] = buildTaskDetail(child);
    harness.details[unrelated.id] = buildTaskDetail(unrelated);
    saveTaskAttributes(project.id, {
      type: 'project',
      typeConfirmed: true,
      childTaskIds: [child.id],
    });
    saveTaskAttributes(child.id, { type: 'simple', typeConfirmed: true, parentTaskId: project.id });
    saveTaskAttributes(unrelated.id, { type: 'simple', typeConfirmed: true });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(screen.getByRole('button', { name: /项目型/ }));
    await user.click(await screen.findByRole('button', { name: '开发小程序' }));

    const taskWorkspace = document.querySelector('.task-list') as HTMLElement;
    const childList = document.querySelector('.project-child-list') as HTMLElement;
    await user.click(await within(childList).findByRole('button', { name: /小程序需求分析与功能设计/ }));
    await user.click(await screen.findByRole('button', { name: /开始执行/ }));
    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();
    expect(screen.getByTitle('离开任务上下文').textContent).toContain('小程序需求分析与功能设计');

    await user.click(within(taskWorkspace).getByRole('button', { name: /返回父任务：开发小程序/ }));

    await waitFor(() => {
      expect(screen.queryByText(/开发小程序.*上下文已可用/)).toBeNull();
    });
    expect(screen.getByTitle('离开任务上下文').textContent).toContain('小程序需求分析与功能设计');

    await user.click(screen.getByRole('button', { name: /一次性任务/ }));
    await user.click(await screen.findByRole('button', { name: /Packaged jump nav check/ }));

    await waitFor(() => {
      const rightPanelText = document.querySelector('.right-panel')?.textContent ?? '';
      expect(rightPanelText).toContain('Packaged jump nav check');
      expect(rightPanelText).toContain('上下文已可用');
    });
    expect(screen.getByTitle('离开任务上下文').textContent).toContain('小程序需求分析与功能设计');
    await user.click(screen.getByRole('button', { name: /切换到此任务/ }));
    const switchedInput = screen.getByPlaceholderText(/关于「Packaged jump nav check」/) as HTMLTextAreaElement;
    expect(switchedInput.value).toBe('');
    expect(screen.getByTitle('离开任务上下文').textContent).toContain('Packaged jump nav check');
    expect(switchedInput.value).not.toContain('开发小程序');
  });

  it('shows only current-node related files in task management', async () => {
    const project = buildTask({
      id: 'task_related_project',
      title: '资料整理项目',
      taskType: 'project',
      taskFacets: ['project'],
      childTaskIds: ['task_related_child'],
      state: 'planned',
      updatedAt: '2026-05-13T12:00:00.000Z',
    });
    const child = buildTask({
      id: 'task_related_child',
      title: '测试评估子任务',
      parentTaskId: project.id,
      state: 'planned',
      updatedAt: '2026-05-13T12:05:00.000Z',
    });
    harness.tasks.unshift(child, project);
    harness.details[project.id] = buildTaskDetail(project);
    harness.details[child.id] = buildTaskDetail(child);
    saveTaskAttributes(project.id, {
      type: 'project',
      typeConfirmed: true,
      childTaskIds: [child.id],
    });
    saveTaskAttributes(child.id, { type: 'simple', typeConfirmed: true, parentTaskId: project.id });
    vi.mocked(harness.api.listTaskFiles).mockImplementation(async (taskId: string) => {
      if (taskId === child.id) {
        return [{
          id: 'child_doc',
          taskId: child.id,
          name: '测试优化方案.md',
          path: 'Artifacts/测试优化方案.md',
          kind: 'file',
          content: '# 测试优化方案',
          createdAt: now,
          updatedAt: now,
        }];
      }
      return [];
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(screen.getByRole('button', { name: /项目型/ }));
    await user.click(await screen.findByRole('button', { name: '资料整理项目' }));

    const relatedSection = document.querySelector('.related-files') as HTMLElement;
    expect(within(relatedSection).getByText('相关文件')).toBeTruthy();
    expect(within(relatedSection).getByRole('tab', { name: /任务说明/ })).toBeTruthy();
    expect(within(relatedSection).queryByRole('tab', { name: /全部/ })).toBeNull();
    expect(within(relatedSection).getByRole('button', { name: /Task.md/ })).toBeTruthy();
    expect(within(relatedSection).queryByRole('button', { name: /测试优化方案/ })).toBeNull();
    expect(within(relatedSection).queryByText('下级任务文件概览')).toBeNull();

    const childList = document.querySelector('.project-child-list') as HTMLElement;
    await user.click(await within(childList).findByRole('button', { name: /测试评估子任务/ }));
    const childRelatedSection = document.querySelector('.related-files') as HTMLElement;
    await user.click(await within(childRelatedSection).findByRole('tab', { name: /任务文件/ }));

    await user.click(await within(childRelatedSection).findByRole('button', { name: /测试优化方案/ }));
    await expectOpenFileKind('文件');
    expect(await screen.findByDisplayValue('# 测试优化方案')).toBeTruthy();
  });

  it('offers a verified handoff to the next project child after completing a subtask', async () => {
    const project = buildTask({
      id: 'task_handoff_project',
      title: '上线项目',
      taskType: 'project',
      taskFacets: ['project'],
      childTaskIds: ['task_handoff_first', 'task_handoff_second'],
      state: 'planned',
      updatedAt: '2026-05-13T12:00:00.000Z',
    });
    const first = buildTask({
      id: 'task_handoff_first',
      title: '1 需求确认',
      parentTaskId: project.id,
      state: 'planned',
      updatedAt: '2026-05-13T12:05:00.000Z',
    });
    const second = buildTask({
      id: 'task_handoff_second',
      title: '2 界面设计',
      parentTaskId: project.id,
      state: 'planned',
      updatedAt: '2026-05-13T12:04:00.000Z',
    });
    harness.tasks.unshift(second, first, project);
    [project, first, second].forEach((task) => {
      harness.details[task.id] = buildTaskDetail(task);
    });
    saveTaskAttributes(project.id, {
      type: 'project',
      typeConfirmed: true,
      childTaskIds: [first.id, second.id],
    });
    saveTaskAttributes(first.id, { type: 'simple', typeConfirmed: true, parentTaskId: project.id });
    saveTaskAttributes(second.id, { type: 'simple', typeConfirmed: true, parentTaskId: project.id });
    vi.mocked(harness.api.chatWithAI!).mockResolvedValueOnce({
      text: '已进入下一项任务，我会先确认第一步和完成标准。',
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(screen.getByRole('button', { name: /项目型/ }));
    await user.click(await screen.findByRole('button', { name: '上线项目' }));
    const taskWorkspace = document.querySelector('.task-list') as HTMLElement;
    const childList = document.querySelector('.project-child-list') as HTMLElement;
    await user.click(await within(childList).findByRole('button', { name: /1 需求确认/ }));
    await user.click(await screen.findByRole('button', { name: '完成' }));
    await user.click(await screen.findByRole('button', { name: '仍然完成' }));

    expect(await screen.findByText('任务已完成')).toBeTruthy();
    expect(screen.getAllByText('2 界面设计').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '进入下一任务' }));

    await waitFor(() => {
      expect(harness.api.transitionTask).toHaveBeenCalledWith({
        id: 'task_handoff_first',
        nextState: 'completed',
        waitingReason: undefined,
      });
      expect(harness.api.createTaskFile).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_handoff_first',
        path: expect.stringMatching(/^Task Records\/\d{4}-\d{2}-\d{2}-completion-handoff\.md$/),
        content: expect.stringContaining('## To'),
      }));
      expect(harness.api.chatWithAI).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_handoff_second',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('现在请切换到下一项任务「2 界面设计」'),
          }),
        ]),
      }));
    });
    expect(await screen.findByText(/已进入下一项任务/)).toBeTruthy();
    expect(screen.queryByText('任务已完成')).toBeNull();
  });

  it('blocks completion handoff when the next child cannot start', async () => {
    const project = buildTask({
      id: 'task_blocked_handoff_project',
      title: '上线项目',
      taskType: 'project',
      taskFacets: ['project'],
      childTaskIds: ['task_blocked_handoff_first', 'task_blocked_handoff_second'],
      state: 'planned',
      updatedAt: '2026-05-13T12:00:00.000Z',
    });
    const first = buildTask({
      id: 'task_blocked_handoff_first',
      title: '1 需求确认',
      parentTaskId: project.id,
      state: 'planned',
      updatedAt: '2026-05-13T12:05:00.000Z',
    });
    const second = buildTask({
      id: 'task_blocked_handoff_second',
      title: '2 界面设计',
      parentTaskId: project.id,
      state: 'planned',
      updatedAt: '2026-05-13T12:04:00.000Z',
      activeBlocker: {
        id: 'blocker_blocked_handoff_second',
        taskId: 'task_blocked_handoff_second',
        title: '等待设计评审',
        kind: 'approval',
        detail: null,
        owner: null,
        responsibility: null,
        responsibilityLabel: null,
        sourceContextId: null,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
      },
    });
    harness.tasks.unshift(second, first, project);
    [project, first, second].forEach((task) => {
      harness.details[task.id] = buildTaskDetail(task);
    });
    saveTaskAttributes(project.id, {
      type: 'project',
      typeConfirmed: true,
      childTaskIds: [first.id, second.id],
    });
    saveTaskAttributes(first.id, { type: 'simple', typeConfirmed: true, parentTaskId: project.id });
    saveTaskAttributes(second.id, { type: 'simple', typeConfirmed: true, parentTaskId: project.id });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(screen.getByRole('button', { name: /项目型/ }));
    await user.click(await screen.findByRole('button', { name: '上线项目' }));
    const childList = document.querySelector('.project-child-list') as HTMLElement;
    await user.click(await within(childList).findByRole('button', { name: /1 需求确认/ }));
    await user.click(await screen.findByRole('button', { name: '完成' }));
    await user.click(await screen.findByRole('button', { name: '仍然完成' }));

    expect(await screen.findByText('任务已完成')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '进入下一任务' }));

    expect(await screen.findByText(/目标任务「2 界面设计」仍有阻塞、依赖或等待状态/)).toBeTruthy();
    expect(harness.api.createTaskFile).not.toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_blocked_handoff_first',
      path: expect.stringMatching(/completion-handoff/),
    }));
    expect(harness.api.chatWithAI).not.toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_blocked_handoff_second',
    }));
  });

  it('blocks completion handoff when the next child lacks enough recovery context', async () => {
    const project = buildTask({
      id: 'task_context_handoff_project',
      title: '上线项目',
      taskType: 'project',
      taskFacets: ['project'],
      childTaskIds: ['task_context_handoff_first', 'task_context_handoff_second'],
      state: 'planned',
      updatedAt: '2026-05-13T12:00:00.000Z',
    });
    const first = buildTask({
      id: 'task_context_handoff_first',
      title: '1 需求确认',
      parentTaskId: project.id,
      state: 'planned',
      updatedAt: '2026-05-13T12:05:00.000Z',
    });
    const second = buildTask({
      id: 'task_context_handoff_second',
      title: '2 界面设计',
      parentTaskId: project.id,
      state: 'planned',
      nextStep: null,
      updatedAt: '2026-05-13T12:04:00.000Z',
    });
    harness.tasks.unshift(second, first, project);
    harness.details[project.id] = buildTaskDetail(project);
    harness.details[first.id] = buildTaskDetail(first);
    harness.details[second.id] = {
      ...buildTaskDetail(second),
      nextStep: null,
      completionCriteria: [],
      taskFiles: [],
    };
    saveTaskAttributes(project.id, {
      type: 'project',
      typeConfirmed: true,
      childTaskIds: [first.id, second.id],
    });
    saveTaskAttributes(first.id, { type: 'simple', typeConfirmed: true, parentTaskId: project.id });
    saveTaskAttributes(second.id, { type: 'simple', typeConfirmed: true, parentTaskId: project.id });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(screen.getByRole('button', { name: /项目型/ }));
    await user.click(await screen.findByRole('button', { name: '上线项目' }));
    const childList = document.querySelector('.project-child-list') as HTMLElement;
    await user.click(await within(childList).findByRole('button', { name: /1 需求确认/ }));
    await user.click(await screen.findByRole('button', { name: '完成' }));
    await user.click(await screen.findByRole('button', { name: '仍然完成' }));

    expect(await screen.findByText('任务已完成')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '进入下一任务' }));

    expect(await screen.findByText(/当前运行时上下文不足以安全开始目标子任务/)).toBeTruthy();
    expect(harness.api.createTaskFile).not.toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_context_handoff_first',
      path: expect.stringMatching(/completion-handoff/),
    }));
    expect(harness.api.chatWithAI).not.toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_context_handoff_second',
    }));
  });

  it('uses project verification before completing a project parent', async () => {
    const project = buildTask({
      id: 'task_project_completion_check',
      title: '产品发布项目',
      taskType: 'project',
      taskFacets: ['project'],
      childTaskIds: ['task_project_done_child', 'task_project_open_child'],
      state: 'planned',
      updatedAt: '2026-05-13T12:00:00.000Z',
    });
    const doneChild = buildTask({
      id: 'task_project_done_child',
      title: '1 需求确认',
      taskType: 'simple',
      taskFacets: ['simple'],
      parentTaskId: project.id,
      childTaskIds: [],
      state: 'completed',
      updatedAt: '2026-05-13T12:01:00.000Z',
    });
    const openChild = buildTask({
      id: 'task_project_open_child',
      title: '2 发布回归',
      taskType: 'simple',
      taskFacets: ['simple'],
      parentTaskId: project.id,
      childTaskIds: [],
      state: 'planned',
      updatedAt: '2026-05-13T12:02:00.000Z',
    });
    harness.tasks.unshift(openChild, doneChild, project);
    harness.details[project.id] = {
      ...buildTaskDetail(project),
      completionCriteria: [],
      resumeCard: {
        ...buildTaskDetail(project).resumeCard,
        completionStatus: { total: 0, satisfied: 0, open: 0, summary: '项目按子任务验收' },
      },
    };
    harness.details[doneChild.id] = buildTaskDetail(doneChild);
    harness.details[openChild.id] = buildTaskDetail(openChild);
    saveTaskAttributes(project.id, {
      type: 'simple',
      typeConfirmed: true,
      childTaskIds: [],
    });
    saveTaskAttributes(doneChild.id, { type: 'project', typeConfirmed: true, parentTaskId: null });
    saveTaskAttributes(openChild.id, { type: 'project', typeConfirmed: true, parentTaskId: null });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(screen.getByRole('button', { name: /项目型/ }));
    await user.click(await screen.findByRole('button', { name: '产品发布项目' }));
    expect(await screen.findByText(/项目仍有 1 个未完成子任务/)).toBeTruthy();
    expect(screen.getByText('项目验证')).toBeTruthy();
    expect(screen.getByText(/项目检查：仍需推进/)).toBeTruthy();

    await user.click(await screen.findByRole('button', { name: '完成' }));

    expect(await screen.findByText('完成确认')).toBeTruthy();
    expect(screen.getAllByText(/项目仍有 1 个未完成子任务/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('项目验证').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/子任务 1\/2/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/项目检查：仍需推进/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '标记等待中' }));

    await waitFor(() => {
      expect(harness.api.recordTaskCompletionCheck).toHaveBeenCalledWith(expect.objectContaining({
        taskId: project.id,
        action: 'marked_waiting',
        criteriaTotal: 2,
        criteriaSatisfied: 1,
        criteriaOpen: 1,
        runVerificationTone: 'pending',
        runVerificationLabel: '项目检查：仍需推进',
        runVerificationDetail: expect.stringContaining('项目仍有 1 个未完成子任务'),
      }));
      expect(harness.api.transitionTask).toHaveBeenCalledWith({
        id: project.id,
        nextState: 'waiting_external',
        waitingReason: expect.stringContaining('项目仍有 1 个未完成子任务'),
      });
    });
    expect(harness.api.transitionTask).not.toHaveBeenCalledWith({
      id: project.id,
      nextState: 'completed',
      waitingReason: undefined,
    });
  });

  it('opens project decomposition in the right panel from task management', async () => {
    const project = buildTask({
      id: 'task_project_review',
      title: '改版项目',
      state: 'planned',
      nextStep: '拆解项目结构',
    });
    harness.tasks.unshift(project);
    harness.details[project.id] = {
      ...buildTaskDetail(project),
      completionCriteria: [],
      sourceContexts: [],
      artifacts: [],
    };

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(screen.getByRole('button', { name: /项目型/ }));
    await user.click(await screen.findByRole('button', { name: '改版项目' }));

    vi.mocked(harness.api.chatWithAI!).mockResolvedValueOnce({
      text: '拆解建议会先在这里讨论，确认后再落成任务结构。',
    });
    await user.click(await screen.findByRole('button', { name: /拆解任务/ }));
    await waitFor(() => {
      expect(harness.api.chatWithAI).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_project_review',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('改版项目'),
          }),
        ]),
      }));
    });
    expect(await screen.findByText(/拆解建议会先在这里讨论/)).toBeTruthy();
    expect(screen.queryByText('AI 拆解草稿')).toBeNull();
    expect(harness.api.decomposeProject).not.toHaveBeenCalled();
  });

  it('uses Plan as the primary action until an ordinary task has execution context', async () => {
    const task = buildTask({
      id: 'task_plain_plan',
      title: '整理一段说明',
      state: 'planned',
      nextStep: '写出说明初稿',
    });
    harness.tasks.unshift(task);
    harness.details[task.id] = {
      ...buildTaskDetail(task),
      completionCriteria: [],
      sourceContexts: [],
      artifacts: [],
    };

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: '整理一段说明' }));
    expect(await screen.findByRole('button', { name: /规划下一步/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开工作台 →' })).toBeNull();

    harness.details[task.id] = {
      ...harness.details[task.id]!,
      completionCriteria: [{
        id: 'criterion_plain',
        taskId: task.id,
        text: '说明初稿完成',
        verificationResponsibility: 'unknown',
        verificationResponsibilityLabel: null,
        status: 'open',
        createdAt: now,
        updatedAt: now,
        satisfiedAt: null,
      }],
    };
    harness.emit('task.changed', task.id);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '开始执行 →' })).toBeTruthy();
    });
  });

  it('clears the selected task when switching task explorer lenses', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    expect(await screen.findByRole('button', { name: /去拍板/ })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /当前建议/ }));

    expect(screen.queryByRole('button', { name: '任务管理' })).toBeNull();
    expect(screen.getByRole('button', { name: '优先处理' })).toBeTruthy();
    expect(screen.getByText('选择任务后显示文件')).toBeTruthy();
  });

  it('keeps the current suggestions count global while selecting a task type node', async () => {
    const user = userEvent.setup();
    const project = buildTask({
      id: 'task_project_count',
      title: '开发小程序',
      nextStep: '推进项目',
    });
    harness.tasks.unshift(project);
    harness.details[project.id] = buildTaskDetail(project);
    saveTaskAttributes(project.id, {
      type: 'project',
      typeConfirmed: true,
    });

    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    const currentSuggestions = () => screen.getByRole('button', { name: /当前建议/ });
    const initialCountText = currentSuggestions().textContent;

    await user.click(screen.getByRole('button', { name: /项目型/ }));
    await user.click(await screen.findByRole('button', { name: '开发小程序' }));

    expect(currentSuggestions().textContent).toBe(initialCountText);
  });

  it('keeps the owning task selected when a task file is open', async () => {
    const user = userEvent.setup();
    const project = buildTask({
      id: 'task_project_file_selection',
      title: '开发小程序',
      nextStep: '推进项目',
    });
    harness.tasks.unshift(project);
    harness.details[project.id] = buildTaskDetail(project);
    saveTaskAttributes(project.id, {
      type: 'project',
      typeConfirmed: true,
    });

    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(screen.getByRole('button', { name: /项目型/ }));
    await user.click(await screen.findByRole('button', { name: '开发小程序' }));
    await user.click(await findTaskFileButton(/Task.md/));

    expect(screen.getByRole('button', { name: '开发小程序' }).className).toContain('active');
    expect(screen.getByRole('button', { name: /项目型/ }).className).not.toContain('active');
  });

  it('persists task file workspace drafts across remounts', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValueOnce('notes.md');
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    await user.click(await findTaskFileButton(/Task.md/));
    const taskRecordEditor = screen.getByDisplayValue(/# Task/) as HTMLTextAreaElement;
    fireEvent.change(taskRecordEditor, { target: { value: '# Task\n\n持久化后的任务摘要' } });
    await user.click(screen.getByRole('button', { name: '保存' }));

    await user.click(screen.getByRole('button', { name: '返回任务' }));
    await createTaskFileViaMenu(user, '普通文件');
    expect(promptSpy).toHaveBeenCalledWith('新建文件名', 'notes.md');
    await user.click(await findTaskFileButton(/notes.md/));
    await expectOpenFileKind('文件');
    const localEditor = document.querySelector('.file-editor') as HTMLTextAreaElement;
    fireEvent.change(localEditor, { target: { value: '本地任务文件内容' } });
    await user.click(screen.getByRole('button', { name: '保存' }));

    cleanup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    await user.click(await findTaskFileButton(/Task.md/));
    expect(await screen.findByDisplayValue(/持久化后的任务摘要/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '返回任务' }));
    const relatedSection = document.querySelector('.related-files') as HTMLElement;
    expect(within(relatedSection).getByRole('tab', { name: /任务文件/ })).toBeTruthy();
    await user.click(await findTaskFileButton(/notes.md/));
    await expectOpenFileKind('文件');
    expect(await screen.findByDisplayValue('本地任务文件内容')).toBeTruthy();
    promptSpy.mockRestore();
  });

  it('keeps reserved task-memory paths out of the ordinary file entrypoint', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValueOnce('Task.md');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    await createTaskFileViaMenu(user, '普通文件');

    expect(promptSpy).toHaveBeenCalledWith('新建文件名', 'notes.md');
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('任务记忆保留路径'));
    expect(harness.api.createTaskFile).not.toHaveBeenCalledWith(expect.objectContaining({
      name: 'Task.md',
    }));
    promptSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('keeps Task Records reserved for the task-record entrypoint', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValueOnce('Task Records/manual.md');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    await createTaskFileViaMenu(user, '普通文件');

    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('任务记忆保留路径'));
    expect(harness.api.createTaskFile).not.toHaveBeenCalledWith(expect.objectContaining({
      name: 'Task Records/manual.md',
    }));
    promptSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('opens the right panel with the current task and selected file context from Tasks', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    await user.click(await findTaskFileButton(/Task.md/));
    await user.click(screen.getByRole('button', { name: /Search or ask/ }));

    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);
    await user.type(input, '请结合当前打开的任务文件说下一步');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.chatWithAI).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
        selectedFile: expect.objectContaining({
          path: 'Task.md',
          kind: 'task_record',
          dirty: false,
          contentPreview: expect.stringContaining('# Task'),
        }),
      }));
    });
  });

  it('syncs Task.md edits back to the structured task record', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    await user.click(await findTaskFileButton(/Task.md/));

    const editor = screen.getByDisplayValue(/# Task/) as HTMLTextAreaElement;
    fireEvent.change(editor, {
      target: {
        value: [
          '# Task',
          '',
          '## Goal',
          '董事会材料修订',
          '',
          '## Current Progress',
          '已完成现金流页更新。',
          '',
          '## Next Step',
          '请法务复核最终版本。',
          '',
          '## Open Questions',
          '- 预算页是否需要 CFO 再确认？',
          '',
        ].join('\n'),
      },
    });
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(harness.api.updateTask).toHaveBeenCalledWith({
        id: 'task_risk',
        summary: '已完成现金流页更新。',
        nextStep: '请法务复核最终版本。',
      });
      expect(harness.api.createTaskFile).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
        name: 'Task.md',
        path: 'Task.md',
        kind: 'file',
        content: expect.stringContaining('预算页是否需要 CFO 再确认？'),
      }));
    });
    await user.click(screen.getByRole('button', { name: '返回任务' }));
    expect(await screen.findByText('已完成现金流页更新。')).toBeTruthy();
    expect(screen.getByText('请法务复核最终版本。')).toBeTruthy();
    await user.click(await findTaskFileButton(/Task.md/));
    expect(await screen.findByDisplayValue(/预算页是否需要 CFO 再确认/)).toBeTruthy();
  });

  it('persists task-file artifact edits through the main artifact API', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValueOnce('notes.md');
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    await createTaskFileViaMenu(user, '产物文件');

    expect(promptSpy).toHaveBeenCalledWith('新建产物文件名', 'notes.md');
    await waitFor(() => {
      expect(harness.api.createManualArtifact).toHaveBeenCalledWith({
        taskId: 'task_risk',
        title: 'notes.md',
        content: '',
      });
    });
    await expectOpenFileKind('产物');

    const editor = document.querySelector('.file-editor') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: '# Notes\n\n持久化产物正文' } });
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(harness.api.updateArtifact).toHaveBeenCalledWith({
        id: 'artifact_manual',
        content: '# Notes\n\n持久化产物正文',
      });
    });
    promptSpy.mockRestore();
  });

  it('lists non-text task files as read-only previews without requiring inline editing', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    await user.click(await findTaskFileButton(/mockup.png/));

    expect(await screen.findByText('Projected artifact')).toBeTruthy();
    expect(screen.getByText('Read-only preview')).toBeTruthy();
    expect(screen.getByText(/非文本或受保护文件不会在 v1 中强制内联编辑/)).toBeTruthy();
    expect((document.querySelector('.file-editor') as HTMLTextAreaElement).readOnly).toBe(true);
  });

  it('guards unsaved file edits before switching tasks', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    await user.click(await findTaskFileButton(/Task.md/));
    const editor = screen.getByDisplayValue(/# Task/) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: '# Task\n\n未保存的任务文件内容' } });

    await user.click(await screen.findByRole('button', { name: /合同盖章跟进/ }));

    expect(await screen.findByText('文件有未保存修改')).toBeTruthy();
    expect(screen.getByText(/先保存、放弃修改，或取消本次切换/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByText('文件有未保存修改')).toBeNull();
    expect(screen.getByDisplayValue(/未保存的任务文件内容/)).toBeTruthy();
  });

  it('can save dirty file edits and continue the requested switch', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    await user.click(await findTaskFileButton(/Task.md/));
    const editor = screen.getByDisplayValue(/# Task/) as HTMLTextAreaElement;
    fireEvent.change(editor, {
      target: {
        value: [
          '# Task',
          '',
          '## Current Progress',
          '切换前保存的进展。',
          '',
          '## Next Step',
          '切换后继续跟进。',
        ].join('\n'),
      },
    });

    await user.click(await screen.findByRole('button', { name: /合同盖章跟进/ }));
    await user.click(await screen.findByRole('button', { name: '保存并继续' }));

    await waitFor(() => {
      expect(harness.api.updateTask).toHaveBeenCalledWith({
        id: 'task_risk',
        summary: '切换前保存的进展。',
        nextStep: '切换后继续跟进。',
      });
    });
    expect(await screen.findByText('合同盖章跟进')).toBeTruthy();
    expect(screen.queryByText('文件有未保存修改')).toBeNull();
  });

  it('surfaces source-context-only task memory as task files', async () => {
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

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByText('来源驱动任务'));
    await user.click(await findTaskFileButton(/会话刷新前保全.md/));

    expect(await screen.findByText('Projected task record')).toBeTruthy();
    await expectOpenFileKind('记录');
    expect(screen.getByDisplayValue(/自学习观察：会话刷新前保全关键决策/)).toBeTruthy();
  });

  it('classifies AI-generated source context projections as AI output files', async () => {
    const user = userEvent.setup();
    const sourceOnlyTask = {
      ...buildTask({ id: 'task_ai_output_source', title: 'AI 产出任务' }),
      summary: null,
      nextStep: null,
      waitingReason: null,
    };
    vi.mocked(harness.api.listTasks).mockResolvedValueOnce([sourceOnlyTask]);
    vi.mocked(harness.api.getTaskDetail).mockImplementation(async (taskId: string) =>
      taskId === 'task_ai_output_source'
        ? {
            ...buildTaskDetail(sourceOnlyTask),
            sourceContexts: [
              {
                ...buildTaskDetail(sourceOnlyTask).sourceContexts[0]!,
                title: 'AI 项目拆解自检',
                kind: 'note',
                uri: null,
                note: '5 个子任务；用户已确认创建。',
                content: '子任务划分自检完成。',
                sourceRole: 'raw',
              },
            ],
          }
        : null);
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByText('AI 产出任务'));
    await user.click(await findTaskFileButton(/AI 项目拆解自检.md/));

    expect(await screen.findByText('Projected AI output')).toBeTruthy();
    await expectOpenFileKind('AI 产出');
  });

  it('projects phase closeout records into Task Records', async () => {
    const user = userEvent.setup();
    const sourceOnlyTask = {
      ...buildTask({ id: 'task_phase_closeout', title: '阶段收尾任务' }),
      summary: null,
      nextStep: null,
      waitingReason: null,
    };
    vi.mocked(harness.api.listTasks).mockResolvedValueOnce([sourceOnlyTask]);
    vi.mocked(harness.api.getTaskDetail).mockImplementation(async (taskId: string) =>
      taskId === 'task_phase_closeout'
        ? {
            ...buildTaskDetail(sourceOnlyTask),
            sourceContexts: [
              {
                ...buildTaskDetail(sourceOnlyTask).sourceContexts[0]!,
                title: '阶段收尾记录',
                note: '任务记录：阶段收尾、质量检查和执行交接。',
                content: '# Record: 阶段收尾\n\n## Next\n- 拆解实现任务',
              },
            ],
          }
        : null);
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByText('阶段收尾任务'));
    await user.click(await findTaskFileButton(/阶段收尾记录.md/));

    await expectOpenFileKind('记录');
    expect(screen.getByDisplayValue(/# Record: 阶段收尾/)).toBeTruthy();
  });

  it('creates task record files under Task Records', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValueOnce('handoff.md');
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    await createTaskFileViaMenu(user, '任务记录');

    expect(promptSpy).toHaveBeenCalledWith('新建任务记录', expect.stringMatching(/^\d{4}-\d{2}-\d{2}-record\.md$/));
    await waitFor(() => {
      expect(harness.api.createTaskFile).toHaveBeenCalledWith({
        taskId: 'task_risk',
        name: 'handoff.md',
        path: 'Task Records/handoff.md',
        kind: 'file',
        content: expect.stringContaining('# Record: handoff'),
      });
    });
    await expectOpenFileKind('记录');
    expect(screen.getByDisplayValue(/## Confirmed/)).toBeTruthy();
    promptSpy.mockRestore();
  });

  it('normalizes nested task-record prompts back under Task Records', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValueOnce('Other/manual.md');
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    await createTaskFileViaMenu(user, '任务记录');

    await waitFor(() => {
      expect(harness.api.createTaskFile).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
        name: 'manual.md',
        path: 'Task Records/manual.md',
        kind: 'file',
      }));
    });
    promptSpy.mockRestore();
  });

  it('lets users resolve conflicting learned work habits from Work Habits', async () => {
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

    await user.click(screen.getByRole('button', { name: /Work Habits/ }));

    expect(await screen.findByText(/与已确认规则冲突/)).toBeTruthy();
    expect(screen.getByText(/待确认规则只作为提议展示，不会自动改变后续执行流程/)).toBeTruthy();
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

  it('lets users suppress a pending work habit proposal from Work Habits', async () => {
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

    await user.click(screen.getByRole('button', { name: /Work Habits/ }));
    await user.click(await screen.findByText('所有外部合作回复都先走人工确认'));
    expect(screen.getByText(/显著流程、步骤顺序或工具选择必须由你确认后才应用/)).toBeTruthy();
    expect(screen.getByText(/待确认提议不会进入后续 AI 提示词/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '以后不再提示' }));

    expect((await screen.findAllByText('已停用')).length).toBeGreaterThan(0);
    expect(screen.getByText(/已停用规则不会进入后续 AI 提示词/)).toBeTruthy();
  });

  it('lets users delete learned work habits from Work Habits', async () => {
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

    await user.click(screen.getByRole('button', { name: /Work Habits/ }));
    expect(await screen.findByText('临时规则可被用户删除')).toBeTruthy();
    await user.click(screen.getByTitle('删除'));

    await waitFor(() => {
      expect(screen.queryByText('临时规则可被用户删除')).toBeNull();
    });
    expect(harness.api.deleteWorkHabit).toHaveBeenCalledWith('habit_delete');
  });

  it('lets users manually add a confirmed work habit from Work Habits', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Work Habits/ }));
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

  it('surfaces repeated completion overrides as a cross-task observation in Work Habits', async () => {
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

    await user.click(screen.getByRole('button', { name: /Work Habits/ }));

    expect(await screen.findByText(/跨任务观察：你经常会在完成检查未全部满足时主动确认够用/)).toBeTruthy();
    expect(screen.getByText(/跨任务观察窗口 · 累计 3 次/)).toBeTruthy();
    expect(screen.getByText(/达到 3 次才作为待确认提议，确认前不应用/)).toBeTruthy();
  });

});
