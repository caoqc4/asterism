#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const modulePath = path.join(root, 'dist-electron', 'shared', 'scheduler-decision-proposal.js');
const sourceModulePath = path.join(root, 'src', 'shared', 'scheduler-decision-proposal.ts');

export async function runSchedulerDecisionProposalReadinessSmoke() {
  console.log('Scheduler Decision proposal readiness smoke');
  console.log('mode=read-only');
  console.log('provider=not-called');
  console.log('decisionPersistence=not-attempted');
  console.log('writebackDispatch=not-attempted');
  console.log('schedulerTrigger=not-attempted');
  console.log('workspace=unchanged');

  if (!fs.existsSync(modulePath) || sourceIsNewerThanBuild()) {
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
    approvalQueueSurface: 'task_dynamics',
    operatorId: 'operator_scheduler_decision_smoke',
    operatorConfirmed: true,
    options: ['Approve', 'Hold'],
    proposedOutcome: 'Approve',
    rationale: 'Review scheduler proposal.',
    targetTaskId: 'task_scheduler_decision_operator_smoke',
    title: 'Confirm scheduler action',
  });
  const standingApproval = planSchedulerDecisionProposal({
    approvalQueueConnected: true,
    approvalQueueSurface: 'task_dynamics',
    standingApprovalActive: true,
    standingApprovalPolicyId: 'standing_policy_smoke',
    standingApprovalScopeTaskId: 'task_scheduler_decision_standing_smoke',
    options: ['Approve', 'Hold'],
    proposedOutcome: 'Approve',
    rationale: 'Review scheduler proposal.',
    targetTaskId: 'task_scheduler_decision_standing_smoke',
    title: 'Confirm scheduler action',
  });
  const localRecovery = planSchedulerDecisionProposal({
    approvalQueueConnected: true,
    approvalQueueSurface: 'task_dynamics',
    localRecoveryCompleted: true,
    localRecoveryRunId: 'run_scheduler_recovery_smoke',
    localRecoveryTaskId: 'task_scheduler_decision_recovery_smoke',
    options: ['Approve', 'Hold'],
    proposedOutcome: 'Approve',
    rationale: 'Review scheduler proposal.',
    targetTaskId: 'task_scheduler_decision_recovery_smoke',
    title: 'Confirm scheduler action',
  });
  const scopeMismatch = planSchedulerDecisionProposal({
    approvalQueueConnected: true,
    approvalQueueSurface: 'task_dynamics',
    standingApprovalActive: true,
    standingApprovalPolicyId: 'standing_policy_scope_mismatch_smoke',
    standingApprovalScopeTaskId: 'task_scheduler_decision_other',
    options: ['Approve', 'Hold'],
    proposedOutcome: 'Approve',
    rationale: 'Review scheduler proposal.',
    targetTaskId: 'task_scheduler_decision_scope_mismatch_smoke',
    title: 'Confirm scheduler action',
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
    proposal: {
      options: ['Approve', 'Hold'],
      proposedOutcome: 'Approve',
      rationale: 'Review scheduler proposal.',
      title: 'Confirm scheduler action',
    },
    targetTaskId: 'task_scheduler_decision_service_smoke',
  });

  console.log(`blockedStatus=${blocked.status}`);
  console.log(`blockedProposalReady=${blocked.approvalItemAllowed ? 'yes' : 'no'}`);
  console.log(`blockedRequirements=${blocked.satisfiedRequirements.length}/4`);
  console.log(`blockedMissingRequirements=${blocked.missingRequirements.join(',') || 'none'}`);
  console.log(`blockedApprovalQueueSurface=${blocked.approvalQueueSurface ?? 'missing'}`);
  console.log(`operatorConfirmedStatus=${operatorConfirmed.status}`);
  console.log(`operatorConfirmedProposalReady=${operatorConfirmed.approvalItemAllowed ? 'yes' : 'no'}`);
  console.log(`operatorConfirmedRequirements=${operatorConfirmed.satisfiedRequirements.length}/4`);
  console.log(`operatorConfirmedDecisionPayload=${scalarValue(operatorConfirmed.summary, 'decisionPayload') ?? 'missing'}`);
  console.log(`operatorConfirmedApprovalQueueSurface=${operatorConfirmed.approvalQueueSurface ?? 'missing'}`);
  console.log(`operatorConfirmedAuthorization=${operatorConfirmed.authorizations.join(',') || 'none'}`);
  console.log(`operatorConfirmedOperatorId=${operatorConfirmed.operatorId ?? 'missing'}`);
  console.log(`operatorConfirmedDecisionPersistenceAllowed=${String(operatorConfirmed.decisionPersistenceAllowed)}`);
  console.log(`operatorConfirmedWritebackDispatchAllowed=${String(operatorConfirmed.writebackDispatchAllowed)}`);
  console.log(`operatorConfirmedSchedulerTriggerAllowed=${String(operatorConfirmed.schedulerTriggerAllowed)}`);
  console.log(`standingApprovalStatus=${standingApproval.status}`);
  console.log(`standingApprovalProposalReady=${standingApproval.approvalItemAllowed ? 'yes' : 'no'}`);
  console.log(`standingApprovalRequirements=${standingApproval.satisfiedRequirements.length}/4`);
  console.log(`standingApprovalApprovalQueueSurface=${standingApproval.approvalQueueSurface ?? 'missing'}`);
  console.log(`standingApprovalAuthorization=${standingApproval.authorizations.join(',') || 'none'}`);
  console.log(`standingApprovalPolicyId=${standingApproval.standingApprovalPolicyId ?? 'missing'}`);
  console.log(`standingApprovalScopeTask=${standingApproval.standingApprovalScopeTaskId ?? 'missing'}`);
  console.log(`standingApprovalScopeMatched=${scalarValue(standingApproval.summary, 'standingApprovalScopeMatched') ?? 'missing'}`);
  console.log(`standingApprovalDecisionPersistenceAllowed=${String(standingApproval.decisionPersistenceAllowed)}`);
  console.log(`standingApprovalWritebackDispatchAllowed=${String(standingApproval.writebackDispatchAllowed)}`);
  console.log(`standingApprovalSchedulerTriggerAllowed=${String(standingApproval.schedulerTriggerAllowed)}`);
  console.log(`localRecoveryStatus=${localRecovery.status}`);
  console.log(`localRecoveryProposalReady=${localRecovery.approvalItemAllowed ? 'yes' : 'no'}`);
  console.log(`localRecoveryRequirements=${localRecovery.satisfiedRequirements.length}/4`);
  console.log(`localRecoveryDecisionPayload=${scalarValue(localRecovery.summary, 'decisionPayload') ?? 'missing'}`);
  console.log(`localRecoveryAuthorization=${localRecovery.authorizations.join(',') || 'none'}`);
  console.log(`localRecoveryRunId=${scalarValue(localRecovery.summary, 'localRecoveryRunId') ?? 'missing'}`);
  console.log(`localRecoveryTask=${scalarValue(localRecovery.summary, 'localRecoveryTask') ?? 'missing'}`);
  console.log(`localRecoveryCompleted=${scalarValue(localRecovery.summary, 'localRecoveryCompleted') ?? 'missing'}`);
  console.log(`localRecoveryTaskMatched=${scalarValue(localRecovery.summary, 'localRecoveryTaskMatched') ?? 'missing'}`);
  console.log(`localRecoveryDecisionPersistenceAllowed=${String(localRecovery.decisionPersistenceAllowed)}`);
  console.log(`localRecoveryWritebackDispatchAllowed=${String(localRecovery.writebackDispatchAllowed)}`);
  console.log(`localRecoverySchedulerTriggerAllowed=${String(localRecovery.schedulerTriggerAllowed)}`);
  console.log(`scopeMismatchStatus=${scopeMismatch.status}`);
  console.log(`scopeMismatchProposalReady=${scopeMismatch.approvalItemAllowed ? 'yes' : 'no'}`);
  console.log(`scopeMismatchRequirements=${scopeMismatch.satisfiedRequirements.length}/4`);
  console.log(`scopeMismatchAuthorization=${scopeMismatch.authorizations.join(',') || 'missing'}`);
  console.log(`scopeMismatchStandingApprovalScopeMatched=${scalarValue(scopeMismatch.summary, 'standingApprovalScopeMatched') ?? 'missing'}`);
  console.log(`decisionPersistenceAllowed=${String(operatorConfirmed.decisionPersistenceAllowed || standingApproval.decisionPersistenceAllowed)}`);
  console.log(`writebackDispatchAllowed=${String(operatorConfirmed.writebackDispatchAllowed || standingApproval.writebackDispatchAllowed)}`);
  console.log(`schedulerTriggerAllowed=${String(operatorConfirmed.schedulerTriggerAllowed || standingApproval.schedulerTriggerAllowed)}`);
  console.log(`serviceEvidenceStatus=${serviceEvidencePartial.status}`);
  console.log(`serviceEvidenceProposalReady=${serviceEvidencePartial.approvalItemAllowed ? 'yes' : 'no'}`);
  console.log(`serviceEvidenceRequirements=${serviceEvidencePartial.satisfiedRequirements.length}/4`);
  console.log(`serviceEvidenceDecisionPayload=${scalarValue(serviceEvidencePartial.summary, 'decisionPayload') ?? 'missing'}`);
  console.log(`serviceEvidenceMissingRequirements=${serviceEvidencePartial.missingRequirements.join(',') || 'none'}`);
  console.log(`serviceEvidenceApprovalQueueSurface=${serviceEvidencePartial.approvalQueueSurface ?? 'missing'}`);
  console.log(`serviceEvidenceStandingApprovalPolicyId=${serviceEvidencePartial.standingApprovalPolicyId ?? 'missing'}`);
  console.log(`serviceEvidenceStandingApprovalScopeTask=${serviceEvidencePartial.standingApprovalScopeTaskId ?? 'missing'}`);
  console.log(`serviceEvidenceStandingApprovalScopeMatched=${scalarValue(serviceEvidencePartial.summary, 'standingApprovalScopeMatched') ?? 'missing'}`);
  console.log(`serviceEvidenceDecisionPersistenceAllowed=${String(serviceEvidencePartial.decisionPersistenceAllowed)}`);
  console.log(`serviceEvidenceWritebackDispatchAllowed=${String(serviceEvidencePartial.writebackDispatchAllowed)}`);
  console.log(`serviceEvidenceSchedulerTriggerAllowed=${String(serviceEvidencePartial.schedulerTriggerAllowed)}`);

  if (
    blocked.approvalItemAllowed
    || !operatorConfirmed.approvalItemAllowed
    || !standingApproval.approvalItemAllowed
    || !localRecovery.approvalItemAllowed
    || operatorConfirmed.operatorId !== 'operator_scheduler_decision_smoke'
    || standingApproval.standingApprovalPolicyId !== 'standing_policy_smoke'
    || standingApproval.standingApprovalScopeTaskId !== 'task_scheduler_decision_standing_smoke'
    || scalarValue(standingApproval.summary, 'standingApprovalScopeMatched') !== 'yes'
    || localRecovery.authorizations.join(',') !== 'local_recovery'
    || scalarValue(operatorConfirmed.summary, 'decisionPayload') !== 'ready'
    || scalarValue(localRecovery.summary, 'decisionPayload') !== 'ready'
    || scalarValue(localRecovery.summary, 'localRecoveryRunId') !== 'run_scheduler_recovery_smoke'
    || scalarValue(localRecovery.summary, 'localRecoveryTask') !== 'task_scheduler_decision_recovery_smoke'
    || scalarValue(localRecovery.summary, 'localRecoveryCompleted') !== 'yes'
    || scalarValue(localRecovery.summary, 'localRecoveryTaskMatched') !== 'yes'
    || scopeMismatch.approvalItemAllowed
    || scopeMismatch.satisfiedRequirements.length !== 3
    || !scopeMismatch.missingRequirements.includes('authorization')
    || scalarValue(scopeMismatch.summary, 'standingApprovalScopeMatched') !== 'no'
    || operatorConfirmed.decisionPersistenceAllowed
    || operatorConfirmed.writebackDispatchAllowed
    || operatorConfirmed.schedulerTriggerAllowed
    || standingApproval.decisionPersistenceAllowed
    || standingApproval.writebackDispatchAllowed
    || standingApproval.schedulerTriggerAllowed
    || localRecovery.decisionPersistenceAllowed
    || localRecovery.writebackDispatchAllowed
    || localRecovery.schedulerTriggerAllowed
    || serviceEvidencePartial.approvalItemAllowed
    || serviceEvidencePartial.approvalQueueSurface !== 'task_dynamics'
    || serviceEvidencePartial.standingApprovalPolicyId !== 'standing_policy_1'
    || serviceEvidencePartial.standingApprovalScopeTaskId !== 'task_scheduler_decision_other'
    || scalarValue(serviceEvidencePartial.summary, 'standingApprovalScopeMatched') !== 'no'
    || serviceEvidencePartial.satisfiedRequirements.length !== 3
    || scalarValue(serviceEvidencePartial.summary, 'decisionPayload') !== 'ready'
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

function scalarValue(summary, key) {
  const prefix = `${key}=`;
  const part = summary.split(' / ').find((item) => item.trim().startsWith(prefix));
  return part?.trim().slice(prefix.length).trim() ?? null;
}

function sourceIsNewerThanBuild() {
  if (!fs.existsSync(sourceModulePath) || !fs.existsSync(modulePath)) return false;
  return fs.statSync(sourceModulePath).mtimeMs > fs.statSync(modulePath).mtimeMs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runSchedulerDecisionProposalReadinessSmoke();
}
