import { describe, expect, it } from 'vitest';

import {
  explainTaskTimelineEvent,
  getLatestResumeRelevantTimelineEvent,
  isResumeLatestChangeMetaEvent,
  getTaskTimelineFollowUpActionLabel,
  getTaskTimelineObjectAction,
  getTaskTimelinePreviewEvents,
  getTaskTimelinePriority,
  getTaskTimelineResponsibilitySummary,
  shouldExposeTaskTimelineFollowUpAction,
  shouldExposeTaskTimelineObjectAction,
} from './timeline.js';

describe('getTaskTimelinePreviewEvents', () => {
  it('uses explanatory timeline wording instead of resume-style latest-change wording', () => {
    expect(
      explainTaskTimelineEvent({
        type: 'task.run_failed',
        payload: JSON.stringify({
          failureReason: 'Model overloaded',
        }),
      }),
    ).toBe('执行失败：Model overloaded。');

    expect(
      explainTaskTimelineEvent({
        type: 'task.decision_approved',
        payload: JSON.stringify({
          decisionTitle: 'Approve launch',
        }),
      }),
    ).toBe('决策已获批准：Approve launch。');

    expect(
      explainTaskTimelineEvent({
        type: 'source_context.updated',
        payload: JSON.stringify({
          title: 'Customer notes',
        }),
      }),
    ).toBe('来源材料更新：Customer notes。');
  });

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
      'event_3',
      'event_4',
      'event_1',
      'event_2',
    ]);
  });

  it('classifies lifecycle-changing object events ahead of explanatory updates', () => {
    expect(getTaskTimelinePriority('blocker.created')).toBe('p1');
    expect(getTaskTimelinePriority('blocker.resolved')).toBe('p1');
    expect(getTaskTimelinePriority('task_dependency.created')).toBe('p1');
    expect(getTaskTimelinePriority('task_dependency.resolved')).toBe('p1');
    expect(getTaskTimelinePriority('artifact.created')).toBe('p1');

    expect(getTaskTimelinePriority('blocker.updated')).toBe('p2');
    expect(getTaskTimelinePriority('task_dependency.updated')).toBe('p2');
    expect(getTaskTimelinePriority('completion_criteria.satisfied')).toBe('p2');
    expect(getTaskTimelinePriority('completion_criteria.reopened')).toBe('p2');
    expect(getTaskTimelinePriority('process_template.skipped')).toBe('p2');

    expect(getTaskTimelinePriority('source_context.archived')).toBe('p3');
  });

  it('keeps process-template management events out of latest-change selection', () => {
    expect(isResumeLatestChangeMetaEvent('process_template.applied')).toBe(true);
    expect(isResumeLatestChangeMetaEvent('process_template.removed')).toBe(true);
    expect(isResumeLatestChangeMetaEvent('process_template.selected')).toBe(true);
    expect(isResumeLatestChangeMetaEvent('process_template.skipped')).toBe(true);
    expect(isResumeLatestChangeMetaEvent('task.run_failed')).toBe(false);

    expect(
      getLatestResumeRelevantTimelineEvent([
        { type: 'process_template.applied', payload: null },
        { type: 'process_template.selected', payload: null },
        { type: 'task.run_failed', payload: JSON.stringify({ failureReason: 'Model overloaded' }) },
      ])?.type,
    ).toBe('task.run_failed');
  });

  it('prefers action-shaping events over newer trace events for latest-change selection', () => {
    expect(
      getLatestResumeRelevantTimelineEvent([
        { type: 'task.updated', payload: null },
        { type: 'source_context.archived', payload: null },
        { type: 'task.decision_approved', payload: JSON.stringify({ decisionTitle: 'Approve launch' }) },
      ])?.type,
    ).toBe('task.decision_approved');

    expect(
      getLatestResumeRelevantTimelineEvent([
        { type: 'task.updated', payload: null },
        { type: 'source_context.archived', payload: null },
      ])?.type,
    ).toBe('task.updated');
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

  it('only exposes timeline actions for key events and strong explanatory events', () => {
    expect(shouldExposeTaskTimelineFollowUpAction('task.run_failed')).toBe(true);
    expect(getTaskTimelineFollowUpActionLabel('task.run_failed')).toBe('复核失败并重试');

    expect(shouldExposeTaskTimelineFollowUpAction('blocker.updated')).toBe(true);
    expect(getTaskTimelineFollowUpActionLabel('blocker.updated')).toBe('先解阻塞');

    expect(shouldExposeTaskTimelineFollowUpAction('process_template.selected')).toBe(false);
    expect(getTaskTimelineFollowUpActionLabel('process_template.selected')).toBeNull();
    expect(shouldExposeTaskTimelineFollowUpAction('task.updated')).toBe(false);
    expect(getTaskTimelineFollowUpActionLabel('task.updated')).toBeNull();
  });

  it('only exposes object entries for key events and strong source-context events', () => {
    expect(shouldExposeTaskTimelineObjectAction('task.decision_approved')).toBe(true);
    expect(
      getTaskTimelineObjectAction({
        type: 'task.decision_approved',
        payload: JSON.stringify({
          decisionId: 'decision_1',
          decisionTitle: 'Approve launch',
        }),
      }),
    ).toEqual({
      label: '查看 Decision',
      targetType: 'decision',
      targetId: 'decision_1',
    });

    expect(shouldExposeTaskTimelineObjectAction('source_context.updated')).toBe(true);
    expect(
      getTaskTimelineObjectAction({
        type: 'source_context.updated',
        payload: JSON.stringify({
          sourceContextId: 'source_context_1',
          title: 'Customer notes',
        }),
      }),
    ).toEqual({
      label: '查看来源',
      targetType: 'source_context',
      targetId: 'source_context_1',
    });

    expect(shouldExposeTaskTimelineObjectAction('process_template.selected')).toBe(false);
    expect(
      getTaskTimelineObjectAction({
        type: 'process_template.selected',
        payload: JSON.stringify({
          templateId: 'process_template_1',
          title: 'Launch checklist',
        }),
      }),
    ).toEqual({
      label: null,
      targetType: null,
      targetId: null,
    });
  });
});
