export type SchedulerDecisionProposalAuthorization =
  | 'operator_confirmation'
  | 'standing_approval';

export type SchedulerDecisionProposalPlan = {
  status: 'ready' | 'blocked';
  approvalItemAllowed: boolean;
  approvalQueueSurface: 'task_dynamics' | 'right_panel' | 'unknown' | null;
  decisionPersistenceAllowed: false;
  operatorId: string | null;
  schedulerTriggerAllowed: false;
  standingApprovalPolicyId: string | null;
  standingApprovalScopeTaskId: string | null;
  writebackDispatchAllowed: false;
  authorizations: SchedulerDecisionProposalAuthorization[];
  blockedReasons: string[];
  missingRequirements: SchedulerDecisionProposalRequirement[];
  satisfiedRequirements: SchedulerDecisionProposalRequirement[];
  targetTaskId: string | null;
  summary: string;
};

export type SchedulerDecisionProposalRequirement =
  | 'approval_queue'
  | 'target_task_identity'
  | 'authorization';

export type SchedulerDecisionProposalServiceEvidence = {
  approvalQueue?: {
    connected: boolean;
    surface?: 'task_dynamics' | 'right_panel' | 'unknown';
  } | null;
  operatorConfirmation?: {
    confirmed: boolean;
    operatorId?: string | null;
  } | null;
  standingApproval?: {
    active: boolean;
    policyId?: string | null;
    scopeTaskId?: string | null;
  } | null;
  targetTaskId?: string | null;
};

export function schedulerDecisionProposalRequirements(): SchedulerDecisionProposalRequirement[] {
  return [
    'approval_queue',
    'target_task_identity',
    'authorization',
  ];
}

export function planSchedulerDecisionProposal(params: {
  approvalQueueConnected?: boolean;
  approvalQueueSurface?: 'task_dynamics' | 'right_panel' | 'unknown' | null;
  operatorId?: string | null;
  operatorConfirmed?: boolean;
  standingApprovalActive?: boolean;
  standingApprovalPolicyId?: string | null;
  standingApprovalScopeTaskId?: string | null;
  targetTaskId?: string | null;
} = {}): SchedulerDecisionProposalPlan {
  const targetTaskId = params.targetTaskId?.trim() || null;
  const operatorId = params.operatorId?.trim() || null;
  const standingApprovalPolicyId = params.standingApprovalPolicyId?.trim() || null;
  const standingApprovalScopeTaskId = params.standingApprovalScopeTaskId?.trim() || null;
  const operatorConfirmed = params.operatorConfirmed === true && Boolean(operatorId);
  const standingApprovalScopeMatched = (
    Boolean(targetTaskId)
    && Boolean(standingApprovalScopeTaskId)
    && standingApprovalScopeTaskId === targetTaskId
  );
  const standingApprovalActive = (
    params.standingApprovalActive === true
    && Boolean(standingApprovalPolicyId)
    && standingApprovalScopeMatched
  );
  const authorizations = [
    operatorConfirmed ? 'operator_confirmation' : null,
    standingApprovalActive ? 'standing_approval' : null,
  ].filter((value): value is SchedulerDecisionProposalAuthorization => value !== null);
  const requiredRequirements = schedulerDecisionProposalRequirements();
  const blockedReasons = [];
  const missingRequirements: SchedulerDecisionProposalRequirement[] = [];

  if (!params.approvalQueueConnected) {
    missingRequirements.push('approval_queue');
    blockedReasons.push('Task Dynamics writeback approval queue is not connected.');
  }

  if (!targetTaskId) {
    missingRequirements.push('target_task_identity');
    blockedReasons.push('Scheduler/background Decision proposal requires a target task identity.');
  }

  if (authorizations.length === 0) {
    missingRequirements.push('authorization');
    blockedReasons.push('Scheduler/background Decision proposal requires operator confirmation or active target-scoped Standing Approval.');
  }

  const approvalItemAllowed = blockedReasons.length === 0;
  const status = approvalItemAllowed ? 'ready' : 'blocked';
  const missingRequirementSet = new Set(missingRequirements);
  const satisfiedRequirements = requiredRequirements.filter((requirement) => !missingRequirementSet.has(requirement));

  return {
    status,
    approvalItemAllowed,
    approvalQueueSurface: params.approvalQueueConnected ? (params.approvalQueueSurface ?? 'unknown') : null,
    decisionPersistenceAllowed: false,
    operatorId: operatorConfirmed ? operatorId : null,
    schedulerTriggerAllowed: false,
    standingApprovalPolicyId,
    standingApprovalScopeTaskId,
    writebackDispatchAllowed: false,
    authorizations,
    blockedReasons,
    missingRequirements,
    satisfiedRequirements,
    targetTaskId,
    summary: [
      'Scheduler Decision proposal contract',
      `status=${status}`,
      `proposalReady=${approvalItemAllowed ? 'yes' : 'no'}`,
      `requirements=${satisfiedRequirements.length}/${requiredRequirements.length}`,
      `proposalRequirements=${satisfiedRequirements.length}/${requiredRequirements.length}`,
      `proposalSatisfiedRequirements=${satisfiedRequirements.length ? satisfiedRequirements.join(',') : 'none'}`,
      `approvalItemAllowed=${approvalItemAllowed ? 'true' : 'false'}`,
      `approvalQueueSurface=${params.approvalQueueConnected ? (params.approvalQueueSurface ?? 'unknown') : 'missing'}`,
      `targetTask=${targetTaskId ?? 'missing'}`,
      'decisionPersistenceAllowed=false',
      'writebackDispatchAllowed=false',
      'schedulerTriggerAllowed=false',
      `authorization=${authorizations.length ? authorizations.join(',') : 'missing'}`,
      `operatorId=${operatorConfirmed ? operatorId : 'missing'}`,
      `standingApprovalPolicyId=${standingApprovalPolicyId ?? 'missing'}`,
      `standingApprovalScopeTask=${standingApprovalScopeTaskId ?? 'missing'}`,
      `standingApprovalActive=${standingApprovalActive ? 'yes' : 'no'}`,
      `standingApprovalScopeMatched=${standingApprovalScopeMatched ? 'yes' : 'no'}`,
      `missingRequirements=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
      `proposalMissingRequirements=${missingRequirements.length ? missingRequirements.join(',') : 'none'}`,
      `blocked=${blockedReasons.length ? blockedReasons.join('; ') : 'none'}`,
    ].join(' / '),
  };
}

export function planSchedulerDecisionProposalFromEvidence(
  evidence: SchedulerDecisionProposalServiceEvidence = {},
): SchedulerDecisionProposalPlan {
  const targetTaskId = evidence.targetTaskId?.trim() || null;
  const operatorConfirmed = (
    evidence.operatorConfirmation?.confirmed === true
    && Boolean(evidence.operatorConfirmation.operatorId?.trim())
  );
  const standingApprovalActive = (
    evidence.standingApproval?.active === true
    && Boolean(evidence.standingApproval.policyId?.trim())
    && Boolean(targetTaskId)
    && evidence.standingApproval.scopeTaskId?.trim() === targetTaskId
  );

  return planSchedulerDecisionProposal({
    approvalQueueConnected: evidence.approvalQueue?.connected === true,
    approvalQueueSurface: evidence.approvalQueue?.surface ?? null,
    operatorId: evidence.operatorConfirmation?.operatorId ?? null,
    operatorConfirmed,
    standingApprovalActive,
    standingApprovalPolicyId: evidence.standingApproval?.policyId ?? null,
    standingApprovalScopeTaskId: evidence.standingApproval?.scopeTaskId ?? null,
    targetTaskId,
  });
}
