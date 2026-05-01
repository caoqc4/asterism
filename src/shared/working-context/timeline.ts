import type { TimelineEventRecord } from '../types/task.js';
import type { PriorityLane } from '../types/brief.js';
import { comparePriorityLanes, getPriorityLaneLabel } from './priority-lanes.js';

export type TaskTimelinePriority = 'p1' | 'p2' | 'p3';

export type TaskTimelinePriorityGroup<T> = {
  id: TaskTimelinePriority;
  title: string;
  events: T[];
};

export type TaskTimelineDateGroup<T> = {
  id: string;
  title: string;
  eventCount: number;
  priorityGroups: Array<TaskTimelinePriorityGroup<T>>;
};

export type WorkingContextRecentChange =
  | {
      kind: 'run_failed';
      title?: string;
      failureReason?: string;
    }
  | {
      kind: 'run_paused';
      title?: string;
      pauseReason?: string;
    }
  | {
      kind: 'run_completed';
      title?: string;
      nextState?: string;
    }
  | {
      kind: 'decision_approved' | 'decision_deferred' | 'decision_cancelled';
      title?: string;
      waitingReason?: string;
    }
  | {
      kind: 'source_context_changed';
      title?: string;
    }
  | {
      kind: 'blocker_changed';
      title?: string;
    }
  | {
      kind: 'blocker_resolved';
      title?: string;
    }
  | {
      kind: 'task_dependency_changed';
      title?: string;
    }
  | {
      kind: 'task_dependency_resolved';
      title?: string;
    }
  | {
      kind: 'completion_criteria_changed';
      title?: string;
    }
  | {
      kind: 'artifact_created';
      title?: string;
    }
  | {
      kind: 'waiting_item_changed';
      waitingReason?: string;
    }
  | {
      kind: 'waiting_item_resolved';
      nextState?: string;
    }
  | {
      kind: 'risk_changed';
    }
  | {
      kind: 'unknown';
    };

export function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseTimelinePayload(payload: string | null | undefined): Record<string, unknown> | null {
  return payload ? safeJsonParse(payload) : null;
}

function appendChinesePeriod(value: unknown): string {
  const text = String(value);
  return /[。！？.!?]$/.test(text) ? text : `${text}。`;
}

export function isResumeLatestChangeMetaEvent(type: string): boolean {
  return (
    type === 'process_template.applied' ||
    type === 'process_template.removed' ||
    type === 'process_template.selected' ||
    type === 'process_template.skipped'
  );
}

export function getLatestResumeRelevantTimelineEvent(
  timeline: Array<Pick<TimelineEventRecord, 'type' | 'payload'>>,
): Array<Pick<TimelineEventRecord, 'type' | 'payload'>>[number] | undefined {
  const nonMetaEvent = timeline.find((event) => !isResumeLatestChangeMetaEvent(event.type));

  return (
    timeline.find(
      (event) =>
        !isResumeLatestChangeMetaEvent(event.type) &&
        getTaskTimelinePriority(event.type) !== 'p3',
    ) ??
    nonMetaEvent ??
    timeline[0]
  );
}

export function interpretTaskTimelineEvent(
  event: Pick<TimelineEventRecord, 'type' | 'payload'>,
): {
  summary: string;
  responsibilitySummary: string | null;
  objectAction: {
    label: string | null;
    targetType: 'decision' | 'run' | 'source_context' | null;
    targetId: string | null;
  };
  recentChange: WorkingContextRecentChange;
} {
  const payload = parseTimelinePayload(event.payload);

  switch (event.type) {
    case 'task.run_failed':
      return {
        summary: `最近一次执行失败：${appendChinesePeriod(payload?.failureReason ?? '未记录失败原因')}`,
        responsibilitySummary: null,
        objectAction: {
          label: payload?.runId ? '查看 Run' : null,
          targetType: payload?.runId ? 'run' : null,
          targetId: typeof payload?.runId === 'string' ? payload.runId : null,
        },
        recentChange: {
          kind: 'run_failed',
          failureReason: typeof payload?.failureReason === 'string' ? payload.failureReason : undefined,
        },
      };
    case 'task.run_paused':
      return {
        summary: `最近一次执行暂停待复核：${appendChinesePeriod(payload?.pauseReason ?? '未记录暂停原因')}`,
        responsibilitySummary: null,
        objectAction: {
          label: payload?.runId ? '查看 Run' : null,
          targetType: payload?.runId ? 'run' : null,
          targetId: typeof payload?.runId === 'string' ? payload.runId : null,
        },
        recentChange: {
          kind: 'run_paused',
          pauseReason: typeof payload?.pauseReason === 'string' ? payload.pauseReason : undefined,
        },
      };
    case 'task.run_completed':
      return {
        summary: `最近一次执行已完成，任务恢复到 ${String(payload?.nextState ?? 'planned')}。`,
        responsibilitySummary: null,
        objectAction: {
          label: payload?.runId ? '查看 Run' : null,
          targetType: payload?.runId ? 'run' : null,
          targetId: typeof payload?.runId === 'string' ? payload.runId : null,
        },
        recentChange: {
          kind: 'run_completed',
          nextState: typeof payload?.nextState === 'string' ? payload.nextState : undefined,
        },
      };
    case 'task.decision_approved':
      return {
        summary: `最近一条决策已获批准：${String(payload?.decisionTitle ?? '未命名决策')}。`,
        responsibilitySummary: null,
        objectAction: {
          label: payload?.decisionId ? '查看 Decision' : null,
          targetType: payload?.decisionId ? 'decision' : null,
          targetId: typeof payload?.decisionId === 'string' ? payload.decisionId : null,
        },
        recentChange: {
          kind: 'decision_approved',
          title: typeof payload?.decisionTitle === 'string' ? payload.decisionTitle : undefined,
        },
      };
    case 'task.decision_deferred':
      return {
        summary: `最近一条决策被延后，当前等待：${String(payload?.waitingReason ?? '未填写')}。`,
        responsibilitySummary: null,
        objectAction: {
          label: payload?.decisionId ? '查看 Decision' : null,
          targetType: payload?.decisionId ? 'decision' : null,
          targetId: typeof payload?.decisionId === 'string' ? payload.decisionId : null,
        },
        recentChange: {
          kind: 'decision_deferred',
          title: typeof payload?.decisionTitle === 'string' ? payload.decisionTitle : undefined,
          waitingReason: typeof payload?.waitingReason === 'string' ? payload.waitingReason : undefined,
        },
      };
    case 'task.decision_cancelled':
      return {
        summary: `最近一条决策已取消：${String(payload?.decisionTitle ?? '未命名决策')}。`,
        responsibilitySummary: null,
        objectAction: {
          label: payload?.decisionId ? '查看 Decision' : null,
          targetType: payload?.decisionId ? 'decision' : null,
          targetId: typeof payload?.decisionId === 'string' ? payload.decisionId : null,
        },
        recentChange: {
          kind: 'decision_cancelled',
          title: typeof payload?.decisionTitle === 'string' ? payload.decisionTitle : undefined,
        },
      };
    case 'waiting_item.created':
      return {
        summary: `创建等待项：${String(payload?.reason ?? '未填写')}`,
        responsibilitySummary: null,
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: {
          kind: 'waiting_item_changed',
          waitingReason: typeof payload?.reason === 'string' ? payload.reason : undefined,
        },
      };
    case 'waiting_item.updated':
      return {
        summary: `更新等待项：${String(payload?.reason ?? '未填写')}`,
        responsibilitySummary: null,
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: {
          kind: 'waiting_item_changed',
          waitingReason: typeof payload?.reason === 'string' ? payload.reason : undefined,
        },
      };
    case 'waiting_item.resolved':
      return {
        summary: `解除等待项：${String(payload?.reason ?? '未填写')}，任务恢复到 ${String(payload?.nextState ?? 'planned')}`,
        responsibilitySummary: null,
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: {
          kind: 'waiting_item_resolved',
          nextState: typeof payload?.nextState === 'string' ? payload.nextState : undefined,
        },
      };
    case 'task.waiting_changed':
      return {
        summary: `等待原因从“${String(payload?.from ?? '未填写')}”调整为“${String(payload?.to ?? '未填写')}”`,
        responsibilitySummary: null,
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: {
          kind: 'waiting_item_changed',
          waitingReason: typeof payload?.to === 'string' ? payload.to : undefined,
        },
      };
    case 'source_context.created':
    case 'source_context.updated':
      return {
        summary: `最近更新了来源材料：${String(payload?.title ?? '未命名来源')}。`,
        responsibilitySummary: null,
        objectAction: {
          label: payload?.sourceContextId ? '查看来源' : null,
          targetType: payload?.sourceContextId ? 'source_context' : null,
          targetId: typeof payload?.sourceContextId === 'string' ? payload.sourceContextId : null,
        },
        recentChange: {
          kind: 'source_context_changed',
          title: typeof payload?.title === 'string' ? payload.title : undefined,
        },
      };
    case 'blocker.created':
    case 'blocker.updated':
      return {
        summary: `最近更新了阻塞项：${String(payload?.title ?? '未命名阻塞项')}。`,
        responsibilitySummary:
          typeof payload?.owner === 'string' && payload.owner.trim()
            ? `当前由 ${payload.owner.trim()} 推动解除`
            : null,
        objectAction: {
          label: payload?.sourceContextId ? '查看来源' : null,
          targetType: payload?.sourceContextId ? 'source_context' : null,
          targetId: typeof payload?.sourceContextId === 'string' ? payload.sourceContextId : null,
        },
        recentChange: {
          kind: 'blocker_changed',
          title: typeof payload?.title === 'string' ? payload.title : undefined,
        },
      };
    case 'blocker.resolved':
      return {
        summary: `最近解除阻塞项：${String(payload?.title ?? '未命名阻塞项')}。`,
        responsibilitySummary:
          typeof payload?.owner === 'string' && payload.owner.trim()
            ? `当前由 ${payload.owner.trim()} 推动解除`
            : null,
        objectAction: {
          label: payload?.sourceContextId ? '查看来源' : null,
          targetType: payload?.sourceContextId ? 'source_context' : null,
          targetId: typeof payload?.sourceContextId === 'string' ? payload.sourceContextId : null,
        },
        recentChange: {
          kind: 'blocker_resolved',
          title: typeof payload?.title === 'string' ? payload.title : undefined,
        },
      };
    case 'task_dependency.created':
    case 'task_dependency.updated':
      return {
        summary: `最近更新了任务依赖：${String(payload?.blockedByTaskTitle ?? '未命名上游任务')}。`,
        responsibilitySummary:
          typeof payload?.blockedByTaskTitle === 'string' && payload.blockedByTaskTitle.trim()
            ? `当前主要由上游任务“${payload.blockedByTaskTitle.trim()}”推进`
            : '当前主要由上游任务链路推进',
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: {
          kind: 'task_dependency_changed',
          title:
            typeof payload?.blockedByTaskTitle === 'string' ? payload.blockedByTaskTitle : undefined,
        },
      };
    case 'task_dependency.resolved':
      return {
        summary: `最近解除任务依赖：${String(payload?.blockedByTaskTitle ?? '未命名上游任务')}。`,
        responsibilitySummary:
          typeof payload?.blockedByTaskTitle === 'string' && payload.blockedByTaskTitle.trim()
            ? `当前主要由上游任务“${payload.blockedByTaskTitle.trim()}”推进`
            : '当前主要由上游任务链路推进',
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: {
          kind: 'task_dependency_resolved',
          title:
            typeof payload?.blockedByTaskTitle === 'string' ? payload.blockedByTaskTitle : undefined,
        },
      };
    case 'completion_criteria.created':
    case 'completion_criteria.updated':
      return {
        summary: `最近更新了完成标准：${String(payload?.text ?? '未命名完成标准')}。`,
        responsibilitySummary: null,
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: {
          kind: 'completion_criteria_changed',
          title: typeof payload?.text === 'string' ? payload.text : undefined,
        },
      };
    case 'completion_criteria.satisfied':
      return {
        summary: `最近满足了一条完成标准：${String(payload?.text ?? '未命名完成标准')}。`,
        responsibilitySummary: null,
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: {
          kind: 'completion_criteria_changed',
          title: typeof payload?.text === 'string' ? payload.text : undefined,
        },
      };
    case 'completion_criteria.reopened':
      return {
        summary: `最近重新打开了一条完成标准：${String(payload?.text ?? '未命名完成标准')}。`,
        responsibilitySummary: null,
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: {
          kind: 'completion_criteria_changed',
          title: typeof payload?.text === 'string' ? payload.text : undefined,
        },
      };
    case 'artifact.created':
      return {
        summary: `最近生成了产物：${String(payload?.title ?? '未命名产物')}。`,
        responsibilitySummary: null,
        objectAction: {
          label: payload?.sourceType === 'run' && typeof payload?.sourceId === 'string' ? '查看 Run' : null,
          targetType: payload?.sourceType === 'run' && typeof payload?.sourceId === 'string' ? 'run' : null,
          targetId: payload?.sourceType === 'run' && typeof payload?.sourceId === 'string' ? payload.sourceId : null,
        },
        recentChange: {
          kind: 'artifact_created',
          title: typeof payload?.title === 'string' ? payload.title : undefined,
        },
      };
    case 'task.risk_changed':
      {
        const from = (payload?.from as Record<string, unknown> | undefined) ?? {};
        const to = (payload?.to as Record<string, unknown> | undefined) ?? {};
        return {
          summary: `风险从 ${String(from.level ?? '未填写')}（${String(from.note ?? '未填写')}）调整为 ${String(to.level ?? '未填写')}（${String(to.note ?? '未填写')}）`,
          responsibilitySummary: null,
          objectAction: { label: null, targetType: null, targetId: null },
          recentChange: {
            kind: 'risk_changed',
          },
        };
      }
    case 'task.next_step_changed':
      return {
        summary: `下一步从“${String(payload?.from ?? '未填写')}”调整为“${String(payload?.to ?? '未填写')}”`,
        responsibilitySummary: null,
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: { kind: 'unknown' },
      };
    case 'task.transitioned':
      return {
        summary: `状态从 ${String(payload?.from ?? '未知')} 变更为 ${String(payload?.to ?? '未知')}`,
        responsibilitySummary: null,
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: { kind: 'unknown' },
      };
    default:
      return {
        summary: '最近有新的任务活动。',
        responsibilitySummary: null,
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: { kind: 'unknown' },
      };
  }
}

export function getTaskTimelineResponsibilitySummary(
  event: Pick<TimelineEventRecord, 'type' | 'payload'>,
): string | null {
  return interpretTaskTimelineEvent(event).responsibilitySummary;
}

export function explainTaskTimelineEvent(
  event: Pick<TimelineEventRecord, 'type' | 'payload'>,
): string {
  const payload = parseTimelinePayload(event.payload);

  switch (event.type) {
    case 'task.created':
      return `创建任务：${String(payload?.title ?? '未填写')}`;
    case 'task.updated':
      return '任务字段已更新';
    case 'task.run_failed':
      return `执行失败：${appendChinesePeriod(payload?.failureReason ?? '未记录失败原因')}`;
    case 'task.run_paused':
      return `执行暂停待复核：${appendChinesePeriod(payload?.pauseReason ?? '未记录暂停原因')}`;
    case 'task.run_completed':
      return `执行完成，任务恢复到 ${String(payload?.nextState ?? 'planned')}。`;
    case 'task.decision_approved':
      return `决策已获批准：${String(payload?.decisionTitle ?? '未命名决策')}。`;
    case 'task.decision_deferred':
      return `决策被延后，当前等待：${String(payload?.waitingReason ?? '未填写')}。`;
    case 'task.decision_cancelled':
      return `决策已取消：${String(payload?.decisionTitle ?? '未命名决策')}。`;
    case 'task.waiting_changed':
      return interpretTaskTimelineEvent(event).summary;
    case 'source_context.created':
    case 'source_context.updated':
      return `来源材料更新：${String(payload?.title ?? '未命名来源')}。`;
    case 'source_context.archived':
      return `归档来源材料：${String(payload?.title ?? '未填写')}`;
    case 'blocker.created':
    case 'blocker.updated':
      return `阻塞项更新：${String(payload?.title ?? '未命名阻塞项')}。`;
    case 'blocker.resolved':
      return `阻塞项解除：${String(payload?.title ?? '未命名阻塞项')}。`;
    case 'task_dependency.created':
    case 'task_dependency.updated':
      return `任务依赖更新：${String(payload?.blockedByTaskTitle ?? '未命名上游任务')}。`;
    case 'task_dependency.resolved':
      return `任务依赖解除：${String(payload?.blockedByTaskTitle ?? '未命名上游任务')}。`;
    case 'completion_criteria.created':
    case 'completion_criteria.updated':
      return `完成标准更新：${String(payload?.text ?? '未命名完成标准')}。`;
    case 'completion_criteria.satisfied':
      return `完成标准已满足：${String(payload?.text ?? '未命名完成标准')}。`;
    case 'completion_criteria.reopened':
      return `完成标准重新打开：${String(payload?.text ?? '未命名完成标准')}。`;
    case 'artifact.created':
      return `生成产物：${String(payload?.title ?? '未命名产物')}。`;
    case 'process_template.applied':
      return `挂载方法模板：${String(payload?.title ?? '未填写')} [${String(payload?.kind ?? '未填写')}]`;
    case 'process_template.removed':
      return `移除方法模板：${String(payload?.title ?? '未填写')} [${String(payload?.kind ?? '未填写')}]`;
    case 'process_template.selected': {
      const sourceType = payload?.sourceType === 'decision_draft' ? '决策草拟' : '执行';
      const titles = Array.isArray(payload?.titles) ? payload.titles.join('、') : payload?.titles;
      return `本次${sourceType}选择方法模板：${String(titles ?? '未填写')}；原因：${String(payload?.reason ?? '未填写')}`;
    }
    case 'process_template.skipped': {
      const sourceType = payload?.sourceType === 'decision_draft' ? '决策草拟' : '执行';
      return `本次${sourceType}未调用方法模板；原因：${String(payload?.reason ?? '未填写')}`;
    }
    default:
      return interpretTaskTimelineEvent(event).summary;
  }
}

export function formatTaskTimelineEventSummary(event: Pick<TimelineEventRecord, 'type' | 'payload'>): string {
  switch (event.type) {
    case 'task.created':
    case 'task.updated':
    case 'task.run_failed':
    case 'task.run_paused':
    case 'task.run_completed':
    case 'task.decision_approved':
    case 'task.decision_deferred':
    case 'task.decision_cancelled':
    case 'task.waiting_changed':
    case 'task.risk_changed':
    case 'task.next_step_changed':
    case 'task.transitioned':
    case 'waiting_item.created':
    case 'waiting_item.updated':
    case 'waiting_item.resolved':
    case 'source_context.created':
    case 'source_context.updated':
    case 'source_context.archived':
    case 'blocker.created':
    case 'blocker.updated':
    case 'blocker.resolved':
    case 'task_dependency.created':
    case 'task_dependency.updated':
    case 'task_dependency.resolved':
    case 'completion_criteria.created':
    case 'completion_criteria.updated':
    case 'completion_criteria.satisfied':
    case 'completion_criteria.reopened':
    case 'artifact.created':
    case 'process_template.applied':
    case 'process_template.removed':
    case 'process_template.selected':
    case 'process_template.skipped':
      return explainTaskTimelineEvent(event);
    default:
      return event.type;
  }
}

export function getTaskTimelineEventLabel(type: string): string {
  switch (type) {
    case 'task.created':
      return '创建';
    case 'task.decision_approved':
      return '决策批准';
    case 'task.decision_deferred':
      return '决策延后';
    case 'task.decision_cancelled':
      return '决策取消';
    case 'task.run_failed':
      return '执行失败';
    case 'task.run_paused':
      return '执行暂停';
    case 'task.run_completed':
      return '执行完成';
    case 'task.transitioned':
      return '状态';
    case 'task.next_step_changed':
      return '下一步';
    case 'task.waiting_changed':
      return '等待';
    case 'waiting_item.created':
    case 'waiting_item.updated':
    case 'waiting_item.resolved':
      return '等待项';
    case 'artifact.created':
      return '产物';
    case 'source_context.created':
    case 'source_context.updated':
    case 'source_context.archived':
      return '来源';
    case 'blocker.created':
    case 'blocker.updated':
    case 'blocker.resolved':
      return '阻塞';
    case 'task_dependency.created':
    case 'task_dependency.updated':
    case 'task_dependency.resolved':
      return '依赖';
    case 'completion_criteria.created':
    case 'completion_criteria.updated':
    case 'completion_criteria.satisfied':
    case 'completion_criteria.reopened':
      return '完成标准';
    case 'process_template.applied':
    case 'process_template.removed':
    case 'process_template.selected':
    case 'process_template.skipped':
      return '方法';
    case 'task.risk_changed':
      return '风险';
    case 'task.updated':
      return '更新';
    default:
      return type;
  }
}

function isStrongExplanatoryTimelineAction(type: string): boolean {
  return (
    type === 'task.waiting_changed' ||
    type === 'task.risk_changed' ||
    type === 'blocker.updated' ||
    type === 'task_dependency.updated'
  );
}

function isStrongExplanatoryObjectEntry(type: string): boolean {
  return type === 'source_context.created' || type === 'source_context.updated';
}

export function shouldExposeTaskTimelineFollowUpAction(type: string): boolean {
  return getTaskTimelinePriority(type) === 'p1' || isStrongExplanatoryTimelineAction(type);
}

export function shouldExposeTaskTimelineObjectAction(type: string): boolean {
  return getTaskTimelinePriority(type) === 'p1' || isStrongExplanatoryObjectEntry(type);
}

export function getTaskTimelineFollowUpActionLabel(type: string): string | null {
  if (!shouldExposeTaskTimelineFollowUpAction(type)) {
    return null;
  }

  switch (type) {
    case 'task.decision_cancelled':
      return '重新评估并拍板';
    case 'task.decision_approved':
      return '继续推进';
    case 'task.decision_deferred':
      return '补清拍板条件';
    case 'task.run_failed':
      return '复核失败并重试';
    case 'task.run_paused':
      return '复核暂停原因';
    case 'task.waiting_changed':
      return '补清等待条件';
    case 'task.risk_changed':
      return '优先处理风险';
    case 'blocker.created':
    case 'blocker.updated':
    case 'task_dependency.created':
    case 'task_dependency.updated':
      return '先解阻塞';
    case 'task_dependency.resolved':
      return '确认解除依赖';
    case 'artifact.created':
      return '基于产物继续推进';
    default:
      return null;
  }
}

export function getTaskTimelineObjectAction(
  event: Pick<TimelineEventRecord, 'type' | 'payload'>,
): ReturnType<typeof interpretTaskTimelineEvent>['objectAction'] {
  const emptyAction = {
    label: null,
    targetType: null,
    targetId: null,
  } as const;

  if (!shouldExposeTaskTimelineObjectAction(event.type)) {
    return emptyAction;
  }

  const objectAction = interpretTaskTimelineEvent(event).objectAction;

  if (!objectAction.label || !objectAction.targetType || !objectAction.targetId) {
    return emptyAction;
  }

  return objectAction;
}

export function getTaskTimelineLane(type: string): PriorityLane {
  switch (type) {
    case 'task.risk_changed':
      return 'escalate_now';
    case 'task.decision_cancelled':
    case 'task.decision_deferred':
    case 'blocker.created':
    case 'blocker.updated':
    case 'task_dependency.created':
    case 'task_dependency.updated':
      return 'unblock_or_decide';
    case 'task.run_failed':
    case 'task.run_paused':
    case 'task.run_completed':
    case 'task.decision_approved':
    case 'artifact.created':
    case 'source_context.created':
    case 'source_context.updated':
    case 'blocker.resolved':
    case 'task_dependency.resolved':
      return 'continue_or_review';
    case 'task.waiting_changed':
    case 'waiting_item.created':
    case 'waiting_item.updated':
    case 'waiting_item.resolved':
    case 'task.next_step_changed':
      return 'clarify';
    default:
      return 'steady';
  }
}

export function getTaskTimelineLaneLabel(type: string): string | null {
  return getPriorityLaneLabel(getTaskTimelineLane(type));
}

export function getTaskTimelinePriority(type: string): TaskTimelinePriority {
  switch (type) {
    case 'task.run_failed':
    case 'task.run_paused':
    case 'task.run_completed':
    case 'task.decision_approved':
    case 'task.decision_deferred':
    case 'task.decision_cancelled':
    case 'waiting_item.resolved':
    case 'blocker.created':
    case 'blocker.resolved':
    case 'task_dependency.created':
    case 'task_dependency.resolved':
    case 'artifact.created':
      return 'p1';
    case 'task.next_step_changed':
    case 'task.waiting_changed':
    case 'task.risk_changed':
    case 'task.transitioned':
    case 'waiting_item.created':
    case 'waiting_item.updated':
    case 'source_context.created':
    case 'source_context.updated':
    case 'blocker.updated':
    case 'task_dependency.updated':
    case 'completion_criteria.created':
    case 'completion_criteria.updated':
    case 'completion_criteria.satisfied':
    case 'completion_criteria.reopened':
    case 'process_template.selected':
    case 'process_template.skipped':
      return 'p2';
    default:
      return 'p3';
  }
}

export function getTaskTimelinePriorityLabel(type: string): string {
  switch (getTaskTimelinePriority(type)) {
    case 'p1':
      return '关键';
    case 'p2':
      return '解释';
    default:
      return '留痕';
  }
}

export function getTaskTimelinePriorityGroupTitle(priority: TaskTimelinePriority): string {
  switch (priority) {
    case 'p1':
      return '关键事件';
    case 'p2':
      return '解释事件';
    default:
      return '留痕事件';
  }
}

export function groupTaskTimelineEventsByPriority<T extends Pick<TimelineEventRecord, 'type'>>(
  events: T[],
): Array<TaskTimelinePriorityGroup<T>> {
  const groups: Array<TaskTimelinePriorityGroup<T>> = [
    { id: 'p1', title: getTaskTimelinePriorityGroupTitle('p1'), events: [] },
    { id: 'p2', title: getTaskTimelinePriorityGroupTitle('p2'), events: [] },
    { id: 'p3', title: getTaskTimelinePriorityGroupTitle('p3'), events: [] },
  ];

  for (const event of events) {
    groups.find((group) => group.id === getTaskTimelinePriority(event.type))?.events.push(event);
  }

  return groups.filter((group) => group.events.length > 0);
}

export function getTaskTimelineDateGroupTitle(createdAt: string): string {
  const date = createdAt.split('T')[0]?.trim();
  return date || '日期未知';
}

export function groupTaskTimelineEventsByDateAndPriority<
  T extends Pick<TimelineEventRecord, 'createdAt' | 'type'>,
>(events: T[]): Array<TaskTimelineDateGroup<T>> {
  const groupsByDate = new Map<string, T[]>();

  for (const event of events) {
    const date = getTaskTimelineDateGroupTitle(event.createdAt);
    const dateEvents = groupsByDate.get(date);

    if (dateEvents) {
      dateEvents.push(event);
    } else {
      groupsByDate.set(date, [event]);
    }
  }

  return [...groupsByDate.entries()]
    .sort(([left], [right]) => {
      if (left === '日期未知') {
        return 1;
      }

      if (right === '日期未知') {
        return -1;
      }

      return right.localeCompare(left);
    })
    .map(([date, dateEvents]) => ({
      id: date,
      title: date,
      eventCount: dateEvents.length,
      priorityGroups: groupTaskTimelineEventsByPriority(dateEvents),
    }));
}

export function getTaskTimelinePreviewEvents<T extends Pick<TimelineEventRecord, 'type' | 'createdAt'>>(
  timeline: T[],
  count: number,
): T[] {
  return [...timeline]
    .sort((left, right) => {
      const priorityOrder = { p1: 0, p2: 1, p3: 2 } as const;
      const priorityDiff =
        priorityOrder[getTaskTimelinePriority(left.type)] - priorityOrder[getTaskTimelinePriority(right.type)];

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      const laneDiff = comparePriorityLanes(getTaskTimelineLane(left.type), getTaskTimelineLane(right.type));

      if (laneDiff !== 0) {
        return laneDiff;
      }

      return right.createdAt.localeCompare(left.createdAt);
    })
    .slice(0, count);
}
