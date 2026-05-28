#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const modulePath = path.join(root, 'dist-electron', 'shared', 'ai-runtime-invocation.js');
const sourceModulePath = path.join(root, 'src', 'shared', 'ai-runtime-invocation.ts');

export async function runAgentApiPromotionReadinessSmoke() {
  console.log('Agent API promotion readiness smoke');
  console.log('mode=read-only');
  console.log('provider=not-called');
  console.log('workspace=unchanged');
  console.log('promotionInProduct=deferred');

  if (!fs.existsSync(modulePath) || sourceIsNewerThanBuild()) {
    console.log('status=skip');
    console.log('skipReason=build_required');
    console.log('run npm run build:main before this smoke');
    return 0;
  }

  const {
    agentApiExecutionPromotionRequirements,
    buildDeferredAgentApiExecutionRunInvocation,
    evaluateAgentApiExecutionPromotionReadiness,
    evaluateAgentApiExecutionPromotionReadinessFromEvidence,
    evaluateAgentApiExecutionPromotionReadinessForInvocation,
  } = await import(pathToFileURL(modulePath).href);

  const deferredInvocation = buildDeferredAgentApiExecutionRunInvocation();
  const deferredReadiness = evaluateAgentApiExecutionPromotionReadinessForInvocation(deferredInvocation);
  const partialReadiness = evaluateAgentApiExecutionPromotionReadiness({
    satisfiedGates: [
      'simplicity_check',
      'runtime_action',
      'runtime_context_assembly',
    ],
    satisfiedRequirements: [
      'selected_runtime_contract',
      'target_task_identity',
      'provider_visible_preflight',
      'runtime_context_manifest',
      'context_readiness_step',
    ],
  });
  const syntheticReady = evaluateAgentApiExecutionPromotionReadiness({
    satisfiedGates: deferredInvocation.requiredGates,
    satisfiedRequirements: agentApiExecutionPromotionRequirements(),
  });
  const serviceEvidencePartial = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
    contextManifestSummary: 'task=task_1 / files=2 / sourceContexts=1',
    contextReadinessStep: {
      status: 'ready',
      stepId: 'step_context_ready',
    },
    gates: {
      simplicity_check: true,
      runtime_action: true,
      runtime_context_assembly: true,
    },
    providerVisiblePreflight: {
      configuredProvider: 'openai',
      providerConfigured: true,
      runId: 'run_api_execution_partial',
      startupProbe: 'not_called',
      status: 'ready',
      taskId: 'task_1',
    },
    selectedRuntimeContract: {
      invocationLayer: 'api_runtime',
      phase: 'execution_run',
      runtimeMode: 'api',
    },
    targetTaskId: 'task_1',
  });
  const serviceEvidenceArtifactOnly = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
    contextManifestSummary: 'task=task_1 / files=2 / sourceContexts=1',
    contextReadinessStep: {
      status: 'ready',
      stepId: 'step_context_ready',
    },
    gates: {
      simplicity_check: true,
      runtime_action: true,
      runtime_context_assembly: true,
      context_readiness: true,
      task_memory_coverage: true,
      task_memory_guidance: true,
      pre_step: true,
      subtask_start: true,
      post_step: true,
    },
    postStepVerification: {
      status: 'ready',
      verifier: 'taskplane.verifier.lightweight',
    },
    providerVisiblePreflight: {
      configuredProvider: 'openai',
      providerConfigured: true,
      runId: 'run_api_execution',
      startupProbe: 'not_called',
      status: 'ready',
      taskId: 'task_1',
    },
    reviewedPatchApplyBoundary: {
      appliedPromotionStatus: 'applied',
      explicitApplyOnly: true,
      promotionPreflightReady: true,
      runId: 'run_api_execution',
      taskId: 'task_1',
    },
    runEvidencePersistence: {
      runId: 'run_api_execution',
      taskId: 'task_1',
      terminalEvidenceStatus: 'present',
    },
    runGoalContract: {
      completionConditionCount: 1,
      objective: 'Produce reviewable task evidence.',
    },
    selectedRuntimeContract: {
      invocationLayer: 'api_runtime',
      phase: 'execution_run',
      runtimeMode: 'api',
    },
    targetTaskId: 'task_1',
    taskMemoryGuidance: {
      guidanceCount: 1,
      status: 'ready',
    },
    writeIntentExtraction: {
      runId: 'run_api_execution',
      status: 'ready',
      supportedActions: ['artifact.propose'],
      taskId: 'task_1',
    },
  });

  console.log(`deferredInvocationStatus=${deferredInvocation.status}`);
  console.log(`deferredPromotionReady=${deferredReadiness.ready ? 'yes' : 'no'}`);
  console.log(`deferredRequirements=${deferredReadiness.satisfiedRequirements.length}/${deferredInvocation.promotionRequirements.length}`);
  console.log(`deferredGates=${deferredReadiness.satisfiedGates.length}/${deferredInvocation.requiredGates.length}`);
  console.log(`deferredMissingRequirements=${deferredReadiness.missingRequirements.join(',') || 'none'}`);
  console.log(`deferredMissingGates=${deferredReadiness.missingGates.join(',') || 'none'}`);
  console.log(`partialPromotionReady=${partialReadiness.ready ? 'yes' : 'no'}`);
  console.log(`partialRequirements=${partialReadiness.satisfiedRequirements.length}/${deferredInvocation.promotionRequirements.length}`);
  console.log(`partialGates=${partialReadiness.satisfiedGates.length}/${deferredInvocation.requiredGates.length}`);
  console.log(`partialMissingRequirements=${partialReadiness.missingRequirements.join(',') || 'none'}`);
  console.log(`partialMissingGates=${partialReadiness.missingGates.join(',') || 'none'}`);
  console.log(`syntheticPromotionReady=${syntheticReady.ready ? 'yes' : 'no'}`);
  console.log(`syntheticRequirements=${syntheticReady.satisfiedRequirements.length}/${deferredInvocation.promotionRequirements.length}`);
  console.log(`syntheticGates=${syntheticReady.satisfiedGates.length}/${deferredInvocation.requiredGates.length}`);
  console.log(`serviceEvidencePromotionReady=${serviceEvidencePartial.ready ? 'yes' : 'no'}`);
  console.log(`serviceEvidenceRequirements=${serviceEvidencePartial.satisfiedRequirements.length}/${deferredInvocation.promotionRequirements.length}`);
  console.log(`serviceEvidenceGates=${serviceEvidencePartial.satisfiedGates.length}/${deferredInvocation.requiredGates.length}`);
  console.log(`serviceEvidenceMissingRequirements=${serviceEvidencePartial.missingRequirements.join(',')}`);
  console.log(`serviceEvidenceMissingGates=${serviceEvidencePartial.missingGates.join(',')}`);
  console.log(`serviceEvidenceTargetTask=${scalarValue(serviceEvidencePartial.summary, 'targetTask') ?? 'missing'}`);
  console.log(`serviceEvidenceTargetTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'targetTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceRunEvidenceTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'runEvidenceTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderConfigured=${scalarValue(serviceEvidencePartial.summary, 'providerConfigured') ?? 'missing'}`);
  console.log(`serviceEvidenceConfiguredProvider=${scalarValue(serviceEvidencePartial.summary, 'configuredProvider') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderStartupProbe=${scalarValue(serviceEvidencePartial.summary, 'providerStartupProbe') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderPreflightRun=${scalarValue(serviceEvidencePartial.summary, 'providerPreflightRun') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderPreflightRunEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'providerPreflightRunEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderPreflightTask=${scalarValue(serviceEvidencePartial.summary, 'providerPreflightTask') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderPreflightTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'providerPreflightTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceRunId=${scalarValue(serviceEvidencePartial.summary, 'runId') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentRun=${scalarValue(serviceEvidencePartial.summary, 'writeIntentRun') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentRunEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'writeIntentRunEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentTask=${scalarValue(serviceEvidencePartial.summary, 'writeIntentTask') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'writeIntentTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceContextStep=${scalarValue(serviceEvidencePartial.summary, 'contextStep') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentActions=${scalarValue(serviceEvidencePartial.summary, 'writeIntentActions') ?? 'missing'}`);
  console.log(`serviceEvidenceRuntimeMode=${scalarValue(serviceEvidencePartial.summary, 'runtimeMode') ?? 'missing'}`);
  console.log(`serviceEvidenceInvocationLayer=${scalarValue(serviceEvidencePartial.summary, 'invocationLayer') ?? 'missing'}`);
  console.log(`artifactOnlyPromotionReady=${serviceEvidenceArtifactOnly.ready ? 'yes' : 'no'}`);
  console.log(`artifactOnlyMissingRequirements=${serviceEvidenceArtifactOnly.missingRequirements.join(',') || 'none'}`);
  console.log(`artifactOnlyWriteIntentActions=${scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentActions') ?? 'missing'}`);
  console.log(`artifactOnlyWriteIntentRunEvidenceChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentRunEvidenceChain') ?? 'missing'}`);
  console.log(`artifactOnlyWriteIntentTaskEvidenceChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentTaskEvidenceChain') ?? 'missing'}`);

  if (
    deferredInvocation.status !== 'skipped'
    || deferredReadiness.ready
    || partialReadiness.ready
    || !syntheticReady.ready
    || serviceEvidencePartial.ready
    || serviceEvidencePartial.satisfiedRequirements.length !== 5
    || serviceEvidencePartial.satisfiedGates.length !== 3
    || scalarValue(serviceEvidencePartial.summary, 'targetTask') !== 'task_1'
    || scalarValue(serviceEvidencePartial.summary, 'targetTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'runEvidenceTaskEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'providerConfigured') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'configuredProvider') !== 'openai'
    || scalarValue(serviceEvidencePartial.summary, 'providerStartupProbe') !== 'not_called'
    || scalarValue(serviceEvidencePartial.summary, 'providerPreflightRun') !== 'run_api_execution_partial'
    || scalarValue(serviceEvidencePartial.summary, 'providerPreflightRunEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'providerPreflightTask') !== 'task_1'
    || scalarValue(serviceEvidencePartial.summary, 'providerPreflightTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'runId') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentRun') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentRunEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentTask') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentTaskEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'contextStep') !== 'step_context_ready'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentActions') !== 'none'
    || scalarValue(serviceEvidencePartial.summary, 'runtimeMode') !== 'api'
    || scalarValue(serviceEvidencePartial.summary, 'invocationLayer') !== 'api_runtime'
    || serviceEvidenceArtifactOnly.ready
    || !serviceEvidenceArtifactOnly.missingRequirements.includes('write_intent_extraction')
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentActions') !== 'artifact.propose'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentRunEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentTaskEvidenceChain') !== 'ready'
  ) {
    console.log('status=failed');
    return 1;
  }

  console.log('status=passed');
  return 0;
}

function scalarValue(summary, key) {
  const prefix = `${key}=`;
  const part = summary.split(' / ').find((item) => item.trim().startsWith(prefix));
  return part?.trim().slice(prefix.length).trim() ?? null;
}

function sourceIsNewerThanBuild() {
  if (!fs.existsSync(sourceModulePath)) return false;
  const sourceStat = fs.statSync(sourceModulePath);
  const buildStat = fs.statSync(modulePath);
  return sourceStat.mtimeMs > buildStat.mtimeMs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runAgentApiPromotionReadinessSmoke();
}
