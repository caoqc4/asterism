export type RuntimePatchPromotionRoutingReadiness = {
  ready: boolean;
  satisfiedRequirements: RuntimePatchPromotionRoutingRequirement[];
  missingRequirements: RuntimePatchPromotionRoutingRequirement[];
  summary: string;
};

export type RuntimePatchPromotionRoutingRequirement =
  | 'selected_runtime_contract'
  | 'target_task_identity'
  | 'patch_artifact'
  | 'promotion_decision'
  | 'promotion_preflight'
  | 'explicit_operator_apply'
  | 'same_run_evidence_chain'
  | 'post_apply_run_evidence';

export function runtimePatchPromotionRoutingRequirements(): RuntimePatchPromotionRoutingRequirement[] {
  return [
    'selected_runtime_contract',
    'target_task_identity',
    'patch_artifact',
    'promotion_decision',
    'promotion_preflight',
    'explicit_operator_apply',
    'same_run_evidence_chain',
    'post_apply_run_evidence',
  ];
}

export type RuntimePatchPromotionRoutingServiceEvidence = {
  explicitOperatorApply?: {
    confirmed: boolean;
    operatorId?: string | null;
  } | null;
  patchArtifact?: {
    artifactId?: string | null;
    expectedFiles?: string[];
    kind: 'patch' | 'task_file' | 'unknown';
    runId?: string | null;
    status: 'missing' | 'ready';
    taskId?: string | null;
  } | null;
  postApplyRunEvidence?: {
    runId?: string | null;
    status: 'missing' | 'present';
    taskId?: string | null;
    touchedFiles?: string[];
  } | null;
  promotionDecision?: {
    checkpointId?: string | null;
    decisionId?: string | null;
    runId?: string | null;
    status: 'approved' | 'missing' | 'pending';
    taskId?: string | null;
  } | null;
  promotionPreflight?: {
    checkpointId?: string | null;
    runId?: string | null;
    status: 'blocked' | 'missing' | 'ready';
    taskId?: string | null;
  } | null;
  selectedRuntimeContract?: {
    invocationLayer: 'api_runtime' | 'selected_runtime';
    phase: 'execution_run';
    runtimeMode: 'api' | 'codex' | 'claude';
  } | null;
  targetTaskId?: string | null;
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
  const requiredRequirements = runtimePatchPromotionRoutingRequirements();
  const missingRequirements: RuntimePatchPromotionRoutingRequirement[] = [];

  if (!params.selectedRuntimeContractReady) missingRequirements.push('selected_runtime_contract');
  if (!params.targetTaskIdentityReady) missingRequirements.push('target_task_identity');
  if (!params.patchArtifactReady) missingRequirements.push('patch_artifact');
  if (!params.promotionDecisionReady) missingRequirements.push('promotion_decision');
  if (!params.promotionPreflightReady) missingRequirements.push('promotion_preflight');
  if (!params.explicitOperatorApply) missingRequirements.push('explicit_operator_apply');
  if (!params.sameRunEvidenceChainReady) missingRequirements.push('same_run_evidence_chain');
  if (!params.postApplyRunEvidenceReady) missingRequirements.push('post_apply_run_evidence');

  const ready = missingRequirements.length === 0;
  const missingRequirementSet = new Set(missingRequirements);
  const satisfiedRequirements = requiredRequirements.filter((requirement) => !missingRequirementSet.has(requirement));

  return {
    ready,
    satisfiedRequirements,
    missingRequirements,
    summary: [
      'Runtime patch promotion routing readiness',
      `ready=${ready ? 'yes' : 'no'}`,
      `promotionReady=${ready ? 'yes' : 'no'}`,
      `requirements=${satisfiedRequirements.length}/${requiredRequirements.length}`,
      `promotionRequirements=${satisfiedRequirements.length}/${requiredRequirements.length}`,
      `promotionSatisfiedRequirements=${satisfiedRequirements.length ? satisfiedRequirements.join(',') : 'none'}`,
      `selectedRuntimeContract=${params.selectedRuntimeContractReady ? 'ready' : 'missing'}`,
      `targetTaskIdentity=${params.targetTaskIdentityReady ? 'ready' : 'missing'}`,
      `patchArtifact=${params.patchArtifactReady ? 'ready' : 'missing'}`,
      `promotionDecision=${params.promotionDecisionReady ? 'ready' : 'missing'}`,
      `promotionPreflight=${params.promotionPreflightReady ? 'ready' : 'missing'}`,
      `explicitOperatorApply=${params.explicitOperatorApply ? 'ready' : 'missing'}`,
      `sameRunEvidenceChain=${params.sameRunEvidenceChainReady ? 'ready' : 'missing'}`,
      `postApplyRunEvidence=${params.postApplyRunEvidenceReady ? 'ready' : 'missing'}`,
      `missingRequirements=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
      `promotionMissingRequirements=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
      `missing=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
    ].join(' / '),
  };
}

export function evaluateRuntimePatchPromotionRoutingReadinessFromEvidence(
  evidence: RuntimePatchPromotionRoutingServiceEvidence,
): RuntimePatchPromotionRoutingReadiness {
  const patchRunId = evidence.patchArtifact?.runId?.trim() || '';
  const decisionRunId = evidence.promotionDecision?.runId?.trim() || '';
  const preflightRunId = evidence.promotionPreflight?.runId?.trim() || '';
  const postApplyRunId = evidence.postApplyRunEvidence?.runId?.trim() || '';
  const selectedRuntime = evidence.selectedRuntimeContract;
  const targetTaskId = evidence.targetTaskId?.trim() || '';
  const patchTaskId = evidence.patchArtifact?.taskId?.trim() || '';
  const decisionTaskId = evidence.promotionDecision?.taskId?.trim() || '';
  const preflightTaskId = evidence.promotionPreflight?.taskId?.trim() || '';
  const postApplyTaskId = evidence.postApplyRunEvidence?.taskId?.trim() || '';
  const promotionCheckpointId = evidence.promotionDecision?.checkpointId?.trim() || '';
  const preflightCheckpointId = evidence.promotionPreflight?.checkpointId?.trim() || '';
  const expectedFiles = evidence.patchArtifact?.expectedFiles
    ?.map((file) => file.trim())
    .filter(Boolean) ?? [];
  const touchedFiles = evidence.postApplyRunEvidence?.touchedFiles
    ?.map((file) => file.trim())
    .filter(Boolean) ?? [];
  const touchedFileEvidenceChainReady = expectedFiles.length > 0
    && touchedFiles.length > 0
    && sameStringSet(expectedFiles, touchedFiles);
  const targetTaskIdentityReady = Boolean(targetTaskId)
    && patchTaskId === targetTaskId
    && decisionTaskId === targetTaskId
    && preflightTaskId === targetTaskId
    && postApplyTaskId === targetTaskId;

  const selectedRuntimeContractReady = (
    selectedRuntime?.phase === 'execution_run'
    && (
      (selectedRuntime.invocationLayer === 'api_runtime' && selectedRuntime.runtimeMode === 'api')
      || (selectedRuntime.invocationLayer === 'selected_runtime' && selectedRuntime.runtimeMode !== 'api')
    )
  );
  const patchArtifactReady = (
    evidence.patchArtifact?.status === 'ready'
    && evidence.patchArtifact.kind === 'patch'
    && Boolean(evidence.patchArtifact.artifactId?.trim())
    && Boolean(patchRunId)
    && expectedFiles.length > 0
  );
  const promotionDecisionReady = (
    evidence.promotionDecision?.status === 'approved'
    && Boolean(evidence.promotionDecision.decisionId?.trim())
    && Boolean(promotionCheckpointId)
    && Boolean(decisionRunId)
  );
  const checkpointEvidenceChainReady = Boolean(promotionCheckpointId)
    && Boolean(preflightCheckpointId)
    && promotionCheckpointId === preflightCheckpointId;
  const promotionPreflightReady = (
    evidence.promotionPreflight?.status === 'ready'
    && checkpointEvidenceChainReady
    && Boolean(preflightRunId)
  );
  const explicitOperatorApply = (
    evidence.explicitOperatorApply?.confirmed === true
    && Boolean(evidence.explicitOperatorApply.operatorId?.trim())
  );
  const postApplyRunEvidenceReady = (
    evidence.postApplyRunEvidence?.status === 'present'
    && Boolean(postApplyRunId)
    && touchedFileEvidenceChainReady
  );
  const sameRunEvidenceChainReady = (
    patchArtifactReady
    && promotionDecisionReady
    && promotionPreflightReady
    && postApplyRunEvidenceReady
    && patchRunId === decisionRunId
    && patchRunId === preflightRunId
    && patchRunId === postApplyRunId
  );

  const readiness = evaluateRuntimePatchPromotionRoutingReadiness({
    explicitOperatorApply,
    patchArtifactReady,
    postApplyRunEvidenceReady,
    promotionDecisionReady,
    promotionPreflightReady,
    sameRunEvidenceChainReady,
    selectedRuntimeContractReady,
    targetTaskIdentityReady,
  });

  return {
    ...readiness,
    summary: [
      readiness.summary,
      `runtimeMode=${selectedRuntime?.runtimeMode ?? 'missing'}`,
      `invocationLayer=${selectedRuntime?.invocationLayer ?? 'missing'}`,
      `targetTask=${targetTaskId || 'missing'}`,
      `patchArtifactTask=${patchTaskId || 'missing'}`,
      `promotionDecisionTask=${decisionTaskId || 'missing'}`,
      `promotionPreflightTask=${preflightTaskId || 'missing'}`,
      `postApplyTask=${postApplyTaskId || 'missing'}`,
      `targetTaskEvidenceChain=${targetTaskIdentityReady ? 'ready' : 'missing'}`,
      `patchArtifactId=${evidence.patchArtifact?.artifactId?.trim() || 'missing'}`,
      `promotionDecisionId=${evidence.promotionDecision?.decisionId?.trim() || 'missing'}`,
      `promotionCheckpointId=${promotionCheckpointId || 'missing'}`,
      `preflightCheckpointId=${preflightCheckpointId || 'missing'}`,
      `checkpointEvidenceChain=${checkpointEvidenceChainReady ? 'ready' : 'missing'}`,
      `operatorId=${explicitOperatorApply ? (evidence.explicitOperatorApply?.operatorId?.trim() ?? 'missing') : 'missing'}`,
      `patchRunId=${patchRunId || 'missing'}`,
      `decisionRunId=${decisionRunId || 'missing'}`,
      `preflightRunId=${preflightRunId || 'missing'}`,
      `postApplyRunId=${postApplyRunId || 'missing'}`,
      `sameRunId=${sameRunEvidenceChainReady ? patchRunId : 'missing'}`,
      `expectedFileCount=${expectedFiles.length}`,
      `expectedFiles=${expectedFiles.length ? expectedFiles.join(',') : 'none'}`,
      `touchedFileCount=${touchedFiles.length}`,
      `touchedFiles=${touchedFiles.length ? touchedFiles.join(',') : 'none'}`,
      `touchedFileEvidenceChain=${touchedFileEvidenceChainReady ? 'ready' : 'missing'}`,
    ].join(' / '),
  };
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (new Set(left).size !== left.length || new Set(right).size !== right.length) {
    return false;
  }
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}
