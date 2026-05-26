export type SchedulerDecisionProposalAuthorization =
  | 'operator_confirmation'
  | 'standing_approval';

export type SchedulerDecisionProposalPlan = {
  status: 'ready' | 'blocked';
  approvalItemAllowed: boolean;
  decisionPersistenceAllowed: false;
  schedulerTriggerAllowed: false;
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

export function planSchedulerDecisionProposal(params: {
  approvalQueueConnected?: boolean;
  operatorConfirmed?: boolean;
  standingApprovalActive?: boolean;
  targetTaskId?: string | null;
} = {}): SchedulerDecisionProposalPlan {
  const authorizations = [
    params.operatorConfirmed ? 'operator_confirmation' : null,
    params.standingApprovalActive ? 'standing_approval' : null,
  ].filter((value): value is SchedulerDecisionProposalAuthorization => value !== null);
  const requiredRequirements: SchedulerDecisionProposalRequirement[] = [
    'approval_queue',
    'target_task_identity',
    'authorization',
  ];
  const blockedReasons = [];
  const missingRequirements: SchedulerDecisionProposalRequirement[] = [];

  if (!params.approvalQueueConnected) {
    missingRequirements.push('approval_queue');
    blockedReasons.push('Task Dynamics writeback approval queue is not connected.');
  }

  const targetTaskId = params.targetTaskId?.trim() || null;
  if (!targetTaskId) {
    missingRequirements.push('target_task_identity');
    blockedReasons.push('Scheduler/background Decision proposal requires a target task identity.');
  }

  if (authorizations.length === 0) {
    missingRequirements.push('authorization');
    blockedReasons.push('Scheduler/background Decision proposal requires operator confirmation or active Standing Approval.');
  }

  const approvalItemAllowed = blockedReasons.length === 0;
  const status = approvalItemAllowed ? 'ready' : 'blocked';
  const missingRequirementSet = new Set(missingRequirements);
  const satisfiedRequirements = requiredRequirements.filter((requirement) => !missingRequirementSet.has(requirement));

  return {
    status,
    approvalItemAllowed,
    decisionPersistenceAllowed: false,
    schedulerTriggerAllowed: false,
    writebackDispatchAllowed: false,
    authorizations,
    blockedReasons,
    missingRequirements,
    satisfiedRequirements,
    targetTaskId,
    summary: [
      'Scheduler Decision proposal contract',
      `status=${status}`,
      `requirements=${satisfiedRequirements.length}/${requiredRequirements.length}`,
      `approvalItemAllowed=${approvalItemAllowed ? 'true' : 'false'}`,
      `targetTask=${targetTaskId ?? 'missing'}`,
      'decisionPersistenceAllowed=false',
      'writebackDispatchAllowed=false',
      'schedulerTriggerAllowed=false',
      `authorization=${authorizations.length ? authorizations.join(',') : 'missing'}`,
      `blocked=${blockedReasons.length ? blockedReasons.join('; ') : 'none'}`,
    ].join(' / '),
  };
}
