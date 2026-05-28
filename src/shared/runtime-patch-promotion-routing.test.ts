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

    expect(partial).toMatchObject({
      ready: false,
      satisfiedRequirements: [
        'selected_runtime_contract',
        'patch_artifact',
        'promotion_decision',
        'promotion_preflight',
      ],
      missingRequirements: [
        'target_task_identity',
        'explicit_operator_apply',
        'same_run_evidence_chain',
        'post_apply_run_evidence',
      ],
    });
    expect(partial.summary).toContain('requirements=4/8');
    expect(partial.summary).toContain('promotionSatisfiedRequirements=selected_runtime_contract,patch_artifact,promotion_decision,promotion_preflight');
    expect(partial.summary).toContain('targetTaskIdentity=missing');
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
    expect(partial.summary).toContain('filePathSafetyChain=missing');
    expect(partial.summary).toContain('touchedFileEvidenceChain=missing');

    const ready = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
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
        checkpointId: 'checkpoint_patch_1',
        decisionId: 'decision_patch_1',
        runId: 'run_patch_1',
        status: 'approved',
        taskId: 'task_1',
      },
      promotionPreflight: {
        checkpointId: 'checkpoint_patch_1',
        runId: 'run_patch_1',
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

    expect(ready).toMatchObject({
      ready: true,
      missingRequirements: [],
    });
    expect(ready.summary).toContain('requirements=8/8');
    expect(ready.summary).toContain('promotionSatisfiedRequirements=selected_runtime_contract,target_task_identity,patch_artifact,promotion_decision,promotion_preflight,explicit_operator_apply,same_run_evidence_chain,post_apply_run_evidence');
    expect(ready.summary).toContain('targetTaskEvidenceChain=ready');
    expect(ready.summary).toContain('sameRunEvidenceChain=ready');
    expect(ready.summary).toContain('operatorId=operator_1');
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
    expect(ready.summary).toContain('filePathSafetyChain=ready');
    expect(ready.summary).toContain('touchedFileEvidenceChain=ready');
  });

  it('requires patch, decision, preflight, and post-apply evidence to match the target task', () => {
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
        checkpointId: 'checkpoint_patch_1',
        decisionId: 'decision_patch_1',
        runId: 'run_patch_1',
        status: 'approved',
        taskId: 'task_other',
      },
      promotionPreflight: {
        checkpointId: 'checkpoint_patch_1',
        runId: 'run_patch_1',
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

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: ['target_task_identity'],
    });
    expect(readiness.summary).toContain('requirements=7/8');
    expect(readiness.summary).toContain('targetTaskIdentity=missing');
    expect(readiness.summary).toContain('promotionDecisionTask=task_other');
    expect(readiness.summary).toContain('targetTaskEvidenceChain=missing');
    expect(readiness.summary).toContain('sameRunEvidenceChain=ready');
  });

  it('requires explicit operator apply evidence to match the same target task, run, and checkpoint', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadinessFromEvidence({
      explicitOperatorApply: {
        checkpointId: 'checkpoint_other',
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
        checkpointId: 'checkpoint_patch_1',
        decisionId: 'decision_patch_1',
        runId: 'run_patch_1',
        status: 'approved',
        taskId: 'task_1',
      },
      promotionPreflight: {
        checkpointId: 'checkpoint_patch_1',
        runId: 'run_patch_1',
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

    expect(readiness).toMatchObject({
      ready: false,
      missingRequirements: ['explicit_operator_apply'],
    });
    expect(readiness.summary).toContain('requirements=7/8');
    expect(readiness.summary).toContain('explicitOperatorApply=missing');
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
        checkpointId: 'checkpoint_patch_1',
        decisionId: 'decision_patch_1',
        runId: 'run_patch_1',
        status: 'approved',
        taskId: 'task_1',
      },
      promotionPreflight: {
        checkpointId: 'checkpoint_other',
        runId: 'run_patch_1',
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

  it('requires post-apply touched files to match the reviewed patch expected file set', () => {
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
        checkpointId: 'checkpoint_patch_1',
        decisionId: 'decision_patch_1',
        runId: 'run_patch_1',
        status: 'approved',
        taskId: 'task_1',
      },
      promotionPreflight: {
        checkpointId: 'checkpoint_patch_1',
        runId: 'run_patch_1',
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
    expect(readiness.summary).toContain('touchedFileEvidenceChain=missing');
    expect(readiness.summary).toContain('postApplyRunEvidence=missing');
  });

  it('requires expected and touched files to stay inside safe workspace-relative paths', () => {
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
        checkpointId: 'checkpoint_patch_1',
        decisionId: 'decision_patch_1',
        runId: 'run_patch_1',
        status: 'approved',
        taskId: 'task_1',
      },
      promotionPreflight: {
        checkpointId: 'checkpoint_patch_1',
        runId: 'run_patch_1',
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

  it('requires post-apply touched file evidence to be duplicate-free', () => {
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
        checkpointId: 'checkpoint_patch_1',
        decisionId: 'decision_patch_1',
        runId: 'run_patch_1',
        status: 'approved',
        taskId: 'task_1',
      },
      promotionPreflight: {
        checkpointId: 'checkpoint_patch_1',
        runId: 'run_patch_1',
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
});
