#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const modulePath = path.join(root, 'dist-electron', 'shared', 'ai-runtime-invocation.js');
const sourceModulePath = path.join(root, 'src', 'shared', 'ai-runtime-invocation.ts');

function taskBoundRunStartEvidence(runId, taskId = 'task_1') {
  return {
    runtimeAction: {
      action: 'run_start',
      allowed: true,
      runId,
      status: 'ready',
      surface: 'run',
      taskId,
    },
    simplicityCheck: {
      smallestMovement: 'run_start',
      status: 'ready',
      taskId,
    },
  };
}

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
      provider: 'openai',
      runId: 'run_api_execution_partial',
      runtimeMode: 'api',
      taskId: 'task_1',
    },
    subtaskStart: {
      status: 'ready',
      taskId: 'task_1',
    },
    ...taskBoundRunStartEvidence('run_api_execution_partial'),
    targetTaskId: 'task_1',
    taskMemoryGuidance: {
      guidanceCount: 0,
      status: 'ready',
      taskId: 'task_1',
    },
    taskMemoryCoverage: {
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
      terminalEvidenceSummary: 'output_chars=42',
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
      provider: 'openai',
      runId: 'run_api_execution',
      runtimeMode: 'api',
      taskId: 'task_1',
    },
    subtaskStart: {
      status: 'ready',
      taskId: 'task_1',
    },
    ...taskBoundRunStartEvidence('run_api_execution'),
    targetTaskId: 'task_1',
    taskMemoryGuidance: {
      guidanceCount: 1,
      status: 'ready',
      taskId: 'task_1',
    },
    taskMemoryCoverage: {
      status: 'ready',
      taskId: 'task_1',
    },
    writeIntentExtraction: {
      declaredActions: ['artifact.propose'],
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
      terminalEvidenceSummary: 'output_chars=42',
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
      provider: 'openai',
      runId: 'run_api_execution',
      runtimeMode: 'api',
      taskId: 'task_1',
    },
    subtaskStart: {
      status: 'ready',
      taskId: 'task_1',
    },
    ...taskBoundRunStartEvidence('run_api_execution'),
    targetTaskId: 'task_1',
    taskMemoryGuidance: {
      guidanceCount: 1,
      status: 'ready',
      taskId: 'task_1',
    },
    taskMemoryCoverage: {
      status: 'ready',
      taskId: 'task_1',
    },
  });
  const serviceEvidenceNoWriteRequired = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
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
      appliedPromotionStatus: 'not_required',
      explicitApplyOnly: true,
      noWorkspaceWriteRequired: true,
      promotionPreflightReady: false,
      runId: 'run_api_execution',
      taskId: 'task_1',
    },
    runEvidencePersistence: {
      runId: 'run_api_execution',
      taskId: 'task_1',
      terminalEvidenceSummary: 'output_chars=42',
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
      provider: 'openai',
      runId: 'run_api_execution',
      runtimeMode: 'api',
      taskId: 'task_1',
    },
    subtaskStart: {
      status: 'ready',
      taskId: 'task_1',
    },
    ...taskBoundRunStartEvidence('run_api_execution'),
    targetTaskId: 'task_1',
    taskMemoryGuidance: {
      guidanceCount: 1,
      status: 'ready',
      taskId: 'task_1',
    },
    taskMemoryCoverage: {
      status: 'ready',
      taskId: 'task_1',
    },
    writeIntentExtraction: {
      declaredActions: [],
      noWriteIntentRequired: true,
      runId: 'run_api_execution',
      status: 'ready',
      supportedActions: [],
      taskId: 'task_1',
    },
  });
  const serviceEvidenceSourceContextOnly = evaluateAgentApiExecutionPromotionReadinessFromEvidence({
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
      appliedPromotionStatus: 'not_required',
      explicitApplyOnly: true,
      noWorkspaceWriteRequired: true,
      promotionPreflightReady: false,
      runId: 'run_api_execution',
      taskId: 'task_1',
    },
    runEvidencePersistence: {
      runId: 'run_api_execution',
      taskId: 'task_1',
      terminalEvidenceSummary: 'output_chars=42',
      terminalEvidenceStatus: 'present',
      terminalRunStatus: 'completed',
    },
    runGoalContract: {
      completionConditionCount: 1,
      objective: 'Produce reviewable research evidence.',
      runId: 'run_api_execution',
      taskId: 'task_1',
    },
    selectedRuntimeContract: {
      invocationLayer: 'api_runtime',
      phase: 'execution_run',
      provider: 'openai',
      runId: 'run_api_execution',
      runtimeMode: 'api',
      taskId: 'task_1',
    },
    subtaskStart: {
      status: 'ready',
      taskId: 'task_1',
    },
    ...taskBoundRunStartEvidence('run_api_execution'),
    targetTaskId: 'task_1',
    taskMemoryGuidance: {
      guidanceCount: 1,
      status: 'ready',
      taskId: 'task_1',
    },
    taskMemoryCoverage: {
      status: 'ready',
      taskId: 'task_1',
    },
    writeIntentExtraction: {
      declaredActions: ['source_context.create'],
      runId: 'run_api_execution',
      status: 'ready',
      supportedActions: ['source_context.create'],
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
  console.log(`serviceEvidenceProviderPreflightStatus=${scalarValue(serviceEvidencePartial.summary, 'providerPreflightStatus') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderConfigured=${scalarValue(serviceEvidencePartial.summary, 'providerConfigured') ?? 'missing'}`);
  console.log(`serviceEvidenceConfiguredProvider=${scalarValue(serviceEvidencePartial.summary, 'configuredProvider') ?? 'missing'}`);
  console.log(`serviceEvidenceConfiguredProviderEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'configuredProviderEvidenceChain') ?? 'missing'}`);
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
  console.log(`serviceEvidenceSelectedRuntimeProvider=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeProvider') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeProviderEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeProviderEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentRun=${scalarValue(serviceEvidencePartial.summary, 'writeIntentRun') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentRunEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'writeIntentRunEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentTask=${scalarValue(serviceEvidencePartial.summary, 'writeIntentTask') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'writeIntentTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentExtraction=${scalarValue(serviceEvidencePartial.summary, 'writeIntentExtraction') ?? 'missing'}`);
  console.log(`serviceEvidenceContextStep=${scalarValue(serviceEvidencePartial.summary, 'contextStep') ?? 'missing'}`);
  console.log(`serviceEvidenceContextStepTask=${scalarValue(serviceEvidencePartial.summary, 'contextStepTask') ?? 'missing'}`);
  console.log(`serviceEvidenceContextStepTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'contextStepTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceContextReadinessGateEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'contextReadinessGateEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceContextManifestTask=${scalarValue(serviceEvidencePartial.summary, 'contextManifestTask') ?? 'missing'}`);
  console.log(`serviceEvidenceContextManifestEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'contextManifestEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceRuntimeContextAssemblyGateEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'runtimeContextAssemblyGateEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceSimplicityCheck=${scalarValue(serviceEvidencePartial.summary, 'simplicityCheck') ?? 'missing'}`);
  console.log(`serviceEvidenceSimplicityCheckTask=${scalarValue(serviceEvidencePartial.summary, 'simplicityCheckTask') ?? 'missing'}`);
  console.log(`serviceEvidenceSimplicityCheckSmallestMovement=${scalarValue(serviceEvidencePartial.summary, 'simplicityCheckSmallestMovement') ?? 'missing'}`);
  console.log(`serviceEvidenceSimplicityCheckGateEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'simplicityCheckGateEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceRuntimeAction=${scalarValue(serviceEvidencePartial.summary, 'runtimeAction') ?? 'missing'}`);
  console.log(`serviceEvidenceRuntimeActionStatus=${scalarValue(serviceEvidencePartial.summary, 'runtimeActionStatus') ?? 'missing'}`);
  console.log(`serviceEvidenceRuntimeActionSurface=${scalarValue(serviceEvidencePartial.summary, 'runtimeActionSurface') ?? 'missing'}`);
  console.log(`serviceEvidenceRuntimeActionRun=${scalarValue(serviceEvidencePartial.summary, 'runtimeActionRun') ?? 'missing'}`);
  console.log(`serviceEvidenceRuntimeActionRunIdentityChain=${scalarValue(serviceEvidencePartial.summary, 'runtimeActionRunIdentityChain') ?? 'missing'}`);
  console.log(`serviceEvidenceRuntimeActionTask=${scalarValue(serviceEvidencePartial.summary, 'runtimeActionTask') ?? 'missing'}`);
  console.log(`serviceEvidenceRuntimeActionGateEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'runtimeActionGateEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceTaskMemoryGuidance=${scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidance') ?? 'missing'}`);
  console.log(`serviceEvidenceTaskMemoryGuidanceCount=${scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidanceCount') ?? 'missing'}`);
  console.log(`serviceEvidenceTaskMemoryGuidanceTask=${scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidanceTask') ?? 'missing'}`);
  console.log(`serviceEvidenceTaskMemoryGuidanceTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidanceTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceTaskMemoryCoverage=${scalarValue(serviceEvidencePartial.summary, 'taskMemoryCoverage') ?? 'missing'}`);
  console.log(`serviceEvidenceTaskMemoryCoverageTask=${scalarValue(serviceEvidencePartial.summary, 'taskMemoryCoverageTask') ?? 'missing'}`);
  console.log(`serviceEvidenceTaskMemoryCoverageEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'taskMemoryCoverageEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceTaskMemoryCoverageGateEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'taskMemoryCoverageGateEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceTaskMemoryGuidanceGateEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidanceGateEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceRunGoalConditions=${scalarValue(serviceEvidencePartial.summary, 'runGoalConditions') ?? 'missing'}`);
  console.log(`serviceEvidenceRunGoalRun=${scalarValue(serviceEvidencePartial.summary, 'runGoalRun') ?? 'missing'}`);
  console.log(`serviceEvidenceRunGoalRunEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'runGoalRunEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceRunGoalTask=${scalarValue(serviceEvidencePartial.summary, 'runGoalTask') ?? 'missing'}`);
  console.log(`serviceEvidenceRunGoalTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'runGoalTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidencePreStepGateEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'preStepGateEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceSubtaskStart=${scalarValue(serviceEvidencePartial.summary, 'subtaskStart') ?? 'missing'}`);
  console.log(`serviceEvidenceSubtaskStartTask=${scalarValue(serviceEvidencePartial.summary, 'subtaskStartTask') ?? 'missing'}`);
  console.log(`serviceEvidenceSubtaskStartEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'subtaskStartEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceSubtaskStartGateEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'subtaskStartGateEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentSupportedActionCount=${scalarValue(serviceEvidencePartial.summary, 'writeIntentSupportedActionCount') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentActions=${scalarValue(serviceEvidencePartial.summary, 'writeIntentActions') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentDeclaredActionCount=${scalarValue(serviceEvidencePartial.summary, 'writeIntentDeclaredActionCount') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentDeclaredActionEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'writeIntentDeclaredActionEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentActionIdentityChain=${scalarValue(serviceEvidencePartial.summary, 'writeIntentActionIdentityChain') ?? 'missing'}`);
  console.log(`serviceEvidenceReviewedPatchExplicitApply=${scalarValue(serviceEvidencePartial.summary, 'reviewedPatchExplicitApply') ?? 'missing'}`);
  console.log(`serviceEvidencePatchPromotionPreflight=${scalarValue(serviceEvidencePartial.summary, 'patchPromotionPreflight') ?? 'missing'}`);
  console.log(`serviceEvidenceRuntimeMode=${scalarValue(serviceEvidencePartial.summary, 'runtimeMode') ?? 'missing'}`);
  console.log(`serviceEvidenceInvocationLayer=${scalarValue(serviceEvidencePartial.summary, 'invocationLayer') ?? 'missing'}`);
  console.log(`artifactOnlyPromotionReady=${serviceEvidenceArtifactOnly.ready ? 'yes' : 'no'}`);
  console.log(`artifactOnlyMissingRequirements=${serviceEvidenceArtifactOnly.missingRequirements.join(',') || 'none'}`);
  console.log(`artifactOnlyWriteIntentSupportedActionCount=${scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentSupportedActionCount') ?? 'missing'}`);
  console.log(`artifactOnlyWriteIntentActions=${scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentActions') ?? 'missing'}`);
  console.log(`artifactOnlyWriteIntentDeclaredActionCount=${scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentDeclaredActionCount') ?? 'missing'}`);
  console.log(`artifactOnlyWriteIntentDeclaredActionEvidenceChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentDeclaredActionEvidenceChain') ?? 'missing'}`);
  console.log(`artifactOnlyWriteIntentExtraction=${scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentExtraction') ?? 'missing'}`);
  console.log(`artifactOnlyWriteIntentActionIdentityChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentActionIdentityChain') ?? 'missing'}`);
  console.log(`artifactOnlyWriteIntentRunEvidenceChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentRunEvidenceChain') ?? 'missing'}`);
  console.log(`artifactOnlyWriteIntentTaskEvidenceChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentTaskEvidenceChain') ?? 'missing'}`);
  console.log(`artifactOnlyTaskMemoryGuidanceTask=${scalarValue(serviceEvidenceArtifactOnly.summary, 'taskMemoryGuidanceTask') ?? 'missing'}`);
  console.log(`artifactOnlyTaskMemoryGuidanceTaskEvidenceChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'taskMemoryGuidanceTaskEvidenceChain') ?? 'missing'}`);
  console.log(`artifactOnlyPostStepRunEvidenceChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'postStepRunEvidenceChain') ?? 'missing'}`);
  console.log(`artifactOnlyPostStepTaskEvidenceChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'postStepTaskEvidenceChain') ?? 'missing'}`);
  console.log(`artifactOnlyTerminalRunStatus=${scalarValue(serviceEvidenceArtifactOnly.summary, 'terminalRunStatus') ?? 'missing'}`);
  console.log(`artifactOnlyTerminalRunStatusEvidenceChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'terminalRunStatusEvidenceChain') ?? 'missing'}`);
  console.log(`artifactOnlyTerminalEvidenceSummary=${scalarValue(serviceEvidenceArtifactOnly.summary, 'terminalEvidenceSummary') ?? 'missing'}`);
  console.log(`artifactOnlyTerminalEvidenceSummaryChain=${scalarValue(serviceEvidenceArtifactOnly.summary, 'terminalEvidenceSummaryChain') ?? 'missing'}`);
  console.log(`postRunNoWritebackPromotionReady=${serviceEvidencePostRunNoWriteback.ready ? 'yes' : 'no'}`);
  console.log(`postRunNoWritebackRequirements=${serviceEvidencePostRunNoWriteback.satisfiedRequirements.length}/${deferredInvocation.promotionRequirements.length}`);
  console.log(`postRunNoWritebackGates=${serviceEvidencePostRunNoWriteback.satisfiedGates.length}/${deferredInvocation.requiredGates.length}`);
  console.log(`postRunNoWritebackMissingRequirements=${serviceEvidencePostRunNoWriteback.missingRequirements.join(',') || 'none'}`);
  console.log(`postRunNoWritebackMissingGates=${serviceEvidencePostRunNoWriteback.missingGates.join(',') || 'none'}`);
  console.log(`postRunNoWritebackRunId=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'runId') ?? 'missing'}`);
  console.log(`postRunNoWritebackTerminalRunStatus=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'terminalRunStatus') ?? 'missing'}`);
  console.log(`postRunNoWritebackTerminalEvidence=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'terminalEvidence') ?? 'missing'}`);
  console.log(`postRunNoWritebackTerminalEvidenceSummary=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'terminalEvidenceSummary') ?? 'missing'}`);
  console.log(`postRunNoWritebackTerminalEvidenceSummaryChain=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'terminalEvidenceSummaryChain') ?? 'missing'}`);
  console.log(`postRunNoWritebackPostStepRunEvidenceChain=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'postStepRunEvidenceChain') ?? 'missing'}`);
  console.log(`postRunNoWritebackPostStepTaskEvidenceChain=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'postStepTaskEvidenceChain') ?? 'missing'}`);
  console.log(`postRunNoWritebackWriteIntentSupportedActionCount=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'writeIntentSupportedActionCount') ?? 'missing'}`);
  console.log(`postRunNoWritebackWriteIntentActions=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'writeIntentActions') ?? 'missing'}`);
  console.log(`postRunNoWritebackWriteIntentDeclaredActionCount=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'writeIntentDeclaredActionCount') ?? 'missing'}`);
  console.log(`postRunNoWritebackWriteIntentDeclaredActionEvidenceChain=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'writeIntentDeclaredActionEvidenceChain') ?? 'missing'}`);
  console.log(`postRunNoWritebackWriteIntentExtraction=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'writeIntentExtraction') ?? 'missing'}`);
  console.log(`postRunNoWritebackReviewedPatchApplyBoundary=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'reviewedPatchApplyBoundary') ?? 'missing'}`);
  console.log(`postRunNoWritebackReviewedPatchExplicitApply=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'reviewedPatchExplicitApply') ?? 'missing'}`);
  console.log(`postRunNoWritebackPatchPromotionPreflight=${scalarValue(serviceEvidencePostRunNoWriteback.summary, 'patchPromotionPreflight') ?? 'missing'}`);
  console.log(`noWriteRequiredPromotionReady=${serviceEvidenceNoWriteRequired.ready ? 'yes' : 'no'}`);
  console.log(`noWriteRequiredRequirements=${serviceEvidenceNoWriteRequired.satisfiedRequirements.length}/${deferredInvocation.promotionRequirements.length}`);
  console.log(`noWriteRequiredGates=${serviceEvidenceNoWriteRequired.satisfiedGates.length}/${deferredInvocation.requiredGates.length}`);
  console.log(`noWriteRequiredMissingRequirements=${serviceEvidenceNoWriteRequired.missingRequirements.join(',') || 'none'}`);
  console.log(`noWriteRequiredWriteIntentSupportedActionCount=${scalarValue(serviceEvidenceNoWriteRequired.summary, 'writeIntentSupportedActionCount') ?? 'missing'}`);
  console.log(`noWriteRequiredWriteIntentActions=${scalarValue(serviceEvidenceNoWriteRequired.summary, 'writeIntentActions') ?? 'missing'}`);
  console.log(`noWriteRequiredWriteIntentDeclaredActionCount=${scalarValue(serviceEvidenceNoWriteRequired.summary, 'writeIntentDeclaredActionCount') ?? 'missing'}`);
  console.log(`noWriteRequiredWriteIntentDeclaredActionEvidenceChain=${scalarValue(serviceEvidenceNoWriteRequired.summary, 'writeIntentDeclaredActionEvidenceChain') ?? 'missing'}`);
  console.log(`noWriteRequiredWriteIntentMode=${scalarValue(serviceEvidenceNoWriteRequired.summary, 'writeIntentMode') ?? 'missing'}`);
  console.log(`noWriteRequiredNoWriteIntentRequired=${scalarValue(serviceEvidenceNoWriteRequired.summary, 'noWriteIntentRequired') ?? 'missing'}`);
  console.log(`noWriteRequiredWriteIntentActionBoundary=${scalarValue(serviceEvidenceNoWriteRequired.summary, 'writeIntentActionBoundary') ?? 'missing'}`);
  console.log(`noWriteRequiredReviewedPatchApplyBoundary=${scalarValue(serviceEvidenceNoWriteRequired.summary, 'reviewedPatchApplyBoundary') ?? 'missing'}`);
  console.log(`noWriteRequiredNoWorkspaceWriteRequired=${scalarValue(serviceEvidenceNoWriteRequired.summary, 'noWorkspaceWriteRequired') ?? 'missing'}`);
  console.log(`noWriteRequiredPatchPromotionStatus=${scalarValue(serviceEvidenceNoWriteRequired.summary, 'patchPromotionStatus') ?? 'missing'}`);
  console.log(`sourceContextOnlyPromotionReady=${serviceEvidenceSourceContextOnly.ready ? 'yes' : 'no'}`);
  console.log(`sourceContextOnlyRequirements=${serviceEvidenceSourceContextOnly.satisfiedRequirements.length}/${deferredInvocation.promotionRequirements.length}`);
  console.log(`sourceContextOnlyGates=${serviceEvidenceSourceContextOnly.satisfiedGates.length}/${deferredInvocation.requiredGates.length}`);
  console.log(`sourceContextOnlyMissingRequirements=${serviceEvidenceSourceContextOnly.missingRequirements.join(',') || 'none'}`);
  console.log(`sourceContextOnlyWriteIntentSupportedActionCount=${scalarValue(serviceEvidenceSourceContextOnly.summary, 'writeIntentSupportedActionCount') ?? 'missing'}`);
  console.log(`sourceContextOnlyWriteIntentActions=${scalarValue(serviceEvidenceSourceContextOnly.summary, 'writeIntentActions') ?? 'missing'}`);
  console.log(`sourceContextOnlyWriteIntentDeclaredActionCount=${scalarValue(serviceEvidenceSourceContextOnly.summary, 'writeIntentDeclaredActionCount') ?? 'missing'}`);
  console.log(`sourceContextOnlyWriteIntentDeclaredActionEvidenceChain=${scalarValue(serviceEvidenceSourceContextOnly.summary, 'writeIntentDeclaredActionEvidenceChain') ?? 'missing'}`);
  console.log(`sourceContextOnlyWriteIntentActionIdentityChain=${scalarValue(serviceEvidenceSourceContextOnly.summary, 'writeIntentActionIdentityChain') ?? 'missing'}`);
  console.log(`sourceContextOnlyWriteIntentActionBoundary=${scalarValue(serviceEvidenceSourceContextOnly.summary, 'writeIntentActionBoundary') ?? 'missing'}`);
  console.log(`sourceContextOnlyReviewedPatchApplyBoundary=${scalarValue(serviceEvidenceSourceContextOnly.summary, 'reviewedPatchApplyBoundary') ?? 'missing'}`);
  console.log(`sourceContextOnlyNoWorkspaceWriteRequired=${scalarValue(serviceEvidenceSourceContextOnly.summary, 'noWorkspaceWriteRequired') ?? 'missing'}`);

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
    || scalarValue(serviceEvidencePartial.summary, 'providerPreflightStatus') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'providerConfigured') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'configuredProvider') !== 'openai'
    || scalarValue(serviceEvidencePartial.summary, 'configuredProviderEvidenceChain') !== 'ready'
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
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeProvider') !== 'openai'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeProviderEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentRun') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentRunEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentTask') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentTaskEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentExtraction') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'contextStep') !== 'step_context_ready'
    || scalarValue(serviceEvidencePartial.summary, 'contextStepTask') !== 'task_1'
    || scalarValue(serviceEvidencePartial.summary, 'contextStepTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'contextReadinessGateEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'contextManifestTask') !== 'task_1'
    || scalarValue(serviceEvidencePartial.summary, 'contextManifestEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'runtimeContextAssemblyGateEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'simplicityCheck') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'simplicityCheckTask') !== 'task_1'
    || scalarValue(serviceEvidencePartial.summary, 'simplicityCheckSmallestMovement') !== 'run_start'
    || scalarValue(serviceEvidencePartial.summary, 'simplicityCheckGateEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'runtimeAction') !== 'run_start'
    || scalarValue(serviceEvidencePartial.summary, 'runtimeActionStatus') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'runtimeActionSurface') !== 'run'
    || scalarValue(serviceEvidencePartial.summary, 'runtimeActionRun') !== 'run_api_execution_partial'
    || scalarValue(serviceEvidencePartial.summary, 'runtimeActionRunIdentityChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'runtimeActionTask') !== 'task_1'
    || scalarValue(serviceEvidencePartial.summary, 'runtimeActionGateEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidance') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidanceCount') !== '0'
    || scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidanceTask') !== 'task_1'
    || scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidanceTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'taskMemoryCoverage') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'taskMemoryCoverageTask') !== 'task_1'
    || scalarValue(serviceEvidencePartial.summary, 'taskMemoryCoverageEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'taskMemoryCoverageGateEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'taskMemoryGuidanceGateEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'runGoalConditions') !== '1'
    || scalarValue(serviceEvidencePartial.summary, 'runGoalRun') !== 'run_api_execution_partial'
    || scalarValue(serviceEvidencePartial.summary, 'runGoalRunEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'runGoalTask') !== 'task_1'
    || scalarValue(serviceEvidencePartial.summary, 'runGoalTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'preStepGateEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'subtaskStart') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'subtaskStartTask') !== 'task_1'
    || scalarValue(serviceEvidencePartial.summary, 'subtaskStartEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'subtaskStartGateEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentActions') !== 'none'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentActionIdentityChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentDeclaredActionEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'reviewedPatchExplicitApply') !== 'no'
    || scalarValue(serviceEvidencePartial.summary, 'patchPromotionPreflight') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'runtimeMode') !== 'api'
    || scalarValue(serviceEvidencePartial.summary, 'invocationLayer') !== 'api_runtime'
    || serviceEvidenceArtifactOnly.ready
    || !serviceEvidenceArtifactOnly.missingRequirements.includes('write_intent_extraction')
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentSupportedActionCount') !== '1'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentActions') !== 'artifact.propose'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentDeclaredActionCount') !== '1'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentDeclaredActionEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentExtraction') !== 'ready'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentActionIdentityChain') !== 'missing'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentRunEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'writeIntentTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'taskMemoryGuidanceTask') !== 'task_1'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'taskMemoryGuidanceTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'postStepRunEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'postStepTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'terminalRunStatus') !== 'completed'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'terminalRunStatusEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'terminalEvidenceSummary') !== 'output_chars=42'
    || scalarValue(serviceEvidenceArtifactOnly.summary, 'terminalEvidenceSummaryChain') !== 'ready'
    || serviceEvidencePostRunNoWriteback.ready
    || serviceEvidencePostRunNoWriteback.satisfiedRequirements.length !== 9
    || serviceEvidencePostRunNoWriteback.satisfiedGates.length !== 9
    || !serviceEvidencePostRunNoWriteback.missingRequirements.includes('write_intent_extraction')
    || !serviceEvidencePostRunNoWriteback.missingRequirements.includes('reviewed_patch_apply_boundary')
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'runId') !== 'run_api_execution'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'terminalRunStatus') !== 'completed'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'terminalEvidence') !== 'present'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'terminalEvidenceSummary') !== 'output_chars=42'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'terminalEvidenceSummaryChain') !== 'ready'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'postStepRunEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'postStepTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'writeIntentSupportedActionCount') !== '0'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'writeIntentActions') !== 'none'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'writeIntentDeclaredActionCount') !== '0'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'writeIntentDeclaredActionEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'writeIntentExtraction') !== 'missing'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'reviewedPatchApplyBoundary') !== 'missing'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'reviewedPatchExplicitApply') !== 'no'
    || scalarValue(serviceEvidencePostRunNoWriteback.summary, 'patchPromotionPreflight') !== 'missing'
    || !serviceEvidenceNoWriteRequired.ready
    || serviceEvidenceNoWriteRequired.satisfiedRequirements.length !== 11
    || serviceEvidenceNoWriteRequired.satisfiedGates.length !== 9
    || serviceEvidenceNoWriteRequired.missingRequirements.length !== 0
    || scalarValue(serviceEvidenceNoWriteRequired.summary, 'writeIntentSupportedActionCount') !== '0'
    || scalarValue(serviceEvidenceNoWriteRequired.summary, 'writeIntentActions') !== 'none'
    || scalarValue(serviceEvidenceNoWriteRequired.summary, 'writeIntentDeclaredActionCount') !== '0'
    || scalarValue(serviceEvidenceNoWriteRequired.summary, 'writeIntentDeclaredActionEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceNoWriteRequired.summary, 'writeIntentMode') !== 'no_write_intents_required'
    || scalarValue(serviceEvidenceNoWriteRequired.summary, 'noWriteIntentRequired') !== 'yes'
    || scalarValue(serviceEvidenceNoWriteRequired.summary, 'writeIntentActionBoundary') !== 'ready'
    || scalarValue(serviceEvidenceNoWriteRequired.summary, 'reviewedPatchApplyBoundary') !== 'ready'
    || scalarValue(serviceEvidenceNoWriteRequired.summary, 'noWorkspaceWriteRequired') !== 'yes'
    || scalarValue(serviceEvidenceNoWriteRequired.summary, 'patchPromotionStatus') !== 'not_required'
    || !serviceEvidenceSourceContextOnly.ready
    || serviceEvidenceSourceContextOnly.satisfiedRequirements.length !== 11
    || serviceEvidenceSourceContextOnly.satisfiedGates.length !== 9
    || serviceEvidenceSourceContextOnly.missingRequirements.length !== 0
    || scalarValue(serviceEvidenceSourceContextOnly.summary, 'writeIntentSupportedActionCount') !== '1'
    || scalarValue(serviceEvidenceSourceContextOnly.summary, 'writeIntentActions') !== 'source_context.create'
    || scalarValue(serviceEvidenceSourceContextOnly.summary, 'writeIntentDeclaredActionCount') !== '1'
    || scalarValue(serviceEvidenceSourceContextOnly.summary, 'writeIntentDeclaredActionEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceSourceContextOnly.summary, 'writeIntentActionIdentityChain') !== 'ready'
    || scalarValue(serviceEvidenceSourceContextOnly.summary, 'writeIntentActionBoundary') !== 'ready'
    || scalarValue(serviceEvidenceSourceContextOnly.summary, 'reviewedPatchApplyBoundary') !== 'ready'
    || scalarValue(serviceEvidenceSourceContextOnly.summary, 'noWorkspaceWriteRequired') !== 'yes'
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
