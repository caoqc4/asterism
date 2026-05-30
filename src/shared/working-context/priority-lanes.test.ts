import { describe, expect, it } from 'vitest';

import { comparePriorityLaneContext } from './priority-lanes.js';

describe('comparePriorityLaneContext', () => {
  it('keeps lane order usable for business-line attention and Today why now explanations', () => {
    expect(
      comparePriorityLaneContext(
        { lane: 'unblock_or_decide' },
        { lane: 'continue_or_review' },
      ),
    ).toBeLessThan(0);
  });

  it('prioritizes completion-ready work ahead of near-completion work within continue/review', () => {
    expect(
      comparePriorityLaneContext(
        {
          lane: 'continue_or_review',
          completionProgress: { total: 2, satisfied: 2, open: 0 },
        },
        {
          lane: 'continue_or_review',
          completionProgress: { total: 2, satisfied: 1, open: 1 },
        },
      ),
    ).toBeLessThan(0);
  });

  it('prioritizes near-completion work ahead of generic continue/review work', () => {
    expect(
      comparePriorityLaneContext(
        {
          lane: 'continue_or_review',
          completionProgress: { total: 2, satisfied: 1, open: 1 },
        },
        {
          lane: 'continue_or_review',
          completionProgress: null,
        },
      ),
    ).toBeLessThan(0);
  });

  it('keeps legacy task completion progress as a compatibility tiebreaker after business lane selection', () => {
    expect(
      comparePriorityLaneContext(
        {
          lane: 'continue_or_review',
          completionProgress: { total: 3, satisfied: 2, open: 1 },
        },
        {
          lane: 'continue_or_review',
          completionProgress: { total: 0, satisfied: 0, open: 0 },
        },
      ),
    ).toBeLessThan(0);
  });
});
