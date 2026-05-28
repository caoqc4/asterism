#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const modulePath = path.join(root, 'dist-electron', 'shared', 'runtime-patch-promotion-routing.js');

export async function runRuntimePatchPromotionRoutingReadinessSmoke() {
  console.log('Runtime patch promotion routing readiness smoke');
  console.log('mode=read-only');
  console.log('provider=not-called');
  console.log('workspace=unchanged');
  console.log('workspaceApply=not-attempted');
  console.log('promotionInProduct=explicit_apply_only');

  if (!fs.existsSync(modulePath)) {
    console.log('status=skip');
    console.log('skipReason=build_required');
    console.log('run npm run build:main before this smoke');
    return 0;
  }

  const {
    evaluateRuntimePatchPromotionRoutingReadiness,
    evaluateRuntimePatchPromotionRoutingReadinessFromEvidence,
  } = await import(pathToFileURL(modulePath).href);

  const blocked = evaluateRuntimePatchPromotionRoutingReadiness({
    patchArtifactReady: true,
    promotionDecisionReady: true,
  });
  const sameRunBlocked = evaluateRuntimePatchPromotionRoutingReadiness({
    explicitOperatorApply: true,
    patchArtifactReady: true,
    postApplyRunEvidenceReady: true,
    promotionDecisionReady: true,
    promotionPreflightReady: true,
    sameRunEvidenceChainReady: false,
    selectedRuntimeContractReady: true,
    targetTaskIdentityReady: true,
  });
  const syntheticReady = evaluateRuntimePatchPromotionRoutingReadiness({
    explicitOperatorApply: true,
    patchArtifactReady: true,
    postApplyRunEvidenceReady: true,
    promotionDecisionReady: true,
    promotionPreflightReady: true,
    sameRunEvidenceChainReady: true,
    selectedRuntimeContractReady: true,
    targetTaskIdentityReady: true,
  });
  const serviceEvidencePartial = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
    patchArtifact: {
      artifactId: 'artifact_patch_1',
      kind: 'patch',
      runId: 'run_patch_1',
      status: 'ready',
    },
    promotionDecision: {
      checkpointId: 'checkpoint_patch_1',
      decisionId: 'decision_patch_1',
      runId: 'run_patch_1',
      status: 'approved',
    },
    promotionPreflight: {
      checkpointId: 'checkpoint_patch_1',
      runId: 'run_patch_2',
      status: 'ready',
    },
    selectedRuntimeContract: {
      invocationLayer: 'api_runtime',
      phase: 'execution_run',
      runtimeMode: 'api',
    },
    targetTaskId: 'task_1',
  });

  console.log(`blockedPromotionReady=${blocked.ready ? 'yes' : 'no'}`);
  console.log(`blockedRequirements=${blocked.satisfiedRequirements.length}/8`);
  console.log(`blockedMissingRequirements=${blocked.missingRequirements.join(',') || 'none'}`);
  console.log(`sameRunBlockedPromotionReady=${sameRunBlocked.ready ? 'yes' : 'no'}`);
  console.log(`sameRunBlockedRequirements=${sameRunBlocked.satisfiedRequirements.length}/8`);
  console.log(`sameRunBlockedMissingRequirements=${sameRunBlocked.missingRequirements.join(',') || 'none'}`);
  console.log(`syntheticPromotionReady=${syntheticReady.ready ? 'yes' : 'no'}`);
  console.log(`syntheticRequirements=${syntheticReady.satisfiedRequirements.length}/8`);
  console.log(`syntheticMissingRequirements=${syntheticReady.missingRequirements.join(',') || 'none'}`);
  console.log(`serviceEvidencePromotionReady=${serviceEvidencePartial.ready ? 'yes' : 'no'}`);
  console.log(`serviceEvidenceRequirements=${serviceEvidencePartial.satisfiedRequirements.length}/8`);
  console.log(`serviceEvidenceMissingRequirements=${serviceEvidencePartial.missingRequirements.join(',') || 'none'}`);

  if (
    blocked.ready
    || sameRunBlocked.ready
    || !sameRunBlocked.missingRequirements.includes('same_run_evidence_chain')
    || !syntheticReady.ready
    || serviceEvidencePartial.ready
    || serviceEvidencePartial.satisfiedRequirements.length !== 5
    || !serviceEvidencePartial.missingRequirements.includes('same_run_evidence_chain')
  ) {
    console.log('status=failed');
    return 1;
  }

  console.log('status=passed');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runRuntimePatchPromotionRoutingReadinessSmoke();
}
