export const PANEL_RUNTIME_TIMELINE_EVENT_TYPES = [
  'panel.context_refreshed',
  'panel.context_switch_accepted',
  'panel.context_switch_dismissed',
  'panel.task_goal_updated',
  'panel.task_goal_paused',
  'panel.task_goal_resumed',
  'panel.runtime_native_goal_requested',
  'panel.phase_closeout',
  'panel.task_file_written',
  'panel.task_file_created',
  'panel.task_file_moved',
  'panel.task_file_deleted',
  'panel.task_record_written',
  'panel.source_updated',
  'panel.source_archived',
  'panel.artifact_written',
  'panel.artifact_deleted',
  'panel.business_record_written',
  'panel.business_review_written',
  'panel.business_next_action_written',
  'panel.business_sop_revision_proposed',
  'panel.business_handoff_written',
  'panel.writeback_proposal_dismissed',
  'panel.project_decomposed',
  'panel.project_membership_changed',
  'panel.completion_handoff',
  'panel.standing_approval_confirmed',
  'panel.scheduler_decision_proposed',
  'panel.scheduled_event_agent_triggered',
] as const;

export type PanelRuntimeTimelineEventType = typeof PANEL_RUNTIME_TIMELINE_EVENT_TYPES[number];

const PANEL_RUNTIME_TIMELINE_EVENT_TYPE_SET = new Set<string>(PANEL_RUNTIME_TIMELINE_EVENT_TYPES);

export function isPanelRuntimeTimelineEventType(type: string): type is PanelRuntimeTimelineEventType {
  return PANEL_RUNTIME_TIMELINE_EVENT_TYPE_SET.has(type);
}

export function assertKnownPanelRuntimeTimelineEventType(type: string): void {
  if (type.startsWith('panel.') && !isPanelRuntimeTimelineEventType(type)) {
    throw new Error(`Unknown panel runtime timeline event type: ${type}`);
  }
}

export function getPanelRuntimeTimelineEventTitle(type: PanelRuntimeTimelineEventType): string {
  switch (type) {
    case 'panel.context_refreshed': return '任务会话已刷新';
    case 'panel.context_switch_accepted': return '任务上下文切换已确认';
    case 'panel.context_switch_dismissed': return '任务上下文切换已取消';
    case 'panel.task_goal_updated': return 'Task Goal 已更新';
    case 'panel.task_goal_paused': return 'Task Goal 已暂停';
    case 'panel.task_goal_resumed': return 'Task Goal 已恢复';
    case 'panel.runtime_native_goal_requested': return 'Native Goal 请求已记录';
    case 'panel.phase_closeout': return '阶段收尾已记录';
    case 'panel.task_file_written': return '任务面板写入文件';
    case 'panel.task_file_created': return '任务面板创建文件';
    case 'panel.task_file_moved': return '任务面板移动文件';
    case 'panel.task_file_deleted': return '任务面板删除文件';
    case 'panel.task_record_written': return '任务记录已写入';
    case 'panel.source_updated': return '来源上下文已更新';
    case 'panel.source_archived': return '来源上下文已归档';
    case 'panel.artifact_written': return '任务产物已写入';
    case 'panel.artifact_deleted': return '任务产物已删除';
    case 'panel.business_record_written': return '业务记录已写入';
    case 'panel.business_review_written': return '业务复盘已写入';
    case 'panel.business_next_action_written': return '业务线 Next Action 已创建';
    case 'panel.business_sop_revision_proposed': return '业务线 SOP revision 已提议';
    case 'panel.business_handoff_written': return '业务交接记录已写入';
    case 'panel.writeback_proposal_dismissed': return '写回提案已放弃';
    case 'panel.project_decomposed': return '项目拆解已确认';
    case 'panel.project_membership_changed': return '任务项目归属已更新';
    case 'panel.completion_handoff': return '任务完成交接已记录';
    case 'panel.standing_approval_confirmed': return 'Standing Approval 已确认';
    case 'panel.scheduler_decision_proposed': return '调度决策提案已进入审批队列';
    case 'panel.scheduled_event_agent_triggered': return '定时/事件 Agent 已启动';
  }
}
