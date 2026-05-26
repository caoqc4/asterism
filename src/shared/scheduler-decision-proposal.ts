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
  summary: string;
};

export function planSchedulerDecisionProposal(params: {
  approvalQueueConnected?: boolean;
  operatorConfirmed?: boolean;
  standingApprovalActive?: boolean;
} = {}): SchedulerDecisionProposalPlan {
  const authorizations = [
    params.operatorConfirmed ? 'operator_confirmation' : null,
    params.standingApprovalActive ? 'standing_approval' : null,
  ].filter((value): value is SchedulerDecisionProposalAuthorization => value !== null);
  const blockedReasons = [];

  if (!params.approvalQueueConnected) {
    blockedReasons.push('Task Dynamics writeback approval queue is not connected.');
  }

  if (authorizations.length === 0) {
    blockedReasons.push('Scheduler/background Decision proposal requires operator confirmation or active Standing Approval.');
  }

  const approvalItemAllowed = blockedReasons.length === 0;
  const status = approvalItemAllowed ? 'ready' : 'blocked';

  return {
    status,
    approvalItemAllowed,
    decisionPersistenceAllowed: false,
    schedulerTriggerAllowed: false,
    writebackDispatchAllowed: false,
    authorizations,
    blockedReasons,
    summary: [
      'Scheduler Decision proposal contract',
      `status=${status}`,
      `approvalItemAllowed=${approvalItemAllowed ? 'true' : 'false'}`,
      'decisionPersistenceAllowed=false',
      'writebackDispatchAllowed=false',
      'schedulerTriggerAllowed=false',
      `authorization=${authorizations.length ? authorizations.join(',') : 'missing'}`,
      `blocked=${blockedReasons.length ? blockedReasons.join('; ') : 'none'}`,
    ].join(' / '),
  };
}
