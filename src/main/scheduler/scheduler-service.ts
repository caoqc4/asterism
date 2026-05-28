import cron, { type ScheduledTask } from 'node-cron';

import type { SchedulerStatus } from '../../shared/types/scheduler.js';
import { buildAgentSandboxBackendStatus } from '../../shared/agent-sandbox-provider.js';
import {
  planScheduledEventAgentTriggerFromEvidence,
  type AgentScheduledEventTriggerPlan,
} from '../../shared/agent-orchestration.js';
import { planSchedulerDecisionProposalFromEvidence } from '../../shared/scheduler-decision-proposal.js';
import type { TaskDetail } from '../../shared/types/task.js';
import type { CreateCodeAgentRunInput, RunRecord } from '../../shared/types/run.js';
import type { AiConfigStatus } from '../../shared/types/settings.js';
import { AppConfigService } from '../config/app-config-service.js';
import { BriefSnapshotRepository } from '../db/repositories/brief-snapshot-repository.js';
import { BriefProcessTemplateSelector } from '../domain/brief/process-template-selector.js';
import { RunRepository } from '../db/repositories/run-repository.js';
import { HomeBriefService } from '../domain/brief/home-brief-service.js';
import { BriefExecutor, buildFallbackBrief } from '../executors/brief-executor.js';
import { AiConfigService } from '../keychain/ai-config-service.js';
import { probeLocalContainerSandboxBackend } from '../domain/run/local-container-sandbox-backend.js';

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
  skipReason: 'none' | 'ports_not_connected' | 'in_flight' | 'sweep_failed';
  checkedTaskCount: number;
  checkedTaskIds: string[];
  startedRunCount: number;
  blockedTaskCount: number;
  startedRunIds: string[];
  blockedReasons: string[];
  blockedTaskSummaries: string[];
  runFailureReasons: string[];
  automationMissingRequirements: AgentScheduledEventTriggerPlan['readiness']['missingRequirements'];
  automationSatisfiedRequirements: AgentScheduledEventTriggerPlan['readiness']['satisfiedRequirements'];
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
    type: 'panel.scheduled_event_agent_triggered' | 'panel.scheduler_decision_proposed';
    payload?: Record<string, unknown>;
  }) => Promise<void>;
};

export type SchedulerDecisionProposalInput = {
  evidenceRunId?: string | null;
  operatorConfirmed?: boolean;
  operatorId?: string | null;
  options?: string[];
  proposedOutcome?: string | null;
  rationale: string;
  standingApprovalActive?: boolean;
  standingApprovalPolicyId?: string | null;
  standingApprovalScopeTaskId?: string | null;
  targetTaskId: string;
  title: string;
};

export type SchedulerDecisionProposalResult = {
  status: 'proposed' | 'blocked';
  summary: string;
};

export type ScheduledEventAgentSweepListener = (result: ScheduledEventAgentSweepResult) => void;

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
      `Automation readiness: ${plan.readiness.summary}.`,
      `Standing Approval policy: ${plan.policy?.id ?? 'unknown'}.`,
      `Standing Approval scope: ${formatScheduledEventStandingApprovalScope(plan)}`,
      `Runtime start requirements: ${plan.runtimeStartSatisfiedRequirements.join(',')}.`,
      `Trigger evidence: ${plan.triggerRunEvidenceRequired.join(',')}.`,
      `Run limit: ${plan.runLimit.runsStartedToday ?? 'unknown'}/${plan.runLimit.maxRunsPerDay ?? 'unknown'}.`,
      'Post-step evidence: return terminal run output for Taskplane review.',
      'Workspace write boundary: workspaceWriteAllowed=false; proposals only.',
      'Do not apply workspace changes directly; produce reviewable patch artifacts or proposals through Taskplane gates.',
    ].join('\n'),
    requestedChecks: ['test', 'lint'],
    operatorConfirmed: true,
    useModelProducer: true,
  };
}

function formatScheduledEventStandingApprovalScope(plan: AgentScheduledEventTriggerPlan): string {
  const policy = plan.policy;
  if (!policy) return 'none';
  return [
    `autonomy=${policy.allowedAutonomyLevel}`,
    `riskCeiling=${policy.riskCeiling}`,
    `maxRunsPerDay=${policy.maxRunsPerDay}`,
    `reason=${policy.reason.trim() || 'none'}`,
  ].join('; ');
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

function formatScheduledEventAgentSweepError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return (raw.trim() || 'unknown').replace(/\s+/g, ' ').replace(/\//g, '-');
}

function planScheduledEventAgentTriggerFromServiceEvidence(params: {
  aiStatus: Pick<
    AiConfigStatus,
    'featureFlags' | 'sandboxBackendStatus' | 'toolScaffoldSummaries' | 'workspaceRoot'
  > | null;
  now: Date;
  runCountsStartedTodayByTaskId: Record<string, number>;
  schedulerTriggerServiceConnected: boolean;
  task: ScheduledEventAgentTaskInput;
}): AgentScheduledEventTriggerPlan {
  const runsStartedToday = params.runCountsStartedTodayByTaskId[params.task.id];
  return planScheduledEventAgentTriggerFromEvidence({
    aiStatus: params.aiStatus,
    now: params.now,
    runLimit: runsStartedToday === undefined
      ? null
      : {
          runsStartedToday,
          status: 'present',
        },
    schedulerTriggerService: {
      connected: params.schedulerTriggerServiceConnected,
    },
    task: params.task,
  });
}

type ScheduledEventAgentSweepFailureEvidence = {
  plan: AgentScheduledEventTriggerPlan;
  run?: RunRecord | null;
  task?: ScheduledEventAgentTaskInput | null;
};

type ScheduledEventAgentSweepError = Error & {
  scheduledEventAgentSweepFailureEvidence?: ScheduledEventAgentSweepFailureEvidence;
};

function buildScheduledEventAgentSweepError(
  message: string,
  evidence: ScheduledEventAgentSweepFailureEvidence,
): ScheduledEventAgentSweepError {
  const error = new Error(message) as ScheduledEventAgentSweepError;
  error.scheduledEventAgentSweepFailureEvidence = evidence;
  return error;
}

function getScheduledEventAgentSweepFailureEvidence(
  error: unknown,
): ScheduledEventAgentSweepFailureEvidence | null {
  if (!error || typeof error !== 'object') return null;
  const evidence = (error as ScheduledEventAgentSweepError).scheduledEventAgentSweepFailureEvidence;
  return evidence ?? null;
}

function isScheduledEventDailyRunLimitBlocked(result: ScheduledEventAgentTriggerResult): boolean {
  return result.status === 'blocked'
    && result.plan.blockedReasons.some((reason) => /daily run limit reached/i.test(reason));
}

function hasSchedulerDecisionProposalSince(
  task: ScheduledEventAgentTaskInput,
  title: string,
  sinceIso: string,
): boolean {
  const sinceTime = Date.parse(sinceIso);
  return task.timeline.some((event) => {
    if (event.type !== 'panel.scheduler_decision_proposed') return false;
    if (Date.parse(event.createdAt) < sinceTime) return false;
    try {
      const payload = event.payload ? JSON.parse(event.payload) as Record<string, unknown> : {};
      return payload.title === title;
    } catch {
      return false;
    }
  });
}

export class SchedulerService {
  private jobs: ScheduledTask[] = [];
  private started = false;
  private lastBriefAt: string | null = null;
  private lastRunSweepAt: string | null = null;
  private lastScheduledEventAgentSweepAt: string | null = null;
  private lastScheduledEventAgentSweepSummary: string | null = null;
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
    private readonly scheduledEventAgentSweepListener: ScheduledEventAgentSweepListener | null = null,
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

    if (this.hasScheduledEventAgentSweepPorts()) {
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
      lastScheduledEventAgentSweepSummary: this.lastScheduledEventAgentSweepSummary,
      scheduledEventAgentSweepJobConnected: this.started && this.hasScheduledEventAgentSweepPorts(),
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
      const summary = `scheduledEventAgentSweep=${kind} / status=skipped / reason=ports_not_connected / missingPorts=${missingPorts} / triggerRunEvidenceStatus=not_started`;
      this.lastScheduledEventAgentSweepAt = now.toISOString();
      this.lastScheduledEventAgentSweepSummary = summary;
      return this.publishScheduledEventAgentSweepResult({
        status: 'skipped',
        skipReason: 'ports_not_connected',
        checkedTaskCount: 0,
        checkedTaskIds: [],
        startedRunCount: 0,
        blockedTaskCount: 0,
        startedRunIds: [],
        blockedReasons: ['ports_not_connected'],
        blockedTaskSummaries: [],
        runFailureReasons: [],
        automationMissingRequirements: [],
        automationSatisfiedRequirements: [],
        runtimeStartMissingRequirements: ['scheduler_trigger_service'],
        terminalRunEvidenceMissingRunIds: [],
        triggerRunEvidenceRequired: [],
        triggerRunEvidenceStatus: 'not_started',
        summaries: [],
        summary,
      });
    }

    if (this.scheduledEventAgentSweepInFlight) {
      const summary = `scheduledEventAgentSweep=${kind} / status=skipped / reason=in_flight / triggerRunEvidenceStatus=not_started`;
      this.lastScheduledEventAgentSweepAt = now.toISOString();
      this.lastScheduledEventAgentSweepSummary = summary;
      return this.publishScheduledEventAgentSweepResult({
        status: 'skipped',
        skipReason: 'in_flight',
        checkedTaskCount: 0,
        checkedTaskIds: [],
        startedRunCount: 0,
        blockedTaskCount: 0,
        startedRunIds: [],
        blockedReasons: ['in_flight'],
        blockedTaskSummaries: [],
        runFailureReasons: [],
        automationMissingRequirements: [],
        automationSatisfiedRequirements: [],
        runtimeStartMissingRequirements: [],
        terminalRunEvidenceMissingRunIds: [],
        triggerRunEvidenceRequired: [],
        triggerRunEvidenceStatus: 'not_started',
        summaries: [],
        summary,
      });
    }

    this.scheduledEventAgentSweepInFlight = true;
    let checkedTaskIds: string[] = [];
    let activeSweepTask: ScheduledEventAgentTaskInput | null = null;
    try {
      const tasks = await taskSourcePort.listScheduledEventAgentTriggerCandidates();
      checkedTaskIds = tasks.map((task) => task.id);
      const runCounts = await this.countRunsStartedToday(checkedTaskIds, now);
      const results: ScheduledEventAgentTriggerResult[] = [];
      const runLimitDecisionProposalStatuses: string[] = [];

      for (const task of tasks) {
        activeSweepTask = task;
        const result = await this.triggerScheduledEventAgentRun(task, now, runCounts, kind);
        activeSweepTask = null;
        results.push(result);
        if (result.status === 'started') {
          runCounts[task.id] = (runCounts[task.id] ?? 0) + 1;
        } else if (isScheduledEventDailyRunLimitBlocked(result)) {
          const proposal = await this.proposeScheduledEventRunLimitDecision(task, result.plan, now)
            .catch((error: unknown) => ({
              status: 'failed' as const,
              summary: `runLimitDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(error)}`,
            }));
          runLimitDecisionProposalStatuses.push(proposal.status);
        }
      }

      const startedRunCount = results.filter((result) => result.status === 'started').length;
      const blockedTaskCount = results.length - startedRunCount;
      const startedRunIds = results.flatMap((result) => result.status === 'started' && result.run ? [result.run.id] : []);
      const blockedReasons = results.flatMap((result) => result.status === 'blocked' ? result.plan.blockedReasons : []);
      const blockedTaskSummaries = results.flatMap((result, index) => {
        if (result.status !== 'blocked') return [];
        const taskId = tasks[index]?.id ?? 'unknown';
        const reasons = result.plan.blockedReasons.length ? result.plan.blockedReasons.join('; ') : 'unknown';
        return [`${taskId}: ${reasons}`];
      });
      const runFailureReasons = results.flatMap((result) =>
        result.status === 'started' && result.run?.failureReason?.trim()
          ? [`${result.run.id}: ${result.run.failureReason.trim()}`]
          : []);
      const failureDecisionProposals = results.flatMap((result) => {
        const match = /failureDecisionProposal=([^/\s]+)/.exec(result.summary);
        return match?.[1] && match[1] !== 'not_required' ? [match[1]] : [];
      });
      const runtimeStartMissingRequirements = Array.from(new Set(
        results.flatMap((result) => result.plan.runtimeStartMissingRequirements),
      ));
      const automationMissingRequirements = Array.from(new Set(
        results.flatMap((result) => result.plan.readiness.missingRequirements),
      ));
      const automationSatisfiedRequirements = Array.from(new Set(
        results.flatMap((result) => result.plan.readiness.satisfiedRequirements),
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
      this.lastScheduledEventAgentSweepAt = now.toISOString();
      const summary = [
        `scheduledEventAgentSweep=${kind}`,
        'status=completed',
        `checked=${tasks.length}`,
        `checkedTaskIds=${checkedTaskIds.length ? checkedTaskIds.join(',') : 'none'}`,
        `started=${startedRunCount}`,
        `blocked=${blockedTaskCount}`,
        `startedRunIds=${startedRunIds.length ? startedRunIds.join(',') : 'none'}`,
        `blockedReasons=${blockedReasons.length ? blockedReasons.join('; ') : 'none'}`,
        `blockedTaskSummaries=${blockedTaskSummaries.length ? blockedTaskSummaries.join('; ') : 'none'}`,
        `runFailureReasons=${runFailureReasons.length ? runFailureReasons.join('; ') : 'none'}`,
        `failureDecisionProposals=${failureDecisionProposals.length ? failureDecisionProposals.join(',') : 'none'}`,
        `runLimitDecisionProposals=${runLimitDecisionProposalStatuses.length ? runLimitDecisionProposalStatuses.join(',') : 'none'}`,
        `automationMissingRequirements=${automationMissingRequirements.length ? automationMissingRequirements.join(',') : 'none'}`,
        `automationSatisfiedRequirements=${automationSatisfiedRequirements.length ? automationSatisfiedRequirements.join(',') : 'none'}`,
        `runtimeStartMissingRequirements=${runtimeStartMissingRequirements.length ? runtimeStartMissingRequirements.join(',') : 'none'}`,
        `terminalRunEvidenceMissingRunIds=${terminalRunEvidenceMissingRunIds.length ? terminalRunEvidenceMissingRunIds.join(',') : 'none'}`,
        `triggerRunEvidenceRequired=${triggerRunEvidenceRequired.length ? triggerRunEvidenceRequired.join(',') : 'none'}`,
        `triggerRunEvidenceStatus=${triggerRunEvidenceStatus}`,
      ].join(' / ');
      this.lastScheduledEventAgentSweepSummary = summary;

      return this.publishScheduledEventAgentSweepResult({
        status: 'completed',
        skipReason: 'none',
        checkedTaskCount: tasks.length,
        checkedTaskIds,
        startedRunCount,
        blockedTaskCount,
        startedRunIds,
        blockedReasons,
        blockedTaskSummaries,
        runFailureReasons,
        automationMissingRequirements,
        automationSatisfiedRequirements,
        runtimeStartMissingRequirements,
        terminalRunEvidenceMissingRunIds,
        triggerRunEvidenceRequired,
        triggerRunEvidenceStatus,
        summaries: results.map((result) => result.summary),
        summary,
      });
    } catch (error) {
      const errorMessage = formatScheduledEventAgentSweepError(error);
      const failureEvidence = getScheduledEventAgentSweepFailureEvidence(error);
      const failedRun = failureEvidence?.run ?? null;
      const failedPlan = failureEvidence?.plan ?? null;
      const failedTask = failureEvidence?.task ?? activeSweepTask;
      const startedRunIds = failedRun ? [failedRun.id] : [];
      const runFailureReasons = failedRun?.failureReason?.trim()
        ? [`${failedRun.id}: ${failedRun.failureReason.trim()}`]
        : [];
      const terminalRunEvidenceMissingRunIds = failedRun && !isTerminalScheduledEventRunStatus(failedRun.status)
        ? [failedRun.id]
        : [];
      const automationMissingRequirements = failedPlan?.readiness.missingRequirements ?? [];
      const automationSatisfiedRequirements = failedPlan?.readiness.satisfiedRequirements ?? [];
      const triggerRunEvidenceRequired = failedPlan?.triggerRunEvidenceRequired ?? [];
      const blockedTaskIds = startedRunIds.length > 0 ? [] : checkedTaskIds;
      const sweepFailureDecisionProposal = failedTask && failedPlan && !failedRun
        ? await this.proposeScheduledEventSweepFailureDecision(failedTask, failedPlan, errorMessage, now)
          .catch((proposalError: unknown) => ({
            status: 'failed' as const,
            summary: `sweepFailureDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(proposalError)}`,
          }))
        : null;
      const summary = [
        `scheduledEventAgentSweep=${kind}`,
        'status=skipped',
        'reason=sweep_failed',
        `checked=${checkedTaskIds.length}`,
        `checkedTaskIds=${checkedTaskIds.length ? checkedTaskIds.join(',') : 'none'}`,
        `startedRunIds=${startedRunIds.length ? startedRunIds.join(',') : 'none'}`,
        `runFailureReasons=${runFailureReasons.length ? runFailureReasons.join('; ') : 'none'}`,
        `automationMissingRequirements=${automationMissingRequirements.length ? automationMissingRequirements.join(',') : 'none'}`,
        `automationSatisfiedRequirements=${automationSatisfiedRequirements.length ? automationSatisfiedRequirements.join(',') : 'none'}`,
        `terminalRunEvidenceMissingRunIds=${terminalRunEvidenceMissingRunIds.length ? terminalRunEvidenceMissingRunIds.join(',') : 'none'}`,
        `triggerRunEvidenceRequired=${triggerRunEvidenceRequired.length ? triggerRunEvidenceRequired.join(',') : 'none'}`,
        `error=${errorMessage}`,
        sweepFailureDecisionProposal
          ? `sweepFailureDecisionProposals=${sweepFailureDecisionProposal.status}`
          : 'sweepFailureDecisionProposals=not_required',
        `triggerRunEvidenceStatus=${startedRunIds.length ? 'pending_terminal_run_evidence' : 'not_started'}`,
      ].join(' / ');
      this.lastScheduledEventAgentSweepAt = now.toISOString();
      this.lastScheduledEventAgentSweepSummary = summary;
      return this.publishScheduledEventAgentSweepResult({
        status: 'skipped',
        skipReason: 'sweep_failed',
        checkedTaskCount: checkedTaskIds.length,
        checkedTaskIds,
        startedRunCount: startedRunIds.length,
        blockedTaskCount: blockedTaskIds.length,
        startedRunIds,
        blockedReasons: [`sweep_failed: ${errorMessage}`],
        blockedTaskSummaries: blockedTaskIds.map((taskId) => `${taskId}: sweep_failed: ${errorMessage}`),
        runFailureReasons,
        automationMissingRequirements,
        automationSatisfiedRequirements,
        runtimeStartMissingRequirements: ['trigger_plan_ready'],
        terminalRunEvidenceMissingRunIds,
        triggerRunEvidenceRequired,
        triggerRunEvidenceStatus: startedRunIds.length ? 'pending_terminal_run_evidence' : 'not_started',
        summaries: [],
        summary,
      });
    } finally {
      this.scheduledEventAgentSweepInFlight = false;
    }
  }

  private publishScheduledEventAgentSweepResult(
    result: ScheduledEventAgentSweepResult,
  ): ScheduledEventAgentSweepResult {
    try {
      this.scheduledEventAgentSweepListener?.(result);
    } catch {
      // Sweep evidence should remain durable even if UI refresh notification fails.
    }
    return result;
  }

  async diagnoseScheduledEventAgentTriggers(
    tasks: ScheduledEventAgentTaskInput[],
    now: Date = new Date(),
    runCountsStartedTodayByTaskId: Record<string, number> | null = null,
  ): Promise<AgentScheduledEventTriggerPlan[]> {
    const aiStatus = await this.getScheduledEventAgentTriggerAiStatus();
    const runCounts = runCountsStartedTodayByTaskId
      ?? await this.countRunsStartedToday(tasks.map((task) => task.id), now);

    return tasks.map((task) => planScheduledEventAgentTriggerFromServiceEvidence({
      aiStatus,
      now,
      runCountsStartedTodayByTaskId: runCounts,
      schedulerTriggerServiceConnected: false,
      task,
    }));
  }

  async proposeSchedulerDecision(
    input: SchedulerDecisionProposalInput,
  ): Promise<SchedulerDecisionProposalResult> {
    const targetTaskId = input.targetTaskId.trim();
    const title = input.title.trim();
    const rationale = input.rationale.trim();
    if (!this.scheduledEventAgentTimelinePort) {
      return {
        status: 'blocked',
        summary: 'Scheduler Decision proposal blocked / timelineEvidence=missing / reason=Task Dynamics timeline evidence service is not connected.',
      };
    }

    const readiness = planSchedulerDecisionProposalFromEvidence({
      approvalQueue: {
        connected: true,
        surface: 'task_dynamics',
      },
      operatorConfirmation: {
        confirmed: input.operatorConfirmed === true,
        operatorId: input.operatorId ?? null,
      },
      standingApproval: {
        active: input.standingApprovalActive === true,
        policyId: input.standingApprovalPolicyId ?? null,
        scopeTaskId: input.standingApprovalScopeTaskId ?? null,
      },
      targetTaskId,
    });

    if (readiness.status !== 'ready' || !targetTaskId || !title || !rationale) {
      return {
        status: 'blocked',
        summary: [
          readiness.summary,
          `title=${title ? 'present' : 'missing'}`,
          `rationale=${rationale ? 'present' : 'missing'}`,
          'schedulerDecisionProposal=blocked',
        ].join(' / '),
      };
    }

    await this.scheduledEventAgentTimelinePort.recordTimelineEvent({
      taskId: targetTaskId,
      type: 'panel.scheduler_decision_proposed',
      payload: {
        approvalQueueSurface: 'task_dynamics',
        authorization: readiness.authorizations.join(','),
        evidenceRunId: input.evidenceRunId?.trim() || null,
        operatorConfirmed: input.operatorConfirmed === true,
        operatorId: input.operatorId?.trim() || null,
        options: input.options?.map((option) => option.trim()).filter(Boolean) ?? [],
        proposedOutcome: input.proposedOutcome?.trim() || null,
        proposalReadinessSummary: readiness.summary,
        rationale,
        standingApprovalActive: input.standingApprovalActive === true,
        standingApprovalPolicyId: input.standingApprovalPolicyId?.trim() || null,
        standingApprovalScopeTaskId: input.standingApprovalScopeTaskId?.trim() || null,
        targetTaskId,
        title,
      },
    });

    return {
      status: 'proposed',
      summary: `${readiness.summary} / schedulerDecisionProposal=recorded / timelineEvent=panel.scheduler_decision_proposed / durableDecisionCreation=approval_required`,
    };
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

    const aiStatus = await this.getScheduledEventAgentTriggerAiStatus();
    const runCounts = runCountsStartedTodayByTaskId
      ?? await this.countRunsStartedToday([task.id], now);
    const plan = planScheduledEventAgentTriggerFromServiceEvidence({
      aiStatus,
      now,
      runCountsStartedTodayByTaskId: runCounts,
      schedulerTriggerServiceConnected: true,
      task,
    });

    if (!this.scheduledEventAgentTimelinePort) {
      return {
        status: 'blocked',
        plan,
        run: null,
        terminalRunEvidenceStatus: 'not_started',
        triggerRunEvidenceStatus: 'not_started',
        summary: `${plan.summary} / trigger=blocked / triggerRunEvidenceStatus=not_started / reason=Scheduled event Agent timeline evidence service is not connected.`,
      };
    }

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
    ).catch((error: unknown) => {
      throw buildScheduledEventAgentSweepError(
        formatScheduledEventAgentSweepError(error),
        { plan, run: null, task },
      );
    });
    const timelineEvidence = await this.recordScheduledEventAgentTriggered(task, plan, run, now, triggerKind)
      .catch((error: unknown) => {
        throw buildScheduledEventAgentSweepError(
          `Timeline evidence failed: ${formatScheduledEventAgentSweepError(error)}`,
          { plan, run, task },
        );
      });
    const terminalRunEvidenceStatus = isTerminalScheduledEventRunStatus(run.status) ? 'present' : 'pending';
    const triggerRunEvidenceStatus = terminalRunEvidenceStatus === 'present'
      ? 'ready_for_terminal_review'
      : 'pending_terminal_run_evidence';
    const failureDecisionProposal = run.status === 'failed'
      ? await this.proposeScheduledEventFailureDecision(task, plan, run).catch((error: unknown) => ({
          status: 'failed' as const,
          summary: `failureDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(error)}`,
        }))
      : null;

    return {
      status: 'started',
      plan,
      run,
      terminalRunEvidenceStatus,
      triggerRunEvidenceStatus,
      summary: [
        `${plan.summary} / trigger=started / runId=${run.id} / terminalRunEvidence=${terminalRunEvidenceStatus} / triggerRunEvidenceStatus=${triggerRunEvidenceStatus} / timelineEvidence=${timelineEvidence}`,
        failureDecisionProposal
          ? `failureDecisionProposal=${failureDecisionProposal.status} / failureDecisionSummary=${failureDecisionProposal.summary}`
          : 'failureDecisionProposal=not_required',
      ].join(' / '),
    };
  }

  private async proposeScheduledEventFailureDecision(
    task: ScheduledEventAgentTaskInput,
    plan: AgentScheduledEventTriggerPlan,
    run: RunRecord,
  ): Promise<SchedulerDecisionProposalResult> {
    return this.proposeSchedulerDecision({
      evidenceRunId: run.id,
      options: [
        '暂停自动巡检并等待人工处理',
        '保留自动巡检但先修复失败原因',
      ],
      proposedOutcome: '暂停自动巡检并等待人工处理',
      rationale: [
        `Scheduled/event Agent run ${run.id} failed.`,
        run.failureReason ? `Failure reason: ${run.failureReason}` : null,
        'Taskplane should confirm the next recovery step before more background work continues.',
      ].filter(Boolean).join(' '),
      standingApprovalActive: Boolean(plan.policy?.id),
      standingApprovalPolicyId: plan.policy?.id ?? null,
      standingApprovalScopeTaskId: task.id,
      targetTaskId: task.id,
      title: '确认定时/事件 Agent 失败后的下一步',
    });
  }

  private async proposeScheduledEventRunLimitDecision(
    task: ScheduledEventAgentTaskInput,
    plan: AgentScheduledEventTriggerPlan,
    now: Date,
  ): Promise<SchedulerDecisionProposalResult | { status: 'skipped_existing'; summary: string }> {
    const title = '确认定时/事件 Agent 达到每日运行上限后的下一步';
    if (hasSchedulerDecisionProposalSince(task, title, startOfUtcDay(now))) {
      return {
        status: 'skipped_existing',
        summary: 'runLimitDecisionProposal=skipped_existing',
      };
    }

    return this.proposeSchedulerDecision({
      options: [
        '等待下一次运行窗口',
        '调整 Standing Approval 每日运行上限',
        '暂停自动巡检并人工复核',
      ],
      proposedOutcome: '等待下一次运行窗口',
      rationale: [
        `Scheduled/event Agent daily run limit reached for task ${task.id}.`,
        `Current limit: ${plan.runLimit.runsStartedToday ?? 'unknown'}/${plan.runLimit.maxRunsPerDay ?? 'unknown'}.`,
        'Taskplane should confirm whether to wait, adjust the Standing Approval limit, or pause automation.',
      ].join(' '),
      standingApprovalActive: Boolean(plan.policy?.id),
      standingApprovalPolicyId: plan.policy?.id ?? null,
      standingApprovalScopeTaskId: task.id,
      targetTaskId: task.id,
      title,
    });
  }

  private async proposeScheduledEventSweepFailureDecision(
    task: ScheduledEventAgentTaskInput,
    plan: AgentScheduledEventTriggerPlan,
    errorMessage: string,
    now: Date,
  ): Promise<SchedulerDecisionProposalResult | { status: 'skipped_existing'; summary: string }> {
    const title = '确认定时/事件 Agent sweep 异常后的下一步';
    if (hasSchedulerDecisionProposalSince(task, title, startOfUtcDay(now))) {
      return {
        status: 'skipped_existing',
        summary: 'sweepFailureDecisionProposal=skipped_existing',
      };
    }

    return this.proposeSchedulerDecision({
      options: [
        '暂停自动触发并人工复核调度器',
        '修复触发服务后重试下一次 sweep',
        '保留自动触发但降低运行频率',
      ],
      proposedOutcome: '暂停自动触发并人工复核调度器',
      rationale: [
        `Scheduled/event Agent sweep failed before a Run record was returned for task ${task.id}.`,
        `Sweep error: ${errorMessage}.`,
        'Taskplane should confirm whether to pause automation or repair the scheduler trigger path before more background work continues.',
      ].join(' '),
      standingApprovalActive: Boolean(plan.policy?.id),
      standingApprovalPolicyId: plan.policy?.id ?? null,
      standingApprovalScopeTaskId: task.id,
      targetTaskId: task.id,
      title,
    });
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
        automationReadinessSummary: plan.readiness.summary,
        automationSatisfiedRequirements: plan.readiness.satisfiedRequirements,
        automationMissingRequirements: plan.readiness.missingRequirements,
        runtimeStartMissingRequirements: plan.runtimeStartMissingRequirements,
        runtimeStartSatisfiedRequirements: plan.runtimeStartSatisfiedRequirements,
        triggerRunEvidenceRequired: plan.triggerRunEvidenceRequired,
        runLimit: plan.runLimit,
        schedulerTriggerServiceConnected: plan.schedulerTriggerServiceConnected,
        runtimeStartAllowed: plan.runtimeStartAllowed,
        triggerKind,
        triggeredAt: now.toISOString(),
        workspaceWriteAllowed: false,
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

  private async getScheduledEventAgentTriggerAiStatus(): Promise<AiConfigStatus | null> {
    const getStatus = (this.aiConfigService as { getStatus?: AiConfigService['getStatus'] }).getStatus;
    const aiStatus = typeof getStatus === 'function'
      ? await getStatus.call(this.aiConfigService).catch(() => null)
      : null;

    if (!aiStatus || aiStatus.sandboxBackendStatus?.probe) {
      return aiStatus;
    }

    if (aiStatus.featureFlags.enableSandboxCodingAgent !== true) {
      return aiStatus;
    }

    const probe = await probeLocalContainerSandboxBackend().catch(() => null);
    if (!probe) {
      return aiStatus;
    }

    return {
      ...aiStatus,
      sandboxBackendStatus: buildAgentSandboxBackendStatus(probe),
    };
  }

  private hasScheduledEventAgentSweepPorts(): boolean {
    return Boolean(
      this.scheduledEventAgentRunPort
      && this.scheduledEventAgentTimelinePort
      && this.scheduledEventAgentTaskSourcePort,
    );
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
