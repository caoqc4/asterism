import { describe, expect, it } from 'vitest';

import { planSchedulerDecisionProposal } from './scheduler-decision-proposal.js';

describe('scheduler decision proposal contract', () => {
  it('blocks background Decision proposal work without approval queue and authorization', () => {
    const plan = planSchedulerDecisionProposal();

    expect(plan).toMatchObject({
      status: 'blocked',
      approvalItemAllowed: false,
      decisionPersistenceAllowed: false,
      schedulerTriggerAllowed: false,
      writebackDispatchAllowed: false,
      authorizations: [],
      blockedReasons: [
        'Task Dynamics writeback approval queue is not connected.',
        'Scheduler/background Decision proposal requires operator confirmation or active Standing Approval.',
      ],
    });
    expect(plan.summary).toContain('approvalItemAllowed=false');
    expect(plan.summary).toContain('decisionPersistenceAllowed=false');
    expect(plan.summary).toContain('writebackDispatchAllowed=false');
    expect(plan.summary).toContain('schedulerTriggerAllowed=false');
  });

  it('allows only a proposal approval item after operator confirmation', () => {
    const plan = planSchedulerDecisionProposal({
      approvalQueueConnected: true,
      operatorConfirmed: true,
    });

    expect(plan).toMatchObject({
      status: 'ready',
      approvalItemAllowed: true,
      decisionPersistenceAllowed: false,
      schedulerTriggerAllowed: false,
      writebackDispatchAllowed: false,
      authorizations: ['operator_confirmation'],
      blockedReasons: [],
    });
    expect(plan.summary).toContain('authorization=operator_confirmation');
    expect(plan.summary).toContain('blocked=none');
  });

  it('allows only a proposal approval item under active Standing Approval', () => {
    const plan = planSchedulerDecisionProposal({
      approvalQueueConnected: true,
      standingApprovalActive: true,
    });

    expect(plan).toMatchObject({
      status: 'ready',
      approvalItemAllowed: true,
      decisionPersistenceAllowed: false,
      schedulerTriggerAllowed: false,
      writebackDispatchAllowed: false,
      authorizations: ['standing_approval'],
      blockedReasons: [],
    });
    expect(plan.summary).toContain('authorization=standing_approval');
  });
});
