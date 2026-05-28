#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const modulePath = path.join(root, 'dist-electron', 'shared', 'ai-runtime-invocation.js');

export async function runAgentApiPromotionReadinessSmoke() {
  console.log('Agent API promotion readiness smoke');
  console.log('mode=read-only');
  console.log('provider=not-called');
  console.log('workspace=unchanged');
  console.log('promotionInProduct=deferred');

  if (!fs.existsSync(modulePath)) {
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
      startupProbe: 'not_called',
      status: 'ready',
    },
    selectedRuntimeContract: {
      invocationLayer: 'api_runtime',
      phase: 'execution_run',
      runtimeMode: 'api',
    },
    targetTaskId: 'task_1',
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
  console.log(`serviceEvidenceProviderConfigured=${scalarValue(serviceEvidencePartial.summary, 'providerConfigured') ?? 'missing'}`);
  console.log(`serviceEvidenceConfiguredProvider=${scalarValue(serviceEvidencePartial.summary, 'configuredProvider') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderStartupProbe=${scalarValue(serviceEvidencePartial.summary, 'providerStartupProbe') ?? 'missing'}`);
  console.log(`serviceEvidenceRunId=${scalarValue(serviceEvidencePartial.summary, 'runId') ?? 'missing'}`);
  console.log(`serviceEvidenceContextStep=${scalarValue(serviceEvidencePartial.summary, 'contextStep') ?? 'missing'}`);
  console.log(`serviceEvidenceWriteIntentActions=${scalarValue(serviceEvidencePartial.summary, 'writeIntentActions') ?? 'missing'}`);
  console.log(`serviceEvidenceRuntimeMode=${scalarValue(serviceEvidencePartial.summary, 'runtimeMode') ?? 'missing'}`);
  console.log(`serviceEvidenceInvocationLayer=${scalarValue(serviceEvidencePartial.summary, 'invocationLayer') ?? 'missing'}`);

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
    || scalarValue(serviceEvidencePartial.summary, 'providerConfigured') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'configuredProvider') !== 'openai'
    || scalarValue(serviceEvidencePartial.summary, 'providerStartupProbe') !== 'not_called'
    || scalarValue(serviceEvidencePartial.summary, 'runId') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'contextStep') !== 'step_context_ready'
    || scalarValue(serviceEvidencePartial.summary, 'writeIntentActions') !== 'none'
    || scalarValue(serviceEvidencePartial.summary, 'runtimeMode') !== 'api'
    || scalarValue(serviceEvidencePartial.summary, 'invocationLayer') !== 'api_runtime'
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

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runAgentApiPromotionReadinessSmoke();
}
