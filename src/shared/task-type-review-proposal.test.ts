import { describe, expect, it } from 'vitest';

import { buildLocalTaskTypeReviewProposal } from './task-type-review-proposal.js';

describe('task type review proposal', () => {
  it('builds a local structured project-type proposal before metadata writes', () => {
    const proposal = buildLocalTaskTypeReviewProposal({
      taskId: 'task_1',
      taskTitle: '开发小程序',
      currentType: 'simple',
    });

    expect(proposal).toMatchObject({
      taskId: 'task_1',
      currentType: 'simple',
      suggestedType: 'project',
      suggestedFacets: ['project'],
      source: 'local_rule',
      sourceLabel: '本地结构化类型规则',
    });
    expect(proposal.reason).toContain('一次性');
    expect(proposal.reason).toContain('项目型');
    expect(proposal.nextAction).toContain('拆解边界');
  });

  it('keeps same-type reviews as proposals instead of writing directly', () => {
    const proposal = buildLocalTaskTypeReviewProposal({
      taskId: 'task_2',
      taskTitle: '准备投资人沟通材料',
      currentType: 'simple',
    });

    expect(proposal.suggestedType).toBe('simple');
    expect(proposal.reason).toContain('一致');
  });
});
