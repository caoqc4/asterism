import { describe, expect, it } from 'vitest';

import { getTaskTimelinePreviewEvents, getTaskTimelineResponsibilitySummary } from './timeline.js';

describe('getTaskTimelinePreviewEvents', () => {
  it('prioritizes lane-critical events ahead of weaker explanatory items in compact previews', () => {
    const timeline = [
      {
        id: 'event_1',
        type: 'task.waiting_changed',
        createdAt: '2026-01-01T06:00:00.000Z',
      },
      {
        id: 'event_2',
        type: 'task.next_step_changed',
        createdAt: '2026-01-01T05:00:00.000Z',
      },
      {
        id: 'event_3',
        type: 'blocker.created',
        createdAt: '2026-01-01T04:00:00.000Z',
      },
      {
        id: 'event_4',
        type: 'task.risk_changed',
        createdAt: '2026-01-01T03:00:00.000Z',
      },
      {
        id: 'event_5',
        type: 'task.transitioned',
        createdAt: '2026-01-01T02:00:00.000Z',
      },
      {
        id: 'event_6',
        type: 'task.updated',
        createdAt: '2026-01-01T01:00:00.000Z',
      },
    ];

    expect(getTaskTimelinePreviewEvents(timeline, 4).map((event) => event.id)).toEqual([
      'event_4',
      'event_3',
      'event_1',
      'event_2',
    ]);
  });

  it('derives responsibility summaries for blocker and dependency events', () => {
    expect(
      getTaskTimelineResponsibilitySummary({
        type: 'blocker.created',
        payload: JSON.stringify({
          title: 'Legal approval pending',
          owner: '法务团队确认',
        }),
      }),
    ).toBe('当前由 法务团队确认 推动解除');

    expect(
      getTaskTimelineResponsibilitySummary({
        type: 'task_dependency.created',
        payload: JSON.stringify({
          blockedByTaskTitle: 'Publish partner list',
        }),
      }),
    ).toBe('当前主要由上游任务“Publish partner list”推进');
  });
});
