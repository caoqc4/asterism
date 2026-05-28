import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HomeBriefData } from '../../shared/types/brief.js';
import type { BriefProcessTemplateCandidate } from '../../shared/types/brief.js';
import type { RunRecord } from '../../shared/types/run.js';
import type { TaskDetail } from '../../shared/types/task.js';

const scheduledJobs: Array<{
  expression: string;
  callback: () => void;
  stop: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}> = [];

async function waitForAsyncSideEffect(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  if (lastError) throw lastError;
}

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn((expression: string, callback: () => void) => {
      const job = {
        expression,
        callback,
        stop: vi.fn(),
        destroy: vi.fn(),
      };
      scheduledJobs.push(job);
      return job;
    }),
  },
}));

function buildHomeData(): HomeBriefData {
  return {
    activeTaskCount: 2,
    pendingDecisionCount: 1,
    completedTaskCount: 3,
    recentRunCount: 4,
    waitingTaskCount: 1,
    blockerTaskCount: 0,
    escalationTaskCount: 0,
    highRiskTaskCount: 1,
    missingNextStepTaskCount: 1,
    recentTasks: [],
    waitingTasks: [],
    blockerTasks: [],
    escalationTasks: [],
    highRiskTasks: [],
    missingNextStepTasks: [],
    pendingDecisions: [],
    recommendedActions: [],
    recentArtifacts: [],
    recentSourceContexts: [],
    recentTaskResumes: [],
    recentActivity: [],
    recentBriefSnapshots: [],
    processTemplateCandidates: [],
    schedulerStatus: {
      enabled: true,
      running: false,
      lastBriefAt: null,
      lastRunSweepAt: null,
      lastRunSweepSummary: null,
      lastScheduledEventAgentSweepAt: null,
      lastScheduledEventAgentSweepSummary: null,
      scheduledEventAgentSweepJobConnected: false,
    },
  };
}

function buildBriefTemplateCandidate(
  partial: Partial<BriefProcessTemplateCandidate> = {},
): BriefProcessTemplateCandidate {
  return {
    id: partial.id ?? 'process_template_1',
    title: partial.title ?? 'Risk review skill',
    summary: partial.summary ?? 'Prioritize risk and blockers',
    content: partial.content ?? '1. Review risks\n2. Highlight blockers',
    kind: partial.kind ?? 'skill',
    tags: partial.tags ?? ['risk'],
    taskIds: partial.taskIds ?? ['task_1'],
    taskTitles: partial.taskTitles ?? ['Task 1'],
    notes: partial.notes ?? ['Use for risky work'],
  };
}

function buildRunRecord(): RunRecord {
  return {
    id: 'run_1',
    taskId: 'task_1',
    type: 'draft',
    status: 'running',
    instructions: null,
    output: null,
    outputSource: null,
    failureReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildAutomationTaskDetail(partial: Partial<TaskDetail> = {}): TaskDetail {
  return {
    activeBlocker: null,
    activeDependency: null,
    activeWaitingItem: null,
    artifacts: [],
    availableProcessTemplates: [],
    childTaskIds: [],
    completionCriteria: [{
      id: 'criterion_1',
      taskId: 'task_auto',
      text: 'Review the generated update.',
      verificationResponsibility: null,
      verificationResponsibilityLabel: null,
      status: 'open',
      createdAt: '2026-05-26T00:00:00.000Z',
      updatedAt: '2026-05-26T00:00:00.000Z',
      satisfiedAt: null,
    }],
    createdAt: '2026-05-26T00:00:00.000Z',
    decisions: [],
    id: 'task_auto',
    nextStep: 'Prepare the weekly update.',
    parentTaskId: null,
    processTemplates: [{
      id: 'process_1',
      bindingId: 'binding_1',
      taskId: 'task_auto',
      title: 'Weekly update SOP',
      summary: null,
      content: 'Prepare a bounded update for review.',
      kind: 'sop',
      tags: [],
      status: 'active',
      bindingStatus: 'active',
      bindingNote: null,
      boundAt: '2026-05-26T00:00:00.000Z',
      bindingUpdatedAt: '2026-05-26T00:00:00.000Z',
      createdAt: '2026-05-26T00:00:00.000Z',
      updatedAt: '2026-05-26T00:00:00.000Z',
      archivedAt: null,
      removedAt: null,
    }],
    resumeCard: {
      summary: 'Routine task.',
      currentState: 'planned',
      latestChange: {
        summary: 'Ready.',
        action: { label: null, targetType: null, targetId: null },
      },
      completionStatus: {
        total: 1,
        satisfied: 0,
        open: 1,
        summary: '1 open criterion',
      },
      currentBlocker: {
        blockerId: null,
        title: 'No blocker',
        detail: null,
      },
      keySource: {
        sourceContextId: null,
        title: 'Task summary',
        detail: 'Use task summary.',
        priorityReason: null,
      },
      currentMethod: {
        templateId: 'process_1',
        title: 'Weekly update SOP',
        detail: null,
        selectionReason: null,
      },
      nextSuggestedMove: 'Prepare the weekly update.',
    },
    riskLevel: 'low',
    riskNote: null,
    sourceContexts: [],
    state: 'planned',
    summary: 'Known weekly update task.',
    taskFacets: ['scheduled'],
    taskFiles: [],
    taskType: 'routine',
    timeline: [],
    title: 'Weekly update',
    updatedAt: '2026-05-26T00:00:00.000Z',
    waitingReason: null,
    ...partial,
  };
}

function buildReadyAutomationAiConfigService() {
  return {
    getStatus: vi.fn().mockResolvedValue({
      featureFlags: {
        enableScheduler: true,
        enableSandboxCodingAgent: true,
      },
      sandboxBackendStatus: {
        readiness: {
          blockedReasons: [],
          ready: true,
          summary: 'Sandbox ready.',
        },
        producerBackendReadiness: {
          blockedReasons: [],
          ready: true,
          summary: 'Producer ready.',
        },
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
        summary: 'Sandbox ready.',
      },
      toolScaffoldSummaries: [],
      workspaceRoot: '/tmp/workspace',
    }),
    resolveRuntimeConfig: vi.fn(),
  };
}

function buildStandingApprovalTimeline(partial: { maxRunsPerDay?: number; expiresAt?: string } = {}) {
  return {
    id: 'timeline_approval',
    taskId: 'task_auto',
    type: 'panel.standing_approval_confirmed',
    payload: JSON.stringify({
      policy: {
        id: 'standing_approval:task_auto:coding:local_sandbox',
        allowedAutonomyLevel: 'L2_limited_authorized_action',
        allowedLanes: ['coding'],
        allowedRuntimeIds: ['local_sandbox'],
        createdAt: '2026-05-26T10:00:00.000Z',
        expiresAt: partial.expiresAt ?? '2026-12-31T10:00:00.000Z',
        maxRunsPerDay: partial.maxRunsPerDay ?? 3,
        reason: 'Allow bounded weekly update preparation.',
        riskCeiling: 'low',
        status: 'active',
        taskFacets: ['scheduled'],
        taskId: 'task_auto',
        taskTypes: ['routine'],
      },
      schedulerTriggerAllowed: false,
      workspaceWriteAllowed: false,
    }),
    createdAt: '2026-05-26T10:05:00.000Z',
  };
}

function buildSourceContext(partial: Partial<TaskDetail['sourceContexts'][number]> = {}): TaskDetail['sourceContexts'][number] {
  return {
    archivedAt: null,
    capturedAt: '2026-05-26T00:00:00.000Z',
    content: 'Use the weekly metrics source.',
    createdAt: '2026-05-26T00:00:00.000Z',
    credibility: 'verified',
    id: 'source_context_1',
    isKey: true,
    kind: 'doc',
    note: null,
    sourceRole: 'stable_reference',
    status: 'active',
    taskId: 'task_auto',
    title: 'Weekly metrics source',
    updatedAt: '2026-05-26T00:00:00.000Z',
    uri: null,
    ...partial,
  };
}

describe('SchedulerService', () => {
  beforeEach(() => {
    scheduledJobs.length = 0;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not start jobs when the scheduler feature flag is disabled', async () => {
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: false,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn(),
      } as never,
      {
        create: vi.fn(),
      } as never,
      {
        listIncompleteOlderThan: vi.fn(),
        updateResult: vi.fn(),
      } as never,
      {
        resolveRuntimeConfig: vi.fn(),
      } as never,
      {
        execute: vi.fn(),
      } as never,
    );

    await service.start();

    expect(service.getStatus()).toEqual({
      enabled: false,
      running: false,
      lastBriefAt: null,
      lastRunSweepAt: null,
      lastRunSweepSummary: null,
      lastScheduledEventAgentSweepAt: null,
      lastScheduledEventAgentSweepSummary: null,
      scheduledEventAgentSweepJobConnected: false,
    });
    expect(scheduledJobs).toHaveLength(0);
  });

  it('records authorized scheduler Decision proposals as Task Dynamics timeline evidence', async () => {
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn(),
      } as never,
      {
        create: vi.fn(),
      } as never,
      {
        listIncompleteOlderThan: vi.fn(),
        updateResult: vi.fn(),
      } as never,
      {
        resolveRuntimeConfig: vi.fn(),
      } as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      null,
      timelinePort,
    );

    const result = await service.proposeSchedulerDecision({
      operatorConfirmed: true,
      operatorId: 'operator_1',
      options: ['继续巡检', '暂停巡检'],
      proposedOutcome: '继续巡检',
      rationale: '后台巡检已经产生可审查证据，需要确认下一步。',
      targetTaskId: 'task_auto',
      title: '确认自动巡检策略',
    });

    expect(result.status).toBe('proposed');
    expect(result.summary).toContain('proposalReady=yes');
    expect(result.summary).toContain('timelineEvent=panel.scheduler_decision_proposed');
    expect(result.summary).toContain('durableDecisionCreation=approval_required');
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith({
      taskId: 'task_auto',
      type: 'panel.scheduler_decision_proposed',
      payload: expect.objectContaining({
        approvalQueueSurface: 'task_dynamics',
        authorization: 'operator_confirmation',
        operatorConfirmed: true,
        operatorId: 'operator_1',
        proposedOutcome: '继续巡检',
        rationale: '后台巡检已经产生可审查证据，需要确认下一步。',
        targetTaskId: 'task_auto',
        title: '确认自动巡检策略',
      }),
    });
  });

  it('blocks scheduler Decision proposals without target-scoped authorization', async () => {
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn(),
      } as never,
      {
        create: vi.fn(),
      } as never,
      {
        listIncompleteOlderThan: vi.fn(),
        updateResult: vi.fn(),
      } as never,
      {
        resolveRuntimeConfig: vi.fn(),
      } as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      null,
      timelinePort,
    );

    const result = await service.proposeSchedulerDecision({
      rationale: '需要确认下一步。',
      standingApprovalActive: true,
      standingApprovalPolicyId: 'policy_1',
      standingApprovalScopeTaskId: 'task_other',
      targetTaskId: 'task_auto',
      title: '确认自动巡检策略',
    });

    expect(result.status).toBe('blocked');
    expect(result.summary).toContain('authorization=missing');
    expect(result.summary).toContain('schedulerDecisionProposal=blocked');
    expect(timelinePort.recordTimelineEvent).not.toHaveBeenCalled();
  });

  it('runs startup recovery and schedules jobs when enabled', async () => {
    const homeData = {
      ...buildHomeData(),
      processTemplateCandidates: [buildBriefTemplateCandidate()],
    };
    const runRepository = {
      listIncompleteOlderThan: vi.fn().mockResolvedValue([buildRunRecord()]),
      updateResult: vi.fn().mockResolvedValue({
        ...buildRunRecord(),
        status: 'failed',
        output: 'Run 超过恢复窗口，已由本地 scheduler 标记为 failed。',
        outputSource: 'system',
        failureReason: 'Run exceeded the scheduler recovery window.',
      }),
    };
    const briefSnapshotRepository = {
      create: vi.fn().mockResolvedValue(undefined),
    };
    const homeBriefService = {
      getHomeData: vi.fn().mockResolvedValue(homeData),
    };
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
        featureFlags: { enableScheduler: true },
      }),
    };
    const briefExecutor = {
      execute: vi.fn().mockResolvedValue('AI brief'),
    };
    const briefProcessTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: true,
        selectedTemplates: [buildBriefTemplateCandidate()],
        reason: '当前局势风险突出，适合参考风险审阅模板。',
      }),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      homeBriefService as never,
      briefSnapshotRepository as never,
      runRepository as never,
      aiConfigService as never,
      briefExecutor as never,
      briefProcessTemplateSelector as never,
    );

    await service.start();

    expect(runRepository.listIncompleteOlderThan).toHaveBeenCalledTimes(1);
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'failed',
      'Run 超过恢复窗口，已由本地 scheduler 标记为 failed。',
      'system',
      'Run exceeded the scheduler recovery window.',
    );
    expect(homeBriefService.getHomeData).toHaveBeenCalledTimes(1);
    expect(aiConfigService.resolveRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(briefProcessTemplateSelector.select).toHaveBeenCalledTimes(1);
    expect(briefExecutor.execute).toHaveBeenCalledTimes(1);
    expect(briefExecutor.execute).toHaveBeenCalledWith(
      homeData,
      'startup',
      {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
        featureFlags: { enableScheduler: true },
      },
      {
        selectedTemplates: [buildBriefTemplateCandidate()],
      },
    );
    expect(briefSnapshotRepository.create).toHaveBeenCalledWith(
      'startup',
      'AI brief',
      'ai',
      null,
    );
    expect(service.getStatus().running).toBe(true);
    expect(service.getStatus().lastBriefAt).not.toBeNull();
    expect(service.getStatus().lastRunSweepAt).not.toBeNull();
    expect(service.getStatus().lastRunSweepSummary).toBe(
      'schedulerStaleRunRecovery=completed / checked=1 / recovered=1 / recoveredRunIds=run_1 / staleRunRecoveryDecisionProposals=run_1:skipped_no_timeline / failureReason=Run exceeded the scheduler recovery window. / agentRuntimeStarted=no',
    );
    expect(scheduledJobs).toHaveLength(2);

    service.stop();

    for (const job of scheduledJobs) {
      expect(job.stop).toHaveBeenCalledTimes(1);
      expect(job.destroy).toHaveBeenCalledTimes(1);
    }
    expect(service.getStatus().running).toBe(false);
  });

  it('wires a background scheduled/event Agent sweep only when trigger, timeline, and task-source ports are connected', async () => {
    const task = buildAutomationTaskDetail({
      sourceContexts: [buildSourceContext()],
      timeline: [buildStandingApprovalTimeline()],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 0 }),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const run = {
      ...buildRunRecord(),
      id: 'run_scheduled_cron_1',
      taskId: 'task_auto',
      type: 'agent',
    } satisfies RunRecord;
    const triggerPort = {
      triggerCodeAgentRun: vi.fn().mockResolvedValue(run),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const taskSourcePort = {
      listScheduledEventAgentTriggerCandidates: vi.fn().mockResolvedValue([task]),
    };
    const sweepListener = vi.fn();
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
      taskSourcePort,
      sweepListener,
    );

    await service.start();

    expect(scheduledJobs.map((job) => job.expression)).toEqual([
      '0 * * * *',
      '*/5 * * * *',
      '*/15 * * * *',
    ]);
    expect(service.getStatus().scheduledEventAgentSweepJobConnected).toBe(true);

    const sweepResult = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T11:00:00.000Z'),
    );

    expect(sweepResult).toMatchObject({
      status: 'completed',
      skipReason: 'none',
      checkedTaskCount: 1,
      startedRunCount: 1,
      blockedTaskCount: 0,
      startedRunIds: ['run_scheduled_cron_1'],
      blockedReasons: [],
      automationMissingRequirements: [],
      automationSatisfiedRequirements: expect.arrayContaining([
        'procedure',
        'inputs',
        'runtime',
        'scheduled_event_entrypoint',
      ]),
      runtimeStartMissingRequirements: [],
      terminalRunEvidenceMissingRunIds: ['run_scheduled_cron_1'],
      triggerRunEvidenceRequired: [
        'context_readiness',
        'target_task_identity',
        'task_memory_coverage',
        'task_memory_guidance',
        'subtask_start',
        'run_limit_count',
        'post_step',
      ],
      triggerRunEvidenceStatus: 'pending_terminal_run_evidence',
    });
    expect(sweepResult.summary).toContain('startedRunIds=run_scheduled_cron_1');
    expect(sweepResult.summary).toContain('blockedReasons=none');
    expect(sweepResult.summary).toContain('automationMissingRequirements=none');
    expect(sweepResult.summary).toContain('automationSatisfiedRequirements=');
    expect(sweepResult.summary).toContain('scheduled_event_entrypoint');
    expect(sweepResult.summary).toContain('runtimeStartMissingRequirements=none');
    expect(sweepResult.summary).toContain('terminalRunEvidenceMissingRunIds=run_scheduled_cron_1');
    expect(sweepResult.summary).toContain('triggerRunEvidenceRequired=context_readiness,target_task_identity,task_memory_coverage,task_memory_guidance,subtask_start,run_limit_count,post_step');
    expect(sweepResult.summary).toContain('triggerRunEvidenceStatus=pending_terminal_run_evidence');
    expect(taskSourcePort.listScheduledEventAgentTriggerCandidates).toHaveBeenCalledTimes(1);
    expect(runRepository.countCreatedSinceByTask).toHaveBeenCalledWith(
      ['task_auto'],
      '2026-05-26T00:00:00.000Z',
    );
    expect(triggerPort.triggerCodeAgentRun).toHaveBeenCalledWith({
      taskId: 'task_auto',
      patchIntent: expect.stringContaining('Scheduled/event Agent trigger under confirmed Taskplane Standing Approval.'),
      requestedChecks: ['test', 'lint'],
      operatorConfirmed: true,
      useModelProducer: true,
    });
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Target task: task_auto.');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Trigger kind: cron.');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Task memory guidance: process=Weekly update SOP; openCriteria=1; firstCriterion=Review the generated update.; sourceContexts=1; firstSource=Weekly metrics source');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Automation readiness: Automation readiness / state=eligible / automationReady=yes / requirements=9/9');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('scheduledEventEntrypoint=available');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Standing Approval scope: autonomy=L2_limited_authorized_action; riskCeiling=low; maxRunsPerDay=3; reason=Allow bounded weekly update preparation.');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Post-step evidence: return terminal run output for Taskplane review.');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Workspace write boundary: workspaceWriteAllowed=false; proposals only.');
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith({
      taskId: 'task_auto',
      type: 'panel.scheduled_event_agent_triggered',
      payload: expect.objectContaining({
        runId: 'run_scheduled_cron_1',
        runFailureReason: null,
        runOutputSource: null,
        runStatus: 'running',
        runtimeStartAllowed: true,
        triggerKind: 'cron',
        triggeredAt: '2026-05-26T11:00:00.000Z',
        workspaceWriteAllowed: false,
        automationReadinessSummary: expect.stringContaining('automationReady=yes'),
        automationSatisfiedRequirements: expect.arrayContaining(['scheduled_event_entrypoint']),
        automationMissingRequirements: [],
        runLimit: {
          maxRunsPerDay: 3,
          runsStartedToday: 0,
        },
      }),
    });
    expect(service.getStatus().lastScheduledEventAgentSweepAt).toBe('2026-05-26T11:00:00.000Z');
    expect(service.getStatus().lastScheduledEventAgentSweepSummary).toContain('scheduledEventAgentSweep=cron');
    expect(service.getStatus().lastScheduledEventAgentSweepSummary).toContain('triggerRunEvidenceStatus=pending_terminal_run_evidence');
    expect(service.getStatus().scheduledEventAgentSweepJobConnected).toBe(true);
    expect(sweepListener).toHaveBeenCalledWith(sweepResult);
  });

  it('blocks the background scheduled/event sweep when timeline evidence cannot be recorded', async () => {
    const task = buildAutomationTaskDetail({
      timeline: [buildStandingApprovalTimeline({ maxRunsPerDay: 2 })],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 1 }),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const triggerPort = {
      triggerCodeAgentRun: vi.fn().mockResolvedValue({
        ...buildRunRecord(),
        id: 'run_scheduled_cron_1',
        taskId: 'task_auto',
        type: 'agent',
      } satisfies RunRecord),
    };
    const sweepListener = vi.fn();
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      null,
      {
        listScheduledEventAgentTriggerCandidates: vi.fn().mockResolvedValue([task, task]),
      },
      sweepListener,
    );

    const sweepResult = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T11:00:00.000Z'),
    );

    expect(sweepResult).toMatchObject({
      status: 'skipped',
      skipReason: 'ports_not_connected',
      checkedTaskCount: 0,
      startedRunCount: 0,
      blockedTaskCount: 0,
      startedRunIds: [],
      blockedReasons: ['ports_not_connected'],
      runtimeStartMissingRequirements: ['scheduler_trigger_service'],
      terminalRunEvidenceMissingRunIds: [],
      triggerRunEvidenceRequired: [],
      triggerRunEvidenceStatus: 'not_started',
    });
    expect(sweepResult.summary).toContain('reason=ports_not_connected');
    expect(sweepResult.summary).toContain('missingPorts=timeline_port');
    expect(sweepResult.summary).toContain('triggerRunEvidenceStatus=not_started');
    expect(service.getStatus().lastScheduledEventAgentSweepAt).toBe('2026-05-26T11:00:00.000Z');
    expect(service.getStatus().lastScheduledEventAgentSweepSummary).toContain('reason=ports_not_connected');
    expect(triggerPort.triggerCodeAgentRun).not.toHaveBeenCalled();
    expect(sweepListener).toHaveBeenCalledWith(sweepResult);
  });

  it('runs the scheduled/event Agent sweep through the registered cron callback', async () => {
    const task = buildAutomationTaskDetail({
      sourceContexts: [buildSourceContext()],
      timeline: [buildStandingApprovalTimeline()],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 0 }),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const triggerPort = {
      triggerCodeAgentRun: vi.fn().mockResolvedValue({
        ...buildRunRecord(),
        failureReason: 'Model failed safely.',
        id: 'run_scheduled_callback_1',
        status: 'failed',
        taskId: 'task_auto',
        type: 'agent',
      } satisfies RunRecord),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const taskSourcePort = {
      listScheduledEventAgentTriggerCandidates: vi.fn().mockResolvedValue([task]),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
      taskSourcePort,
    );

    await service.start();
    const cronSweepJob = scheduledJobs.find((job) => job.expression === '*/15 * * * *');
    expect(cronSweepJob).toBeTruthy();

    cronSweepJob?.callback();

    await waitForAsyncSideEffect(() => {
      expect(triggerPort.triggerCodeAgentRun).toHaveBeenCalledTimes(1);
      expect(timelinePort.recordTimelineEvent).toHaveBeenCalledTimes(2);
    });
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0]).toMatchObject({
      operatorConfirmed: true,
      taskId: 'task_auto',
      useModelProducer: true,
    });
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Trigger kind: cron.');
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_auto',
      type: 'panel.scheduled_event_agent_triggered',
      payload: expect.objectContaining({
        runId: 'run_scheduled_callback_1',
        runFailureReason: 'Model failed safely.',
        runStatus: 'failed',
        targetTaskId: 'task_auto',
        triggerKind: 'cron',
        workspaceWriteAllowed: false,
      }),
    }));
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_auto',
      type: 'panel.scheduler_decision_proposed',
      payload: expect.objectContaining({
        authorization: 'standing_approval',
        evidenceRunId: 'run_scheduled_callback_1',
        proposedOutcome: '暂停自动巡检并等待人工处理',
        standingApprovalActive: true,
        standingApprovalPolicyId: 'standing_approval:task_auto:coding:local_sandbox',
        standingApprovalScopeTaskId: 'task_auto',
        targetTaskId: 'task_auto',
        title: '确认定时/事件 Agent 失败后的下一步',
      }),
    }));
    expect(service.getStatus().lastScheduledEventAgentSweepAt).not.toBeNull();
    expect(service.getStatus().lastScheduledEventAgentSweepSummary).toContain('scheduledEventAgentSweep=cron');
    expect(service.getStatus().lastScheduledEventAgentSweepSummary).toContain('runFailureReasons=run_scheduled_callback_1: Model failed safely.');
    expect(service.getStatus().lastScheduledEventAgentSweepSummary).toContain('failureDecisionProposals=proposed');
    expect(service.getStatus().scheduledEventAgentSweepJobConnected).toBe(true);
  });

  it('does not duplicate same-day failed-run Decision proposals', async () => {
    const task = buildAutomationTaskDetail({
      sourceContexts: [buildSourceContext()],
      timeline: [
        buildStandingApprovalTimeline(),
        {
          id: 'timeline_failed_run_decision',
          taskId: 'task_auto',
          type: 'panel.scheduler_decision_proposed',
          payload: JSON.stringify({
            title: '确认定时/事件 Agent 失败后的下一步',
          }),
          createdAt: '2026-05-26T09:00:00.000Z',
        },
      ],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 0 }),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const triggerPort = {
      triggerCodeAgentRun: vi.fn().mockResolvedValue({
        ...buildRunRecord(),
        failureReason: 'Model failed safely again.',
        id: 'run_scheduled_callback_2',
        status: 'failed',
        taskId: 'task_auto',
        type: 'agent',
      } satisfies RunRecord),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const taskSourcePort = {
      listScheduledEventAgentTriggerCandidates: vi.fn().mockResolvedValue([task]),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
      taskSourcePort,
    );

    const sweepResult = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T11:00:00.000Z'),
    );

    expect(sweepResult.summary).toContain('failureDecisionProposals=skipped_existing');
    expect(sweepResult.runFailureReasons).toEqual(['run_scheduled_callback_2: Model failed safely again.']);
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledTimes(1);
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_auto',
      type: 'panel.scheduled_event_agent_triggered',
      payload: expect.objectContaining({
        runId: 'run_scheduled_callback_2',
        runStatus: 'failed',
        triggerKind: 'cron',
      }),
    }));
  });

  it('blocks a second cron sweep when persisted same-day run count reaches the standing approval limit', async () => {
    let persistedRunCount = 0;
    const task = buildAutomationTaskDetail({
      timeline: [buildStandingApprovalTimeline({ maxRunsPerDay: 1 })],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockImplementation(async () => ({ task_auto: persistedRunCount })),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const triggerPort = {
      triggerCodeAgentRun: vi.fn().mockImplementation(async () => {
        persistedRunCount = 1;
        return {
          ...buildRunRecord(),
          id: 'run_scheduled_callback_1',
          taskId: 'task_auto',
          type: 'agent',
        } satisfies RunRecord;
      }),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const taskSourcePort = {
      listScheduledEventAgentTriggerCandidates: vi.fn().mockResolvedValue([task]),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
      taskSourcePort,
    );

    await service.start();
    const cronSweepJob = scheduledJobs.find((job) => job.expression === '*/15 * * * *');
    expect(cronSweepJob).toBeTruthy();

    cronSweepJob?.callback();
    await waitForAsyncSideEffect(() => {
      expect(triggerPort.triggerCodeAgentRun).toHaveBeenCalledTimes(1);
      expect(timelinePort.recordTimelineEvent).toHaveBeenCalledTimes(1);
    });

    cronSweepJob?.callback();
    await waitForAsyncSideEffect(() => {
      expect(taskSourcePort.listScheduledEventAgentTriggerCandidates).toHaveBeenCalledTimes(2);
      expect(runRepository.countCreatedSinceByTask).toHaveBeenCalledTimes(2);
    });

    expect(triggerPort.triggerCodeAgentRun).toHaveBeenCalledTimes(1);
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledTimes(2);
    expect(service.getStatus().lastScheduledEventAgentSweepSummary).toContain('status=completed');
    expect(service.getStatus().lastScheduledEventAgentSweepSummary).toContain('started=0');
    expect(service.getStatus().lastScheduledEventAgentSweepSummary).toContain('blocked=1');
    expect(service.getStatus().lastScheduledEventAgentSweepSummary).toContain('blockedReasons=Scheduled/event trigger daily run limit reached: 1/1.');
    expect(service.getStatus().lastScheduledEventAgentSweepSummary).toContain('runLimitDecisionProposals=proposed');
    expect(service.getStatus().lastScheduledEventAgentSweepSummary).toContain('automationMissingRequirements=none');
    expect(service.getStatus().lastScheduledEventAgentSweepSummary).toContain('triggerRunEvidenceStatus=not_started');
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_auto',
      type: 'panel.scheduler_decision_proposed',
      payload: expect.objectContaining({
        authorization: 'standing_approval',
        proposedOutcome: '等待下一次运行窗口',
        standingApprovalActive: true,
        standingApprovalPolicyId: 'standing_approval:task_auto:coding:local_sandbox',
        standingApprovalScopeTaskId: 'task_auto',
        targetTaskId: 'task_auto',
        title: '确认定时/事件 Agent 达到每日运行上限后的下一步',
      }),
    }));
  });

  it('does not duplicate daily run-limit Decision proposals already recorded today', async () => {
    const task = buildAutomationTaskDetail({
      timeline: [
        buildStandingApprovalTimeline({ maxRunsPerDay: 1 }),
        {
          id: 'timeline_run_limit_decision',
          taskId: 'task_auto',
          type: 'panel.scheduler_decision_proposed',
          payload: JSON.stringify({
            title: '确认定时/事件 Agent 达到每日运行上限后的下一步',
          }),
          createdAt: '2026-05-26T09:00:00.000Z',
        },
      ],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 1 }),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const triggerPort = {
      triggerCodeAgentRun: vi.fn(),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
      {
        listScheduledEventAgentTriggerCandidates: vi.fn().mockResolvedValue([task]),
      },
    );

    const sweepResult = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T11:00:00.000Z'),
    );

    expect(sweepResult.summary).toContain('runLimitDecisionProposals=skipped_existing');
    expect(triggerPort.triggerCodeAgentRun).not.toHaveBeenCalled();
    expect(timelinePort.recordTimelineEvent).not.toHaveBeenCalled();
  });

  it('proposes a scheduler Decision when run-limit accounting evidence is invalid', async () => {
    const task = buildAutomationTaskDetail({
      timeline: [buildStandingApprovalTimeline()],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: -1 }),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const triggerPort = {
      triggerCodeAgentRun: vi.fn(),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
      {
        listScheduledEventAgentTriggerCandidates: vi.fn().mockResolvedValue([task]),
      },
    );

    const sweepResult = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T10:15:00.000Z'),
    );

    expect(sweepResult).toMatchObject({
      status: 'completed',
      checkedTaskCount: 1,
      startedRunCount: 0,
      blockedTaskCount: 1,
      triggerRunEvidenceStatus: 'not_started',
    });
    expect(sweepResult.runtimeStartMissingRequirements).toContain('run_limit_count');
    expect(sweepResult.summary).toContain('runLimitAccountingDecisionProposals=proposed');
    expect(sweepResult.summary).toContain('runLimitDecisionProposals=none');
    expect(triggerPort.triggerCodeAgentRun).not.toHaveBeenCalled();
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_auto',
      type: 'panel.scheduler_decision_proposed',
      payload: expect.objectContaining({
        authorization: 'standing_approval',
        proposedOutcome: '暂停自动巡检并修复运行计数证据',
        standingApprovalActive: true,
        standingApprovalPolicyId: 'standing_approval:task_auto:coding:local_sandbox',
        standingApprovalScopeTaskId: 'task_auto',
        targetTaskId: 'task_auto',
        title: '确认定时/事件 Agent 运行计数证据异常后的下一步',
      }),
    }));
  });

  it('does not duplicate same-day run-limit accounting Decision proposals', async () => {
    const task = buildAutomationTaskDetail({
      timeline: [
        buildStandingApprovalTimeline(),
        {
          id: 'timeline_run_limit_accounting_decision',
          taskId: 'task_auto',
          type: 'panel.scheduler_decision_proposed',
          payload: JSON.stringify({
            title: '确认定时/事件 Agent 运行计数证据异常后的下一步',
          }),
          createdAt: '2026-05-26T09:00:00.000Z',
        },
      ],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: -1 }),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      {
        triggerCodeAgentRun: vi.fn(),
      },
      timelinePort,
      {
        listScheduledEventAgentTriggerCandidates: vi.fn().mockResolvedValue([task]),
      },
    );

    const sweepResult = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T10:45:00.000Z'),
    );

    expect(sweepResult.summary).toContain('runLimitAccountingDecisionProposals=skipped_existing');
    expect(timelinePort.recordTimelineEvent).not.toHaveBeenCalled();
  });

  it('proposes a scheduler Decision when an authorized scheduled/event task is blocked by automation readiness', async () => {
    const task = buildAutomationTaskDetail({
      nextStep: '',
      sourceContexts: [],
      summary: '',
      timeline: [buildStandingApprovalTimeline()],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 0 }),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const triggerPort = {
      triggerCodeAgentRun: vi.fn(),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
      {
        listScheduledEventAgentTriggerCandidates: vi.fn().mockResolvedValue([task]),
      },
    );

    const sweepResult = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T10:30:00.000Z'),
    );

    expect(sweepResult).toMatchObject({
      status: 'completed',
      checkedTaskCount: 1,
      startedRunCount: 0,
      blockedTaskCount: 1,
      triggerRunEvidenceStatus: 'not_started',
    });
    expect(sweepResult.automationMissingRequirements).toContain('inputs');
    expect(sweepResult.summary).toContain('readinessDecisionProposals=proposed');
    expect(sweepResult.summary).toContain('automationMissingRequirements=inputs');
    expect(triggerPort.triggerCodeAgentRun).not.toHaveBeenCalled();
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_auto',
      type: 'panel.scheduler_decision_proposed',
      payload: expect.objectContaining({
        authorization: 'standing_approval',
        proposedOutcome: '补齐任务上下文后下次 sweep 再运行',
        standingApprovalActive: true,
        standingApprovalPolicyId: 'standing_approval:task_auto:coding:local_sandbox',
        standingApprovalScopeTaskId: 'task_auto',
        targetTaskId: 'task_auto',
        title: '确认定时/事件 Agent readiness 阻塞后的下一步',
      }),
    }));
  });

  it('does not duplicate same-day scheduled/event readiness blocked Decision proposals', async () => {
    const task = buildAutomationTaskDetail({
      nextStep: '',
      sourceContexts: [],
      summary: '',
      timeline: [
        buildStandingApprovalTimeline(),
        {
          id: 'timeline_readiness_blocked_decision',
          taskId: 'task_auto',
          type: 'panel.scheduler_decision_proposed',
          payload: JSON.stringify({
            title: '确认定时/事件 Agent readiness 阻塞后的下一步',
          }),
          createdAt: '2026-05-26T09:00:00.000Z',
        },
      ],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 0 }),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      {
        triggerCodeAgentRun: vi.fn(),
      },
      timelinePort,
      {
        listScheduledEventAgentTriggerCandidates: vi.fn().mockResolvedValue([task]),
      },
    );

    const sweepResult = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T10:30:00.000Z'),
    );

    expect(sweepResult.summary).toContain('readinessDecisionProposals=skipped_existing');
    expect(timelinePort.recordTimelineEvent).not.toHaveBeenCalled();
  });

  it('counts runs started earlier in the same scheduled/event sweep against the daily limit', async () => {
    const task = buildAutomationTaskDetail({
      timeline: [buildStandingApprovalTimeline({ maxRunsPerDay: 2 })],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 1 }),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const triggerPort = {
      triggerCodeAgentRun: vi.fn().mockResolvedValue({
        ...buildRunRecord(),
        id: 'run_scheduled_cron_1',
        taskId: 'task_auto',
        type: 'agent',
      } satisfies RunRecord),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
      {
        listScheduledEventAgentTriggerCandidates: vi.fn().mockResolvedValue([task, task]),
      },
    );

    const sweepResult = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T11:00:00.000Z'),
    );

    expect(sweepResult).toMatchObject({
      status: 'completed',
      skipReason: 'none',
      checkedTaskCount: 2,
      checkedTaskIds: ['task_auto', 'task_auto'],
      startedRunCount: 1,
      blockedTaskCount: 1,
      startedRunIds: ['run_scheduled_cron_1'],
      blockedTaskSummaries: ['task_auto: Scheduled/event trigger daily run limit reached: 2/2.'],
      runtimeStartMissingRequirements: ['trigger_plan_ready'],
      terminalRunEvidenceMissingRunIds: ['run_scheduled_cron_1'],
      triggerRunEvidenceRequired: [
        'context_readiness',
        'target_task_identity',
        'task_memory_coverage',
        'task_memory_guidance',
        'subtask_start',
        'run_limit_count',
        'post_step',
      ],
      triggerRunEvidenceStatus: 'pending_terminal_run_evidence',
    });
    expect(sweepResult.summary).toContain('checkedTaskIds=task_auto,task_auto');
    expect(sweepResult.blockedReasons).toContain('Scheduled/event trigger daily run limit reached: 2/2.');
    expect(sweepResult.summary).toContain('startedRunIds=run_scheduled_cron_1');
    expect(sweepResult.summary).toContain('blockedReasons=Scheduled/event trigger daily run limit reached: 2/2.');
    expect(sweepResult.summary).toContain('blockedTaskSummaries=task_auto: Scheduled/event trigger daily run limit reached: 2/2.');
    expect(sweepResult.summary).toContain('runtimeStartMissingRequirements=trigger_plan_ready');
    expect(sweepResult.summary).toContain('terminalRunEvidenceMissingRunIds=run_scheduled_cron_1');
    expect(triggerPort.triggerCodeAgentRun).toHaveBeenCalledTimes(1);
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledTimes(2);
    expect(sweepResult.summary).toContain('runLimitDecisionProposals=proposed');
    expect(sweepResult.summaries.join(' ')).toContain('daily run limit reached: 2/2');
  });

  it('skips overlapping scheduled/event sweeps while one sweep is in flight', async () => {
    const task = buildAutomationTaskDetail({
      timeline: [buildStandingApprovalTimeline()],
    });
    let releaseCandidates: (() => void) | null = null;
    const candidatesReady = new Promise<void>((resolve) => {
      releaseCandidates = resolve;
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 0 }),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const triggerPort = {
      triggerCodeAgentRun: vi.fn().mockResolvedValue({
        ...buildRunRecord(),
        id: 'run_scheduled_in_flight_1',
        taskId: 'task_auto',
        type: 'agent',
      } satisfies RunRecord),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const taskSourcePort = {
      listScheduledEventAgentTriggerCandidates: vi.fn().mockImplementation(async () => {
        await candidatesReady;
        return [task];
      }),
    };
    const sweepListener = vi.fn();
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
      taskSourcePort,
      sweepListener,
    );

    const firstSweep = service.runScheduledEventAgentTriggerSweep('cron');
    await waitForAsyncSideEffect(() => {
      expect(taskSourcePort.listScheduledEventAgentTriggerCandidates).toHaveBeenCalledTimes(1);
    });

    const overlappingSweep = await service.runScheduledEventAgentTriggerSweep('cron');
    expect(overlappingSweep).toMatchObject({
      status: 'skipped',
      skipReason: 'in_flight',
      checkedTaskCount: 0,
      startedRunCount: 0,
      blockedReasons: ['in_flight'],
      triggerRunEvidenceStatus: 'not_started',
    });
    expect(overlappingSweep.summary).toContain('reason=in_flight');
    expect(service.getStatus().lastScheduledEventAgentSweepAt).not.toBeNull();
    expect(service.getStatus().lastScheduledEventAgentSweepSummary).toContain('reason=in_flight');
    expect(triggerPort.triggerCodeAgentRun).not.toHaveBeenCalled();
    expect(sweepListener).toHaveBeenCalledWith(overlappingSweep);

    releaseCandidates?.();
    const completedFirstSweep = await firstSweep;
    expect(completedFirstSweep.status).toBe('completed');
    expect(triggerPort.triggerCodeAgentRun).toHaveBeenCalledTimes(1);
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledTimes(1);
  });

  it('records a failed scheduled/event sweep and releases the in-flight guard', async () => {
    const task = buildAutomationTaskDetail({
      timeline: [buildStandingApprovalTimeline()],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 0 }),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const triggerPort = {
      triggerCodeAgentRun: vi.fn().mockRejectedValueOnce(new Error('Trigger port failed / safely')),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const taskSourcePort = {
      listScheduledEventAgentTriggerCandidates: vi.fn().mockResolvedValue([task]),
    };
    const sweepListener = vi.fn();
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
      taskSourcePort,
      sweepListener,
    );

    const failedSweep = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T11:00:00.000Z'),
    );

    expect(failedSweep).toMatchObject({
      status: 'skipped',
      skipReason: 'sweep_failed',
      checkedTaskCount: 1,
      checkedTaskIds: ['task_auto'],
      startedRunCount: 0,
      blockedTaskCount: 1,
      startedRunIds: [],
      runFailureReasons: [],
      runtimeStartMissingRequirements: ['trigger_plan_ready'],
      terminalRunEvidenceMissingRunIds: [],
      triggerRunEvidenceRequired: [
        'context_readiness',
        'target_task_identity',
        'task_memory_coverage',
        'task_memory_guidance',
        'subtask_start',
        'run_limit_count',
        'post_step',
      ],
      triggerRunEvidenceStatus: 'not_started',
    });
    expect(failedSweep.blockedReasons).toEqual(['sweep_failed: Trigger port failed - safely']);
    expect(failedSweep.blockedTaskSummaries).toEqual(['task_auto: sweep_failed: Trigger port failed - safely']);
    expect(failedSweep.summary).toContain('reason=sweep_failed');
    expect(failedSweep.summary).toContain('checkedTaskIds=task_auto');
    expect(failedSweep.summary).toContain('error=Trigger port failed - safely');
    expect(failedSweep.summary).toContain('sweepFailureDecisionProposals=proposed');
    expect(service.getStatus().lastScheduledEventAgentSweepAt).toBe('2026-05-26T11:00:00.000Z');
    expect(service.getStatus().lastScheduledEventAgentSweepSummary).toBe(failedSweep.summary);
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_auto',
      type: 'panel.scheduler_decision_proposed',
      payload: expect.objectContaining({
        authorization: 'standing_approval',
        proposedOutcome: '暂停自动触发并人工复核调度器',
        standingApprovalActive: true,
        standingApprovalPolicyId: 'standing_approval:task_auto:coding:local_sandbox',
        standingApprovalScopeTaskId: 'task_auto',
        targetTaskId: 'task_auto',
        title: '确认定时/事件 Agent sweep 异常后的下一步',
      }),
    }));
    expect(sweepListener).toHaveBeenCalledWith(failedSweep);

    triggerPort.triggerCodeAgentRun.mockResolvedValueOnce({
      ...buildRunRecord(),
      id: 'run_after_failed_sweep',
      taskId: 'task_auto',
      type: 'agent',
    } satisfies RunRecord);
    const recoveredSweep = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T11:15:00.000Z'),
    );

    expect(recoveredSweep.status).toBe('completed');
    expect(recoveredSweep.startedRunIds).toEqual(['run_after_failed_sweep']);
    expect(triggerPort.triggerCodeAgentRun).toHaveBeenCalledTimes(2);
  });

  it('does not duplicate same-day scheduled/event sweep failure Decision proposals', async () => {
    const task = buildAutomationTaskDetail({
      timeline: [
        buildStandingApprovalTimeline(),
        {
          id: 'timeline_sweep_failure_decision',
          taskId: 'task_auto',
          type: 'panel.scheduler_decision_proposed',
          payload: JSON.stringify({
            title: '确认定时/事件 Agent sweep 异常后的下一步',
          }),
          createdAt: '2026-05-26T09:00:00.000Z',
        },
      ],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 0 }),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const triggerPort = {
      triggerCodeAgentRun: vi.fn().mockRejectedValueOnce(new Error('Trigger port failed / safely')),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
      {
        listScheduledEventAgentTriggerCandidates: vi.fn().mockResolvedValue([task]),
      },
    );

    const failedSweep = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T11:00:00.000Z'),
    );

    expect(failedSweep.summary).toContain('sweepFailureDecisionProposals=skipped_existing');
    expect(timelinePort.recordTimelineEvent).not.toHaveBeenCalled();
  });

  it('preserves started run evidence when timeline recording fails during a scheduled/event sweep', async () => {
    const task = buildAutomationTaskDetail({
      timeline: [buildStandingApprovalTimeline()],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 0 }),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const triggerPort = {
      triggerCodeAgentRun: vi.fn().mockResolvedValue({
        ...buildRunRecord(),
        id: 'run_timeline_failure_sweep',
        taskId: 'task_auto',
        type: 'agent',
        status: 'running',
      } satisfies RunRecord),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockRejectedValueOnce(new Error('Timeline write failed / safely')),
    };
    const taskSourcePort = {
      listScheduledEventAgentTriggerCandidates: vi.fn().mockResolvedValue([task]),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
      taskSourcePort,
    );

    const failedSweep = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T12:00:00.000Z'),
    );

    expect(failedSweep).toMatchObject({
      status: 'skipped',
      skipReason: 'sweep_failed',
      checkedTaskCount: 1,
      checkedTaskIds: ['task_auto'],
      startedRunCount: 1,
      blockedTaskCount: 0,
      startedRunIds: ['run_timeline_failure_sweep'],
      blockedTaskSummaries: [],
      runFailureReasons: [],
      terminalRunEvidenceMissingRunIds: ['run_timeline_failure_sweep'],
      triggerRunEvidenceStatus: 'pending_terminal_run_evidence',
    });
    expect(failedSweep.triggerRunEvidenceRequired).toEqual([
      'context_readiness',
      'target_task_identity',
      'task_memory_coverage',
      'task_memory_guidance',
      'subtask_start',
      'run_limit_count',
      'post_step',
    ]);
    expect(failedSweep.summary).toContain('reason=sweep_failed');
    expect(failedSweep.summary).toContain('startedRunIds=run_timeline_failure_sweep');
    expect(failedSweep.summary).toContain('terminalRunEvidenceMissingRunIds=run_timeline_failure_sweep');
    expect(failedSweep.summary).toContain('triggerRunEvidenceStatus=pending_terminal_run_evidence');
    expect(failedSweep.summary).toContain('error=Timeline evidence failed: Timeline write failed - safely');
    expect(failedSweep.summary).toContain('timelineFailureDecisionProposals=proposed');
    expect(service.getStatus().lastScheduledEventAgentSweepSummary).toBe(failedSweep.summary);
    expect(triggerPort.triggerCodeAgentRun).toHaveBeenCalledTimes(1);
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledTimes(2);
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_auto',
      type: 'panel.scheduler_decision_proposed',
      payload: expect.objectContaining({
        authorization: 'standing_approval',
        evidenceRunId: 'run_timeline_failure_sweep',
        proposedOutcome: '暂停自动触发并修复 timeline 证据写入',
        standingApprovalActive: true,
        standingApprovalPolicyId: 'standing_approval:task_auto:coding:local_sandbox',
        standingApprovalScopeTaskId: 'task_auto',
        targetTaskId: 'task_auto',
        title: '确认定时/事件 Agent timeline 证据写入失败后的下一步',
      }),
    }));
  });

  it('proposes a scheduler Decision when a scheduled/event run returns the wrong target task', async () => {
    const task = buildAutomationTaskDetail({
      timeline: [buildStandingApprovalTimeline()],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 0 }),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const triggerPort = {
      triggerCodeAgentRun: vi.fn().mockResolvedValue({
        ...buildRunRecord(),
        id: 'run_wrong_task_sweep',
        taskId: 'task_other',
        type: 'agent',
        status: 'running',
      } satisfies RunRecord),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const taskSourcePort = {
      listScheduledEventAgentTriggerCandidates: vi.fn().mockResolvedValue([task]),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
      taskSourcePort,
    );

    const failedSweep = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T12:30:00.000Z'),
    );

    expect(failedSweep).toMatchObject({
      status: 'skipped',
      skipReason: 'sweep_failed',
      checkedTaskCount: 1,
      checkedTaskIds: ['task_auto'],
      startedRunCount: 1,
      blockedTaskCount: 0,
      startedRunIds: ['run_wrong_task_sweep'],
      blockedTaskSummaries: [],
      terminalRunEvidenceMissingRunIds: ['run_wrong_task_sweep'],
      triggerRunEvidenceStatus: 'pending_terminal_run_evidence',
    });
    expect(failedSweep.summary).toContain('error=Run target task mismatch: expected task_auto but received task_other.');
    expect(failedSweep.summary).toContain('runIdentityDecisionProposals=proposed');
    expect(failedSweep.summary).toContain('timelineFailureDecisionProposals=not_required');
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledTimes(1);
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_auto',
      type: 'panel.scheduler_decision_proposed',
      payload: expect.objectContaining({
        authorization: 'standing_approval',
        evidenceRunId: 'run_wrong_task_sweep',
        proposedOutcome: '暂停自动触发并人工复核运行归属',
        standingApprovalActive: true,
        standingApprovalPolicyId: 'standing_approval:task_auto:coding:local_sandbox',
        standingApprovalScopeTaskId: 'task_auto',
        targetTaskId: 'task_auto',
        title: '确认定时/事件 Agent Run 目标任务不一致后的下一步',
      }),
    }));
  });

  it('does not duplicate same-day scheduled/event timeline failure Decision proposals', async () => {
    const task = buildAutomationTaskDetail({
      timeline: [
        buildStandingApprovalTimeline(),
        {
          id: 'timeline_timeline_failure_decision',
          taskId: 'task_auto',
          type: 'panel.scheduler_decision_proposed',
          payload: JSON.stringify({
            title: '确认定时/事件 Agent timeline 证据写入失败后的下一步',
          }),
          createdAt: '2026-05-26T09:00:00.000Z',
        },
      ],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 0 }),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const triggerPort = {
      triggerCodeAgentRun: vi.fn().mockResolvedValue({
        ...buildRunRecord(),
        id: 'run_timeline_failure_dedupe',
        taskId: 'task_auto',
        type: 'agent',
        status: 'running',
      } satisfies RunRecord),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockRejectedValueOnce(new Error('Timeline write failed / safely')),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
      {
        listScheduledEventAgentTriggerCandidates: vi.fn().mockResolvedValue([task]),
      },
    );

    const failedSweep = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T12:00:00.000Z'),
    );

    expect(failedSweep.summary).toContain('timelineFailureDecisionProposals=skipped_existing');
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledTimes(1);
  });

  it('records a failed scheduled/event sweep when the task source fails before any run starts', async () => {
    const task = buildAutomationTaskDetail({
      timeline: [buildStandingApprovalTimeline()],
    });
    let taskSourceShouldThrow = true;
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 0 }),
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const triggerPort = {
      triggerCodeAgentRun: vi.fn().mockResolvedValue({
        ...buildRunRecord(),
        id: 'run_after_task_source_failure',
        taskId: 'task_auto',
        type: 'agent',
      } satisfies RunRecord),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const taskSourcePort = {
      listScheduledEventAgentTriggerCandidates: vi.fn().mockImplementation(async () => {
        if (taskSourceShouldThrow) {
          throw new Error('Task source failed / safely');
        }
        return [task];
      }),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn().mockResolvedValue(undefined),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
      taskSourcePort,
    );

    const failedSweep = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T11:30:00.000Z'),
    );

    expect(failedSweep).toMatchObject({
      status: 'skipped',
      skipReason: 'sweep_failed',
      checkedTaskCount: 0,
      checkedTaskIds: [],
      startedRunCount: 0,
      blockedTaskCount: 0,
      startedRunIds: [],
      blockedReasons: ['sweep_failed: Task source failed - safely'],
      blockedTaskSummaries: [],
      runtimeStartMissingRequirements: ['trigger_plan_ready'],
      triggerRunEvidenceStatus: 'not_started',
    });
    expect(failedSweep.summary).toContain('checked=0');
    expect(failedSweep.summary).toContain('checkedTaskIds=none');
    expect(failedSweep.summary).toContain('error=Task source failed - safely');
    expect(failedSweep.summary).toContain('sweepFailureDecisionProposals=not_required');
    expect(failedSweep.summary).toContain('taskSourceFailureDecisionProposals=not_required_no_target_task');
    expect(failedSweep.summary).toContain('timelineFailureDecisionProposals=not_required');
    expect(service.getStatus().lastScheduledEventAgentSweepAt).toBe('2026-05-26T11:30:00.000Z');
    expect(service.getStatus().lastScheduledEventAgentSweepSummary).toBe(failedSweep.summary);
    expect(triggerPort.triggerCodeAgentRun).not.toHaveBeenCalled();
    expect(timelinePort.recordTimelineEvent).not.toHaveBeenCalled();

    taskSourceShouldThrow = false;
    const recoveredSweep = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T11:45:00.000Z'),
    );

    expect(recoveredSweep.status).toBe('completed');
    expect(recoveredSweep.startedRunIds).toEqual(['run_after_task_source_failure']);
    expect(triggerPort.triggerCodeAgentRun).toHaveBeenCalledTimes(1);
  });

  it('does not mark runs failed when repository stale recovery returns no eligible runs', async () => {
    const runRepository = {
      listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
      updateResult: vi.fn(),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn(),
      } as never,
      runRepository as never,
      {
        resolveRuntimeConfig: vi.fn().mockRejectedValue(new Error('skip AI brief')),
      } as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
    );

    await service.start();

    expect(runRepository.listIncompleteOlderThan).toHaveBeenCalledTimes(1);
    expect(runRepository.updateResult).not.toHaveBeenCalled();
    expect(service.getStatus().lastRunSweepAt).not.toBeNull();
    expect(service.getStatus().lastRunSweepSummary).toBe(
      'schedulerStaleRunRecovery=completed / checked=0 / recovered=0 / recoveredRunIds=none / staleRunRecoveryDecisionProposals=none / failureReason=Run exceeded the scheduler recovery window. / agentRuntimeStarted=no',
    );
  });

  it('proposes a Task Dynamics Decision after local stale-run recovery', async () => {
    const staleRun = {
      ...buildRunRecord(),
      id: 'run_stale_recovered',
      taskId: 'task_stale_recovered',
    };
    const runRepository = {
      listIncompleteOlderThan: vi.fn().mockResolvedValue([staleRun]),
      updateResult: vi.fn().mockResolvedValue({
        ...staleRun,
        status: 'failed',
        output: 'Run 超过恢复窗口，已由本地 scheduler 标记为 failed。',
        outputSource: 'system',
        failureReason: 'Run exceeded the scheduler recovery window.',
      }),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      {
        create: vi.fn(),
      } as never,
      runRepository as never,
      {
        resolveRuntimeConfig: vi.fn().mockRejectedValue(new Error('skip AI brief')),
      } as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      null,
      timelinePort,
    );

    await service.start();

    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_stale_recovered',
      type: 'panel.scheduler_decision_proposed',
      payload: expect.objectContaining({
        authorization: 'local_recovery',
        evidenceRunId: 'run_stale_recovered',
        localRecoveryCompleted: true,
        localRecoveryRunId: 'run_stale_recovered',
        proposedOutcome: '复核失败证据后手动重跑',
        targetTaskId: 'task_stale_recovered',
        title: '确认 stale run 自动恢复后的下一步',
      }),
    }));
    expect(service.getStatus().lastRunSweepSummary).toContain('staleRunRecoveryDecisionProposals=run_stale_recovered:proposed');
    expect(service.getStatus().lastRunSweepSummary).toContain('agentRuntimeStarted=no');
  });

  it('falls back to a local brief when AI brief generation fails', async () => {
    const briefSnapshotRepository = {
      create: vi.fn().mockResolvedValue(undefined),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      briefSnapshotRepository as never,
      {
        listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
        updateResult: vi.fn(),
      } as never,
      {
        resolveRuntimeConfig: vi.fn().mockRejectedValue(new Error('AI API Key is not configured in system Keychain.')),
      } as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
    );

    await service.start();

    expect(briefSnapshotRepository.create).toHaveBeenCalledTimes(1);
    expect(briefSnapshotRepository.create).toHaveBeenCalledWith(
      'startup',
      expect.stringContaining('Taskplane Brief (startup)'),
      'fallback',
      'AI API Key is not configured in system Keychain.',
    );
  });

  it('keeps scheduled brief local when Agent CLI is the selected runtime', async () => {
    const briefSnapshotRepository = {
      create: vi.fn().mockResolvedValue(undefined),
    };
    const aiConfigService = {
      getStatus: vi.fn().mockResolvedValue({ runtimeMode: 'claude' }),
      resolveRuntimeConfig: vi.fn(),
    };
    const briefExecutor = {
      execute: vi.fn(),
    };
    const briefProcessTemplateSelector = {
      select: vi.fn(),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(buildHomeData()),
      } as never,
      briefSnapshotRepository as never,
      {
        listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
        updateResult: vi.fn(),
      } as never,
      aiConfigService as never,
      briefExecutor as never,
      briefProcessTemplateSelector as never,
    );

    await service.start();

    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(briefProcessTemplateSelector.select).not.toHaveBeenCalled();
    expect(briefExecutor.execute).not.toHaveBeenCalled();
    expect(briefSnapshotRepository.create).toHaveBeenCalledWith(
      'startup',
      expect.stringContaining('Taskplane Brief (startup)'),
      'fallback',
      '当前选择的是 Claude Code，Scheduled Brief API adapter 不会切换到 Agent API Runtime。',
    );
  });

  it('diagnoses scheduled/event agent triggers without starting native runtimes', async () => {
    const now = new Date('2026-05-26T11:00:00.000Z');
    const task = buildAutomationTaskDetail();
    const aiConfigService = {
      getStatus: vi.fn().mockResolvedValue({
        featureFlags: {
          enableScheduler: true,
          enableSandboxCodingAgent: true,
        },
        sandboxBackendStatus: {
          readiness: {
            blockedReasons: [],
            ready: true,
            summary: 'Sandbox ready.',
          },
          producerBackendReadiness: {
            blockedReasons: [],
            ready: true,
            summary: 'Producer ready.',
          },
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
          summary: 'Sandbox ready.',
        },
        toolScaffoldSummaries: [],
        workspaceRoot: '/tmp/workspace',
      }),
      resolveRuntimeConfig: vi.fn(),
    };
    const policy = {
      id: 'standing_approval:task_auto:coding:local_sandbox',
      allowedAutonomyLevel: 'L2_limited_authorized_action',
      allowedLanes: ['coding'],
      allowedRuntimeIds: ['local_sandbox'],
      createdAt: '2026-05-26T10:00:00.000Z',
      expiresAt: '2026-05-27T10:00:00.000Z',
      maxRunsPerDay: 3,
      reason: 'Allow bounded weekly update preparation.',
      riskCeiling: 'low',
      status: 'active',
      taskFacets: ['scheduled'],
      taskId: 'task_auto',
      taskTypes: ['routine'],
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn(),
      } as never,
      {
        create: vi.fn(),
      } as never,
      {
        listIncompleteOlderThan: vi.fn(),
        updateResult: vi.fn(),
      } as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
    );

    const diagnostics = await service.diagnoseScheduledEventAgentTriggers([
      {
        ...task,
        timeline: [{
          id: 'timeline_approval',
          taskId: task.id,
          type: 'panel.standing_approval_confirmed',
          payload: JSON.stringify({
            policy,
            schedulerTriggerAllowed: false,
            workspaceWriteAllowed: false,
          }),
          createdAt: '2026-05-26T10:05:00.000Z',
        }],
      },
    ], now, { task_auto: 1 });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      status: 'ready',
      triggerPlanReady: true,
      runtimeStartAllowed: false,
      schedulerTriggerServiceConnected: false,
      triggerRunEvidenceRequired: expect.arrayContaining([
        'context_readiness',
        'target_task_identity',
        'task_memory_coverage',
        'task_memory_guidance',
        'subtask_start',
        'run_limit_count',
        'post_step',
      ]),
      policy: {
        id: 'standing_approval:task_auto:coding:local_sandbox',
      },
      runLimit: {
        maxRunsPerDay: 3,
        runsStartedToday: 1,
      },
    });
    expect(diagnostics[0]?.summary).toContain('runLimit=1/3');
    expect(aiConfigService.getStatus).toHaveBeenCalledTimes(1);
    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(scheduledJobs).toHaveLength(0);
  });

  it('loads scheduler diagnostic run-limit counts from the run repository when not provided', async () => {
    const now = new Date('2026-05-26T11:00:00.000Z');
    const task = buildAutomationTaskDetail();
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 3 }),
      listIncompleteOlderThan: vi.fn(),
      updateResult: vi.fn(),
    };
    const aiConfigService = {
      getStatus: vi.fn().mockResolvedValue({
        featureFlags: {
          enableScheduler: true,
          enableSandboxCodingAgent: true,
        },
        sandboxBackendStatus: {
          readiness: {
            blockedReasons: [],
            ready: true,
            summary: 'Sandbox ready.',
          },
          producerBackendReadiness: {
            blockedReasons: [],
            ready: true,
            summary: 'Producer ready.',
          },
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
          summary: 'Sandbox ready.',
        },
        toolScaffoldSummaries: [],
        workspaceRoot: '/tmp/workspace',
      }),
      resolveRuntimeConfig: vi.fn(),
    };
    const policy = {
      id: 'standing_approval:task_auto:coding:local_sandbox',
      allowedAutonomyLevel: 'L2_limited_authorized_action',
      allowedLanes: ['coding'],
      allowedRuntimeIds: ['local_sandbox'],
      createdAt: '2026-05-26T10:00:00.000Z',
      expiresAt: '2026-05-27T10:00:00.000Z',
      maxRunsPerDay: 3,
      reason: 'Allow bounded weekly update preparation.',
      riskCeiling: 'low',
      status: 'active',
      taskFacets: ['scheduled'],
      taskId: 'task_auto',
      taskTypes: ['routine'],
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn(),
      } as never,
      {
        create: vi.fn(),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
    );

    const diagnostics = await service.diagnoseScheduledEventAgentTriggers([
      {
        ...task,
        timeline: [{
          id: 'timeline_approval',
          taskId: task.id,
          type: 'panel.standing_approval_confirmed',
          payload: JSON.stringify({
            policy,
            schedulerTriggerAllowed: false,
            workspaceWriteAllowed: false,
          }),
          createdAt: '2026-05-26T10:05:00.000Z',
        }],
      },
    ], now);

    expect(runRepository.countCreatedSinceByTask).toHaveBeenCalledWith(
      ['task_auto'],
      '2026-05-26T00:00:00.000Z',
    );
    expect(diagnostics[0]).toMatchObject({
      status: 'blocked',
      runLimit: {
        maxRunsPerDay: 3,
        runsStartedToday: 3,
      },
      blockedReasons: expect.arrayContaining([
        'Scheduled/event trigger daily run limit reached: 3/3.',
      ]),
    });
    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(scheduledJobs).toHaveLength(0);
  });

  it('blocks scheduled/event agent trigger starts when the trigger service port is not connected', async () => {
    const now = new Date('2026-05-26T11:00:00.000Z');
    const task = buildAutomationTaskDetail({
      timeline: [buildStandingApprovalTimeline()],
    });
    const aiConfigService = buildReadyAutomationAiConfigService();
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn(),
      } as never,
      {
        create: vi.fn(),
      } as never,
      {
        countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 0 }),
        listIncompleteOlderThan: vi.fn(),
        updateResult: vi.fn(),
      } as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
    );

    const result = await service.triggerScheduledEventAgentRun(task, now);

    expect(result.status).toBe('blocked');
    expect(result.run).toBeNull();
    expect(result.terminalRunEvidenceStatus).toBe('not_started');
    expect(result.triggerRunEvidenceStatus).toBe('not_started');
    expect(result.plan).toMatchObject({
      status: 'ready',
      triggerPlanReady: true,
      runtimeStartAllowed: false,
      schedulerTriggerServiceConnected: false,
    });
    expect(result.summary).toContain('Scheduled event Agent trigger service is not connected');
    expect(result.summary).toContain('triggerRunEvidenceStatus=not_started');
    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
  });

  it('blocks scheduled/event agent trigger starts when timeline evidence service is not connected', async () => {
    const now = new Date('2026-05-26T11:00:00.000Z');
    const task = buildAutomationTaskDetail({
      timeline: [buildStandingApprovalTimeline()],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 0 }),
      listIncompleteOlderThan: vi.fn(),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const triggerPort = {
      triggerCodeAgentRun: vi.fn(),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn(),
      } as never,
      {
        create: vi.fn(),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      null,
    );

    const result = await service.triggerScheduledEventAgentRun(task, now);

    expect(result.status).toBe('blocked');
    expect(result.run).toBeNull();
    expect(result.terminalRunEvidenceStatus).toBe('not_started');
    expect(result.triggerRunEvidenceStatus).toBe('not_started');
    expect(result.plan).toMatchObject({
      status: 'ready',
      triggerPlanReady: true,
      runtimeStartAllowed: true,
      schedulerTriggerServiceConnected: true,
    });
    expect(result.summary).toContain('Scheduled event Agent timeline evidence service is not connected');
    expect(result.summary).toContain('triggerRunEvidenceStatus=not_started');
    expect(triggerPort.triggerCodeAgentRun).not.toHaveBeenCalled();
  });

  it('starts a bounded Code Agent run when scheduled/event trigger gates and standing approval pass', async () => {
    const now = new Date('2026-05-26T11:00:00.000Z');
    const task = buildAutomationTaskDetail({
      timeline: [buildStandingApprovalTimeline()],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 1 }),
      listIncompleteOlderThan: vi.fn(),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const run = {
      ...buildRunRecord(),
      id: 'run_scheduled_1',
      output: 'Code Agent preview completed.',
      outputSource: 'system',
      status: 'completed',
      taskId: 'task_auto',
      type: 'agent',
    } satisfies RunRecord;
    const triggerPort = {
      triggerCodeAgentRun: vi.fn().mockResolvedValue(run),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn(),
      } as never,
      {
        create: vi.fn(),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
    );

    const result = await service.triggerScheduledEventAgentRun(task, now);

    expect(runRepository.countCreatedSinceByTask).toHaveBeenCalledWith(
      ['task_auto'],
      '2026-05-26T00:00:00.000Z',
    );
    expect(triggerPort.triggerCodeAgentRun).toHaveBeenCalledWith({
      taskId: 'task_auto',
      patchIntent: expect.stringContaining('Scheduled/event Agent trigger under confirmed Taskplane Standing Approval.'),
      requestedChecks: ['test', 'lint'],
      operatorConfirmed: true,
      useModelProducer: true,
    });
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Next step: Prepare the weekly update.');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Target task: task_auto.');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Task memory guidance: process=Weekly update SOP; openCriteria=1; firstCriterion=Review the generated update.; sourceContexts=0; firstSource=none');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Standing Approval policy: standing_approval:task_auto:coding:local_sandbox.');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Standing Approval scope: autonomy=L2_limited_authorized_action; riskCeiling=low; maxRunsPerDay=3; reason=Allow bounded weekly update preparation.');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Runtime start requirements: trigger_plan_ready,scheduler_trigger_service,run_limit_count.');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('context_readiness,target_task_identity,task_memory_coverage,task_memory_guidance,subtask_start,run_limit_count,post_step');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Run limit: 1/3.');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Post-step evidence: return terminal run output for Taskplane review.');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Workspace write boundary: workspaceWriteAllowed=false; proposals only.');
    expect(result).toMatchObject({
      status: 'started',
      run: {
        id: 'run_scheduled_1',
        taskId: 'task_auto',
      },
      plan: {
        status: 'ready',
        runtimeStartAllowed: true,
        schedulerTriggerServiceConnected: true,
        runLimit: {
          maxRunsPerDay: 3,
          runsStartedToday: 1,
        },
      },
    });
    expect(result.summary).toContain('trigger=started');
    expect(result.summary).toContain('runId=run_scheduled_1');
    expect(result.summary).toContain('terminalRunEvidence=present');
    expect(result.summary).toContain('triggerRunEvidenceStatus=ready_for_terminal_review');
    expect(result.summary).toContain('timelineEvidence=recorded');
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith({
      taskId: 'task_auto',
      type: 'panel.scheduled_event_agent_triggered',
      payload: expect.objectContaining({
        runId: 'run_scheduled_1',
        runFailureReason: null,
        runOutputSource: 'system',
        runStatus: 'completed',
        terminalRunEvidenceStatus: 'present',
        triggerRunEvidenceStatus: 'ready_for_terminal_review',
        targetTaskId: 'task_auto',
        standingApprovalPolicyId: 'standing_approval:task_auto:coding:local_sandbox',
        runtimeStartMissingRequirements: [],
        runtimeStartSatisfiedRequirements: expect.arrayContaining([
          'trigger_plan_ready',
          'scheduler_trigger_service',
          'run_limit_count',
        ]),
        schedulerTriggerServiceConnected: true,
        runtimeStartAllowed: true,
        triggeredAt: '2026-05-26T11:00:00.000Z',
        workspaceWriteAllowed: false,
        runLimit: {
          maxRunsPerDay: 3,
          runsStartedToday: 1,
        },
        triggerRunEvidenceRequired: expect.arrayContaining([
          'context_readiness',
          'target_task_identity',
          'task_memory_coverage',
          'task_memory_guidance',
          'subtask_start',
          'run_limit_count',
          'post_step',
        ]),
      }),
    });
    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(scheduledJobs).toHaveLength(0);
  });

  it('keeps terminal trigger evidence pending when a completed scheduled/event run has no reviewable output', async () => {
    const now = new Date('2026-05-26T11:15:00.000Z');
    const task = buildAutomationTaskDetail({
      timeline: [buildStandingApprovalTimeline()],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 1 }),
      listIncompleteOlderThan: vi.fn(),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const run = {
      ...buildRunRecord(),
      failureReason: null,
      id: 'run_scheduled_empty_terminal',
      output: null,
      outputSource: null,
      status: 'completed',
      taskId: 'task_auto',
      type: 'agent',
    } satisfies RunRecord;
    const triggerPort = {
      triggerCodeAgentRun: vi.fn().mockResolvedValue(run),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn(),
      } as never,
      {
        create: vi.fn(),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
    );

    const result = await service.triggerScheduledEventAgentRun(task, now);

    expect(result).toMatchObject({
      status: 'started',
      run: {
        id: 'run_scheduled_empty_terminal',
        taskId: 'task_auto',
      },
      terminalRunEvidenceStatus: 'pending',
      triggerRunEvidenceStatus: 'pending_terminal_run_evidence',
    });
    expect(result.summary).toContain('terminalRunEvidence=pending');
    expect(result.summary).toContain('triggerRunEvidenceStatus=pending_terminal_run_evidence');
    expect(result.summary).toContain('terminalEvidenceDecisionProposal=proposed');
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_auto',
      type: 'panel.scheduled_event_agent_triggered',
      payload: expect.objectContaining({
        runId: 'run_scheduled_empty_terminal',
        runStatus: 'completed',
        terminalRunEvidenceStatus: 'pending',
        triggerRunEvidenceStatus: 'pending_terminal_run_evidence',
      }),
    }));
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_auto',
      type: 'panel.scheduler_decision_proposed',
      payload: expect.objectContaining({
        authorization: 'standing_approval',
        evidenceRunId: 'run_scheduled_empty_terminal',
        proposedOutcome: '人工复核 Run 并补录终态证据',
        standingApprovalActive: true,
        standingApprovalPolicyId: 'standing_approval:task_auto:coding:local_sandbox',
        standingApprovalScopeTaskId: 'task_auto',
        targetTaskId: 'task_auto',
        title: '确认定时/事件 Agent 终态证据缺失后的下一步',
      }),
    }));
  });

  it('does not duplicate same-day terminal-evidence Decision proposals', async () => {
    const now = new Date('2026-05-26T11:20:00.000Z');
    const task = buildAutomationTaskDetail({
      timeline: [
        buildStandingApprovalTimeline(),
        {
          id: 'timeline_terminal_evidence_decision',
          taskId: 'task_auto',
          type: 'panel.scheduler_decision_proposed',
          payload: JSON.stringify({
            title: '确认定时/事件 Agent 终态证据缺失后的下一步',
          }),
          createdAt: '2026-05-26T10:45:00.000Z',
        },
      ],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 1 }),
      listIncompleteOlderThan: vi.fn(),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const run = {
      ...buildRunRecord(),
      failureReason: null,
      id: 'run_scheduled_empty_terminal_repeat',
      output: null,
      outputSource: null,
      status: 'completed',
      taskId: 'task_auto',
      type: 'agent',
    } satisfies RunRecord;
    const triggerPort = {
      triggerCodeAgentRun: vi.fn().mockResolvedValue(run),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn(),
      } as never,
      {
        create: vi.fn(),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
    );

    const result = await service.triggerScheduledEventAgentRun(task, now);

    expect(result.summary).toContain('terminalEvidenceDecisionProposal=skipped_existing');
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledTimes(1);
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'panel.scheduled_event_agent_triggered',
    }));
  });

  it('returns recovery evidence instead of throwing when an operator-started scheduled/event run has the wrong target task', async () => {
    const now = new Date('2026-05-26T11:30:00.000Z');
    const task = buildAutomationTaskDetail({
      timeline: [buildStandingApprovalTimeline()],
    });
    const runRepository = {
      countCreatedSinceByTask: vi.fn().mockResolvedValue({ task_auto: 1 }),
      listIncompleteOlderThan: vi.fn(),
      updateResult: vi.fn(),
    };
    const aiConfigService = buildReadyAutomationAiConfigService();
    const run = {
      ...buildRunRecord(),
      id: 'run_scheduled_wrong_target_1',
      output: null,
      outputSource: null,
      status: 'running',
      taskId: 'task_other',
      type: 'agent',
    } satisfies RunRecord;
    const triggerPort = {
      triggerCodeAgentRun: vi.fn().mockResolvedValue(run),
    };
    const timelinePort = {
      recordTimelineEvent: vi.fn().mockResolvedValue(undefined),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn(),
      } as never,
      {
        create: vi.fn(),
      } as never,
      runRepository as never,
      aiConfigService as never,
      {
        execute: vi.fn(),
      } as never,
      {
        select: vi.fn(),
      } as never,
      triggerPort,
      timelinePort,
    );

    const result = await service.triggerScheduledEventAgentRun(task, now);

    expect(result).toMatchObject({
      status: 'blocked',
      run: {
        id: 'run_scheduled_wrong_target_1',
        taskId: 'task_other',
      },
      terminalRunEvidenceStatus: 'pending',
      triggerRunEvidenceStatus: 'pending_terminal_run_evidence',
    });
    expect(result.summary).toContain('trigger=blocked');
    expect(result.summary).toContain('runId=run_scheduled_wrong_target_1');
    expect(result.summary).toContain('Run target task mismatch: expected task_auto but received task_other.');
    expect(result.summary).toContain('runIdentityDecisionProposal=proposed');
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledTimes(1);
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_auto',
      type: 'panel.scheduler_decision_proposed',
      payload: expect.objectContaining({
        authorization: 'standing_approval',
        evidenceRunId: 'run_scheduled_wrong_target_1',
        proposedOutcome: '暂停自动触发并人工复核运行归属',
        targetTaskId: 'task_auto',
        title: '确认定时/事件 Agent Run 目标任务不一致后的下一步',
      }),
    }));
  });

  it('falls back to plain brief generation when brief template selection fails', async () => {
    const homeData = {
      ...buildHomeData(),
      processTemplateCandidates: [buildBriefTemplateCandidate()],
    };
    const briefSnapshotRepository = {
      create: vi.fn().mockResolvedValue(undefined),
    };
    const briefExecutor = {
      execute: vi.fn().mockResolvedValue('AI brief without templates'),
    };
    const { SchedulerService } = await import('./scheduler-service.js');
    const service = new SchedulerService(
      {
        read: vi.fn().mockReturnValue({
          featureFlags: {
            enableScheduler: true,
          },
        }),
      } as never,
      {
        getHomeData: vi.fn().mockResolvedValue(homeData),
      } as never,
      briefSnapshotRepository as never,
      {
        listIncompleteOlderThan: vi.fn().mockResolvedValue([]),
        updateResult: vi.fn(),
      } as never,
      {
        resolveRuntimeConfig: vi.fn().mockResolvedValue({
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-latest',
          apiKey: 'secret',
          featureFlags: { enableScheduler: true },
        }),
      } as never,
      briefExecutor as never,
      {
        select: vi.fn().mockRejectedValue(new Error('Selector exploded')),
      } as never,
    );

    await service.start();

    expect(briefExecutor.execute).toHaveBeenCalledWith(
      homeData,
      'startup',
      {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
        featureFlags: { enableScheduler: true },
      },
      {
        selectedTemplates: [],
      },
    );
    expect(briefSnapshotRepository.create).toHaveBeenCalledWith(
      'startup',
      'AI brief without templates',
      'ai',
      null,
    );
  });
});
