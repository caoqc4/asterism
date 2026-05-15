import { describe, expect, it } from 'vitest';

import { summarizeDecisionEffects } from './decision-effect-evaluator.js';
import type { DecisionRecord } from './types/decision.js';

const now = '2026-01-01T00:00:00.000Z';

function buildDecision(partial: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: partial.id ?? 'decision_1',
    taskId: partial.taskId ?? 'task_1',
    title: partial.title ?? '是否上线',
    status: partial.status ?? 'pending',
    scope: partial.scope ?? 'task',
    kind: partial.kind ?? 'direction_choice',
    sourceType: partial.sourceType ?? 'agent_checkpoint',
    sourceId: partial.sourceId ?? null,
    sourceLabel: partial.sourceLabel ?? null,
    context: partial.context ?? null,
    options: partial.options ?? [],
    recommendation: partial.recommendation ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

describe('decision effect evaluator', () => {
  it('treats pending decisions as blocking user action', () => {
    expect(summarizeDecisionEffects([
      buildDecision({ id: 'pending_1' }),
      buildDecision({ id: 'approved_1', status: 'approved' }),
    ])).toMatchObject({
      tone: 'blocking',
      pendingCount: 1,
      approvedCount: 1,
      blockingCount: 1,
      requiresUserAction: true,
      effectLabel: '待拍板阻断',
    });
  });

  it('treats deferred decisions as explicit completion risk', () => {
    expect(summarizeDecisionEffects([
      buildDecision({ id: 'deferred_1', status: 'deferred' }),
    ])).toMatchObject({
      tone: 'deferred',
      deferredCount: 1,
      requiresUserAction: true,
      effectLabel: '存在延后拍板',
    });
  });

  it('summarizes approved decisions as reusable completion evidence', () => {
    expect(summarizeDecisionEffects([
      buildDecision({ id: 'approved_1', status: 'approved' }),
    ])).toMatchObject({
      tone: 'accepted',
      approvedCount: 1,
      requiresUserAction: false,
      effectLabel: '拍板已通过',
    });
  });
});
