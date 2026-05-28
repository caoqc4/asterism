import { describe, expect, it } from 'vitest';
import {
  assertKnownPanelRuntimeTimelineEventType,
  getPanelRuntimeTimelineEventTitle,
  isPanelRuntimeTimelineEventType,
} from './runtime-panel-events.js';

describe('runtime panel events', () => {
  it('accepts known panel runtime event types', () => {
    expect(isPanelRuntimeTimelineEventType('panel.phase_closeout')).toBe(true);
    expect(isPanelRuntimeTimelineEventType('panel.context_switch_accepted')).toBe(true);
    expect(isPanelRuntimeTimelineEventType('panel.project_decomposed')).toBe(true);
    expect(isPanelRuntimeTimelineEventType('panel.project_membership_changed')).toBe(true);
    expect(getPanelRuntimeTimelineEventTitle('panel.task_file_written')).toBe('任务面板写入文件');
    expect(getPanelRuntimeTimelineEventTitle('panel.source_archived')).toBe('来源上下文已归档');
    expect(getPanelRuntimeTimelineEventTitle('panel.artifact_written')).toBe('任务产物已写入');
    expect(getPanelRuntimeTimelineEventTitle('panel.completion_handoff')).toBe('任务完成交接已记录');
    expect(getPanelRuntimeTimelineEventTitle('panel.standing_approval_confirmed')).toBe('Standing Approval 已确认');
    expect(getPanelRuntimeTimelineEventTitle('panel.scheduler_decision_proposed')).toBe('调度决策提案已进入审批队列');
    expect(getPanelRuntimeTimelineEventTitle('panel.scheduled_event_agent_triggered')).toBe('定时/事件 Agent 已启动');
    expect(getPanelRuntimeTimelineEventTitle('panel.context_switch_dismissed')).toBe('任务上下文切换已取消');
    expect(() => assertKnownPanelRuntimeTimelineEventType('panel.context_refreshed')).not.toThrow();
  });

  it('rejects unknown panel runtime event types', () => {
    expect(isPanelRuntimeTimelineEventType('panel.random')).toBe(false);
    expect(() => assertKnownPanelRuntimeTimelineEventType('panel.random')).toThrow(/Unknown panel runtime/);
  });

  it('does not constrain non-panel timeline event types', () => {
    expect(() => assertKnownPanelRuntimeTimelineEventType('task.updated')).not.toThrow();
  });
});
