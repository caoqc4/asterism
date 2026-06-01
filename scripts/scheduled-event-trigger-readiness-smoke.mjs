#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const modulePath = path.join(root, 'dist-electron', 'shared', 'agent-orchestration.js');
const sourceModulePath = path.join(root, 'src', 'shared', 'agent-orchestration.ts');

export async function runScheduledEventTriggerReadinessSmoke() {
  console.log('Scheduled/event trigger readiness smoke');
  console.log('mode=read-only');
  console.log('provider=not-called');
  console.log('docker=not-started');
  console.log('workspace=unchanged');

  if (!fs.existsSync(modulePath) || sourceIsNewerThanBuild()) {
    console.log('status=skip');
    console.log('skipReason=build_required');
    console.log('run npm run build:main before this smoke');
    return 0;
  }

  const {
    buildAgentExecutionOrchestrationSnapshot,
    buildStandingApprovalConfirmationDraft,
    evaluateSkillInformedAutomationReadiness,
    planScheduledEventAgentTrigger,
    planScheduledEventAgentTriggerFromEvidence,
  } = await import(pathToFileURL(modulePath).href);

  const baseTask = matureAutomationTask();
  const aiStatus = readyAutomationAiStatus();
  const readiness = evaluateSkillInformedAutomationReadiness({
    snapshot: buildAgentExecutionOrchestrationSnapshot(aiStatus),
    scheduledEventEntrypointAvailable: true,
    task: baseTask,
  });
  const draft = buildStandingApprovalConfirmationDraft({
    now: new Date('2026-05-26T10:00:00.000Z'),
    readiness,
    task: {
      id: baseTask.id,
      riskLevel: baseTask.riskLevel,
      taskFacets: baseTask.taskFacets,
      taskType: baseTask.taskType,
    },
  });
  const task = withStandingApproval(baseTask, draft.policy);
  const common = {
    aiStatus,
    now: new Date('2026-05-26T11:00:00.000Z'),
    task,
  };

  const noService = planScheduledEventAgentTrigger(common);
  const noRunLimit = planScheduledEventAgentTrigger({
    ...common,
    schedulerTriggerServiceConnected: true,
  });
  const dailyCapReached = planScheduledEventAgentTrigger({
    ...common,
    runLimit: { runsStartedToday: 3 },
    schedulerTriggerServiceConnected: true,
  });
  const ready = planScheduledEventAgentTrigger({
    ...common,
    runLimit: { runsStartedToday: 0 },
    schedulerTriggerServiceConnected: true,
  });
  const serviceEvidencePartial = planScheduledEventAgentTriggerFromEvidence({
    aiStatus,
    now: new Date('2026-05-26T11:00:00.000Z'),
    runLimit: {
      runsStartedToday: 0,
      status: 'missing',
    },
    schedulerTriggerService: {
      connected: true,
    },
    standingApprovalRecord: {
      createdAt: '2026-05-26T10:01:00.000Z',
      id: 'timeline_approval_service_evidence',
      policy: draft.policy,
      schedulerTriggerAllowed: false,
      workspaceWriteAllowed: false,
    },
    task: baseTask,
  });

  printPlan('noService', noService);
  printPlan('noRunLimit', noRunLimit);
  printPlan('dailyCapReached', dailyCapReached);
  printPlan('ready', ready);
  printPlan('serviceEvidence', serviceEvidencePartial);
  console.log(`triggerRunEvidenceRequired=${ready.triggerRunEvidenceRequired.join(',')}`);

  if (
    noService.runtimeStartAllowed
    || noService.runtimeStartSatisfiedRequirements.length !== 2
    || !noService.runtimeStartSatisfiedRequirements.includes('selected_runtime_identity')
    || !noService.runtimeStartMissingRequirements.includes('scheduler_trigger_service')
    || !noService.runtimeStartMissingRequirements.includes('run_limit_count')
    || noRunLimit.runtimeStartAllowed
    || !noRunLimit.runtimeStartMissingRequirements.includes('trigger_plan_ready')
    || !noRunLimit.runtimeStartMissingRequirements.includes('run_limit_count')
    || dailyCapReached.runtimeStartAllowed
    || !dailyCapReached.runtimeStartMissingRequirements.includes('trigger_plan_ready')
    || !dailyCapReached.blockedReasons.some((reason) => reason.includes('daily run limit reached'))
    || !ready.runtimeStartAllowed
    || ready.runtimeStartMissingRequirements.length !== 0
    || ready.runtimeStartSatisfiedRequirements.length !== 4
    || !ready.runtimeStartSatisfiedRequirements.includes('selected_runtime_identity')
    || serviceEvidencePartial.runtimeStartAllowed
    || serviceEvidencePartial.runtimeStartSatisfiedRequirements.length !== 2
    || !serviceEvidencePartial.runtimeStartSatisfiedRequirements.includes('selected_runtime_identity')
    || !serviceEvidencePartial.runtimeStartMissingRequirements.includes('run_limit_count')
  ) {
    console.log('status=failed');
    return 1;
  }

  console.log('status=passed');
  return 0;
}

function printPlan(prefix, plan) {
  console.log(`${prefix}Status=${plan.status}`);
  console.log(`${prefix}TriggerPlanReady=${plan.triggerPlanReady ? 'yes' : 'no'}`);
  console.log(`${prefix}RuntimeStartAllowed=${String(plan.runtimeStartAllowed)}`);
  console.log(`${prefix}RuntimeStartRequirements=${plan.runtimeStartSatisfiedRequirements.length}/4`);
  console.log(`${prefix}RuntimeStartMissingRequirements=${plan.runtimeStartMissingRequirements.join(',') || 'none'}`);
  console.log(`${prefix}RunLimit=${plan.runLimit.runsStartedToday ?? 'not_counted'}/${plan.runLimit.maxRunsPerDay ?? 'none'}`);
}

function readyAutomationAiStatus() {
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
    toolScaffoldSummaries: [],
    workspaceRoot: '/tmp/taskplane-scheduled-event-trigger-readiness-smoke',
  };
}

function matureAutomationTask() {
  return {
    activeBlocker: null,
    activeDependency: null,
    activeWaitingItem: null,
    businessLineId: 'business_line_scheduled_event_trigger_readiness_smoke',
    completionCriteria: [{
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'criterion_1',
      satisfiedAt: null,
      status: 'open',
      taskId: 'task_scheduled_event_trigger_readiness_smoke',
      text: 'Review the scheduled/event trigger readiness result.',
      updatedAt: '2026-01-01T00:00:00.000Z',
      verificationResponsibility: null,
      verificationResponsibilityLabel: null,
    }],
    id: 'task_scheduled_event_trigger_readiness_smoke',
    nextStep: 'Prepare a bounded scheduled/event Agent run.',
    processTemplates: [{
      archivedAt: null,
      bindingId: 'binding_1',
      bindingNote: null,
      bindingStatus: 'active',
      bindingUpdatedAt: '2026-01-01T00:00:00.000Z',
      boundAt: '2026-01-01T00:00:00.000Z',
      content: 'Prepare, test, and review a scheduled/event Agent run.',
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'template_1',
      kind: 'skill',
      removedAt: null,
      status: 'active',
      summary: null,
      tags: [],
      taskId: 'task_scheduled_event_trigger_readiness_smoke',
      title: 'Scheduled/event Agent workflow',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    riskLevel: 'low',
    sourceContexts: [{
      content: 'Stable source context for scheduled/event trigger readiness.',
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'source_context_1',
      source: 'fixture',
      taskId: 'task_scheduled_event_trigger_readiness_smoke',
      title: 'Scheduled/event trigger readiness source',
      updatedAt: '2026-01-01T00:00:00.000Z',
      url: null,
    }],
    state: 'planned',
    summary: 'Known low-risk scheduled/event workflow.',
    taskFacets: ['scheduled'],
    taskType: 'routine',
    timeline: [],
    waitingReason: null,
  };
}

function withStandingApproval(task, policy) {
  return {
    ...task,
    timeline: [{
      createdAt: '2026-05-26T10:01:00.000Z',
      id: 'timeline_approval',
      payload: JSON.stringify({
        policy,
        schedulerTriggerAllowed: false,
        workspaceWriteAllowed: false,
      }),
      taskId: task.id,
      type: 'panel.standing_approval_confirmed',
    }],
  };
}

function sourceIsNewerThanBuild() {
  if (!fs.existsSync(modulePath) || !fs.existsSync(sourceModulePath)) return false;
  return fs.statSync(sourceModulePath).mtimeMs > fs.statSync(modulePath).mtimeMs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runScheduledEventTriggerReadinessSmoke();
}
