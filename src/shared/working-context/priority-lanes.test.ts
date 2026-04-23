import { describe, expect, it } from 'vitest';

import { comparePriorityLaneContext } from './priority-lanes.js';

describe('comparePriorityLaneContext', () => {
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
});
