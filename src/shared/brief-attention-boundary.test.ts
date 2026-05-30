import { describe, expect, it } from 'vitest';

import {
  briefAttentionLaneForCandidate,
  projectBriefAttention,
} from './brief-attention-boundary.js';
import { projectPriorityAttention, type PriorityRecommendationCandidate } from './priority-recommendation-ranking.js';

describe('brief attention boundary', () => {
  it('keeps Brief display limits separate from the full business-line why-now queue', () => {
    const projection = projectPriorityAttention({
      candidates: [
        candidate({ id: 'decision:task_1', lane: 'unblock_or_decide', priority: 'high', order: 1 }),
        candidate({ id: 'next-step:task_2', lane: 'continue_or_review', priority: 'medium', order: 2 }),
        candidate({ id: 'artifact:task_3', lane: 'continue_or_review', priority: 'low', order: 3 }),
      ],
      taskById: new Map(),
      displayLimit: 2,
    });
    const brief = projectBriefAttention(projection);

    expect(brief.items.map((item) => item.candidate.id)).toEqual([
      'decision:task_1',
      'artifact:task_3',
    ]);
    expect(brief).toMatchObject({
      totalCount: 3,
      displayedCount: 2,
      displayLimit: 2,
      truncated: true,
    });
    expect(brief.summary).toContain('Today/Pilot share the full why-now queue');
  });

  it('maps priority candidates into explicit Brief inclusion lanes', () => {
    expect(briefAttentionLaneForCandidate(candidate({ id: 'decision:task_1', lane: 'unblock_or_decide' }))).toBe('unblock_or_decide');
    expect(briefAttentionLaneForCandidate(candidate({ id: 'source-context:next-step:task_1', lane: 'continue_or_review' }))).toBe('review_evidence');
    expect(briefAttentionLaneForCandidate(candidate({ id: 'external-signal:mail_1', lane: 'clarify' }))).toBe('external_signal');
    expect(briefAttentionLaneForCandidate(candidate({ id: 'completion-ready:task_1', lane: 'continue_or_review' }))).toBe('recent_outcome');
    expect(briefAttentionLaneForCandidate(candidate({ id: 'next-step:task_1', lane: 'continue_or_review' }))).toBe('continue_next_step');
  });

  it('adds an explanation for every displayed Brief attention item', () => {
    const brief = projectBriefAttention(projectPriorityAttention({
      candidates: [
        candidate({ id: 'blocker:task_1', lane: 'unblock_or_decide' }),
        candidate({ id: 'source-context:blocker:task_2', lane: 'continue_or_review' }),
      ],
      taskById: new Map(),
      displayLimit: null,
    }));

    expect(brief.items.every((item) => item.reason.length > 0)).toBe(true);
    expect(brief.items.map((item) => item.lane)).toEqual(['unblock_or_decide', 'unblock_or_decide']);
  });
});

function candidate(partial: Partial<PriorityRecommendationCandidate>): PriorityRecommendationCandidate {
  return {
    id: 'next-step:task_1',
    taskId: 'task_1',
    lane: 'continue_or_review',
    priority: 'medium',
    order: 0,
    ...partial,
  };
}
