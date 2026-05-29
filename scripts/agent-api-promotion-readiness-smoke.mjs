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
      taskId: 'task_1',
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
      runId: 'run_api_execution_partial',
      runtimeMode: 'api',
      taskId: 'task_1',
    },
    targetTaskId: 'task_1',
    taskMemoryGuidance: {
      guidanceCount: 0,
      status: 'ready',
      taskId: 'task_1',
    },
    runGoalContract: {
      completionConditionCount: 1,
      objective: 'Produce reviewable task evidence.',
      runId: 'run_api_execution_partial',
      taskId: 'task_1',
    },
  });
  const serviceEvidenceArtifactOnly = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
    contextManifestSummary: 'task=task_1 / files=2 / sourceContexts=1',
    contextReadinessStep: {
      status: 'ready',
      stepId: 'step_context_ready',
      taskId: 'task_1',
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
      runId: 'run_api_execution',
      status: 'ready',
      taskId: 'task_1',
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
      terminalRunStatus: 'completed',
    },
    runGoalContract: {
      completionConditionCount: 1,
      objective: 'Produce reviewable task evidence.',
      runId: 'run_api_execution',
      taskId: 'task_1',
    },
    selectedRuntimeContract: {
      invocationLayer: 'api_runtime',
      phase: 'execution_run',
      runId: 'run_api_execution',
      runtimeMode: 'api',
      taskId: 'task_1',
    },
    targetTaskId: 'task_1',
    taskMemoryGuidance: {
      guidanceCount: 1,
      status: 'ready',
      taskId: 'task_1',
    },
    writeIntentExtraction: {
      runId: 'run_api_execution',
      status: 'ready',
      supportedActions: ['artifact.propose'],
      taskId: 'task_1',
    },
  });
  const serviceEvidencePostRunNoWriteback = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
    contextManifestSummary: 'task=task_1 / files=2 / sourceContexts=1',
    contextReadinessStep: {
      status: 'ready',
      stepId: 'step_context_ready',
      taskId: 'task_1',
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
      runId: 'run_api_execution',
      status: 'ready',
      taskId: 'task_1',
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
    runEvidencePersistence: {
      runId: 'run_api_execution',
      taskId: 'task_1',
      terminalEvidenceStatus: 'present',
      terminalRunStatus: 'completed',
    },
    runGoalContract: {
      completionConditionCount: 1,
      objective: 'Produce reviewable task evidence.',
      runId: 'run_api_execution',
      taskId: 'task_1',
    },
    selectedRuntimeContract: {
      invocationLayer: 'api_runtime',
      phase: 'execution_run',
      runId: 'run_api_execution',
      runtimeMode: 'api',
      taskId: 'task_1',
    },
    targetTaskId: 'task_1',
    taskMemoryGuidance: {
      guidanceCount: 1,
      status: 'ready',
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
  console.log(`serviceEvidenceSelectedRuntimeRun=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeRun') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeRunEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeRunEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeTask=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeTask') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentRun=${scalarValue(serviceEvidencePartial.summary, 'writeIntentRun') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentRunEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'writeIntentRunEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentTask=${scalarValue(serviceEvidencePartial.summary, 'writeIntentTask') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'writeIntentTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceContextStep=${scalarValue(serviceEvidencePartial.summary, 'contextStep') ?? 'missing'}`);
  console.log(`serviceEvidenceContextStepTask=${scalarValue(serviceEvidencePartial.summary, 'contextStepTask') ?? 'missing'}`);
  console.log(`serviceEvidenceContextStepTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'contextStepTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceContextReadinessGateEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'contextReadinessGateEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceContextManifestTask=${scalarValue(serviceEvidencePartial.summary, 'contextManifestTask') ?? 'missing'}`);
  console.log(`serviceEvidenceContextManifestEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'contextManifestEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceRuntimeContextAssemblyGateEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'runtimeContextAssemblyGateEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceTaskMemoryGuidance=${scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidance') ?? 'missing'}`);
  console.log(`serviceEvidenceTaskMemoryGuidanceCount=${scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidanceCount') ?? 'missing'}`);
  console.log(`serviceEvidenceTaskMemoryGuidanceTask=${scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidanceTask') ?? 'missing'}`);
  console.log(`serviceEvidenceTaskMemoryGuidanceTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidanceTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceTaskMemoryGuidanceGateEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidanceGateEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceRunGoalConditions=${scalarValue(serviceEvidencePartial.summary, 'runGoalConditions') ?? 'missing'}`);
  console.log(`serviceEvidenceRunGoalRun=${scalarValue(serviceEvidencePartial.summary, 'runGoalRun') ?? 'missing'}`);
  console.log(`serviceEvidenceRunGoalRunEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'runGoalRunEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceRunGoalTask=${scalarValue(serviceEvidencePartial.summary, 'runGoalTask') ?? 'missing'}`);
  console.log(`serviceEvidenceRunGoalTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'runGoalTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidencePreStepGateEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'preStepGateEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentActions=${scalarValue(serviceEvidencePartial.summary, 'writeIntentActions') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentActionIdentityChain=${scalarValue(serviceEvidencePartial.summary, 'writeIntentActionIdentityChain') ?? 'missing'}`);
  console.log(`serviceEvidenceRuntimeMode=${scalarValue(serviceEvidencePartial.summary, 'runtimeMode') ?? 'missing'}`);
  console.log(`serviceEvidenceInvocationLayer=${scalarValue(serviceEvidencePartial.summary, 'invocationLayer') ?? 'missing'}`);
  console.log(`artifactOnlyPromotionReady=${serviceEvidenceArtifactOnly.ready ? 'yes' : 'no'}`);
  console.log(`artifactOnlyMissingRequirements=${serviceEvidenceArtifactOnly.missingRequirements.join(',') || 'none'}`);
  console.log(`artifactOnlyWriteIntentActions=${scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentActions') ?? 'missing'}`);
  console.log(`artifactOnlyWriteIntentActionIdentityChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentActionIdentityChain') ?? 'missing'}`);
  console.log(`artifactOnlyWriteIntentRunEvidenceChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentRunEvidenceChain') ?? 'missing'}`);
  console.log(`artifactOnlyWriteIntentTaskEvidenceChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentTaskEvidenceChain') ?? 'missing'}`);
  console.log(`artifactOnlyTaskMemoryGuidanceTask=${scalarValue(serviceEvidenceArtifactOnly.summary, 'taskMemoryGuidanceTask') ?? 'missing'}`);
  console.log(`artifactOnlyTaskMemoryGuidanceTaskEvidenceChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'taskMemoryGuidanceTaskEvidenceChain') ?? 'missing'}`);
  console.log(`artifactOnlyPostStepRunEvidenceChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'postStepRunEvidenceChain') ?? 'missing'}`);
  console.log(`artifactOnlyPostStepTaskEvidenceChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'postStepTaskEvidenceChain') ?? 'missing'}`);
  console.log(`artifactOnlyTerminalRunStatus=${scalarValue(serviceEvidenceArtifactOnly.summary, 'terminalRunStatus') ?? 'missing'}`);
  console.log(`artifactOnlyTerminalRunStatusEvidenceChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'terminalRunStatusEvidenceChain') ?? 'missing'}`);
  console.log(`postRunNoWritebackPromotionReady=${serviceEvidencePostRunNoWriteback.ready ? 'yes' : 'no'}`);
  console.log(`postRunNoWritebackRequirements=${serviceEvidencePostRunNoWriteback.satisfiedRequirements.length}/${deferredInvocation.promotionRequirements.length}`);
  console.log(`postRunNoWritebackGates=${serviceEvidencePostRunNoWriteback.satisfiedGates.length}/${deferredInvocation.requiredGates.length}`);
  console.log(`postRunNoWritebackMissingRequirements=${serviceEvidencePostRunNoWriteback.missingRequirements.join(',') || 'none'}`);
  console.log(`postRunNoWritebackMissingGates=${serviceEvidencePostRunNoWriteback.missingGates.join(',') || 'none'}`);
  console.log(`postRunNoWritebackRunId=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'runId') ?? 'missing'}`);
  console.log(`postRunNoWritebackTerminalRunStatus=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'terminalRunStatus') ?? 'missing'}`);
  console.log(`postRunNoWritebackTerminalEvidence=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'terminalEvidence') ?? 'missing'}`);
  console.log(`postRunNoWritebackPostStepRunEvidenceChain=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'postStepRunEvidenceChain') ?? 'missing'}`);
  console.log(`postRunNoWritebackPostStepTaskEvidenceChain=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'postStepTaskEvidenceChain') ?? 'missing'}`);
  console.log(`postRunNoWritebackWriteIntentActions=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'writeIntentActions') ?? 'missing'}`);
  console.log(`postRunNoWritebackReviewedPatchApplyBoundary=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'reviewedPatchApplyBoundary') ?? 'missing'}`);

  if (
    deferredInvocation.status !== 'skipped'
    || deferredReadiness.ready
    || partialReadiness.ready
    || !syntheticReady.ready
    || serviceEvidencePartial.ready
    || serviceEvidencePartial.satisfiedRequirements.length !== 3
    || serviceEvidencePartial.satisfiedGates.length !== 7
    || scalarValue(serviceEvidencePartial.summary, 'targetTask') !== 'task_1'
    || scalarValue(serviceEvidencePartial.summary, 'targetTaskEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'runEvidenceTaskEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'providerConfigured') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'configuredProvider') !== 'openai'
    || scalarValue(serviceEvidencePartial.summary, 'providerStartupProbe') !== 'not_called'
    || scalarValue(serviceEvidencePartial.summary, 'providerPreflightRun') !== 'run_api_execution_partial'
    || scalarValue(serviceEvidencePartial.summary, 'providerPreflightRunEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'providerPreflightTask') !== 'task_1'
    || scalarValue(serviceEvidencePartial.summary, 'providerPreflightTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'runId') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeRun') !== 'run_api_execution_partial'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeRunEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeTask') !== 'task_1'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentRun') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentRunEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentTask') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentTaskEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'contextStep') !== 'step_context_ready'
    || scalarValue(serviceEvidencePartial.summary, 'contextStepTask') !== 'task_1'
    || scalarValue(serviceEvidencePartial.summary, 'contextStepTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'contextReadinessGateEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'contextManifestTask') !== 'task_1'
    || scalarValue(serviceEvidencePartial.summary, 'contextManifestEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'runtimeContextAssemblyGateEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidance') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidanceCount') !== '0'
    || scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidanceTask') !== 'task_1'
    || scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidanceTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidanceGateEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'runGoalConditions') !== '1'
    || scalarValue(serviceEvidencePartial.summary, 'runGoalRun') !== 'run_api_execution_partial'
    || scalarValue(serviceEvidencePartial.summary, 'runGoalRunEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'runGoalTask') !== 'task_1'
    || scalarValue(serviceEvidencePartial.summary, 'runGoalTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'preStepGateEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentActions') !== 'none'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentActionIdentityChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'runtimeMode') !== 'api'
    || scalarValue(serviceEvidencePartial.summary, 'invocationLayer') !== 'api_runtime'
    || serviceEvidenceArtifactOnly.ready
    || !serviceEvidenceArtifactOnly.missingRequirements.includes('write_intent_extraction')
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentActions') !== 'artifact.propose'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentActionIdentityChain') !== 'missing'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentRunEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'taskMemoryGuidanceTask') !== 'task_1'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'taskMemoryGuidanceTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'postStepRunEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'postStepTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'terminalRunStatus') !== 'completed'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'terminalRunStatusEvidenceChain') !== 'ready'
    || serviceEvidencePostRunNoWriteback.ready
    || serviceEvidencePostRunNoWriteback.satisfiedRequirements.length !== 9
    || serviceEvidencePostRunNoWriteback.satisfiedGates.length !== 9
    || !serviceEvidencePostRunNoWriteback.missingRequirements.includes('write_intent_extraction')
    || !serviceEvidencePostRunNoWriteback.missingRequirements.includes('reviewed_patch_apply_boundary')
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'runId') !== 'run_api_execution'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'terminalRunStatus') !== 'completed'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'terminalEvidence') !== 'present'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'postStepRunEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'postStepTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'writeIntentActions') !== 'none'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'reviewedPatchApplyBoundary') !== 'missing'
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
