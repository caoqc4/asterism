export type RuntimePatchPromotionRoutingReadiness = {
  ready: boolean;
  missingRequirements: Array<
    | 'selected_runtime_contract'
    | 'target_task_identity'
    | 'patch_artifact'
    | 'promotion_decision'
    | 'promotion_preflight'
    | 'explicit_operator_apply'
    | 'same_run_evidence_chain'
    | 'post_apply_run_evidence'
  >;
  summary: string;
};

export function evaluateRuntimePatchPromotionRoutingReadiness(params: {
  explicitOperatorApply?: boolean;
  patchArtifactReady?: boolean;
  postApplyRunEvidenceReady?: boolean;
  promotionDecisionReady?: boolean;
  promotionPreflightReady?: boolean;
  sameRunEvidenceChainReady?: boolean;
  selectedRuntimeContractReady?: boolean;
  targetTaskIdentityReady?: boolean;
}): RuntimePatchPromotionRoutingReadiness {
  const missingRequirements: RuntimePatchPromotionRoutingReadiness['missingRequirements'] = [];

  if (!params.selectedRuntimeContractReady) missingRequirements.push('selected_runtime_contract');
  if (!params.targetTaskIdentityReady) missingRequirements.push('target_task_identity');
  if (!params.patchArtifactReady) missingRequirements.push('patch_artifact');
  if (!params.promotionDecisionReady) missingRequirements.push('promotion_decision');
  if (!params.promotionPreflightReady) missingRequirements.push('promotion_preflight');
  if (!params.explicitOperatorApply) missingRequirements.push('explicit_operator_apply');
  if (!params.sameRunEvidenceChainReady) missingRequirements.push('same_run_evidence_chain');
  if (!params.postApplyRunEvidenceReady) missingRequirements.push('post_apply_run_evidence');

  const ready = missingRequirements.length === 0;

  return {
    ready,
    missingRequirements,
    summary: [
      'Runtime patch promotion routing readiness',
      `ready=${ready ? 'yes' : 'no'}`,
      `selectedRuntimeContract=${params.selectedRuntimeContractReady ? 'ready' : 'missing'}`,
      `targetTaskIdentity=${params.targetTaskIdentityReady ? 'ready' : 'missing'}`,
      `patchArtifact=${params.patchArtifactReady ? 'ready' : 'missing'}`,
      `promotionDecision=${params.promotionDecisionReady ? 'ready' : 'missing'}`,
      `promotionPreflight=${params.promotionPreflightReady ? 'ready' : 'missing'}`,
      `explicitOperatorApply=${params.explicitOperatorApply ? 'ready' : 'missing'}`,
      `sameRunEvidenceChain=${params.sameRunEvidenceChainReady ? 'ready' : 'missing'}`,
      `postApplyRunEvidence=${params.postApplyRunEvidenceReady ? 'ready' : 'missing'}`,
      `missing=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
    ].join(' / '),
  };
}
