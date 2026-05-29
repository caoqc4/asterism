import { describe, expect, it } from 'vitest';

import {
  evaluateRuntimePatchPromotionRoutingReadiness,
  evaluateRuntimePatchPromotionRoutingReadinessFromEvidence,
} from './runtime-patch-promotion-routing.js';

describe('runtime patch promotion routing readiness', () => {
  it('keeps future runtime patch promotion blocked until the reviewed-patch apply workflow is complete', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadiness({
      patchArtifactReady: true,
      promotionDecisionReady: true,
    });

    expect(readiness).toMatchObject({
      ready: false,
      satisfiedRequirements: [
        'patch_artifact',
        'promotion_decision',
      ],
      missingRequirements: [
        'selected_runtime_contract',
        'target_task_identity',
        'promotion_preflight',
        'explicit_operator_apply',
        'same_run_evidence_chain',
        'post_apply_run_evidence',
      ],
    });
    expect(readiness.summary).toContain('ready=no');
    expect(readiness.summary).toContain('promotionReady=no');
    expect(readiness.summary).toContain('requirements=2/8');
    expect(readiness.summary).toContain('promotionRequirements=2/8');
    expect(readiness.summary).toContain('promotionSatisfiedRequirements=patch_artifact,promotion_decision');
    expect(readiness.summary).toContain('selectedRuntimeContract=missing');
    expect(readiness.summary).toContain('targetTaskIdentity=missing');
    expect(readiness.summary).toContain('patchArtifact=ready');
    expect(readiness.summary).toContain('promotionDecision=ready');
    expect(readiness.summary).toContain('promotionPreflight=missing');
    expect(readiness.summary).toContain('directRuntimeWorkspaceWrite=blocked');
    expect(readiness.summary).toContain('workspaceMutationPath=explicit_operator_apply_only');
    expect(readiness.summary).toContain('missingRequirements=selected_runtime_contract,target_task_identity,promotion_preflight,explicit_operator_apply,same_run_evidence_chain,post_apply_run_evidence');
    expect(readiness.summary).toContain('promotionMissingRequirements=selected_runtime_contract,target_task_identity,promotion_preflight,explicit_operator_apply,same_run_evidence_chain,post_apply_run_evidence');
  });

  it('allows future runtime patch promotion only through one run-bound patch artifact, Decision, preflight, explicit apply, and evidence', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadiness({
      explicitOperatorApply: true,
      patchArtifactReady: true,
      postApplyRunEvidenceReady: true,
      promotionDecisionReady: true,
      promotionPreflightReady: true,
      sameRunEvidenceChainReady: true,
      selectedRuntimeContractReady: true,
      targetTaskIdentityReady: true,
    });

    expect(readiness).toMatchObject({
      ready: true,
      satisfiedRequirements: [
        'selected_runtime_contract',
        'target_task_identity',
        'patch_artifact',
        'promotion_decision',
        'promotion_preflight',
        'explicit_operator_apply',
        'same_run_evidence_chain',
        'post_apply_run_evidence',
      ],
      missingRequirements: [],
    });
    expect(readiness.summary).toContain('ready=yes');
    expect(readiness.summary).toContain('promotionReady=yes');
    expect(readiness.summary).toContain('requirements=8/8');
    expect(readiness.summary).toContain('promotionRequirements=8/8');
    expect(readiness.summary).toContain('promotionSatisfiedRequirements=selected_runtime_contract,target_task_identity,patch_artifact,promotion_decision,promotion_preflight,explicit_operator_apply,same_run_evidence_chain,post_apply_run_evidence');
    expect(readiness.summary).toContain('selectedRuntimeContract=ready');
    expect(readiness.summary).toContain('targetTaskIdentity=ready');
    expect(readiness.summary).toContain('explicitOperatorApply=ready');
    expect(readiness.summary).toContain('sameRunEvidenceChain=ready');
    expect(readiness.summary).toContain('postApplyRunEvidence=ready');
    expect(readiness.summary).toContain('directRuntimeWorkspaceWrite=blocked');
    expect(readiness.summary).toContain('workspaceMutationPath=explicit_operator_apply_only');
    expect(readiness.summary).toContain('missingRequirements=none');
    expect(readiness.summary).toContain('promotionMissingRequirements=none');
    expect(readiness.summary).toContain('missing=none');
  });

  it('blocks future runtime patch promotion when evidence is not tied to the same run', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadiness({
      explicitOperatorApply: true,
      patchArtifactReady: true,
      postApplyRunEvidenceReady: true,
      promotionDecisionReady: true,
      promotionPreflightReady: true,
      sameRunEvidenceChainReady: false,
      selectedRuntimeContractReady: true,
      targetTaskIdentityReady: true,
    });

    expect(readiness).toMatchObject({
      ready: false,
      satisfiedRequirements: [
        'selected_runtime_contract',
        'target_task_identity',
        'patch_artifact',
        'promotion_decision',
        'promotion_preflight',
        'explicit_operator_apply',
        'post_apply_run_evidence',
      ],
      missingRequirements: ['same_run_evidence_chain'],
    });
    expect(readiness.summary).toContain('requirements=7/8');
    expect(readiness.summary).toContain('promotionSatisfiedRequirements=selected_runtime_contract,target_task_identity,patch_artifact,promotion_decision,promotion_preflight,explicit_operator_apply,post_apply_run_evidence');
    expect(readiness.summary).toContain('sameRunEvidenceChain=missing');
  });

  it('derives runtime patch promotion routing readiness from structured service evidence', () => {
    const partial = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
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

    expect(partial).toMatchObject({
      ready: false,
      satisfiedRequirements: [
        'patch_artifact',
        'promotion_decision',
      ],
      missingRequirements: [
        'selected_runtime_contract',
        'target_task_identity',
        'promotion_preflight',
        'explicit_operator_apply',
        'same_run_evidence_chain',
        'post_apply_run_evidence',
      ],
    });
    expect(partial.summary).toContain('requirements=2/8');
    expect(partial.summary).toContain('promotionSatisfiedRequirements=patch_artifact,promotion_decision');
    expect(partial.summary).toContain('selectedRuntimeContract=missing');
    expect(partial.summary).toContain('selectedRuntimeRun=missing');
    expect(partial.summary).toContain('selectedRuntimeRunEvidenceChain=missing');
    expect(partial.summary).toContain('selectedRuntimeTask=missing');
    expect(partial.summary).toContain('selectedRuntimeTaskEvidenceChain=missing');
    expect(partial.summary).toContain('selectedRuntimeProvider=openai');
    expect(partial.summary).toContain('selectedRuntimeProviderEvidenceChain=ready');
    expect(partial.summary).toContain('providerConfigured=ready');
    expect(partial.summary).toContain('configuredProvider=openai');
    expect(partial.summary).toContain('configuredProviderEvidenceChain=ready');
    expect(partial.summary).toContain('targetTaskIdentity=missing');
    expect(partial.summary).toContain('promotionPreflight=missing');
    expect(partial.summary).toContain('sameRunEvidenceChain=missing');
    expect(partial.summary).toContain('runtimeMode=api');
    expect(partial.summary).toContain('invocationLayer=api_runtime');
    expect(partial.summary).toContain('targetTask=task_1');
    expect(partial.summary).toContain('patchArtifactTask=task_1');
    expect(partial.summary).toContain('promotionDecisionTask=task_1');
    expect(partial.summary).toContain('promotionPreflightTask=task_1');
    expect(partial.summary).toContain('postApplyTask=missing');
    expect(partial.summary).toContain('targetTaskEvidenceChain=missing');
    expect(partial.summary).toContain('patchArtifactId=artifact_patch_1');
    expect(partial.summary).toContain('decisionArtifactId=artifact_patch_1');
    expect(partial.summary).toContain('preflightArtifactId=artifact_patch_1');
    expect(partial.summary).toContain('decisionArtifactEvidenceChain=ready');
    expect(partial.summary).toContain('artifactEvidenceChain=ready');
    expect(partial.summary).toContain('promotionDecisionId=decision_patch_1');
    expect(partial.summary).toContain('promotionCheckpointId=checkpoint_patch_1');
    expect(partial.summary).toContain('preflightCheckpointId=checkpoint_patch_1');
    expect(partial.summary).toContain('checkpointEvidenceChain=ready');
    expect(partial.summary).toContain('operatorId=missing');
    expect(partial.summary).toContain('patchRunId=run_patch_1');
    expect(partial.summary).toContain('decisionRunId=run_patch_1');
    expect(partial.summary).toContain('preflightRunId=run_patch_2');
    expect(partial.summary).toContain('postApplyRunId=missing');
    expect(partial.summary).toContain('sameRunId=missing');
    expect(partial.summary).toContain('expectedFileCount=1');
    expect(partial.summary).toContain('expectedFiles=src/app.ts');
    expect(partial.summary).toContain('expectedFileEvidenceChain=ready');
    expect(partial.summary).toContain('touchedFileCount=0');
    expect(partial.summary).toContain('touchedFiles=none');
    expect(partial.summary).toContain('postApplyFilesMatched=no');
    expect(partial.summary).toContain('filePathSafetyChain=missing');
    expect(partial.summary).toContain('touchedFileEvidenceChain=missing');

    const ready = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
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
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(ready).toMatchObject({
      ready: true,
      missingRequirements: [],
    });
    expect(ready.summary).toContain('requirements=8/8');
    expect(ready.summary).toContain('promotionSatisfiedRequirements=selected_runtime_contract,target_task_identity,patch_artifact,promotion_decision,promotion_preflight,explicit_operator_apply,same_run_evidence_chain,post_apply_run_evidence');
    expect(ready.summary).toContain('targetTaskEvidenceChain=ready');
    expect(ready.summary).toContain('selectedRuntimeProvider=openai');
    expect(ready.summary).toContain('selectedRuntimeProviderEvidenceChain=ready');
    expect(ready.summary).toContain('providerConfigured=ready');
    expect(ready.summary).toContain('configuredProvider=openai');
    expect(ready.summary).toContain('configuredProviderEvidenceChain=ready');
    expect(ready.summary).toContain('decisionArtifactEvidenceChain=ready');
    expect(ready.summary).toContain('artifactEvidenceChain=ready');
    expect(ready.summary).toContain('sameRunEvidenceChain=ready');
    expect(ready.summary).toContain('operatorId=operator_1');
    expect(ready.summary).toContain('operatorApplySurface=service_explicit_apply');
    expect(ready.summary).toContain('operatorApplySurfaceEvidenceChain=ready');
    expect(ready.summary).toContain('operatorApplyTask=task_1');
    expect(ready.summary).toContain('operatorApplyRun=run_patch_1');
    expect(ready.summary).toContain('operatorApplyCheckpoint=checkpoint_patch_1');
    expect(ready.summary).toContain('operatorApplyEvidenceChain=ready');
    expect(ready.summary).toContain('patchRunId=run_patch_1');
    expect(ready.summary).toContain('decisionRunId=run_patch_1');
    expect(ready.summary).toContain('preflightRunId=run_patch_1');
    expect(ready.summary).toContain('postApplyRunId=run_patch_1');
    expect(ready.summary).toContain('checkpointEvidenceChain=ready');
    expect(ready.summary).toContain('sameRunId=run_patch_1');
    expect(ready.summary).toContain('expectedFileCount=1');
    expect(ready.summary).toContain('expectedFiles=src/app.ts');
    expect(ready.summary).toContain('expectedFileEvidenceChain=ready');
    expect(ready.summary).toContain('touchedFileCount=1');
    expect(ready.summary).toContain('touchedFiles=src/app.ts');
    expect(ready.summary).toContain('postApplyFilesMatched=yes');
    expect(ready.summary).toContain('filePathSafetyChain=ready');
    expect(ready.summary).toContain('touchedFileEvidenceChain=ready');
  });

  it('requires explicit operator apply surface identity before patch promotion can be ready', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        operatorId: 'operator_1',
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
      selectedRuntimeContract: {
        invocationLayer: 'selected_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'codex',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: ['explicit_operator_apply', 'same_run_evidence_chain'],
    });
    expect(readiness.summary).toContain('operatorApplySurface=missing');
    expect(readiness.summary).toContain('operatorApplySurfaceEvidenceChain=missing');
    expect(readiness.summary).toContain('operatorApplyEvidenceChain=ready');
  });

  it('requires API selected-runtime provider identity before patch promotion can be ready', () => {
    const missingProvider = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(missingProvider).toMatchObject({
      ready: false,
      missingRequirements: ['selected_runtime_contract', 'same_run_evidence_chain'],
    });
    expect(missingProvider.summary).toContain('selectedRuntimeContract=missing');
    expect(missingProvider.summary).toContain('sameRunEvidenceChain=missing');
    expect(missingProvider.summary).toContain('selectedRuntimeRunEvidenceChain=ready');
    expect(missingProvider.summary).toContain('selectedRuntimeTaskEvidenceChain=ready');
    expect(missingProvider.summary).toContain('selectedRuntimeProvider=missing');
    expect(missingProvider.summary).toContain('selectedRuntimeProviderEvidenceChain=missing');
  });

  it('blocks API patch promotion when configured provider evidence is stitched', () => {
    const mismatch = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
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
        configuredProvider: 'anthropic',
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

    expect(mismatch).toMatchObject({
      ready: false,
      missingRequirements: ['selected_runtime_contract', 'same_run_evidence_chain'],
    });
    expect(mismatch.summary).toContain('sameRunEvidenceChain=missing');
    expect(mismatch.summary).toContain('selectedRuntimeProvider=openai');
    expect(mismatch.summary).toContain('providerConfigured=ready');
    expect(mismatch.summary).toContain('configuredProvider=anthropic');
    expect(mismatch.summary).toContain('configuredProviderEvidenceChain=missing');
    expect(mismatch.summary).toContain('selectedRuntimeProviderEvidenceChain=missing');
  });

  it('requires patch, decision, preflight, and post-apply evidence to match the target task', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
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
        taskId: 'task_other',
      },
      promotionPreflight: {
        artifactId: 'artifact_patch_1',
        checkpointId: 'checkpoint_patch_1',
        runId: 'run_patch_1',
        status: 'ready',
        taskId: 'task_1',
      },
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: [
        'target_task_identity',
        'promotion_decision',
        'same_run_evidence_chain',
      ],
    });
    expect(readiness.summary).toContain('requirements=5/8');
    expect(readiness.summary).toContain('targetTaskIdentity=missing');
    expect(readiness.summary).toContain('promotionDecision=missing');
    expect(readiness.summary).toContain('promotionDecisionTask=task_other');
    expect(readiness.summary).toContain('targetTaskEvidenceChain=missing');
    expect(readiness.summary).toContain('sameRunEvidenceChain=missing');
  });

  it('requires patch artifact evidence to belong to the target task', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
        runId: 'run_patch_1',
        taskId: 'task_1',
      },
      patchArtifact: {
        artifactId: 'artifact_patch_1',
        expectedFiles: ['src/app.ts'],
        kind: 'patch',
        runId: 'run_patch_1',
        status: 'ready',
        taskId: 'task_other',
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: [
        'target_task_identity',
        'patch_artifact',
        'same_run_evidence_chain',
      ],
    });
    expect(readiness.summary).toContain('requirements=5/8');
    expect(readiness.summary).toContain('targetTaskIdentity=missing');
    expect(readiness.summary).toContain('patchArtifact=missing');
    expect(readiness.summary).toContain('sameRunEvidenceChain=missing');
    expect(readiness.summary).toContain('patchArtifactTask=task_other');
    expect(readiness.summary).toContain('targetTaskEvidenceChain=missing');
    expect(readiness.summary).toContain('expectedFileEvidenceChain=ready');
  });

  it('requires the selected runtime contract to match the reviewed patch run and target task', () => {
    const wrongRun = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_other',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(wrongRun).toMatchObject({
      ready: false,
      missingRequirements: ['selected_runtime_contract', 'same_run_evidence_chain'],
    });
    expect(wrongRun.summary).toContain('selectedRuntimeContract=missing');
    expect(wrongRun.summary).toContain('sameRunEvidenceChain=missing');
    expect(wrongRun.summary).toContain('selectedRuntimeRun=run_other');
    expect(wrongRun.summary).toContain('selectedRuntimeRunEvidenceChain=missing');
    expect(wrongRun.summary).toContain('selectedRuntimeTask=task_1');
    expect(wrongRun.summary).toContain('selectedRuntimeTaskEvidenceChain=ready');

    const wrongTask = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_other',
      },
      targetTaskId: 'task_1',
    });

    expect(wrongTask).toMatchObject({
      ready: false,
      missingRequirements: ['selected_runtime_contract', 'same_run_evidence_chain'],
    });
    expect(wrongTask.summary).toContain('selectedRuntimeContract=missing');
    expect(wrongTask.summary).toContain('sameRunEvidenceChain=missing');
    expect(wrongTask.summary).toContain('selectedRuntimeRun=run_patch_1');
    expect(wrongTask.summary).toContain('selectedRuntimeRunEvidenceChain=ready');
    expect(wrongTask.summary).toContain('selectedRuntimeTask=task_other');
    expect(wrongTask.summary).toContain('selectedRuntimeTaskEvidenceChain=missing');
  });

  it('requires promotion Decision evidence to belong to the same run as the reviewed patch', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
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
        runId: 'run_patch_other',
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: [
        'promotion_decision',
        'explicit_operator_apply',
        'same_run_evidence_chain',
      ],
    });
    expect(readiness.summary).toContain('requirements=5/8');
    expect(readiness.summary).toContain('promotionDecision=missing');
    expect(readiness.summary).toContain('explicitOperatorApply=missing');
    expect(readiness.summary).toContain('sameRunEvidenceChain=missing');
    expect(readiness.summary).toContain('patchRunId=run_patch_1');
    expect(readiness.summary).toContain('decisionRunId=run_patch_other');
    expect(readiness.summary).toContain('targetTaskEvidenceChain=ready');
  });

  it('requires promotion preflight evidence to belong to the same run as the reviewed patch', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
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
        runId: 'run_patch_other',
        status: 'ready',
        taskId: 'task_1',
      },
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: [
        'promotion_preflight',
        'explicit_operator_apply',
        'same_run_evidence_chain',
      ],
    });
    expect(readiness.summary).toContain('requirements=5/8');
    expect(readiness.summary).toContain('promotionPreflight=missing');
    expect(readiness.summary).toContain('explicitOperatorApply=missing');
    expect(readiness.summary).toContain('sameRunEvidenceChain=missing');
    expect(readiness.summary).toContain('patchRunId=run_patch_1');
    expect(readiness.summary).toContain('preflightRunId=run_patch_other');
    expect(readiness.summary).toContain('targetTaskEvidenceChain=ready');
  });

  it('requires promotion preflight evidence to belong to the target task', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
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
        taskId: 'task_other',
      },
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: [
        'target_task_identity',
        'promotion_preflight',
        'same_run_evidence_chain',
      ],
    });
    expect(readiness.summary).toContain('requirements=5/8');
    expect(readiness.summary).toContain('targetTaskIdentity=missing');
    expect(readiness.summary).toContain('promotionPreflight=missing');
    expect(readiness.summary).toContain('sameRunEvidenceChain=missing');
    expect(readiness.summary).toContain('promotionPreflightTask=task_other');
    expect(readiness.summary).toContain('targetTaskEvidenceChain=missing');
  });

  it('requires explicit operator apply evidence to match the same target task, run, and checkpoint', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_other',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: [
        'explicit_operator_apply',
        'same_run_evidence_chain',
      ],
    });
    expect(readiness.summary).toContain('requirements=6/8');
    expect(readiness.summary).toContain('explicitOperatorApply=missing');
    expect(readiness.summary).toContain('sameRunEvidenceChain=missing');
    expect(readiness.summary).toContain('operatorId=missing');
    expect(readiness.summary).toContain('operatorApplyTask=task_1');
    expect(readiness.summary).toContain('operatorApplyRun=run_patch_1');
    expect(readiness.summary).toContain('operatorApplyCheckpoint=checkpoint_other');
    expect(readiness.summary).toContain('operatorApplyEvidenceChain=missing');
  });

  it('requires promotion Decision and preflight evidence to reference the same checkpoint', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
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
        checkpointId: 'checkpoint_other',
        runId: 'run_patch_1',
        status: 'ready',
        taskId: 'task_1',
      },
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: [
        'promotion_preflight',
        'explicit_operator_apply',
        'same_run_evidence_chain',
      ],
    });
    expect(readiness.summary).toContain('requirements=5/8');
    expect(readiness.summary).toContain('promotionPreflight=missing');
    expect(readiness.summary).toContain('explicitOperatorApply=missing');
    expect(readiness.summary).toContain('sameRunEvidenceChain=missing');
    expect(readiness.summary).toContain('promotionCheckpointId=checkpoint_patch_1');
    expect(readiness.summary).toContain('preflightCheckpointId=checkpoint_other');
    expect(readiness.summary).toContain('checkpointEvidenceChain=missing');
    expect(readiness.summary).toContain('operatorApplyEvidenceChain=missing');
  });

  it('requires promotion Decision and preflight evidence to reference the same patch artifact', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
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
        artifactId: 'artifact_other',
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: [
        'promotion_decision',
        'promotion_preflight',
        'same_run_evidence_chain',
      ],
    });
    expect(readiness.summary).toContain('patchArtifactId=artifact_patch_1');
    expect(readiness.summary).toContain('decisionArtifactId=artifact_other');
    expect(readiness.summary).toContain('preflightArtifactId=artifact_patch_1');
    expect(readiness.summary).toContain('decisionArtifactEvidenceChain=missing');
    expect(readiness.summary).toContain('artifactEvidenceChain=missing');
    expect(readiness.summary).toContain('promotionDecision=missing');
    expect(readiness.summary).toContain('promotionPreflight=missing');
  });

  it('requires post-apply touched files to match the reviewed patch expected file set', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
        runId: 'run_patch_1',
        taskId: 'task_1',
      },
      patchArtifact: {
        artifactId: 'artifact_patch_1',
        expectedFiles: ['src/app.ts', 'src/util.ts'],
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: [
        'same_run_evidence_chain',
        'post_apply_run_evidence',
      ],
    });
    expect(readiness.summary).toContain('expectedFileCount=2');
    expect(readiness.summary).toContain('expectedFiles=src/app.ts,src/util.ts');
    expect(readiness.summary).toContain('touchedFileCount=1');
    expect(readiness.summary).toContain('touchedFiles=src/app.ts');
    expect(readiness.summary).toContain('postApplyFilesMatched=no');
    expect(readiness.summary).toContain('touchedFileEvidenceChain=missing');
    expect(readiness.summary).toContain('postApplyRunEvidence=missing');
  });

  it('requires post-apply Run evidence to belong to the same run and target task', () => {
    const wrongRun = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
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
        runId: 'run_other',
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(wrongRun).toMatchObject({
      ready: false,
      missingRequirements: [
        'same_run_evidence_chain',
        'post_apply_run_evidence',
      ],
    });
    expect(wrongRun.summary).toContain('postApplyRunId=run_other');
    expect(wrongRun.summary).toContain('postApplyTask=task_1');
    expect(wrongRun.summary).toContain('postApplyRunEvidence=missing');
    expect(wrongRun.summary).toContain('postApplyFilesMatched=yes');
    expect(wrongRun.summary).toContain('touchedFileEvidenceChain=ready');

    const wrongTask = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
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
        taskId: 'task_other',
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(wrongTask).toMatchObject({
      ready: false,
      missingRequirements: [
        'target_task_identity',
        'same_run_evidence_chain',
        'post_apply_run_evidence',
      ],
    });
    expect(wrongTask.summary).toContain('postApplyRunId=run_patch_1');
    expect(wrongTask.summary).toContain('postApplyTask=task_other');
    expect(wrongTask.summary).toContain('targetTaskEvidenceChain=missing');
    expect(wrongTask.summary).toContain('postApplyRunEvidence=missing');
    expect(wrongTask.summary).toContain('postApplyFilesMatched=yes');
    expect(wrongTask.summary).toContain('touchedFileEvidenceChain=ready');
  });

  it('requires expected and touched files to stay inside safe workspace-relative paths', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
        runId: 'run_patch_1',
        taskId: 'task_1',
      },
      patchArtifact: {
        artifactId: 'artifact_patch_1',
        expectedFiles: ['../secrets.txt'],
        kind: 'patch',
        runId: 'run_patch_1',
        status: 'ready',
        taskId: 'task_1',
      },
      postApplyRunEvidence: {
        runId: 'run_patch_1',
        status: 'present',
        taskId: 'task_1',
        touchedFiles: ['../secrets.txt'],
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: [
        'patch_artifact',
        'same_run_evidence_chain',
        'post_apply_run_evidence',
      ],
    });
    expect(readiness.summary).toContain('expectedFiles=../secrets.txt');
    expect(readiness.summary).toContain('expectedFileEvidenceChain=missing');
    expect(readiness.summary).toContain('touchedFiles=../secrets.txt');
    expect(readiness.summary).toContain('filePathSafetyChain=missing');
    expect(readiness.summary).toContain('touchedFileEvidenceChain=missing');
    expect(readiness.summary).toContain('patchArtifact=missing');
    expect(readiness.summary).toContain('postApplyRunEvidence=missing');
  });

  it('rejects current-directory path aliases as unsafe workspace evidence', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
        runId: 'run_patch_1',
        taskId: 'task_1',
      },
      patchArtifact: {
        artifactId: 'artifact_patch_1',
        expectedFiles: ['src/./app.ts'],
        kind: 'patch',
        runId: 'run_patch_1',
        status: 'ready',
        taskId: 'task_1',
      },
      postApplyRunEvidence: {
        runId: 'run_patch_1',
        status: 'present',
        taskId: 'task_1',
        touchedFiles: ['src/./app.ts'],
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: [
        'patch_artifact',
        'same_run_evidence_chain',
        'post_apply_run_evidence',
      ],
    });
    expect(readiness.summary).toContain('expectedFiles=src/./app.ts');
    expect(readiness.summary).toContain('touchedFiles=src/./app.ts');
    expect(readiness.summary).toContain('filePathSafetyChain=missing');
    expect(readiness.summary).toContain('expectedFileEvidenceChain=missing');
    expect(readiness.summary).toContain('touchedFileEvidenceChain=missing');
  });

  it('rejects Windows drive absolute paths as unsafe workspace evidence', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
        runId: 'run_patch_1',
        taskId: 'task_1',
      },
      patchArtifact: {
        artifactId: 'artifact_patch_1',
        expectedFiles: ['C:\\secrets\\token.txt'],
        kind: 'patch',
        runId: 'run_patch_1',
        status: 'ready',
        taskId: 'task_1',
      },
      postApplyRunEvidence: {
        runId: 'run_patch_1',
        status: 'present',
        taskId: 'task_1',
        touchedFiles: ['C:\\secrets\\token.txt'],
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: [
        'patch_artifact',
        'same_run_evidence_chain',
        'post_apply_run_evidence',
      ],
    });
    expect(readiness.summary).toContain('expectedFiles=C:/secrets/token.txt');
    expect(readiness.summary).toContain('touchedFiles=C:/secrets/token.txt');
    expect(readiness.summary).toContain('expectedFileEvidenceChain=missing');
    expect(readiness.summary).toContain('filePathSafetyChain=missing');
    expect(readiness.summary).toContain('touchedFileEvidenceChain=missing');
  });

  it('requires post-apply touched file evidence to be duplicate-free', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
        runId: 'run_patch_1',
        taskId: 'task_1',
      },
      patchArtifact: {
        artifactId: 'artifact_patch_1',
        expectedFiles: ['src/app.ts', 'src/app.ts'],
        kind: 'patch',
        runId: 'run_patch_1',
        status: 'ready',
        taskId: 'task_1',
      },
      postApplyRunEvidence: {
        runId: 'run_patch_1',
        status: 'present',
        taskId: 'task_1',
        touchedFiles: ['src/app.ts', 'src/app.ts'],
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: [
        'patch_artifact',
        'same_run_evidence_chain',
        'post_apply_run_evidence',
      ],
    });
    expect(readiness.summary).toContain('expectedFileCount=2');
    expect(readiness.summary).toContain('touchedFileCount=2');
    expect(readiness.summary).toContain('expectedFileEvidenceChain=missing');
    expect(readiness.summary).toContain('patchArtifact=missing');
    expect(readiness.summary).toContain('touchedFileEvidenceChain=missing');
  });

  it('rejects blank patch and touched file entries instead of filtering them out', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
        runId: 'run_patch_1',
        taskId: 'task_1',
      },
      patchArtifact: {
        artifactId: 'artifact_patch_1',
        expectedFiles: ['src/app.ts', '   '],
        kind: 'patch',
        runId: 'run_patch_1',
        status: 'ready',
        taskId: 'task_1',
      },
      postApplyRunEvidence: {
        runId: 'run_patch_1',
        status: 'present',
        taskId: 'task_1',
        touchedFiles: ['src/app.ts', ''],
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: [
        'patch_artifact',
        'same_run_evidence_chain',
        'post_apply_run_evidence',
      ],
    });
    expect(readiness.summary).toContain('expectedFileCount=2');
    expect(readiness.summary).toContain('touchedFileCount=2');
    expect(readiness.summary).toContain('expectedFileEvidenceChain=missing');
    expect(readiness.summary).toContain('filePathSafetyChain=missing');
    expect(readiness.summary).toContain('touchedFileEvidenceChain=missing');
  });

  it('normalizes workspace-relative separators before matching and duplicate checks', () => {
    const duplicateAfterNormalization = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
        runId: 'run_patch_1',
        taskId: 'task_1',
      },
      patchArtifact: {
        artifactId: 'artifact_patch_1',
        expectedFiles: ['src/app.ts', 'src\\app.ts'],
        kind: 'patch',
        runId: 'run_patch_1',
        status: 'ready',
        taskId: 'task_1',
      },
      postApplyRunEvidence: {
        runId: 'run_patch_1',
        status: 'present',
        taskId: 'task_1',
        touchedFiles: ['src/app.ts', 'src\\app.ts'],
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(duplicateAfterNormalization).toMatchObject({
      ready: false,
      missingRequirements: [
        'patch_artifact',
        'same_run_evidence_chain',
        'post_apply_run_evidence',
      ],
    });
    expect(duplicateAfterNormalization.summary).toContain('expectedFiles=src/app.ts,src/app.ts');
    expect(duplicateAfterNormalization.summary).toContain('touchedFiles=src/app.ts,src/app.ts');
    expect(duplicateAfterNormalization.summary).toContain('expectedFileEvidenceChain=missing');
    expect(duplicateAfterNormalization.summary).toContain('postApplyFilesMatched=no');
    expect(duplicateAfterNormalization.summary).toContain('touchedFileEvidenceChain=missing');

    const slashEquivalent = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
        runId: 'run_patch_1',
        taskId: 'task_1',
      },
      patchArtifact: {
        artifactId: 'artifact_patch_1',
        expectedFiles: ['src\\app.ts'],
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(slashEquivalent).toMatchObject({
      ready: true,
      missingRequirements: [],
    });
    expect(slashEquivalent.summary).toContain('expectedFiles=src/app.ts');
    expect(slashEquivalent.summary).toContain('touchedFiles=src/app.ts');
    expect(slashEquivalent.summary).toContain('postApplyFilesMatched=yes');
    expect(slashEquivalent.summary).toContain('touchedFileEvidenceChain=ready');

    const duplicateAfterRepeatedSeparators = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_patch_1',
        confirmed: true,
        surface: 'service_explicit_apply',
        operatorId: 'operator_1',
        runId: 'run_patch_1',
        taskId: 'task_1',
      },
      patchArtifact: {
        artifactId: 'artifact_patch_1',
        expectedFiles: ['src/app.ts', 'src//app.ts'],
        kind: 'patch',
        runId: 'run_patch_1',
        status: 'ready',
        taskId: 'task_1',
      },
      postApplyRunEvidence: {
        runId: 'run_patch_1',
        status: 'present',
        taskId: 'task_1',
        touchedFiles: ['src/app.ts', 'src//app.ts'],
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
      selectedRuntimeContract: {
        invocationLayer: 'api_runtime',
        phase: 'execution_run',
        runId: 'run_patch_1',
        runtimeMode: 'api',
        provider: 'openai',
        taskId: 'task_1',
      },
      targetTaskId: 'task_1',
    });

    expect(duplicateAfterRepeatedSeparators).toMatchObject({
      ready: false,
      missingRequirements: [
        'patch_artifact',
        'same_run_evidence_chain',
        'post_apply_run_evidence',
      ],
    });
    expect(duplicateAfterRepeatedSeparators.summary).toContain('expectedFiles=src/app.ts,src/app.ts');
    expect(duplicateAfterRepeatedSeparators.summary).toContain('touchedFiles=src/app.ts,src/app.ts');
    expect(duplicateAfterRepeatedSeparators.summary).toContain('expectedFileEvidenceChain=missing');
    expect(duplicateAfterRepeatedSeparators.summary).toContain('touchedFileEvidenceChain=missing');
  });
});
