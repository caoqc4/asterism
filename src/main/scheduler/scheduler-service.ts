import cron, { type ScheduledTask } from 'node-cron';

import type { SchedulerStatus } from '../../shared/types/scheduler.js';
import {
  planScheduledEventAgentTrigger,
  type AgentScheduledEventTriggerPlan,
} from '../../shared/agent-orchestration.js';
import type { TaskDetail } from '../../shared/types/task.js';
import type { CreateCodeAgentRunInput, RunRecord } from '../../shared/types/run.js';
import { AppConfigService } from '../config/app-config-service.js';
import { BriefSnapshotRepository } from '../db/repositories/brief-snapshot-repository.js';
import { BriefProcessTemplateSelector } from '../domain/brief/process-template-selector.js';
import { RunRepository } from '../db/repositories/run-repository.js';
import { HomeBriefService } from '../domain/brief/home-brief-service.js';
import { BriefExecutor, buildFallbackBrief } from '../executors/brief-executor.js';
import { AiConfigService } from '../keychain/ai-config-service.js';

export type ScheduledEventAgentTriggerResult = {
  status: 'started' | 'blocked';
  plan: AgentScheduledEventTriggerPlan;
  run: RunRecord | null;
  summary: string;
};

export type ScheduledEventAgentSweepResult = {
  status: 'completed' | 'skipped';
  checkedTaskCount: number;
  startedRunCount: number;
  blockedTaskCount: number;
  summaries: string[];
  summary: string;
};

export type ScheduledEventAgentTaskSourcePort = {
  listScheduledEventAgentTriggerCandidates: () => Promise<ScheduledEventAgentTaskInput[]>;
};

export type ScheduledEventAgentRunPort = {
  triggerCodeAgentRun: (input: CreateCodeAgentRunInput) => Promise<RunRecord>;
};

export type ScheduledEventAgentTimelinePort = {
  recordTimelineEvent: (input: {
    taskId: string;
    type: 'panel.scheduled_event_agent_triggered';
    payload?: Record<string, unknown>;
  }) => Promise<void>;
};

export type ScheduledEventAgentTaskInput = Pick<
  TaskDetail,
  | 'activeBlocker'
  | 'activeDependency'
  | 'activeWaitingItem'
  | 'completionCriteria'
  | 'id'
  | 'nextStep'
  | 'processTemplates'
  | 'riskLevel'
  | 'sourceContexts'
  | 'state'
  | 'summary'
  | 'taskFacets'
  | 'taskType'
  | 'timeline'
  | 'waitingReason'
>;

function olderThanMinutes(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function startOfUtcDay(date: Date): string {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  )).toISOString();
}

function buildScheduledEventCodeAgentRunInput(
  task: ScheduledEventAgentTaskInput,
  plan: AgentScheduledEventTriggerPlan,
): CreateCodeAgentRunInput {
  const nextStep = task.nextStep?.trim()
    || task.summary?.trim()
    || 'Advance the scheduled or routine task using the smallest reviewable step.';

  return {
    taskId: task.id,
    patchIntent: [
      'Scheduled/event Agent trigger under confirmed Taskplane Standing Approval.',
      `Next step: ${nextStep}`,
      `Trigger evidence: ${plan.triggerRunEvidenceRequired.join(',')}.`,
      `Run limit: ${plan.runLimit.runsStartedToday ?? 'unknown'}/${plan.runLimit.maxRunsPerDay ?? 'unknown'}.`,
      'Do not apply workspace changes directly; produce reviewable patch artifacts or proposals through Taskplane gates.',
    ].join('\n'),
    requestedChecks: [],
    operatorConfirmed: true,
    useModelProducer: true,
  };
}

export class SchedulerService {
  private jobs: ScheduledTask[] = [];
  private started = false;
  private lastBriefAt: string | null = null;
  private lastRunSweepAt: string | null = null;
  private lastScheduledEventAgentSweepAt: string | null = null;
  private scheduledEventAgentSweepInFlight = false;

  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly homeBriefService: HomeBriefService,
    private readonly briefSnapshotRepository: BriefSnapshotRepository,
    private readonly runRepository: RunRepository,
    private readonly aiConfigService: AiConfigService,
    private readonly briefExecutor: BriefExecutor,
    private readonly briefProcessTemplateSelector: BriefProcessTemplateSelector = new BriefProcessTemplateSelector(),
    private readonly scheduledEventAgentRunPort: ScheduledEventAgentRunPort | null = null,
    private readonly scheduledEventAgentTimelinePort: ScheduledEventAgentTimelinePort | null = null,
    private readonly scheduledEventAgentTaskSourcePort: ScheduledEventAgentTaskSourcePort | null = null,
  ) {}

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    const config = this.appConfigService.read();

    if (!config.featureFlags.enableScheduler) {
      this.started = false;
      return;
    }

    this.started = true;

    await this.runStartupRecovery();
    await this.generateScheduledBrief('startup');

    this.jobs.push(
      cron.schedule('0 * * * *', () => {
        void this.generateScheduledBrief('hourly');
      }),
    );

    this.jobs.push(
      cron.schedule('*/5 * * * *', () => {
        void this.reconcileStaleRuns();
      }),
    );

    if (this.scheduledEventAgentRunPort && this.scheduledEventAgentTaskSourcePort) {
      this.jobs.push(
        cron.schedule('*/15 * * * *', () => {
          void this.runScheduledEventAgentTriggerSweep('cron');
        }),
      );
    }
  }

  stop(): void {
    for (const job of this.jobs) {
      job.stop();
      job.destroy();
    }

    this.jobs = [];
    this.started = false;
  }

  getStatus(): SchedulerStatus {
    const config = this.appConfigService.read();

    return {
      enabled: config.featureFlags.enableScheduler,
      running: this.started,
      lastBriefAt: this.lastBriefAt,
      lastRunSweepAt: this.lastRunSweepAt,
      lastScheduledEventAgentSweepAt: this.lastScheduledEventAgentSweepAt,
    };
  }

  async runScheduledEventAgentTriggerSweep(
    kind: 'cron' | 'manual' = 'manual',
    now: Date = new Date(),
  ): Promise<ScheduledEventAgentSweepResult> {
    if (!this.scheduledEventAgentRunPort || !this.scheduledEventAgentTaskSourcePort) {
      return {
        status: 'skipped',
        checkedTaskCount: 0,
        startedRunCount: 0,
        blockedTaskCount: 0,
        summaries: [],
        summary: `scheduledEventAgentSweep=${kind} / status=skipped / reason=ports_not_connected`,
      };
    }

    if (this.scheduledEventAgentSweepInFlight) {
      return {
        status: 'skipped',
        checkedTaskCount: 0,
        startedRunCount: 0,
        blockedTaskCount: 0,
        summaries: [],
        summary: `scheduledEventAgentSweep=${kind} / status=skipped / reason=in_flight`,
      };
    }

    this.scheduledEventAgentSweepInFlight = true;
    try {
      const tasks = await this.scheduledEventAgentTaskSourcePort.listScheduledEventAgentTriggerCandidates();
      const runCounts = await this.countRunsStartedToday(tasks.map((task) => task.id), now);
      const results: ScheduledEventAgentTriggerResult[] = [];

      for (const task of tasks) {
        const result = await this.triggerScheduledEventAgentRun(task, now, runCounts);
        results.push(result);
        if (result.status === 'started') {
          runCounts[task.id] = (runCounts[task.id] ?? 0) + 1;
        }
      }

      const startedRunCount = results.filter((result) => result.status === 'started').length;
      const blockedTaskCount = results.length - startedRunCount;
      this.lastScheduledEventAgentSweepAt = new Date().toISOString();

      return {
        status: 'completed',
        checkedTaskCount: tasks.length,
        startedRunCount,
        blockedTaskCount,
        summaries: results.map((result) => result.summary),
        summary: [
          `scheduledEventAgentSweep=${kind}`,
          'status=completed',
          `checked=${tasks.length}`,
          `started=${startedRunCount}`,
          `blocked=${blockedTaskCount}`,
        ].join(' / '),
      };
    } finally {
      this.scheduledEventAgentSweepInFlight = false;
    }
  }

  async diagnoseScheduledEventAgentTriggers(
    tasks: ScheduledEventAgentTaskInput[],
    now: Date = new Date(),
    runCountsStartedTodayByTaskId: Record<string, number> | null = null,
  ): Promise<AgentScheduledEventTriggerPlan[]> {
    const getStatus = (this.aiConfigService as { getStatus?: AiConfigService['getStatus'] }).getStatus;
    const aiStatus = typeof getStatus === 'function' ? await getStatus.call(this.aiConfigService).catch(() => null) : null;
    const runCounts = runCountsStartedTodayByTaskId
      ?? await this.countRunsStartedToday(tasks.map((task) => task.id), now);

    return tasks.map((task) => planScheduledEventAgentTrigger({
      aiStatus,
      now,
      runLimit: runCounts[task.id] === undefined
        ? null
        : { runsStartedToday: runCounts[task.id] },
      task,
    }));
  }

  async triggerScheduledEventAgentRun(
    task: ScheduledEventAgentTaskInput,
    now: Date = new Date(),
    runCountsStartedTodayByTaskId: Record<string, number> | null = null,
  ): Promise<ScheduledEventAgentTriggerResult> {
    if (!this.scheduledEventAgentRunPort) {
      const [plan] = await this.diagnoseScheduledEventAgentTriggers(
        [task],
        now,
        runCountsStartedTodayByTaskId,
      );
      return {
        status: 'blocked',
        plan,
        run: null,
        summary: `${plan.summary} / trigger=blocked / reason=Scheduled event Agent trigger service is not connected.`,
      };
    }

    const getStatus = (this.aiConfigService as { getStatus?: AiConfigService['getStatus'] }).getStatus;
    const aiStatus = typeof getStatus === 'function' ? await getStatus.call(this.aiConfigService).catch(() => null) : null;
    const runCounts = runCountsStartedTodayByTaskId
      ?? await this.countRunsStartedToday([task.id], now);
    const plan = planScheduledEventAgentTrigger({
      aiStatus,
      now,
      runLimit: runCounts[task.id] === undefined
        ? null
        : { runsStartedToday: runCounts[task.id] },
      schedulerTriggerServiceConnected: true,
      task,
    });

    if (!plan.runtimeStartAllowed) {
      return {
        status: 'blocked',
        plan,
        run: null,
        summary: `${plan.summary} / trigger=blocked`,
      };
    }

    const run = await this.scheduledEventAgentRunPort.triggerCodeAgentRun(
      buildScheduledEventCodeAgentRunInput(task, plan),
    );
    const timelineEvidence = await this.recordScheduledEventAgentTriggered(task, plan, run);

    return {
      status: 'started',
      plan,
      run,
      summary: `${plan.summary} / trigger=started / runId=${run.id} / timelineEvidence=${timelineEvidence}`,
    };
  }

  private async recordScheduledEventAgentTriggered(
    task: ScheduledEventAgentTaskInput,
    plan: AgentScheduledEventTriggerPlan,
    run: RunRecord,
  ): Promise<'recorded' | 'not_connected'> {
    if (!this.scheduledEventAgentTimelinePort) return 'not_connected';

    await this.scheduledEventAgentTimelinePort.recordTimelineEvent({
      taskId: task.id,
      type: 'panel.scheduled_event_agent_triggered',
      payload: {
        runId: run.id,
        targetTaskId: task.id,
        planSummary: plan.summary,
        standingApprovalPolicyId: plan.policy?.id ?? null,
        triggerRunEvidenceRequired: plan.triggerRunEvidenceRequired,
        runLimit: plan.runLimit,
        schedulerTriggerServiceConnected: plan.schedulerTriggerServiceConnected,
        runtimeStartAllowed: plan.runtimeStartAllowed,
        triggeredAt: new Date().toISOString(),
      },
    });

    return 'recorded';
  }

  private async countRunsStartedToday(taskIds: string[], now: Date): Promise<Record<string, number>> {
    const countCreatedSinceByTask = (this.runRepository as {
      countCreatedSinceByTask?: (taskIds: string[], sinceIso: string) => Promise<Record<string, number>>;
    }).countCreatedSinceByTask;
    if (typeof countCreatedSinceByTask !== 'function') return {};
    return countCreatedSinceByTask.call(this.runRepository, taskIds, startOfUtcDay(now)).catch(() => ({}));
  }

  private async runStartupRecovery(): Promise<void> {
    await this.reconcileStaleRuns();
  }

  private async generateScheduledBrief(kind: string): Promise<void> {
    const homeData = await this.homeBriefService.getHomeData();
    let selectedTemplates = [] as NonNullable<typeof homeData.processTemplateCandidates>;
    let payload = buildFallbackBrief(homeData, kind, selectedTemplates);
    let source: 'ai' | 'fallback' = 'fallback';
    let fallbackReason: string | null = 'AI brief executor not attempted.';

    try {
      const getStatus = (this.aiConfigService as { getStatus?: AiConfigService['getStatus'] }).getStatus;
      const status = typeof getStatus === 'function' ? await getStatus.call(this.aiConfigService) : null;
      if (status?.runtimeMode && status.runtimeMode !== 'api') {
        const selectedRuntimeLabel = status.runtimeMode === 'codex' ? 'Codex CLI' : 'Claude Code';
        throw new Error(`当前选择的是 ${selectedRuntimeLabel}，Scheduled Brief API adapter 不会切换到 Agent API Runtime。`);
      }
      const runtimeConfig = await this.aiConfigService.resolveRuntimeConfig();
      if ((homeData.processTemplateCandidates?.length ?? 0) > 0) {
        try {
          const selection = await this.briefProcessTemplateSelector.select(
            homeData,
            kind,
            runtimeConfig,
          );

          if (selection.shouldUse) {
            selectedTemplates = selection.selectedTemplates;
          }
        } catch {
          selectedTemplates = [];
        }
      }

      payload = await this.briefExecutor.execute(homeData, kind, runtimeConfig, {
        selectedTemplates,
      });
      source = 'ai';
      fallbackReason = null;
    } catch (error) {
      payload = buildFallbackBrief(homeData, kind, selectedTemplates);
      source = 'fallback';
      fallbackReason = error instanceof Error ? error.message : 'Unknown brief executor error';
    }

    await this.briefSnapshotRepository.create(kind, payload, source, fallbackReason);

    this.lastBriefAt = new Date().toISOString();
  }

  private async reconcileStaleRuns(): Promise<void> {
    const staleRuns = await this.runRepository.listIncompleteOlderThan(olderThanMinutes(5));

    for (const run of staleRuns) {
      await this.runRepository.updateResult(
        run.id,
        'failed',
        run.output ?? 'Run 超过恢复窗口，已由本地 scheduler 标记为 failed。',
        'system',
        'Run exceeded the scheduler recovery window.',
      );
    }

    this.lastRunSweepAt = new Date().toISOString();
  }
}
