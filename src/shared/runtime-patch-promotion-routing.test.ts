import { describe, expect, it } from 'vitest';

import { evaluateRuntimePatchPromotionRoutingReadiness } from './runtime-patch-promotion-routing.js';

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
    expect(readiness.summary).toContain('requirements=2/8');
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
    expect(readiness.summary).toContain('requirements=8/8');
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
    expect(readiness.summary).toContain('sameRunEvidenceChain=missing');
  });
});
