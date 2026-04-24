import { describe, expect, it } from 'vitest';

import { buildHomeResumeLatestChange } from './assembler.js';

describe('buildHomeResumeLatestChange', () => {
  it('uses meaningful timeline events when home activity has no matching item', () => {
    const latestChange = buildHomeResumeLatestChange({
      latestActivity: undefined,
      timeline: [
        { type: 'task.updated', payload: null },
        {
          type: 'task.decision_approved',
          payload: JSON.stringify({
            decisionId: 'decision_1',
            decisionTitle: 'Approve launch',
          }),
        },
      ],
      keySource: null,
    });

    expect(latestChange).toMatchObject({
      summary: '最近一条决策已获批准：Approve launch。',
      action: {
        label: '查看 Decision',
        targetType: 'decision',
        targetId: 'decision_1',
      },
      recentChange: {
        kind: 'decision_approved',
        title: 'Approve launch',
      },
    });
  });

  it('keeps weak trace events behind recovery slices on home resume previews', () => {
    const latestChange = buildHomeResumeLatestChange({
      latestActivity: undefined,
      timeline: [
        { type: 'task.updated', payload: null },
        { type: 'source_context.archived', payload: null },
      ],
      keySource: {
        id: 'source_context_1',
        title: 'Customer notes',
      },
    });

    expect(latestChange).toMatchObject({
      summary: '最近关键来源更新：Customer notes',
      action: {
        label: '查看来源',
        targetType: 'source_context',
        targetId: 'source_context_1',
      },
      recentChange: {
        kind: 'source_context_changed',
        title: 'Customer notes',
      },
    });
  });
});
