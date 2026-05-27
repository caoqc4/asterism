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

  console.log(`blockedPromotionReady=${blocked.ready ? 'yes' : 'no'}`);
  console.log(`blockedRequirements=${blocked.satisfiedRequirements.length}/8`);
  console.log(`blockedMissingRequirements=${blocked.missingRequirements.join(',') || 'none'}`);
  console.log(`sameRunBlockedPromotionReady=${sameRunBlocked.ready ? 'yes' : 'no'}`);
  console.log(`sameRunBlockedRequirements=${sameRunBlocked.satisfiedRequirements.length}/8`);
  console.log(`sameRunBlockedMissingRequirements=${sameRunBlocked.missingRequirements.join(',') || 'none'}`);
  console.log(`syntheticPromotionReady=${syntheticReady.ready ? 'yes' : 'no'}`);
  console.log(`syntheticRequirements=${syntheticReady.satisfiedRequirements.length}/8`);
  console.log(`syntheticMissingRequirements=${syntheticReady.missingRequirements.join(',') || 'none'}`);

  if (
    blocked.ready
    || sameRunBlocked.ready
    || !sameRunBlocked.missingRequirements.includes('same_run_evidence_chain')
    || !syntheticReady.ready
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
