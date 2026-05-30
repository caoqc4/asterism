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
  businessLineId?: string | null;
  evidenceRunId?: string | null;
  localRecoveryCompleted?: boolean;
  localRecoveryRunId?: string | null;
  localRecoveryTaskId?: string | null;
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
  | 'businessLineId'
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

type ScheduledEventRunIdentityMismatchHandling = 'return_blocked' | 'throw_sweep_error';

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

function normalizeSchedulerDecisionText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
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

function isScheduledEventAutomationReadinessBlocked(result: ScheduledEventAgentTriggerResult): boolean {
  return result.status === 'blocked'
    && result.plan.policy !== null
    && result.plan.readiness.missingRequirements.length > 0;
}

function isScheduledEventRunLimitAccountingBlocked(result: ScheduledEventAgentTriggerResult): boolean {
  return result.status === 'blocked'
    && result.plan.policy !== null
    && result.plan.runtimeStartMissingRequirements.includes('run_limit_count')
    && result.plan.blockedReasons.some((reason) => /run-limit accounting/i.test(reason));
}

function hasScheduledEventRunTargetTaskMismatch(params: {
  run: RunRecord | null | undefined;
  task: ScheduledEventAgentTaskInput | null | undefined;
}): boolean {
  return Boolean(params.run?.taskId && params.task?.id && params.run.taskId !== params.task.id);
}

function hasSchedulerDecisionProposalSince(
  task: ScheduledEventAgentTaskInput,
  title: string,
  sinceIso: string,
): boolean {
  const sinceTime = Date.parse(sinceIso);
  const normalizedTitle = normalizeSchedulerDecisionText(title);
  return task.timeline.some((event) => {
    if (event.type !== 'panel.scheduler_decision_proposed') return false;
    if (event.taskId !== task.id) return false;
    const eventTime = Date.parse(event.createdAt);
    if (!Number.isFinite(eventTime) || eventTime < sinceTime) return false;
    try {
      const payload = event.payload ? JSON.parse(event.payload) as Record<string, unknown> : {};
      const payloadTitle = typeof payload.title === 'string'
        ? normalizeSchedulerDecisionText(payload.title)
        : '';
      return payloadTitle === normalizedTitle && payload.targetTaskId === task.id;
    } catch {
      return false;
    }
  });
}

function dedupeScheduledEventAgentTasks(
  tasks: ScheduledEventAgentTaskInput[],
): {
  duplicateTaskIds: string[];
  duplicateTasks: ScheduledEventAgentTaskInput[];
  uniqueTasks: ScheduledEventAgentTaskInput[];
} {
  const seen = new Set<string>();
  const duplicateTaskIds: string[] = [];
  const duplicateTaskMap = new Map<string, ScheduledEventAgentTaskInput>();
  const uniqueTasks: ScheduledEventAgentTaskInput[] = [];

  for (const task of tasks) {
    if (seen.has(task.id)) {
      duplicateTaskIds.push(task.id);
      if (!duplicateTaskMap.has(task.id)) {
        duplicateTaskMap.set(task.id, task);
      }
      continue;
    }
    seen.add(task.id);
    uniqueTasks.push(task);
  }

  return {
    duplicateTaskIds,
    duplicateTasks: Array.from(duplicateTaskMap.values()),
    uniqueTasks,
  };
}

function duplicateScheduledEventAgentTaskIdsForTarget(
  duplicateTaskIds: string[],
  targetTaskId: string,
): string[] {
  return duplicateTaskIds.filter((taskId) => taskId === targetTaskId);
}

export class SchedulerService {
  private jobs: ScheduledTask[] = [];
  private started = false;
  private lastBriefAt: string | null = null;
  private lastRunSweepAt: string | null = null;
  private lastRunSweepSummary: string | null = null;
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
      lastRunSweepSummary: this.lastRunSweepSummary,
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
    if (!runPort && timelinePort && taskSourcePort) {
      return this.runScheduledEventAgentTriggerServiceDisconnectedSweep(kind, now);
    }

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
      const { duplicateTaskIds, duplicateTasks, uniqueTasks } = dedupeScheduledEventAgentTasks(tasks);
      const uniqueTaskIds = uniqueTasks.map((task) => task.id);
      const runCounts = await this.countRunsStartedToday(uniqueTaskIds, now);
      const results: ScheduledEventAgentTriggerResult[] = [];
      const plansByTaskId = new Map<string, AgentScheduledEventTriggerPlan>();
      const runLimitDecisionProposalStatuses: string[] = [];
      const runLimitDecisionProposalTaskIds: string[] = [];
      const runLimitAccountingDecisionProposalStatuses: string[] = [];
      const runLimitAccountingDecisionProposalTaskIds: string[] = [];
      const readinessDecisionProposalStatuses: string[] = [];
      const readinessDecisionProposalTaskIds: string[] = [];
      const duplicateCandidateDecisionProposalStatuses: string[] = [];
      const duplicateCandidateDecisionProposalTaskIds: string[] = [];

      for (const task of uniqueTasks) {
        activeSweepTask = task;
        const result = await this.triggerScheduledEventAgentRun(task, now, runCounts, kind, 'throw_sweep_error');
        activeSweepTask = null;
        results.push(result);
        plansByTaskId.set(task.id, result.plan);
        if (result.status === 'started') {
          runCounts[task.id] = (runCounts[task.id] ?? 0) + 1;
        } else if (isScheduledEventDailyRunLimitBlocked(result)) {
          const proposal = await this.proposeScheduledEventRunLimitDecision(task, result.plan, now)
            .catch((error: unknown) => ({
              status: 'failed' as const,
              summary: `runLimitDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(error)}`,
          }));
          runLimitDecisionProposalStatuses.push(proposal.status);
          runLimitDecisionProposalTaskIds.push(task.id);
        } else if (isScheduledEventAutomationReadinessBlocked(result)) {
          const proposal = await this.proposeScheduledEventReadinessBlockedDecision(task, result.plan, now)
            .catch((error: unknown) => ({
              status: 'failed' as const,
              summary: `readinessDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(error)}`,
            }));
          readinessDecisionProposalStatuses.push(proposal.status);
          readinessDecisionProposalTaskIds.push(task.id);
        } else if (isScheduledEventRunLimitAccountingBlocked(result)) {
          const proposal = await this.proposeScheduledEventRunLimitAccountingDecision(task, result.plan, now)
            .catch((error: unknown) => ({
              status: 'failed' as const,
              summary: `runLimitAccountingDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(error)}`,
            }));
          runLimitAccountingDecisionProposalStatuses.push(proposal.status);
          runLimitAccountingDecisionProposalTaskIds.push(task.id);
        }
      }

      for (const task of duplicateTasks) {
        const plan = plansByTaskId.get(task.id);
        if (!plan) continue;
        const proposal = await this.proposeScheduledEventDuplicateCandidateDecision(
          task,
          plan,
          duplicateScheduledEventAgentTaskIdsForTarget(duplicateTaskIds, task.id),
          now,
        )
          .catch((error: unknown) => ({
            status: 'failed' as const,
            summary: `duplicateCandidateDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(error)}`,
          }));
        duplicateCandidateDecisionProposalStatuses.push(proposal.status);
        duplicateCandidateDecisionProposalTaskIds.push(task.id);
      }

      const startedRunCount = results.filter((result) => result.status === 'started').length;
      const blockedTaskCount = results.length - startedRunCount + duplicateTaskIds.length;
      const startedRunIds = results.flatMap((result) => result.status === 'started' && result.run ? [result.run.id] : []);
      const duplicateBlockedReasons = duplicateTaskIds.map((taskId) =>
        `Duplicate scheduled/event candidate skipped for task ${taskId}.`);
      const blockedReasons = [
        ...results.flatMap((result) => result.status === 'blocked' ? result.plan.blockedReasons : []),
        ...duplicateBlockedReasons,
      ];
      const blockedTaskSummaries = [
        ...results.flatMap((result, index) => {
        if (result.status !== 'blocked') return [];
        const taskId = uniqueTasks[index]?.id ?? 'unknown';
        const reasons = result.plan.blockedReasons.length ? result.plan.blockedReasons.join('; ') : 'unknown';
        return [`${taskId}: ${reasons}`];
        }),
        ...duplicateTaskIds.map((taskId) => `${taskId}: duplicate scheduled/event candidate skipped before runtime start`),
      ];
      const runFailureReasons = results.flatMap((result) =>
        result.status === 'started' && result.run?.failureReason?.trim()
          ? [`${result.run.id}: ${result.run.failureReason.trim()}`]
          : []);
      const failureDecisionProposals = results.flatMap((result) => {
        const match = /failureDecisionProposal=([^/\s]+)/.exec(result.summary);
        return match?.[1] && match[1] !== 'not_required' ? [match[1]] : [];
      });
      const failureDecisionProposalTaskIds = results.flatMap((result) => {
        const match = /failureDecisionProposal=([^/\s]+)/.exec(result.summary);
        return match?.[1] && match[1] !== 'not_required' && result.run?.taskId ? [result.run.taskId] : [];
      });
      const terminalEvidenceDecisionProposals = results.flatMap((result) => {
        const match = /terminalEvidenceDecisionProposal=([^/\s]+)/.exec(result.summary);
        return match?.[1] && match[1] !== 'not_required' ? [match[1]] : [];
      });
      const terminalEvidenceDecisionProposalTaskIds = results.flatMap((result) => {
        const match = /terminalEvidenceDecisionProposal=([^/\s]+)/.exec(result.summary);
        return match?.[1] && match[1] !== 'not_required' && result.run?.taskId ? [result.run.taskId] : [];
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
        result.status === 'started' && result.run && scheduledEventRunTerminalEvidenceStatus(result.run) !== 'present'
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
        `failureDecisionProposalTasks=${failureDecisionProposalTaskIds.length ? failureDecisionProposalTaskIds.join(',') : 'none'}`,
        `terminalEvidenceDecisionProposals=${terminalEvidenceDecisionProposals.length ? terminalEvidenceDecisionProposals.join(',') : 'none'}`,
        `terminalEvidenceDecisionProposalTasks=${terminalEvidenceDecisionProposalTaskIds.length ? terminalEvidenceDecisionProposalTaskIds.join(',') : 'none'}`,
        `runLimitDecisionProposals=${runLimitDecisionProposalStatuses.length ? runLimitDecisionProposalStatuses.join(',') : 'none'}`,
        `runLimitDecisionProposalTasks=${runLimitDecisionProposalTaskIds.length ? runLimitDecisionProposalTaskIds.join(',') : 'none'}`,
        `runLimitAccountingDecisionProposals=${runLimitAccountingDecisionProposalStatuses.length ? runLimitAccountingDecisionProposalStatuses.join(',') : 'none'}`,
        `runLimitAccountingDecisionProposalTasks=${runLimitAccountingDecisionProposalTaskIds.length ? runLimitAccountingDecisionProposalTaskIds.join(',') : 'none'}`,
        `readinessDecisionProposals=${readinessDecisionProposalStatuses.length ? readinessDecisionProposalStatuses.join(',') : 'none'}`,
        `readinessDecisionProposalTasks=${readinessDecisionProposalTaskIds.length ? readinessDecisionProposalTaskIds.join(',') : 'none'}`,
        `duplicateCandidateTaskIds=${duplicateTaskIds.length ? duplicateTaskIds.join(',') : 'none'}`,
        `duplicateCandidateDecisionProposals=${duplicateCandidateDecisionProposalStatuses.length ? duplicateCandidateDecisionProposalStatuses.join(',') : 'none'}`,
        `duplicateCandidateDecisionProposalTasks=${duplicateCandidateDecisionProposalTaskIds.length ? duplicateCandidateDecisionProposalTaskIds.join(',') : 'none'}`,
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
      const taskSourceFailureDecisionProposalStatus = !failedTask && !failedPlan && !failedRun
        ? 'not_required_no_target_task'
        : 'not_required';
      const runTargetTaskMismatch = hasScheduledEventRunTargetTaskMismatch({
        run: failedRun,
        task: failedTask,
      });
      const runIdentityDecisionProposal = failedTask && failedPlan && failedRun && runTargetTaskMismatch
        ? await this.proposeScheduledEventRunIdentityDecision(failedTask, failedPlan, failedRun, errorMessage, now)
          .catch((proposalError: unknown) => ({
            status: 'failed' as const,
            summary: `runIdentityDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(proposalError)}`,
          }))
        : null;
      const timelineFailureDecisionProposal = failedTask && failedPlan && failedRun && !runTargetTaskMismatch
        ? await this.proposeScheduledEventTimelineFailureDecision(failedTask, failedPlan, failedRun, errorMessage, now)
          .catch((proposalError: unknown) => ({
            status: 'failed' as const,
            summary: `timelineFailureDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(proposalError)}`,
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
        sweepFailureDecisionProposal && failedTask
          ? `sweepFailureDecisionProposalTasks=${failedTask.id}`
          : 'sweepFailureDecisionProposalTasks=none',
        `taskSourceFailureDecisionProposals=${taskSourceFailureDecisionProposalStatus}`,
        runIdentityDecisionProposal
          ? `runIdentityDecisionProposals=${runIdentityDecisionProposal.status}`
          : 'runIdentityDecisionProposals=not_required',
        runIdentityDecisionProposal && failedTask
          ? `runIdentityDecisionProposalTasks=${failedTask.id}`
          : 'runIdentityDecisionProposalTasks=none',
        timelineFailureDecisionProposal
          ? `timelineFailureDecisionProposals=${timelineFailureDecisionProposal.status}`
          : 'timelineFailureDecisionProposals=not_required',
        timelineFailureDecisionProposal && failedTask
          ? `timelineFailureDecisionProposalTasks=${failedTask.id}`
          : 'timelineFailureDecisionProposalTasks=none',
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

  private async runScheduledEventAgentTriggerServiceDisconnectedSweep(
    kind: 'cron' | 'manual',
    now: Date,
  ): Promise<ScheduledEventAgentSweepResult> {
    const taskSourcePort = this.scheduledEventAgentTaskSourcePort;
    if (!taskSourcePort) {
      throw new Error('Scheduled/event Agent task source port is not connected.');
    }

    try {
      const tasks = await taskSourcePort.listScheduledEventAgentTriggerCandidates();
      const { uniqueTasks } = dedupeScheduledEventAgentTasks(tasks);
      const plans = await this.diagnoseScheduledEventAgentTriggers(uniqueTasks, now);
      const triggerServiceDecisionProposalStatuses: string[] = [];
      const triggerServiceDecisionProposalTaskIds: string[] = [];

      for (const [index, task] of uniqueTasks.entries()) {
        const plan = plans[index];
        if (!plan) continue;
        const proposal = await this.proposeScheduledEventTriggerServiceDisconnectedDecision(task, plan, now)
          .catch((error: unknown) => ({
            status: 'failed' as const,
            summary: `triggerServiceDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(error)}`,
          }));
        triggerServiceDecisionProposalStatuses.push(proposal.status);
        triggerServiceDecisionProposalTaskIds.push(task.id);
      }

      const checkedTaskIds = tasks.map((task) => task.id);
      const uniqueTaskIds = uniqueTasks.map((task) => task.id);
      const automationMissingRequirements = Array.from(new Set(
        plans.flatMap((plan) => plan.readiness.missingRequirements),
      ));
      const automationSatisfiedRequirements = Array.from(new Set(
        plans.flatMap((plan) => plan.readiness.satisfiedRequirements),
      ));
      const runtimeStartMissingRequirements = Array.from(new Set([
        'scheduler_trigger_service' as const,
        ...plans.flatMap((plan) => plan.runtimeStartMissingRequirements),
      ]));
      const triggerRunEvidenceRequired = Array.from(new Set(
        plans.flatMap((plan) => plan.triggerRunEvidenceRequired),
      ));
      const blockedReasons = [
        'ports_not_connected',
        'Scheduled event Agent trigger service is not connected.',
      ];
      const blockedTaskSummaries = uniqueTaskIds.map((taskId) =>
        `${taskId}: trigger service port disconnected before runtime start`);
      const summary = [
        `scheduledEventAgentSweep=${kind}`,
        'status=skipped',
        'reason=ports_not_connected',
        'missingPorts=run_port',
        `checked=${tasks.length}`,
        `checkedTaskIds=${checkedTaskIds.length ? checkedTaskIds.join(',') : 'none'}`,
        'started=0',
        `blocked=${uniqueTaskIds.length}`,
        `blockedTaskSummaries=${blockedTaskSummaries.length ? blockedTaskSummaries.join('; ') : 'none'}`,
        `triggerServiceDecisionProposals=${triggerServiceDecisionProposalStatuses.length ? triggerServiceDecisionProposalStatuses.join(',') : 'none'}`,
        `triggerServiceDecisionProposalTasks=${triggerServiceDecisionProposalTaskIds.length ? triggerServiceDecisionProposalTaskIds.join(',') : 'none'}`,
        `automationMissingRequirements=${automationMissingRequirements.length ? automationMissingRequirements.join(',') : 'none'}`,
        `automationSatisfiedRequirements=${automationSatisfiedRequirements.length ? automationSatisfiedRequirements.join(',') : 'none'}`,
        `runtimeStartMissingRequirements=${runtimeStartMissingRequirements.length ? runtimeStartMissingRequirements.join(',') : 'none'}`,
        `triggerRunEvidenceRequired=${triggerRunEvidenceRequired.length ? triggerRunEvidenceRequired.join(',') : 'none'}`,
        'triggerRunEvidenceStatus=not_started',
      ].join(' / ');

      this.lastScheduledEventAgentSweepAt = now.toISOString();
      this.lastScheduledEventAgentSweepSummary = summary;

      return this.publishScheduledEventAgentSweepResult({
        status: 'skipped',
        skipReason: 'ports_not_connected',
        checkedTaskCount: tasks.length,
        checkedTaskIds,
        startedRunCount: 0,
        blockedTaskCount: uniqueTaskIds.length,
        startedRunIds: [],
        blockedReasons,
        blockedTaskSummaries,
        runFailureReasons: [],
        automationMissingRequirements,
        automationSatisfiedRequirements,
        runtimeStartMissingRequirements,
        terminalRunEvidenceMissingRunIds: [],
        triggerRunEvidenceRequired,
        triggerRunEvidenceStatus: 'not_started',
        summaries: plans.map((plan) => plan.summary),
        summary,
      });
    } catch (error) {
      const errorMessage = formatScheduledEventAgentSweepError(error);
      const summary = [
        `scheduledEventAgentSweep=${kind}`,
        'status=skipped',
        'reason=sweep_failed',
        'checked=0',
        'checkedTaskIds=none',
        `error=${errorMessage}`,
        'taskSourceFailureDecisionProposals=not_required_no_target_task',
        'triggerRunEvidenceStatus=not_started',
      ].join(' / ');

      this.lastScheduledEventAgentSweepAt = now.toISOString();
      this.lastScheduledEventAgentSweepSummary = summary;

      return this.publishScheduledEventAgentSweepResult({
        status: 'skipped',
        skipReason: 'sweep_failed',
        checkedTaskCount: 0,
        checkedTaskIds: [],
        startedRunCount: 0,
        blockedTaskCount: 0,
        startedRunIds: [],
        blockedReasons: [`sweep_failed: ${errorMessage}`],
        blockedTaskSummaries: [],
        runFailureReasons: [],
        automationMissingRequirements: [],
        automationSatisfiedRequirements: [],
        runtimeStartMissingRequirements: ['trigger_plan_ready'],
        terminalRunEvidenceMissingRunIds: [],
        triggerRunEvidenceRequired: [],
        triggerRunEvidenceStatus: 'not_started',
        summaries: [],
        summary,
      });
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
    const title = normalizeSchedulerDecisionText(input.title);
    const rationale = normalizeSchedulerDecisionText(input.rationale);
    const options = input.options?.map(normalizeSchedulerDecisionText).filter(Boolean) ?? [];
    const optionIdentityKeys = options.map((option) => option.toLowerCase());
    const optionIdentityReady = options.length > 0 && new Set(optionIdentityKeys).size === optionIdentityKeys.length;
    const proposedOutcomeInput = normalizeSchedulerDecisionText(input.proposedOutcome ?? '');
    const proposedOutcomeIdentityKey = proposedOutcomeInput.toLowerCase();
    const matchedProposedOutcome = options.find((option) => option.toLowerCase() === proposedOutcomeIdentityKey) ?? '';
    const proposedOutcome = matchedProposedOutcome || proposedOutcomeInput;
    const proposedOutcomeMatchesOption = Boolean(proposedOutcomeInput) && Boolean(matchedProposedOutcome);
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
      evidenceRunId: input.evidenceRunId ?? null,
      businessLineId: input.businessLineId ?? null,
      operatorConfirmation: {
        confirmed: input.operatorConfirmed === true,
        operatorId: input.operatorId ?? null,
      },
      localRecovery: {
        recoveredRunId: input.localRecoveryRunId ?? null,
        taskId: input.localRecoveryTaskId ?? null,
        status: input.localRecoveryCompleted === true ? 'completed' : 'missing',
      },
      proposal: {
        options,
        proposedOutcome,
        rationale,
        title,
      },
      standingApproval: {
        active: input.standingApprovalActive === true,
        policyId: input.standingApprovalPolicyId ?? null,
        scopeTaskId: input.standingApprovalScopeTaskId ?? null,
      },
      targetTaskId,
    });

    if (
      readiness.status !== 'ready'
      || !targetTaskId
      || !title
      || !rationale
      || options.length === 0
      || !optionIdentityReady
      || !proposedOutcome
      || !proposedOutcomeMatchesOption
    ) {
      return {
        status: 'blocked',
        summary: [
          readiness.summary,
          `title=${title ? 'present' : 'missing'}`,
          `rationale=${rationale ? 'present' : 'missing'}`,
          `options=${options.length ? options.length : 'missing'}`,
          `optionIdentity=${optionIdentityReady ? 'ready' : 'duplicate_or_missing'}`,
          `proposedOutcome=${proposedOutcome ? 'present' : 'missing'}`,
          `proposedOutcomeMatchesOption=${proposedOutcomeMatchesOption ? 'yes' : 'no'}`,
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
        businessLineId: readiness.businessLineId,
        decisionScope: readiness.decisionScope,
        evidenceRunId: input.evidenceRunId?.trim() || null,
        localRecoveryCompleted: input.localRecoveryCompleted === true,
        localRecoveryRunId: input.localRecoveryRunId?.trim() || null,
        localRecoveryTaskId: input.localRecoveryTaskId?.trim() || null,
        operatorConfirmed: input.operatorConfirmed === true,
        operatorId: input.operatorId?.trim() || null,
        options,
        proposedOutcome,
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
    runIdentityMismatchHandling: ScheduledEventRunIdentityMismatchHandling = 'return_blocked',
  ): Promise<ScheduledEventAgentTriggerResult> {
    if (!this.scheduledEventAgentRunPort) {
      const [plan] = await this.diagnoseScheduledEventAgentTriggers(
        [task],
        now,
        runCountsStartedTodayByTaskId,
      );
      const triggerServiceDecisionProposal = triggerKind === 'manual' && this.scheduledEventAgentTimelinePort
        ? await this.proposeScheduledEventTriggerServiceDisconnectedDecision(task, plan, now)
          .catch((error: unknown) => ({
            status: 'failed' as const,
            summary: `triggerServiceDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(error)}`,
          }))
        : null;
      return {
        status: 'blocked',
        plan,
        run: null,
        terminalRunEvidenceStatus: 'not_started',
        triggerRunEvidenceStatus: 'not_started',
        summary: [
          `${plan.summary} / trigger=blocked / triggerRunEvidenceStatus=not_started / reason=Scheduled event Agent trigger service is not connected.`,
          triggerServiceDecisionProposal
            ? `triggerServiceDecisionProposal=${triggerServiceDecisionProposal.status} / triggerServiceDecisionSummary=${triggerServiceDecisionProposal.summary}`
            : 'triggerServiceDecisionProposal=not_required',
        ].join(' / '),
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
      const runtimeStartBlockedDecisionProposal = triggerKind === 'manual'
        ? await this.proposeScheduledEventRuntimeStartBlockedDecision(task, plan, now)
        : null;
      return {
        status: 'blocked',
        plan,
        run: null,
        terminalRunEvidenceStatus: 'not_started',
        triggerRunEvidenceStatus: 'not_started',
        summary: [
          `${plan.summary} / trigger=blocked / triggerRunEvidenceStatus=not_started`,
          runtimeStartBlockedDecisionProposal ?? 'runtimeStartBlockedDecisionProposal=not_required',
        ].join(' / '),
      };
    }

    const run = await this.scheduledEventAgentRunPort.triggerCodeAgentRun(
      buildScheduledEventCodeAgentRunInput(task, plan, triggerKind),
    ).catch(async (error: unknown) => {
      const errorMessage = formatScheduledEventAgentSweepError(error);
      if (runIdentityMismatchHandling === 'throw_sweep_error') {
        throw buildScheduledEventAgentSweepError(
          errorMessage,
          { plan, run: null, task },
        );
      }

      const sweepFailureDecisionProposal = await this.proposeScheduledEventSweepFailureDecision(task, plan, errorMessage, now)
        .catch((proposalError: unknown) => ({
          status: 'failed' as const,
          summary: `sweepFailureDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(proposalError)}`,
        }));

      return {
        status: 'blocked' as const,
        plan,
        run: null,
        terminalRunEvidenceStatus: 'not_started' as const,
        triggerRunEvidenceStatus: 'not_started' as const,
        summary: [
          `${plan.summary} / trigger=blocked / triggerRunEvidenceStatus=not_started / reason=${errorMessage}`,
          `sweepFailureDecisionProposal=${sweepFailureDecisionProposal.status} / sweepFailureDecisionSummary=${sweepFailureDecisionProposal.summary}`,
        ].join(' / '),
      };
    });
    if ('plan' in run && 'terminalRunEvidenceStatus' in run) {
      return run;
    }
    if (run.taskId !== task.id) {
      const errorMessage = `Run target task mismatch: expected ${task.id} but received ${run.taskId}.`;
      if (runIdentityMismatchHandling === 'throw_sweep_error') {
        throw buildScheduledEventAgentSweepError(
          errorMessage,
          { plan, run, task },
        );
      }

      const terminalRunEvidenceStatus = scheduledEventRunTerminalEvidenceStatus(run);
      const triggerRunEvidenceStatus = scheduledEventTriggerRunEvidenceStatus(terminalRunEvidenceStatus);
      const runIdentityDecisionProposal = await this.proposeScheduledEventRunIdentityDecision(task, plan, run, errorMessage, now)
        .catch((error: unknown) => ({
          status: 'failed' as const,
          summary: `runIdentityDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(error)}`,
        }));

      return {
        status: 'blocked',
        plan,
        run,
        terminalRunEvidenceStatus,
        triggerRunEvidenceStatus,
        summary: [
          `${plan.summary} / trigger=blocked / runId=${run.id} / terminalRunEvidence=${terminalRunEvidenceStatus} / triggerRunEvidenceStatus=${triggerRunEvidenceStatus} / reason=${errorMessage}`,
          `runIdentityDecisionProposal=${runIdentityDecisionProposal.status} / runIdentityDecisionSummary=${runIdentityDecisionProposal.summary}`,
        ].join(' / '),
      };
    }
    const timelineEvidence = await this.recordScheduledEventAgentTriggered(task, plan, run, now, triggerKind)
      .catch(async (error: unknown) => {
        const errorMessage = `Timeline evidence failed: ${formatScheduledEventAgentSweepError(error)}`;
        if (runIdentityMismatchHandling === 'throw_sweep_error') {
          throw buildScheduledEventAgentSweepError(
            errorMessage,
            { plan, run, task },
          );
        }

        const terminalRunEvidenceStatus = scheduledEventRunTerminalEvidenceStatus(run);
        const triggerRunEvidenceStatus = scheduledEventTriggerRunEvidenceStatus(terminalRunEvidenceStatus);
        const timelineFailureDecisionProposal = await this.proposeScheduledEventTimelineFailureDecision(task, plan, run, errorMessage, now)
          .catch((proposalError: unknown) => ({
            status: 'failed' as const,
            summary: `timelineFailureDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(proposalError)}`,
          }));

        return {
          status: 'blocked' as const,
          plan,
          run,
          terminalRunEvidenceStatus,
          triggerRunEvidenceStatus,
          summary: [
            `${plan.summary} / trigger=blocked / runId=${run.id} / terminalRunEvidence=${terminalRunEvidenceStatus} / triggerRunEvidenceStatus=${triggerRunEvidenceStatus} / reason=${errorMessage}`,
            `timelineFailureDecisionProposal=${timelineFailureDecisionProposal.status} / timelineFailureDecisionSummary=${timelineFailureDecisionProposal.summary}`,
          ].join(' / '),
        };
      });
    if (typeof timelineEvidence !== 'string') {
      return timelineEvidence;
    }
    const terminalRunEvidenceStatus = scheduledEventRunTerminalEvidenceStatus(run);
    const triggerRunEvidenceStatus = scheduledEventTriggerRunEvidenceStatus(terminalRunEvidenceStatus);
    const failureDecisionProposal = run.status === 'failed'
      ? await this.proposeScheduledEventFailureDecision(task, plan, run, now).catch((error: unknown) => ({
          status: 'failed' as const,
          summary: `failureDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(error)}`,
        }))
      : null;
    const terminalEvidenceDecisionProposal = shouldProposeScheduledEventTerminalEvidenceDecision(run)
      ? await this.proposeScheduledEventTerminalEvidenceDecision(task, plan, run, now).catch((error: unknown) => ({
          status: 'failed' as const,
          summary: `terminalEvidenceDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(error)}`,
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
        terminalEvidenceDecisionProposal
          ? `terminalEvidenceDecisionProposal=${terminalEvidenceDecisionProposal.status} / terminalEvidenceDecisionSummary=${terminalEvidenceDecisionProposal.summary}`
          : 'terminalEvidenceDecisionProposal=not_required',
      ].join(' / '),
    };
  }

  private async proposeScheduledEventFailureDecision(
    task: ScheduledEventAgentTaskInput,
    plan: AgentScheduledEventTriggerPlan,
    run: RunRecord,
    now: Date,
  ): Promise<SchedulerDecisionProposalResult | { status: 'skipped_existing'; summary: string }> {
    const title = '确认定时/事件 Agent 失败后的下一步';
    if (hasSchedulerDecisionProposalSince(task, title, startOfUtcDay(now))) {
      return {
        status: 'skipped_existing',
        summary: 'failureDecisionProposal=skipped_existing',
      };
    }

    const terminalEvidenceStatus = scheduledEventRunTerminalEvidenceStatus(run);
    const terminalEvidenceMissing = terminalEvidenceStatus !== 'present';

    return this.proposeSchedulerDecision({
      evidenceRunId: run.id,
      businessLineId: task.businessLineId ?? null,
      options: [
        '暂停自动巡检并等待人工处理',
        '保留自动巡检但先修复失败原因',
        ...(terminalEvidenceMissing ? ['补录失败原因或终态输出证据'] : []),
      ],
      proposedOutcome: '暂停自动巡检并等待人工处理',
      rationale: [
        `Scheduled/event Agent run ${run.id} failed.`,
        run.failureReason ? `Failure reason: ${run.failureReason}` : null,
        terminalEvidenceMissing
          ? 'Terminal failure evidence is incomplete: neither reviewable output nor failureReason was recorded.'
          : null,
        'Taskplane should confirm the next recovery step before more background work continues.',
      ].filter(Boolean).join(' '),
      standingApprovalActive: Boolean(plan.policy?.id),
      standingApprovalPolicyId: plan.policy?.id ?? null,
      standingApprovalScopeTaskId: task.id,
      targetTaskId: task.id,
      title,
    });
  }

  private async proposeScheduledEventRuntimeStartBlockedDecision(
    task: ScheduledEventAgentTaskInput,
    plan: AgentScheduledEventTriggerPlan,
    now: Date,
  ): Promise<string | null> {
    const blockedResult: ScheduledEventAgentTriggerResult = {
      status: 'blocked',
      plan,
      run: null,
      terminalRunEvidenceStatus: 'not_started',
      triggerRunEvidenceStatus: 'not_started',
      summary: plan.summary,
    };

    if (isScheduledEventDailyRunLimitBlocked(blockedResult)) {
      const proposal = await this.proposeScheduledEventRunLimitDecision(task, plan, now)
        .catch((error: unknown) => ({
          status: 'failed' as const,
          summary: `runLimitDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(error)}`,
        }));
      return `runLimitDecisionProposal=${proposal.status} / runLimitDecisionSummary=${proposal.summary}`;
    }

    if (isScheduledEventAutomationReadinessBlocked(blockedResult)) {
      const proposal = await this.proposeScheduledEventReadinessBlockedDecision(task, plan, now)
        .catch((error: unknown) => ({
          status: 'failed' as const,
          summary: `readinessDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(error)}`,
        }));
      return `readinessDecisionProposal=${proposal.status} / readinessDecisionSummary=${proposal.summary}`;
    }

    if (isScheduledEventRunLimitAccountingBlocked(blockedResult)) {
      const proposal = await this.proposeScheduledEventRunLimitAccountingDecision(task, plan, now)
        .catch((error: unknown) => ({
          status: 'failed' as const,
          summary: `runLimitAccountingDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(error)}`,
        }));
      return `runLimitAccountingDecisionProposal=${proposal.status} / runLimitAccountingDecisionSummary=${proposal.summary}`;
    }

    return null;
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
      businessLineId: task.businessLineId ?? null,
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

  private async proposeScheduledEventTriggerServiceDisconnectedDecision(
    task: ScheduledEventAgentTaskInput,
    plan: AgentScheduledEventTriggerPlan,
    now: Date,
  ): Promise<SchedulerDecisionProposalResult | { status: 'skipped_existing'; summary: string }> {
    const title = '确认定时/事件 Agent 触发服务未连接后的下一步';
    if (hasSchedulerDecisionProposalSince(task, title, startOfUtcDay(now))) {
      return {
        status: 'skipped_existing',
        summary: 'triggerServiceDecisionProposal=skipped_existing',
      };
    }

    return this.proposeSchedulerDecision({
      businessLineId: task.businessLineId ?? null,
      options: [
        '暂停自动触发并修复触发服务',
        '人工启动一次受控 Agent run',
        '保留 Standing Approval 但跳过本次触发',
      ],
      proposedOutcome: '暂停自动触发并修复触发服务',
      rationale: [
        `Scheduled/event Agent trigger service is not connected for task ${task.id}.`,
        'Taskplane could not start the bounded background run even though the task and Standing Approval were otherwise evaluated.',
        'Taskplane should confirm whether to repair the trigger service, run manually, or skip this trigger window.',
      ].join(' '),
      standingApprovalActive: Boolean(plan.policy?.id),
      standingApprovalPolicyId: plan.policy?.id ?? null,
      standingApprovalScopeTaskId: task.id,
      targetTaskId: task.id,
      title,
    });
  }

  private async proposeScheduledEventTerminalEvidenceDecision(
    task: ScheduledEventAgentTaskInput,
    plan: AgentScheduledEventTriggerPlan,
    run: RunRecord,
    now: Date,
  ): Promise<SchedulerDecisionProposalResult | { status: 'skipped_existing'; summary: string }> {
    const title = '确认定时/事件 Agent 终态证据缺失后的下一步';
    if (hasSchedulerDecisionProposalSince(task, title, startOfUtcDay(now))) {
      return {
        status: 'skipped_existing',
        summary: 'terminalEvidenceDecisionProposal=skipped_existing',
      };
    }

    return this.proposeSchedulerDecision({
      evidenceRunId: run.id,
      businessLineId: task.businessLineId ?? null,
      options: [
        '人工复核 Run 并补录终态证据',
        '重新运行一次以生成可复核输出',
        '暂停自动巡检并修复输出采集',
      ],
      proposedOutcome: '人工复核 Run 并补录终态证据',
      rationale: [
        `Scheduled/event Agent run ${run.id} reached completed without reviewable terminal evidence.`,
        run.output?.trim() && !run.outputSource
          ? 'Run output was recorded without outputSource provenance.'
          : 'Neither reviewable output nor failure reason was recorded.',
        'Taskplane should confirm whether to recover evidence, rerun, or pause automation before treating the trigger as reviewable.',
      ].join(' '),
      standingApprovalActive: Boolean(plan.policy?.id),
      standingApprovalPolicyId: plan.policy?.id ?? null,
      standingApprovalScopeTaskId: task.id,
      targetTaskId: task.id,
      title,
    });
  }

  private async proposeScheduledEventRunLimitAccountingDecision(
    task: ScheduledEventAgentTaskInput,
    plan: AgentScheduledEventTriggerPlan,
    now: Date,
  ): Promise<SchedulerDecisionProposalResult | { status: 'skipped_existing'; summary: string }> {
    const title = '确认定时/事件 Agent 运行计数证据异常后的下一步';
    if (hasSchedulerDecisionProposalSince(task, title, startOfUtcDay(now))) {
      return {
        status: 'skipped_existing',
        summary: 'runLimitAccountingDecisionProposal=skipped_existing',
      };
    }

    return this.proposeSchedulerDecision({
      businessLineId: task.businessLineId ?? null,
      options: [
        '暂停自动巡检并修复运行计数证据',
        '人工复核今日运行记录后重试',
        '保留 Standing Approval 但跳过本次 sweep',
      ],
      proposedOutcome: '暂停自动巡检并修复运行计数证据',
      rationale: [
        `Scheduled/event Agent run-limit accounting is invalid for task ${task.id}.`,
        `Observed count: ${plan.runLimit.runsStartedToday ?? 'missing'}/${plan.runLimit.maxRunsPerDay ?? 'unknown'}.`,
        'Taskplane should confirm the run-count evidence before any background start can spend Standing Approval capacity.',
      ].join(' '),
      standingApprovalActive: Boolean(plan.policy?.id),
      standingApprovalPolicyId: plan.policy?.id ?? null,
      standingApprovalScopeTaskId: task.id,
      targetTaskId: task.id,
      title,
    });
  }

  private async proposeScheduledEventReadinessBlockedDecision(
    task: ScheduledEventAgentTaskInput,
    plan: AgentScheduledEventTriggerPlan,
    now: Date,
  ): Promise<SchedulerDecisionProposalResult | { status: 'skipped_existing'; summary: string }> {
    const title = '确认定时/事件 Agent readiness 阻塞后的下一步';
    if (hasSchedulerDecisionProposalSince(task, title, startOfUtcDay(now))) {
      return {
        status: 'skipped_existing',
        summary: 'readinessDecisionProposal=skipped_existing',
      };
    }

    const missingRequirements = plan.readiness.missingRequirements.length
      ? plan.readiness.missingRequirements.join(',')
      : 'unknown';

    return this.proposeSchedulerDecision({
      businessLineId: task.businessLineId ?? null,
      options: [
        '补齐任务上下文后下次 sweep 再运行',
        '暂停该任务的自动触发并人工处理',
        '保留自动触发但先调整任务准备条件',
      ],
      proposedOutcome: '补齐任务上下文后下次 sweep 再运行',
      rationale: [
        `Scheduled/event Agent readiness is blocked for task ${task.id}.`,
        `Missing requirements: ${missingRequirements}.`,
        'Taskplane should confirm whether to repair task context, pause automation, or adjust the preparation boundary before more background work continues.',
      ].join(' '),
      standingApprovalActive: Boolean(plan.policy?.id),
      standingApprovalPolicyId: plan.policy?.id ?? null,
      standingApprovalScopeTaskId: task.id,
      targetTaskId: task.id,
      title,
    });
  }

  private async proposeScheduledEventDuplicateCandidateDecision(
    task: ScheduledEventAgentTaskInput,
    plan: AgentScheduledEventTriggerPlan,
    duplicateTaskIds: string[],
    now: Date,
  ): Promise<SchedulerDecisionProposalResult | { status: 'skipped_existing'; summary: string }> {
    const title = '确认定时/事件 Agent 候选任务重复后的下一步';
    if (hasSchedulerDecisionProposalSince(task, title, startOfUtcDay(now))) {
      return {
        status: 'skipped_existing',
        summary: 'duplicateCandidateDecisionProposal=skipped_existing',
      };
    }

    return this.proposeSchedulerDecision({
      businessLineId: task.businessLineId ?? null,
      options: [
        '修复任务来源去重后下次 sweep 再运行',
        '保留本次首个 Run 并人工复核候选来源',
        '暂停该任务自动触发并检查调度规则',
      ],
      proposedOutcome: '修复任务来源去重后下次 sweep 再运行',
      rationale: [
        `Scheduled/event Agent sweep returned duplicate candidates for task ${task.id}.`,
        `Duplicate task ids: ${duplicateTaskIds.join(',') || task.id}.`,
        'Taskplane skipped duplicate candidates before runtime start so Standing Approval capacity is not spent twice in the same sweep.',
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
      businessLineId: task.businessLineId ?? null,
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

  private async proposeScheduledEventTimelineFailureDecision(
    task: ScheduledEventAgentTaskInput,
    plan: AgentScheduledEventTriggerPlan,
    run: RunRecord,
    errorMessage: string,
    now: Date,
  ): Promise<SchedulerDecisionProposalResult | { status: 'skipped_existing'; summary: string }> {
    const title = '确认定时/事件 Agent timeline 证据写入失败后的下一步';
    if (hasSchedulerDecisionProposalSince(task, title, startOfUtcDay(now))) {
      return {
        status: 'skipped_existing',
        summary: 'timelineFailureDecisionProposal=skipped_existing',
      };
    }

    return this.proposeSchedulerDecision({
      evidenceRunId: run.id,
      businessLineId: task.businessLineId ?? null,
      options: [
        '暂停自动触发并修复 timeline 证据写入',
        '保留已启动 Run 并人工补录证据',
        '等待 Run 终态后再人工复核',
      ],
      proposedOutcome: '暂停自动触发并修复 timeline 证据写入',
      rationale: [
        `Scheduled/event Agent started run ${run.id}, but timeline evidence failed for task ${task.id}.`,
        `Timeline error: ${errorMessage}.`,
        'Taskplane should confirm how to preserve recovery evidence before more background work continues.',
      ].join(' '),
      standingApprovalActive: Boolean(plan.policy?.id),
      standingApprovalPolicyId: plan.policy?.id ?? null,
      standingApprovalScopeTaskId: task.id,
      targetTaskId: task.id,
      title,
    });
  }

  private async proposeScheduledEventRunIdentityDecision(
    task: ScheduledEventAgentTaskInput,
    plan: AgentScheduledEventTriggerPlan,
    run: RunRecord,
    errorMessage: string,
    now: Date,
  ): Promise<SchedulerDecisionProposalResult | { status: 'skipped_existing'; summary: string }> {
    const title = '确认定时/事件 Agent Run 目标任务不一致后的下一步';
    if (hasSchedulerDecisionProposalSince(task, title, startOfUtcDay(now))) {
      return {
        status: 'skipped_existing',
        summary: 'runIdentityDecisionProposal=skipped_existing',
      };
    }

    return this.proposeSchedulerDecision({
      evidenceRunId: run.id,
      businessLineId: task.businessLineId ?? null,
      options: [
        '暂停自动触发并人工复核运行归属',
        '保留 Run 证据但重新生成目标任务运行',
        '修复触发服务的目标任务绑定后再运行',
      ],
      proposedOutcome: '暂停自动触发并人工复核运行归属',
      rationale: [
        `Scheduled/event Agent returned run ${run.id} for task ${run.taskId}, but the target task was ${task.id}.`,
        `Identity error: ${errorMessage}.`,
        'Taskplane should confirm how to preserve evidence before any background automation continues for this task.',
      ].join(' '),
      standingApprovalActive: Boolean(plan.policy?.id),
      standingApprovalPolicyId: plan.policy?.id ?? null,
      standingApprovalScopeTaskId: task.id,
      targetTaskId: task.id,
      title,
    });
  }

  private async proposeStaleRunRecoveryDecision(
    run: RunRecord,
  ): Promise<SchedulerDecisionProposalResult | { status: 'skipped_no_timeline'; summary: string } | { status: 'failed'; summary: string }> {
    if (!this.scheduledEventAgentTimelinePort) {
      return {
        status: 'skipped_no_timeline',
        summary: 'staleRunRecoveryDecisionProposal=skipped_no_timeline',
      };
    }

    return this.proposeSchedulerDecision({
      evidenceRunId: run.id,
      businessLineId: run.businessLineId ?? null,
      localRecoveryCompleted: true,
      localRecoveryRunId: run.id,
      localRecoveryTaskId: run.taskId,
      options: [
        '复核失败证据后手动重跑',
        '保持 failed 并补充 Task 记忆',
        '暂停相关自动化并人工调查',
      ],
      proposedOutcome: '复核失败证据后手动重跑',
      rationale: [
        `Scheduler recovered stale run ${run.id} for task ${run.taskId}.`,
        'The run was marked failed by local recovery without starting an Agent runtime.',
        'Taskplane should confirm whether to manually rerun, preserve memory, or pause related automation.',
      ].join(' '),
      targetTaskId: run.taskId,
      title: '确认 stale run 自动恢复后的下一步',
    }).catch((error: unknown) => ({
      status: 'failed' as const,
      summary: `staleRunRecoveryDecisionProposal=failed / reason=${formatScheduledEventAgentSweepError(error)}`,
    }));
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
        terminalRunEvidenceStatus: scheduledEventRunTerminalEvidenceStatus(run),
        triggerRunEvidenceStatus: scheduledEventTriggerRunEvidenceStatus(scheduledEventRunTerminalEvidenceStatus(run)),
        businessLineId: plan.businessLineLoop.businessLineId,
        businessLineLoopSummary: plan.businessLineLoop.summary,
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
    const recoveredRunIds: string[] = [];
    const decisionProposalSummaries: string[] = [];

    for (const run of staleRuns) {
      await this.runRepository.updateResult(
        run.id,
        'failed',
        run.output ?? 'Run 超过恢复窗口，已由本地 scheduler 标记为 failed。',
        'system',
        'Run exceeded the scheduler recovery window.',
      );
      recoveredRunIds.push(run.id);
      const proposal = await this.proposeStaleRunRecoveryDecision(run);
      decisionProposalSummaries.push(`${run.id}:${proposal.status}`);
    }

    this.lastRunSweepAt = new Date().toISOString();
    this.lastRunSweepSummary = [
      'schedulerStaleRunRecovery=completed',
      `checked=${staleRuns.length}`,
      `recovered=${recoveredRunIds.length}`,
      `recoveredRunIds=${recoveredRunIds.length ? recoveredRunIds.join(',') : 'none'}`,
      `staleRunRecoveryDecisionProposals=${decisionProposalSummaries.length ? decisionProposalSummaries.join(',') : 'none'}`,
      'failureReason=Run exceeded the scheduler recovery window.',
      'agentRuntimeStarted=no',
    ].join(' / ');
  }
}

function isTerminalScheduledEventRunStatus(status: RunRecord['status']): boolean {
  return status === 'completed' || status === 'failed';
}

function scheduledEventRunTerminalEvidenceStatus(run: RunRecord): ScheduledEventAgentTriggerResult['terminalRunEvidenceStatus'] {
  if (!isTerminalScheduledEventRunStatus(run.status)) return 'pending';
  if (run.failureReason?.trim()) return 'present';
  if (!run.output?.trim()) return 'pending';
  return run.outputSource ? 'present' : 'pending';
}

function shouldProposeScheduledEventTerminalEvidenceDecision(run: RunRecord): boolean {
  return run.status === 'completed' && scheduledEventRunTerminalEvidenceStatus(run) !== 'present';
}

function scheduledEventTriggerRunEvidenceStatus(
  terminalRunEvidenceStatus: ScheduledEventAgentTriggerResult['terminalRunEvidenceStatus'],
): ScheduledEventAgentTriggerResult['triggerRunEvidenceStatus'] {
  if (terminalRunEvidenceStatus === 'not_started') return 'not_started';
  return terminalRunEvidenceStatus === 'present'
    ? 'ready_for_terminal_review'
    : 'pending_terminal_run_evidence';
}
