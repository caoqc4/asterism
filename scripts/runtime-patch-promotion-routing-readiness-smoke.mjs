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
    providerConfiguration: {
      configuredProvider: 'openai',
      providerConfigured: true,
    },
    selectedRuntimeContract: {
      invocationLayer: 'api_runtime',
      phase: 'execution_run',
      provider: 'openai',
      runtimeMode: 'api',
    },
    targetTaskId: 'task_1',
  });
  const serviceEvidenceReady = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
    explicitOperatorApply: {
      checkpointId: 'checkpoint_patch_1',
      confirmed: true,
      operatorId: 'local_operator',
      surface: 'ipc_explicit_apply',
      runId: 'run_patch_1',
      taskId: 'task_1',
    },
    patchArtifact: {
      artifactId: 'artifact_patch_1',
      expectedFiles: ['src/app.ts'],
      kind: 'patch',
      runId: 'run_patch_1',
      status: 'ready',
      taskId: 'task_1',
    },
    postApplyRunEvidence: {
      runId: 'run_patch_1',
      status: 'present',
      taskId: 'task_1',
      touchedFiles: ['src/app.ts'],
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
      runId: 'run_patch_1',
      status: 'ready',
      taskId: 'task_1',
    },
    providerConfiguration: {
      configuredProvider: 'openai',
      providerConfigured: true,
    },
    selectedRuntimeContract: {
      invocationLayer: 'api_runtime',
      phase: 'execution_run',
      provider: 'openai',
      runId: 'run_patch_1',
      runtimeMode: 'api',
      taskId: 'task_1',
    },
    targetTaskId: 'task_1',
  });
  const selectedRuntimeMismatch = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
    explicitOperatorApply: {
      checkpointId: 'checkpoint_patch_1',
      confirmed: true,
      operatorId: 'local_operator',
      surface: 'ipc_explicit_apply',
      runId: 'run_patch_1',
      taskId: 'task_1',
    },
    patchArtifact: {
      artifactId: 'artifact_patch_1',
      expectedFiles: ['src/app.ts'],
      kind: 'patch',
      runId: 'run_patch_1',
      status: 'ready',
      taskId: 'task_1',
    },
    postApplyRunEvidence: {
      runId: 'run_patch_1',
      status: 'present',
      taskId: 'task_1',
      touchedFiles: ['src/app.ts'],
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
      runId: 'run_patch_1',
      status: 'ready',
      taskId: 'task_1',
    },
    providerConfiguration: {
      configuredProvider: 'openai',
      providerConfigured: true,
    },
    selectedRuntimeContract: {
      invocationLayer: 'api_runtime',
      phase: 'execution_run',
      provider: 'openai',
      runId: 'run_other',
      runtimeMode: 'api',
      taskId: 'task_1',
    },
    targetTaskId: 'task_1',
  });

  console.log(`blockedPromotionReady=${blocked.ready ? 'yes' : 'no'}`);
  console.log(`blockedRequirements=${blocked.satisfiedRequirements.length}/8`);
  console.log(`blockedMissingRequirements=${blocked.missingRequirements.join(',') || 'none'}`);
  console.log(`blockedDirectRuntimeWorkspaceWrite=${scalarValue(blocked.summary, 'directRuntimeWorkspaceWrite') ?? 'missing'}`);
  console.log(`blockedWorkspaceMutationPath=${scalarValue(blocked.summary, 'workspaceMutationPath') ?? 'missing'}`);
  console.log(`sameRunBlockedPromotionReady=${sameRunBlocked.ready ? 'yes' : 'no'}`);
  console.log(`sameRunBlockedRequirements=${sameRunBlocked.satisfiedRequirements.length}/8`);
  console.log(`sameRunBlockedMissingRequirements=${sameRunBlocked.missingRequirements.join(',') || 'none'}`);
  console.log(`syntheticPromotionReady=${syntheticReady.ready ? 'yes' : 'no'}`);
  console.log(`syntheticRequirements=${syntheticReady.satisfiedRequirements.length}/8`);
  console.log(`syntheticMissingRequirements=${syntheticReady.missingRequirements.join(',') || 'none'}`);
  console.log(`syntheticDirectRuntimeWorkspaceWrite=${scalarValue(syntheticReady.summary, 'directRuntimeWorkspaceWrite') ?? 'missing'}`);
  console.log(`syntheticWorkspaceMutationPath=${scalarValue(syntheticReady.summary, 'workspaceMutationPath') ?? 'missing'}`);
  console.log(`serviceEvidencePromotionReady=${serviceEvidencePartial.ready ? 'yes' : 'no'}`);
  console.log(`serviceEvidenceRequirements=${serviceEvidencePartial.satisfiedRequirements.length}/8`);
  console.log(`serviceEvidenceMissingRequirements=${serviceEvidencePartial.missingRequirements.join(',') || 'none'}`);
  console.log(`serviceEvidenceDirectRuntimeWorkspaceWrite=${scalarValue(serviceEvidencePartial.summary, 'directRuntimeWorkspaceWrite') ?? 'missing'}`);
  console.log(`serviceEvidenceWorkspaceMutationPath=${scalarValue(serviceEvidencePartial.summary, 'workspaceMutationPath') ?? 'missing'}`);
  console.log(`serviceEvidenceReadyPromotionReady=${serviceEvidenceReady.ready ? 'yes' : 'no'}`);
  console.log(`serviceEvidenceReadyRequirements=${serviceEvidenceReady.satisfiedRequirements.length}/8`);
  console.log(`serviceEvidenceReadyMissingRequirements=${serviceEvidenceReady.missingRequirements.join(',') || 'none'}`);
  console.log(`serviceEvidenceReadyDirectRuntimeWorkspaceWrite=${scalarValue(serviceEvidenceReady.summary, 'directRuntimeWorkspaceWrite') ?? 'missing'}`);
  console.log(`serviceEvidenceReadyWorkspaceMutationPath=${scalarValue(serviceEvidenceReady.summary, 'workspaceMutationPath') ?? 'missing'}`);
  console.log(`serviceEvidenceReadySelectedRuntimeContract=${scalarValue(serviceEvidenceReady.summary, 'selectedRuntimeContract') ?? 'missing'}`);
  console.log(`serviceEvidenceReadyTargetTaskEvidenceChain=${scalarValue(serviceEvidenceReady.summary, 'targetTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceReadyOperatorApplyEvidenceChain=${scalarValue(serviceEvidenceReady.summary, 'operatorApplyEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceReadyOperatorApplySurface=${scalarValue(serviceEvidenceReady.summary, 'operatorApplySurface') ?? 'missing'}`);
  console.log(`serviceEvidenceReadyOperatorApplySurfaceEvidenceChain=${scalarValue(serviceEvidenceReady.summary, 'operatorApplySurfaceEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceReadySameRunId=${scalarValue(serviceEvidenceReady.summary, 'sameRunId') ?? 'missing'}`);
  console.log(`serviceEvidenceReadyPostApplyFilesMatched=${scalarValue(serviceEvidenceReady.summary, 'postApplyFilesMatched') ?? 'missing'}`);
  console.log(`selectedRuntimeMismatchPromotionReady=${selectedRuntimeMismatch.ready ? 'yes' : 'no'}`);
  console.log(`selectedRuntimeMismatchRequirements=${selectedRuntimeMismatch.satisfiedRequirements.length}/8`);
  console.log(`selectedRuntimeMismatchMissingRequirements=${selectedRuntimeMismatch.missingRequirements.join(',') || 'none'}`);
  console.log(`selectedRuntimeMismatchSelectedRuntimeRun=${scalarValue(selectedRuntimeMismatch.summary, 'selectedRuntimeRun') ?? 'missing'}`);
  console.log(`selectedRuntimeMismatchSelectedRuntimeRunEvidenceChain=${scalarValue(selectedRuntimeMismatch.summary, 'selectedRuntimeRunEvidenceChain') ?? 'missing'}`);
  console.log(`selectedRuntimeMismatchSameRunEvidenceChain=${scalarValue(selectedRuntimeMismatch.summary, 'sameRunEvidenceChain') ?? 'missing'}`);
  console.log(`selectedRuntimeMismatchSameRunId=${scalarValue(selectedRuntimeMismatch.summary, 'sameRunId') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeRun=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeRun') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeRunEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeRunEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeTask=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeTask') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeProvider=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeProvider') ?? 'missing'}`);
  console.log(`serviceEvidenceSelectedRuntimeProviderEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeProviderEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceProviderConfigured=${scalarValue(serviceEvidencePartial.summary, 'providerConfigured') ?? 'missing'}`);
  console.log(`serviceEvidenceConfiguredProvider=${scalarValue(serviceEvidencePartial.summary, 'configuredProvider') ?? 'missing'}`);
  console.log(`serviceEvidenceConfiguredProviderEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'configuredProviderEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidencePatchArtifactId=${scalarValue(serviceEvidencePartial.summary, 'patchArtifactId') ?? 'missing'}`);
  console.log(`serviceEvidenceDecisionArtifactId=${scalarValue(serviceEvidencePartial.summary, 'decisionArtifactId') ?? 'missing'}`);
  console.log(`serviceEvidencePreflightArtifactId=${scalarValue(serviceEvidencePartial.summary, 'preflightArtifactId') ?? 'missing'}`);
  console.log(`serviceEvidenceDecisionArtifactEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'decisionArtifactEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceArtifactEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'artifactEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidencePromotionDecisionId=${scalarValue(serviceEvidencePartial.summary, 'promotionDecisionId') ?? 'missing'}`);
  console.log(`serviceEvidenceTargetTaskEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'targetTaskEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceCheckpointEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'checkpointEvidenceChain') ?? 'missing'}`);
  console.log(`serviceEvidenceOperatorId=${scalarValue(serviceEvidencePartial.summary, 'operatorId') ?? 'missing'}`);
  console.log(`serviceEvidenceOperatorApplySurface=${scalarValue(serviceEvidencePartial.summary, 'operatorApplySurface') ?? 'missing'}`);
  console.log(`serviceEvidenceOperatorApplySurfaceEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'operatorApplySurfaceEvidenceChain') ?? 'missing'}`);
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
  console.log(`serviceEvidencePostApplyFilesMatched=${scalarValue(serviceEvidencePartial.summary, 'postApplyFilesMatched') ?? 'missing'}`);
  console.log(`serviceEvidenceFilePathSafetyChain=${scalarValue(serviceEvidencePartial.summary, 'filePathSafetyChain') ?? 'missing'}`);
  console.log(`serviceEvidenceTouchedFileEvidenceChain=${scalarValue(serviceEvidencePartial.summary, 'touchedFileEvidenceChain') ?? 'missing'}`);

  if (
    blocked.ready
    || sameRunBlocked.ready
    || !sameRunBlocked.missingRequirements.includes('same_run_evidence_chain')
    || !syntheticReady.ready
    || scalarValue(blocked.summary, 'directRuntimeWorkspaceWrite') !== 'blocked'
    || scalarValue(blocked.summary, 'workspaceMutationPath') !== 'explicit_operator_apply_only'
    || scalarValue(syntheticReady.summary, 'directRuntimeWorkspaceWrite') !== 'blocked'
    || scalarValue(syntheticReady.summary, 'workspaceMutationPath') !== 'explicit_operator_apply_only'
    || serviceEvidencePartial.ready
    || serviceEvidencePartial.satisfiedRequirements.length !== 2
    || !serviceEvidencePartial.missingRequirements.includes('selected_runtime_contract')
    || !serviceEvidencePartial.missingRequirements.includes('promotion_preflight')
    || !serviceEvidencePartial.missingRequirements.includes('same_run_evidence_chain')
    || scalarValue(serviceEvidencePartial.summary, 'directRuntimeWorkspaceWrite') !== 'blocked'
    || scalarValue(serviceEvidencePartial.summary, 'workspaceMutationPath') !== 'explicit_operator_apply_only'
    || !serviceEvidenceReady.ready
    || serviceEvidenceReady.satisfiedRequirements.length !== 8
    || serviceEvidenceReady.missingRequirements.length !== 0
    || scalarValue(serviceEvidenceReady.summary, 'directRuntimeWorkspaceWrite') !== 'blocked'
    || scalarValue(serviceEvidenceReady.summary, 'workspaceMutationPath') !== 'explicit_operator_apply_only'
    || scalarValue(serviceEvidenceReady.summary, 'selectedRuntimeContract') !== 'ready'
    || scalarValue(serviceEvidenceReady.summary, 'targetTaskEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceReady.summary, 'operatorApplyEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceReady.summary, 'operatorApplySurface') !== 'ipc_explicit_apply'
    || scalarValue(serviceEvidenceReady.summary, 'operatorApplySurfaceEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidenceReady.summary, 'sameRunId') !== 'run_patch_1'
    || scalarValue(serviceEvidenceReady.summary, 'postApplyFilesMatched') !== 'yes'
    || selectedRuntimeMismatch.ready
    || selectedRuntimeMismatch.satisfiedRequirements.length !== 6
    || !selectedRuntimeMismatch.missingRequirements.includes('selected_runtime_contract')
    || !selectedRuntimeMismatch.missingRequirements.includes('same_run_evidence_chain')
    || scalarValue(selectedRuntimeMismatch.summary, 'selectedRuntimeRun') !== 'run_other'
    || scalarValue(selectedRuntimeMismatch.summary, 'selectedRuntimeRunEvidenceChain') !== 'missing'
    || scalarValue(selectedRuntimeMismatch.summary, 'sameRunEvidenceChain') !== 'missing'
    || scalarValue(selectedRuntimeMismatch.summary, 'sameRunId') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeRun') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeRunEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeTask') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeTaskEvidenceChain') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeProvider') !== 'openai'
    || scalarValue(serviceEvidencePartial.summary, 'selectedRuntimeProviderEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'providerConfigured') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'configuredProvider') !== 'openai'
    || scalarValue(serviceEvidencePartial.summary, 'configuredProviderEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'patchArtifactId') !== 'artifact_patch_1'
    || scalarValue(serviceEvidencePartial.summary, 'decisionArtifactId') !== 'artifact_patch_1'
    || scalarValue(serviceEvidencePartial.summary, 'preflightArtifactId') !== 'artifact_patch_1'
    || scalarValue(serviceEvidencePartial.summary, 'decisionArtifactEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'artifactEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'promotionDecisionId') !== 'decision_patch_1'
    || (scalarValue(serviceEvidencePartial.summary, 'targetTaskEvidenceChain') ?? 'missing') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'checkpointEvidenceChain') !== 'ready'
    || scalarValue(serviceEvidencePartial.summary, 'operatorId') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'operatorApplySurface') !== 'missing'
    || scalarValue(serviceEvidencePartial.summary, 'operatorApplySurfaceEvidenceChain') !== 'missing'
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
    || scalarValue(serviceEvidencePartial.summary, 'postApplyFilesMatched') !== 'no'
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
