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
      schedulerTriggerAllowed: false,
      writebackDispatchAllowed: false,
      authorizations: [],
      targetTaskId: null,
      satisfiedRequirements: [],
      missingRequirements: [
        'approval_queue',
        'target_task_identity',
        'authorization',
      ],
      blockedReasons: [
        'Task Dynamics writeback approval queue is not connected.',
        'Scheduler/background Decision proposal requires a target task identity.',
        'Scheduler/background Decision proposal requires operator confirmation or active Standing Approval.',
      ],
    });
    expect(plan.summary).toContain('requirements=0/3');
    expect(plan.summary).toContain('proposalReady=no');
    expect(plan.summary).toContain('proposalRequirements=0/3');
    expect(plan.summary).toContain('approvalItemAllowed=false');
    expect(plan.summary).toContain('approvalQueueSurface=missing');
    expect(plan.summary).toContain('decisionPersistenceAllowed=false');
    expect(plan.summary).toContain('writebackDispatchAllowed=false');
    expect(plan.summary).toContain('schedulerTriggerAllowed=false');
    expect(plan.summary).toContain('targetTask=missing');
    expect(plan.summary).toContain('missingRequirements=approval_queue,target_task_identity,authorization');
    expect(plan.summary).toContain('proposalMissingRequirements=approval_queue,target_task_identity,authorization');
  });

  it('allows only a proposal approval item after operator confirmation', () => {
    const plan = planSchedulerDecisionProposal({
      approvalQueueConnected: true,
      operatorConfirmed: true,
      targetTaskId: 'task_decision_1',
    });

    expect(plan).toMatchObject({
      status: 'ready',
      approvalItemAllowed: true,
      approvalQueueSurface: 'unknown',
      decisionPersistenceAllowed: false,
      schedulerTriggerAllowed: false,
      writebackDispatchAllowed: false,
      authorizations: ['operator_confirmation'],
      targetTaskId: 'task_decision_1',
      satisfiedRequirements: [
        'approval_queue',
        'target_task_identity',
        'authorization',
      ],
      missingRequirements: [],
      blockedReasons: [],
    });
    expect(plan.summary).toContain('requirements=3/3');
    expect(plan.summary).toContain('proposalReady=yes');
    expect(plan.summary).toContain('proposalRequirements=3/3');
    expect(plan.summary).toContain('approvalQueueSurface=unknown');
    expect(plan.summary).toContain('authorization=operator_confirmation');
    expect(plan.summary).toContain('targetTask=task_decision_1');
    expect(plan.summary).toContain('missingRequirements=none');
    expect(plan.summary).toContain('proposalMissingRequirements=none');
    expect(plan.summary).toContain('blocked=none');
  });

  it('allows only a proposal approval item under active Standing Approval', () => {
    const plan = planSchedulerDecisionProposal({
      approvalQueueConnected: true,
      standingApprovalActive: true,
      targetTaskId: 'task_decision_2',
    });

    expect(plan).toMatchObject({
      status: 'ready',
      approvalItemAllowed: true,
      approvalQueueSurface: 'unknown',
      decisionPersistenceAllowed: false,
      schedulerTriggerAllowed: false,
      writebackDispatchAllowed: false,
      authorizations: ['standing_approval'],
      targetTaskId: 'task_decision_2',
      satisfiedRequirements: [
        'approval_queue',
        'target_task_identity',
        'authorization',
      ],
      missingRequirements: [],
      blockedReasons: [],
    });
    expect(plan.summary).toContain('requirements=3/3');
    expect(plan.summary).toContain('authorization=standing_approval');
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
      targetTaskId: 'task_decision_3',
    });

    expect(partial).toMatchObject({
      status: 'blocked',
      approvalItemAllowed: false,
      approvalQueueSurface: 'task_dynamics',
      decisionPersistenceAllowed: false,
      schedulerTriggerAllowed: false,
      writebackDispatchAllowed: false,
      satisfiedRequirements: [
        'approval_queue',
        'target_task_identity',
      ],
      missingRequirements: ['authorization'],
    });
    expect(partial.summary).toContain('requirements=2/3');
    expect(partial.summary).toContain('approvalQueueSurface=task_dynamics');
    expect(partial.summary).toContain('authorization=missing');

    const ready = planSchedulerDecisionProposalFromEvidence({
      approvalQueue: {
        connected: true,
        surface: 'task_dynamics',
      },
      operatorConfirmation: {
        confirmed: true,
        operatorId: 'operator_1',
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
      schedulerTriggerAllowed: false,
      writebackDispatchAllowed: false,
      authorizations: [
        'operator_confirmation',
        'standing_approval',
      ],
      satisfiedRequirements: [
        'approval_queue',
        'target_task_identity',
        'authorization',
      ],
      missingRequirements: [],
    });
    expect(ready.summary).toContain('proposalReady=yes');
    expect(ready.summary).toContain('requirements=3/3');
    expect(ready.summary).toContain('approvalQueueSurface=task_dynamics');
    expect(ready.summary).toContain('authorization=operator_confirmation,standing_approval');
  });
});
