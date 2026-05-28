#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const modulePath = path.join(root, 'dist-electron', 'shared', 'runtime-patch-promotion-routing.js');
const sourceModulePath = path.join(root, 'src', 'shared', 'runtime-patch-promotion-routing.ts');

export async function runRuntimePatchPromotionRoutingReadinessSmoke() {
  console.log('Runtime patch promotion routing readiness smoke');
  console.log('mode=read-only');
  console.log('provider=not-called');
  console.log('workspace=unchanged');
  console.log('workspaceApply=not-attempted');
  console.log('promotionInProduct=explicit_apply_only');

  if (!fs.existsSync(modulePath) || sourceIsNewerThanBuild()) {
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
      expectedFiles: ['src/app.ts'],
      kind: 'patch',
      runId: 'run_patch_1',
      status: 'ready',
      taskId: 'task_1',
    },
    promotionDecision: {
      checkpointId: 'checkpoint_patch_1',
      decisionId: 'decision_patch_1',
      runId: 'run_patch_1',
      status: 'approved',
      taskId: 'task_1',
    },
    promotionPreflight: {
      checkpointId: 'checkpoint_patch_1',
      runId: 'run_patch_2',
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
  console.log(`serviceEvidencePatchArtifactId=${scalarValue(serviceEvidencePartial.summary, 'patchArtifactId') ?? 'missing'}`);
  console.log(`serviceEvidencePromotionDecisionId=${scalarValue(serviceEvidencePartial.summary, 'promotionDecisionId') ?? 'missing'}`);
  console.log(`serviceEvidenceTargetTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'targetTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceCheckpointEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'checkpointEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceOperatorId=${scalarValue(serviceEvidencePartial.summary, 'operatorId') ?? 'missing'}`);
  console.log(`serviceEvidencePatchRunId=${scalarValue(serviceEvidencePartial.summary, 'patchRunId') ?? 'missing'}`);
  console.log(`serviceEvidenceDecisionRunId=${scalarValue(serviceEvidencePartial.summary, 'decisionRunId') ?? 'missing'}`);
  console.log(`serviceEvidencePreflightRunId=${scalarValue(serviceEvidencePartial.summary, 'preflightRunId') ?? 'missing'}`);
  console.log(`serviceEvidenceSameRunId=${scalarValue(serviceEvidencePartial.summary, 'sameRunId') ?? 'missing'}`);
  console.log(`serviceEvidenceExpectedFileCount=${scalarValue(serviceEvidencePartial.summary, 'expectedFileCount') ?? 'missing'}`);
  console.log(`serviceEvidenceExpectedFiles=${scalarValue(serviceEvidencePartial.summary, 'expectedFiles') ?? 'missing'}`);
  console.log(`serviceEvidenceTouchedFileCount=${scalarValue(serviceEvidencePartial.summary, 'touchedFileCount') ?? 'missing'}`);
  console.log(`serviceEvidenceTouchedFileEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'touchedFileEvidenceChain') ?? 'missing'}`);

  if (
    blocked.ready
    || sameRunBlocked.ready
    || !sameRunBlocked.missingRequirements.includes('same_run_evidence_chain')
    || !syntheticReady.ready
    || serviceEvidencePartial.ready
    || serviceEvidencePartial.satisfiedRequirements.length !== 4
    || !serviceEvidencePartial.missingRequirements.includes('same_run_evidence_chain')
    || scalarValue(serviceEvidencePartial.summary, 'patchArtifactId') !== 'artifact_patch_1'
    || scalarValue(serviceEvidencePartial.summary, 'promotionDecisionId') !== 'decision_patch_1'
    || (scalarValue(serviceEvidencePartial.summary, 'targetTaskEvidenceChain') ?? 'missing') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'checkpointEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'operatorId') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'patchRunId') !== 'run_patch_1'
    || scalarValue(serviceEvidencePartial.summary, 'decisionRunId') !== 'run_patch_1'
    || scalarValue(serviceEvidencePartial.summary, 'preflightRunId') !== 'run_patch_2'
    || scalarValue(serviceEvidencePartial.summary, 'sameRunId') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'expectedFileCount') !== '1'
    || scalarValue(serviceEvidencePartial.summary, 'expectedFiles') !== 'src/app.ts'
    || scalarValue(serviceEvidencePartial.summary, 'touchedFileCount') !== '0'
    || scalarValue(serviceEvidencePartial.summary, 'touchedFileEvidenceChain') !== 'missing'
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
  process.exitCode = await runRuntimePatchPromotionRoutingReadinessSmoke();
}
