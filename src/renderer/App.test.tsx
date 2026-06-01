// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { HomeBriefData } from '@shared/types/brief';
import type {
  BusinessLineListItem,
  BusinessLineRecord,
  BusinessLineWorkspace,
} from '@shared/types/business-line';
import type { BlockerRecord } from '@shared/types/blocker';
import type { DecisionRecord } from '@shared/types/decision';
import type { AppEvent } from '@shared/types/events';
import type { ElectronApi } from '@shared/types/ipc';
import type { CompletionCriteriaRecord } from '@shared/types/completion-criteria';
import type { AppliedProcessTemplateRecord, ProcessTemplateRecord } from '@shared/types/process-template';
import type { RunDetailRecord, RunRecord, RunStepRecord } from '@shared/types/run';
import type { AiConfigStatus } from '@shared/types/settings';
import type { TaskDetail, TaskListItemRecord } from '@shared/types/task';
import type { TaskDependencyRecord } from '@shared/types/task-dependency';
import type { TaskFileRecord } from '@shared/types/task-file';
import { createPatchPromotionCheckpointPayload } from '@shared/types/run-checkpoint-payload';
import { buildDefaultAgentToolExecutionPolicy } from '@shared/agent-tool-scaffold';
import type { TaskMemoryGuidanceState } from '@shared/task-memory-guidance-state';
import type { TaskMemoryWriteProposal } from '@shared/task-memory-write-proposal';
import { App } from './App';
import {
  buildProjectDecompositionConfirmationApplyPlan,
  projectDecompositionPromotionEvidenceChips,
  writebackApprovalEvidenceChips,
  writebackApprovalTargetChips,
} from './pages/TasksPage';
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

function buildBusinessLineListItem(partial: Partial<BusinessLineListItem> = {}): BusinessLineListItem {
  return {
    id: partial.id ?? 'business_line_created',
    title: partial.title ?? 'Activation web product',
    summary: partial.summary ?? 'Customer signals, experiments, releases, and activation metrics.',
    goal: partial.goal ?? 'Trial users reach first completed workflow faster.',
    kind: partial.kind ?? 'software_product',
    legacyTaskId: partial.legacyTaskId ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    nextActionCount: partial.nextActionCount ?? 1,
    latestRecordSummary: partial.latestRecordSummary ?? 'Template: Web Product / Software Product',
    activeSkillCount: partial.activeSkillCount ?? 0,
  };
}

function buildBusinessLineWorkspace(partial: Partial<BusinessLineWorkspace> = {}): BusinessLineWorkspace {
  const line = partial.businessLine ?? buildBusinessLineListItem();
  const records = partial.records ?? [{
    id: 'business_line_record_structure',
    type: 'signal',
    businessLineId: line.id,
    source: 'template:web_product:structure',
    summary: 'Structure: Customer/problem signals',
    confidence: 75,
    linkedActionId: null,
    linkedDecisionId: null,
    shouldAffectFutureContext: true,
    createdAt: now,
  } satisfies BusinessLineRecord];
  const nextActions = partial.nextActions ?? [buildTask({
    id: 'task_business_line_initial_action',
    title: 'Capture the current user problem, product surface, and one success metric.',
    businessLineId: line.id,
    nextStep: 'Capture the current user problem, product surface, and one success metric.',
  })];
  return {
    businessLine: {
      id: line.id,
      title: line.title,
      summary: line.summary,
      goal: line.goal,
      kind: line.kind,
      legacyTaskId: line.legacyTaskId,
      createdAt: line.createdAt,
      updatedAt: line.updatedAt,
    },
    overview: {
      nextSuggestion: {
        id: `business-line-progress:${line.id}:${nextActions[0]!.id}`,
        type: 'progress',
        businessLineId: line.id,
        businessLineTitle: line.title,
        whyNow: 'Template creation generated the first next action.',
        expectedImpact: 'Move the business line forward by completing the current next action.',
        effort: { level: 'medium', note: null },
        confidence: 75,
        nextStep: nextActions[0]!.nextStep ?? nextActions[0]!.title,
        sourceRecords: records.map((record) => record.summary),
        sourceRecordIds: records.map((record) => record.id),
        risk: { level: 'low', note: null },
        requiresDecision: false,
        taskId: nextActions[0]!.id,
      },
      recentChanges: records.map((record) => record.summary),
      blockedDecisions: [],
      missingContext: [],
      latestResult: null,
      latestImprovement: null,
    },
    records,
    sourceRecords: partial.sourceRecords ?? [],
    nextActions,
    automations: partial.automations ?? {
      automations: [],
      sensors: [],
    },
    learning: partial.learning ?? {
      reviews: [],
      skillRevisions: [{
        id: 'business_line_skill_revision_created',
        skillId: 'business_line_skill_created',
        businessLineId: line.id,
        scopePath: 'Learning / SOP',
        previousContent: null,
        nextContent: 'Before suggesting product work, check the current outcome and latest customer signal.',
        changeReason: 'Proposed by Web Product / Software Product creation flow.',
        sourceReviewId: 'business_line_review_created',
        approvedBy: null,
        status: 'proposed',
        effectiveAt: null,
        rollbackTargetRevisionId: null,
        createdAt: now,
        updatedAt: now,
      }],
      acceptedSkills: [],
    },
    contextPack: partial.contextPack ?? {
      businessSummary: line.summary,
      currentGoal: line.goal,
      recentChanges: records.map((record) => record.summary),
      activeDecisions: [],
      openNextActions: nextActions,
      latestRecords: records,
      acceptedSkills: [],
      knownConstraints: [],
      permissionBoundaries: [],
      missingContext: [],
    },
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
        status: 'open' as const,
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
    businessLineId: partial.businessLineId ?? null,
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

function buildRunStep(partial: Partial<RunStepRecord> = {}): RunStepRecord {
  return {
    id: partial.id ?? `step_${partial.index ?? 1}`,
    runId: partial.runId ?? 'run_1',
    index: partial.index ?? 0,
    kind: partial.kind ?? 'tool_call',
    status: partial.status ?? 'completed',
    title: partial.title ?? 'Agent CLI 联网调研准备',
    input: partial.input ?? null,
    output: partial.output ?? null,
    error: partial.error ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function buildRunDetail(
  run: RunRecord,
  partial: Partial<RunDetailRecord> = {},
): RunDetailRecord {
  const runWithDetail = run as RunRecord & Partial<Pick<RunDetailRecord, 'steps'>>;
  return {
    ...run,
    artifacts: [],
    checkpoints: [],
    steps: runWithDetail.steps ?? [
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
      lastRunSweepSummary: null,
      lastScheduledEventAgentSweepAt: null,
      lastScheduledEventAgentSweepSummary: null,
      scheduledEventAgentSweepJobConnected: false,
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
    workspaceRoot: '/tmp/taskplane-workspace',
    suggestedWorkspaceRoot: '/tmp/taskplane-workspace',
    updatedAt: now,
    configPath: '/tmp/taskplane-config.json',
    runtimeMode: 'api',
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
    agentCliRuntimeStatus: {
      catalogueCount: 2,
      detectedCount: 1,
      readyCount: 1,
      runningCount: 0,
      errorCount: 0,
      manualRunCount: 1,
      readyManualRunCount: 1,
      updatedAt: '2026-05-19T00:00:00.000Z',
      runtimes: [
        {
          id: 'codex',
          label: 'Codex CLI',
          command: 'codex',
          installed: true,
          version: 'codex 0.42.0',
          authState: 'ready',
          executionSupport: 'manual_run',
          workload: 'idle',
          missingReason: null,
        },
        {
          id: 'claude',
          label: 'Claude Code',
          command: 'claude',
          installed: false,
          version: null,
          authState: 'unknown',
          executionSupport: 'manual_run',
          workload: 'blocked',
          missingReason: 'claude was not found on PATH.',
        },
      ],
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
  const subscribers = new Set<Parameters<ElectronApi['subscribeToEvents']>[0]>();
  let createCounter = 0;
  let taskFileCounter = 0;

  const api: ElectronApi = {
    ping: vi.fn().mockResolvedValue({ message: 'pong', timestamp: now }),
    getAiConfigStatus: vi.fn().mockResolvedValue(buildAiStatus()),
    setAiConfig: vi.fn().mockImplementation(async (input) => buildAiStatus({
      provider: input.provider,
      model: input.model,
      featureFlags: input.featureFlags,
      runtimeMode: input.runtimeMode ?? 'codex',
      workspaceRoot: input.workspaceRoot ?? null,
    })),
    openAgentCliLogin: vi.fn().mockResolvedValue({
      command: 'codex login',
      opened: true,
      runtimeId: 'codex',
      summary: 'Opened Terminal with codex login.',
    }),
    openAgentCliInstall: vi.fn().mockResolvedValue({
      command: 'npm install -g @anthropic-ai/claude-code',
      opened: true,
      runtimeId: 'claude',
      summary: 'Opened Terminal with npm install -g @anthropic-ai/claude-code.',
    }),
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
      businessLineId: null,
      createCount: 1,
      reviewCount: 1,
      skipCount: 0,
      businessLineRecordCandidates: [],
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
      businessLineId: null,
      created: [],
      createdBusinessRecords: [],
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
        taskType: input.taskType,
        taskFacets: input.taskFacets,
        parentTaskId: input.parentTaskId,
        childTaskIds: input.childTaskIds,
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
    createCompletionCriteria: vi.fn().mockImplementation(async (input) => {
      const created: CompletionCriteriaRecord = {
        id: `criteria_${Object.values(details).reduce((count, detail) => count + detail.completionCriteria.length, 0) + 1}`,
        taskId: input.taskId,
        text: input.text,
        verificationResponsibility: input.verificationResponsibility ?? null,
        verificationResponsibilityLabel: input.verificationResponsibilityLabel ?? null,
        status: 'open',
        createdAt: now,
        updatedAt: now,
        satisfiedAt: null,
      };
      if (details[input.taskId]) {
        details[input.taskId] = {
          ...details[input.taskId],
          completionCriteria: [...details[input.taskId].completionCriteria, created],
        };
      }
      return created;
    }),
    updateCompletionCriteria: vi.fn(),
    satisfyCompletionCriteria: vi.fn(),
    reopenCompletionCriteria: vi.fn(),
    createTaskDependency: vi.fn(),
    updateTaskDependency: vi.fn(),
    resolveTaskDependency: vi.fn(),
    createSourceContext: vi.fn().mockImplementation(async (input) => ({
      id: 'source_created',
      taskId: input.taskId,
      businessLineId: input.businessLineId ?? null,
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
        businessLineId: input.businessLineId ?? null,
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
    previewPatchArtifactSandboxReview: vi.fn().mockResolvedValue({
      artifactId: 'artifact_patch_1',
      changedFiles: ['notes.md'],
      checks: ['test', 'lint'],
      decisionTitle: '确认提升 patch artifact：review.patch',
      idempotencyKey: 'sandbox-patch-review:imported_patch_artifact:artifact_patch_1:run_1:task_1:lint,test',
      noWorkspaceFilesWritten: true,
      sourceId: 'artifact_patch_1',
      sourceKind: 'imported_patch_artifact',
      status: 'ready',
      summary: 'Sandbox patch review run plan ready',
      taskId: 'task_risk',
      workspaceRoot: '/tmp/taskplane-workspace',
    }),
    runPatchArtifactSandboxReview: vi.fn().mockResolvedValue({
      artifactId: 'artifact_patch_1',
      checkpointId: 'run_checkpoint_patch_1',
      decisionId: 'decision_patch_1',
      noWorkspaceFilesWritten: true,
      reviewedArtifactId: 'artifact_patch_reviewed_1',
      runId: 'run_review_1',
      status: 'completed',
      summary: 'Sandbox patch review completed / no workspace files written',
      taskId: 'task_risk',
    }),
    applySandboxPatchPromotion: vi.fn().mockResolvedValue({
      auditSummary: 'Sandbox patch promotion applied / checkpoint=run_checkpoint_patch_1 / files=notes.md',
      promotion: {
        id: 'sandbox_patch_promotion_1',
        checkpointId: 'run_checkpoint_patch_1',
        runId: 'run_review_1',
        taskId: 'task_risk',
        artifactId: 'artifact_patch_reviewed_1',
        sourceId: 'sandbox_1',
        decisionId: 'decision_patch_1',
        patchDigest: 'sha256:abc',
        expectedFiles: ['notes.md'],
        status: 'applied',
        auditSummary: 'Sandbox patch promotion applied / checkpoint=run_checkpoint_patch_1 / files=notes.md',
        blockedReasons: [],
        createdAt: now,
        updatedAt: now,
        appliedAt: now,
      },
      status: 'applied',
      touchedFiles: ['notes.md'],
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
    listBusinessLines: vi.fn().mockResolvedValue([]),
    createBusinessLine: vi.fn().mockImplementation(async (input) => buildBusinessLineWorkspace({
      businessLine: buildBusinessLineListItem({
        id: 'business_line_created',
        title: input.title,
        summary: input.summary ?? null,
        goal: input.goal ?? null,
        kind: input.kind ?? 'general',
      }),
    })),
    createBusinessLineRecord: vi.fn().mockImplementation(async (input) => ({
      id: 'business_line_record_context_refresh',
      type: input.type,
      businessLineId: input.businessLineId ?? 'business_line_created',
      source: input.source,
      summary: input.summary,
      confidence: input.confidence ?? 75,
      linkedActionId: input.linkedActionId ?? input.sourceActionId ?? null,
      linkedDecisionId: input.linkedDecisionId ?? null,
      shouldAffectFutureContext: input.shouldAffectFutureContext ?? true,
      createdAt: now,
    } satisfies BusinessLineRecord)),
    getBusinessLineWorkspace: vi.fn().mockResolvedValue(null),
    recordBusinessLineReview: vi.fn(),
    acceptBusinessLineSkillRevision: vi.fn(),
    rejectBusinessLineSkillRevision: vi.fn(),
    disableBusinessLineSkillRevision: vi.fn(),
    rollbackBusinessLineSkillRevision: vi.fn(),
    listRuns: vi.fn().mockResolvedValue(runs),
    getRunDetail: vi.fn().mockImplementation(async (runId) => {
      const run = runs.find((item) => item.id === runId);
      return run ? buildRunDetail(run) : null;
    }),
    triggerRun: vi.fn().mockImplementation(async (input) => buildRun({
      businessLineId: input.businessLineId ?? null,
      id: 'run_created',
      taskId: input.taskId,
      type: input.type,
    })),
    triggerAgentCliRun: vi.fn().mockImplementation(async (input) => {
      const run = buildRun({
        businessLineId: input.businessLineId ?? null,
        id: 'run_agent_cli_created',
        output: null,
        outputSource: null,
        status: 'running',
        taskId: input.taskId,
        type: 'agent',
      });
      runs.push(run);
      return run;
    }),
    triggerScheduledEventAgentRun: vi.fn().mockImplementation(async (input) => {
      const run = buildRun({
        id: 'run_scheduled_event_agent',
        output: null,
        outputSource: null,
        status: 'running',
        taskId: input.taskId,
        type: 'agent',
      });
      runs.push(run);
      return {
        status: 'started',
        plan: {
          status: 'ready',
          triggerPlanReady: true,
          runtimeStartAllowed: true,
          schedulerTriggerServiceConnected: true,
          triggerRunEvidenceRequired: [
            'context_readiness',
            'target_task_identity',
            'task_memory_coverage',
          ],
          policy: null,
          runLimit: {
            maxRunsPerDay: 3,
            runsStartedToday: 0,
          },
          readiness: {},
          standingApproval: {},
          blockedReasons: [],
          evidence: [],
          summary: 'Scheduled/event trigger plan / status=ready',
        },
        run,
        terminalRunEvidenceStatus: 'pending',
        triggerRunEvidenceStatus: 'pending_terminal_run_evidence',
        summary: 'Scheduled/event trigger plan / trigger=started / runId=run_scheduled_event_agent',
      };
    }),
    recordRuntimeNativeGoalRequest: vi.fn().mockImplementation(async (input) => {
      const run = buildRun({
        id: 'run_native_goal_audit',
        output: 'Runtime-native goal request recorded without forwarding.',
        outputSource: 'system',
        status: 'completed',
        taskId: input.taskId,
        type: 'agent',
      });
      runs.push(run);
      return run;
    }),
    cancelAgentCliRun: vi.fn().mockResolvedValue({
      cancelled: true,
      reason: 'Operator cancelled the Codex CLI run from asterism.',
      runId: 'run_agent_cli_created',
      summary: 'Agent CLI cancellation requested for run_agent_cli_created.',
    }),
    continuePausedRun: vi.fn(),
    subscribeToEvents: vi.fn().mockImplementation((listener) => {
      subscribers.add(listener);
      return () => { subscribers.delete(listener); };
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
      evidenceRunId: 'agent_api_decomposition:task_project',
      invocation: {
        phase: 'decomposition_draft',
        layer: 'api_runtime',
        runtime: {
          mode: 'api',
          label: 'Agent API Runtime 规划',
          provider: 'openai',
        },
        status: 'completed',
        summary: '已生成 2 个项目子任务草稿。',
      },
      promotionReadiness: {
        ready: true,
        summary: 'Agent API decomposition promotion readiness / ready=yes / promotionReady=yes / requirements=7/7 / promotionRequirements=7/7 / selectedRuntimeContract=ready / parentTask=task_project / applyPlanParentTask=task_project / parentTaskEvidenceChain=ready / proposalCard=ready / applyPlan=subtask.create_many / source=agent_api_decomposition / sourceEvidenceChain=ready / proposalId=project_decomposition:task_project / expectedProposalId=project_decomposition:task_project / proposalIdEvidenceChain=ready / proposalParentTask=task_project / proposalTaskEvidenceChain=ready / proposalSubtaskCount=2 / applyPlanSubtaskCount=2 / proposalSubtaskEvidenceChain=ready / proposalSubtaskTitles=需求确认|原型验收 / applyPlanSubtaskTitles=需求确认|原型验收 / proposalSubtaskIdentityChain=ready / subtaskCount=2 / evidenceRunId=agent_api_decomposition:task_project / timelineEvidenceRunId=agent_api_decomposition:task_project / evidenceRunIdChain=ready / confirmationBoundary=operator_confirmed_subtask_create_many / draftOnlyBeforeConfirmation=true / runtimeMode=api / invocationLayer=api_runtime / selectedRuntimeProvider=openai / selectedRuntimeProviderEvidenceChain=ready / timelineRuntimeMode=api / timelineInvocationLayer=api_runtime / timelineInvocationPhase=decomposition_draft / timelineRuntimeProvider=openai / selectedRuntimeEvidenceChain=ready / missingRequirements=none / promotionMissingRequirements=none / missing=none',
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
    }),
  };

  api.applyTaskplaneWriteback = vi.fn().mockImplementation(async ({ plan, taskId }) => {
    if (plan.action === 'task_file.create') {
      await api.createTaskFile(plan.input);
      return { action: plan.action, status: 'completed', successMessage: plan.successMessage, updatedTask: null };
    }
    if (plan.action === 'task_file.update') {
      await api.updateTaskFile(plan.input);
      return { action: plan.action, status: 'completed', successMessage: plan.successMessage, updatedTask: null };
    }
    if (plan.action === 'source_context.create') {
      await api.createSourceContext(plan.input);
      return { action: plan.action, status: 'completed', successMessage: plan.successMessage, updatedTask: null };
    }
    if (plan.action === 'artifact.create_note_from_run') {
      await api.createManualArtifact({
        businessLineId: plan.input.businessLineId ?? null,
        content: plan.input.content,
        taskId: plan.input.taskId,
        title: plan.input.title,
      });
      return { action: plan.action, status: 'completed', successMessage: plan.successMessage, updatedTask: null };
    }
    if (plan.action === 'decision.create' || plan.action === 'completion_decision.create') {
      await api.createDecision(plan.input);
      return { action: plan.action, status: 'completed', successMessage: plan.successMessage, updatedTask: null };
    }
    if (plan.action === 'task.update_next_step') {
      const updatedTask = await api.updateTask(plan.input);
      return { action: plan.action, status: 'completed', successMessage: plan.successMessage, updatedTask };
    }
    if (plan.action === 'blocker.create') {
      await api.createBlocker(plan.input);
      return { action: plan.action, status: 'completed', successMessage: plan.successMessage, updatedTask: null };
    }
    const parent = await api.updateTask({
      id: plan.input.parentTaskId,
      nextStep: plan.input.nextStep ?? undefined,
      summary: plan.input.parentSummary ?? undefined,
      taskType: 'project',
      taskFacets: ['project'],
    });
    const createdTasks = [];
    for (const subtask of plan.input.subtasks) {
      const created = await api.createTask({
        parentTaskId: plan.input.parentTaskId,
        summary: [
          subtask.summary,
          subtask.acceptanceCriteria ? `验收：${subtask.acceptanceCriteria}` : null,
          subtask.dependency ? `依赖：${subtask.dependency}` : null,
        ].filter(Boolean).join('\n'),
        taskFacets: ['simple'],
        taskType: 'simple',
        title: subtask.title,
      });
      createdTasks.push(await api.transitionTask({ id: created.id, nextState: 'planned' }));
    }
    return {
      action: plan.action,
      createdTasks,
      status: 'completed',
      successMessage: plan.successMessage,
      updatedTask: parent,
    };
  });

  return {
    api,
    tasks,
    details,
    decisions,
    runs,
    taskFiles,
    emit: (type: AppEvent['type'], entityId?: string) => {
      for (const subscriber of subscribers) {
        subscriber({ type, entityId, at: now });
      }
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

  it('projects decomposition promotion parent-chain evidence chips', () => {
    const chips = projectDecompositionPromotionEvidenceChips({
      ready: true,
      summary: 'Agent API decomposition promotion readiness / ready=yes / proposalId=project_decomposition:task_project / expectedProposalId=project_decomposition:task_project / proposalIdEvidenceChain=ready / proposalParentTask=task_project / proposalTaskEvidenceChain=ready / proposalSubtaskCount=2 / applyPlanSubtaskCount=2 / proposalSubtaskEvidenceChain=ready / proposalSubtaskTitles=需求确认|原型验收 / applyPlanSubtaskTitles=需求确认|原型验收 / proposalSubtaskTitleEvidenceChain=ready / applyPlanSubtaskTitleEvidenceChain=ready / proposalSubtaskUniqueChain=ready / proposalSubtaskSummaries=确认用户目标|验收交互原型 / applyPlanSubtaskSummaries=确认用户目标|验收交互原型 / proposalSubtaskSummaryEvidenceChain=ready / applyPlanSubtaskSummaryEvidenceChain=ready / proposalAcceptanceCriteria=目标已记录|原型可验收 / applyPlanAcceptanceCriteria=目标已记录|原型可验收 / proposalAcceptanceCriteriaEvidenceChain=ready / applyPlanAcceptanceCriteriaEvidenceChain=ready / proposalDependencies=none|需求确认 / applyPlanDependencies=none|需求确认 / proposalDependencyEvidenceChain=ready / applyPlanDependencyEvidenceChain=ready / proposalSubtaskIdentityChain=ready / parentTask=task_project / applyPlanParentTask=task_project / parentTaskEvidenceChain=ready / subtaskCount=2 / evidenceRunId=agent_api_decomposition:task_project / timelineEvidenceRunId=agent_api_decomposition:task_project / sourceEvidenceChain=ready / evidenceRunIdChain=ready / confirmationBoundary=operator_confirmed_subtask_create_many / draftOnlyBeforeConfirmation=true / runtimeMode=api / invocationLayer=api_runtime / selectedRuntimeEvidenceRunId=agent_api_decomposition:task_project / selectedRuntimeEvidenceRunChain=ready / selectedRuntimeParentTask=task_project / selectedRuntimeParentTaskEvidenceChain=ready / selectedRuntimeProvider=openai / selectedRuntimeProviderEvidenceChain=ready / providerConfigured=ready / configuredProvider=openai / configuredProviderEvidenceChain=ready / timelineRuntimeMode=api / timelineInvocationLayer=api_runtime / timelineInvocationPhase=decomposition_draft / timelineRuntimeEvidenceRunId=agent_api_decomposition:task_project / timelineRuntimeParentTask=task_project / timelineRuntimeProvider=openai / selectedRuntimeEvidenceChain=ready',
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
    });

    expect(chips).toContain('proposalParentTask=task_project');
    expect(chips).toContain('expectedProposalId=project_decomposition:task_project');
    expect(chips).toContain('proposalIdEvidenceChain=ready');
    expect(chips).toContain('proposalTaskEvidenceChain=ready');
    expect(chips).toContain('proposalSubtaskCount=2');
    expect(chips).toContain('applyPlanSubtaskCount=2');
    expect(chips).toContain('proposalSubtaskEvidenceChain=ready');
    expect(chips).toContain('proposalSubtaskTitles=需求确认|原型验收');
    expect(chips).toContain('applyPlanSubtaskTitles=需求确认|原型验收');
    expect(chips).toContain('proposalSubtaskTitleEvidenceChain=ready');
    expect(chips).toContain('applyPlanSubtaskTitleEvidenceChain=ready');
    expect(chips).toContain('proposalSubtaskUniqueChain=ready');
    expect(chips).toContain('proposalSubtaskSummaries=确认用户目标|验收交互原型');
    expect(chips).toContain('applyPlanSubtaskSummaries=确认用户目标|验收交互原型');
    expect(chips).toContain('proposalSubtaskSummaryEvidenceChain=ready');
    expect(chips).toContain('applyPlanSubtaskSummaryEvidenceChain=ready');
    expect(chips).toContain('proposalAcceptanceCriteria=目标已记录|原型可验收');
    expect(chips).toContain('applyPlanAcceptanceCriteria=目标已记录|原型可验收');
    expect(chips).toContain('proposalAcceptanceCriteriaEvidenceChain=ready');
    expect(chips).toContain('applyPlanAcceptanceCriteriaEvidenceChain=ready');
    expect(chips).toContain('proposalDependencies=none|需求确认');
    expect(chips).toContain('applyPlanDependencies=none|需求确认');
    expect(chips).toContain('proposalDependencyEvidenceChain=ready');
    expect(chips).toContain('applyPlanDependencyEvidenceChain=ready');
    expect(chips).toContain('proposalSubtaskIdentityChain=ready');
    expect(chips).toContain('applyPlanParentTask=task_project');
    expect(chips).toContain('parentTaskEvidenceChain=ready');
    expect(chips).toContain('timelineEvidenceRunId=agent_api_decomposition:task_project');
    expect(chips).toContain('sourceEvidenceChain=ready');
    expect(chips).toContain('evidenceRunIdChain=ready');
    expect(chips).toContain('selectedRuntimeProvider=openai');
    expect(chips).toContain('selectedRuntimeProviderEvidenceChain=ready');
    expect(chips).toContain('selectedRuntimeEvidenceRunId=agent_api_decomposition:task_project');
    expect(chips).toContain('selectedRuntimeEvidenceRunChain=ready');
    expect(chips).toContain('selectedRuntimeParentTask=task_project');
    expect(chips).toContain('selectedRuntimeParentTaskEvidenceChain=ready');
    expect(chips).toContain('providerConfigured=ready');
    expect(chips).toContain('configuredProvider=openai');
    expect(chips).toContain('configuredProviderEvidenceChain=ready');
    expect(chips).toContain('timelineRuntimeMode=api');
    expect(chips).toContain('timelineInvocationLayer=api_runtime');
    expect(chips).toContain('timelineInvocationPhase=decomposition_draft');
    expect(chips).toContain('timelineRuntimeEvidenceRunId=agent_api_decomposition:task_project');
    expect(chips).toContain('timelineRuntimeParentTask=task_project');
    expect(chips).toContain('timelineRuntimeProvider=openai');
    expect(chips).toContain('selectedRuntimeEvidenceChain=ready');
  });

  it('projects scheduler Decision approval evidence chips', () => {
    const chips = writebackApprovalEvidenceChips({
      detail: [
        '确认调度策略。',
        'Scheduler Decision proposal contract',
        'proposalReady=yes',
        'approvalItemAllowed=true',
        'approvalQueueSurface=task_dynamics',
        'approvalQueueSurfaceReady=yes',
        'decisionPayload=ready',
        'decisionTitleKey=confirm_scheduler_action',
        'decisionOptionKeys=approve,hold',
        'decisionOptionIdentity=ready',
        'decisionProposedOutcomeKey=approve',
        'decisionProposedOutcomeMatchesOption=yes',
        'targetTask=task_scheduler',
        'authorizationCount=1',
        'authorization=standing_approval',
        'authorizationEvidenceChain=ready',
        'operatorId=missing',
        'localRecoveryRunId=missing',
        'localRecoveryTask=missing',
        'localRecoveryCompleted=no',
        'localRecoveryTaskMatched=no',
        'standingApprovalPolicyId=standing_policy_1',
        'standingApprovalScopeTask=task_scheduler',
        'standingApprovalActive=yes',
        'standingApprovalScopeMatched=yes',
        'decisionPersistenceAllowed=false',
        'writebackDispatchAllowed=false',
        'schedulerTriggerAllowed=false',
      ].join(' / '),
      id: 'writeback:run_scheduler:scheduler_decision:confirm',
      kind: 'scheduler_decision',
      plan: {
        action: 'decision.create',
        input: {
          context: {
            whyNow: '确认调度策略。',
          },
          options: [{ id: 'option_1', label: 'Approve' }],
          recommendation: {
            label: 'Approve',
            reason: '确认调度策略。',
          },
          sourceId: 'run_scheduler',
          sourceLabel: 'Scheduler/background Decision proposal',
          sourceType: 'run',
          taskId: 'task_scheduler',
          title: 'Confirm scheduler action',
        },
        requiredApi: 'createDecision',
        successMessage: 'Decision 已创建。',
      },
      runId: 'run_scheduler',
      source: 'scheduler_decision_proposal',
      summary: '已通过 Task Dynamics 队列、目标任务身份和授权检查；确认后创建 Decision。',
      taskId: 'task_scheduler',
      title: '调度决策提案：Confirm scheduler action',
    });

    expect(chips).toContain('proposalReady=yes');
    expect(chips).toContain('approvalItemAllowed=true');
    expect(chips).toContain('approvalQueueSurface=task_dynamics');
    expect(chips).toContain('decisionPayload=ready');
    expect(chips).toContain('decisionTitleKey=confirm_scheduler_action');
    expect(chips).toContain('decisionOptionKeys=approve,hold');
    expect(chips).toContain('decisionProposedOutcomeMatchesOption=yes');
    expect(chips).toContain('targetTask=task_scheduler');
    expect(chips).toContain('authorization=standing_approval');
    expect(chips).toContain('authorizationEvidenceChain=ready');
    expect(chips).toContain('standingApprovalPolicyId=standing_policy_1');
    expect(chips).toContain('standingApprovalScopeMatched=yes');
    expect(chips).toContain('decisionPersistenceAllowed=false');
    expect(chips).toContain('writebackDispatchAllowed=false');
    expect(chips).toContain('schedulerTriggerAllowed=false');
  });

  it('renders the redesigned navigation zones and keeps the external signal hint visible', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('button', { name: /Today/ })).toBeTruthy();
    expect(screen.getByText('Work')).toBeTruthy();
    expect(screen.getByText('Capabilities')).toBeTruthy();
    expect(screen.getByText('asterism')).toBeTruthy();
    expect(screen.getByTitle(/搜索、提问或捕获任务想法/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Business/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chat' })).toBeTruthy();
    expect(within(screen.getByRole('navigation')).getByRole('button', { name: 'Legacy Tasks' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Legacy Tasks Explorer/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Runs/ })).toBeNull();
    expect(await screen.findByText('外部信号')).toBeTruthy();
    expect(screen.getByText(/与业务线 Next Actions 共用/)).toBeTruthy();
    expect(screen.getAllByText(/入选依据/).length).toBeGreaterThan(0);
    expect(screen.getByText('暂无外部信号。')).toBeTruthy();
    expect(screen.getByText(/等待你确认是否长成任务/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /External Access/ }));
    expect(await screen.findByText('连接器状态')).toBeTruthy();
    expect(screen.getByText('仅手动')).toBeTruthy();
    expect(screen.getByText('先质检，再确认')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Legacy Tasks' }));
    expect(await screen.findByText('Legacy Tasks', { selector: '.current' })).toBeTruthy();
  });

  it('opens full Chat with context and writeback target, and keeps fixed sidebar navigation', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Chat' }));
    expect(await screen.findByText('Context: Global')).toBeTruthy();
    expect(screen.getByText('Writeback: Global / capture proposal')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Focus chat' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Compact sidebar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Focus sidebar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Expand sidebar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'External Access' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'AI Runtime' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chat' })).toBeTruthy();
  });

  it('keeps the active right-panel session when moving into full Chat', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTitle('AI 对话（⌘K）'));
    const dockedInput = await screen.findByPlaceholderText(/搜索、提问或捕获任务想法/) as HTMLTextAreaElement;
    await user.type(dockedInput, 'Preserve this pending writeback');

    await user.click(screen.getByRole('button', { name: 'Chat' }));

    const chatInput = await screen.findByPlaceholderText(/搜索、提问或捕获任务想法/) as HTMLTextAreaElement;
    expect(chatInput.value).toBe('Preserve this pending writeback');
    expect(document.querySelectorAll('.right-panel').length).toBe(1);
    expect(screen.getByText('Writeback: Global / capture proposal')).toBeTruthy();
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
    homeBrief.recommendedActions.push({
      id: 'hidden_queue_action',
      label: '隐藏队列项',
      reason: '完整队列里还有其他任务，但 Brief 不直接展示。',
      taskId: 'hidden_task',
      priority: 'medium',
      lane: 'continue_or_review',
    });
    vi.mocked(harness.api.getHomeBrief).mockResolvedValueOnce(homeBrief);

    render(<App />);

    expect(await screen.findByText('证据复核任务')).toBeTruthy();
    expect(screen.getByText(/显示前 1\/7 件/)).toBeTruthy();
    expect(screen.getByText(/Today 只做今日注意力摘要/)).toBeTruthy();
    expect(screen.getByText(/入选依据：有新的来源或产出可能影响下一步/)).toBeTruthy();
    const records = JSON.parse(window.localStorage.getItem('taskplane.systemBrief.records.v1') ?? '[]') as Array<{
      payload: { reasonCount: number };
    }>;
    expect(records[0]?.payload.reasonCount).toBe(1);

    expect(harness.api.getHomeBrief).toHaveBeenCalled();
  });

  it('renders Today suggestions with business line trust metadata', async () => {
    const homeBrief = buildBriefData(harness.tasks, harness.decisions);
    homeBrief.businessLineSuggestions = [{
      id: 'business-line-progress:business_line_task_product:task_product',
      type: 'progress',
      businessLineId: 'business_line_task_product',
      businessLineTitle: 'GoalPilot product',
      whyNow: 'Accepted learning changed the next recommendation.',
      expectedImpact: 'Move the business line forward by completing the current next action.',
      effort: { level: 'medium', note: 'One focused execution step.' },
      confidence: 82,
      nextStep: 'Update Today suggestion trust layer.',
      sourceRecords: ['review: navigation model changed', 'rule: anchor to learning loop'],
      sourceRecordIds: ['review:business_line_review_navigation'],
      risk: {
        level: 'medium',
        note: 'Touches navigation model',
      },
      requiresDecision: true,
      taskId: 'task_risk',
    }];
    vi.mocked(harness.api.getHomeBrief).mockResolvedValueOnce(homeBrief);

    render(<App />);

    expect(await screen.findByText('业务线建议')).toBeTruthy();
    expect(screen.getByText('GoalPilot product')).toBeTruthy();
    expect(screen.getByText('Update Today suggestion trust layer.')).toBeTruthy();
    expect(screen.getByText('Accepted learning changed the next recommendation.')).toBeTruthy();
    expect(screen.getByText(/Impact: Move the business line forward/)).toBeTruthy();
    expect(screen.getByText(/Effort: medium/)).toBeTruthy();
    expect(screen.getByText(/Confidence 82/)).toBeTruthy();
    expect(screen.getByText('review: navigation model changed')).toBeTruthy();
    expect(screen.queryByText(/Source ids: review:business_line_review_navigation/)).toBeNull();
    expect(screen.getByText('medium')).toBeTruthy();
    expect(screen.getByText('Decision')).toBeTruthy();
  });

  it('creates a Web Product business line from the creation template and opens it in the list workspace', async () => {
    const user = userEvent.setup();
    const createdLine = buildBusinessLineListItem({
      id: 'business_line_activation',
      title: 'Activation web product',
      latestRecordSummary: 'Custom launch record',
    });
    const createdWorkspace = buildBusinessLineWorkspace({
      businessLine: createdLine,
      records: [{
        id: 'business_line_record_created_custom',
        type: 'signal',
        businessLineId: createdLine.id,
        source: 'template:web_product:record',
        summary: 'Custom launch record',
        confidence: 75,
        linkedActionId: null,
        linkedDecisionId: null,
        shouldAffectFutureContext: true,
        createdAt: now,
      }],
    });
    vi.mocked(harness.api.listBusinessLines!)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createdLine]);
    vi.mocked(harness.api.createBusinessLine!).mockResolvedValueOnce(createdWorkspace);
    vi.mocked(harness.api.getBusinessLineWorkspace!).mockResolvedValue(createdWorkspace);
    window.location.hash = 'business';

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '新建' }));
    await user.type(screen.getByLabelText('What is this business line?'), 'Activation web product');
    await user.type(
      screen.getByLabelText('What outcome would make it better?'),
      'Trial users reach first completed workflow faster.',
    );
    await user.type(
      screen.getByLabelText('What information must be recorded continuously?'),
      'Customer signals, experiments, releases, and activation metrics.',
    );
    await user.type(
      screen.getByLabelText('What work can AI do, and what needs confirmation?'),
      'AI drafts specs and release notes; publish, deploy, and pricing require approval.',
    );
    await user.click(screen.getByRole('button', { name: '生成初始结构' }));
    await user.clear(screen.getByLabelText('Initial records'));
    await user.type(screen.getByLabelText('Initial records'), 'Custom launch record');
    await user.click(screen.getByRole('button', { name: '创建业务线' }));

    await waitFor(() => {
      expect(harness.api.createBusinessLine).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Activation web product',
        template: 'web_product',
        kind: 'software_product',
        desiredOutcome: 'Trial users reach first completed workflow faster.',
        continuousInformation: 'Customer signals, experiments, releases, and activation metrics.',
        aiWorkAndConfirmation: 'AI drafts specs and release notes; publish, deploy, and pricing require approval.',
        initialRecords: ['Custom launch record'],
        proposedSops: expect.arrayContaining([
          expect.stringContaining('Before suggesting product work'),
        ]),
      }));
    });
    expect((await screen.findAllByText('Custom launch record')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Activation web product').length).toBeGreaterThan(0);
    expect(screen.getByText('Capture the current user problem, product surface, and one success metric.')).toBeTruthy();
  });

  it('shows explicit source business line reference when creation reuses another business line', async () => {
    const user = userEvent.setup();
    const sourceLine = buildBusinessLineListItem({
      id: 'business_line_source_reuse',
      title: 'Source product loop',
    });
    const createdLine = buildBusinessLineListItem({
      id: 'business_line_target_reuse',
      title: 'Target product loop',
    });
    const createdWorkspace = buildBusinessLineWorkspace({
      businessLine: createdLine,
    });
    vi.mocked(harness.api.listBusinessLines!)
      .mockResolvedValueOnce([sourceLine])
      .mockResolvedValueOnce([sourceLine, createdLine]);
    vi.mocked(harness.api.createBusinessLine!).mockResolvedValueOnce(createdWorkspace);
    vi.mocked(harness.api.getBusinessLineWorkspace!).mockResolvedValue(createdWorkspace);
    window.location.hash = 'business';

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '新建' }));
    await user.type(screen.getByLabelText('What is this business line?'), 'Target product loop');
    await user.selectOptions(
      screen.getByLabelText("Is this based on an existing business line's structure or experience?"),
      sourceLine.id,
    );

    expect(screen.getByText('Source business line: Source product loop')).toBeTruthy();
    expect(screen.getByText(/copied as source evidence or proposed learning only/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '创建业务线' }));

    await waitFor(() => {
      expect(harness.api.createBusinessLine).toHaveBeenCalledWith(expect.objectContaining({
        sourceBusinessLineId: sourceLine.id,
      }));
    });
  });

  it('renders business Records as a provenance-backed memory surface', async () => {
    const user = userEvent.setup();
    const line = buildBusinessLineListItem({
      id: 'business_line_memory_surface',
      title: 'Memory surface product',
    });
    const workspace = buildBusinessLineWorkspace({
      businessLine: line,
      records: [
        {
          id: 'source_context:source_key_signal',
          type: 'signal',
          businessLineId: line.id,
          source: 'source_context:source_key_signal',
          summary: 'Verified signal: Customer success asked for faster onboarding.',
          confidence: 90,
          linkedActionId: 'task_memory_action',
          linkedDecisionId: null,
          shouldAffectFutureContext: true,
          futureContextReason: 'Source context is active and marked key, so it is included in default future context.',
          provenance: {
            sourceType: 'source_context',
            sourceId: 'source_key_signal',
            sourceLabel: 'Verified signal',
            taskId: 'task_memory_action',
          },
          createdAt: now,
        },
        {
          id: 'artifact:artifact_run_output',
          type: 'result',
          businessLineId: line.id,
          source: 'artifact:artifact_run_output',
          summary: 'draft output: Run output stays visible but not in default context.',
          confidence: 70,
          linkedActionId: 'task_memory_action',
          linkedDecisionId: null,
          shouldAffectFutureContext: false,
          futureContextReason: 'Artifacts are projected into Records but excluded from default future context until promoted.',
          provenance: {
            sourceType: 'artifact',
            sourceId: 'artifact_run_output',
            sourceLabel: 'draft output',
            taskId: 'task_memory_action',
          },
          createdAt: now,
        },
      ],
    });
    vi.mocked(harness.api.listBusinessLines!).mockResolvedValue([line]);
    vi.mocked(harness.api.getBusinessLineWorkspace!).mockResolvedValue(workspace);
    window.location.hash = 'business';

    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Records' }));

    expect(screen.getByText('Verified signal: Customer success asked for faster onboarding.')).toBeTruthy();
    expect(screen.getByText(/Verified signal · source_context · confidence 90/)).toBeTruthy();
    expect(screen.getByText('future context')).toBeTruthy();
    expect(screen.getByText(/included in default future context/)).toBeTruthy();
    expect(screen.getByText('draft output: Run output stays visible but not in default context.')).toBeTruthy();
    expect(screen.getByText(/draft output · artifact · confidence 70/)).toBeTruthy();
    expect(screen.getByText('memory only')).toBeTruthy();
    expect(screen.getByText(/excluded from default future context/)).toBeTruthy();
  });

  it('shows business-line automations and read-only external sensors without capability matrices', async () => {
    const line = buildBusinessLineListItem({
      id: 'business_line_automation',
      title: 'Automation product',
    });
    const workspace = buildBusinessLineWorkspace({
      businessLine: line,
      automations: {
        automations: [{
          id: 'automation_task_gmail_watch',
          businessLineId: line.id,
          taskId: 'task_gmail_watch',
          kind: 'scheduled',
          title: 'Watch Gmail for customer escalation signals',
          summary: 'Read-only Gmail monitoring loop.',
          triggerLabel: 'Scheduled loop',
          status: 'active',
          risk: { level: 'low', note: null },
          mutationBoundary: 'Uses global MCP/runtime/external authorization; mutations require Decision gate.',
          createdAt: now,
          updatedAt: now,
        }],
        sensors: [{
          id: 'external:gmail',
          businessLineId: line.id,
          sourceType: 'external_access',
          sourceLabel: 'gmail',
          title: 'External Access watch: gmail',
          status: 'needs_review',
          readOnly: true,
          reviewBoundary: 'External evidence stays out of future context unless reviewed or confirmed.',
          sourceTaskId: 'task_gmail_watch',
          sourceRecordIds: ['business_line_record_external'],
        }],
      },
    });
    vi.mocked(harness.api.listBusinessLines!).mockResolvedValue([line]);
    vi.mocked(harness.api.getBusinessLineWorkspace!).mockResolvedValue(workspace);
    window.location.hash = 'business';

    render(<App />);

    expect(await screen.findByText('Automations & Sensors')).toBeTruthy();
    expect(screen.getByText('Watch Gmail for customer escalation signals')).toBeTruthy();
    expect(screen.getByText(/Scheduled loop · active/)).toBeTruthy();
    expect(screen.getByText('External Access watch: gmail')).toBeTruthy();
    expect(screen.getByText(/External evidence stays out of future context/)).toBeTruthy();
    expect(screen.queryByText(/provider matrix/i)).toBeNull();
    expect(screen.queryByText(/runtime matrix/i)).toBeNull();
  });

  it('shows SOP revision lifecycle provenance, Decision gate, and rollback actions', async () => {
    const user = userEvent.setup();
    const line = buildBusinessLineListItem({
      id: 'business_line_sop_lifecycle',
      title: 'SOP lifecycle product',
    });
    const workspace = buildBusinessLineWorkspace({
      businessLine: line,
      learning: {
        reviews: [],
        acceptedSkills: [],
        skillRevisions: [
          {
            id: 'revision_pending_decision',
            skillId: 'skill_pending_decision',
            businessLineId: line.id,
            scopePath: 'Learning / SOP',
            previousContent: 'Old SOP content.',
            nextContent: 'Risky SOP content.',
            contentDiff: '- Old SOP content.\n+ Risky SOP content.',
            changeReason: 'Risky update from review.',
            sourceReviewId: 'review_risky',
            provenance: {
              sourceType: 'business_line_review',
              sourceReviewId: 'review_risky',
              sourceReviewSummary: 'Risky review summary.',
            },
            approvedBy: null,
            approvalSourceType: null,
            approvalSourceId: null,
            status: 'proposed',
            effectiveAt: null,
            rollbackTargetRevisionId: null,
            requiresDecision: true,
            approvalDecisionId: 'decision_risky',
            approvalDecisionStatus: 'pending',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'revision_active',
            skillId: 'skill_active',
            businessLineId: line.id,
            scopePath: 'Learning / SOP',
            previousContent: null,
            nextContent: 'Active SOP content.',
            contentDiff: '+ Active SOP content.',
            changeReason: 'Accepted from review.',
            sourceReviewId: 'review_active',
            provenance: {
              sourceType: 'business_line_review',
              sourceReviewId: 'review_active',
              sourceReviewSummary: 'Active review summary.',
            },
            approvedBy: 'tester',
            approvalSourceType: 'operator',
            approvalSourceId: null,
            status: 'active',
            effectiveAt: now,
            rollbackTargetRevisionId: 'revision_prior',
            reviewAfterAt: '2000-01-01T00:00:00.000Z',
            expiresAt: '2999-01-01T00:00:00.000Z',
            needsReview: true,
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
    });
    vi.mocked(harness.api.listBusinessLines!).mockResolvedValue([line]);
    vi.mocked(harness.api.getBusinessLineWorkspace!).mockResolvedValue(workspace);
    vi.mocked(harness.api.rejectBusinessLineSkillRevision!).mockResolvedValue(workspace);
    vi.mocked(harness.api.disableBusinessLineSkillRevision!).mockResolvedValue(workspace);
    vi.mocked(harness.api.rollbackBusinessLineSkillRevision!).mockResolvedValue(workspace);
    window.location.hash = 'business';

    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Learning' }));

    expect(screen.getByText('Risky SOP content.')).toBeTruthy();
    expect(screen.getByText(/Source review: Risky review summary/)).toBeTruthy();
    expect(screen.getByText(/Diff: - Old SOP content/)).toBeTruthy();
    expect(screen.getByText(/Decision required before activation: pending/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '接受' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '拒绝' }));
    expect(harness.api.rejectBusinessLineSkillRevision).toHaveBeenCalledWith({ revisionId: 'revision_pending_decision' });

    expect(screen.getByText('Active SOP content.')).toBeTruthy();
    expect(screen.getByText(/Approval: operator · tester/)).toBeTruthy();
    expect(screen.getByText(/Rollback target: revision_prior/)).toBeTruthy();
    expect(screen.getByText('review due')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '回滚' }));
    expect(harness.api.rollbackBusinessLineSkillRevision).toHaveBeenCalledWith({ revisionId: 'revision_active' });
    await user.click(screen.getByRole('button', { name: '禁用' }));
    expect(harness.api.disableBusinessLineSkillRevision).toHaveBeenCalledWith({ revisionId: 'revision_active' });
  });

  it('opens business line context from a Today suggestion and sends business-line chat', async () => {
    const user = userEvent.setup();
    const homeBrief = buildBriefData(harness.tasks, harness.decisions);
    homeBrief.businessLineSuggestions = [{
      id: 'business-line-progress:business_line_task_product:task_risk',
      type: 'progress',
      businessLineId: 'business_line_task_product',
      businessLineTitle: 'GoalPilot product',
      whyNow: 'Accepted learning changed the next recommendation.',
      expectedImpact: 'Move the business line forward by completing the current next action.',
      effort: { level: 'medium', note: 'One focused execution step.' },
      confidence: 82,
      nextStep: 'Update Today suggestion trust layer.',
      sourceRecords: ['review: navigation model changed'],
      sourceRecordIds: ['review:business_line_review_navigation'],
      risk: {
        level: 'medium',
        note: null,
      },
      requiresDecision: false,
      taskId: 'task_risk',
    }];
    vi.mocked(harness.api.getHomeBrief).mockResolvedValueOnce(homeBrief);
    vi.mocked(harness.api.chatWithAI!).mockResolvedValueOnce({ text: '已按业务线上下文推进。' });

    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'AI 协助' }));

    expect(await screen.findByText(/Context: Business Line \/ GoalPilot product \/ Next Action/)).toBeTruthy();
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '下一步怎么推进？');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.chatWithAI).toHaveBeenCalledWith(expect.objectContaining({
        businessLineId: 'business_line_task_product',
        taskId: 'task_risk',
      }));
    });
  });

  it('keeps business line context on Agent API writeback proposals', async () => {
    const user = userEvent.setup();
    const homeBrief = buildBriefData(harness.tasks, harness.decisions);
    homeBrief.businessLineSuggestions = [{
      id: 'business-line-progress:business_line_task_product:task_risk',
      type: 'progress',
      businessLineId: 'business_line_task_product',
      businessLineTitle: 'GoalPilot product',
      whyNow: 'Accepted learning changed the next recommendation.',
      expectedImpact: 'Move the business line forward by completing the current next action.',
      effort: { level: 'medium', note: 'One focused execution step.' },
      confidence: 82,
      nextStep: 'Update Today suggestion trust layer.',
      sourceRecords: ['review: navigation model changed'],
      sourceRecordIds: ['review:business_line_review_navigation'],
      risk: {
        level: 'medium',
        note: null,
      },
      requiresDecision: false,
      taskId: 'task_risk',
    }];
    vi.mocked(harness.api.getHomeBrief).mockResolvedValueOnce(homeBrief);
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'api' }));
    vi.mocked(harness.api.triggerRun).mockImplementationOnce(async (input) => buildRun({
      id: 'run_business_line_writeback',
      output: JSON.stringify({
        type: 'TASKPLANE_WRITE_INTENTS',
        intents: [{
          type: 'source_context.create',
          title: 'Business line launch signal',
          note: 'The next action should stay anchored to accepted learning.',
        }],
      }),
      outputSource: 'ai',
      status: 'completed',
      taskId: input.taskId,
      type: input.type,
    }));

    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'AI 协助' }));
    expect(await screen.findByText(/Context: Business Line \/ GoalPilot product \/ Next Action/)).toBeTruthy();
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '开始执行当前任务');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('来源上下文写入提案')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '确认保存来源' }));

    await waitFor(() => {
      expect(harness.api.applyTaskplaneWriteback).toHaveBeenCalledWith(expect.objectContaining({
        plan: expect.objectContaining({
          action: 'source_context.create',
          input: expect.objectContaining({
            businessLineId: 'business_line_task_product',
            taskId: 'task_risk',
            title: 'Business line launch signal',
          }),
          timeline: expect.objectContaining({
            payload: expect.objectContaining({
              businessLineId: 'business_line_task_product',
            }),
          }),
        }),
        taskId: 'task_risk',
      }));
    });
  });

  it('executes a business-line Next Action through the panel runtime and saves post-run review options', async () => {
    const user = userEvent.setup();
    const line = buildBusinessLineListItem({
      id: 'business_line_execution',
      title: 'Execution product',
    });
    const workspace = buildBusinessLineWorkspace({
      businessLine: line,
      nextActions: [buildTask({
        id: 'task_business_line_action',
        title: 'Run launch evidence check',
        businessLineId: line.id,
        nextStep: 'Check launch evidence.',
      })],
    });
    vi.mocked(harness.api.listBusinessLines!).mockResolvedValue([line]);
    vi.mocked(harness.api.getBusinessLineWorkspace!).mockResolvedValue(workspace);
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'api' }));
    vi.mocked(harness.api.triggerRun).mockImplementationOnce(async (input) => buildRun({
      id: 'run_business_line_execution',
      businessLineId: input.businessLineId ?? null,
      output: 'Launch evidence changed the next recommendation.',
      outputSource: 'ai',
      status: 'completed',
      taskId: input.taskId,
      type: input.type,
    }));
    vi.mocked(harness.api.getRunDetail).mockResolvedValueOnce(buildRunDetail(buildRun({
      id: 'run_business_line_execution',
      businessLineId: line.id,
      output: 'Launch evidence changed the next recommendation.',
      outputSource: 'ai',
      status: 'completed',
      taskId: 'task_business_line_action',
      type: 'agent',
    }), {
      businessLinePostRunReview: {
        businessLineId: line.id,
        sourceActionId: 'task_business_line_action',
        sourceRunId: 'run_business_line_execution',
        resultSummary: 'Launch evidence changed the next recommendation.',
        evidenceItems: ['Run run_business_line_execution completed for task task_business_line_action.'],
        recordSuggestions: [{
          type: 'result',
          source: 'run:run_business_line_execution',
          summary: 'Launch evidence changed the next recommendation.',
          confidence: 75,
          shouldAffectFutureContext: true,
        }],
        nextActionSuggestions: ['Follow up on launch evidence.'],
        skillUpdateSuggestions: ['Review launch evidence before ranking this business line.'],
        confidence: 75,
        requiresDecision: false,
        writebackOptions: [
          { type: 'business_record', label: 'Business record', ready: true, evidence: ['run:run_business_line_execution'] },
          { type: 'next_action', label: 'Next action', ready: true, evidence: ['Follow up on launch evidence.'] },
          { type: 'source_context', label: 'Source context', ready: false, evidence: [] },
          { type: 'artifact', label: 'Artifact', ready: false, evidence: [] },
          { type: 'decision', label: 'Decision', ready: false, evidence: [] },
          { type: 'proposed_sop_revision', label: 'Proposed SOP revision', ready: true, evidence: ['Review launch evidence before ranking this business line.'] },
        ],
      },
    }));
    vi.mocked(harness.api.recordBusinessLineReview!).mockResolvedValue(buildBusinessLineWorkspace({ businessLine: line }));
    window.location.hash = 'business';

    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Next Actions' }));
    await user.click(await screen.findByRole('button', { name: '执行' }));
    const input = await screen.findByRole('textbox');
    await user.clear(input);
    await user.type(input, '开始执行当前任务');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.triggerRun).toHaveBeenCalledWith(expect.objectContaining({
        businessLineId: line.id,
        requestSurface: 'right_panel_agent_execution',
        taskId: 'task_business_line_action',
      }));
    });
    expect(await screen.findByText('业务线执行复盘提案')).toBeTruthy();
    expect(screen.getByText(/Review target: Business Line \/ Execution product \/ Run\/Review \/ run_business_line_execution \/ Next Action \/ Run launch evidence check/)).toBeTruthy();
    const reviewSurface = screen.getByLabelText('Side panel review surface');
    expect(within(reviewSurface).getByText('Writeback')).toBeTruthy();
    expect(within(reviewSurface).getByText('Business Record')).toBeTruthy();
    expect(within(reviewSurface).getByText('Review')).toBeTruthy();
    expect(within(reviewSurface).getByText('SOP')).toBeTruthy();
    expect(screen.getByText('Business record')).toBeTruthy();
    expect(screen.getByText('Next action')).toBeTruthy();
    await user.clear(screen.getByLabelText('业务线复盘结果'));
    await user.type(screen.getByLabelText('业务线复盘结果'), 'Edited business result for future context.');

    await user.click(screen.getByRole('button', { name: '确认写入业务线复盘' }));

    await waitFor(() => {
      expect(harness.api.recordBusinessLineReview).toHaveBeenCalledWith(expect.objectContaining({
        businessLineId: line.id,
        sourceActionId: 'task_business_line_action',
        sourceRunId: 'run_business_line_execution',
        recordSuggestions: [expect.objectContaining({
          source: 'run:run_business_line_execution',
          summary: 'Edited business result for future context.',
          type: 'result',
        })],
        nextActionSuggestions: ['Follow up on launch evidence.'],
        skillUpdateSuggestions: ['Review launch evidence before ranking this business line.'],
      }));
    });
  });

  it('surfaces CLI-first harness evidence for a business-line Next Action run', async () => {
    const user = userEvent.setup();
    const line = buildBusinessLineListItem({
      id: 'business_line_cli_execution',
      title: 'CLI Execution product',
    });
    const nextAction = buildTask({
      id: 'task_cli_business_line_action',
      title: 'Run CLI launch evidence check',
      businessLineId: line.id,
      nextStep: 'Check CLI launch evidence.',
    });
    const workspace = buildBusinessLineWorkspace({
      businessLine: line,
      nextActions: [nextAction],
    });
    vi.mocked(harness.api.listBusinessLines!).mockResolvedValue([line]);
    vi.mocked(harness.api.getBusinessLineWorkspace!).mockResolvedValue(workspace);
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    vi.mocked(harness.api.triggerAgentCliRun!).mockImplementationOnce(async (input) => {
      const run = buildRun({
        id: 'run_cli_business_line_execution',
        businessLineId: input.businessLineId ?? null,
        output: [
          'Codex CLI run completed.',
          '```json',
          JSON.stringify({
            type: 'TASKPLANE_WRITE_INTENTS',
            intents: [{
              type: 'business_record.create',
              businessLineId: input.businessLineId,
              summary: 'CLI evidence changed the next recommendation.',
              recordType: 'result',
            }],
          }),
          '```',
        ].join('\n'),
        outputSource: 'ai',
        status: 'completed',
        taskId: input.taskId,
        type: 'agent',
      }) as RunRecord & { steps: RunStepRecord[] };
      run.steps = [
        buildRunStep({
          id: 'step_native_cli_contract',
          runId: run.id,
          index: 0,
          kind: 'plan',
          title: 'Native CLI adapter contract',
          output: [
            'adapter=native_cli',
            'selected_cli_runtime=codex',
            'execution_runtime=codex_cli',
            `businessLineId=${line.id}`,
            `carrier=next_action_task:${nextAction.id}`,
            'businessLineContextPack=included',
            'runEvidence=run_steps_when_available+run_output',
            'writeIntent=TASKPLANE_WRITE_INTENTS',
            'directProductMutationAllowed=no',
            'postRunReview=agent_runtime_verification',
          ].join('\n'),
        }),
        buildRunStep({
          id: 'step_cli_completed',
          runId: run.id,
          index: 1,
          kind: 'model',
          title: 'codex cli completed',
          output: 'TASKPLANE_WRITE_INTENTS parsed for review.',
        }),
      ];
      harness.runs.push(run);
      return run;
    });
    window.location.hash = 'business';

    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Next Actions' }));
    await user.click(await screen.findByRole('button', { name: '执行' }));
    const input = await screen.findByRole('textbox');
    await user.clear(input);
    await user.type(input, '用 Codex CLI 执行当前业务线 Next Action。');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.triggerAgentCliRun).toHaveBeenCalledWith(expect.objectContaining({
        businessLineId: line.id,
        runtimeId: 'codex',
        sandboxMode: 'read-only',
        taskId: nextAction.id,
      }));
    });
    expect(await screen.findByText(/CLI 执行证据：runtime=codex；businessLineId=business_line_cli_execution/)).toBeTruthy();
    expect(screen.getByText(/carrier=next_action_task:task_cli_business_line_action/)).toBeTruthy();
    expect(screen.getByText(/contextPack=included/)).toBeTruthy();
    expect(screen.getByText(/runEvidence=run_steps_when_available\+run_output/)).toBeTruthy();
    expect(screen.getByText(/Write Intent=TASKPLANE_WRITE_INTENTS/)).toBeTruthy();
    expect(screen.getByText(/postRunReview=agent_runtime_verification/)).toBeTruthy();
  });

  it('separates business owner and execution carrier on writeback approval cards', async () => {
    const user = userEvent.setup();
    const task = buildTask({
      id: 'task_business_owner_card',
      title: 'Review onboarding signal',
      businessLineId: 'business_line_owner',
      state: 'planned',
    });
    harness.tasks.unshift(task);
    harness.details[task.id] = buildTaskDetail(task);
    harness.runs.unshift(buildRun({
      id: 'run_business_owner_card',
      businessLineId: 'business_line_owner',
      output: JSON.stringify({
        type: 'TASKPLANE_WRITE_INTENTS',
        intents: [{
          type: 'business_record.create',
          businessLineId: 'business_line_owner',
          recordType: 'signal',
          summary: 'Onboarding signal is ready for the business line.',
        }],
      }),
      outputSource: 'ai',
      status: 'completed',
      taskId: task.id,
      type: 'agent',
    }));
    window.location.hash = 'tasks';

    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Review onboarding signal' }));
    await user.click(screen.getByRole('button', { name: '任务动态' }));

    expect(await screen.findByText('Business owner: business_line_owner')).toBeTruthy();
    expect(screen.getByText('Execution carrier: Next Action / Review onboarding signal')).toBeTruthy();
  });

  it('falls back to the task business owner on task-only writeback approval targets', () => {
    const chips = writebackApprovalTargetChips({
      detail: 'Task-only memory guidance.',
      id: 'approval_task_only',
      kind: 'task_memory',
      plan: {
        action: 'task_file.create',
        input: {
          content: '# Memory',
          kind: 'file',
          name: 'fallback-memory.md',
          path: 'Task Records/fallback-memory.md',
          taskId: 'task_business_owner_fallback',
        },
        requiredApi: 'createTaskFile',
        successMessage: '已确认并写入任务文件：Task Records/fallback-memory.md。',
        taskId: 'task_business_owner_fallback',
        timeline: {
          type: 'panel.task_file_written',
          payload: {
            businessLineId: null,
            path: 'Task Records/fallback-memory.md',
          },
        },
      },
      runId: 'run_business_owner_fallback',
      source: 'task_memory_guidance',
      summary: '旧 run 只产生 task memory guidance，但 carrier 已属于业务线。',
      taskId: 'task_business_owner_fallback',
      title: '创建任务记录',
    }, {
      businessLineId: 'business_line_owner_fallback',
      title: 'Capture fallback memory',
    });

    expect(chips).toEqual([
      'Business owner: business_line_owner_fallback',
      'Execution carrier: Next Action / Capture fallback memory',
    ]);
  });

  it('shows scheduled/event sweep status in Brief when scheduler is enabled', async () => {
    const homeBrief = buildBriefData(harness.tasks, harness.decisions);
    const sweepSummary = 'scheduledEventAgentSweep=cron / status=completed / checked=2 / started=1 / blocked=1 / blockedReasons=Scheduled/event trigger daily run limit reached: 3/3. / blockedTaskSummaries=task_routine_auto: Scheduled/event trigger daily run limit reached: 3/3. / runFailureReasons=run_scheduled_callback_1: Model failed safely. / terminalRunEvidenceMissingRunIds=run_scheduled_callback_1 / triggerRunEvidenceStatus=pending_terminal_run_evidence';
    homeBrief.schedulerStatus = {
      enabled: true,
      running: true,
      lastBriefAt: null,
      lastRunSweepAt: null,
      lastRunSweepSummary: null,
      lastScheduledEventAgentSweepAt: '2026-05-27T06:15:00.000Z',
      lastScheduledEventAgentSweepSummary: sweepSummary,
      scheduledEventAgentSweepJobConnected: true,
    };
    vi.mocked(harness.api.getHomeBrief).mockResolvedValueOnce(homeBrief);

    render(<App />);

    expect(await screen.findByText('自动巡检: 已运行 · 检查 2 · 启动 1 · 阻塞 1 · 限额 · 失败 1 · 终态缺 1 · 证据待终态')).toBeTruthy();
    expect(screen.getByTitle(sweepSummary)).toBeTruthy();
  });

  it('shows scheduled/event sweep wiring in Brief before the first background run', async () => {
    const homeBrief = buildBriefData(harness.tasks, harness.decisions);
    homeBrief.schedulerStatus = {
      enabled: true,
      running: true,
      lastBriefAt: null,
      lastRunSweepAt: null,
      lastRunSweepSummary: null,
      lastScheduledEventAgentSweepAt: null,
      lastScheduledEventAgentSweepSummary: 'scheduledEventAgentSweep=cron / status=skipped / reason=waiting_for_first_tick',
      scheduledEventAgentSweepJobConnected: true,
    };
    vi.mocked(harness.api.getHomeBrief).mockResolvedValueOnce(homeBrief);

    render(<App />);

    expect(await screen.findByText('自动巡检: 已接线')).toBeTruthy();
    expect(screen.getByTitle('scheduledEventAgentSweep=cron / status=skipped / reason=waiting_for_first_tick')).toBeTruthy();
  });

  it('shows scheduler stale-run recovery evidence in Brief', async () => {
    const homeBrief = buildBriefData(harness.tasks, harness.decisions);
    const recoverySummary = 'schedulerStaleRunRecovery=completed / checked=2 / recovered=1 / recoveredRunIds=run_stale_1 / failureReason=Run exceeded the scheduler recovery window. / agentRuntimeStarted=no';
    homeBrief.schedulerStatus = {
      enabled: true,
      running: true,
      lastBriefAt: null,
      lastRunSweepAt: '2026-05-27T06:17:00.000Z',
      lastRunSweepSummary: recoverySummary,
      lastScheduledEventAgentSweepAt: null,
      lastScheduledEventAgentSweepSummary: 'scheduledEventAgentSweep=cron / status=skipped / reason=waiting_for_first_tick',
      scheduledEventAgentSweepJobConnected: true,
    };
    vi.mocked(harness.api.getHomeBrief).mockResolvedValueOnce(homeBrief);

    render(<App />);

    expect(await screen.findByText('运行恢复: 已检查 · 检查 2 · 恢复 1')).toBeTruthy();
    expect(screen.getByTitle(recoverySummary)).toBeTruthy();
  });

  it('shows skipped scheduled/event sweep reasons in Brief without calling them completed runs', async () => {
    const homeBrief = buildBriefData(harness.tasks, harness.decisions);
    const sweepSummary = 'scheduledEventAgentSweep=cron / status=skipped / reason=ports_not_connected / missingPorts=run_port,timeline_port,task_source_port / triggerRunEvidenceStatus=not_started';
    homeBrief.schedulerStatus = {
      enabled: true,
      running: true,
      lastBriefAt: null,
      lastRunSweepAt: null,
      lastRunSweepSummary: null,
      lastScheduledEventAgentSweepAt: '2026-05-27T06:20:00.000Z',
      lastScheduledEventAgentSweepSummary: sweepSummary,
      scheduledEventAgentSweepJobConnected: false,
    };
    vi.mocked(harness.api.getHomeBrief).mockResolvedValueOnce(homeBrief);

    render(<App />);

    expect(await screen.findByText('自动巡检: 未接线 · 缺 3 口')).toBeTruthy();
    expect(screen.queryByText('自动巡检: 已运行')).toBeFalsy();
    expect(screen.getByTitle(sweepSummary)).toBeTruthy();
  });

  it('shows in-flight scheduled/event sweep status in Brief', async () => {
    const homeBrief = buildBriefData(harness.tasks, harness.decisions);
    const sweepSummary = 'scheduledEventAgentSweep=cron / status=skipped / reason=in_flight / triggerRunEvidenceStatus=not_started';
    homeBrief.schedulerStatus = {
      enabled: true,
      running: true,
      lastBriefAt: null,
      lastRunSweepAt: null,
      lastRunSweepSummary: null,
      lastScheduledEventAgentSweepAt: '2026-05-27T06:25:00.000Z',
      lastScheduledEventAgentSweepSummary: sweepSummary,
      scheduledEventAgentSweepJobConnected: true,
    };
    vi.mocked(harness.api.getHomeBrief).mockResolvedValueOnce(homeBrief);

    render(<App />);

    expect(await screen.findByText('自动巡检: 运行中')).toBeTruthy();
    expect(screen.queryByText('自动巡检: 已运行')).toBeFalsy();
    expect(screen.getByTitle(sweepSummary)).toBeTruthy();
  });

  it('shows failed scheduled/event sweep status in Brief', async () => {
    const homeBrief = buildBriefData(harness.tasks, harness.decisions);
    const sweepSummary = 'scheduledEventAgentSweep=cron / status=skipped / reason=sweep_failed / checked=1 / checkedTaskIds=task_routine_auto / automationMissingRequirements=task_memory_guidance,post_step / error=Trigger port failed safely / triggerRunEvidenceStatus=not_started';
    homeBrief.schedulerStatus = {
      enabled: true,
      running: true,
      lastBriefAt: null,
      lastRunSweepAt: null,
      lastRunSweepSummary: null,
      lastScheduledEventAgentSweepAt: '2026-05-27T06:30:00.000Z',
      lastScheduledEventAgentSweepSummary: sweepSummary,
      scheduledEventAgentSweepJobConnected: true,
    };
    vi.mocked(harness.api.getHomeBrief).mockResolvedValueOnce(homeBrief);

    render(<App />);

    expect(await screen.findByText('自动巡检: 异常 · 检查 1 · 准备缺 2')).toBeTruthy();
    expect(screen.queryByText('自动巡检: 已运行')).toBeFalsy();
    expect(screen.getByTitle(sweepSummary)).toBeTruthy();
  });

  it('shows started-run evidence for failed scheduled/event sweeps in Brief', async () => {
    const homeBrief = buildBriefData(harness.tasks, harness.decisions);
    const sweepSummary = 'scheduledEventAgentSweep=cron / status=skipped / reason=sweep_failed / checked=1 / checkedTaskIds=task_routine_auto / startedRunIds=run_timeline_failure / terminalRunEvidenceMissingRunIds=run_timeline_failure / triggerRunEvidenceRequired=context_readiness,target_task_identity,task_memory_coverage,task_memory_guidance,subtask_start,run_limit_count,post_step / error=Timeline evidence failed: Timeline write failed safely / triggerRunEvidenceStatus=pending_terminal_run_evidence';
    homeBrief.schedulerStatus = {
      enabled: true,
      running: true,
      lastBriefAt: null,
      lastRunSweepAt: null,
      lastRunSweepSummary: null,
      lastScheduledEventAgentSweepAt: '2026-05-27T06:35:00.000Z',
      lastScheduledEventAgentSweepSummary: sweepSummary,
      scheduledEventAgentSweepJobConnected: true,
    };
    vi.mocked(harness.api.getHomeBrief).mockResolvedValueOnce(homeBrief);

    render(<App />);

    expect(await screen.findByText('自动巡检: 异常 · 检查 1 · 启动 1 · 终态缺 1 · 证据待终态')).toBeTruthy();
    expect(screen.queryByText('自动巡检: 已运行')).toBeFalsy();
    expect(screen.getByTitle(sweepSummary)).toBeTruthy();
  });

  it('clarifies AI Runtime separates Agent CLI login from API model configuration', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      capabilityRegistry: [{
        id: 'agent_cli.runtimes',
        label: 'Agent CLI Runtimes',
        family: 'agent_cli',
        status: 'unconfigured',
        configured: false,
        missingReason: 'Agent CLI authentication is not confirmed; use the official CLI login flow before execution.',
        visibility: 'hidden',
        access: 'mutating',
        requiresApproval: true,
        requiredGate: 'runtime_pre_step',
        summary: 'detected=1 / ready=0 / manualRun=1 / readyManualRun=0 / running=0 / errors=0 / catalogue=2',
      }],
      configurationSafetyReport: {
        secretExposureSafe: true,
        blockedReasons: [],
        summary: 'configured=2 / approvalRequired=0 / blocked=1',
        surfaces: [
          {
            id: 'agent_cli.runtimes',
            state: 'missing',
            reason: 'Agent CLI authentication is not confirmed; use the official CLI login flow before execution.',
            requiresApproval: true,
            startupProbePolicy: 'safe_read_only',
            exposesSecretValue: false,
          },
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

    await user.click(screen.getByRole('button', { name: /AI Runtime/ }));

    expect(await screen.findByRole('heading', { name: 'AI Runtime' })).toBeTruthy();
    expect(screen.getByText(/Agent CLI 和 Agent API 是同级 AI 调用层/)).toBeTruthy();
    expect(screen.getByText('1/2 已登录')).toBeTruthy();
    expect(screen.getByText(/选择 asterism 各 AI 阶段的默认调用层/)).toBeTruthy();
    expect(screen.getByText('运行时状态')).toBeTruthy();
    expect(screen.getByText('需登录')).toBeTruthy();
    expect(screen.getByText('执行边界')).toBeTruthy();
    expect(screen.getByText('任务前检查 + 用户确认')).toBeTruthy();
    expect(screen.getByText(/Agent CLI authentication is not confirmed/)).toBeTruthy();
    expect(screen.getByText(/探测策略/)).toBeTruthy();
    expect(screen.getByText(/安全只读/)).toBeTruthy();
    expect(screen.getByLabelText('Agent CLI runtimes')).toBeTruthy();
    expect(screen.getByText('已登录')).toBeTruthy();
    expect(screen.getAllByText('未安装').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '安装 Claude' })).toBeTruthy();
    await user.click(screen.getByText('高级：运行目录'));
    expect(screen.getByLabelText('内部运行目录')).toBeTruthy();
    expect(screen.getAllByText('Codex CLI').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Claude Code').length).toBeGreaterThan(0);
    expect(screen.getAllByText('事件流').length).toBeGreaterThan(0);
    expect(screen.getAllByText('只读工作区').length).toBeGreaterThan(0);
    expect(screen.getAllByText('原生搜索待验证').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Hooks待验证').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Subagents待验证').length).toBeGreaterThan(0);
    expect(screen.getAllByText('记忆由产品写入').length).toBeGreaterThan(0);
    expect(screen.getAllByText('上下文压缩').length).toBeGreaterThan(0);
    expect(screen.getAllByText('上下文清理').length).toBeGreaterThan(0);
    expect(screen.getAllByText('写入需提案').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '重新检测' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '更新' }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: '修改配置' }));
    expect(screen.getAllByText(/Agent API Provider 配置/).length).toBeGreaterThan(0);
    expect(screen.getByText('Agent API Runtime')).toBeTruthy();
    expect(screen.getByText('部分可用')).toBeTruthy();
    expect(screen.getByText(/当前问答 \/ 拆解 \/ 决策草稿等阶段走 Agent API/)).toBeTruthy();
    expect(screen.getAllByText(/同级 AI 调用层/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/不是 Agent CLI 的隐式兜底/).length).toBeGreaterThan(0);
    expect(screen.getByText(/第一版优先打通 Agent CLI/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '正在使用' })).toBeTruthy();
    expect(screen.queryByText('model.provider')).toBeNull();
    expect(screen.queryByText(/Safety Details/)).toBeNull();
  });

  it('surfaces Agent API Runtime shared capability and safety state', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      runtimeMode: 'api',
      capabilityRegistry: [{
        id: 'agent_api.runtime',
        label: 'Agent API Runtime',
        family: 'agent_api',
        status: 'available',
        configured: true,
        missingReason: null,
        visibility: 'hidden',
        access: 'mutating',
        requiresApproval: true,
        requiredGate: 'runtime_pre_step',
        summary: 'executionKind=api / runtimeLevel=same_level_future / status=partial / supportedPhases=chat,decomposition,decision,scheduled_brief / configuredProviderIsExecutionReady=no / providerToolProbeIsTaskExecutionReady=not_declared / readOnlyProposalCapable=partial / executionReady=no / promotionScope=per_movement_per_entrypoint / rightPanelExecutionEvidenceChain=execution_run_promotion / decompositionEvidenceChain=decomposition_promotion / schedulerEvidenceChain=runtime_scheduler / patchApplyEvidenceChain=sandbox_patch_promotion / globalAgentApiPromotionAllowed=false / executionRun=deferred / executionRunPromotionReady=no / executionRunPromotionRequirements=0/11 / executionRunGateRequirements=0/9 / executionRunPromotionSatisfiedRequirements=none / executionRunMissingRequirements=selected_runtime_contract,target_task_identity,provider_visible_preflight / executionRunPromotionMissingRequirements=selected_runtime_contract,target_task_identity,provider_visible_preflight / executionRunPromotionSatisfiedGates=none / executionRunPromotionMissingGates=simplicity_check,runtime_action,runtime_context_assembly,context_readiness,task_memory_coverage,task_memory_guidance,pre_step,subtask_start,post_step / executionRunKeyGates=runtime_context_assembly,context_readiness / executionRunMissingGates=runtime_context_assembly,context_readiness / decompositionPromotionReady=no / decompositionPromotionRequirements=0/7 / decompositionPromotionSatisfiedRequirements=none / decompositionMissingRequirements=selected_runtime_contract,parent_task_identity,reversible_proposal_card / decompositionPromotionMissingRequirements=selected_runtime_contract,parent_task_identity,reversible_proposal_card / providerToolReadiness=not_declared / providerToolStatus=not_declared / providerToolProbeScope=provider_tool_search_declaration / providerToolProbeTaskExecutionReadiness=not_evaluated / providerToolProbePromotesExecutionRun=no / providerToolProbeSeparateExecutionChain=execution_run_promotion / providerToolRequirements=4/5 / providerToolMissingRequirements=explicit_tool_declaration / providerNativeSessionReady=no / providerNativeSessionRequirements=2/5 / providerNativeSessionMissingRequirements=provider_payload_identity,normalized_plan_identity,provider_call_ids / providerNativeFlag=enabled / providerNativeSelectedProvider=openai / providerNativePayloadProvider=missing / providerNativePayloadProviderMatchesSelected=no / providerNativePlanProvider=missing / providerNativePlanProviderMatchesSelected=no / providerNativeProviderCallIdCount=0 / selectedApiRuntime=ready / providerConfigured=ready / configuredProvider=openai / configuredProviderEvidenceChain=ready / selectedRuntimeProvider=openai / selectedRuntimeProviderEvidenceChain=ready / startupProbe=never / providerOwnedMetadata=ready / providerMetadataMatchesSelected=yes / providerMetadataOwner=provider / providerMetadataPackage=@ai-sdk/openai / explicitToolDeclaration=missing / explicitToolDeclarationSource=provider_owned_metadata / explicitToolDeclarationPackage=@ai-sdk/openai / explicitToolDeclarationPackageMatchesMetadata=yes / declaredToolCount=0 / declaredWebSearchToolCount=0 / declaredWebSearchTools=none / trustedWebSearchToolCount=0 / trustedWebSearchTools=none / untrustedWebSearchToolCount=0 / untrustedWebSearchTools=none / selected=true / provider=configured',
      }],
      configurationSafetyReport: {
        secretExposureSafe: true,
        blockedReasons: [],
        summary: 'configured=2 / approvalRequired=1 / blocked=0',
        surfaces: [{
          id: 'agent_api.runtime',
          state: 'approval_required',
          reason: 'executionKind=api / runtimeLevel=same_level_future / status=partial / supportedPhases=chat,decomposition,decision,scheduled_brief / configuredProviderIsExecutionReady=no / providerToolProbeIsTaskExecutionReady=not_declared / readOnlyProposalCapable=partial / executionReady=no / promotionScope=per_movement_per_entrypoint / rightPanelExecutionEvidenceChain=execution_run_promotion / decompositionEvidenceChain=decomposition_promotion / schedulerEvidenceChain=runtime_scheduler / patchApplyEvidenceChain=sandbox_patch_promotion / globalAgentApiPromotionAllowed=false / executionRun=deferred / executionRunPromotionReady=no / executionRunPromotionRequirements=0/11 / executionRunGateRequirements=0/9 / executionRunPromotionSatisfiedRequirements=none / executionRunMissingRequirements=selected_runtime_contract,target_task_identity,provider_visible_preflight / executionRunPromotionMissingRequirements=selected_runtime_contract,target_task_identity,provider_visible_preflight / executionRunPromotionSatisfiedGates=none / executionRunPromotionMissingGates=simplicity_check,runtime_action,runtime_context_assembly,context_readiness,task_memory_coverage,task_memory_guidance,pre_step,subtask_start,post_step / executionRunKeyGates=runtime_context_assembly,context_readiness / executionRunMissingGates=runtime_context_assembly,context_readiness / decompositionPromotionReady=no / decompositionPromotionRequirements=0/7 / decompositionPromotionSatisfiedRequirements=none / decompositionMissingRequirements=selected_runtime_contract,parent_task_identity,reversible_proposal_card / decompositionPromotionMissingRequirements=selected_runtime_contract,parent_task_identity,reversible_proposal_card / providerToolReadiness=not_declared / providerToolStatus=not_declared / providerToolProbeScope=provider_tool_search_declaration / providerToolProbeTaskExecutionReadiness=not_evaluated / providerToolProbePromotesExecutionRun=no / providerToolProbeSeparateExecutionChain=execution_run_promotion / providerToolRequirements=4/5 / providerToolMissingRequirements=explicit_tool_declaration / providerNativeSessionReady=no / providerNativeSessionRequirements=2/5 / providerNativeSessionMissingRequirements=provider_payload_identity,normalized_plan_identity,provider_call_ids / providerNativeFlag=enabled / providerNativeSelectedProvider=openai / providerNativePayloadProvider=missing / providerNativePayloadProviderMatchesSelected=no / providerNativePlanProvider=missing / providerNativePlanProviderMatchesSelected=no / providerNativeProviderCallIdCount=0 / selectedApiRuntime=ready / providerConfigured=ready / configuredProvider=openai / configuredProviderEvidenceChain=ready / selectedRuntimeProvider=openai / selectedRuntimeProviderEvidenceChain=ready / startupProbe=never / providerOwnedMetadata=ready / providerMetadataMatchesSelected=yes / providerMetadataOwner=provider / providerMetadataPackage=@ai-sdk/openai / explicitToolDeclaration=missing / explicitToolDeclarationSource=provider_owned_metadata / explicitToolDeclarationPackage=@ai-sdk/openai / explicitToolDeclarationPackageMatchesMetadata=yes / declaredToolCount=0 / declaredWebSearchToolCount=0 / declaredWebSearchTools=none / trustedWebSearchToolCount=0 / trustedWebSearchTools=none / untrustedWebSearchToolCount=0 / untrustedWebSearchTools=none / selected=true / provider=configured',
          diagnosticSummary: 'Provider configured; execution_run remains deferred.',
          requiresApproval: true,
          startupProbePolicy: 'never',
          exposesSecretValue: false,
        }],
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /AI Runtime/ }));

    expect(await screen.findByText('API Runtime 状态')).toBeTruthy();
    expect(screen.getByText('Provider 阶段可用；execution_run deferred')).toBeTruthy();
    expect(screen.getByText('不自动')).toBeTruthy();
    expect(screen.getByText(/executionRun=deferred/)).toBeTruthy();
    expect(screen.getByText(/Provider configured; execution_run remains deferred/)).toBeTruthy();
    const executionReadiness = screen.getByLabelText('Agent API execution_run readiness');
    expect(within(executionReadiness).getByText('execution_run deferred')).toBeTruthy();
    expect(within(executionReadiness).getByText('promotion=0/11')).toBeTruthy();
    expect(within(executionReadiness).getByText('promotionReady=no')).toBeTruthy();
    expect(within(executionReadiness).getByText('gateRequirements=0/9')).toBeTruthy();
    expect(within(executionReadiness).getByText('missingRequirements=3')).toBeTruthy();
    expect(within(executionReadiness).getByText('missingRequirementList=selected_runtime_contract,target_task_identity,provider_visible_preflight')).toBeTruthy();
    expect(within(executionReadiness).getByText('promotionSatisfiedRequirementList=none')).toBeTruthy();
    expect(within(executionReadiness).getByText('promotionMissingRequirementList=selected_runtime_contract,target_task_identity,provider_visible_preflight')).toBeTruthy();
    expect(within(executionReadiness).getByText('promotionSatisfiedGateList=none')).toBeTruthy();
    expect(within(executionReadiness).getByText('promotionMissingGateList=simplicity_check,runtime_action,runtime_context_assembly,context_readiness,task_memory_coverage,task_memory_guidance,pre_step,subtask_start,post_step')).toBeTruthy();
    expect(within(executionReadiness).getByText('keyGates=2')).toBeTruthy();
    expect(within(executionReadiness).getByText('keyGateList=runtime_context_assembly,context_readiness')).toBeTruthy();
    expect(within(executionReadiness).getByText('missingGates=2')).toBeTruthy();
    expect(within(executionReadiness).getByText('missingGateList=runtime_context_assembly,context_readiness')).toBeTruthy();
    const decompositionReadiness = screen.getByLabelText('Agent API decomposition readiness');
    expect(within(decompositionReadiness).getByText('decomposition promotion deferred')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('promotion=0/7')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('promotionReady=no')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('missingRequirements=3')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('missingRequirementList=selected_runtime_contract,parent_task_identity,reversible_proposal_card')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('promotionSatisfiedRequirementList=none')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('promotionMissingRequirementList=selected_runtime_contract,parent_task_identity,reversible_proposal_card')).toBeTruthy();
    const deferredContract = screen.getByLabelText('Agent API deferred contract');
    expect(within(deferredContract).getByText('runtimeLevel=same_level_future')).toBeTruthy();
    expect(within(deferredContract).getByText('configuredProviderIsExecutionReady=no')).toBeTruthy();
    expect(within(deferredContract).getByText('providerToolProbeIsTaskExecutionReady=not_declared')).toBeTruthy();
    expect(within(deferredContract).getByText('readOnlyProposalCapable=partial')).toBeTruthy();
    expect(within(deferredContract).getByText('executionReady=no')).toBeTruthy();
    expect(within(deferredContract).getByText('promotionScope=per_movement_per_entrypoint')).toBeTruthy();
    expect(within(deferredContract).getByText('rightPanelExecutionEvidenceChain=execution_run_promotion')).toBeTruthy();
    expect(within(deferredContract).getByText('decompositionEvidenceChain=decomposition_promotion')).toBeTruthy();
    expect(within(deferredContract).getByText('schedulerEvidenceChain=runtime_scheduler')).toBeTruthy();
    expect(within(deferredContract).getByText('patchApplyEvidenceChain=sandbox_patch_promotion')).toBeTruthy();
    expect(within(deferredContract).getByText('globalAgentApiPromotionAllowed=false')).toBeTruthy();
    const providerToolReadiness = screen.getByLabelText('Agent API provider tool readiness');
    expect(within(providerToolReadiness).getByText('providerToolReadiness=not_declared')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerToolStatus=not_declared')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerToolProbeScope=provider_tool_search_declaration')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerToolProbeTaskExecutionReadiness=not_evaluated')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerToolProbePromotesExecutionRun=no')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerToolProbeSeparateExecutionChain=execution_run_promotion')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerToolRequirements=4/5')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerToolMissingRequirements=explicit_tool_declaration')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerNativeSessionReady=no')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerNativeSessionRequirements=2/5')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerNativeSessionMissingRequirements=provider_payload_identity,normalized_plan_identity,provider_call_ids')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerNativeFlag=enabled')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerNativeSelectedProvider=openai')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerNativePayloadProvider=missing')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerNativePayloadProviderMatchesSelected=no')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerNativePlanProvider=missing')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerNativePlanProviderMatchesSelected=no')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerNativeProviderCallIdCount=0')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('selectedApiRuntime=ready')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerConfigured=ready')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('configuredProvider=openai')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('configuredProviderEvidenceChain=ready')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('selectedRuntimeProvider=openai')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('selectedRuntimeProviderEvidenceChain=ready')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('startupProbe=never')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerOwnedMetadata=ready')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerMetadataMatchesSelected=yes')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerMetadataOwner=provider')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('providerMetadataPackage=@ai-sdk/openai')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('explicitToolDeclaration=missing')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('explicitToolDeclarationSource=provider_owned_metadata')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('explicitToolDeclarationPackage=@ai-sdk/openai')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('explicitToolDeclarationPackageMatchesMetadata=yes')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('declaredToolCount=0')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('declaredWebSearchToolCount=0')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('declaredWebSearchTools=none')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('trustedWebSearchToolCount=0')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('trustedWebSearchTools=none')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('untrustedWebSearchToolCount=0')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('untrustedWebSearchTools=none')).toBeTruthy();
    expect(within(providerToolReadiness).getByText('provider tools not implied')).toBeTruthy();
    expect(screen.getAllByText('可用').length).toBeGreaterThan(0);
  });

  it('can explicitly select Agent API Runtime when provider config is available', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /AI Runtime/ }));
    await user.click(await screen.findByRole('button', { name: '使用此方式' }));

    await waitFor(() => {
      expect(harness.api.setAiConfig).toHaveBeenCalledWith(expect.objectContaining({
        runtimeMode: 'api',
      }));
    });
    expect(await screen.findByText(/当前问答 \/ 拆解 \/ 决策草稿等阶段走 Agent API/)).toBeTruthy();
  });

  it('keeps the Agent CLI runtime directory in advanced AI Runtime config', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /AI Runtime/ }));
    await user.click(await screen.findByText('高级：运行目录'));
    const workspaceInput = await screen.findByLabelText('内部运行目录');
    await user.clear(workspaceInput);
    await user.type(workspaceInput, '/Users/example/project');
    await user.click(screen.getByRole('button', { name: '保存 AI Runtime 配置' }));

    await waitFor(() => {
      expect(harness.api.setAiConfig).toHaveBeenCalledWith(expect.objectContaining({
        workspaceRoot: '/Users/example/project',
      }));
    });
  });

  it('opens a guided Codex CLI login from AI Runtime when auth is missing', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      agentCliRuntimeStatus: {
        catalogueCount: 2,
        detectedCount: 1,
        readyCount: 0,
        runningCount: 0,
        errorCount: 0,
        manualRunCount: 1,
        readyManualRunCount: 0,
        updatedAt: '2026-05-19T00:00:00.000Z',
        runtimes: [{
          id: 'codex',
          label: 'Codex CLI',
          command: 'codex',
          installed: true,
          version: 'codex 0.42.0',
          authState: 'needs_login',
          executionSupport: 'manual_run',
          workload: 'idle',
          missingReason: 'Codex CLI is installed but not logged in; run codex login.',
        }],
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /AI Runtime/ }));
    expect(await screen.findByText('需登录')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '登录 Codex' }));

    expect(harness.api.openAgentCliLogin).toHaveBeenCalledWith({ runtimeId: 'codex' });
  });

  it('opens a guided Claude Code install command when the CLI is missing', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /AI Runtime/ }));
    await user.click(await screen.findByRole('button', { name: '安装 Claude' }));

    expect(harness.api.openAgentCliInstall).toHaveBeenCalledWith({ repair: undefined, runtimeId: 'claude' });
  });

  it('offers reinstall when a detected Agent CLI install is broken', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      agentCliRuntimeStatus: {
        catalogueCount: 2,
        detectedCount: 2,
        readyCount: 1,
        runningCount: 0,
        errorCount: 1,
        manualRunCount: 2,
        readyManualRunCount: 1,
        updatedAt: '2026-05-19T00:00:00.000Z',
        runtimes: [
          buildAiStatus().agentCliRuntimeStatus!.runtimes[0]!,
          {
            id: 'claude',
            label: 'Claude Code',
            command: 'claude',
            installed: true,
            version: null,
            authState: 'error',
            executionSupport: 'manual_run',
            workload: 'blocked',
            missingReason: 'claude is present but is not executable; reinstall the official CLI.',
          },
        ],
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /AI Runtime/ }));
    expect(await screen.findByText('安装异常')).toBeTruthy();
    expect(screen.getByText('需重新安装')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '重新安装 Claude' }));

    expect(harness.api.openAgentCliInstall).toHaveBeenCalledWith({ repair: true, runtimeId: 'claude' });
  });

  it('can manually refresh AI Runtime CLI readiness after official CLI login', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus)
      .mockResolvedValueOnce(buildAiStatus({ runtimeMode: 'codex' }))
      .mockResolvedValueOnce(buildAiStatus({
        runtimeMode: 'codex',
        agentCliRuntimeStatus: {
          catalogueCount: 2,
          detectedCount: 1,
          readyCount: 0,
          runningCount: 0,
          errorCount: 0,
          manualRunCount: 1,
          readyManualRunCount: 0,
          updatedAt: '2026-05-19T00:00:00.000Z',
          runtimes: [{
            id: 'codex',
            label: 'Codex CLI',
            command: 'codex',
            installed: true,
            version: 'codex 0.42.0',
            authState: 'needs_login',
            executionSupport: 'manual_run',
            workload: 'idle',
            missingReason: 'Codex CLI is installed but not logged in; run codex login.',
          }],
        },
      }))
      .mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /AI Runtime/ }));

    expect(await screen.findByText('需登录')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '重新检测' }));

    await waitFor(() => {
      expect(screen.getAllByText('正在使用').length).toBeGreaterThan(0);
    });
    expect(harness.api.getAiConfigStatus).toHaveBeenCalledTimes(3);
  });

  it('refreshes AI Runtime CLI readiness when the app regains focus after Terminal login', async () => {
    const user = userEvent.setup();
    const needsLoginStatus = buildAiStatus({
      runtimeMode: 'codex',
      agentCliRuntimeStatus: {
        catalogueCount: 2,
        detectedCount: 1,
        readyCount: 0,
        runningCount: 0,
        errorCount: 0,
        manualRunCount: 1,
        readyManualRunCount: 0,
        updatedAt: '2026-05-19T00:00:00.000Z',
        runtimes: [{
          id: 'codex',
          label: 'Codex CLI',
          command: 'codex',
          installed: true,
          version: 'codex 0.42.0',
          authState: 'needs_login',
          executionSupport: 'manual_run',
          workload: 'idle',
          missingReason: 'Codex CLI is installed but not logged in; run codex login.',
        }],
      },
    });
    vi.mocked(harness.api.getAiConfigStatus)
      .mockResolvedValueOnce(needsLoginStatus)
      .mockResolvedValueOnce(needsLoginStatus)
      .mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /AI Runtime/ }));
    expect(await screen.findByText('需登录')).toBeTruthy();

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => {
      expect(screen.getAllByText('正在使用').length).toBeGreaterThan(0);
    });
    expect(harness.api.getAiConfigStatus).toHaveBeenCalledTimes(3);
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
        summary: 'connected=1 / pending=0 / errors=0 / catalogue=1',
      }],
      configurationSafetyReport: {
        secretExposureSafe: true,
        blockedReasons: [],
        summary: 'configured=1 / approvalRequired=1 / blocked=0',
        surfaces: [{
          id: 'external_access.connectors',
          state: 'approval_required',
          reason: 'connected=1 / pending=0 / errors=0 / catalogue=1',
          requiresApproval: true,
          startupProbePolicy: 'manual_only',
          exposesSecretValue: false,
        }],
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /External Access/ }));

    expect((await screen.findAllByText('Gmail')).length).toBeGreaterThan(0);
    expect(screen.getByText('user@example.com')).toBeTruthy();
    expect(screen.getByText('已连接')).toBeTruthy();
    expect(screen.queryByText('尚未连接任何来源。')).toBeNull();
    expect(screen.getByText('可用')).toBeTruthy();
    expect(screen.getByText('connected=1 / pending=0 / errors=0 / catalogue=1')).toBeTruthy();
  });

  it('keeps pending Gmail OAuth as a default optional item instead of a connected source', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      externalAccessStatus: {
        sources: [{
          id: 'gmail',
          label: 'Gmail',
          kind: 'email',
          accountLabel: 'Gmail OAuth',
          status: 'pending',
          errorReason: 'Gmail OAuth refresh token is not configured.',
        }],
        connectedCount: 0,
        pendingCount: 1,
        errorCount: 0,
        updatedAt: '2026-05-17T10:00:00.000Z',
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /External Access/ }));

    expect(await screen.findByText('尚未连接任何来源。')).toBeTruthy();
    expect(screen.getByText('系统默认可选功能')).toBeTruthy();
    expect(screen.getByText('Gmail')).toBeTruthy();
    expect(screen.getByRole('button', { name: '授权' })).toBeTruthy();
    expect(screen.queryByText('待授权')).toBeNull();
  });

  it('routes Gmail connect through confirmed External Access controls', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);

    await user.click(screen.getByRole('button', { name: /External Access/ }));
    await user.click(await screen.findByRole('button', { name: '授权' }));

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

  it('routes errored Gmail reconnect through the same confirmed External Access control', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      externalAccessStatus: {
        sources: [{
          id: 'gmail',
          label: 'Gmail',
          kind: 'email',
          accountLabel: 'user@example.com',
          status: 'error',
          errorReason: 'Token expired',
        }],
        connectedCount: 0,
        pendingCount: 0,
        errorCount: 1,
        updatedAt: '2026-05-17T10:00:00.000Z',
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /External Access/ }));
    await user.click(await screen.findByRole('button', { name: '重新授权' }));

    expect(harness.api.connectGmailOAuth).toHaveBeenCalledWith({ confirmed: true });
    expect(await screen.findByText('Gmail 已连接。')).toBeTruthy();
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
    const missingAgentCliStatus = {
      ...buildAiStatus().agentCliRuntimeStatus!,
      readyCount: 0,
      readyManualRunCount: 0,
      runtimes: buildAiStatus().agentCliRuntimeStatus!.runtimes.map((runtime) => (
        runtime.id === 'codex'
          ? {
              ...runtime,
              authState: 'needs_login' as const,
              missingReason: 'Codex CLI is installed but not logged in; run codex login.',
            }
          : runtime
      )),
    };
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValueOnce(buildAiStatus({
      agentCliRuntimeStatus: missingAgentCliStatus,
      configured: false,
      configuredProviders: [],
    }));
    render(<App />);

    expect(await screen.findByText(/AI Runtime 尚未配置/)).toBeTruthy();
    expect(screen.getByText(/Today、Business 和 Decisions 仍可继续使用/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Business/ })).toBeTruthy();
    expect(within(screen.getByRole('navigation')).queryByRole('button', { name: /Tasks/ })).toBeNull();
  });

  it('treats a ready manual Agent CLI runtime as AI Runtime setup', async () => {
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValueOnce(buildAiStatus({
      apiKeyStored: false,
      configured: false,
      configuredProviders: [],
    }));
    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText(/AI Runtime 尚未配置/)).toBeNull();
    });
  });

  it('treats Agent CLI login as setup without a configured workspace root', async () => {
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValueOnce(buildAiStatus({
      apiKeyStored: false,
      configured: false,
      configuredProviders: [],
      workspaceRoot: null,
    }));
    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText(/AI Runtime 尚未配置/)).toBeNull();
    });
  });

  it('clarifies enabled Skills are catalogue intent until a real service exposes tools', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      capabilityRegistry: [{
        id: 'skills.catalogue',
        label: 'Skills',
        family: 'skill',
        status: 'disabled',
        configured: false,
        missingReason: 'No ready skill is enabled.',
        visibility: 'hidden',
        access: 'read_only',
        requiresApproval: true,
        requiredGate: 'runtime_entrypoint_coverage',
        summary: 'enabled=0 / ready=0 / modelVisible=0 / needsConfig=0 / catalogue=1',
      }],
      configurationSafetyReport: {
        secretExposureSafe: true,
        blockedReasons: ['skills.catalogue: No ready skill is enabled.'],
        summary: 'configured=0 / approvalRequired=0 / blocked=1',
        surfaces: [{
          id: 'skills.catalogue',
          state: 'disabled_by_policy',
          reason: 'No ready skill is enabled.',
          requiresApproval: true,
          startupProbePolicy: 'manual_only',
          exposesSecretValue: false,
        }],
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Skills/ }));

    expect(await screen.findByText(/AI 执行任务时可用的产品级规则/)).toBeTruthy();
    expect(screen.getByText(/产品级规则是内置运行约束/)).toBeTruthy();
    expect(screen.getByText('产品级规则')).toBeTruthy();
    expect(screen.getByText('GoalPilot Business Advancement Router')).toBeTruthy();
    expect(screen.getByText('Agent Operating Principles')).toBeTruthy();
    expect(screen.getByText('Decision Writeback Orchestration')).toBeTruthy();
    expect(screen.getByText(/真实工具暴露必须接入 Skills 服务/)).toBeTruthy();
    expect(screen.getByText('Brainstorming')).toBeTruthy();
    expect(screen.getByText(/在创建功能、组件或修改行为前/)).toBeTruthy();
    expect(screen.getByText(/可选技能目录只记录使用意图/)).toBeTruthy();
    await user.click(screen.getByRole('switch', { name: /选择目录项 Brainstorming/ }));
    expect(screen.getByText('已选择 1 个目录项')).toBeTruthy();
    expect(screen.queryByText(/技能已启用/)).toBeNull();
    expect(screen.getByText('能力状态')).toBeTruthy();
    expect(screen.getByText('策略关闭')).toBeTruthy();
    expect(screen.getByText(/No ready skill is enabled/)).toBeTruthy();
  });

  it('clarifies MCP servers are registration previews until a real service exposes tools', async () => {
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
        summary: 'connectedServers=0 / tools=0 / modelVisibleTools=0 / errors=0 / catalogue=1',
      }],
      configurationSafetyReport: {
        secretExposureSafe: true,
        blockedReasons: ['mcp.servers: No connected MCP server exposes tools.'],
        summary: 'configured=0 / approvalRequired=0 / blocked=1',
        surfaces: [{
          id: 'mcp.servers',
          state: 'disabled_by_policy',
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
    expect(screen.getByText(/当前页面只维护服务器登记预览/)).toBeTruthy();
    expect(screen.getByText(/真实连接、探测和工具暴露必须接入 MCP 服务/)).toBeTruthy();
    expect(screen.getByText('Playwright MCP')).toBeTruthy();
    expect(screen.getByText('npx @playwright/mcp@latest')).toBeTruthy();
    expect(screen.getByText('未连接')).toBeTruthy();
    expect(screen.getByText(/真实 MCP 服务接入后，服务器暴露的工具才可出现在 AI 可用工具列表/)).toBeTruthy();
    expect(screen.getByText('能力状态')).toBeTruthy();
    expect(screen.getByText('策略关闭')).toBeTruthy();
    expect(screen.getByText(/No connected MCP server exposes tools/)).toBeTruthy();
  });

  it('surfaces live Skills readiness through shared capability safety without treating catalogue selection as execution', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      capabilityRegistry: [{
        id: 'skills.catalogue',
        label: 'Skills',
        family: 'skill',
        status: 'available',
        configured: true,
        missingReason: null,
        visibility: 'model_visible',
        access: 'mixed',
        requiresApproval: true,
        requiredGate: 'runtime_entrypoint_coverage',
        summary: 'enabled=1 / ready=1 / modelVisible=1 / needsConfig=0 / catalogue=1',
      }],
      configurationSafetyReport: {
        secretExposureSafe: true,
        blockedReasons: [],
        summary: 'configured=0 / approvalRequired=1 / blocked=0',
        surfaces: [{
          id: 'skills.catalogue',
          state: 'approval_required',
          reason: 'enabled=1 / ready=1 / modelVisible=1 / needsConfig=0 / catalogue=1',
          requiresApproval: true,
          startupProbePolicy: 'manual_only',
          exposesSecretValue: false,
        }],
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Skills/ }));

    expect(await screen.findByText(/AI 执行任务时可用的产品级规则/)).toBeTruthy();
    expect(screen.getByText('可用')).toBeTruthy();
    expect(screen.getByText('需确认')).toBeTruthy();
    expect(screen.getByText(/modelVisible=1/)).toBeTruthy();
    expect(screen.getByText(/可选技能目录只记录使用意图/)).toBeTruthy();
    expect(screen.queryByText(/技能已启用/)).toBeNull();
  });

  it('surfaces live MCP readiness through shared capability safety without treating registration cards as connected services', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      capabilityRegistry: [{
        id: 'mcp.servers',
        label: 'MCP Servers',
        family: 'mcp',
        status: 'available',
        configured: true,
        missingReason: null,
        visibility: 'model_visible',
        access: 'mixed',
        requiresApproval: true,
        requiredGate: 'runtime_entrypoint_coverage',
        summary: 'connectedServers=1 / tools=3 / modelVisibleTools=1 / errors=0 / catalogue=1',
      }],
      configurationSafetyReport: {
        secretExposureSafe: true,
        blockedReasons: [],
        summary: 'configured=0 / approvalRequired=1 / blocked=0',
        surfaces: [{
          id: 'mcp.servers',
          state: 'approval_required',
          reason: 'connectedServers=1 / tools=3 / modelVisibleTools=1 / errors=0 / catalogue=1',
          requiresApproval: true,
          startupProbePolicy: 'manual_only',
          exposesSecretValue: false,
        }],
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /MCP/ }));

    expect(await screen.findByText(/Model Context Protocol 工具服务端/)).toBeTruthy();
    expect(screen.getByText('可用')).toBeTruthy();
    expect(screen.getByText('需确认')).toBeTruthy();
    expect(screen.getByText(/modelVisibleTools=1/)).toBeTruthy();
    expect(screen.getByText('Playwright MCP')).toBeTruthy();
    expect(screen.getByText('未连接')).toBeTruthy();
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
    fireEvent.click(screen.getByTitle('Focus chat'));
    expect(screen.getByTitle('Exit focus chat')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Exit focus chat'));
    fireEvent.click(screen.getByTitle('历史记录'));
    expect(screen.getByText('当前会话')).toBeTruthy();
    expect(screen.getByText('消息')).toBeTruthy();
    expect(screen.getByText(/开始新会话会先归档有用任务信号/)).toBeTruthy();
    const input = screen.getByPlaceholderText(/关于「董事会材料修订」/);
    await user.type(input, '下一步怎么推进？');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.chatWithAI).toHaveBeenCalledWith(expect.objectContaining({
        pilotDecision: expect.objectContaining({
          backendPlan: expect.objectContaining({ outputContract: 'pilot_decision_summary' }),
          operationMode: 'product_control_layer',
        }),
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

  it('can route a task-bound right-panel message through Codex CLI', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();

    expect(await screen.findByText('Codex CLI')).toBeTruthy();
    expect(screen.queryByText('运行前上下文')).toBeNull();
    expect(screen.queryByText(/不会授予 External Access \/ Skills \/ MCP 的 live tool 权限/)).toBeNull();
    const input = screen.getByPlaceholderText(/关于「董事会材料修订」/);
    await user.type(input, '用 Codex CLI 检查下一步。');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.triggerAgentCliRun).toHaveBeenCalledWith(expect.objectContaining({
        operatorConfirmed: true,
        pilotDecision: expect.objectContaining({
          backendPlan: expect.objectContaining({ outputContract: 'pilot_decision_summary' }),
          operationMode: 'product_control_layer',
        }),
        prompt: '用 Codex CLI 检查下一步。',
        runtimeId: 'codex',
        sandboxMode: 'read-only',
        taskId: 'task_risk',
      }));
    });
    expect(harness.api.chatWithAI).not.toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({ content: '用 Codex CLI 检查下一步。' }),
      ]),
    }));
    expect(await screen.findByText('任务 Agent 正在执行')).toBeTruthy();
    expect(screen.queryByText(/Codex CLI run 已在后台启动/)).toBeNull();
    expect(screen.queryByText(/只读执行中；完成后会整理结果/)).toBeNull();

    await user.click(screen.getByRole('button', { name: '取消运行' }));
    expect(harness.api.cancelAgentCliRun).toHaveBeenCalledWith({
      operatorConfirmed: true,
      reason: 'Operator cancelled the Codex CLI run from asterism.',
      runId: 'run_agent_cli_created',
    });
    expect(await screen.findByText(/已发送取消请求/)).toBeTruthy();
  });

  it('lets Pilot stop high-impact task chat before launching Codex CLI', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();

    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '是否允许直接部署到生产环境？');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(harness.api.triggerAgentCliRun).not.toHaveBeenCalled();
    expect(await screen.findByText(/这个动作触及需要你确认的边界/)).toBeTruthy();
  });

  it('keeps selected Codex CLI global chat from falling through to API runtime', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Search or ask/ }));

    expect(await screen.findByText('Codex CLI 待接入')).toBeTruthy();
    await user.type(screen.getByPlaceholderText(/搜索、提问或捕获任务想法/), '这个方案你怎么看？');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText(/请先进入具体任务后再发起任务 Agent run/)).toBeTruthy();
    expect(harness.api.chatWithAI).not.toHaveBeenCalled();
    expect(harness.api.triggerAgentCliRun).not.toHaveBeenCalled();
  });

  it('labels Agent API runtime mode as a peer execution runtime in development without starting execution', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'api' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();

    expect(await screen.findByText('Agent API')).toBeTruthy();
    expect(screen.queryByText('Agent API 调用层')).toBeNull();
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '/goal status');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(harness.api.triggerAgentCliRun).not.toHaveBeenCalled();
    expect(harness.api.chatWithAI).not.toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({ content: '/goal status' }),
      ]),
    }));
    expect(await screen.findByText(/执行 runtime：Agent API Runtime/)).toBeTruthy();
    expect(screen.getByText(/Agent API Runtime 普通任务讨论走 API assistant/)).toBeTruthy();
  });

  it('routes an explicit task-bound Agent API execution request through RunService', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'api' }));
    vi.mocked(harness.api.triggerRun).mockImplementationOnce(async (input) => {
      const run = buildRun({
        id: 'run_api_execution',
        output: 'Agent API execution finished.',
        outputSource: 'ai',
        status: 'completed',
        taskId: input.taskId,
        type: input.type,
      }) as RunRecord & { steps: RunStepRecord[] };
      run.steps = [
        {
          id: 'step_api_promotion',
          runId: run.id,
          index: 0,
          kind: 'plan',
          status: 'completed',
          title: 'Agent API execution promotion readiness',
          input: 'pilotDecision={"executor":"agent_api"}',
          output: 'Agent API execution promotion readiness / ready=no / requirements=5/11 / missingRequirements=write_intent_extraction,reviewed_patch_apply_boundary / targetTaskEvidenceChain=ready / selectedRuntimeRunEvidenceChain=ready / selectedRuntimeTaskEvidenceChain=ready / selectedRuntimeProviderEvidenceChain=ready / providerPreflightStatus=ready / providerPreflightRunEvidenceChain=ready / providerPreflightTaskEvidenceChain=ready / contextReadinessGateEvidenceChain=ready / runtimeActionGateEvidenceChain=ready / preStepGateEvidenceChain=ready / postStepGateEvidenceChain=missing / writeIntentDeclaredActionEvidenceChain=missing / writeIntentActionBoundary=missing',
          error: null,
          createdAt: now,
          updatedAt: now,
        },
      ];
      harness.runs.push(run);
      return run;
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();

    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '开始执行当前任务');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.triggerRun).toHaveBeenCalledWith(expect.objectContaining({
        instructions: expect.stringContaining('开始执行当前任务'),
        pilotDecision: expect.objectContaining({
          executor: 'agent_api',
          operationMode: 'product_control_layer',
        }),
        taskId: 'task_risk',
        type: 'agent',
      }));
    });
    expect(harness.api.chatWithAI).not.toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_risk',
      messages: expect.arrayContaining([
        expect.objectContaining({ content: expect.stringContaining('开始执行当前任务') }),
      ]),
    }));
    expect(await screen.findByText(/已完成，结果已记录到任务动态/)).toBeTruthy();
    expect(await screen.findByText(/Agent API 执行证据：promotion readiness missing write_intent_extraction,reviewed_patch_apply_boundary（5\/11）；身份链 target=ready runtimeRun=ready runtimeTask=ready provider=ready；Provider preflight ready run=ready task=ready；门禁 context=ready runtime=ready pre=ready post=missing；Write Intent 声明证据 missing；Write Intent 边界 missing/)).toBeTruthy();
  });

  it('routes task-bound Agent API progress intent through RunService without explicit run wording', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'api' }));
    vi.mocked(harness.api.triggerRun).mockImplementationOnce(async (input) => {
      const run = buildRun({
        id: 'run_api_progress_intent',
        output: 'Agent API continued the task.',
        outputSource: 'ai',
        status: 'completed',
        taskId: input.taskId,
        type: input.type,
      }) as RunRecord & { steps: RunStepRecord[] };
      run.steps = [
        {
          id: 'step_api_progress_intent_promotion',
          runId: run.id,
          index: 0,
          kind: 'plan',
          status: 'completed',
          title: 'Agent API execution post-run promotion readiness',
          input: 'pilotDecision={"executor":"agent_api"}',
          output: 'Agent API execution promotion readiness / ready=yes / requirements=11/11 / missingRequirements=none / noWorkspaceWriteRequired=yes / targetTaskEvidenceChain=ready / selectedRuntimeRunEvidenceChain=ready / selectedRuntimeTaskEvidenceChain=ready / selectedRuntimeProviderEvidenceChain=ready / providerPreflightStatus=ready / providerPreflightRunEvidenceChain=ready / providerPreflightTaskEvidenceChain=ready / contextReadinessGateEvidenceChain=ready / runtimeActionGateEvidenceChain=ready / preStepGateEvidenceChain=ready / taskMemoryCoverageGateEvidenceChain=ready / taskMemoryGuidanceGateEvidenceChain=ready / subtaskStartGateEvidenceChain=ready / postStepGateEvidenceChain=ready / reviewedPatchApplyBoundary=ready / patchPromotionStatus=not_required / writeIntentDeclaredActionEvidenceChain=ready / writeIntentActionBoundary=ready / terminalRunStatus=completed / terminalEvidenceSummary=output_chars=29 / terminalEvidenceSummaryChain=ready',
          error: null,
          createdAt: now,
          updatedAt: now,
        },
      ];
      harness.runs.push(run);
      return run;
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '继续完善当前任务');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.triggerRun).toHaveBeenCalledWith(expect.objectContaining({
        instructions: expect.stringContaining('继续完善当前任务'),
        pilotDecision: expect.objectContaining({
          executor: 'agent_api',
          operationMode: 'product_control_layer',
        }),
        taskId: 'task_risk',
        type: 'agent',
      }));
    });
    expect(harness.api.chatWithAI).not.toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({ content: expect.stringContaining('继续完善当前任务') }),
      ]),
    }));
    expect(await screen.findByText(/Agent API 执行证据：promotion readiness ready，无需工作区写入（11\/11）/)).toBeTruthy();
  });

  it('surfaces Agent API execution no-write promotion readiness in the right panel summary', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'api' }));
    vi.mocked(harness.api.triggerRun).mockImplementationOnce(async (input) => {
      const run = buildRun({
        id: 'run_api_no_write',
        output: 'No workspace changes were needed.',
        outputSource: 'ai',
        status: 'completed',
        taskId: input.taskId,
        type: input.type,
      }) as RunRecord & { steps: RunStepRecord[] };
      run.steps = [
        {
          id: 'step_api_no_write_promotion',
          runId: run.id,
          index: 0,
          kind: 'plan',
          status: 'completed',
          title: 'Agent API execution post-run promotion readiness',
          input: 'pilotDecision={"executor":"agent_api"}',
          output: 'Agent API execution promotion readiness / ready=yes / requirements=11/11 / missingRequirements=none / noWorkspaceWriteRequired=yes / targetTaskEvidenceChain=ready / selectedRuntimeRunEvidenceChain=ready / selectedRuntimeTaskEvidenceChain=ready / selectedRuntimeProviderEvidenceChain=ready / providerPreflightStatus=ready / providerPreflightRunEvidenceChain=ready / providerPreflightTaskEvidenceChain=ready / contextReadinessGateEvidenceChain=ready / runtimeActionGateEvidenceChain=ready / preStepGateEvidenceChain=ready / taskMemoryCoverageGateEvidenceChain=ready / taskMemoryGuidanceGateEvidenceChain=ready / subtaskStartGateEvidenceChain=ready / postStepGateEvidenceChain=ready / reviewedPatchApplyBoundary=ready / patchPromotionStatus=not_required / writeIntentDeclaredActionEvidenceChain=ready / writeIntentActionBoundary=ready / terminalRunStatus=completed / terminalEvidenceSummary=output_chars=33 / terminalEvidenceSummaryChain=ready',
          error: null,
          createdAt: now,
          updatedAt: now,
        },
      ];
      harness.runs.push(run);
      return run;
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '开始执行当前任务');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText(/Agent API 执行证据：promotion readiness ready，无需工作区写入（11\/11）；身份链 target=ready runtimeRun=ready runtimeTask=ready provider=ready；Provider preflight ready run=ready task=ready；门禁 context=ready runtime=ready pre=ready memory=ready guidance=ready subtask=ready post=ready；Write Intent 声明证据 ready；Write Intent 边界 ready；Patch 边界 ready\/not_required；终端证据 completed\/output_chars=33/)).toBeTruthy();
  });

  it('prefers post-run Agent API execution readiness over pre-run readiness in the right panel summary', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'api' }));
    vi.mocked(harness.api.triggerRun).mockImplementationOnce(async (input) => {
      const run = buildRun({
        id: 'run_api_post_run_ready',
        output: 'No workspace changes were needed after execution.',
        outputSource: 'ai',
        status: 'completed',
        taskId: input.taskId,
        type: input.type,
      }) as RunRecord & { steps: RunStepRecord[] };
      run.steps = [
        {
          id: 'step_api_pre_run_promotion',
          runId: run.id,
          index: 0,
          kind: 'plan',
          status: 'completed',
          title: 'Agent API execution promotion readiness',
          input: 'pilotDecision={"executor":"agent_api"}',
          output: 'Agent API execution promotion readiness / ready=no / requirements=7/11 / missingRequirements=post_step,run_evidence_persistence',
          error: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'step_api_post_run_promotion',
          runId: run.id,
          index: 1,
          kind: 'plan',
          status: 'completed',
          title: 'Agent API execution post-run promotion readiness',
          input: 'pilotDecision={"executor":"agent_api"}',
          output: 'Agent API execution promotion readiness / ready=yes / requirements=11/11 / missingRequirements=none / noWorkspaceWriteRequired=yes / targetTaskEvidenceChain=ready / selectedRuntimeRunEvidenceChain=ready / selectedRuntimeTaskEvidenceChain=ready / selectedRuntimeProviderEvidenceChain=ready / providerPreflightStatus=ready / providerPreflightRunEvidenceChain=ready / providerPreflightTaskEvidenceChain=ready / contextReadinessGateEvidenceChain=ready / runtimeActionGateEvidenceChain=ready / preStepGateEvidenceChain=ready / taskMemoryCoverageGateEvidenceChain=ready / taskMemoryGuidanceGateEvidenceChain=ready / subtaskStartGateEvidenceChain=ready / postStepGateEvidenceChain=ready / reviewedPatchApplyBoundary=ready / patchPromotionStatus=not_required / writeIntentDeclaredActionEvidenceChain=ready / writeIntentActionBoundary=ready / terminalRunStatus=completed / terminalEvidenceSummary=output_chars=47 / terminalEvidenceSummaryChain=ready',
          error: null,
          createdAt: now,
          updatedAt: now,
        },
      ];
      harness.runs.push(run);
      return run;
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '开始执行当前任务');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText(/Agent API 执行证据：promotion readiness ready，无需工作区写入（11\/11）；身份链 target=ready runtimeRun=ready runtimeTask=ready provider=ready；Provider preflight ready run=ready task=ready；门禁 context=ready runtime=ready pre=ready memory=ready guidance=ready subtask=ready post=ready；Write Intent 声明证据 ready；Write Intent 边界 ready；Patch 边界 ready\/not_required；终端证据 completed\/output_chars=47/)).toBeTruthy();
    expect(screen.queryByText(/post_step,run_evidence_persistence/)).toBeNull();
  });

  it('routes right-panel Agent API decomposition requests through the task-bound decomposition adapter', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'api' }));
    vi.mocked(harness.api.decomposeProject!).mockResolvedValueOnce({
      parentGoal: '完成董事会材料修订',
      subtasks: [
        {
          title: '确认材料边界',
          summary: '梳理董事会材料范围、截止时间和关键输入。',
          acceptanceCriteria: '范围和输入已确认。',
          dependency: null,
          rationale: '这是可独立验收的第一步。',
        },
        {
          title: '完成初稿修订',
          summary: '根据已确认边界完成第一版修订。',
          acceptanceCriteria: '初稿可供审阅。',
          dependency: '确认材料边界',
          rationale: '这是可审阅的交付块。',
        },
      ],
      review: '按交付阶段拆解，确认后创建子任务。',
      nextStep: '确认后进入第一个子任务。',
      evidenceRunId: 'agent_api_decomposition:task_risk:abc123def456',
      invocation: {
        phase: 'decomposition_draft',
        layer: 'api_runtime',
        runtime: {
          mode: 'api',
          label: 'Agent API Runtime · openai / gpt-test',
        },
        status: 'completed',
        summary: '已生成 2 个项目子任务草稿。',
      },
      promotionReadiness: {
        ready: true,
        summary: 'Agent API decomposition promotion readiness / ready=yes / requirements=7/7 / selectedRuntimeEvidenceRunId=agent_api_decomposition:task_risk:abc123def456 / selectedRuntimeEvidenceRunChain=ready / selectedRuntimeParentTask=task_risk / selectedRuntimeParentTaskEvidenceChain=ready / selectedRuntimeProvider=openai / selectedRuntimeProviderEvidenceChain=ready / providerConfigured=ready / configuredProvider=openai / configuredProviderEvidenceChain=ready / timelineRuntimeEvidenceRunId=agent_api_decomposition:task_risk:abc123def456 / timelineRuntimeParentTask=task_risk / proposalSubtaskTitles=确认材料边界|完成初稿修订 / applyPlanSubtaskTitles=确认材料边界|完成初稿修订 / proposalSubtaskTitleEvidenceChain=ready / applyPlanSubtaskTitleEvidenceChain=ready / proposalSubtaskSummaries=梳理董事会材料范围、截止时间和关键输入。|根据已确认边界完成第一版修订。 / applyPlanSubtaskSummaries=梳理董事会材料范围、截止时间和关键输入。|根据已确认边界完成第一版修订。 / proposalSubtaskSummaryEvidenceChain=ready / applyPlanSubtaskSummaryEvidenceChain=ready / proposalAcceptanceCriteria=范围和输入已确认。|初稿可供审阅。 / applyPlanAcceptanceCriteria=范围和输入已确认。|初稿可供审阅。 / proposalAcceptanceCriteriaEvidenceChain=ready / applyPlanAcceptanceCriteriaEvidenceChain=ready / proposalRationales=这是可独立验收的第一步。|这是可审阅的交付块。 / applyPlanRationales=这是可独立验收的第一步。|这是可审阅的交付块。 / proposalRationaleEvidenceChain=ready / applyPlanRationaleEvidenceChain=ready / proposalDependencies=none|确认材料边界 / applyPlanDependencies=none|确认材料边界 / proposalDependencyEvidenceChain=ready / applyPlanDependencyEvidenceChain=ready / proposalSubtaskUniqueChain=ready / promotionMissingRequirements=none',
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
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '请拆解成子任务');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.decomposeProject).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
        instructions: expect.stringContaining('请拆解成子任务'),
      }));
    });
    expect(harness.api.chatWithAI).not.toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_risk',
      messages: expect.arrayContaining([
        expect.objectContaining({ content: expect.stringContaining('请拆解成子任务') }),
      ]),
    }));
    expect(await screen.findByText('子任务草案')).toBeTruthy();
    const decompositionReadiness = screen.getByLabelText('Agent API decomposition promotion readiness');
    expect(within(decompositionReadiness).getByText('promotionReady=yes')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('requirements=7/7')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('selectedRuntimeProvider=openai')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('selectedRuntimeEvidenceRunId=agent_api_decomposition:task_risk:abc123def456')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('selectedRuntimeEvidenceRunChain=ready')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('selectedRuntimeParentTask=task_risk')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('selectedRuntimeParentTaskEvidenceChain=ready')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('providerConfigured=ready')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('configuredProvider=openai')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('configuredProviderEvidenceChain=ready')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('timelineRuntimeEvidenceRunId=agent_api_decomposition:task_risk:abc123def456')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('timelineRuntimeParentTask=task_risk')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('proposalSubtaskTitles=确认材料边界|完成初稿修订')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('applyPlanSubtaskTitles=确认材料边界|完成初稿修订')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('proposalSubtaskTitleEvidenceChain=ready')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('applyPlanSubtaskTitleEvidenceChain=ready')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('proposalSubtaskSummaries=梳理董事会材料范围、截止时间和关键输入。|根据已确认边界完成第一版修订。')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('applyPlanSubtaskSummaries=梳理董事会材料范围、截止时间和关键输入。|根据已确认边界完成第一版修订。')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('proposalSubtaskSummaryEvidenceChain=ready')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('applyPlanSubtaskSummaryEvidenceChain=ready')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('proposalAcceptanceCriteria=范围和输入已确认。|初稿可供审阅。')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('applyPlanAcceptanceCriteria=范围和输入已确认。|初稿可供审阅。')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('proposalAcceptanceCriteriaEvidenceChain=ready')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('applyPlanAcceptanceCriteriaEvidenceChain=ready')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('proposalRationales=这是可独立验收的第一步。|这是可审阅的交付块。')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('applyPlanRationales=这是可独立验收的第一步。|这是可审阅的交付块。')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('proposalRationaleEvidenceChain=ready')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('applyPlanRationaleEvidenceChain=ready')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('proposalDependencies=none|确认材料边界')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('applyPlanDependencies=none|确认材料边界')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('proposalDependencyEvidenceChain=ready')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('applyPlanDependencyEvidenceChain=ready')).toBeTruthy();
    expect(within(decompositionReadiness).getByText('proposalSubtaskUniqueChain=ready')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '确认创建子任务' }));
    await waitFor(() => {
      expect(harness.api.applyTaskplaneWriteback).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
        plan: expect.objectContaining({
          action: 'subtask.create_many',
          input: expect.objectContaining({
            evidenceRunId: 'agent_api_decomposition:task_risk:abc123def456',
            source: 'agent_api_decomposition',
          }),
          timeline: expect.objectContaining({
            payload: expect.objectContaining({
              runtimeContract: expect.objectContaining({
                invocationLayer: 'api_runtime',
                parentTaskId: 'task_risk',
                provider: 'openai',
                runtimeMode: 'api',
              }),
              source: 'agent_api_decomposition',
            }),
          }),
        }),
      }));
    });
  });

  it('blocks right-panel Agent API decomposition confirmation when runtime identity evidence is missing', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'api' }));
    vi.mocked(harness.api.decomposeProject!).mockResolvedValueOnce({
      parentGoal: '完成董事会材料修订',
      subtasks: [
        {
          title: '确认材料边界',
          summary: '梳理董事会材料范围、截止时间和关键输入。',
          acceptanceCriteria: '范围和输入已确认。',
          dependency: null,
          rationale: '这是可独立验收的第一步。',
        },
      ],
      review: '按交付阶段拆解，确认后创建子任务。',
      nextStep: '确认后进入第一个子任务。',
      evidenceRunId: 'agent_api_decomposition:task_risk:missing_runtime',
      promotionReadiness: {
        ready: true,
        summary: 'Agent API decomposition promotion readiness / ready=yes / selectedRuntimeProvider=openai / promotionMissingRequirements=none',
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
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '请拆解成子任务');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('子任务草案')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '确认创建子任务' }));

    expect(await screen.findByText(/selected_runtime_contract/)).toBeTruthy();
    expect(harness.api.applyTaskplaneWriteback).not.toHaveBeenCalled();
  });

  it('keeps /goal product-owned in task chat and persists it as the Taskplane task goal', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();

    await user.type(
      screen.getByPlaceholderText(/关于「董事会材料修订」/),
      '/goal 完成运行时边界收口并通过验收',
    );
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.updateTask).toHaveBeenCalledWith({
        id: 'task_risk',
        nextStep: '完成运行时边界收口并通过验收',
      });
    });
    expect(harness.api.recordTaskTimelineEvent).toHaveBeenCalledWith({
      taskId: 'task_risk',
      type: 'panel.task_goal_updated',
      payload: {
        objective: '完成运行时边界收口并通过验收',
        previousObjective: expect.any(String),
        source: '/goal',
      },
    });
    expect(harness.api.triggerAgentCliRun).not.toHaveBeenCalled();
    expect(harness.api.chatWithAI).not.toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({ content: '/goal 完成运行时边界收口并通过验收' }),
      ]),
    }));
    expect(await screen.findByText(/已设置 Task Goal/)).toBeTruthy();
    expect(screen.getByText(/不会把 `\/goal` 透传给 Codex CLI 或 Claude Code/)).toBeTruthy();
    expect(screen.getAllByText(/完成运行时边界收口并通过验收/).length).toBeGreaterThan(0);

    await user.clear(screen.getByPlaceholderText(/关于「董事会材料修订」/));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '/goal pause');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(harness.api.recordTaskTimelineEvent).toHaveBeenCalledWith({
      taskId: 'task_risk',
      type: 'panel.task_goal_paused',
      payload: {
        objective: '完成运行时边界收口并通过验收',
        source: '/goal pause',
      },
    });
    expect(await screen.findByText(/已暂停 Task Goal/)).toBeTruthy();
    expect(screen.queryByText('Task Goal · 已暂停')).toBeNull();

    await user.clear(screen.getByPlaceholderText(/关于「董事会材料修订」/));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '/goal resume');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(harness.api.recordTaskTimelineEvent).toHaveBeenCalledWith({
      taskId: 'task_risk',
      type: 'panel.task_goal_resumed',
      payload: {
        objective: '完成运行时边界收口并通过验收',
        source: '/goal resume',
      },
    });
    expect(await screen.findByText(/已恢复 Task Goal/)).toBeTruthy();

    await user.clear(screen.getByPlaceholderText(/关于「董事会材料修订」/));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '/goal clear');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.updateTask).toHaveBeenCalledWith({
        id: 'task_risk',
        nextStep: null,
      });
    });
    expect(harness.api.recordTaskTimelineEvent).toHaveBeenCalledWith({
      taskId: 'task_risk',
      type: 'panel.task_goal_updated',
      payload: {
        cleared: true,
        objective: null,
        previousObjective: '完成运行时边界收口并通过验收',
        source: '/goal clear',
      },
    });
    expect(await screen.findByText(/已清除 Task Goal/)).toBeTruthy();
  });

  it('creates completion criteria from product-owned /goal drafts', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/关于「董事会材料修订」/), {
      target: {
        value: [
          '/goal 完成目标闭环',
          '验收:',
          '- Run Goal Contract 包含目标',
          '- 任务记忆提案出现',
        ].join('\n'),
      },
    });
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.updateTask).toHaveBeenCalledWith({
        id: 'task_risk',
        nextStep: '完成目标闭环',
      });
    });
    expect(harness.api.createCompletionCriteria).toHaveBeenCalledWith({
      taskId: 'task_risk',
      text: 'Run Goal Contract 包含目标',
      verificationResponsibility: 'shared',
      verificationResponsibilityLabel: 'product verifier',
    });
    expect(harness.api.createCompletionCriteria).toHaveBeenCalledWith({
      taskId: 'task_risk',
      text: '任务记忆提案出现',
      verificationResponsibility: 'shared',
      verificationResponsibilityLabel: 'product verifier',
    });
    expect(harness.api.recordTaskTimelineEvent).toHaveBeenCalledWith({
      taskId: 'task_risk',
      type: 'panel.task_goal_updated',
      payload: expect.objectContaining({
        objective: '完成目标闭环',
        completionConditions: ['Run Goal Contract 包含目标', '任务记忆提案出现'],
        source: '/goal',
      }),
    });
    expect(await screen.findByText(/验收条件：Run Goal Contract 包含目标；任务记忆提案出现/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/关于「董事会材料修订」/), {
      target: { value: '/goal status' },
    });
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText(/当前目标：完成目标闭环/)).toBeTruthy();
    expect(await screen.findAllByText(/验收条件：Run Goal Contract 包含目标；任务记忆提案出现/)).toHaveLength(2);
  });

  it('recognizes explicit native goal requests without forwarding them to the CLI yet', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();

    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '/codex goal 跑完验收');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(harness.api.triggerAgentCliRun).not.toHaveBeenCalled();
    expect(harness.api.recordRuntimeNativeGoalRequest).toHaveBeenCalledWith({
      forwarded: false,
      objective: '跑完验收',
      operatorConfirmed: true,
      reason: 'Codex CLI native goal mode requires Codex CLI 0.133.0+; detected 0.42.0.',
      runtimeId: 'codex',
      runtimeLabel: 'Codex CLI',
      supportsNativeGoalMode: false,
      taskId: 'task_risk',
    });
    expect(harness.api.recordTaskTimelineEvent).toHaveBeenCalledWith({
      taskId: 'task_risk',
      type: 'panel.runtime_native_goal_requested',
      payload: expect.objectContaining({
        forwarded: false,
        nativeGoalForwardingReadiness: expect.objectContaining({
          missingEvidence: expect.arrayContaining(['command shape', 'progress evidence', 'control boundary', 'packaged smoke']),
          status: 'audit_only',
        }),
        objective: '跑完验收',
        runtimeId: 'codex',
        runtimeLabel: 'Codex CLI',
        supportsNativeGoalMode: false,
      }),
    });
    expect(harness.api.chatWithAI).not.toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({ content: '/codex goal 跑完验收' }),
      ]),
    }));
    expect(await screen.findByText(/Codex CLI native goal mode 需要更新 CLI 后才可用/)).toBeTruthy();
    expect(screen.getByText(/审计 Run: run_native_goal_audit/)).toBeTruthy();
    expect(screen.getByText(/Readiness: codex native goal forwarding remains audit-only/)).toBeTruthy();
    expect(screen.getByText(/Missing evidence: adapter capability, command shape, progress evidence, control boundary, packaged smoke/)).toBeTruthy();
    expect(screen.getByText(/显式 runtime-native goal 请求/)).toBeTruthy();
  });

  it('does not create native goal audit evidence without an objective', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();

    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '/codex goal ');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(harness.api.recordRuntimeNativeGoalRequest).not.toHaveBeenCalled();
    expect(harness.api.recordTaskTimelineEvent).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'panel.runtime_native_goal_requested',
    }));
    expect(await screen.findByText(/暂不支持命令 \/codex goal/)).toBeTruthy();
  });

  it('can route a task-bound right-panel message through Claude Code plan mode', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      runtimeMode: 'claude',
      agentCliRuntimeStatus: {
        catalogueCount: 2,
        detectedCount: 2,
        errorCount: 0,
        manualRunCount: 2,
        readyCount: 2,
        readyManualRunCount: 2,
        runningCount: 0,
        updatedAt: '2026-05-19T00:00:00.000Z',
        runtimes: [
          {
            id: 'codex',
            label: 'Codex CLI',
            command: 'codex',
            installed: true,
            version: 'codex 0.42.0',
            authState: 'ready',
            executionSupport: 'manual_run',
            workload: 'idle',
            missingReason: null,
          },
          {
            id: 'claude',
            label: 'Claude Code',
            command: 'claude',
            installed: true,
            version: 'claude 2.1.128',
            authState: 'ready',
            executionSupport: 'manual_run',
            workload: 'idle',
            missingReason: null,
          },
        ],
      },
    }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();

    expect(await screen.findByText('Claude Code')).toBeTruthy();
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '用 Claude Code 看风险。');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.triggerAgentCliRun).toHaveBeenCalledWith(expect.objectContaining({
        operatorConfirmed: true,
        prompt: '用 Claude Code 看风险。',
        runtimeId: 'claude',
        sandboxMode: 'read-only',
        taskId: 'task_risk',
      }));
    });
    expect(await screen.findByText('任务 Agent 正在执行')).toBeTruthy();
    expect(screen.queryByText(/Claude Code run 已在后台启动/)).toBeNull();
    expect(screen.queryByText(/只读执行中；完成后会整理结果/)).toBeNull();
  });

  it('keeps Codex CLI mode disabled until the manual-run runtime is authenticated', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      runtimeMode: 'codex',
      agentCliRuntimeStatus: {
        catalogueCount: 2,
        detectedCount: 1,
        readyCount: 0,
        runningCount: 0,
        errorCount: 0,
        manualRunCount: 1,
        readyManualRunCount: 0,
        updatedAt: '2026-05-19T00:00:00.000Z',
        runtimes: [
          {
            id: 'codex',
            label: 'Codex CLI',
            command: 'codex',
            installed: true,
            version: 'codex 0.42.0',
            authState: 'needs_login',
            executionSupport: 'manual_run',
            workload: 'idle',
            missingReason: 'Codex CLI is installed but not logged in; run codex login.',
          },
        ],
      },
    }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();

    expect(await screen.findByText('Codex CLI 不可用')).toBeTruthy();
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '用 Codex CLI 检查下一步。');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(harness.api.triggerAgentCliRun).not.toHaveBeenCalled();
    expect(harness.api.chatWithAI).not.toHaveBeenCalled();
    expect(await screen.findByText(/不会在未说明的情况下切换到另一条 AI Runtime/)).toBeTruthy();
  });

  it('refreshes Codex CLI mode availability after AI Runtime settings change', async () => {
    const user = userEvent.setup();
    const needsLogin = buildAiStatus({
      runtimeMode: 'codex',
      agentCliRuntimeStatus: {
        catalogueCount: 2,
        detectedCount: 1,
        errorCount: 0,
        manualRunCount: 1,
        readyCount: 0,
        readyManualRunCount: 0,
        runningCount: 0,
        updatedAt: '2026-05-19T00:00:00.000Z',
        runtimes: [
          {
            id: 'codex',
            label: 'Codex CLI',
            command: 'codex',
            installed: true,
            version: 'codex 0.42.0',
            authState: 'needs_login',
            executionSupport: 'manual_run',
            workload: 'idle',
            missingReason: 'Codex CLI is installed but not logged in; run codex login.',
          },
        ],
      },
    });
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(needsLogin);
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();
    expect(await screen.findByText('Codex CLI 不可用')).toBeTruthy();

    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    harness.emit('settings.changed');

    await waitFor(() => {
      expect(screen.getByText('Codex CLI')).toBeTruthy();
    });
  });

  it('allows Codex CLI mode when the official CLI is ready without a configured workspace root', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      runtimeMode: 'codex',
      apiKeyStored: false,
      configured: false,
      configuredProviders: [],
      workspaceRoot: null,
    }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();

    expect(await screen.findByText('Codex CLI')).toBeTruthy();
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '用 Codex CLI 检查下一步。');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(harness.api.triggerAgentCliRun).toHaveBeenCalledWith(expect.objectContaining({
      runtimeId: 'codex',
      taskId: 'task_risk',
    }));
  });

  it('summarizes a background Codex CLI run when the terminal run event arrives', async () => {
    const user = userEvent.setup();
    const pendingProposal: TaskMemoryWriteProposal = {
      contentTemplate: [
        '# Task Record: 董事会材料修订',
        '',
        '## Summary',
        'Codex CLI final answer.',
        '',
        '## Confirmed',
        '- Completion conditions checked: 2',
        '  - Run Goal Contract 包含目标',
        '  - 任务记忆提案出现',
        '',
        '## Next',
        '- 继续检查任务动态里的验收记录。',
        '',
        '## Verification',
        '- Agent CLI process exited successfully.',
        '',
        '## Risks',
        '- 需要用户确认后才能写入任务记忆。',
        '',
        '## Links',
        '- Run: run_agent_cli_created',
      ].join('\n'),
      operation: 'create',
      path: 'Task Records/2026-01-01-memory-guidance.md',
      reason: '最新任务记忆建议仍缺少对应写入：Task Record。',
      target: 'task_record',
      title: '创建任务记录',
    };
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    vi.mocked(harness.api.getRunDetail).mockImplementation(async (runId) => {
      const run = harness.runs.find((item) => item.id === runId);
      if (!run) return null;
      return buildRunDetail(run, {
        taskMemoryWriteProposals: run.id === 'run_agent_cli_created' ? [pendingProposal] : [],
      });
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    expect(await screen.findByText(/已切换到任务上下文/)).toBeTruthy();

    expect(await screen.findByText('Codex CLI')).toBeTruthy();
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '用 Codex CLI 检查下一步。');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(await screen.findByText('任务 Agent 正在执行')).toBeTruthy();

    const run = harness.runs.find((item) => item.id === 'run_agent_cli_created');
    expect(run).toBeTruthy();
    Object.assign(run!, {
      output: 'Codex CLI final answer.',
      outputSource: 'ai',
      status: 'completed',
    });
    harness.emit('run.changed', 'run_agent_cli_created');

    expect(await screen.findByText(/已完成，结果已记录到任务动态/)).toBeTruthy();
    expect(screen.queryByText(/Codex CLI run 已完成/)).toBeNull();
    expect(screen.queryByText(/生成了待确认的任务记录提案/)).toBeNull();
    expect(screen.queryByText('任务记忆写入提案')).toBeNull();
    expect(harness.api.createTaskFile).not.toHaveBeenCalledWith(expect.objectContaining({
      path: 'Task Records/2026-01-01-memory-guidance.md',
    }));
    expect(screen.queryByText(/任务 Agent 正在执行/)).toBeNull();
  });

  it('turns Agent CLI decomposition output into confirmable child tasks', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    const task = harness.tasks.find((item) => item.id === 'task_risk')!;
    task.taskType = 'project';
    task.taskFacets = ['project'];
    harness.details.task_risk = buildTaskDetail(task);
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '请拆解这个任务。');
    await user.click(screen.getByRole('button', { name: '发送' }));

    const run = harness.runs.find((item) => item.id === 'run_agent_cli_created');
    expect(run).toBeTruthy();
    Object.assign(run!, {
      output: [
        '已形成子任务草案。',
        '```json',
        JSON.stringify({
          type: 'TASKPLANE_DECOMPOSITION',
          review: '按交付阶段拆解，确认后创建子任务。',
          nextStep: '确认后进入第一个子任务。',
          subtasks: [
            {
              title: '确认材料边界',
              summary: '梳理董事会材料范围、截止时间和关键输入。',
              acceptanceCriteria: '范围和输入已确认。',
              dependency: '父任务目标',
            },
            {
              title: '完成初稿修订',
              summary: '根据已确认边界完成第一版修订。',
              acceptanceCriteria: '初稿可供审阅。',
              dependency: '确认材料边界',
            },
          ],
        }),
        '```',
      ].join('\n'),
      outputSource: 'ai',
      status: 'completed',
    });
    harness.emit('run.changed', 'run_agent_cli_created');

    expect(await screen.findByText('子任务草案')).toBeTruthy();
    expect(screen.getAllByText(/确认材料边界/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/完成初稿修订/).length).toBeGreaterThan(0);
    expect(screen.queryByText('任务记忆写入提案')).toBeNull();
    expect(screen.queryByRole('button', { name: '收尾本阶段' })).toBeNull();
    expect(screen.queryByRole('button', { name: '生成文件提案' })).toBeNull();

    await user.click(screen.getByRole('button', { name: '确认创建子任务' }));
    await waitFor(() => {
      expect(harness.api.createTask).toHaveBeenCalledWith(expect.objectContaining({
        parentTaskId: 'task_risk',
        taskFacets: ['simple'],
        taskType: 'simple',
        title: '确认材料边界',
      }));
    });
    expect(harness.api.createTask).toHaveBeenCalledWith(expect.objectContaining({
      parentTaskId: 'task_risk',
      title: '完成初稿修订',
    }));
    expect(harness.api.transitionTask).toHaveBeenCalledWith(expect.objectContaining({
      nextState: 'planned',
    }));
    expect(await screen.findByText(/已根据拆解草案创建 2 个子任务/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '收尾本阶段' })).toBeNull();
    expect(screen.queryByRole('button', { name: '生成文件提案' })).toBeNull();
  });

  it('surfaces Agent CLI task record write intents as confirmed file proposals', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '请保存本轮结论。');
    await user.click(screen.getByRole('button', { name: '发送' }));

    const run = harness.runs.find((item) => item.id === 'run_agent_cli_created');
    expect(run).toBeTruthy();
    Object.assign(run!, {
      output: [
        '已整理为任务记录。',
        '```json',
        JSON.stringify({
          type: 'TASKPLANE_WRITE_INTENTS',
          intents: [{
            type: 'task_record.create',
            confidence: 'high',
            content: '# 本轮结论\n- 已确认应保存为任务记录。',
          }],
        }),
        '```',
      ].join('\n'),
      outputSource: 'ai',
      status: 'completed',
    });
    harness.emit('run.changed', 'run_agent_cli_created');

    expect(await screen.findByText('任务记录写入提案')).toBeTruthy();
    expect(screen.getByText(/来自 Agent 结构化意图/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '确认写入记录' }));
    await waitFor(() => {
      expect(harness.api.createTaskFile).toHaveBeenCalledWith(expect.objectContaining({
        content: '# 本轮结论\n- 已确认应保存为任务记录。',
        path: expect.stringMatching(/^Task Records\/\d{4}-\d{2}-\d{2}-.*-agent-record\.md$/),
      }));
    });
  });

  it('surfaces Agent CLI task file write intents as confirmed file proposals', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '请保存这个教程大纲。');
    await user.click(screen.getByRole('button', { name: '发送' }));

    const run = harness.runs.find((item) => item.id === 'run_agent_cli_created');
    expect(run).toBeTruthy();
    Object.assign(run!, {
      output: [
        '已整理为任务文件草稿。',
        '```json',
        JSON.stringify({
          type: 'TASKPLANE_WRITE_INTENTS',
          intents: [{
            type: 'task_file.propose',
            path: 'Drafts/codex-tutorial-outline.md',
            content: '# Codex 教程大纲\n\n- 入门路径',
            summary: '保存首版教程大纲。',
          }],
        }),
        '```',
      ].join('\n'),
      outputSource: 'ai',
      status: 'completed',
    });
    harness.emit('run.changed', 'run_agent_cli_created');

    expect(await screen.findByText('任务文件写入提案')).toBeTruthy();
    expect(screen.getByText('保存首版教程大纲。')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '确认写入文件' }));
    await waitFor(() => {
      expect(harness.api.createTaskFile).toHaveBeenCalledWith(expect.objectContaining({
        content: '# Codex 教程大纲\n\n- 入门路径',
        path: 'Drafts/codex-tutorial-outline.md',
        taskId: 'task_risk',
      }));
    });
  });

  it('surfaces Agent CLI source context write intents as confirmed source proposals', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '请保存这个来源。');
    await user.click(screen.getByRole('button', { name: '发送' }));

    const run = harness.runs.find((item) => item.id === 'run_agent_cli_created');
    expect(run).toBeTruthy();
    Object.assign(run!, {
      output: [
        '发现一个可保存来源。',
        '```json',
        JSON.stringify({
          type: 'TASKPLANE_WRITE_INTENTS',
          intents: [{
            type: 'source_context.create',
            title: 'Codex docs',
            uri: 'https://example.com/codex',
            note: '用于后续核对 Codex 教程内容。',
            credibility: 'unknown',
          }],
        }),
        '```',
      ].join('\n'),
      outputSource: 'ai',
      status: 'completed',
    });
    harness.emit('run.changed', 'run_agent_cli_created');

    expect(await screen.findByText('来源上下文写入提案')).toBeTruthy();
    expect(screen.getByText(/Codex docs/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '确认保存来源' }));
    await waitFor(() => {
      expect(harness.api.createSourceContext).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'link',
        note: '用于后续核对 Codex 教程内容。',
        runId: 'run_agent_cli_created',
        taskId: 'task_risk',
        title: 'Codex docs',
        uri: 'https://example.com/codex',
      }));
    });
  });

  it('surfaces Agent CLI artifact write intents as confirmed artifact proposals', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '请保存这个教程结构产物。');
    await user.click(screen.getByRole('button', { name: '发送' }));

    const run = harness.runs.find((item) => item.id === 'run_agent_cli_created');
    expect(run).toBeTruthy();
    Object.assign(run!, {
      output: [
        '已整理为任务产物。',
        '```json',
        JSON.stringify({
          type: 'TASKPLANE_WRITE_INTENTS',
          intents: [{
            type: 'artifact.propose',
            title: 'codex-tutorial-structure.md',
            content: '# 首版教程结构\n\n- 入门\n- 案例',
            summary: '保存教程结构产物。',
          }],
        }),
        '```',
      ].join('\n'),
      outputSource: 'ai',
      status: 'completed',
    });
    harness.emit('run.changed', 'run_agent_cli_created');

    expect(await screen.findByText('任务产物写入提案')).toBeTruthy();
    expect(screen.getByText('保存教程结构产物。')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '确认保存产物' }));
    await waitFor(() => {
      expect(harness.api.createManualArtifact).toHaveBeenCalledWith(expect.objectContaining({
        content: '# 首版教程结构\n\n- 入门\n- 案例',
        taskId: 'task_risk',
        title: 'codex-tutorial-structure.md',
      }));
    });
  });

  it('surfaces Agent CLI structured write intents as confirmed product writebacks', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '请记录这个决策。');
    await user.click(screen.getByRole('button', { name: '发送' }));

    const run = harness.runs.find((item) => item.id === 'run_agent_cli_created');
    expect(run).toBeTruthy();
    Object.assign(run!, {
      output: [
        '建议把首版范围作为待确认决策。',
        '```json',
        JSON.stringify({
          type: 'TASKPLANE_WRITE_INTENTS',
          intents: [{
            type: 'decision.create',
            title: '确认首版范围',
            rationale: '已从任务讨论中收敛到基础教程与案例展示，适合先作为首版边界。',
            options: ['确认首版范围', '继续扩大范围'],
            proposedOutcome: '确认首版范围',
          }],
        }),
        '```',
      ].join('\n'),
      outputSource: 'ai',
      status: 'completed',
    });
    harness.emit('run.changed', 'run_agent_cli_created');

    expect(await screen.findByText('结构化写回提案')).toBeTruthy();
    expect(screen.getByText('决策提案：确认首版范围')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '确认执行' }));
    await waitFor(() => {
      expect(harness.api.createDecision).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'direction_choice',
        sourceId: 'run_agent_cli_created',
        sourceType: 'run',
        taskId: 'task_risk',
        title: '确认首版范围',
      }));
    });
    expect(await screen.findByText(/已确认并创建 Decision：确认首版范围/)).toBeTruthy();
  });

  it('summarizes Agent CLI web research activity after completed native runs', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '请先调研 Codex 教程资料。');
    await user.click(screen.getByRole('button', { name: '发送' }));

    const run = harness.runs.find((item) => item.id === 'run_agent_cli_created') as RunRecord & { steps?: RunStepRecord[] };
    expect(run).toBeTruthy();
    Object.assign(run, {
      output: '已基于官方资料形成首版范围。',
      outputSource: 'ai',
      status: 'completed',
      steps: [
        buildRunStep({
          id: 'step_web_prep',
          runId: 'run_agent_cli_created',
          index: 0,
          title: 'Agent CLI 联网调研准备',
          output: [
            'status=captured',
            'capability_mode=native',
            'sources=3',
            'batch_id=web-research:task_1:2026-05-19T00:00:00.000Z',
            'source_context_ids=source_context_1,source_context_2,source_context_3',
            'query=Codex CLI 教程',
            'reason=Taskplane captured web research into Source Context before handing the task to the selected Agent CLI.',
          ].join('\n'),
        }),
        buildRunStep({
          id: 'step_native_search',
          runId: 'run_agent_cli_created',
          index: 1,
          title: 'Codex CLI 联网检索：web_search',
          output: 'capability=web_search\nprovider_event=tool.result\nFound official Codex docs.',
        }),
      ],
    });
    harness.emit('run.changed', 'run_agent_cli_created');

    expect(await screen.findByText(/联网调研：已保存 3 个来源到来源上下文.*查询：Codex CLI 教程.*证据：source_context_1,source_context_2,source_context_3/)).toBeTruthy();
    expect(screen.getByText(/原生 CLI 联网动作：.*web_search/)).toBeTruthy();
  });

  it('summarizes Agent CLI web research source persistence failures as unsaved evidence', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '请先调研 Codex 教程资料。');
    await user.click(screen.getByRole('button', { name: '发送' }));

    const run = harness.runs.find((item) => item.id === 'run_agent_cli_created') as RunRecord & { steps?: RunStepRecord[] };
    expect(run).toBeTruthy();
    Object.assign(run, {
      output: '已交给原生 CLI 继续调研。',
      outputSource: 'ai',
      status: 'completed',
      steps: [
        buildRunStep({
          id: 'step_web_prep_failed_save',
          runId: 'run_agent_cli_created',
          index: 0,
          title: 'Agent CLI 联网调研准备',
          output: [
            'status=skipped',
            'capability_mode=native',
            'sources=0',
            'query=Codex CLI 教程',
            'reason=Taskplane web research produced 2 source context item(s), but none could be saved. Selected native CLI web/search is unverified by the current probe; Taskplane will only project native web/search when visible events appear.',
          ].join('\n'),
        }),
      ],
    });
    harness.emit('run.changed', 'run_agent_cli_created');

    expect(await screen.findByText(/联网调研：已获取来源但未能保存/)).toBeTruthy();
    expect(screen.queryByText(/联网调研：未执行/)).toBeNull();
    expect(screen.queryByText(/已保存 0 个来源到来源上下文/)).toBeNull();
  });

  it('summarizes Agent CLI local command activity after completed native runs', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '请检查当前工作区路径。');
    await user.click(screen.getByRole('button', { name: '发送' }));

    const run = harness.runs.find((item) => item.id === 'run_agent_cli_created') as RunRecord & { steps?: RunStepRecord[] };
    expect(run).toBeTruthy();
    Object.assign(run, {
      output: '当前工作区路径为 /Users/caoq/git/asterism。',
      outputSource: 'ai',
      status: 'completed',
      steps: [
        buildRunStep({
          id: 'step_native_command',
          runId: 'run_agent_cli_created',
          index: 0,
          title: 'Codex CLI 命令执行：command_execution',
          output: 'capability=shell_command\nprovider_event=item.completed\ncommand=/bin/zsh -lc pwd\noutput=/Users/caoq/git/asterism',
        }),
      ],
    });
    harness.emit('run.changed', 'run_agent_cli_created');

    expect(await screen.findByText(/原生 CLI 本地动作：.*命令执行/)).toBeTruthy();
    expect(screen.getByText(/当前工作区路径为/)).toBeTruthy();
  });

  it('summarizes native workspace search as local activity instead of web research', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '请搜索本地任务推进代码。');
    await user.click(screen.getByRole('button', { name: '发送' }));

    const run = harness.runs.find((item) => item.id === 'run_agent_cli_created') as RunRecord & { steps?: RunStepRecord[] };
    expect(run).toBeTruthy();
    Object.assign(run, {
      output: '已完成本地检索。',
      outputSource: 'ai',
      status: 'completed',
      steps: [
        buildRunStep({
          id: 'step_workspace_search',
          runId: 'run_agent_cli_created',
          index: 0,
          title: 'Codex CLI 工作区读取：workspace.search',
          output: 'capability=workspace_read\nprovider_event=tool.call\n{"query":"TaskAdvancementOrchestrator"}',
        }),
      ],
    });
    harness.emit('run.changed', 'run_agent_cli_created');

    expect(await screen.findByText(/原生 CLI 本地动作：.*工作区读取/)).toBeTruthy();
    expect(screen.queryByText(/原生 CLI 联网动作/)).toBeNull();
  });

  it('summarizes native workspace write steps as reviewable candidates after completed runs', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '请处理本地 patch。');
    await user.click(screen.getByRole('button', { name: '发送' }));

    const run = harness.runs.find((item) => item.id === 'run_agent_cli_created') as RunRecord & { steps?: RunStepRecord[] };
    expect(run).toBeTruthy();
    Object.assign(run, {
      output: '已生成 patch 候选。',
      outputSource: 'ai',
      status: 'completed',
      steps: [
        buildRunStep({
          id: 'step_workspace_write_candidate',
          runId: 'run_agent_cli_created',
          index: 0,
          title: 'Codex CLI 工作区写入候选：apply_patch',
          output: 'capability=workspace_write\nprovider_event=item.completed\napply_patch changed src/app.ts',
        }),
      ],
    });
    harness.emit('run.changed', 'run_agent_cli_created');

    expect(await screen.findByText(/原生 CLI 工作区写入候选：.*apply_patch/)).toBeTruthy();
    expect(screen.getByText(/不会直接写入工作区/)).toBeTruthy();
    expect(screen.getByText(/patch artifact、ready task_file Write Intent、ready patch artifact Write Intent 或 patch-review\/promotion evidence 审查/)).toBeTruthy();
    expect(screen.queryByText(/原生 CLI 本地动作：.*工作区写入候选/)).toBeNull();
  });

  it('keeps workspace write candidates visible when completed runs also include web activity', async () => {
    const user = userEvent.setup();
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    await user.type(screen.getByPlaceholderText(/关于「董事会材料修订」/), '请调研并处理 patch。');
    await user.click(screen.getByRole('button', { name: '发送' }));

    const run = harness.runs.find((item) => item.id === 'run_agent_cli_created') as RunRecord & { steps?: RunStepRecord[] };
    expect(run).toBeTruthy();
    Object.assign(run, {
      output: '已生成 patch 候选。',
      outputSource: 'ai',
      status: 'completed',
      steps: [
        buildRunStep({
          id: 'step_web_prep',
          runId: 'run_agent_cli_created',
          index: 0,
          title: 'Agent CLI 联网调研准备',
          output: [
            'status=captured',
            'sources=2',
            'query=Taskplane patch promotion',
            'reason=Taskplane captured 2 / 2 source context item(s).',
          ].join('\n'),
        }),
        buildRunStep({
          id: 'step_native_web',
          runId: 'run_agent_cli_created',
          index: 1,
          title: 'Codex CLI 联网检索：web_search',
          output: 'capability=web_search\nprovider_event=item.completed\nFound source.',
        }),
        buildRunStep({
          id: 'step_workspace_write_candidate',
          runId: 'run_agent_cli_created',
          index: 2,
          title: 'Codex CLI 工作区写入候选：apply_patch',
          output: 'capability=workspace_write\nprovider_event=item.completed\napply_patch changed src/app.ts',
        }),
      ],
    });
    harness.emit('run.changed', 'run_agent_cli_created');

    expect(await screen.findByText(/联网调研：已保存 2 个来源到来源上下文/)).toBeTruthy();
    expect(screen.getByText(/原生 CLI 工作区写入候选：.*apply_patch/)).toBeTruthy();
    expect(screen.getByText(/不会直接写入工作区/)).toBeTruthy();
    expect(screen.getByText(/patch artifact、ready task_file Write Intent、ready patch artifact Write Intent 或 patch-review\/promotion evidence 审查/)).toBeTruthy();
    expect(screen.queryByText(/原生 CLI 联网动作/)).toBeNull();
  });

  it('captures a global right-panel discussion as a task before planning', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Search or ask/ }));
    expect(await screen.findByText(/重要内容会进入任务记忆/)).toBeTruthy();
    expect(screen.queryByText('把待办整理成任务')).toBeNull();
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
        taskType: 'simple',
        taskFacets: ['simple'],
      });
    });
    expect(await screen.findByText(/已捕获为任务/)).toBeTruthy();
    expect(screen.getByText(/确认后才进入 Tasks/)).toBeTruthy();
    expect(screen.getByText(/如果需要调整类型、补齐上下文或拆解项目/)).toBeTruthy();
    expect(screen.getByText(/这是待确认任务/)).toBeTruthy();
    expect(screen.getByText(/放弃需要二次确认/)).toBeTruthy();
    expect(await screen.findByPlaceholderText(/关于「准备投资人沟通材料」/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '判断任务类型' })).toBeNull();
    expect(screen.queryByRole('button', { name: /规划下一步|拆解项目结构/ })).toBeNull();
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

  it('persists inferred project type when capturing project-like global discussion', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Search or ask/ }));
    const input = await screen.findByPlaceholderText(/搜索、提问或捕获任务想法/);
    await user.type(input, '创建任务：开发小程序');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText(/这段讨论可以先捕获为任务/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '捕获为任务' }));

    await waitFor(() => {
      expect(harness.api.createTask).toHaveBeenCalledWith({
        title: '创建任务：开发小程序',
        summary: '从右侧面板捕获：创建任务：开发小程序',
        taskType: 'project',
        taskFacets: ['project'],
      });
    });
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

    expect(screen.queryByText(/自动刷新/)).toBeNull();
    expect(harness.api.createSourceContext).not.toHaveBeenCalledWith(expect.objectContaining({
      title: '会话刷新前保全',
    }));
    expect(harness.api.createTaskFile).not.toHaveBeenCalledWith(expect.objectContaining({
      path: expect.stringContaining('Task Records/'),
    }));
    expect(await screen.findByPlaceholderText(/关于「董事会材料修订」/)).toBeTruthy();
  });

  it('archives and refreshes a task session through one managed action', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /继续推进/ }));
    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);
    for (const prompt of [
      '这轮先保留 Playwright 作为动态页面候选',
      '不对，先把 Playwright 放到验证方案里',
      '改成先确认 Playwright 是否真的需要',
    ]) {
      await user.type(input, prompt);
      await user.click(screen.getByRole('button', { name: '发送' }));
      await waitFor(() => {
        expect(harness.api.chatWithAI).toHaveBeenCalled();
      });
    }

    await user.click(await screen.findByRole('button', { name: '整理并刷新' }));
    expect(await screen.findByText(/已整理并刷新/)).toBeTruthy();
    expect(harness.api.createTaskFile).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_risk',
      path: expect.stringMatching(/^Task Records\/\d{4}-\d{2}-\d{2}-context-refresh-handoff\.md$/),
      content: expect.stringContaining('Playwright'),
    }));
    expect(screen.queryByRole('button', { name: '整理并刷新' })).toBeNull();
  });

  it('refreshes business-line chat into a Business Record without requiring a task id', async () => {
    const user = userEvent.setup();
    const homeBrief = buildBriefData(harness.tasks, harness.decisions);
    homeBrief.businessLineSuggestions = [{
      id: 'business-line-progress:business_line_refresh_only',
      type: 'progress',
      businessLineId: 'business_line_refresh_only',
      businessLineTitle: 'Refresh-only product',
      whyNow: 'Business-line discussion needs durable recovery memory.',
      expectedImpact: 'Keep future business-line context aligned.',
      effort: { level: 'low', note: null },
      confidence: 80,
      nextStep: 'Preserve the business-line handoff.',
      sourceRecords: ['business record: prior context'],
      sourceRecordIds: ['business_line_record_prior'],
      risk: { level: 'low', note: null },
      requiresDecision: false,
      taskId: null,
    }];
    vi.mocked(harness.api.getHomeBrief).mockResolvedValueOnce(homeBrief);
    vi.mocked(harness.api.chatWithAI!).mockResolvedValue({
      text: '已按业务线上下文记录这次判断。',
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'AI 协助' }));
    expect(await screen.findByText('Context: Business Line / Refresh-only product')).toBeTruthy();
    const input = await screen.findByPlaceholderText(/关于「Refresh-only product」/);
    await user.clear(input);
    for (const prompt of [
      '目标是保留 onboarding 增长判断。',
      '不对，改成先验证激活来源。',
      '改成下一步保存业务线证据。',
    ]) {
      await user.type(input, prompt);
      await user.click(screen.getByRole('button', { name: '发送' }));
      await waitFor(() => {
        expect(harness.api.chatWithAI).toHaveBeenCalled();
      });
    }

    expect(await screen.findByText('Preservation target: Business Record')).toBeTruthy();
    expect(screen.getAllByText(/Recovery/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Excluded: Raw transcript/)).toBeTruthy();
    expect(screen.getByText(/Business memory: needs_memory_write/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '整理并刷新' }));

    await waitFor(() => {
      expect(harness.api.createBusinessLineRecord).toHaveBeenCalledWith(expect.objectContaining({
        businessLineId: 'business_line_refresh_only',
        shouldAffectFutureContext: true,
        source: 'panel.context_refresh',
        summary: expect.stringContaining('改成下一步保存业务线证据'),
        type: 'review',
      }));
    });
    expect(harness.api.createTaskFile).not.toHaveBeenCalledWith(expect.objectContaining({
      path: expect.stringContaining('Task Records/'),
    }));
    expect(await screen.findByText(/已整理并刷新/)).toBeTruthy();
  });

  it('keeps business-line Next Action refresh on Task Records for execution recovery', async () => {
    const user = userEvent.setup();
    const homeBrief = buildBriefData(harness.tasks, harness.decisions);
    homeBrief.businessLineSuggestions = [{
      id: 'business-line-progress:business_line_next_action_refresh:task_risk',
      type: 'progress',
      businessLineId: 'business_line_next_action_refresh',
      businessLineTitle: 'Next Action refresh product',
      whyNow: 'The active next action needs execution recovery.',
      expectedImpact: 'Recover implementation state after refresh.',
      effort: { level: 'medium', note: null },
      confidence: 82,
      nextStep: 'Continue the verification task.',
      sourceRecords: ['review: execution state'],
      sourceRecordIds: ['business_line_review_execution'],
      risk: { level: 'medium', note: null },
      requiresDecision: false,
      taskId: 'task_risk',
    }];
    vi.mocked(harness.api.getHomeBrief).mockResolvedValueOnce(homeBrief);
    vi.mocked(harness.api.chatWithAI!).mockResolvedValue({
      text: '收到，我会按执行恢复上下文推进。',
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'AI 协助' }));
    expect(await screen.findByText(/Context: Business Line \/ Next Action refresh product \/ Next Action/)).toBeTruthy();
    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);
    await user.clear(input);
    for (const prompt of [
      '这轮先保留 Playwright 作为动态页面候选',
      '不对，先把 Playwright 放到验证方案里',
      '改成先确认 Playwright 是否真的需要',
    ]) {
      await user.type(input, prompt);
      await user.click(screen.getByRole('button', { name: '发送' }));
      await waitFor(() => {
        expect(harness.api.chatWithAI).toHaveBeenCalled();
      });
    }

    expect(await screen.findByText('Preservation target: Task Record')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '整理并刷新' }));
    await waitFor(() => {
      expect(harness.api.createTaskFile).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_risk',
        path: expect.stringMatching(/^Task Records\/\d{4}-\d{2}-\d{2}-context-refresh-handoff\.md$/),
        content: expect.stringContaining('Playwright'),
      }));
    });
    expect(harness.api.createBusinessLineRecord).not.toHaveBeenCalledWith(expect.objectContaining({
      businessLineId: 'business_line_next_action_refresh',
    }));
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
    expect(await screen.findByText(/已确认并写入任务记忆/)).toBeTruthy();
    expect(screen.getByText(/pending-memory gate/)).toBeTruthy();
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
    expect(await screen.findByText('Context: Global')).toBeTruthy();
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

  it('projects legacy phase follow-up tasks under the matching project without writing local hierarchy repair', async () => {
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
    }
    saveTaskAttributes(project.id, {
      type: 'project',
      typeConfirmed: true,
      childTaskIds: ['existing_child_1', 'existing_child_2', 'existing_child_3', 'existing_child_4', 'existing_child_5'],
    });

    const user = userEvent.setup();
    window.location.hash = 'tasks';
    render(<App />);

    expect(await screen.findByText('开发小程序')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /一次性任务/ }));
    expect(screen.queryByText('拆解下一步：开发小程序')).toBeNull();
    expect(screen.queryByText('实现调整：开发小程序')).toBeNull();
    expect(screen.queryByText('验收回归：开发小程序')).toBeNull();
    await user.click(screen.getByRole('button', { name: /项目型/ }));
    const projectTitle = (await screen.findAllByText('开发小程序'))
      .find((element) => element.className === 'task-row-title');
    expect(projectTitle).toBeTruthy();
    await user.click(projectTitle!);
    expect(await screen.findByText('项目结构')).toBeTruthy();
    expect(screen.getByText('拆解下一步：开发小程序')).toBeTruthy();
    expect(screen.getByText('实现调整：开发小程序')).toBeTruthy();
    expect(screen.getByText('验收回归：开发小程序')).toBeTruthy();

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
      expect(attrs[task.id]).toBeUndefined();
    }
  });

  it('keeps orphaned project dependency-chain tasks out of the top-level simple group', async () => {
    const project = buildTask({
      id: 'task_project_orphan_chain',
      title: '开发小程序',
      taskType: 'simple',
      taskFacets: ['simple'],
      childTaskIds: [],
      nextStep: '确认项目拆解后继续推进。',
      state: 'planned',
    });
    const requirement = buildTask({
      id: 'task_orphan_requirement',
      title: '小程序需求分析与功能设计',
      taskType: 'simple',
      parentTaskId: null,
      childTaskIds: [],
      state: 'planned',
    });
    const development = buildTask({
      id: 'task_orphan_development',
      title: '小程序前后端开发与联调',
      taskType: 'simple',
      parentTaskId: null,
      childTaskIds: [],
      activeDependency: buildTaskDependency({
        id: 'dependency_orphan_development',
        taskId: 'task_orphan_development',
        blockedByTaskId: requirement.id,
        blockedByTaskTitle: requirement.title,
      }),
      state: 'planned',
    });
    const testing = buildTask({
      id: 'task_orphan_testing',
      title: '小程序测试、安全加固与性能优化',
      taskType: 'simple',
      parentTaskId: null,
      childTaskIds: [],
      activeDependency: buildTaskDependency({
        id: 'dependency_orphan_testing',
        taskId: 'task_orphan_testing',
        blockedByTaskId: development.id,
        blockedByTaskTitle: development.title,
      }),
      state: 'planned',
    });
    const unrelated = buildTask({
      id: 'task_orphan_unrelated',
      title: '小程序资料归档',
      taskType: 'simple',
      parentTaskId: null,
      childTaskIds: [],
      state: 'planned',
    });
    const followups = [
      buildTask({ id: 'task_orphan_followup_1', title: '拆解下一步：开发小程序', taskType: 'simple', parentTaskId: null, childTaskIds: [], state: 'planned' }),
      buildTask({ id: 'task_orphan_followup_2', title: '实现调整：开发小程序', taskType: 'simple', parentTaskId: null, childTaskIds: [], state: 'planned' }),
      buildTask({ id: 'task_orphan_followup_3', title: '验收回归：开发小程序', taskType: 'simple', parentTaskId: null, childTaskIds: [], state: 'planned' }),
    ];
    harness.tasks.unshift(project, requirement, development, testing, unrelated, ...followups);
    for (const task of [project, requirement, development, testing, unrelated, ...followups]) {
      harness.details[task.id] = buildTaskDetail(task);
    }

    const user = userEvent.setup();
    window.location.hash = 'tasks';
    render(<App />);

    let orderedTitles: string[] = [];
    await waitFor(() => {
      const cards = Array.from(document.querySelectorAll('.execution-queue-card')) as HTMLElement[];
      orderedTitles = cards.map((card) => card.textContent ?? '').filter((text) => text.includes('小程序'));
      expect(orderedTitles.some((text) => text.includes('开发小程序'))).toBe(true);
    });
    expect(orderedTitles.some((text) => text.includes('开发小程序'))).toBe(true);
    expect(orderedTitles.some((text) => text.includes('小程序资料归档'))).toBe(true);
    expect(orderedTitles.some((text) => text.includes('小程序前后端开发与联调'))).toBe(false);
    expect(orderedTitles.some((text) => text.includes('小程序测试、安全加固与性能优化'))).toBe(false);
    expect(orderedTitles.some((text) => text.includes('验收回归：开发小程序'))).toBe(false);
    expect(orderedTitles.some((text) => text.includes('实现调整：开发小程序'))).toBe(false);
    expect(orderedTitles.some((text) => text.includes('拆解下一步：开发小程序'))).toBe(false);

    await user.click(screen.getByRole('button', { name: /一次性任务/ }));
    const taskTypeChildren = document.querySelector('.task-type-children') as HTMLElement | null;
    expect(taskTypeChildren?.querySelector('[data-title="开发小程序"]')).toBeNull();
    expect(taskTypeChildren?.querySelector('[data-title="小程序资料归档"]')).toBeTruthy();
    expect(taskTypeChildren?.querySelector('[data-title="小程序前后端开发与联调"]')).toBeNull();
    expect(taskTypeChildren?.querySelector('[data-title="小程序测试、安全加固与性能优化"]')).toBeNull();
    expect(taskTypeChildren?.querySelector('[data-title="验收回归：开发小程序"]')).toBeNull();
    expect(taskTypeChildren?.querySelector('[data-title="实现调整：开发小程序"]')).toBeNull();
    expect(taskTypeChildren?.querySelector('[data-title="拆解下一步：开发小程序"]')).toBeNull();

    await user.click(screen.getByRole('button', { name: /项目型/ }));
    const projectTypeGroup = document.querySelector('.task-type-group .lens-item.active')?.closest('.task-type-group') as HTMLElement | null;
    expect(projectTypeGroup?.querySelector('[data-title="开发小程序"]')).toBeTruthy();
    expect(projectTypeGroup?.querySelector('[data-title="小程序资料归档"]')).toBeNull();

    await user.click(screen.getByRole('button', { name: /当前建议/ }));
    const projectCard = Array.from(document.querySelectorAll('.execution-queue-card'))
      .find((card) => card.textContent?.includes('开发小程序')) as HTMLElement | undefined;
    expect(projectCard).toBeTruthy();
    await user.click(projectCard!);
    expect(await screen.findByText('项目型')).toBeTruthy();
    expect(await screen.findByText('项目结构')).toBeTruthy();
    expect(screen.getByText('小程序需求分析与功能设计')).toBeTruthy();
    expect(screen.getByText('小程序前后端开发与联调')).toBeTruthy();
    expect(screen.getByText('小程序测试、安全加固与性能优化')).toBeTruthy();
    expect(screen.getByText('验收回归：开发小程序')).toBeTruthy();
    expect(screen.getByText('实现调整：开发小程序')).toBeTruthy();
    expect(screen.getByText('拆解下一步：开发小程序')).toBeTruthy();
    expect(screen.queryByText('小程序资料归档')).toBeNull();
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

    await user.click(await screen.findByRole('button', { name: '整理并刷新' }));
    expect(await screen.findByText(/已整理并刷新/)).toBeTruthy();
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

    await user.click(await screen.findByRole('button', { name: '整理并刷新' }));
    expect(await screen.findByText(/已整理并刷新/)).toBeTruthy();
    expect(harness.api.createTaskFile).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_risk',
      path: expect.stringMatching(/^Task Records\/\d{4}-\d{2}-\d{2}-context-refresh-handoff\.md$/),
      content: expect.stringContaining('改成先补法务意见'),
    }));
  });

  it('uses the compression threshold preference for right-panel session refresh suggestions', async () => {
    vi.mocked(harness.api.chatWithAI!).mockResolvedValue({
      text: '已记录这条补充，我们先保持当前任务线继续推进。',
    });
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
    expect(await screen.findByText('Agent API')).toBeTruthy();
    const input = await screen.findByPlaceholderText(/关于「董事会材料修订」/);
    const longContextChunk = '这轮需要保留董事会材料的上下文：现金流页、CEO 批注、法务意见、截止时间、交付范围和风险说明都要一起考虑。'.repeat(38);

    for (const prompt of [1, 2, 3, 4]) {
      fireEvent.change(input, {
        target: { value: `${longContextChunk} 第 ${prompt} 段。` },
      });
      await user.click(screen.getByRole('button', { name: '发送' }));
      await waitFor(() => {
        expect(harness.api.chatWithAI).toHaveBeenCalled();
      });
    }

    expect(await screen.findByText(/不会跳过保全证明/)).toBeTruthy();
    expect(screen.getByText(/估算上下文占用约/)).toBeTruthy();
    expect(screen.getByText(/达到 30% 阈值/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '整理并刷新' })).toBeTruthy();
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
    window.location.hash = 'tasks';
    render(<App />);

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

  it('routes task preview primary action to approval view when the task needs approval', async () => {
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

  it('explains the workspace apply boundary after approving a reviewed patch', async () => {
    const user = userEvent.setup();
    harness.decisions.length = 0;
    harness.decisions.push(buildDecision({
      id: 'decision_patch_promotion',
      kind: 'agent_resume',
      sourceType: 'agent_checkpoint',
      sourceLabel: 'workspace.staged_patch',
      title: '确认提升 sandbox patch',
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Decisions/ }));
    await user.click(await screen.findByText('确认提升 sandbox patch'));
    await user.click((await screen.findAllByRole('button', { name: '选择此方案' }))[0]!);

    await waitFor(() => {
      expect(harness.api.actOnDecision).toHaveBeenCalledWith({
        id: 'decision_patch_promotion',
        action: 'approve',
      });
    });
    expect(await screen.findByLabelText('拍板结果')).toBeTruthy();
    expect(screen.getByText('应用边界')).toBeTruthy();
    expect(screen.getByText(/真实写入只在 apply flag 开启且 promotion preflight 通过时发生/)).toBeTruthy();
    expect(screen.getByText('workspace.staged_patch')).toBeTruthy();
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
            reason: 'Sandbox patch promotion apply is enabled for explicit operator actions only; a ready workspace.staged_patch Decision still writes only after reviewed patch evidence, operator confirmation, and promotion preflight.',
            diagnosticSummary: 'Runtime patch promotion routing readiness / promotionReady=no / promotionRequirements=7/8 / promotionSatisfiedRequirements=target_task_identity,patch_artifact,promotion_decision,promotion_preflight,explicit_operator_apply,same_run_evidence_chain,post_apply_run_evidence / promotionMissingRequirements=selected_runtime_contract / missingRequirements=selected_runtime_contract / selectedRuntimeContract=missing / selectedRuntimeProvider=openai / selectedRuntimeProviderEvidenceChain=ready / providerConfigured=ready / configuredProvider=openai / configuredProviderEvidenceChain=ready / targetTaskIdentity=ready / targetTaskEvidenceChain=ready / checkpointEvidenceChain=ready / sameRunEvidenceChain=ready / explicitOperatorApply=ready / postApplyRunEvidence=ready / operatorId=local_operator / operatorApplyTask=task_1 / operatorApplyRun=run_patch_1 / operatorApplyCheckpoint=checkpoint_patch_1 / operatorApplyEvidenceChain=ready / patchArtifactId=artifact_patch_1 / decisionArtifactId=artifact_patch_1 / preflightArtifactId=artifact_patch_1 / decisionArtifactEvidenceChain=ready / artifactEvidenceChain=ready / promotionDecisionId=decision_patch_1 / promotionCheckpointId=checkpoint_patch_1 / preflightCheckpointId=checkpoint_patch_1 / patchArtifactTask=task_1 / promotionDecisionTask=task_1 / promotionPreflightTask=task_1 / postApplyTask=task_1 / patchRunId=run_patch_1 / decisionRunId=run_patch_1 / preflightRunId=run_patch_1 / postApplyRunId=run_patch_1 / sameRunId=run_patch_1 / expectedFileCount=1 / expectedFiles=notes.md / touchedFileCount=1 / touchedFiles=notes.md / postApplyFilesMatched=yes / filePathSafetyChain=ready / touchedFileEvidenceChain=ready',
            requiresApproval: true,
            startupProbePolicy: 'manual_only',
            exposesSecretValue: false,
          },
          {
            id: 'runtime.scheduler',
            state: 'approval_required',
            reason: 'Scheduler Decision proposal contract / status=blocked / proposalReady=no / requirements=0/4 / proposalRequirements=0/4 / proposalSatisfiedRequirements=none / proposalMissingRequirements=approval_queue,decision_payload,target_task_identity,authorization / missingRequirements=approval_queue,decision_payload,target_task_identity,authorization / approvalQueueSurface=missing / decisionPayload=missing / decisionTitle=missing / decisionRationale=missing / decisionOptions=missing / decisionOptionIdentity=duplicate_or_missing / decisionProposedOutcome=missing / decisionProposedOutcomeMatchesOption=no / authorization=missing / operatorId=missing / localRecoveryRunId=missing / localRecoveryTask=missing / localRecoveryCompleted=no / localRecoveryTaskMatched=no / standingApprovalPolicyId=missing / standingApprovalScopeTask=missing / standingApprovalActive=no / standingApprovalScopeMatched=no / decisionPersistenceAllowed=false / writebackDispatchAllowed=false / schedulerTriggerAllowed=false',
            diagnosticSummary: 'Scheduled/event trigger plan / status=blocked / triggerPlanReady=no / runtimeStartAllowed=false / runtimeStartReady=no / runtimeStartRequirements=1/4 / runtimeStartSatisfiedRequirements=scheduler_trigger_service / runtimeStartMissingRequirements=trigger_plan_ready,selected_runtime_identity,run_limit_count / schedulerTriggerServiceConnected=true / selectedRuntimeIdentity=missing',
            requiresApproval: true,
            startupProbePolicy: 'never',
            exposesSecretValue: false,
          },
          {
            id: 'workspace.root',
            state: 'missing',
            reason: 'Workspace root is missing.',
            diagnosticSummary: 'workspace=missing / selected=Codex CLI',
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
    expect(screen.getByText('Run / Next Action 自检查')).toBeTruthy();
    expect(screen.getByText(/Step 级检查是执行质量基线/)).toBeTruthy();
    expect(screen.getByText(/Run \/ Next Action 检查只在失败、等待拍板或完成确认时提示/)).toBeTruthy();
    expect(screen.getByText(/完成、覆盖、SOP 提取等节点提炼工作习惯/)).toBeTruthy();
    expect(screen.getByText(/关闭后不生成新的习惯提议/)).toBeTruthy();
    expect(screen.getByText(/Work Habits 展示，可停用或删除/)).toBeTruthy();
    expect(screen.getByText(/真正压缩前会先保留关键决策、偏好变化和未解决问题/)).toBeTruthy();
    expect(screen.getByText('沟通风格')).toBeTruthy();
    expect(screen.getByText('确认阈值')).toBeTruthy();
    expect(screen.getByText(/低：更少打断/)).toBeTruthy();
    expect(screen.getByText(/高：不确定结论也更常请你拍板/)).toBeTruthy();
    expect(screen.getByText(/不绕过 Standing Approval、workspace 写入、外部连接或付费\/发布类硬确认/)).toBeTruthy();
    expect(screen.getByText(/只调整低风险对话和建议中的打断频率/)).toBeTruthy();
    expect(screen.getByText('配置安全边界')).toBeTruthy();
    expect(screen.getByText('密钥不外显')).toBeTruthy();
    expect(screen.getByText('sandbox.patch_promotion')).toBeTruthy();
    expect(screen.getByText(/explicit operator actions only/)).toBeTruthy();
    expect(screen.getByText(/reviewed patch evidence, operator confirmation, and promotion preflight/)).toBeTruthy();
    const patchPromotionEvidence = screen.getByLabelText('sandbox.patch_promotion evidence');
    expect(within(patchPromotionEvidence).getByText('promotionReady=no')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('promotionRequirements=7/8')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('promotionSatisfiedRequirements=target_task_identity,patch_artifact,promotion_decision,promotion_preflight,explicit_operator_apply,same_run_evidence_chain,post_apply_run_evidence')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('promotionMissingRequirements=selected_runtime_contract')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('missingRequirements=selected_runtime_contract')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('selectedRuntimeContract=missing')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('selectedRuntimeProvider=openai')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('selectedRuntimeProviderEvidenceChain=ready')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('providerConfigured=ready')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('configuredProvider=openai')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('configuredProviderEvidenceChain=ready')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('targetTaskIdentity=ready')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('targetTaskEvidenceChain=ready')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('checkpointEvidenceChain=ready')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('sameRunEvidenceChain=ready')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('explicitOperatorApply=ready')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('postApplyRunEvidence=ready')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('operatorId=local_operator')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('operatorApplyTask=task_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('operatorApplyRun=run_patch_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('operatorApplyCheckpoint=checkpoint_patch_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('operatorApplyEvidenceChain=ready')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('patchArtifactId=artifact_patch_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('decisionArtifactId=artifact_patch_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('preflightArtifactId=artifact_patch_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('decisionArtifactEvidenceChain=ready')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('artifactEvidenceChain=ready')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('promotionDecisionId=decision_patch_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('promotionCheckpointId=checkpoint_patch_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('preflightCheckpointId=checkpoint_patch_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('patchArtifactTask=task_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('promotionDecisionTask=task_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('promotionPreflightTask=task_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('postApplyTask=task_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('patchRunId=run_patch_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('decisionRunId=run_patch_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('preflightRunId=run_patch_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('postApplyRunId=run_patch_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('sameRunId=run_patch_1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('expectedFileCount=1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('expectedFiles=notes.md')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('touchedFileCount=1')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('touchedFiles=notes.md')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('postApplyFilesMatched=yes')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('filePathSafetyChain=ready')).toBeTruthy();
    expect(within(patchPromotionEvidence).getByText('touchedFileEvidenceChain=ready')).toBeTruthy();
    const schedulerEvidence = screen.getByLabelText('runtime.scheduler evidence');
    expect(within(schedulerEvidence).getByText('proposalReady=no')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('proposalRequirements=0/4')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('proposalSatisfiedRequirements=none')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('proposalMissingRequirements=approval_queue,decision_payload,target_task_identity,authorization')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('missingRequirements=approval_queue,decision_payload,target_task_identity,authorization')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('approvalQueueSurface=missing')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('decisionPayload=missing')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('decisionOptionIdentity=duplicate_or_missing')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('decisionProposedOutcomeMatchesOption=no')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('authorization=missing')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('operatorId=missing')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('localRecoveryRunId=missing')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('localRecoveryTask=missing')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('localRecoveryCompleted=no')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('localRecoveryTaskMatched=no')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('standingApprovalPolicyId=missing')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('standingApprovalScopeTask=missing')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('standingApprovalActive=no')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('standingApprovalScopeMatched=no')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('decisionPersistenceAllowed=false')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('writebackDispatchAllowed=false')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('schedulerTriggerAllowed=false')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('triggerPlanReady=no')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('runtimeStartAllowed=false')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('runtimeStartReady=no')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('runtimeStartRequirements=1/4')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('runtimeStartSatisfiedRequirements=scheduler_trigger_service')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('runtimeStartMissingRequirements=trigger_plan_ready,selected_runtime_identity,run_limit_count')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('schedulerTriggerServiceConnected=true')).toBeTruthy();
    expect(within(schedulerEvidence).getByText('selectedRuntimeIdentity=missing')).toBeTruthy();
    expect(screen.getByText(/诊断：workspace=missing \/ selected=Codex CLI/)).toBeTruthy();
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
        workspaceRoot: '/tmp/taskplane-workspace',
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
    expect(screen.getByText('建议')).toBeTruthy();
    expect(screen.queryByText(/类型由 AI 根据标题预判/)).toBeNull();
    expect(screen.queryByText(/确认后才创建真实子任务/)).toBeNull();
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

    const chatCallsBeforePlanning = vi.mocked(harness.api.chatWithAI!).mock.calls.length;
    const agentCliCallsBeforePlanning = vi.mocked(harness.api.triggerAgentCliRun!).mock.calls.length;
    await user.click(screen.getByRole('button', { name: /拆解任务/ }));
    await waitFor(() => {
      expect(screen.getByDisplayValue(/请帮我拆解「官网改版项目」/)).toBeTruthy();
    });
    expect(vi.mocked(harness.api.chatWithAI!).mock.calls.length).toBe(chatCallsBeforePlanning);
    expect(vi.mocked(harness.api.triggerAgentCliRun!).mock.calls.length).toBe(agentCliCallsBeforePlanning);
    expect(screen.queryByText(/Taskplane Agent Operating Principles/)).toBeNull();
    expect(screen.queryByText(/## Task Creation Protocol/)).toBeNull();
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
    expect(screen.getByText(/只在业务线或 Next Action 上下文需要时引用相关信号/)).toBeTruthy();
    expect(screen.getByText(/相关新信号带入 Today、业务线 Records 或 Next Action 上下文，等待你确认/)).toBeTruthy();
    expect(screen.getByText(/未授权的来源不会进入 AI 上下文/)).toBeTruthy();
    expect(screen.getByText('系统默认可选功能')).toBeTruthy();
    expect(screen.getByText(/默认展示，不会自动授权、探测或同步/)).toBeTruthy();
    expect(screen.getByText('Gmail')).toBeTruthy();
    expect(screen.getByText(/系统默认可选邮箱授权/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '授权' })).toBeTruthy();
    expect(screen.getByText('更多可连接来源')).toBeTruthy();
    expect(screen.getByText('Calendar')).toBeTruthy();
    expect(screen.getByText('GitHub')).toBeTruthy();
    expect(screen.getByText('EMAIL')).toBeTruthy();
    expect(screen.getByText('CAL')).toBeTruthy();
    expect(screen.getByText('GIT')).toBeTruthy();
    expect(screen.getByText(/授权后提取频道里的业务线信号/)).toBeTruthy();
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

  it('surfaces a confirmation-only Standing Approval draft for autonomous task classes', async () => {
    const user = userEvent.setup();
    const routineTask = buildTask({
      id: 'task_routine_auto',
      title: '每周竞品更新',
      riskLevel: 'low',
      taskFacets: ['scheduled', 'routine'],
      taskType: 'routine',
    });
    vi.mocked(harness.api.listTasks).mockResolvedValueOnce([routineTask]);
    vi.mocked(harness.api.getTaskDetail).mockImplementation(async (taskId: string) => {
      if (taskId !== routineTask.id) return null;
      return {
        ...buildTaskDetail(routineTask),
        processTemplates: [{
          id: 'template_auto',
          bindingId: 'binding_auto',
          taskId: routineTask.id,
          title: '竞品更新 SOP',
          summary: null,
          content: 'Collect bounded competitor updates and prepare a review note.',
          kind: 'sop',
          tags: [],
          status: 'active',
          bindingStatus: 'active',
          bindingNote: null,
          boundAt: now,
          bindingUpdatedAt: now,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
          removedAt: null,
        }],
      };
    });
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      featureFlags: {
        ...buildAiStatus().featureFlags,
        enableSandboxCodingAgent: true,
      },
      sandboxBackendStatus: {
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
          summary: 'Sandbox backend ready.',
        },
        producerBackendReadiness: {
          blockedReasons: [],
          ready: true,
          summary: 'Producer ready.',
        },
        summary: 'Sandbox backend ready.',
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /每周竞品更新/ }).length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByRole('button', { name: /每周竞品更新/ })[0]!);
    await user.click(screen.getByRole('button', { name: '任务动态' }));

    const approvalDraft = await screen.findByLabelText('Standing Approval 授权草案');
    expect(within(approvalDraft).getByText(/Standing Approval 草案：允许 L2 有限自主行动/)).toBeTruthy();
    expect(within(approvalDraft).getByText('L2 授权草案')).toBeTruthy();
    expect(within(approvalDraft).getAllByText(/schedulerTriggerAllowed=false/).length).toBeGreaterThan(0);
    expect(within(approvalDraft).getAllByText(/workspaceWriteAllowed=false/).length).toBeGreaterThan(0);
    const evidenceChips = within(approvalDraft).getByLabelText('Standing Approval readiness evidence');
    expect(within(evidenceChips).getByText('standingApprovalReady=yes')).toBeTruthy();
    expect(within(evidenceChips).getByText('schedulerTriggerAllowed=false')).toBeTruthy();
    expect(within(evidenceChips).getByText('workspaceWriteAllowed=false')).toBeTruthy();
    await user.click(within(approvalDraft).getByRole('button', { name: '确认授权' }));
    await waitFor(() => {
      expect(harness.api.recordTaskTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_routine_auto',
        type: 'panel.standing_approval_confirmed',
        payload: expect.objectContaining({
          schedulerTriggerAllowed: false,
          workspaceWriteAllowed: false,
          policy: expect.objectContaining({
            allowedAutonomyLevel: 'L2_limited_authorized_action',
            taskId: 'task_routine_auto',
          }),
        }),
      }));
    });
    expect(await within(approvalDraft).findByText(/Standing Approval 已确认/)).toBeTruthy();
    expect(harness.api.applyTaskplaneWriteback).not.toHaveBeenCalled();
  });

  it('starts one scheduled/event Agent run from a confirmed Standing Approval card', async () => {
    const user = userEvent.setup();
    const routineTask = buildTask({
      id: 'task_routine_auto',
      title: '每周竞品更新',
      riskLevel: 'low',
      taskFacets: ['scheduled', 'routine'],
      taskType: 'routine',
    });
    vi.mocked(harness.api.listTasks).mockResolvedValueOnce([routineTask]);
    vi.mocked(harness.api.getTaskDetail).mockImplementation(async (taskId: string) => {
      if (taskId !== routineTask.id) return null;
      return {
        ...buildTaskDetail(routineTask),
        processTemplates: [{
          id: 'template_auto',
          bindingId: 'binding_auto',
          taskId: routineTask.id,
          title: '竞品更新 SOP',
          summary: null,
          content: 'Collect bounded competitor updates and prepare a review note.',
          kind: 'sop',
          tags: [],
          status: 'active',
          bindingStatus: 'active',
          bindingNote: null,
          boundAt: now,
          bindingUpdatedAt: now,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
          removedAt: null,
        }],
        timeline: [{
          id: 'timeline_approval',
          taskId: routineTask.id,
          type: 'panel.standing_approval_confirmed',
          payload: JSON.stringify({
            policy: {
              id: 'standing_approval:task_routine_auto:coding:local_sandbox',
              allowedAutonomyLevel: 'L2_limited_authorized_action',
              allowedLanes: ['coding'],
              allowedRuntimeIds: ['local_sandbox'],
              createdAt: now,
              expiresAt: '2026-05-27T00:00:00.000Z',
              maxRunsPerDay: 3,
              reason: 'Allow bounded weekly update preparation.',
              riskCeiling: 'low',
              status: 'active',
              taskFacets: ['scheduled', 'routine'],
              taskId: routineTask.id,
              taskTypes: ['routine'],
            },
            schedulerTriggerAllowed: false,
            workspaceWriteAllowed: false,
          }),
          createdAt: now,
        }],
      };
    });
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      featureFlags: {
        ...buildAiStatus().featureFlags,
        enableSandboxCodingAgent: true,
      },
      sandboxBackendStatus: {
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
          summary: 'Sandbox backend ready.',
        },
        producerBackendReadiness: {
          blockedReasons: [],
          ready: true,
          summary: 'Producer ready.',
        },
        summary: 'Sandbox backend ready.',
      },
    }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /每周竞品更新/ }).length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByRole('button', { name: /每周竞品更新/ })[0]!);
    await user.click(screen.getByRole('button', { name: '任务动态' }));

    const approvalDraft = await screen.findByLabelText('Standing Approval 授权草案');
    expect(within(approvalDraft).getAllByText('已确认').length).toBeGreaterThan(0);
    expect(within(within(approvalDraft).getByLabelText('Standing Approval readiness evidence')).getByText('standingApprovalReady=yes')).toBeTruthy();
    vi.mocked(harness.api.triggerScheduledEventAgentRun!).mockImplementationOnce(async (input) => {
      const run = buildRun({
        failureReason: '模型执行失败，等待人工复核。',
        id: 'run_scheduled_event_agent_failed',
        output: null,
        outputSource: 'system',
        status: 'failed',
        taskId: input.taskId,
        type: 'agent',
      });
      harness.runs.push(run);
      return {
        status: 'started',
        plan: {
          status: 'ready',
          triggerPlanReady: true,
          runtimeStartAllowed: true,
          runtimeStartMissingRequirements: [],
          runtimeStartSatisfiedRequirements: [
            'trigger_plan_ready',
            'scheduler_trigger_service',
            'run_limit_count',
          ],
          schedulerTriggerServiceConnected: true,
          triggerRunEvidenceRequired: [
            'context_readiness',
            'target_task_identity',
            'task_memory_coverage',
          ],
          policy: null,
          runLimit: {
            maxRunsPerDay: 3,
            runsStartedToday: 0,
          },
          readiness: {},
          standingApproval: {},
          blockedReasons: [],
          evidence: [],
          summary: 'Scheduled/event trigger plan / status=ready',
        },
        run,
        terminalRunEvidenceStatus: 'present',
        triggerRunEvidenceStatus: 'ready_for_terminal_review',
        summary: 'Scheduled/event trigger plan / trigger=started / runId=run_scheduled_event_agent_failed',
      } as unknown as Awaited<ReturnType<NonNullable<ElectronApi['triggerScheduledEventAgentRun']>>>;
    });
    await user.click(within(approvalDraft).getByRole('button', { name: '启动一次' }));

    await waitFor(() => {
      expect(harness.api.triggerScheduledEventAgentRun).toHaveBeenCalledWith({
        taskId: 'task_routine_auto',
      });
    });
    expect(await within(approvalDraft).findByText(/已启动受控 Agent run：run_scheduled_event_agent_failed/)).toBeTruthy();
    expect(within(approvalDraft).getByText(/触发证据：可复核/)).toBeTruthy();
    expect(within(approvalDraft).getByText(/触发证据项：context_readiness,target_task_identity,task_memory_coverage/)).toBeTruthy();
    expect(within(approvalDraft).getByText(/限额：0\/3/)).toBeTruthy();
    expect(within(approvalDraft).getByText(/写入：提案模式/)).toBeTruthy();
    expect(within(approvalDraft).getByText(/失败原因：模型执行失败，等待人工复核。/)).toBeTruthy();
  });

  it('lets task dynamics approve Run writeback proposals without opening the right panel', async () => {
    const user = userEvent.setup();
    harness.runs[0] = {
      ...harness.runs[0]!,
      output: [
        '建议确认首版范围。',
        '```json',
        JSON.stringify({
          type: 'TASKPLANE_WRITE_INTENTS',
          intents: [{
            type: 'decision.create',
            title: '确认首版范围',
            rationale: 'Run 已收敛到基础教程和案例展示。',
            proposedOutcome: '基础教程和案例展示',
          }],
        }),
        '```',
      ].join('\n'),
    };
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    await user.click(screen.getByRole('button', { name: '任务动态' }));

    const approvalQueue = await screen.findByLabelText('待确认写回提案');
    expect(within(approvalQueue).getByText('决策提案：确认首版范围')).toBeTruthy();
    await user.click(within(approvalQueue).getByRole('button', { name: '确认写回' }));

    await waitFor(() => {
      expect(harness.api.applyTaskplaneWriteback).toHaveBeenCalledWith(expect.objectContaining({
        plan: expect.objectContaining({
          action: 'decision.create',
          input: expect.objectContaining({
            sourceId: 'run_1',
            taskId: 'task_risk',
            title: '确认首版范围',
          }),
        }),
        taskId: 'task_risk',
      }));
    });
    expect(harness.api.createDecision).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: 'run_1',
      taskId: 'task_risk',
      title: '确认首版范围',
    }));
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

  it('treats unconfirmed persisted simple project-like tasks as project work', async () => {
    const task = buildTask({
      id: 'task_legacy_simple_project_type',
      title: '开发小程序',
      taskType: 'simple',
      taskFacets: ['simple'],
      state: 'planned',
    });
    harness.tasks.unshift(task);
    harness.details[task.id] = buildTaskDetail(task);

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));

    await user.click(await screen.findByRole('button', { name: /一次性任务/ }));
    const simpleGroup = document.querySelector('.task-type-group .lens-item.active')?.closest('.task-type-group') as HTMLElement | null;
    expect(simpleGroup?.querySelector('[data-title="开发小程序"]')).toBeNull();

    await user.click(screen.getByRole('button', { name: /项目型/ }));
    const projectGroup = document.querySelector('.task-type-group .lens-item.active')?.closest('.task-type-group') as HTMLElement | null;
    expect(projectGroup?.querySelector('[data-title="开发小程序"]')).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: '开发小程序' }));
    await waitFor(() => {
      expect(screen.getAllByText('项目型').length).toBeGreaterThan(0);
    });
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
    window.location.hash = 'tasks';
    render(<App />);

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
    window.location.hash = 'tasks';
    render(<App />);

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
    window.location.hash = 'tasks';
    render(<App />);

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
    window.location.hash = 'tasks';
    render(<App />);

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
    expect(await screen.findByText('Agent API')).toBeTruthy();

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
      expect(harness.api.createTaskFile).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_handoff_second',
        path: expect.stringMatching(/^Task Records\/\d{4}-\d{2}-\d{2}-received-handoff\.md$/),
        content: expect.stringContaining('## From'),
      }));
      expect(harness.api.recordTaskTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task_handoff_second',
        type: 'panel.completion_handoff',
        payload: expect.objectContaining({
          previousTaskId: 'task_handoff_first',
          recordPath: expect.stringMatching(/^Task Records\/\d{4}-\d{2}-\d{2}-received-handoff\.md$/),
        }),
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
    window.location.hash = 'tasks';
    render(<App />);

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

    const chatCallsBeforePlanning = vi.mocked(harness.api.chatWithAI!).mock.calls.length;
    const agentCliCallsBeforePlanning = vi.mocked(harness.api.triggerAgentCliRun!).mock.calls.length;
    await user.click(await screen.findByRole('button', { name: /拆解任务/ }));
    await waitFor(() => {
      expect(screen.getByDisplayValue(/请帮我拆解「改版项目」/)).toBeTruthy();
    });
    expect(vi.mocked(harness.api.chatWithAI!).mock.calls.length).toBe(chatCallsBeforePlanning);
    expect(vi.mocked(harness.api.triggerAgentCliRun!).mock.calls.length).toBe(agentCliCallsBeforePlanning);
    expect(screen.queryByText('AI 拆解草稿')).toBeNull();
    expect(harness.api.decomposeProject).not.toHaveBeenCalled();
  });

  it('preserves Agent API decomposition runtime identity when building project confirmation plans', () => {
    const project = buildTask({
      id: 'task_project',
      title: '官网改版',
      state: 'planned',
      taskType: 'project',
      taskFacets: ['project'],
      childTaskIds: [],
      nextStep: '拆解项目结构',
    });

    const plan = buildProjectDecompositionConfirmationApplyPlan(project, {
      parentGoal: '完成官网改版并上线。',
      subtasks: [{
        title: '确认官网改版范围',
        summary: '明确页面范围、目标用户和上线边界。',
        acceptanceCriteria: '范围清单被确认。',
        dependency: null,
        rationale: '这是后续执行的独立输入。',
      }],
      review: '子任务边界清楚。',
      nextStep: '确认是否创建这些子任务。',
      evidenceRunId: 'agent_api_decomposition:task_project',
      invocation: {
        phase: 'decomposition_draft',
        layer: 'api_runtime',
        runtime: {
          mode: 'api',
          label: 'Agent API Runtime 规划',
          provider: 'openai',
        },
        status: 'completed',
        summary: '已生成 1 个项目子任务草稿。',
      },
    });

    expect(plan.input).toEqual(expect.objectContaining({
      evidenceRunId: 'agent_api_decomposition:task_project',
      parentTaskId: 'task_project',
      source: 'agent_api_decomposition',
    }));
    expect(plan.timeline.payload).toEqual(expect.objectContaining({
      evidenceRunId: 'agent_api_decomposition:task_project',
      runtimeContract: expect.objectContaining({
        evidenceRunId: 'agent_api_decomposition:task_project',
        invocationLayer: 'api_runtime',
        parentTaskId: 'task_project',
        phase: 'decomposition_draft',
        provider: 'openai',
        runtimeLabel: 'Agent API Runtime 规划',
        runtimeMode: 'api',
      }),
    }));
  });

  it('recovers Agent API decomposition provider identity from promotion readiness when the invocation is compact', () => {
    const project = buildTask({
      id: 'task_project',
      title: '官网改版',
      state: 'planned',
      taskType: 'project',
      taskFacets: ['project'],
      childTaskIds: [],
      nextStep: '拆解项目结构',
    });

    const plan = buildProjectDecompositionConfirmationApplyPlan(project, {
      parentGoal: '完成官网改版并上线。',
      subtasks: [{
        title: '确认官网改版范围',
        summary: '明确页面范围、目标用户和上线边界。',
        acceptanceCriteria: '范围清单被确认。',
        dependency: null,
        rationale: '这是后续执行的独立输入。',
      }],
      review: '子任务边界清楚。',
      nextStep: '确认是否创建这些子任务。',
      evidenceRunId: 'agent_api_decomposition:task_project',
      invocation: {
        phase: 'decomposition_draft',
        layer: 'api_runtime',
        runtime: {
          mode: 'api',
          label: 'Agent API Runtime 规划',
        },
        status: 'completed',
        summary: '已生成 1 个项目子任务草稿。',
      },
      promotionReadiness: {
        ready: true,
        summary: 'Agent API decomposition promotion readiness / selectedRuntimeProvider=openai / selectedRuntimeProviderEvidenceChain=ready',
        satisfiedRequirements: [],
        missingRequirements: [],
      },
    });

    expect(plan.timeline.payload.runtimeContract).toEqual(expect.objectContaining({
      provider: 'openai',
    }));
  });

  it('opens the first unfinished child when advancing a decomposed project', async () => {
    const project = buildTask({
      id: 'task_project_with_children',
      title: '开发一个网站',
      state: 'planned',
      taskType: 'project',
      taskFacets: ['project'],
      childTaskIds: ['task_child_scope', 'task_child_design'],
      nextStep: '审阅最新 agent 产物，并决定是否继续推进。',
    });
    const firstChild = buildTask({
      id: 'task_child_scope',
      title: '明确网站目标与范围',
      parentTaskId: project.id,
      state: 'planned',
      taskType: 'simple',
      taskFacets: ['simple'],
      summary: '确认网站类型、目标用户、核心价值和页面范围。',
      nextStep: '',
    });
    const secondChild = buildTask({
      id: 'task_child_design',
      title: '视觉方向与交互原型',
      parentTaskId: project.id,
      state: 'planned',
      taskType: 'simple',
      taskFacets: ['simple'],
      summary: '确定视觉风格并产出核心页面原型。',
    });
    harness.tasks.unshift(secondChild, firstChild, project);
    harness.details[project.id] = buildTaskDetail(project);
    harness.details[firstChild.id] = buildTaskDetail(firstChild);
    harness.details[secondChild.id] = buildTaskDetail(secondChild);

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(screen.getByRole('button', { name: /项目型/ }));
    await user.click(await screen.findByRole('button', { name: '开发一个网站' }));
    const chatCallsBeforeAdvance = vi.mocked(harness.api.chatWithAI!).mock.calls.length;
    await user.click(await screen.findByRole('button', { name: /推进子任务/ }));

    expect(await screen.findByDisplayValue('先帮我把「明确网站目标与范围」推进到可执行状态：确认目标、范围和下一步。')).toBeTruthy();
    expect(vi.mocked(harness.api.chatWithAI!).mock.calls.length).toBe(chatCallsBeforeAdvance);
    expect(screen.queryByDisplayValue(/父任务：「开发一个网站」/)).toBeNull();
    expect(screen.queryByDisplayValue(/子任务摘要/)).toBeNull();
    expect(screen.queryByText(/不要重新拆解父任务/)).toBeNull();
    expect(screen.queryByText(/审阅最新 agent 产物/)).toBeNull();
    expect(screen.getAllByText('明确网站目标与范围').length).toBeGreaterThan(0);
  });

  it('prefills child task advancement from recent task memory entries when available', async () => {
    const project = buildTask({
      id: 'task_project_record_prefill',
      title: '开发一个网站',
      state: 'planned',
      taskType: 'project',
      taskFacets: ['project'],
      childTaskIds: ['task_child_record_prefill'],
      nextStep: '推进第一个子任务。',
    });
    const child = buildTask({
      id: 'task_child_record_prefill',
      title: '明确网站目标与范围',
      parentTaskId: project.id,
      state: 'planned',
      taskType: 'simple',
      taskFacets: ['simple'],
      summary: '确认网站类型、目标用户、核心价值和页面范围。',
      nextStep: '',
    });
    harness.tasks.unshift(child, project);
    harness.details[project.id] = buildTaskDetail(project);
    harness.details[child.id] = buildTaskDetail(child);
    harness.taskFiles[child.id] = [{
      id: 'task_record_prefill',
      taskId: child.id,
      name: '会话刷新前保全.md',
      path: 'Task Records/2026-05-22-context-refresh-handoff.md',
      kind: 'file',
      content: [
        '# Record: 会话刷新前保全',
        '',
        '## Summary',
        '任务：明确网站目标与范围',
        '用户消息数：5',
        '最近关注：个人知识内容聚合站，面向 Agent 初学者，偏入门教程学习类方向',
        '',
        '## Confirmed',
        '- 先以内容教程聚合站作为首版方向',
        '',
        '## Open',
        '- 是否优先做内站整理，而不是外部读者展示',
      ].join('\n'),
      createdAt: now,
      updatedAt: now,
    }];

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(screen.getByRole('button', { name: /项目型/ }));
    await user.click(await screen.findByRole('button', { name: '开发一个网站' }));
    await waitFor(() => {
      expect(harness.api.listTaskFiles).toHaveBeenCalledWith(child.id);
    });
    await user.click(await screen.findByRole('button', { name: /推进子任务/ }));

    expect(await screen.findByDisplayValue(/基于已有任务记录继续推进「明确网站目标与范围」/)).toBeTruthy();
    expect(screen.getByDisplayValue(/先收束首版目标、范围、非目标和下一步/)).toBeTruthy();
    expect(screen.queryByDisplayValue(/个人知识内容聚合站/)).toBeNull();
    expect(screen.queryByDisplayValue(/推进到可执行状态：确认目标、范围和下一步/)).toBeNull();
  });

  it('keeps later child-task chat turns scoped and concise for Agent CLI', async () => {
    const project = buildTask({
      id: 'task_project_child_chat',
      title: '开发一个网站',
      state: 'planned',
      taskType: 'project',
      taskFacets: ['project'],
      childTaskIds: ['task_child_scope_chat'],
      nextStep: '推进第一个子任务。',
    });
    const child = buildTask({
      id: 'task_child_scope_chat',
      title: '明确网站目标与范围',
      parentTaskId: project.id,
      state: 'planned',
      taskType: 'simple',
      taskFacets: ['simple'],
      summary: '确认网站类型、目标用户、核心价值和页面范围。',
      nextStep: '',
    });
    harness.tasks.unshift(child, project);
    harness.details[project.id] = buildTaskDetail(project);
    harness.details[child.id] = buildTaskDetail(child);
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(screen.getByRole('button', { name: /项目型/ }));
    await user.click(await screen.findByRole('button', { name: '开发一个网站' }));
    await user.click(await screen.findByRole('button', { name: /推进子任务/ }));

    expect(await screen.findByDisplayValue('先帮我把「明确网站目标与范围」推进到可执行状态：确认目标、范围和下一步。')).toBeTruthy();
    expect(harness.api.triggerAgentCliRun).not.toHaveBeenCalled();
    vi.mocked(harness.api.triggerAgentCliRun!).mockImplementationOnce(async (input) => {
      const run = buildRun({
        id: 'run_child_completed',
        output: [
          'Codex CLI run 已完成。',
          '结果摘要：',
          'Key Findings',
          '当前可暂定为：首版做一个面向 Agent 初学者的 Codex 基础教程网站，以基础教程和案例展示为主。',
          '下一步建议：整理 Codex 官方文档和同类教程站，形成首版页面范围、内容结构和非目标。',
          '完整输出已进入任务动态，并生成了待确认的任务记录提案。',
        ].join('\n'),
        outputSource: 'ai',
        status: 'completed',
        taskId: input.taskId,
        type: 'agent',
      }) as RunRecord & { steps?: RunStepRecord[] };
      run.steps = [
        buildRunStep({
          id: 'step_child_web_prep',
          runId: run.id,
          index: 0,
          title: 'Agent CLI 联网调研准备',
          output: [
            'status=captured',
            'capability_mode=native',
            'sources=2',
            'query=Codex CLI beginner tutorial',
            'reason=Taskplane captured web research into Source Context before handing the task to the selected Agent CLI.',
          ].join('\n'),
        }),
        buildRunStep({
          id: 'step_child_native_web',
          runId: run.id,
          index: 1,
          title: 'Codex CLI 联网检索：web_search',
          output: 'capability=web_search\nprovider_event=tool.result\nFound official Codex docs and examples.',
        }),
      ];
      harness.runs.push(run);
      return run;
    });

    const input = await screen.findByPlaceholderText(/关于「明确网站目标与范围」/);
    await user.clear(input);
    await user.type(input, '做一个 Codex 的基础教程网站，面向 Agent 初学者，偏基础教程和案例展示');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.triggerAgentCliRun).toHaveBeenLastCalledWith(expect.objectContaining({
        prompt: '做一个 Codex 的基础教程网站，面向 Agent 初学者，偏基础教程和案例展示',
        taskId: 'task_child_scope_chat',
      }));
    });
    expect(harness.api.triggerAgentCliRun).toHaveBeenLastCalledWith(expect.objectContaining({
      prompt: expect.not.stringContaining('不要再问“个人看还是给别人看”“目录型还是学习路径型”'),
    }));
    expect(harness.api.triggerAgentCliRun).toHaveBeenLastCalledWith(expect.objectContaining({
      prompt: expect.not.stringContaining('默认先产出首版定位、页面/内容范围、非目标和下一步调研或搭建动作'),
    }));

    expect(await screen.findByText(/当前可暂定为：首版做一个面向 Agent 初学者的 Codex 基础教程网站/)).toBeTruthy();
    expect(screen.getByText(/联网调研：已保存 2 个来源到来源上下文/)).toBeTruthy();
    expect(screen.getByText(/原生 CLI 联网动作：.*web_search/)).toBeTruthy();
    expect(screen.getByText(/整理 Codex 官方文档和同类教程站/)).toBeTruthy();
    expect(screen.queryByText(/你希望这个网站首版更偏/)).toBeNull();
    expect(screen.queryByText(/个人看还是给别人看/)).toBeNull();
    expect(screen.queryByText(/Key Findings/)).toBeNull();
    expect(screen.queryByText(/Codex CLI run 已完成/)).toBeNull();
    expect(screen.queryByText('任务记忆写入提案')).toBeNull();
    expect(screen.queryByRole('button', { name: '收尾本阶段' })).toBeNull();
    expect(screen.queryByRole('button', { name: '生成文件提案' })).toBeNull();
  });

  it('does not turn child-task advancement output into nested subtask drafts', async () => {
    const project = buildTask({
      id: 'task_project_no_nested_draft',
      title: '开发一个网站',
      state: 'planned',
      taskType: 'project',
      taskFacets: ['project'],
      childTaskIds: ['task_child_scope_no_nested_draft'],
      nextStep: '推进第一个子任务。',
    });
    const child = buildTask({
      id: 'task_child_scope_no_nested_draft',
      title: '明确网站目标与范围',
      parentTaskId: project.id,
      state: 'planned',
      taskType: 'simple',
      taskFacets: ['simple'],
      summary: '确认网站类型、目标用户、核心价值和页面范围。',
      nextStep: '',
    });
    harness.tasks.unshift(child, project);
    harness.details[project.id] = buildTaskDetail(project);
    harness.details[child.id] = buildTaskDetail(child);
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(screen.getByRole('button', { name: /项目型/ }));
    await user.click(await screen.findByRole('button', { name: '开发一个网站' }));
    await user.click(await screen.findByRole('button', { name: /推进子任务/ }));

    vi.mocked(harness.api.triggerAgentCliRun!).mockImplementationOnce(async (input) => {
      const run = buildRun({
        id: 'run_child_nested_decomposition_ignored',
        output: [
          '已形成子任务草案。',
          '```json',
          JSON.stringify({
            type: 'TASKPLANE_DECOMPOSITION',
            subtasks: [
              {
                title: '确认网站用途与目标',
                summary: '明确网站类型、主要目的、希望用户完成的关键动作。',
                acceptanceCriteria: '已用一句话说明网站用途。',
                dependency: null,
              },
              {
                title: '定义目标用户与核心场景',
                summary: '确认主要访问者是谁，以及他们进入网站时最常见的任务或问题。',
                acceptanceCriteria: '已列出核心用户和主要使用场景。',
                dependency: '确认网站用途与目标',
              },
            ],
          }),
          '```',
        ].join('\n'),
        outputSource: 'ai',
        status: 'completed',
        taskId: input.taskId,
        type: 'agent',
      });
      harness.runs.push(run);
      return run;
    });

    const input = await screen.findByPlaceholderText(/关于「明确网站目标与范围」/);
    await user.clear(input);
    await user.type(input, '关于一个 AI 生图的工具站');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(harness.api.triggerAgentCliRun).toHaveBeenLastCalledWith(expect.objectContaining({
        taskId: 'task_child_scope_no_nested_draft',
      }));
    });
    expect(await screen.findByText(/已形成子任务草案/)).toBeTruthy();
    expect(screen.queryByText('子任务草案')).toBeNull();
    expect(screen.queryByRole('button', { name: '确认创建子任务' })).toBeNull();
  });

  it('allows explicit decomposition of a complex child task by upgrading it to a project', async () => {
    const project = buildTask({
      id: 'task_project_child_split',
      title: '开发一个网站',
      state: 'planned',
      taskType: 'project',
      taskFacets: ['project'],
      childTaskIds: ['task_child_code_split'],
      nextStep: '推进代码实现。',
    });
    const child = buildTask({
      id: 'task_child_code_split',
      title: '代码实现',
      parentTaskId: project.id,
      state: 'planned',
      taskType: 'simple',
      taskFacets: ['simple'],
      summary: '实现网站首版功能。',
      nextStep: '',
    });
    harness.tasks.unshift(child, project);
    harness.details[project.id] = buildTaskDetail(project);
    harness.details[child.id] = buildTaskDetail(child);
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({ runtimeMode: 'codex' }));

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(screen.getByRole('button', { name: /项目型/ }));
    await user.click(await screen.findByRole('button', { name: '开发一个网站' }));
    await user.click(await screen.findByRole('button', { name: /推进子任务/ }));

    vi.mocked(harness.api.triggerAgentCliRun!).mockImplementationOnce(async (input) => {
      const run = buildRun({
        id: 'run_child_explicit_decomposition',
        output: [
          '已形成子任务草案。',
          '```json',
          JSON.stringify({
            type: 'TASKPLANE_DECOMPOSITION',
            review: '代码实现需要拆成可独立推进的工程块。',
            nextStep: '确认后从前端实现开始。',
            subtasks: [
              {
                title: '前端实现',
                summary: '实现首版页面结构和交互。',
                acceptanceCriteria: '核心页面可以本地打开并完成主要交互。',
                dependency: null,
              },
              {
                title: 'API 接入',
                summary: '接入生成、保存和状态查询接口。',
                acceptanceCriteria: '前端能调用 API 并展示成功或失败状态。',
                dependency: '前端实现',
              },
            ],
          }),
          '```',
        ].join('\n'),
        outputSource: 'ai',
        status: 'completed',
        taskId: input.taskId,
        type: 'agent',
      });
      harness.runs.push(run);
      return run;
    });

    const input = await screen.findByPlaceholderText(/关于「代码实现」/);
    await user.clear(input);
    await user.type(input, '这个实现任务太粗了，请拆细成前端和 API 接入两个子任务');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('子任务草案')).toBeTruthy();
    expect(screen.getAllByText(/前端实现/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/API 接入/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '确认创建子任务' }));
    await waitFor(() => {
      expect(harness.api.updateTask).toHaveBeenCalledWith(expect.objectContaining({
        id: 'task_child_code_split',
        taskType: 'project',
      }));
    });
    expect(harness.api.createTask).toHaveBeenCalledWith(expect.objectContaining({
      parentTaskId: 'task_child_code_split',
      title: '前端实现',
    }));
    expect(harness.api.createTask).toHaveBeenCalledWith(expect.objectContaining({
      parentTaskId: 'task_child_code_split',
      title: 'API 接入',
    }));
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
    window.location.hash = 'tasks';
    render(<App />);

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
    window.location.hash = 'tasks';
    render(<App />);

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

    window.location.hash = 'tasks';
    render(<App />);

    const currentSuggestions = () => screen.getByRole('button', { name: /当前建议/ });
    await waitFor(() => expect(currentSuggestions().textContent).toMatch(/\d/));
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

  it('marks approved-but-unapplied patch promotion notices as ready in task files', async () => {
    const user = userEvent.setup();
    const reviewRun = buildRun({
      id: 'run_review_1',
      taskId: 'task_risk',
      updatedAt: '2026-01-01T00:04:00.000Z',
    });
    harness.runs.push(reviewRun);
    harness.details.task_risk.artifacts.unshift({
      id: 'artifact_patch_reviewed_1',
      taskId: 'task_risk',
      sourceType: 'run',
      sourceId: reviewRun.id,
      kind: 'patch',
      title: 'reviewed.patch',
      content: 'diff --git a/notes.md b/notes.md\n+reviewed change\n',
      createdAt: now,
      updatedAt: now,
    });
    harness.decisions.push(buildDecision({
      id: 'decision_patch_1',
      taskId: 'task_risk',
      title: '确认提升 sandbox patch',
      status: 'approved',
      kind: 'risk_approval',
      sourceType: 'agent_checkpoint',
      sourceId: 'run_checkpoint_patch_1',
      sourceLabel: 'workspace.staged_patch',
    }));
    harness.api.getRunDetail = vi.fn().mockImplementation(async (runId) => {
      const run = harness.runs.find((item) => item.id === runId);
      if (!run) return null;
      if (run.id !== reviewRun.id) return buildRunDetail(run);
      return buildRunDetail(run, {
        checkpoints: [
          {
            id: 'run_checkpoint_patch_1',
            runId: reviewRun.id,
            stepId: 'run_step_patch_1',
            kind: 'patch_promotion',
            status: 'resolved',
            payload: JSON.stringify(createPatchPromotionCheckpointPayload({
              artifactId: 'artifact_patch_reviewed_1',
              artifactSummary: 'Reviewed patch.',
              decisionId: 'decision_patch_1',
              decisionTitle: '确认提升 sandbox patch',
              descriptorId: 'workspace.staged_patch',
              expectedFiles: ['notes.md'],
              patchDigest: 'sha256:abc',
              policySnapshot: buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' }),
              sessionId: 'sandbox_1',
            })),
            createdAt: now,
            resolvedAt: now,
          },
        ],
        sandboxPatchPromotions: [
          {
            id: 'sandbox_patch_promotion_1',
            checkpointId: 'run_checkpoint_patch_1',
            runId: reviewRun.id,
            taskId: 'task_risk',
            artifactId: 'artifact_patch_reviewed_1',
            sourceId: 'sandbox_1',
            decisionId: 'decision_patch_1',
            patchDigest: 'sha256:abc',
            expectedFiles: ['notes.md'],
            status: 'pending',
            auditSummary: null,
            blockedReasons: [],
            createdAt: now,
            updatedAt: now,
            appliedAt: null,
          },
        ],
      });
    });
    window.api = harness.api;

    window.location.hash = 'tasks';
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    await user.click(await findTaskFileButton(/reviewed\.patch/));

    const notice = await screen.findByText(/promotion 已审批，未应用/);
    const noticeElement = notice.closest('.file-readonly-note');
    expect(noticeElement?.className).toContain('ready');
    expect(noticeElement?.className).not.toContain('completed');
    expect(notice.textContent).toContain('工作区仍未应用');
    expect(notice.textContent).toContain('Apply flag 当前关闭');
    expect(notice.textContent).toContain('no-write 状态');
    expect(notice.textContent).toContain('重新复核 Run 证据');
    const disabledApplyButton = screen.getByRole('button', { name: '应用到工作区已关闭' }) as HTMLButtonElement;
    expect(disabledApplyButton.disabled).toBe(true);
    expect(noticeElement?.textContent).toContain('默认不写工作区');
    expect(screen.queryByRole('button', { name: '应用到工作区' })).toBeNull();
  });

  it('applies approved reviewed patch promotions from the task file notice when the apply flag is enabled', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      featureFlags: {
        ...buildAiStatus().featureFlags,
        enableSandboxPatchPromotionApply: true,
      },
    }));
    const reviewRun = buildRun({
      id: 'run_review_apply',
      taskId: 'task_risk',
      updatedAt: '2026-01-01T00:06:00.000Z',
    });
    harness.runs.push(reviewRun);
    harness.details.task_risk.artifacts.unshift({
      id: 'artifact_patch_apply',
      taskId: 'task_risk',
      sourceType: 'run',
      sourceId: reviewRun.id,
      kind: 'patch',
      title: 'apply-reviewed.patch',
      content: 'diff --git a/notes.md b/notes.md\n+reviewed change\n',
      createdAt: now,
      updatedAt: now,
    });
    harness.decisions.push(buildDecision({
      id: 'decision_patch_apply',
      taskId: 'task_risk',
      title: '确认提升 sandbox patch',
      status: 'approved',
      kind: 'risk_approval',
      sourceType: 'agent_checkpoint',
      sourceId: 'run_checkpoint_patch_apply',
      sourceLabel: 'workspace.staged_patch',
    }));
    harness.api.getRunDetail = vi.fn().mockImplementation(async (runId) => {
      const run = harness.runs.find((item) => item.id === runId);
      if (!run) return null;
      if (run.id !== reviewRun.id) return buildRunDetail(run);
      return buildRunDetail(run, {
        checkpoints: [
          {
            id: 'run_checkpoint_patch_apply',
            runId: reviewRun.id,
            stepId: 'run_step_patch_apply',
            kind: 'patch_promotion',
            status: 'resolved',
            payload: JSON.stringify(createPatchPromotionCheckpointPayload({
              artifactId: 'artifact_patch_apply',
              artifactSummary: 'Reviewed patch.',
              decisionId: 'decision_patch_apply',
              decisionTitle: '确认提升 sandbox patch',
              descriptorId: 'workspace.staged_patch',
              expectedFiles: ['notes.md'],
              patchDigest: 'sha256:abc',
              policySnapshot: buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' }),
              sessionId: 'sandbox_1',
            })),
            createdAt: now,
            resolvedAt: now,
          },
        ],
        sandboxPatchPromotions: [
          {
            id: 'sandbox_patch_promotion_apply',
            checkpointId: 'run_checkpoint_patch_apply',
            runId: reviewRun.id,
            taskId: 'task_risk',
            artifactId: 'artifact_patch_apply',
            sourceId: 'sandbox_1',
            decisionId: 'decision_patch_apply',
            patchDigest: 'sha256:abc',
            expectedFiles: ['notes.md'],
            status: 'pending',
            auditSummary: null,
            blockedReasons: [],
            createdAt: now,
            updatedAt: now,
            appliedAt: null,
          },
        ],
      });
    });
    vi.mocked(harness.api.applySandboxPatchPromotion!).mockResolvedValueOnce({
      auditSummary: 'Sandbox patch promotion applied / checkpoint=run_checkpoint_patch_apply / files=notes.md',
      promotion: {
        id: 'sandbox_patch_promotion_apply',
        checkpointId: 'run_checkpoint_patch_apply',
        runId: reviewRun.id,
        taskId: 'task_risk',
        artifactId: 'artifact_patch_apply',
        sourceId: 'sandbox_1',
        decisionId: 'decision_patch_apply',
        patchDigest: 'sha256:abc',
        expectedFiles: ['notes.md'],
        status: 'applied',
        auditSummary: 'Sandbox patch promotion applied / checkpoint=run_checkpoint_patch_apply / files=notes.md',
        blockedReasons: [],
        createdAt: now,
        updatedAt: now,
        appliedAt: now,
      },
      status: 'applied',
      touchedFiles: ['notes.md'],
    });
    window.api = harness.api;

    window.location.hash = 'tasks';
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    await user.click(await findTaskFileButton(/apply-reviewed\.patch/));
    expect(await screen.findByText(/只写入 reviewed patch 中通过 preflight 的匹配文件/)).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: '应用到工作区' }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('只会写入 reviewed patch 中通过 promotion preflight 的匹配文件'));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('工作区内容已漂移'));
    await waitFor(() => {
      expect(harness.api.applySandboxPatchPromotion).toHaveBeenCalledWith({
        checkpointId: 'run_checkpoint_patch_apply',
        operatorConfirmed: true,
      });
    });
    expect(await screen.findByText(/promotion apply 完成/)).toBeTruthy();
    expect(screen.getByText(/文件：notes\.md/)).toBeTruthy();
    expect(screen.getByText(/Run 证据已刷新，请复核 touched files 和后续验证结果/)).toBeTruthy();
    confirmSpy.mockRestore();
  });

  it('applies approved reviewed patch promotions from the task file context menu when the apply flag is enabled', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(harness.api.getAiConfigStatus).mockResolvedValue(buildAiStatus({
      featureFlags: {
        ...buildAiStatus().featureFlags,
        enableSandboxPatchPromotionApply: true,
      },
    }));
    const reviewRun = buildRun({
      id: 'run_review_context_apply',
      taskId: 'task_risk',
      updatedAt: '2026-01-01T00:07:00.000Z',
    });
    harness.runs.push(reviewRun);
    harness.details.task_risk.artifacts.unshift({
      id: 'artifact_patch_context_apply',
      taskId: 'task_risk',
      sourceType: 'run',
      sourceId: reviewRun.id,
      kind: 'patch',
      title: 'context-reviewed.patch',
      content: 'diff --git a/notes.md b/notes.md\n+reviewed change\n',
      createdAt: now,
      updatedAt: now,
    });
    harness.decisions.push(buildDecision({
      id: 'decision_patch_context_apply',
      taskId: 'task_risk',
      title: '确认提升 sandbox patch',
      status: 'approved',
      kind: 'risk_approval',
      sourceType: 'agent_checkpoint',
      sourceId: 'run_checkpoint_patch_context_apply',
      sourceLabel: 'workspace.staged_patch',
    }));
    harness.api.getRunDetail = vi.fn().mockImplementation(async (runId) => {
      const run = harness.runs.find((item) => item.id === runId);
      if (!run) return null;
      if (run.id !== reviewRun.id) return buildRunDetail(run);
      return buildRunDetail(run, {
        checkpoints: [
          {
            id: 'run_checkpoint_patch_context_apply',
            runId: reviewRun.id,
            stepId: 'run_step_patch_context_apply',
            kind: 'patch_promotion',
            status: 'resolved',
            payload: JSON.stringify(createPatchPromotionCheckpointPayload({
              artifactId: 'artifact_patch_context_apply',
              artifactSummary: 'Reviewed patch.',
              decisionId: 'decision_patch_context_apply',
              decisionTitle: '确认提升 sandbox patch',
              descriptorId: 'workspace.staged_patch',
              expectedFiles: ['notes.md'],
              patchDigest: 'sha256:abc',
              policySnapshot: buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' }),
              sessionId: 'sandbox_1',
            })),
            createdAt: now,
            resolvedAt: now,
          },
        ],
        sandboxPatchPromotions: [
          {
            id: 'sandbox_patch_promotion_context_apply',
            checkpointId: 'run_checkpoint_patch_context_apply',
            runId: reviewRun.id,
            taskId: 'task_risk',
            artifactId: 'artifact_patch_context_apply',
            sourceId: 'sandbox_1',
            decisionId: 'decision_patch_context_apply',
            patchDigest: 'sha256:abc',
            expectedFiles: ['notes.md'],
            status: 'pending',
            auditSummary: null,
            blockedReasons: [],
            createdAt: now,
            updatedAt: now,
            appliedAt: null,
          },
        ],
      });
    });
    vi.mocked(harness.api.applySandboxPatchPromotion!).mockResolvedValueOnce({
      auditSummary: 'Sandbox patch promotion applied / checkpoint=run_checkpoint_patch_context_apply / files=notes.md',
      promotion: {
        id: 'sandbox_patch_promotion_context_apply',
        checkpointId: 'run_checkpoint_patch_context_apply',
        runId: reviewRun.id,
        taskId: 'task_risk',
        artifactId: 'artifact_patch_context_apply',
        sourceId: 'sandbox_1',
        decisionId: 'decision_patch_context_apply',
        patchDigest: 'sha256:abc',
        expectedFiles: ['notes.md'],
        status: 'applied',
        auditSummary: 'Sandbox patch promotion applied / checkpoint=run_checkpoint_patch_context_apply / files=notes.md',
        blockedReasons: [],
        createdAt: now,
        updatedAt: now,
        appliedAt: now,
      },
      status: 'applied',
      touchedFiles: ['notes.md'],
    });
    window.api = harness.api;

    window.location.hash = 'tasks';
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    fireEvent.contextMenu(await findTaskFileButton(/context-reviewed\.patch/));
    await user.click(await screen.findByRole('button', { name: '应用到工作区' }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('只会写入 reviewed patch 中通过 promotion preflight 的匹配文件'));
    await waitFor(() => {
      expect(harness.api.applySandboxPatchPromotion).toHaveBeenCalledWith({
        checkpointId: 'run_checkpoint_patch_context_apply',
        operatorConfirmed: true,
      });
    });
    expect(await screen.findByText(/promotion apply 完成/)).toBeTruthy();
    expect(screen.getByText(/Run 证据已刷新，请复核 touched files 和后续验证结果/)).toBeTruthy();
    confirmSpy.mockRestore();
  });

  it('refreshes patch promotion notices from run detail when decisions change', async () => {
    const user = userEvent.setup();
    let promotionSettled = false;
    const reviewRun = buildRun({
      id: 'run_review_refresh',
      taskId: 'task_risk',
      updatedAt: '2026-01-01T00:05:00.000Z',
    });
    harness.runs.push(reviewRun);
    harness.details.task_risk.artifacts.unshift({
      id: 'artifact_patch_refresh',
      taskId: 'task_risk',
      sourceType: 'run',
      sourceId: reviewRun.id,
      kind: 'patch',
      title: 'refresh-reviewed.patch',
      content: 'diff --git a/notes.md b/notes.md\n+reviewed change\n',
      createdAt: now,
      updatedAt: now,
    });
    const promotionDecision = buildDecision({
      id: 'decision_patch_refresh',
      taskId: 'task_risk',
      title: '确认提升 sandbox patch',
      status: 'pending',
      kind: 'risk_approval',
      sourceType: 'agent_checkpoint',
      sourceId: 'run_checkpoint_patch_refresh',
      sourceLabel: 'workspace.staged_patch',
    });
    harness.decisions.push(promotionDecision);
    const patchCheckpoint = () => ({
      id: 'run_checkpoint_patch_refresh',
      runId: reviewRun.id,
      stepId: 'run_step_patch_refresh',
      kind: 'patch_promotion' as const,
      status: promotionSettled ? 'resolved' as const : 'open' as const,
      payload: JSON.stringify(createPatchPromotionCheckpointPayload({
        artifactId: 'artifact_patch_refresh',
        artifactSummary: 'Reviewed patch.',
        decisionId: 'decision_patch_refresh',
        decisionTitle: '确认提升 sandbox patch',
        descriptorId: 'workspace.staged_patch',
        expectedFiles: ['notes.md'],
        patchDigest: 'sha256:abc',
        policySnapshot: buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' }),
        sessionId: 'sandbox_1',
      })),
      createdAt: now,
      resolvedAt: promotionSettled ? now : null,
    });
    harness.api.getRunDetail = vi.fn().mockImplementation(async (runId) => {
      const run = harness.runs.find((item) => item.id === runId);
      if (!run) return null;
      if (run.id !== reviewRun.id) return buildRunDetail(run);
      return buildRunDetail(run, {
        checkpoints: [patchCheckpoint()],
        sandboxPatchPromotions: promotionSettled
          ? [
              {
                id: 'sandbox_patch_promotion_refresh',
                checkpointId: 'run_checkpoint_patch_refresh',
                runId: reviewRun.id,
                taskId: 'task_risk',
                artifactId: 'artifact_patch_refresh',
                sourceId: 'sandbox_1',
                decisionId: 'decision_patch_refresh',
                patchDigest: 'sha256:abc',
                expectedFiles: ['notes.md'],
                status: 'pending',
                auditSummary: null,
                blockedReasons: [],
                createdAt: now,
                updatedAt: now,
                appliedAt: null,
              },
            ]
          : [],
      });
    });
    window.api = harness.api;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /Tasks/ }));
    await user.click(await screen.findByRole('button', { name: /董事会材料修订/ }));
    await user.click(await findTaskFileButton(/refresh-reviewed\.patch/));

    expect(await screen.findByText(/等待 promotion 拍板/)).toBeTruthy();

    promotionDecision.status = 'approved';
    promotionSettled = true;
    harness.emit('decision.changed', 'decision_patch_refresh');

    const refreshedNotice = await screen.findByText(/promotion 已审批，未应用/);
    expect(refreshedNotice.textContent).toContain('preflight/no-write');
    expect(harness.api.getRunDetail).toHaveBeenCalledWith(reviewRun.id);
  });

  it('opens the right panel with the current task and selected file context from Tasks', async () => {
    const user = userEvent.setup();
    window.location.hash = 'tasks';
    render(<App />);

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

  it('persists task-file output edits through the main output API', async () => {
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
                note: '上下文保全证明：刷新前保存目标、决策、风险、来源、下一步或交接信号。',
              },
            ],
          }
        : null);
    window.location.hash = 'tasks';
    render(<App />);

    await user.click(await screen.findByText('来源驱动任务'));
    await user.click(await findTaskFileButton(/会话刷新前保全.md/));

    expect(await screen.findByText('Projected task record')).toBeTruthy();
    await expectOpenFileKind('记录');
    expect(screen.getByDisplayValue(/上下文保全证明：刷新前保存目标/)).toBeTruthy();
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
    window.location.hash = 'tasks';
    render(<App />);

    await user.click(await screen.findByText('AI 产出任务'));
    await user.click(await findTaskFileButton(/AI 项目拆解自检.md/));

    expect(await screen.findByText('Projected AI output')).toBeTruthy();
    await expectOpenFileKind('AI 产出');
  });

  it('projects phase closeout notes into Task memory files', async () => {
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
    expect(screen.getByText(/只在 Step\/Run\/Next Action 完成、你编辑 AI 产物、或会话压缩前提取学习信号/)).toBeTruthy();
    expect(screen.getByText(/不做持续行为监控/)).toBeTruthy();
    expect(screen.getByText(/已确认工作习惯会进入适用业务线或 Next Action 的执行上下文/)).toBeTruthy();
    expect(screen.getByText(/L2 有限自主行动授权仍走兼容 Standing Approval 卡片/)).toBeTruthy();
    expect(screen.getByText(/Work Habits 不直接启动 scheduler 或写入工作区/)).toBeTruthy();
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
