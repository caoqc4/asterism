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
      lastScheduledEventAgentSweepAt: null,
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

function buildStandingApprovalTimeline(partial: { maxRunsPerDay?: number } = {}) {
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
        expiresAt: '2026-05-27T10:00:00.000Z',
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
      lastScheduledEventAgentSweepAt: null,
    });
    expect(scheduledJobs).toHaveLength(0);
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
    expect(scheduledJobs).toHaveLength(2);

    service.stop();

    for (const job of scheduledJobs) {
      expect(job.stop).toHaveBeenCalledTimes(1);
      expect(job.destroy).toHaveBeenCalledTimes(1);
    }
    expect(service.getStatus().running).toBe(false);
  });

  it('wires a background scheduled/event Agent sweep only when trigger and task-source ports are connected', async () => {
    const task = buildAutomationTaskDetail({
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

    expect(scheduledJobs.map((job) => job.expression)).toEqual([
      '0 * * * *',
      '*/5 * * * *',
      '*/15 * * * *',
    ]);

    const sweepResult = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T11:00:00.000Z'),
    );

    expect(sweepResult).toMatchObject({
      status: 'completed',
      checkedTaskCount: 1,
      startedRunCount: 1,
      blockedTaskCount: 0,
    });
    expect(taskSourcePort.listScheduledEventAgentTriggerCandidates).toHaveBeenCalledTimes(1);
    expect(runRepository.countCreatedSinceByTask).toHaveBeenCalledWith(
      ['task_auto'],
      '2026-05-26T00:00:00.000Z',
    );
    expect(triggerPort.triggerCodeAgentRun).toHaveBeenCalledWith({
      taskId: 'task_auto',
      patchIntent: expect.stringContaining('Scheduled/event Agent trigger under confirmed Taskplane Standing Approval.'),
      requestedChecks: [],
      operatorConfirmed: true,
      useModelProducer: true,
    });
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith({
      taskId: 'task_auto',
      type: 'panel.scheduled_event_agent_triggered',
      payload: expect.objectContaining({
        runId: 'run_scheduled_cron_1',
        runFailureReason: null,
        runOutputSource: null,
        runStatus: 'running',
        runtimeStartAllowed: true,
        triggeredAt: '2026-05-26T11:00:00.000Z',
        runLimit: {
          maxRunsPerDay: 3,
          runsStartedToday: 0,
        },
      }),
    });
    expect(service.getStatus().lastScheduledEventAgentSweepAt).not.toBeNull();
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
    );

    const sweepResult = await service.runScheduledEventAgentTriggerSweep(
      'cron',
      new Date('2026-05-26T11:00:00.000Z'),
    );

    expect(sweepResult).toMatchObject({
      status: 'completed',
      checkedTaskCount: 2,
      startedRunCount: 1,
      blockedTaskCount: 1,
    });
    expect(triggerPort.triggerCodeAgentRun).toHaveBeenCalledTimes(1);
    expect(sweepResult.summaries.join(' ')).toContain('daily run limit reached: 2/2');
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
    expect(result.plan).toMatchObject({
      status: 'ready',
      triggerPlanReady: true,
      runtimeStartAllowed: false,
      schedulerTriggerServiceConnected: false,
    });
    expect(result.summary).toContain('Scheduled event Agent trigger service is not connected');
    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
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
      requestedChecks: [],
      operatorConfirmed: true,
      useModelProducer: true,
    });
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Next step: Prepare the weekly update.');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Standing Approval policy: standing_approval:task_auto:coding:local_sandbox.');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Runtime start requirements: trigger_plan_ready,scheduler_trigger_service,run_limit_count.');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('context_readiness,target_task_identity,task_memory_coverage,task_memory_guidance,subtask_start,run_limit_count,post_step');
    expect(triggerPort.triggerCodeAgentRun.mock.calls[0]?.[0].patchIntent).toContain('Run limit: 1/3.');
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
    expect(result.summary).toContain('timelineEvidence=recorded');
    expect(timelinePort.recordTimelineEvent).toHaveBeenCalledWith({
      taskId: 'task_auto',
      type: 'panel.scheduled_event_agent_triggered',
      payload: expect.objectContaining({
        runId: 'run_scheduled_1',
        runFailureReason: null,
        runOutputSource: 'system',
        runStatus: 'completed',
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
