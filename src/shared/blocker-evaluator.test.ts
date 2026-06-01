import { describe, expect, it } from 'vitest';

import { evaluateBlockerBoundary } from './blocker-evaluator.js';

describe('blocker evaluator', () => {
  it('allows titled blockers', () => {
    expect(evaluateBlockerBoundary({
      title: 'Legal approval pending',
    })).toMatchObject({
      allowed: true,
      issues: [],
    });
  });

  it('blocks empty blocker titles', () => {
    expect(evaluateBlockerBoundary({
      title: '   ',
    })).toMatchObject({
      allowed: false,
      issues: [
        {
          code: 'missing_title',
        },
      ],
      summary: '阻塞项暂不能保存：阻塞项缺少标题，不能保存。',
    });
  });
});
