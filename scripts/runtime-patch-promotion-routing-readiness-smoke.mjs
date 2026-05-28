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
      artifactId: 'artifact_patch_1',
      checkpointId: 'checkpoint_patch_1',
      decisionId: 'decision_patch_1',
      runId: 'run_patch_1',
      status: 'approved',
      taskId: 'task_1',
    },
    promotionPreflight: {
      artifactId: 'artifact_patch_1',
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
  console.log(`serviceEvidenceSelectedRuntimeRun=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeRun') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeRunEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeRunEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeTask=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeTask') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidencePatchArtifactId=${scalarValue(serviceEvidencePartial.summary, 'patchArtifactId') ?? 'missing'}`);
  console.log(`serviceEvidenceDecisionArtifactId=${scalarValue(serviceEvidencePartial.summary, 'decisionArtifactId') ?? 'missing'}`);
  console.log(`serviceEvidencePreflightArtifactId=${scalarValue(serviceEvidencePartial.summary, 'preflightArtifactId') ?? 'missing'}`);
  console.log(`serviceEvidenceDecisionArtifactEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'decisionArtifactEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceArtifactEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'artifactEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidencePromotionDecisionId=${scalarValue(serviceEvidencePartial.summary, 'promotionDecisionId') ?? 'missing'}`);
  console.log(`serviceEvidenceTargetTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'targetTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceCheckpointEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'checkpointEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceOperatorId=${scalarValue(serviceEvidencePartial.summary, 'operatorId') ?? 'missing'}`);
  console.log(`serviceEvidenceOperatorApplyTask=${scalarValue(serviceEvidencePartial.summary, 'operatorApplyTask') ?? 'missing'}`);
  console.log(`serviceEvidenceOperatorApplyRun=${scalarValue(serviceEvidencePartial.summary, 'operatorApplyRun') ?? 'missing'}`);
  console.log(`serviceEvidenceOperatorApplyCheckpoint=${scalarValue(serviceEvidencePartial.summary, 'operatorApplyCheckpoint') ?? 'missing'}`);
  console.log(`serviceEvidenceOperatorApplyEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'operatorApplyEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidencePatchRunId=${scalarValue(serviceEvidencePartial.summary, 'patchRunId') ?? 'missing'}`);
  console.log(`serviceEvidenceDecisionRunId=${scalarValue(serviceEvidencePartial.summary, 'decisionRunId') ?? 'missing'}`);
  console.log(`serviceEvidencePreflightRunId=${scalarValue(serviceEvidencePartial.summary, 'preflightRunId') ?? 'missing'}`);
  console.log(`serviceEvidenceSameRunId=${scalarValue(serviceEvidencePartial.summary, 'sameRunId') ?? 'missing'}`);
  console.log(`serviceEvidenceExpectedFileCount=${scalarValue(serviceEvidencePartial.summary, 'expectedFileCount') ?? 'missing'}`);
  console.log(`serviceEvidenceExpectedFiles=${scalarValue(serviceEvidencePartial.summary, 'expectedFiles') ?? 'missing'}`);
  console.log(`serviceEvidenceExpectedFileEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'expectedFileEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceTouchedFileCount=${scalarValue(serviceEvidencePartial.summary, 'touchedFileCount') ?? 'missing'}`);
  console.log(`serviceEvidenceFilePathSafetyChain=${scalarValue(serviceEvidencePartial.summary, 'filePathSafetyChain') ?? 'missing'}`);
  console.log(`serviceEvidenceTouchedFileEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'touchedFileEvidenceChain') ?? 'missing'}`);

  if (
    blocked.ready
    || sameRunBlocked.ready
    || !sameRunBlocked.missingRequirements.includes('same_run_evidence_chain')
    || !syntheticReady.ready
    || serviceEvidencePartial.ready
    || serviceEvidencePartial.satisfiedRequirements.length !== 3
    || !serviceEvidencePartial.missingRequirements.includes('selected_runtime_contract')
    || !serviceEvidencePartial.missingRequirements.includes('same_run_evidence_chain')
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeRun') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeRunEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeTask') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeTaskEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'patchArtifactId') !== 'artifact_patch_1'
    || scalarValue(serviceEvidencePartial.summary, 'decisionArtifactId') !== 'artifact_patch_1'
    || scalarValue(serviceEvidencePartial.summary, 'preflightArtifactId') !== 'artifact_patch_1'
    || scalarValue(serviceEvidencePartial.summary, 'decisionArtifactEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'artifactEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'promotionDecisionId') !== 'decision_patch_1'
    || (scalarValue(serviceEvidencePartial.summary, 'targetTaskEvidenceChain') ?? 'missing') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'checkpointEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'operatorId') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'operatorApplyTask') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'operatorApplyRun') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'operatorApplyCheckpoint') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'operatorApplyEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'patchRunId') !== 'run_patch_1'
    || scalarValue(serviceEvidencePartial.summary, 'decisionRunId') !== 'run_patch_1'
    || scalarValue(serviceEvidencePartial.summary, 'preflightRunId') !== 'run_patch_2'
    || scalarValue(serviceEvidencePartial.summary, 'sameRunId') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'expectedFileCount') !== '1'
    || scalarValue(serviceEvidencePartial.summary, 'expectedFiles') !== 'src/app.ts'
    || scalarValue(serviceEvidencePartial.summary, 'expectedFileEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'touchedFileCount') !== '0'
    || scalarValue(serviceEvidencePartial.summary, 'filePathSafetyChain') !== 'missing'
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
