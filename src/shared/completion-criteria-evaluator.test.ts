import { describe, expect, it } from 'vitest';

import { evaluateCompletionCriteria } from './completion-criteria-evaluator.js';

describe('completion criteria evaluator', () => {
  it('allows specific verifiable criteria', () => {
    expect(evaluateCompletionCriteria({
      text: '用户确认需求范围、流程边界和验收口径。',
    })).toMatchObject({
      allowed: true,
      issues: [],
    });
  });

  it('blocks empty or generic acceptance placeholders', () => {
    expect(evaluateCompletionCriteria({
      text: ' ',
    })).toMatchObject({
      allowed: false,
      issues: [
        {
          code: 'empty',
        },
      ],
    });

    expect(evaluateCompletionCriteria({
      text: '完成后能明确验收。',
    })).toMatchObject({
      allowed: false,
      issues: [
        {
          code: 'generic_acceptance',
        },
      ],
    });
  });

  it('blocks duplicate open criteria but ignores satisfied criteria and the updated record itself', () => {
    expect(evaluateCompletionCriteria({
      text: '用户确认验收清单。',
      existingCriteria: [
        {
          id: 'criteria_1',
          status: 'open',
          text: '用户确认验收清单',
        },
      ],
    })).toMatchObject({
      allowed: false,
      issues: [
        {
          code: 'duplicate_open_criteria',
          matchedCriteriaId: 'criteria_1',
        },
      ],
    });

    expect(evaluateCompletionCriteria({
      text: '用户确认验收清单。',
      existingCriteria: [
        {
          id: 'criteria_1',
          status: 'satisfied',
          text: '用户确认验收清单',
        },
        {
          id: 'criteria_2',
          status: 'open',
          text: '用户确认验收清单。',
        },
      ],
      excludeCriteriaId: 'criteria_2',
    })).toMatchObject({
      allowed: true,
    });
  });
});
