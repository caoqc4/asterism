#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const modulePath = path.join(root, 'dist-electron', 'shared', 'scheduler-decision-proposal.js');

export async function runSchedulerDecisionProposalReadinessSmoke() {
  console.log('Scheduler Decision proposal readiness smoke');
  console.log('mode=read-only');
  console.log('provider=not-called');
  console.log('decisionPersistence=not-attempted');
  console.log('writebackDispatch=not-attempted');
  console.log('schedulerTrigger=not-attempted');
  console.log('workspace=unchanged');

  if (!fs.existsSync(modulePath)) {
    console.log('status=skip');
    console.log('skipReason=build_required');
    console.log('run npm run build:main before this smoke');
    return 0;
  }

  const {
    planSchedulerDecisionProposal,
    planSchedulerDecisionProposalFromEvidence,
  } = await import(pathToFileURL(modulePath).href);

  const blocked = planSchedulerDecisionProposal();
  const operatorConfirmed = planSchedulerDecisionProposal({
    approvalQueueConnected: true,
    operatorConfirmed: true,
    targetTaskId: 'task_scheduler_decision_operator_smoke',
  });
  const standingApproval = planSchedulerDecisionProposal({
    approvalQueueConnected: true,
    standingApprovalActive: true,
    targetTaskId: 'task_scheduler_decision_standing_smoke',
  });
  const serviceEvidencePartial = planSchedulerDecisionProposalFromEvidence({
    approvalQueue: {
      connected: true,
      surface: 'task_dynamics',
    },
    standingApproval: {
      active: true,
      policyId: 'standing_policy_1',
      scopeTaskId: 'task_scheduler_decision_other',
    },
    targetTaskId: 'task_scheduler_decision_service_smoke',
  });

  console.log(`blockedStatus=${blocked.status}`);
  console.log(`blockedProposalReady=${blocked.approvalItemAllowed ? 'yes' : 'no'}`);
  console.log(`blockedRequirements=${blocked.satisfiedRequirements.length}/3`);
  console.log(`blockedMissingRequirements=${blocked.missingRequirements.join(',') || 'none'}`);
  console.log(`operatorConfirmedStatus=${operatorConfirmed.status}`);
  console.log(`operatorConfirmedProposalReady=${operatorConfirmed.approvalItemAllowed ? 'yes' : 'no'}`);
  console.log(`operatorConfirmedRequirements=${operatorConfirmed.satisfiedRequirements.length}/3`);
  console.log(`operatorConfirmedAuthorization=${operatorConfirmed.authorizations.join(',') || 'none'}`);
  console.log(`operatorConfirmedDecisionPersistenceAllowed=${String(operatorConfirmed.decisionPersistenceAllowed)}`);
  console.log(`operatorConfirmedWritebackDispatchAllowed=${String(operatorConfirmed.writebackDispatchAllowed)}`);
  console.log(`operatorConfirmedSchedulerTriggerAllowed=${String(operatorConfirmed.schedulerTriggerAllowed)}`);
  console.log(`standingApprovalStatus=${standingApproval.status}`);
  console.log(`standingApprovalProposalReady=${standingApproval.approvalItemAllowed ? 'yes' : 'no'}`);
  console.log(`standingApprovalRequirements=${standingApproval.satisfiedRequirements.length}/3`);
  console.log(`standingApprovalAuthorization=${standingApproval.authorizations.join(',') || 'none'}`);
  console.log(`standingApprovalDecisionPersistenceAllowed=${String(standingApproval.decisionPersistenceAllowed)}`);
  console.log(`standingApprovalWritebackDispatchAllowed=${String(standingApproval.writebackDispatchAllowed)}`);
  console.log(`standingApprovalSchedulerTriggerAllowed=${String(standingApproval.schedulerTriggerAllowed)}`);
  console.log(`decisionPersistenceAllowed=${String(operatorConfirmed.decisionPersistenceAllowed || standingApproval.decisionPersistenceAllowed)}`);
  console.log(`writebackDispatchAllowed=${String(operatorConfirmed.writebackDispatchAllowed || standingApproval.writebackDispatchAllowed)}`);
  console.log(`schedulerTriggerAllowed=${String(operatorConfirmed.schedulerTriggerAllowed || standingApproval.schedulerTriggerAllowed)}`);
  console.log(`serviceEvidenceStatus=${serviceEvidencePartial.status}`);
  console.log(`serviceEvidenceProposalReady=${serviceEvidencePartial.approvalItemAllowed ? 'yes' : 'no'}`);
  console.log(`serviceEvidenceRequirements=${serviceEvidencePartial.satisfiedRequirements.length}/3`);
  console.log(`serviceEvidenceMissingRequirements=${serviceEvidencePartial.missingRequirements.join(',') || 'none'}`);
  console.log(`serviceEvidenceDecisionPersistenceAllowed=${String(serviceEvidencePartial.decisionPersistenceAllowed)}`);
  console.log(`serviceEvidenceWritebackDispatchAllowed=${String(serviceEvidencePartial.writebackDispatchAllowed)}`);
  console.log(`serviceEvidenceSchedulerTriggerAllowed=${String(serviceEvidencePartial.schedulerTriggerAllowed)}`);

  if (
    blocked.approvalItemAllowed
    || !operatorConfirmed.approvalItemAllowed
    || !standingApproval.approvalItemAllowed
    || operatorConfirmed.decisionPersistenceAllowed
    || operatorConfirmed.writebackDispatchAllowed
    || operatorConfirmed.schedulerTriggerAllowed
    || standingApproval.decisionPersistenceAllowed
    || standingApproval.writebackDispatchAllowed
    || standingApproval.schedulerTriggerAllowed
    || serviceEvidencePartial.approvalItemAllowed
    || serviceEvidencePartial.satisfiedRequirements.length !== 2
    || !serviceEvidencePartial.missingRequirements.includes('authorization')
    || serviceEvidencePartial.decisionPersistenceAllowed
    || serviceEvidencePartial.writebackDispatchAllowed
    || serviceEvidencePartial.schedulerTriggerAllowed
  ) {
    console.log('status=failed');
    return 1;
  }

  console.log('status=passed');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runSchedulerDecisionProposalReadinessSmoke();
}
