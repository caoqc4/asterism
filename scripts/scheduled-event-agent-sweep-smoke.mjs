#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const distMain = path.join(root, 'dist-electron', 'main');

await assertBuiltModule(path.join(distMain, 'scheduler', 'scheduler-service.js'));

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-scheduled-event-agent-sweep-smoke-'));
const workspaceFile = path.join(tempRoot, 'TASK.md');

const { SchedulerService } = await import(fileUrl('scheduler/scheduler-service.js'));

try {
  await fs.writeFile(workspaceFile, 'Scheduled/event Agent sweep smoke fixture. Do not modify files.\n', 'utf8');
  const beforeWorkspace = await fs.readFile(workspaceFile, 'utf8');
  const run = {
    createdAt: '2026-05-26T00:00:00.000Z',
    failureReason: null,
    id: 'run_scheduled_event_sweep_smoke',
    instructions: null,
    output: null,
    outputSource: null,
    status: 'running',
    taskId: 'task_scheduled_event_sweep_smoke',
    type: 'agent',
    updatedAt: '2026-05-26T00:00:00.000Z',
  };
  const triggerCalls = [];
  const timelineEvents = [];
  const runRepository = {
    countCreatedSinceByTask: async () => ({ task_scheduled_event_sweep_smoke: 2 }),
    listIncompleteOlderThan: async () => [],
    updateResult: async () => null,
  };
  const service = new SchedulerService(
    {
      read: () => ({
        featureFlags: {
          enableScheduler: true,
        },
      }),
    },
    {
      getHomeData: async () => {
        throw new Error('Scheduled/event Agent sweep smoke should not build a Brief.');
      },
    },
    {
      create: async () => null,
    },
    runRepository,
    {
      getStatus: async () => buildReadyAiStatus(tempRoot),
      resolveRuntimeConfig: async () => {
        throw new Error('Scheduled/event Agent sweep smoke should not resolve API runtime config.');
      },
    },
    {
      execute: async () => {
        throw new Error('Scheduled/event Agent sweep smoke should not call a Brief executor.');
      },
    },
    {
      select: async () => ({ reason: 'not-used', selectedTemplates: [], shouldUse: false }),
    },
    {
      triggerCodeAgentRun: async (input) => {
        triggerCalls.push(input);
        return run;
      },
    },
    {
      recordTimelineEvent: async (input) => {
        timelineEvents.push(input);
      },
    },
    {
      listScheduledEventAgentTriggerCandidates: async () => {
        const task = buildReadyScheduledTask();
        return [task, task];
      },
    },
  );

  const result = await service.runScheduledEventAgentTriggerSweep(
    'manual',
    new Date('2026-05-26T11:00:00.000Z'),
  );
  const afterWorkspace = await fs.readFile(workspaceFile, 'utf8');

  assert(result.status === 'completed', 'sweep did not complete');
  assert(result.checkedTaskCount === 2, 'sweep did not check the duplicate scheduled task candidates');
  assert(result.startedRunCount === 1, 'sweep did not start exactly one bounded run');
  assert(result.blockedTaskCount === 1, 'sweep did not block the duplicate task after the daily limit was reached');
  assert(result.startedRunIds.includes(run.id), 'sweep did not expose started run ids in top-level evidence');
  assert(result.blockedReasons.includes('Scheduled/event trigger daily run limit reached: 3/3.'), 'sweep did not expose blocked reasons in top-level evidence');
  assert(result.runtimeStartMissingRequirements.includes('trigger_plan_ready'), 'sweep did not expose runtime-start missing requirements in top-level evidence');
  assert(result.terminalRunEvidenceMissingRunIds.includes(run.id), 'sweep did not expose missing terminal Run evidence in top-level evidence');
  assert(result.triggerRunEvidenceRequired.includes('context_readiness'), 'sweep did not expose trigger Run evidence requirements in top-level evidence');
  assert(result.triggerRunEvidenceStatus === 'pending_terminal_run_evidence', 'sweep did not expose pending trigger Run evidence status in top-level evidence');
  assert(result.summaries.join('\n').includes('daily run limit reached: 3/3'), 'sweep did not enforce the in-sweep daily run limit');
  assert(service.getStatus().lastScheduledEventAgentSweepSummary === result.summary, 'sweep did not persist the manual sweep summary into scheduler status');
  assert(triggerCalls.length === 1, 'sweep did not call the Code Agent trigger port exactly once');
  assert(triggerCalls[0].operatorConfirmed === true, 'sweep did not preserve Standing Approval as operator confirmation');
  assert(triggerCalls[0].useModelProducer === true, 'sweep did not route through the model-producer Code Agent path');
  assert(triggerCalls[0].patchIntent.includes('reviewable patch artifacts or proposals'), 'sweep did not preserve no-direct-write guidance');
  assert(triggerCalls[0].patchIntent.includes('Target task: task_scheduled_event_sweep_smoke.'), 'sweep did not pass target task identity into the bounded run');
  assert(triggerCalls[0].patchIntent.includes('Trigger kind: manual.'), 'sweep did not pass manual trigger kind into the bounded run');
  assert(triggerCalls[0].patchIntent.includes('Task memory guidance: process=Scheduled/event sweep smoke SOP; openCriteria=1; firstCriterion=Review the scheduled/event Agent sweep smoke result.; sourceContexts=1; firstSource=Scheduled/event source digest'), 'sweep did not pass task-memory guidance into the bounded run');
  assert(triggerCalls[0].patchIntent.includes('Standing Approval policy: standing_approval:task_scheduled_event_sweep_smoke:coding:local_sandbox.'), 'sweep did not pass Standing Approval policy evidence into the bounded run');
  assert(triggerCalls[0].patchIntent.includes('Standing Approval scope: autonomy=L2_limited_authorized_action; riskCeiling=low; maxRunsPerDay=3; reason=Allow bounded scheduled/event Agent sweep smoke execution.'), 'sweep did not pass Standing Approval scope evidence into the bounded run');
  assert(triggerCalls[0].patchIntent.includes('Runtime start requirements: trigger_plan_ready,scheduler_trigger_service,run_limit_count.'), 'sweep did not pass runtime-start requirements into the bounded run');
  assert(triggerCalls[0].patchIntent.includes('Trigger evidence: context_readiness,target_task_identity,task_memory_coverage,task_memory_guidance,subtask_start,run_limit_count,post_step.'), 'sweep did not pass the trigger Run evidence contract into the bounded run');
  assert(triggerCalls[0].patchIntent.includes('Run limit: 2/3.'), 'sweep did not pass persisted run-limit state into the bounded run');
  assert(triggerCalls[0].patchIntent.includes('Post-step evidence: return terminal run output for Taskplane review.'), 'sweep did not pass post-step terminal evidence guidance into the bounded run');
  assert(triggerCalls[0].patchIntent.includes('Workspace write boundary: workspaceWriteAllowed=false; proposals only.'), 'sweep did not pass workspace-write boundary into the bounded run');
  assert(timelineEvents.length === 1, 'sweep did not record trigger timeline evidence');
  assert(timelineEvents[0].type === 'panel.scheduled_event_agent_triggered', 'sweep recorded the wrong timeline event type');
  assert(timelineEvents[0].payload.runId === run.id, 'timeline evidence did not preserve the run id');
  assert(timelineEvents[0].payload.runStatus === 'running', 'timeline evidence did not preserve the run status returned by the trigger port');
  assert(timelineEvents[0].payload.runOutputSource === null, 'timeline evidence did not preserve the run output source returned by the trigger port');
  assert(timelineEvents[0].payload.runFailureReason === null, 'timeline evidence did not preserve the run failure reason returned by the trigger port');
  assert(timelineEvents[0].payload.targetTaskId === 'task_scheduled_event_sweep_smoke', 'timeline evidence did not preserve the target task id');
  assert(timelineEvents[0].payload.standingApprovalPolicyId === 'standing_approval:task_scheduled_event_sweep_smoke:coding:local_sandbox', 'timeline evidence did not preserve the Standing Approval policy id');
  assert(timelineEvents[0].payload.triggerKind === 'manual', 'timeline evidence did not preserve manual trigger kind');
  assert(timelineEvents[0].payload.runtimeStartAllowed === true, 'timeline evidence did not preserve runtimeStartAllowed=true');
  assert(timelineEvents[0].payload.workspaceWriteAllowed === false, 'timeline evidence did not preserve workspaceWriteAllowed=false');
  assert(Array.isArray(timelineEvents[0].payload.runtimeStartMissingRequirements), 'timeline evidence did not preserve runtime-start missing requirements');
  assert(timelineEvents[0].payload.runtimeStartMissingRequirements.length === 0, 'timeline evidence did not preserve empty runtime-start missing requirements');
  assert(Array.isArray(timelineEvents[0].payload.runtimeStartSatisfiedRequirements), 'timeline evidence did not preserve runtime-start satisfied requirements');
  assert(timelineEvents[0].payload.runtimeStartSatisfiedRequirements.includes('trigger_plan_ready'), 'timeline evidence did not preserve trigger-plan runtime-start requirement');
  assert(timelineEvents[0].payload.runtimeStartSatisfiedRequirements.includes('scheduler_trigger_service'), 'timeline evidence did not preserve scheduler-service runtime-start requirement');
  assert(timelineEvents[0].payload.runtimeStartSatisfiedRequirements.includes('run_limit_count'), 'timeline evidence did not preserve run-limit runtime-start requirement');
  assert(timelineEvents[0].payload.triggeredAt === '2026-05-26T11:00:00.000Z', 'timeline evidence did not preserve the scheduler trigger time');
  assert(timelineEvents[0].payload.runLimit?.runsStartedToday === 2, 'timeline evidence did not preserve the persisted run-limit count');
  assert(timelineEvents[0].payload.runLimit?.maxRunsPerDay === 3, 'timeline evidence did not preserve the Standing Approval run limit');
  assert(beforeWorkspace === afterWorkspace, 'scheduled/event Agent sweep smoke mutated the workspace fixture');

  const terminalRun = {
    ...run,
    failureReason: null,
    id: 'run_scheduled_event_sweep_terminal_smoke',
    output: 'Scheduled/event terminal sweep smoke completed.',
    outputSource: 'system',
    status: 'completed',
  };
  const terminalTriggerCalls = [];
  const terminalTimelineEvents = [];
  const terminalService = new SchedulerService(
    {
      read: () => ({
        featureFlags: {
          enableScheduler: true,
        },
      }),
    },
    {
      getHomeData: async () => {
        throw new Error('Scheduled/event Agent terminal sweep smoke should not build a Brief.');
      },
    },
    {
      create: async () => null,
    },
    {
      countCreatedSinceByTask: async () => ({ task_scheduled_event_sweep_smoke: 1 }),
      listIncompleteOlderThan: async () => [],
      updateResult: async () => null,
    },
    {
      getStatus: async () => buildReadyAiStatus(tempRoot),
      resolveRuntimeConfig: async () => {
        throw new Error('Scheduled/event Agent terminal sweep smoke should not resolve API runtime config.');
      },
    },
    {
      execute: async () => {
        throw new Error('Scheduled/event Agent terminal sweep smoke should not call a Brief executor.');
      },
    },
    {
      select: async () => ({ reason: 'not-used', selectedTemplates: [], shouldUse: false }),
    },
    {
      triggerCodeAgentRun: async (input) => {
        terminalTriggerCalls.push(input);
        return terminalRun;
      },
    },
    {
      recordTimelineEvent: async (input) => {
        terminalTimelineEvents.push(input);
      },
    },
    {
      listScheduledEventAgentTriggerCandidates: async () => [buildReadyScheduledTask()],
    },
  );

  const terminalResult = await terminalService.runScheduledEventAgentTriggerSweep(
    'manual',
    new Date('2026-05-26T12:00:00.000Z'),
  );
  const terminalAfterWorkspace = await fs.readFile(workspaceFile, 'utf8');

  assert(terminalResult.status === 'completed', 'terminal sweep did not complete');
  assert(terminalResult.checkedTaskCount === 1, 'terminal sweep did not check exactly one scheduled task');
  assert(terminalResult.startedRunCount === 1, 'terminal sweep did not start exactly one bounded run');
  assert(terminalResult.blockedTaskCount === 0, 'terminal sweep unexpectedly blocked the ready task');
  assert(terminalResult.startedRunIds.includes(terminalRun.id), 'terminal sweep did not expose the terminal run id');
  assert(terminalResult.terminalRunEvidenceMissingRunIds.length === 0, 'terminal sweep reported missing terminal Run evidence for a completed run');
  assert(terminalResult.triggerRunEvidenceStatus === 'ready_for_terminal_review', 'terminal sweep did not expose ready trigger Run evidence status');
  assert(terminalService.getStatus().lastScheduledEventAgentSweepSummary === terminalResult.summary, 'terminal sweep did not persist the sweep summary into scheduler status');
  assert(terminalTriggerCalls.length === 1, 'terminal sweep did not call the Code Agent trigger port exactly once');
  assert(terminalTimelineEvents.length === 1, 'terminal sweep did not record terminal trigger timeline evidence');
  assert(terminalTimelineEvents[0].payload.runId === terminalRun.id, 'terminal timeline evidence did not preserve the terminal run id');
  assert(terminalTimelineEvents[0].payload.runStatus === 'completed', 'terminal timeline evidence did not preserve completed run status');
  assert(terminalTimelineEvents[0].payload.runOutputSource === 'system', 'terminal timeline evidence did not preserve completed run output source');
  assert(terminalTimelineEvents[0].payload.terminalRunEvidenceStatus === 'present', 'terminal timeline evidence did not mark terminal Run evidence present');
  assert(terminalTimelineEvents[0].payload.triggerRunEvidenceStatus === 'ready_for_terminal_review', 'terminal timeline evidence did not mark trigger evidence ready for review');
  assert(terminalTimelineEvents[0].payload.triggerKind === 'manual', 'terminal timeline evidence did not preserve manual trigger kind');
  assert(terminalTimelineEvents[0].payload.workspaceWriteAllowed === false, 'terminal timeline evidence did not preserve workspaceWriteAllowed=false');
  assert(beforeWorkspace === terminalAfterWorkspace, 'scheduled/event Agent terminal sweep smoke mutated the workspace fixture');

  const cronRun = {
    ...terminalRun,
    failureReason: 'Scheduled/event cron smoke reached a terminal failure for operator review.',
    id: 'run_scheduled_event_sweep_cron_smoke',
    output: 'Scheduled/event cron sweep smoke failed in a controlled terminal state.',
    status: 'failed',
  };
  const cronTriggerCalls = [];
  const cronTimelineEvents = [];
  const cronService = new SchedulerService(
    {
      read: () => ({
        featureFlags: {
          enableScheduler: true,
        },
      }),
    },
    {
      getHomeData: async () => {
        throw new Error('Scheduled/event Agent cron sweep smoke should not build a Brief.');
      },
    },
    {
      create: async () => null,
    },
    {
      countCreatedSinceByTask: async () => ({ task_scheduled_event_sweep_smoke: 0 }),
      listIncompleteOlderThan: async () => [],
      updateResult: async () => null,
    },
    {
      getStatus: async () => buildReadyAiStatus(tempRoot),
      resolveRuntimeConfig: async () => {
        throw new Error('Scheduled/event Agent cron sweep smoke should not resolve API runtime config.');
      },
    },
    {
      execute: async () => {
        throw new Error('Scheduled/event Agent cron sweep smoke should not call a Brief executor.');
      },
    },
    {
      select: async () => ({ reason: 'not-used', selectedTemplates: [], shouldUse: false }),
    },
    {
      triggerCodeAgentRun: async (input) => {
        cronTriggerCalls.push(input);
        return cronRun;
      },
    },
    {
      recordTimelineEvent: async (input) => {
        cronTimelineEvents.push(input);
      },
    },
    {
      listScheduledEventAgentTriggerCandidates: async () => [buildReadyScheduledTask()],
    },
  );

  const cronResult = await cronService.runScheduledEventAgentTriggerSweep(
    'cron',
    new Date('2026-05-26T12:15:00.000Z'),
  );
  const cronAfterWorkspace = await fs.readFile(workspaceFile, 'utf8');

  assert(cronResult.status === 'completed', 'cron sweep did not complete');
  assert(cronResult.summary.includes('scheduledEventAgentSweep=cron'), 'cron sweep summary did not preserve cron kind');
  assert(cronResult.startedRunIds.includes(cronRun.id), 'cron sweep did not expose the cron run id');
  assert(cronResult.runFailureReasons.includes(`${cronRun.id}: ${cronRun.failureReason}`), 'cron sweep did not expose terminal failure reason evidence');
  assert(cronResult.summary.includes(`runFailureReasons=${cronRun.id}: ${cronRun.failureReason}`), 'cron sweep summary did not preserve terminal failure reason evidence');
  assert(cronResult.triggerRunEvidenceStatus === 'ready_for_terminal_review', 'cron sweep did not expose ready trigger Run evidence status');
  assert(cronService.getStatus().lastScheduledEventAgentSweepSummary === cronResult.summary, 'cron sweep did not persist the sweep summary into scheduler status');
  assert(cronTriggerCalls.length === 1, 'cron sweep did not call the Code Agent trigger port exactly once');
  assert(cronTriggerCalls[0].patchIntent.includes('Target task: task_scheduled_event_sweep_smoke.'), 'cron sweep did not pass target task identity into the bounded run');
  assert(cronTriggerCalls[0].patchIntent.includes('Trigger kind: cron.'), 'cron sweep did not pass cron trigger kind into the bounded run');
  assert(cronTriggerCalls[0].patchIntent.includes('Task memory guidance: process=Scheduled/event sweep smoke SOP; openCriteria=1; firstCriterion=Review the scheduled/event Agent sweep smoke result.; sourceContexts=1; firstSource=Scheduled/event source digest'), 'cron sweep did not pass task-memory guidance into the bounded run');
  assert(cronTriggerCalls[0].patchIntent.includes('Standing Approval scope: autonomy=L2_limited_authorized_action; riskCeiling=low; maxRunsPerDay=3; reason=Allow bounded scheduled/event Agent sweep smoke execution.'), 'cron sweep did not pass Standing Approval scope evidence into the bounded run');
  assert(cronTriggerCalls[0].patchIntent.includes('Post-step evidence: return terminal run output for Taskplane review.'), 'cron sweep did not pass post-step terminal evidence guidance into the bounded run');
  assert(cronTriggerCalls[0].patchIntent.includes('Workspace write boundary: workspaceWriteAllowed=false; proposals only.'), 'cron sweep did not pass workspace-write boundary into the bounded run');
  assert(cronTimelineEvents.length === 1, 'cron sweep did not record trigger timeline evidence');
  assert(cronTimelineEvents[0].payload.runId === cronRun.id, 'cron timeline evidence did not preserve the cron run id');
  assert(cronTimelineEvents[0].payload.runFailureReason === cronRun.failureReason, 'cron timeline evidence did not preserve the terminal failure reason');
  assert(cronTimelineEvents[0].payload.runStatus === 'failed', 'cron timeline evidence did not preserve failed run status');
  assert(cronTimelineEvents[0].payload.triggeredAt === '2026-05-26T12:15:00.000Z', 'cron timeline evidence did not preserve the cron trigger time');
  assert(cronTimelineEvents[0].payload.terminalRunEvidenceStatus === 'present', 'cron timeline evidence did not mark terminal Run evidence present');
  assert(cronTimelineEvents[0].payload.triggerKind === 'cron', 'cron timeline evidence did not preserve cron trigger kind');
  assert(cronTimelineEvents[0].payload.workspaceWriteAllowed === false, 'cron timeline evidence did not preserve workspaceWriteAllowed=false');
  assert(beforeWorkspace === cronAfterWorkspace, 'scheduled/event Agent cron sweep smoke mutated the workspace fixture');

  const disconnectedService = new SchedulerService(
    {
      read: () => ({
        featureFlags: {
          enableScheduler: true,
        },
      }),
    },
    {
      getHomeData: async () => {
        throw new Error('Scheduled/event Agent disconnected sweep smoke should not build a Brief.');
      },
    },
    {
      create: async () => null,
    },
    {
      countCreatedSinceByTask: async () => {
        throw new Error('Scheduled/event Agent disconnected sweep smoke should not count runs.');
      },
      listIncompleteOlderThan: async () => [],
      updateResult: async () => null,
    },
    {
      getStatus: async () => buildReadyAiStatus(tempRoot),
      resolveRuntimeConfig: async () => {
        throw new Error('Scheduled/event Agent disconnected sweep smoke should not resolve API runtime config.');
      },
    },
    {
      execute: async () => {
        throw new Error('Scheduled/event Agent disconnected sweep smoke should not call a Brief executor.');
      },
    },
    {
      select: async () => ({ reason: 'not-used', selectedTemplates: [], shouldUse: false }),
    },
  );
  const disconnectedResult = await disconnectedService.runScheduledEventAgentTriggerSweep(
    'cron',
    new Date('2026-05-26T12:20:00.000Z'),
  );
  assert(disconnectedResult.status === 'skipped', 'disconnected sweep should skip');
  assert(disconnectedResult.skipReason === 'ports_not_connected', 'disconnected sweep did not report ports_not_connected');
  assert(disconnectedResult.triggerRunEvidenceStatus === 'not_started', 'disconnected sweep should not start trigger Run evidence');
  assert(disconnectedResult.blockedReasons.includes('ports_not_connected'), 'disconnected sweep did not expose ports_not_connected as a blocked reason');
  assert(disconnectedResult.runtimeStartMissingRequirements.includes('scheduler_trigger_service'), 'disconnected sweep did not expose scheduler trigger service as a missing runtime-start requirement');
  assert(disconnectedResult.summary.includes('missingPorts=run_port,timeline_port,task_source_port'), 'disconnected sweep did not expose missing ports');
  assert(disconnectedService.getStatus().lastScheduledEventAgentSweepAt === '2026-05-26T12:20:00.000Z', 'disconnected sweep did not preserve skipped sweep time in scheduler status');
  assert(disconnectedService.getStatus().lastScheduledEventAgentSweepSummary === disconnectedResult.summary, 'disconnected sweep did not persist the skipped sweep summary into scheduler status');

  let releaseInFlightCandidates;
  const inFlightCandidatePromise = new Promise((resolve) => {
    releaseInFlightCandidates = () => resolve([]);
  });
  const inFlightTriggerCalls = [];
  const inFlightService = new SchedulerService(
    {
      read: () => ({
        featureFlags: {
          enableScheduler: true,
        },
      }),
    },
    {
      getHomeData: async () => {
        throw new Error('Scheduled/event Agent in-flight sweep smoke should not build a Brief.');
      },
    },
    {
      create: async () => null,
    },
    {
      countCreatedSinceByTask: async () => ({}),
      listIncompleteOlderThan: async () => [],
      updateResult: async () => null,
    },
    {
      getStatus: async () => buildReadyAiStatus(tempRoot),
      resolveRuntimeConfig: async () => {
        throw new Error('Scheduled/event Agent in-flight sweep smoke should not resolve API runtime config.');
      },
    },
    {
      execute: async () => {
        throw new Error('Scheduled/event Agent in-flight sweep smoke should not call a Brief executor.');
      },
    },
    {
      select: async () => ({ reason: 'not-used', selectedTemplates: [], shouldUse: false }),
    },
    {
      triggerCodeAgentRun: async (input) => {
        inFlightTriggerCalls.push(input);
        return run;
      },
    },
    {
      recordTimelineEvent: async () => {
        throw new Error('Scheduled/event Agent in-flight skip smoke should not record a second timeline event.');
      },
    },
    {
      listScheduledEventAgentTriggerCandidates: async () => inFlightCandidatePromise,
    },
  );
  const firstInFlightSweep = inFlightService.runScheduledEventAgentTriggerSweep(
    'cron',
    new Date('2026-05-26T12:25:00.000Z'),
  );
  const inFlightResult = await inFlightService.runScheduledEventAgentTriggerSweep(
    'cron',
    new Date('2026-05-26T12:25:01.000Z'),
  );
  assert(inFlightResult.status === 'skipped', 'in-flight sweep should skip');
  assert(inFlightResult.skipReason === 'in_flight', 'in-flight sweep did not report in_flight');
  assert(inFlightResult.triggerRunEvidenceStatus === 'not_started', 'in-flight sweep should not start trigger Run evidence');
  assert(inFlightResult.blockedReasons.includes('in_flight'), 'in-flight sweep did not expose in_flight as a blocked reason');
  assert(inFlightService.getStatus().lastScheduledEventAgentSweepAt === '2026-05-26T12:25:01.000Z', 'in-flight sweep did not preserve skipped sweep time in scheduler status');
  assert(inFlightService.getStatus().lastScheduledEventAgentSweepSummary === inFlightResult.summary, 'in-flight sweep did not persist the skipped sweep summary into scheduler status');
  const inFlightSkippedAt = inFlightService.getStatus().lastScheduledEventAgentSweepAt;
  releaseInFlightCandidates();
  const completedInFlightSweep = await firstInFlightSweep;
  assert(completedInFlightSweep.status === 'completed', 'first in-flight sweep did not finish after the guard was released');
  assert(completedInFlightSweep.startedRunCount === 0, 'first in-flight sweep unexpectedly started a run');
  assert(inFlightTriggerCalls.length === 0, 'in-flight guard smoke unexpectedly started a Code Agent run');

  const startupService = new SchedulerService(
    {
      read: () => ({
        featureFlags: {
          enableScheduler: true,
        },
      }),
    },
    {
      getHomeData: async () => ({
        activeTaskCount: 0,
        at: '2026-05-26T12:30:00.000Z',
        blockedTaskCount: 0,
        briefAttention: null,
        briefFocusTasks: [],
        capturedTaskCount: 0,
        completedTaskCount: 0,
        decisions: [],
        dependencies: [],
        externalSignals: [],
        focusTasks: [],
        highRiskTaskCount: 0,
        highRiskTasks: [],
        missingNextStepTaskCount: 0,
        pendingDecisionCount: 0,
        pendingDecisions: [],
        processTemplateCandidates: [],
        priorityHeadline: 'Scheduled/event startup wiring smoke.',
        priorityLede: 'No work should start before the cron tick.',
        recentActivity: [],
        recentArtifacts: [],
        recentBriefSnapshots: [],
        recentRunCount: 0,
        recentSourceContexts: [],
        recentTaskResumes: [],
        recentTasks: [],
        risks: [],
        schedulerStatus: {
          enabled: true,
          lastBriefAt: null,
          lastRunSweepAt: null,
          lastScheduledEventAgentSweepAt: null,
          lastScheduledEventAgentSweepSummary: null,
          running: false,
          scheduledEventAgentSweepJobConnected: false,
        },
        waitingTasks: [],
        waitingItems: [],
        waitingTaskCount: 0,
      }),
    },
    {
      create: async () => null,
    },
    {
      countCreatedSinceByTask: async () => ({}),
      listIncompleteOlderThan: async () => [],
      updateResult: async () => null,
    },
    {
      getStatus: async () => buildReadyAiStatus(tempRoot),
      resolveRuntimeConfig: async () => {
        throw new Error('Scheduled/event Agent startup wiring smoke should not require API runtime config.');
      },
    },
    {
      execute: async () => {
        throw new Error('Scheduled/event Agent startup wiring smoke should not call a Brief executor.');
      },
    },
    {
      select: async () => ({ reason: 'not-used', selectedTemplates: [], shouldUse: false }),
    },
    {
      triggerCodeAgentRun: async () => {
        throw new Error('Scheduled/event Agent startup wiring smoke should not start a run before the cron tick.');
      },
    },
    {
      recordTimelineEvent: async () => {
        throw new Error('Scheduled/event Agent startup wiring smoke should not record trigger timeline before the cron tick.');
      },
    },
    {
      listScheduledEventAgentTriggerCandidates: async () => {
        throw new Error('Scheduled/event Agent startup wiring smoke should not list candidates before the cron tick.');
      },
    },
  );
  await startupService.start();
  const startupStatus = startupService.getStatus();
  assert(startupStatus.running === true, 'startup wiring smoke did not mark scheduler running');
  assert(startupStatus.scheduledEventAgentSweepJobConnected === true, 'startup wiring smoke did not expose scheduled/event sweep job connection');
  assert(startupStatus.lastScheduledEventAgentSweepAt === null, 'startup wiring smoke should not claim a sweep ran before the cron tick');
  startupService.stop();

  console.log([
    'Scheduled/event Agent sweep smoke: ready',
    `status=${result.status}`,
    `skipReason=${result.skipReason}`,
    `checked=${result.checkedTaskCount}`,
    `started=${result.startedRunCount}`,
    `blocked=${result.blockedTaskCount}`,
    `runId=${run.id}`,
    `startedRunIds=${result.startedRunIds.join(',')}`,
    `blockedReasons=${result.blockedReasons.join(';')}`,
    `runFailureReasons=${result.runFailureReasons.join(';') || 'none'}`,
    `runtimeStartMissingRequirements=${result.runtimeStartMissingRequirements.join(',')}`,
    `terminalRunEvidenceMissingRunIds=${result.terminalRunEvidenceMissingRunIds.join(',')}`,
    `triggerRunEvidenceRequired=${result.triggerRunEvidenceRequired.join(',')}`,
    `triggerRunEvidenceStatus=${result.triggerRunEvidenceStatus}`,
    `manualSweepSummary=${service.getStatus().lastScheduledEventAgentSweepSummary}`,
    'boundedRunTargetTask=passed',
    'boundedRunTaskMemoryGuidance=passed',
    'boundedRunFirstCriterion=passed',
    'boundedRunFirstSource=passed',
    'boundedRunPostStepGuidance=passed',
    'boundedRunWorkspaceWriteBoundary=passed',
    'boundedRunStandingApprovalScope=passed',
    `manualTriggerKind=${timelineEvents[0].payload.triggerKind}`,
    `terminalStatus=${terminalResult.status}`,
    `terminalRunId=${terminalRun.id}`,
    `terminalTriggerRunEvidenceStatus=${terminalResult.triggerRunEvidenceStatus}`,
    `terminalTriggerKind=${terminalTimelineEvents[0].payload.triggerKind}`,
    `terminalRunEvidenceMissingRunIds=${terminalResult.terminalRunEvidenceMissingRunIds.join(',') || 'none'}`,
    `terminalSweepSummary=${terminalService.getStatus().lastScheduledEventAgentSweepSummary}`,
    `cronStatus=${cronResult.status}`,
    `cronRunId=${cronRun.id}`,
    `cronTriggerRunEvidenceStatus=${cronResult.triggerRunEvidenceStatus}`,
    `cronTriggerKind=${cronTimelineEvents[0].payload.triggerKind}`,
    `cronRunFailureReasons=${cronResult.runFailureReasons.join(';') || 'none'}`,
    `cronSweepSummary=${cronService.getStatus().lastScheduledEventAgentSweepSummary}`,
    `disconnectedStatus=${disconnectedResult.status}`,
    `disconnectedSkipReason=${disconnectedResult.skipReason}`,
    `disconnectedTriggerRunEvidenceStatus=${disconnectedResult.triggerRunEvidenceStatus}`,
    `disconnectedSweepAt=${disconnectedService.getStatus().lastScheduledEventAgentSweepAt}`,
    `disconnectedSweepSummary=${disconnectedService.getStatus().lastScheduledEventAgentSweepSummary}`,
    `inFlightStatus=${inFlightResult.status}`,
    `inFlightSkipReason=${inFlightResult.skipReason}`,
    `inFlightTriggerRunEvidenceStatus=${inFlightResult.triggerRunEvidenceStatus}`,
    `inFlightSweepAt=${inFlightSkippedAt}`,
    `inFlightSweepSummary=${inFlightResult.summary}`,
    `startupSweepJobConnected=${startupStatus.scheduledEventAgentSweepJobConnected ? 'yes' : 'no'}`,
    'duplicateRunLimit=blocked',
    'triggerRunEvidence=passed',
    'terminalTriggerRunEvidence=passed',
    'cronTriggerRunEvidence=passed',
    'cronRunFailureReasonEvidence=passed',
    'runLimitEvidence=passed',
    'runtimeStartRequirements=passed',
    'timelineEvidence=recorded',
    'terminalTimelineEvidence=recorded',
    'cronTimelineEvidence=recorded',
    'timelineWorkspaceBoundary=recorded',
    'terminalTimelineWorkspaceBoundary=recorded',
    'cronTimelineWorkspaceBoundary=recorded',
    'startupSweepJobEvidence=recorded',
    'sweepSummaryEvidence=recorded',
    'disconnectedSweepSummaryEvidence=recorded',
    'inFlightSweepSummaryEvidence=recorded',
    'skippedSweepTimeEvidence=recorded',
    'runStatusEvidence=recorded',
    'terminalRunStatusEvidence=recorded',
    'cronRunStatusEvidence=recorded',
    'triggerKindEvidence=passed',
    'boundedRunTargetTaskEvidence=passed',
    'boundedRunTaskMemoryEvidence=passed',
    'boundedRunFirstCriterionEvidence=passed',
    'boundedRunFirstSourceEvidence=passed',
    'boundedRunPostStepEvidence=passed',
    'boundedRunWorkspaceBoundaryEvidence=passed',
    'boundedRunStandingApprovalScopeEvidence=passed',
    'workspace=unchanged',
    'provider=not-called',
    'docker=not-started',
  ].join(' / '));
} finally {
  await fs.rm(tempRoot, { force: true, recursive: true });
}

function buildReadyScheduledTask() {
  const taskId = 'task_scheduled_event_sweep_smoke';

  return {
    activeBlocker: null,
    activeDependency: null,
    activeWaitingItem: null,
    completionCriteria: [{
      createdAt: '2026-05-26T00:00:00.000Z',
      id: 'criterion_scheduled_event_sweep_smoke',
      satisfiedAt: null,
      status: 'open',
      taskId,
      text: 'Review the scheduled/event Agent sweep smoke result.',
      updatedAt: '2026-05-26T00:00:00.000Z',
      verificationResponsibility: null,
      verificationResponsibilityLabel: null,
    }],
    id: taskId,
    nextStep: 'Prepare one bounded scheduled/event sweep smoke update.',
    processTemplates: [{
      archivedAt: null,
      bindingId: 'binding_scheduled_event_sweep_smoke',
      bindingNote: null,
      bindingStatus: 'active',
      bindingUpdatedAt: '2026-05-26T00:00:00.000Z',
      boundAt: '2026-05-26T00:00:00.000Z',
      content: 'Prepare one bounded update and leave durable evidence.',
      createdAt: '2026-05-26T00:00:00.000Z',
      id: 'process_scheduled_event_sweep_smoke',
      kind: 'sop',
      removedAt: null,
      status: 'active',
      summary: null,
      tags: [],
      taskId,
      title: 'Scheduled/event sweep smoke SOP',
      updatedAt: '2026-05-26T00:00:00.000Z',
    }],
    riskLevel: 'low',
    sourceContexts: [{
      archivedAt: null,
      capturedAt: '2026-05-26T00:00:00.000Z',
      content: 'Use this stable source when preparing the scheduled update.',
      createdAt: '2026-05-26T00:00:00.000Z',
      credibility: 'verified',
      id: 'source_context_scheduled_event_sweep_smoke',
      isKey: true,
      kind: 'doc',
      note: null,
      sourceRole: 'stable_reference',
      status: 'active',
      taskId,
      title: 'Scheduled/event source digest',
      updatedAt: '2026-05-26T00:00:00.000Z',
      uri: null,
    }],
    state: 'planned',
    summary: 'Known scheduled/event Agent sweep smoke task.',
    taskFacets: ['scheduled', 'routine'],
    taskType: 'routine',
    timeline: [{
      createdAt: '2026-05-26T10:05:00.000Z',
      id: 'timeline_scheduled_event_sweep_standing_approval',
      payload: JSON.stringify({
        policy: {
          allowedAutonomyLevel: 'L2_limited_authorized_action',
          allowedLanes: ['coding'],
          allowedRuntimeIds: ['local_sandbox'],
          createdAt: '2026-05-26T10:00:00.000Z',
          expiresAt: '2026-05-27T10:00:00.000Z',
          id: `standing_approval:${taskId}:coding:local_sandbox`,
          maxRunsPerDay: 3,
          reason: 'Allow bounded scheduled/event Agent sweep smoke execution.',
          riskCeiling: 'low',
          status: 'active',
          taskFacets: ['scheduled'],
          taskId,
          taskTypes: ['routine'],
        },
        schedulerTriggerAllowed: false,
        workspaceWriteAllowed: false,
      }),
      taskId,
      type: 'panel.standing_approval_confirmed',
    }],
    waitingReason: null,
  };
}

function buildReadyAiStatus(workspaceRoot) {
  return {
    featureFlags: {
      enableSandboxCodingAgent: true,
      enableScheduler: true,
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
      producerBackendReadiness: {
        blockedReasons: [],
        ready: true,
        summary: 'Producer ready.',
      },
      readiness: {
        blockedReasons: [],
        ready: true,
        summary: 'Sandbox ready.',
      },
      summary: 'Sandbox ready.',
    },
    toolScaffoldSummaries: [],
    workspaceRoot,
  };
}

async function assertBuiltModule(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error('Run npm run build:main before the scheduled/event Agent sweep smoke.');
  }
}

function fileUrl(relativePath) {
  return pathToFileURL(path.join(distMain, relativePath)).href;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
