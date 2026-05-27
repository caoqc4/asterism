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
  terminalRunEvidenceStatus: 'not_started' | 'pending' | 'present';
  triggerRunEvidenceStatus: 'not_started' | 'pending_terminal_run_evidence' | 'ready_for_terminal_review';
  summary: string;
};

export type ScheduledEventAgentSweepResult = {
  status: 'completed' | 'skipped';
  skipReason: 'none' | 'ports_not_connected' | 'in_flight';
  checkedTaskCount: number;
  startedRunCount: number;
  blockedTaskCount: number;
  startedRunIds: string[];
  blockedReasons: string[];
  runtimeStartMissingRequirements: Array<AgentScheduledEventTriggerPlan['runtimeStartMissingRequirements'][number]>;
  terminalRunEvidenceMissingRunIds: string[];
  triggerRunEvidenceRequired: AgentScheduledEventTriggerPlan['triggerRunEvidenceRequired'];
  triggerRunEvidenceStatus: 'not_started' | 'pending_terminal_run_evidence' | 'ready_for_terminal_review';
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
  triggerKind: 'cron' | 'manual',
): CreateCodeAgentRunInput {
  const nextStep = task.nextStep?.trim()
    || task.summary?.trim()
    || 'Advance the scheduled or routine task using the smallest reviewable step.';

  return {
    taskId: task.id,
    patchIntent: [
      'Scheduled/event Agent trigger under confirmed Taskplane Standing Approval.',
      `Target task: ${task.id}.`,
      `Trigger kind: ${triggerKind}.`,
      `Next step: ${nextStep}`,
      `Task memory guidance: ${formatScheduledEventTaskMemoryGuidance(task)}`,
      `Standing Approval policy: ${plan.policy?.id ?? 'unknown'}.`,
      `Runtime start requirements: ${plan.runtimeStartSatisfiedRequirements.join(',')}.`,
      `Trigger evidence: ${plan.triggerRunEvidenceRequired.join(',')}.`,
      `Run limit: ${plan.runLimit.runsStartedToday ?? 'unknown'}/${plan.runLimit.maxRunsPerDay ?? 'unknown'}.`,
      'Post-step evidence: return terminal run output for Taskplane review.',
      'Do not apply workspace changes directly; produce reviewable patch artifacts or proposals through Taskplane gates.',
    ].join('\n'),
    requestedChecks: [],
    operatorConfirmed: true,
    useModelProducer: true,
  };
}

function formatScheduledEventTaskMemoryGuidance(task: ScheduledEventAgentTaskInput): string {
  const activeProcess = task.processTemplates.find((template) => template.status === 'active');
  const openCriteria = task.completionCriteria.filter((criterion) => criterion.status === 'open');
  const firstCriterion = openCriteria[0]?.text.trim();
  const firstSource = task.sourceContexts.find((source) => source.status === 'active')?.title.trim();
  return [
    `process=${activeProcess?.title?.trim() || 'none'}`,
    `openCriteria=${openCriteria.length}`,
    `firstCriterion=${firstCriterion || 'none'}`,
    `sourceContexts=${task.sourceContexts.length}`,
    `firstSource=${firstSource || 'none'}`,
  ].join('; ');
}

function formatMissingScheduledEventAgentSweepPorts(params: {
  runPortConnected: boolean;
  taskSourcePortConnected: boolean;
  timelinePortConnected: boolean;
}): string {
  const missingPorts = [];
  if (!params.runPortConnected) missingPorts.push('run_port');
  if (!params.timelinePortConnected) missingPorts.push('timeline_port');
  if (!params.taskSourcePortConnected) missingPorts.push('task_source_port');
  return missingPorts.join(',');
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

    if (this.scheduledEventAgentRunPort && this.scheduledEventAgentTimelinePort && this.scheduledEventAgentTaskSourcePort) {
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
    const runPort = this.scheduledEventAgentRunPort;
    const taskSourcePort = this.scheduledEventAgentTaskSourcePort;
    const timelinePort = this.scheduledEventAgentTimelinePort;
    const missingPorts = formatMissingScheduledEventAgentSweepPorts({
      runPortConnected: Boolean(runPort),
      taskSourcePortConnected: Boolean(taskSourcePort),
      timelinePortConnected: Boolean(timelinePort),
    });
    if (!runPort || !timelinePort || !taskSourcePort) {
      return {
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
        summaries: [],
        summary: `scheduledEventAgentSweep=${kind} / status=skipped / reason=ports_not_connected / missingPorts=${missingPorts} / triggerRunEvidenceStatus=not_started`,
      };
    }

    if (this.scheduledEventAgentSweepInFlight) {
      return {
        status: 'skipped',
        skipReason: 'in_flight',
        checkedTaskCount: 0,
        startedRunCount: 0,
        blockedTaskCount: 0,
        startedRunIds: [],
        blockedReasons: ['in_flight'],
        runtimeStartMissingRequirements: [],
        terminalRunEvidenceMissingRunIds: [],
        triggerRunEvidenceRequired: [],
        triggerRunEvidenceStatus: 'not_started',
        summaries: [],
        summary: `scheduledEventAgentSweep=${kind} / status=skipped / reason=in_flight / triggerRunEvidenceStatus=not_started`,
      };
    }

    this.scheduledEventAgentSweepInFlight = true;
    try {
      const tasks = await taskSourcePort.listScheduledEventAgentTriggerCandidates();
      const runCounts = await this.countRunsStartedToday(tasks.map((task) => task.id), now);
      const results: ScheduledEventAgentTriggerResult[] = [];

      for (const task of tasks) {
        const result = await this.triggerScheduledEventAgentRun(task, now, runCounts, kind);
        results.push(result);
        if (result.status === 'started') {
          runCounts[task.id] = (runCounts[task.id] ?? 0) + 1;
        }
      }

      const startedRunCount = results.filter((result) => result.status === 'started').length;
      const blockedTaskCount = results.length - startedRunCount;
      const startedRunIds = results.flatMap((result) => result.status === 'started' && result.run ? [result.run.id] : []);
      const blockedReasons = results.flatMap((result) => result.status === 'blocked' ? result.plan.blockedReasons : []);
      const runtimeStartMissingRequirements = Array.from(new Set(
        results.flatMap((result) => result.plan.runtimeStartMissingRequirements),
      ));
      const terminalRunEvidenceMissingRunIds = results.flatMap((result) =>
        result.status === 'started' && result.run && !isTerminalScheduledEventRunStatus(result.run.status)
          ? [result.run.id]
          : []);
      const triggerRunEvidenceRequired = Array.from(new Set(
        results.flatMap((result) => result.plan.triggerRunEvidenceRequired),
      ));
      const triggerRunEvidenceStatus = startedRunCount === 0
        ? 'not_started'
        : terminalRunEvidenceMissingRunIds.length > 0
          ? 'pending_terminal_run_evidence'
          : 'ready_for_terminal_review';
      this.lastScheduledEventAgentSweepAt = new Date().toISOString();

      return {
        status: 'completed',
        skipReason: 'none',
        checkedTaskCount: tasks.length,
        startedRunCount,
        blockedTaskCount,
        startedRunIds,
        blockedReasons,
        runtimeStartMissingRequirements,
        terminalRunEvidenceMissingRunIds,
        triggerRunEvidenceRequired,
        triggerRunEvidenceStatus,
        summaries: results.map((result) => result.summary),
        summary: [
          `scheduledEventAgentSweep=${kind}`,
          'status=completed',
          `checked=${tasks.length}`,
          `started=${startedRunCount}`,
          `blocked=${blockedTaskCount}`,
          `startedRunIds=${startedRunIds.length ? startedRunIds.join(',') : 'none'}`,
          `blockedReasons=${blockedReasons.length ? blockedReasons.join('; ') : 'none'}`,
          `runtimeStartMissingRequirements=${runtimeStartMissingRequirements.length ? runtimeStartMissingRequirements.join(',') : 'none'}`,
          `terminalRunEvidenceMissingRunIds=${terminalRunEvidenceMissingRunIds.length ? terminalRunEvidenceMissingRunIds.join(',') : 'none'}`,
          `triggerRunEvidenceRequired=${triggerRunEvidenceRequired.length ? triggerRunEvidenceRequired.join(',') : 'none'}`,
          `triggerRunEvidenceStatus=${triggerRunEvidenceStatus}`,
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
    triggerKind: 'cron' | 'manual' = 'manual',
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
        terminalRunEvidenceStatus: 'not_started',
        triggerRunEvidenceStatus: 'not_started',
        summary: `${plan.summary} / trigger=blocked / triggerRunEvidenceStatus=not_started / reason=Scheduled event Agent trigger service is not connected.`,
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
        terminalRunEvidenceStatus: 'not_started',
        triggerRunEvidenceStatus: 'not_started',
        summary: `${plan.summary} / trigger=blocked / triggerRunEvidenceStatus=not_started`,
      };
    }

    const run = await this.scheduledEventAgentRunPort.triggerCodeAgentRun(
      buildScheduledEventCodeAgentRunInput(task, plan, triggerKind),
    );
    const timelineEvidence = await this.recordScheduledEventAgentTriggered(task, plan, run, now, triggerKind);
    const terminalRunEvidenceStatus = isTerminalScheduledEventRunStatus(run.status) ? 'present' : 'pending';
    const triggerRunEvidenceStatus = terminalRunEvidenceStatus === 'present'
      ? 'ready_for_terminal_review'
      : 'pending_terminal_run_evidence';

    return {
      status: 'started',
      plan,
      run,
      terminalRunEvidenceStatus,
      triggerRunEvidenceStatus,
      summary: `${plan.summary} / trigger=started / runId=${run.id} / terminalRunEvidence=${terminalRunEvidenceStatus} / triggerRunEvidenceStatus=${triggerRunEvidenceStatus} / timelineEvidence=${timelineEvidence}`,
    };
  }

  private async recordScheduledEventAgentTriggered(
    task: ScheduledEventAgentTaskInput,
    plan: AgentScheduledEventTriggerPlan,
    run: RunRecord,
    now: Date,
    triggerKind: 'cron' | 'manual',
  ): Promise<'recorded' | 'not_connected'> {
    if (!this.scheduledEventAgentTimelinePort) return 'not_connected';

    await this.scheduledEventAgentTimelinePort.recordTimelineEvent({
      taskId: task.id,
      type: 'panel.scheduled_event_agent_triggered',
      payload: {
        runId: run.id,
        runFailureReason: run.failureReason,
        runOutputSource: run.outputSource,
        runStatus: run.status,
        terminalRunEvidenceStatus: isTerminalScheduledEventRunStatus(run.status) ? 'present' : 'pending',
        triggerRunEvidenceStatus: isTerminalScheduledEventRunStatus(run.status)
          ? 'ready_for_terminal_review'
          : 'pending_terminal_run_evidence',
        targetTaskId: task.id,
        planSummary: plan.summary,
        standingApprovalPolicyId: plan.policy?.id ?? null,
        runtimeStartMissingRequirements: plan.runtimeStartMissingRequirements,
        runtimeStartSatisfiedRequirements: plan.runtimeStartSatisfiedRequirements,
        triggerRunEvidenceRequired: plan.triggerRunEvidenceRequired,
        runLimit: plan.runLimit,
        schedulerTriggerServiceConnected: plan.schedulerTriggerServiceConnected,
        runtimeStartAllowed: plan.runtimeStartAllowed,
        triggerKind,
        triggeredAt: now.toISOString(),
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

function isTerminalScheduledEventRunStatus(status: RunRecord['status']): boolean {
  return status === 'completed' || status === 'failed';
}
