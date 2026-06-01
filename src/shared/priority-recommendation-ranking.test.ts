import { describe, expect, it } from 'vitest';

import {
  projectPriorityAttention,
  routePriorityAttention,
  sortPriorityRecommendations,
  type PriorityRecommendationCandidate,
  type PriorityRecommendationTaskSignal,
} from './priority-recommendation-ranking.js';

function candidate(partial: Partial<PriorityRecommendationCandidate> & { id: string; taskId?: string | null }): PriorityRecommendationCandidate {
  return {
    lane: 'continue_or_review',
    priority: 'medium',
    order: 0,
    taskId: partial.taskId ?? null,
    ...partial,
  };
}

describe('priority recommendation ranking', () => {
  it('uses one sorted attention order for legacy task queues and limited Brief summaries', () => {
    const candidates = [
      candidate({ id: 'waiting:task_waiting', taskId: 'task_waiting', lane: 'clarify', order: 4 }),
      candidate({ id: 'next-step:task_continue', taskId: 'task_continue', order: 3 }),
      candidate({ id: 'decision:decision_1', taskId: 'task_decision', lane: 'unblock_or_decide', priority: 'high', order: 1 }),
      candidate({ id: 'risk:task_risk', taskId: 'task_risk', lane: 'escalate_now', priority: 'high', order: 2 }),
      candidate({ id: 'artifact:artifact_1', taskId: 'task_artifact', order: 5 }),
      candidate({ id: 'near-completion:task_near', taskId: 'task_near', order: 6 }),
    ];
    const taskById = new Map<string, PriorityRecommendationTaskSignal>(
      candidates.map((item) => [item.taskId!, { id: item.taskId! }]),
    );

    const full = projectPriorityAttention({ candidates, taskById });
    const brief = projectPriorityAttention({ candidates, taskById, displayLimit: 3 });

    expect(full.items.map((item) => item.id)).toEqual(sortPriorityRecommendations(candidates, taskById).map((item) => item.id));
    expect(brief.items.map((item) => item.id)).toEqual(full.items.slice(0, 3).map((item) => item.id));
    expect(brief).toMatchObject({
      totalCount: 6,
      displayedCount: 3,
      truncated: true,
      displayLimit: 3,
    });
  });

  it('routes business-line Today suggestions to a business focus and executable Next Action', () => {
    const suggestions = [
      candidate({
        id: 'business-line-record-gap:line_record_gap',
        businessLineId: 'line_record_gap',
        suggestionType: 'record_gap',
        lane: 'clarify',
        priority: 'medium',
        whyNow: 'This business line lacks a source-backed record before safe execution.',
        order: 2,
      }),
      candidate({
        id: 'business-line-improvement:line_improvement',
        businessLineId: 'line_improvement',
        suggestionType: 'improvement',
        lane: 'continue_or_review',
        priority: 'medium',
        whyNow: 'Accepted SOP learning should shape the next recommendation.',
        order: 3,
      }),
      candidate({
        id: 'business-line-progress:line_growth:task_next',
        businessLineId: 'line_growth',
        nextActionTaskId: 'task_next',
        taskId: 'task_next',
        suggestionType: 'progress',
        lane: 'continue_or_review',
        priority: 'high',
        whyNow: 'Recent customer evidence makes this Next Action the best progress move.',
        order: 1,
      }),
    ];

    const projection = projectPriorityAttention({
      candidates: suggestions,
      taskById: new Map([['task_next', { id: 'task_next' }]]),
    });

    expect(suggestions.map((item) => item.suggestionType)).toEqual(expect.arrayContaining([
      'progress',
      'record_gap',
      'improvement',
    ]));
    expect(projection.items.map((item) => item.businessLineId)).toEqual(expect.arrayContaining([
      'line_record_gap',
      'line_improvement',
      'line_growth',
    ]));

    const recordGapRoute = routePriorityAttention({
      candidates: [suggestions[0]!],
      taskById: new Map(),
    });
    expect(recordGapRoute).toMatchObject({
      executableTaskId: null,
      focusBusinessLineId: 'line_record_gap',
      focusTaskId: null,
      recommendedMovement: 'shape',
      suggestionType: 'record_gap',
    });

    const route = routePriorityAttention({
      candidates: [suggestions[2]!],
      taskById: new Map([['task_next', { id: 'task_next' }]]),
    });
    expect(route).toMatchObject({
      executableTaskId: 'task_next',
      focusBusinessLineId: 'line_growth',
      focusTaskId: 'task_next',
      lane: 'continue_or_review',
      recommendedMovement: 'execute',
      suggestionType: 'progress',
      whyNow: 'Recent customer evidence makes this Next Action the best progress move.',
    });
    expect(route.reason).toBe(route.whyNow);
  });

  it('keeps upstream tasks ahead of dependent downstream tasks in both projections', () => {
    const upstream = candidate({
      id: 'next-step:task_upstream',
      taskId: 'task_upstream',
      order: 2,
    });
    const downstream = candidate({
      id: 'task-dependency:dependency_1',
      taskId: 'task_downstream',
      lane: 'unblock_or_decide',
      priority: 'high',
      order: 1,
    });
    const taskById = new Map<string, PriorityRecommendationTaskSignal>([
      ['task_upstream', { id: 'task_upstream' }],
      ['task_downstream', {
        id: 'task_downstream',
        activeDependency: { blockedByTaskId: 'task_upstream' },
      }],
    ]);

    const projection = projectPriorityAttention({
      candidates: [downstream, upstream],
      taskById,
      displayLimit: 1,
    });

    expect(projection.items.map((item) => item.id)).toEqual(['next-step:task_upstream']);
    expect(projection.truncated).toBe(true);
  });

  it('returns a shared priority route for Pilot and Brief coordination without starting execution', () => {
    const decision = candidate({
      id: 'decision:decision_1',
      taskId: 'task_decision',
      lane: 'unblock_or_decide',
      priority: 'high',
      order: 2,
    });
    const staleRisk = candidate({
      id: 'risk:task_risk',
      taskId: 'task_risk',
      lane: 'escalate_now',
      priority: 'high',
      order: 1,
    });
    const taskById = new Map<string, PriorityRecommendationTaskSignal>([
      ['task_decision', { id: 'task_decision' }],
      ['task_risk', { id: 'task_risk' }],
    ]);

    const route = routePriorityAttention({
      candidates: [staleRisk, decision],
      taskById,
    });

    expect(route).toMatchObject({
      executableTaskId: 'task_decision',
      escalationRequired: false,
      focusBusinessLineId: null,
      focusTaskId: 'task_decision',
      lane: 'unblock_or_decide',
      recommendedMovement: 'ask',
      suggestionType: null,
    });
    expect(route.reason).toContain('decision:decision_1');
  });

  it('keeps legacy task queues as compatibility inputs for high-risk and empty routes', () => {
    const route = routePriorityAttention({
      candidates: [candidate({
        id: 'risk:task_risk',
        taskId: 'task_risk',
        lane: 'escalate_now',
        priority: 'high',
      })],
      taskById: new Map([['task_risk', { id: 'task_risk' }]]),
    });

    expect(route).toMatchObject({
      executableTaskId: 'task_risk',
      escalationRequired: true,
      focusBusinessLineId: null,
      focusTaskId: 'task_risk',
      lane: 'escalate_now',
      recommendedMovement: 'pause',
      suggestionType: null,
    });

    expect(routePriorityAttention({ candidates: [], taskById: new Map() })).toEqual({
      executableTaskId: null,
      escalationRequired: false,
      focusBusinessLineId: null,
      focusTaskId: null,
      lane: 'steady',
      reason: 'No competing business-line attention signals are present.',
      recommendedMovement: 'pause',
      suggestionType: null,
      whyNow: 'No competing business-line attention signals are present.',
    });
  });
});
