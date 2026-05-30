import { describe, expect, it } from 'vitest';

import {
  planSchedulerDecisionProposal,
  planSchedulerDecisionProposalFromEvidence,
} from './scheduler-decision-proposal.js';

describe('scheduler decision proposal contract', () => {
  it('blocks background Decision proposal work without approval queue and authorization', () => {
    const plan = planSchedulerDecisionProposal();

    expect(plan).toMatchObject({
      status: 'blocked',
      approvalItemAllowed: false,
      approvalQueueSurface: null,
      decisionPersistenceAllowed: false,
      evidenceRunId: null,
      evidenceSourceIdentityChain: 'missing',
      evidenceSourceType: 'missing',
      operatorId: null,
      schedulerTriggerAllowed: false,
      standingApprovalPolicyId: null,
      standingApprovalScopeTaskId: null,
      writebackDispatchAllowed: false,
      authorizations: [],
      targetTaskId: null,
      satisfiedRequirements: [],
      missingRequirements: [
        'approval_queue',
        'decision_payload',
        'target_task_identity',
        'authorization',
      ],
      blockedReasons: [
        'Task Dynamics writeback approval queue is not connected.',
        'Scheduler/background Decision proposal requires a valid title, rationale, duplicate-free options, and proposed outcome matching one option.',
        'Scheduler/background Decision proposal requires a target task identity.',
        'Scheduler/background Decision proposal requires operator confirmation, active target-scoped Standing Approval, or completed local recovery evidence.',
      ],
    });
    expect(plan.summary).toContain('requirements=0/4');
    expect(plan.summary).toContain('proposalReady=no');
    expect(plan.summary).toContain('proposalRequirements=0/4');
    expect(plan.summary).toContain('proposalSatisfiedRequirements=none');
    expect(plan.summary).toContain('approvalItemAllowed=false');
    expect(plan.summary).toContain('approvalQueueSurface=missing');
    expect(plan.summary).toContain('decisionPersistenceAllowed=false');
    expect(plan.summary).toContain('evidenceSourceType=missing');
    expect(plan.summary).toContain('evidenceRunId=missing');
    expect(plan.summary).toContain('evidenceSourceIdentityChain=missing');
    expect(plan.summary).toContain('writebackDispatchAllowed=false');
    expect(plan.summary).toContain('schedulerTriggerAllowed=false');
    expect(plan.summary).toContain('authorizationCount=0');
    expect(plan.summary).toContain('authorizationEvidenceChain=missing');
    expect(plan.summary).toContain('targetTask=missing');
    expect(plan.summary).toContain('localRecoveryRunId=missing');
    expect(plan.summary).toContain('localRecoveryTask=missing');
    expect(plan.summary).toContain('localRecoveryCompleted=no');
    expect(plan.summary).toContain('localRecoveryTaskMatched=no');
    expect(plan.summary).toContain('operatorId=missing');
    expect(plan.summary).toContain('standingApprovalPolicyId=missing');
    expect(plan.summary).toContain('standingApprovalScopeTask=missing');
    expect(plan.summary).toContain('standingApprovalActive=no');
    expect(plan.summary).toContain('standingApprovalScopeMatched=no');
    expect(plan.summary).toContain('decisionPayload=missing');
    expect(plan.summary).toContain('decisionPayloadIdentityChain=missing');
    expect(plan.summary).toContain('decisionTitle=missing');
    expect(plan.summary).toContain('decisionTitleKey=missing');
    expect(plan.summary).toContain('decisionRationale=missing');
    expect(plan.summary).toContain('decisionOptions=missing');
    expect(plan.summary).toContain('decisionOptionKeys=missing');
    expect(plan.summary).toContain('decisionOptionIdentity=duplicate_or_missing');
    expect(plan.summary).toContain('decisionProposedOutcome=missing');
    expect(plan.summary).toContain('decisionProposedOutcomeKey=missing');
    expect(plan.summary).toContain('decisionProposedOutcomeMatchesOption=no');
    expect(plan.summary).toContain('missingRequirements=approval_queue,decision_payload,target_task_identity,authorization');
    expect(plan.summary).toContain('proposalMissingRequirements=approval_queue,decision_payload,target_task_identity,authorization');
  });

  it('allows only a proposal approval item after operator confirmation', () => {
    const plan = planSchedulerDecisionProposal({
      approvalQueueConnected: true,
      approvalQueueSurface: 'task_dynamics',
      operatorId: 'operator_1',
      operatorConfirmed: true,
      options: ['Approve', 'Hold'],
      proposedOutcome: 'Approve',
      rationale: 'Review scheduler proposal.',
      targetTaskId: 'task_decision_1',
      title: 'Confirm scheduler action',
    });

    expect(plan).toMatchObject({
      status: 'ready',
      approvalItemAllowed: true,
      approvalQueueSurface: 'task_dynamics',
      decisionPersistenceAllowed: false,
      evidenceRunId: null,
      evidenceSourceIdentityChain: 'ready',
      evidenceSourceType: 'system',
      operatorId: 'operator_1',
      schedulerTriggerAllowed: false,
      standingApprovalPolicyId: null,
      standingApprovalScopeTaskId: null,
      writebackDispatchAllowed: false,
      authorizations: ['operator_confirmation'],
      targetTaskId: 'task_decision_1',
      satisfiedRequirements: [
        'approval_queue',
        'decision_payload',
        'target_task_identity',
        'authorization',
      ],
      missingRequirements: [],
      blockedReasons: [],
    });
    expect(plan.summary).toContain('requirements=4/4');
    expect(plan.summary).toContain('proposalReady=yes');
    expect(plan.summary).toContain('proposalRequirements=4/4');
    expect(plan.summary).toContain('proposalSatisfiedRequirements=approval_queue,decision_payload,target_task_identity,authorization');
    expect(plan.summary).toContain('approvalQueueSurface=task_dynamics');
    expect(plan.summary).toContain('decisionPayload=ready');
    expect(plan.summary).toContain('decisionPayloadIdentityChain=ready');
    expect(plan.summary).toContain('decisionTitleKey=confirm_scheduler_action');
    expect(plan.summary).toContain('decisionOptions=2');
    expect(plan.summary).toContain('decisionOptionKeys=approve,hold');
    expect(plan.summary).toContain('decisionProposedOutcomeKey=approve');
    expect(plan.summary).toContain('decisionProposedOutcomeMatchesOption=yes');
    expect(plan.summary).toContain('evidenceSourceType=system');
    expect(plan.summary).toContain('evidenceRunId=missing');
    expect(plan.summary).toContain('evidenceSourceIdentityChain=ready');
    expect(plan.summary).toContain('authorizationCount=1');
    expect(plan.summary).toContain('authorization=operator_confirmation');
    expect(plan.summary).toContain('authorizationEvidenceChain=ready');
    expect(plan.summary).toContain('operatorId=operator_1');
    expect(plan.summary).toContain('standingApprovalPolicyId=missing');
    expect(plan.summary).toContain('targetTask=task_decision_1');
    expect(plan.summary).toContain('missingRequirements=none');
    expect(plan.summary).toContain('proposalMissingRequirements=none');
    expect(plan.summary).toContain('blocked=none');
  });

  it('allows only a proposal approval item under active Standing Approval', () => {
    const plan = planSchedulerDecisionProposal({
      approvalQueueConnected: true,
      approvalQueueSurface: 'task_dynamics',
      standingApprovalActive: true,
      standingApprovalPolicyId: 'policy_2',
      standingApprovalScopeTaskId: 'task_decision_2',
      options: ['Approve', 'Hold'],
      proposedOutcome: 'Approve',
      rationale: 'Review scheduler proposal.',
      targetTaskId: 'task_decision_2',
      title: 'Confirm scheduler action',
    });

    expect(plan).toMatchObject({
      status: 'ready',
      approvalItemAllowed: true,
      approvalQueueSurface: 'task_dynamics',
      decisionPersistenceAllowed: false,
      operatorId: null,
      schedulerTriggerAllowed: false,
      standingApprovalPolicyId: 'policy_2',
      standingApprovalScopeTaskId: 'task_decision_2',
      writebackDispatchAllowed: false,
      authorizations: ['standing_approval'],
      targetTaskId: 'task_decision_2',
      satisfiedRequirements: [
        'approval_queue',
        'decision_payload',
        'target_task_identity',
        'authorization',
      ],
      missingRequirements: [],
      blockedReasons: [],
    });
    expect(plan.summary).toContain('requirements=4/4');
    expect(plan.summary).toContain('proposalSatisfiedRequirements=approval_queue,decision_payload,target_task_identity,authorization');
    expect(plan.summary).toContain('authorizationCount=1');
    expect(plan.summary).toContain('authorization=standing_approval');
    expect(plan.summary).toContain('authorizationEvidenceChain=ready');
    expect(plan.summary).toContain('standingApprovalPolicyId=policy_2');
    expect(plan.summary).toContain('standingApprovalScopeTask=task_decision_2');
    expect(plan.summary).toContain('standingApprovalActive=yes');
    expect(plan.summary).toContain('standingApprovalScopeMatched=yes');
  });

  it('allows only a proposal approval item from completed local recovery evidence', () => {
    const plan = planSchedulerDecisionProposal({
      approvalQueueConnected: true,
      approvalQueueSurface: 'task_dynamics',
      localRecoveryCompleted: true,
      localRecoveryRunId: 'run_recovered_1',
      localRecoveryTaskId: 'task_recovered_1',
      options: ['Approve', 'Hold'],
      proposedOutcome: 'Approve',
      rationale: 'Review scheduler proposal.',
      targetTaskId: 'task_recovered_1',
      title: 'Confirm scheduler action',
    });

    expect(plan).toMatchObject({
      status: 'ready',
      approvalItemAllowed: true,
      decisionPersistenceAllowed: false,
      evidenceRunId: 'run_recovered_1',
      evidenceSourceIdentityChain: 'ready',
      evidenceSourceType: 'run',
      schedulerTriggerAllowed: false,
      writebackDispatchAllowed: false,
      authorizations: ['local_recovery'],
      targetTaskId: 'task_recovered_1',
      satisfiedRequirements: [
        'approval_queue',
        'decision_payload',
        'target_task_identity',
        'authorization',
      ],
      missingRequirements: [],
    });
    expect(plan.summary).toContain('authorizationCount=1');
    expect(plan.summary).toContain('authorization=local_recovery');
    expect(plan.summary).toContain('authorizationEvidenceChain=ready');
    expect(plan.summary).toContain('localRecoveryRunId=run_recovered_1');
    expect(plan.summary).toContain('evidenceSourceType=run');
    expect(plan.summary).toContain('evidenceRunId=run_recovered_1');
    expect(plan.summary).toContain('evidenceSourceIdentityChain=ready');
    expect(plan.summary).toContain('localRecoveryTask=task_recovered_1');
    expect(plan.summary).toContain('localRecoveryCompleted=yes');
    expect(plan.summary).toContain('localRecoveryTaskMatched=yes');
  });

  it('requires concrete operator identity or target-scoped Standing Approval for direct plans', () => {
    const missingOperator = planSchedulerDecisionProposal({
      approvalQueueConnected: true,
      approvalQueueSurface: 'task_dynamics',
      operatorConfirmed: true,
      options: ['Approve', 'Hold'],
      proposedOutcome: 'Approve',
      rationale: 'Review scheduler proposal.',
      targetTaskId: 'task_decision_2',
      title: 'Confirm scheduler action',
    });

    expect(missingOperator).toMatchObject({
      status: 'blocked',
      approvalItemAllowed: false,
      authorizations: [],
      operatorId: null,
      missingRequirements: ['authorization'],
    });
    expect(missingOperator.summary).toContain('authorizationCount=0');
    expect(missingOperator.summary).toContain('authorization=missing');
    expect(missingOperator.summary).toContain('authorizationEvidenceChain=missing');
    expect(missingOperator.summary).toContain('operatorId=missing');

    const scopeMismatch = planSchedulerDecisionProposal({
      approvalQueueConnected: true,
      approvalQueueSurface: 'task_dynamics',
      standingApprovalActive: true,
      standingApprovalPolicyId: 'policy_2',
      standingApprovalScopeTaskId: 'task_other',
      options: ['Approve', 'Hold'],
      proposedOutcome: 'Approve',
      rationale: 'Review scheduler proposal.',
      targetTaskId: 'task_decision_2',
      title: 'Confirm scheduler action',
    });

    expect(scopeMismatch).toMatchObject({
      status: 'blocked',
      approvalItemAllowed: false,
      authorizations: [],
      standingApprovalPolicyId: 'policy_2',
      standingApprovalScopeTaskId: 'task_other',
      missingRequirements: ['authorization'],
    });
    expect(scopeMismatch.summary).toContain('standingApprovalActive=no');
    expect(scopeMismatch.summary).toContain('standingApprovalScopeMatched=no');
    expect(scopeMismatch.summary).toContain('authorizationCount=0');
    expect(scopeMismatch.summary).toContain('authorization=missing');
    expect(scopeMismatch.summary).toContain('authorizationEvidenceChain=missing');
  });

  it('requires the Task Dynamics approval queue surface before scheduler proposals can become approval items', () => {
    const unknownSurface = planSchedulerDecisionProposal({
      approvalQueueConnected: true,
      operatorConfirmed: true,
      operatorId: 'operator_1',
      options: ['Approve', 'Hold'],
      proposedOutcome: 'Approve',
      rationale: 'Review scheduler proposal.',
      targetTaskId: 'task_decision_approval_surface',
      title: 'Confirm scheduler action',
    });

    expect(unknownSurface).toMatchObject({
      status: 'blocked',
      approvalItemAllowed: false,
      approvalQueueSurface: 'unknown',
      missingRequirements: ['approval_queue'],
    });
    expect(unknownSurface.summary).toContain('approvalQueueConnected=yes');
    expect(unknownSurface.summary).toContain('approvalQueueSurface=unknown');
    expect(unknownSurface.summary).toContain('approvalQueueSurfaceReady=no');

    const rightPanelSurface = planSchedulerDecisionProposal({
      approvalQueueConnected: true,
      approvalQueueSurface: 'right_panel',
      operatorConfirmed: true,
      operatorId: 'operator_1',
      options: ['Approve', 'Hold'],
      proposedOutcome: 'Approve',
      rationale: 'Review scheduler proposal.',
      targetTaskId: 'task_decision_approval_surface',
      title: 'Confirm scheduler action',
    });

    expect(rightPanelSurface).toMatchObject({
      status: 'blocked',
      approvalItemAllowed: false,
      approvalQueueSurface: 'right_panel',
      missingRequirements: ['approval_queue'],
    });
    expect(rightPanelSurface.summary).toContain('approvalQueueSurface=right_panel');
    expect(rightPanelSurface.summary).toContain('approvalQueueSurfaceReady=no');
  });

  it('requires a complete duplicate-free Decision payload before scheduler proposals can become approval items', () => {
    const invalidPayload = planSchedulerDecisionProposal({
      approvalQueueConnected: true,
      approvalQueueSurface: 'task_dynamics',
      operatorConfirmed: true,
      operatorId: 'operator_1',
      options: ['Approve', ' approve '],
      proposedOutcome: 'Missing outcome',
      rationale: 'Review scheduler proposal.',
      targetTaskId: 'task_decision_payload',
      title: 'Confirm scheduler action',
    });

    expect(invalidPayload).toMatchObject({
      status: 'blocked',
      approvalItemAllowed: false,
      satisfiedRequirements: [
        'approval_queue',
        'target_task_identity',
        'authorization',
      ],
      missingRequirements: ['decision_payload'],
    });
    expect(invalidPayload.summary).toContain('decisionPayload=missing');
    expect(invalidPayload.summary).toContain('decisionPayloadIdentityChain=missing');
    expect(invalidPayload.summary).toContain('evidenceSourceType=missing');
    expect(invalidPayload.summary).toContain('evidenceSourceIdentityChain=missing');
    expect(invalidPayload.summary).toContain('decisionTitle=present');
    expect(invalidPayload.summary).toContain('decisionTitleKey=confirm_scheduler_action');
    expect(invalidPayload.summary).toContain('decisionRationale=present');
    expect(invalidPayload.summary).toContain('decisionOptions=2');
    expect(invalidPayload.summary).toContain('decisionOptionKeys=approve,approve');
    expect(invalidPayload.summary).toContain('decisionOptionIdentity=duplicate_or_missing');
    expect(invalidPayload.summary).toContain('decisionProposedOutcome=present');
    expect(invalidPayload.summary).toContain('decisionProposedOutcomeKey=missing_outcome');
    expect(invalidPayload.summary).toContain('decisionProposedOutcomeMatchesOption=no');
  });

  it('derives scheduler Decision proposal readiness from structured service evidence', () => {
    const partial = planSchedulerDecisionProposalFromEvidence({
      approvalQueue: {
        connected: true,
        surface: 'task_dynamics',
      },
      standingApproval: {
        active: true,
        policyId: 'policy_1',
        scopeTaskId: 'task_other',
      },
      proposal: {
        options: ['Approve', 'Hold'],
        proposedOutcome: 'Approve',
        rationale: 'Review scheduler proposal.',
        title: 'Confirm scheduler action',
      },
      targetTaskId: 'task_decision_3',
    });

    expect(partial).toMatchObject({
      status: 'blocked',
      approvalItemAllowed: false,
      approvalQueueSurface: 'task_dynamics',
      decisionPersistenceAllowed: false,
      schedulerTriggerAllowed: false,
      writebackDispatchAllowed: false,
      operatorId: null,
      standingApprovalPolicyId: 'policy_1',
      standingApprovalScopeTaskId: 'task_other',
      satisfiedRequirements: [
        'approval_queue',
        'decision_payload',
        'target_task_identity',
      ],
      missingRequirements: ['authorization'],
    });
    expect(partial.summary).toContain('requirements=3/4');
    expect(partial.summary).toContain('proposalSatisfiedRequirements=approval_queue,decision_payload,target_task_identity');
    expect(partial.summary).toContain('approvalQueueSurface=task_dynamics');
    expect(partial.summary).toContain('authorizationCount=0');
    expect(partial.summary).toContain('authorization=missing');
    expect(partial.summary).toContain('authorizationEvidenceChain=missing');
    expect(partial.summary).toContain('standingApprovalPolicyId=policy_1');
    expect(partial.summary).toContain('standingApprovalScopeTask=task_other');
    expect(partial.summary).toContain('standingApprovalActive=no');
    expect(partial.summary).toContain('standingApprovalScopeMatched=no');

    const localRecovery = planSchedulerDecisionProposalFromEvidence({
      approvalQueue: {
        connected: true,
        surface: 'task_dynamics',
      },
      localRecovery: {
        recoveredRunId: 'run_recovered_1',
        status: 'completed',
        taskId: 'task_decision_3',
      },
      proposal: {
        options: ['Approve', 'Hold'],
        proposedOutcome: 'Approve',
        rationale: 'Review scheduler proposal.',
        title: 'Confirm scheduler action',
      },
      targetTaskId: 'task_decision_3',
    });

    expect(localRecovery).toMatchObject({
      status: 'ready',
      approvalItemAllowed: true,
      approvalQueueSurface: 'task_dynamics',
      authorizations: ['local_recovery'],
      missingRequirements: [],
    });
    expect(localRecovery.summary).toContain('authorizationCount=1');
    expect(localRecovery.summary).toContain('authorization=local_recovery');
    expect(localRecovery.summary).toContain('authorizationEvidenceChain=ready');
    expect(localRecovery.summary).toContain('localRecoveryRunId=run_recovered_1');
    expect(localRecovery.summary).toContain('localRecoveryTask=task_decision_3');
    expect(localRecovery.summary).toContain('localRecoveryCompleted=yes');

    const wrongRecoveryTask = planSchedulerDecisionProposalFromEvidence({
      approvalQueue: {
        connected: true,
        surface: 'task_dynamics',
      },
      localRecovery: {
        recoveredRunId: 'run_recovered_1',
        status: 'completed',
        taskId: 'task_other',
      },
      proposal: {
        options: ['Approve', 'Hold'],
        proposedOutcome: 'Approve',
        rationale: 'Review scheduler proposal.',
        title: 'Confirm scheduler action',
      },
      targetTaskId: 'task_decision_3',
    });

    expect(wrongRecoveryTask).toMatchObject({
      status: 'blocked',
      approvalItemAllowed: false,
      authorizations: [],
      missingRequirements: ['authorization'],
    });
    expect(wrongRecoveryTask.summary).toContain('authorizationCount=0');
    expect(wrongRecoveryTask.summary).toContain('authorizationEvidenceChain=missing');
    expect(wrongRecoveryTask.summary).toContain('localRecoveryRunId=run_recovered_1');
    expect(wrongRecoveryTask.summary).toContain('localRecoveryTask=task_other');
    expect(wrongRecoveryTask.summary).toContain('localRecoveryCompleted=no');
    expect(wrongRecoveryTask.summary).toContain('localRecoveryTaskMatched=no');

    const ready = planSchedulerDecisionProposalFromEvidence({
      approvalQueue: {
        connected: true,
        surface: 'task_dynamics',
      },
      evidenceRunId: 'run_scheduler_service_evidence',
      operatorConfirmation: {
        confirmed: true,
        operatorId: 'operator_1',
      },
      proposal: {
        options: ['Approve', 'Hold'],
        proposedOutcome: 'Approve',
        rationale: 'Review scheduler proposal.',
        title: 'Confirm scheduler action',
      },
      standingApproval: {
        active: true,
        policyId: 'policy_1',
        scopeTaskId: 'task_decision_3',
      },
      targetTaskId: 'task_decision_3',
    });

    expect(ready).toMatchObject({
      status: 'ready',
      approvalItemAllowed: true,
      approvalQueueSurface: 'task_dynamics',
      decisionPersistenceAllowed: false,
      evidenceRunId: 'run_scheduler_service_evidence',
      evidenceSourceIdentityChain: 'ready',
      evidenceSourceType: 'run',
      schedulerTriggerAllowed: false,
      writebackDispatchAllowed: false,
      operatorId: 'operator_1',
      standingApprovalPolicyId: 'policy_1',
      standingApprovalScopeTaskId: 'task_decision_3',
      authorizations: [
        'operator_confirmation',
        'standing_approval',
      ],
      satisfiedRequirements: [
        'approval_queue',
        'decision_payload',
        'target_task_identity',
        'authorization',
      ],
      missingRequirements: [],
    });
    expect(ready.summary).toContain('proposalReady=yes');
    expect(ready.summary).toContain('requirements=4/4');
    expect(ready.summary).toContain('proposalSatisfiedRequirements=approval_queue,decision_payload,target_task_identity,authorization');
    expect(ready.summary).toContain('approvalQueueSurface=task_dynamics');
    expect(ready.summary).toContain('authorizationCount=2');
    expect(ready.summary).toContain('evidenceSourceType=run');
    expect(ready.summary).toContain('evidenceRunId=run_scheduler_service_evidence');
    expect(ready.summary).toContain('evidenceSourceIdentityChain=ready');
    expect(ready.summary).toContain('decisionPayloadIdentityChain=ready');
    expect(ready.summary).toContain('authorization=operator_confirmation,standing_approval');
    expect(ready.summary).toContain('authorizationEvidenceChain=ready');
    expect(ready.summary).toContain('operatorId=operator_1');
    expect(ready.summary).toContain('standingApprovalPolicyId=policy_1');
    expect(ready.summary).toContain('standingApprovalScopeTask=task_decision_3');
    expect(ready.summary).toContain('standingApprovalActive=yes');
    expect(ready.summary).toContain('standingApprovalScopeMatched=yes');
  });

  it('uses business-line scope for scheduler Decision proposals when a business-line owner is available', () => {
    const plan = planSchedulerDecisionProposalFromEvidence({
      approvalQueue: {
        connected: true,
        surface: 'task_dynamics',
      },
      businessLineId: 'bl_scheduler_1',
      operatorConfirmation: {
        confirmed: true,
        operatorId: 'operator_1',
      },
      proposal: {
        options: ['Pause loop', 'Keep watching'],
        proposedOutcome: 'Pause loop',
        rationale: 'The scheduled sensor found a risky mismatch.',
        title: 'Confirm business-line scheduler response',
      },
      standingApproval: {
        active: true,
        policyId: 'policy_1',
        scopeTaskId: 'task_scheduler_1',
      },
      targetTaskId: 'task_scheduler_1',
    });

    expect(plan).toMatchObject({
      status: 'ready',
      businessLineId: 'bl_scheduler_1',
      decisionScope: 'business_line',
      targetTaskId: 'task_scheduler_1',
    });
    expect(plan.summary).toContain('decisionScope=business_line');
    expect(plan.summary).toContain('businessLineId=bl_scheduler_1');
  });
});
