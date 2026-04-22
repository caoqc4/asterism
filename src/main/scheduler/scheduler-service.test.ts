import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HomeBriefData } from '../../shared/types/brief.js';
import type { BriefProcessTemplateCandidate } from '../../shared/types/brief.js';
import type { RunRecord } from '../../shared/types/run.js';

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
    highRiskTaskCount: 1,
    missingNextStepTaskCount: 1,
    recentTasks: [],
    waitingTasks: [],
    highRiskTasks: [],
    missingNextStepTasks: [],
    pendingDecisions: [],
    recommendedActions: [],
    recentArtifacts: [],
    recentActivity: [],
    recentBriefSnapshots: [],
    processTemplateCandidates: [],
    schedulerStatus: {
      enabled: true,
      running: false,
      lastBriefAt: null,
      lastRunSweepAt: null,
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
