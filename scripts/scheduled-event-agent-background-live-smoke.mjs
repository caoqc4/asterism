#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  getScheduledEventAgentBackgroundLivePreflight,
  printScheduledEventAgentBackgroundLivePreflight,
} from './scheduled-event-agent-background-live-preflight.mjs';

const ENABLED = process.env.TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_BACKGROUND_LIVE_SMOKE === 'true';

export async function runScheduledEventAgentBackgroundLiveSmoke() {
  const preflight = getScheduledEventAgentBackgroundLivePreflight();
  printScheduledEventAgentBackgroundLivePreflight(preflight);
  console.log('Scheduled/event Agent background live smoke');

  if (!ENABLED) {
    console.log('status=skip');
    console.log('skipReason=opt_in_required');
    console.log('set TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_BACKGROUND_LIVE_SMOKE=true to run one provider-backed scheduler sweep');
    console.log('backgroundLiveRun=not-started');
    console.log('provider=not-called');
    console.log('docker=not-started');
    console.log('workspace=unchanged');
    return 0;
  }

  if (!preflight.ready) {
    console.log('status=skip');
    console.log('skipReason=config_missing');
    for (const issue of preflight.issues) {
      console.log(`- ${issue}`);
    }
    console.log('backgroundLiveRun=not-started');
    console.log('provider=not-called');
    console.log('docker=not-started');
    console.log('workspace=unchanged');
    return 0;
  }

  const root = process.cwd();
  const distMain = path.join(root, 'dist-electron', 'main');
  const modulePaths = {
    scheduler: path.join(distMain, 'scheduler', 'scheduler-service.js'),
    stagedFilePlan: path.join(distMain, 'domain', 'run', 'code-agent-staged-file-plan.js'),
    textGeneration: path.join(distMain, 'executors', 'text-generation.js'),
    producerLoop: path.join(distMain, 'domain', 'run', 'code-agent-model-producer-loop.js'),
    workspaceContext: path.join(distMain, 'domain', 'run', 'code-agent-workspace-context.js'),
  };

  await Promise.all(Object.values(modulePaths).map(assertBuiltModule));

  const [
    { SchedulerService },
    { parseCodeAgentStagedFilePlanPayload },
    { generateRuntimeText },
    { buildCodeAgentModelProducerPrompt },
    { collectCodeAgentWorkspaceContext },
  ] = await Promise.all([
    import(fileUrl(modulePaths.scheduler)),
    import(fileUrl(modulePaths.stagedFilePlan)),
    import(fileUrl(modulePaths.textGeneration)),
    import(fileUrl(modulePaths.producerLoop)),
    import(fileUrl(modulePaths.workspaceContext)),
  ]);

  const task = buildLiveScheduledTask();
  const timelineEvents = [];
  const runLimitCountCalls = [];
  let providerCalled = false;
  let textLength = 0;
  let stagedFiles = [];

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
        throw new Error('Scheduled/event background live smoke should not build a Brief.');
      },
    },
    {
      create: async () => null,
    },
    {
      countCreatedSinceByTask: async (taskIds, sinceIso) => {
        runLimitCountCalls.push({ sinceIso, taskIds });
        return { [task.id]: 0 };
      },
      listIncompleteOlderThan: async () => [],
      updateResult: async () => null,
    },
    {
      getStatus: async () => buildReadyAiStatus(preflight.workspaceRoot),
      resolveRuntimeConfig: async () => {
        throw new Error('Scheduled/event background live smoke should not resolve API runtime config.');
      },
    },
    {
      execute: async () => {
        throw new Error('Scheduled/event background live smoke should not call a Brief executor.');
      },
    },
    {
      select: async () => ({ reason: 'not-used', selectedTemplates: [], shouldUse: false }),
    },
    {
      triggerCodeAgentRun: async (input) => {
        const workspaceContext = await collectCodeAgentWorkspaceContext({
          files: [],
          workspaceRoot: preflight.workspaceRoot,
        });
        if (workspaceContext.status === 'blocked') {
          throw new Error(workspaceContext.summary);
        }
        const request = buildModelProducerRequest(preflight, input);
        providerCalled = true;
        const text = await generateRuntimeText({
          apiKey: preflight.apiKey,
          baseUrl: preflight.baseUrl || null,
          featureFlags: {
            enableSandboxCodingAgent: true,
            enableScheduler: true,
          },
          model: preflight.model,
          provider: preflight.provider,
          workspaceRoot: preflight.workspaceRoot,
        }, buildCodeAgentModelProducerPrompt(request, {
          workspaceContext: workspaceContext.snapshot,
        }));
        textLength = text.length;
        const normalized = parseCodeAgentStagedFilePlanPayload(text);
        if (normalized.status === 'blocked') {
          throw new Error(normalized.summary);
        }
        stagedFiles = normalized.plan.files.map((file) => file.path);
        return {
          createdAt: '2026-05-27T00:00:00.000Z',
          failureReason: null,
          id: 'run_scheduled_event_background_live_smoke',
          instructions: input.patchIntent,
          output: normalized.plan.summary,
          outputSource: 'ai',
          status: 'completed',
          taskId: input.taskId,
          type: 'agent',
          updatedAt: '2026-05-27T00:00:00.000Z',
        };
      },
    },
    {
      recordTimelineEvent: async (input) => {
        timelineEvents.push(input);
      },
    },
    {
      listScheduledEventAgentTriggerCandidates: async () => [task],
    },
  );

  const result = await service.runScheduledEventAgentTriggerSweep(
    'cron',
    new Date('2026-05-27T00:00:00.000Z'),
  );

  if (result.status !== 'completed' || result.startedRunCount !== 1 || !providerCalled) {
    console.log('status=failed');
    console.log(`sweepStatus=${result.status}`);
    console.log(`started=${result.startedRunCount}`);
    console.log(`blocked=${result.blockedTaskCount}`);
    console.log(`blockedReasons=${result.blockedReasons.join(';') || 'none'}`);
    console.log(`automationMissingRequirements=${result.automationMissingRequirements.join(',') || 'none'}`);
    console.log(`runtimeStartMissingRequirements=${result.runtimeStartMissingRequirements.join(',') || 'none'}`);
    console.log(`sweepSummary=${result.summary}`);
    console.log(`provider=${providerCalled ? 'called' : 'not-called'}`);
    console.log('docker=not-started');
    console.log('workspace=unchanged');
    return 1;
  }

  console.log('status=passed');
  console.log('backgroundLiveRun=attempted');
  console.log(`sweepStatus=${result.status}`);
  console.log(`triggerRunEvidenceStatus=${result.triggerRunEvidenceStatus}`);
  console.log(`startedRunIds=${result.startedRunIds.join(',')}`);
  console.log(`timelineEvents=${timelineEvents.length}`);
  console.log(`runLimitCountSince=${runLimitCountCalls[0]?.sinceIso ?? 'none'}`);
  console.log(`provider=${providerCalled ? 'called' : 'not-called'}`);
  console.log(`model=${preflight.model}`);
  console.log(`textLength=${textLength}`);
  console.log(`stagedFiles=${stagedFiles.join(',') || 'none'}`);
  console.log('docker=not-started');
  console.log('workspace=unchanged');
  return 0;
}

function buildModelProducerRequest(preflight, input) {
  return {
    commandPolicy: {
      allowedScripts: ['test'],
      outputLimitBytes: 64_000,
      timeoutMs: 120_000,
    },
    executionPolicy: {
      network: 'disabled',
      noCredentialPassthrough: true,
      promotion: 'decision_required',
    },
    intent: {
      completionCriteria: ['Return a reviewable staged text-file plan for Taskplane; do not write files.'],
      instructions: [
        'This is an opt-in scheduled/event Agent background live smoke.',
        'Return a tiny staged documentation note only.',
        'Use path .taskplane/scheduled-event-agent-background-live-smoke.md.',
        'Do not mention secrets.',
        input.patchIntent,
      ].join('\n'),
      taskTitle: 'Scheduled/event Agent background live smoke',
    },
    modelPolicy: {
      providerKind: preflight.provider,
      toolExposure: 'sandboxed_coding_producer',
    },
    runId: 'run_scheduled_event_background_live_smoke',
    sourceId: 'sandbox_source_scheduled_event_background_live_smoke',
    taskId: input.taskId,
    workspaceRoot: preflight.workspaceRoot,
  };
}

function buildLiveScheduledTask() {
  const taskId = 'task_scheduled_event_background_live_smoke';
  return {
    activeBlocker: null,
    activeDependency: null,
    activeWaitingItem: null,
    completionCriteria: [{
      createdAt: '2026-05-27T00:00:00.000Z',
      id: 'criterion_scheduled_event_background_live_smoke',
      satisfiedAt: null,
      status: 'open',
      taskId,
      text: 'Review the scheduled/event background live smoke result.',
      updatedAt: '2026-05-27T00:00:00.000Z',
      verificationResponsibility: null,
      verificationResponsibilityLabel: null,
    }],
    id: taskId,
    nextStep: 'Run one opt-in provider-backed scheduled/event background smoke and return reviewable evidence.',
    processTemplates: [{
      archivedAt: null,
      bindingId: 'binding_scheduled_event_background_live_smoke',
      bindingNote: null,
      bindingStatus: 'active',
      bindingUpdatedAt: '2026-05-27T00:00:00.000Z',
      boundAt: '2026-05-27T00:00:00.000Z',
      content: 'Prepare one bounded scheduled/event background live smoke result and leave reviewable evidence.',
      createdAt: '2026-05-27T00:00:00.000Z',
      id: 'process_scheduled_event_background_live_smoke',
      kind: 'sop',
      removedAt: null,
      status: 'active',
      summary: null,
      tags: [],
      taskId,
      title: 'Scheduled/event background live smoke SOP',
      updatedAt: '2026-05-27T00:00:00.000Z',
    }],
    riskLevel: 'low',
    sourceContexts: [{
      archivedAt: null,
      capturedAt: '2026-05-27T00:00:00.000Z',
      content: 'Use this stable source for the scheduled/event background live smoke.',
      createdAt: '2026-05-27T00:00:00.000Z',
      credibility: 'verified',
      id: 'source_context_scheduled_event_background_live_smoke',
      isKey: true,
      kind: 'doc',
      note: null,
      sourceRole: 'stable_reference',
      status: 'active',
      taskId,
      title: 'Scheduled/event background live smoke source',
      updatedAt: '2026-05-27T00:00:00.000Z',
      uri: null,
    }],
    state: 'planned',
    summary: 'Opt-in scheduled/event Agent background live smoke task.',
    taskFacets: ['scheduled', 'routine'],
    taskType: 'routine',
    timeline: [{
      createdAt: '2026-05-27T00:00:00.000Z',
      id: 'timeline_scheduled_event_background_live_standing_approval',
      payload: JSON.stringify({
        policy: {
          allowedAutonomyLevel: 'L2_limited_authorized_action',
          allowedLanes: ['coding'],
          allowedRuntimeIds: ['local_sandbox'],
          createdAt: '2026-05-27T00:00:00.000Z',
          expiresAt: '2026-05-28T00:00:00.000Z',
          id: `standing_approval:${taskId}:coding:local_sandbox`,
          maxRunsPerDay: 1,
          reason: 'Allow one opt-in scheduled/event Agent background live smoke.',
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

async function assertBuiltModule(modulePath) {
  try {
    await fs.access(modulePath);
  } catch {
    throw new Error('Run npm run build:main before the scheduled/event Agent background live smoke.');
  }
}

function fileUrl(modulePath) {
  return pathToFileURL(modulePath).href;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runScheduledEventAgentBackgroundLiveSmoke();
}
