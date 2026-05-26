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
      missingRequirements: [
        'promotion_preflight',
        'explicit_operator_apply',
        'post_apply_run_evidence',
      ],
    });
    expect(readiness.summary).toContain('ready=no');
    expect(readiness.summary).toContain('patchArtifact=ready');
    expect(readiness.summary).toContain('promotionDecision=ready');
    expect(readiness.summary).toContain('promotionPreflight=missing');
  });

  it('allows future runtime patch promotion only through patch artifact, Decision, preflight, explicit apply, and evidence', () => {
    const readiness = evaluateRuntimePatchPromotionRoutingReadiness({
      explicitOperatorApply: true,
      patchArtifactReady: true,
      postApplyRunEvidenceReady: true,
      promotionDecisionReady: true,
      promotionPreflightReady: true,
    });

    expect(readiness).toMatchObject({
      ready: true,
      missingRequirements: [],
    });
    expect(readiness.summary).toContain('ready=yes');
    expect(readiness.summary).toContain('explicitOperatorApply=ready');
    expect(readiness.summary).toContain('postApplyRunEvidence=ready');
    expect(readiness.summary).toContain('missing=none');
  });
});
