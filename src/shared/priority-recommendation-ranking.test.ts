import { describe, expect, it } from 'vitest';

import {
  projectPriorityAttention,
  sortPriorityRecommendations,
  type PriorityRecommendationCandidate,
  type PriorityRecommendationTaskSignal,
} from './priority-recommendation-ranking.js';

function candidate(partial: Partial<PriorityRecommendationCandidate> & { id: string; taskId: string }): PriorityRecommendationCandidate {
  return {
    lane: 'continue_or_review',
    priority: 'medium',
    order: 0,
    ...partial,
  };
}

describe('priority recommendation ranking', () => {
  it('uses one sorted attention order for full Tasks queues and limited Brief summaries', () => {
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
});
