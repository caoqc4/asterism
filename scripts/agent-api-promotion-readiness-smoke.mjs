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

  if (
    deferredInvocation.status !== 'skipped'
    || deferredReadiness.ready
    || partialReadiness.ready
    || !syntheticReady.ready
  ) {
    console.log('status=failed');
    return 1;
  }

  console.log('status=passed');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runAgentApiPromotionReadinessSmoke();
}
