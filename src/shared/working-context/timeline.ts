import type { TimelineEventRecord } from '../types/task.js';

export type TaskTimelinePriority = 'p1' | 'p2' | 'p3';

export type WorkingContextRecentChange =
  | {
      kind: 'run_failed';
      title?: string;
      failureReason?: string;
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

export function isResumeLatestChangeMetaEvent(type: string): boolean {
  return type === 'process_template.selected' || type === 'process_template.skipped';
}

export function getLatestResumeRelevantTimelineEvent(
  timeline: Array<Pick<TimelineEventRecord, 'type' | 'payload'>>,
): Array<Pick<TimelineEventRecord, 'type' | 'payload'>>[number] | undefined {
  return timeline.find((event) => !isResumeLatestChangeMetaEvent(event.type)) ?? timeline[0];
}

export function interpretTaskTimelineEvent(
  event: Pick<TimelineEventRecord, 'type' | 'payload'>,
): {
  summary: string;
  objectAction: {
    label: string | null;
    targetType: 'decision' | 'run' | 'source_context' | null;
    targetId: string | null;
  };
  recentChange: WorkingContextRecentChange;
} {
  const payload = event.payload ? safeJsonParse(event.payload) : null;

  switch (event.type) {
    case 'task.run_failed':
      return {
        summary: `最近一次执行失败：${String(payload?.failureReason ?? '未记录失败原因')}。`,
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
    case 'task.run_completed':
      return {
        summary: `最近一次执行已完成，任务恢复到 ${String(payload?.nextState ?? 'planned')}。`,
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
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: {
          kind: 'waiting_item_changed',
          waitingReason: typeof payload?.reason === 'string' ? payload.reason : undefined,
        },
      };
    case 'waiting_item.updated':
      return {
        summary: `更新等待项：${String(payload?.reason ?? '未填写')}`,
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: {
          kind: 'waiting_item_changed',
          waitingReason: typeof payload?.reason === 'string' ? payload.reason : undefined,
        },
      };
    case 'waiting_item.resolved':
      return {
        summary: `解除等待项：${String(payload?.reason ?? '未填写')}，任务恢复到 ${String(payload?.nextState ?? 'planned')}`,
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: {
          kind: 'waiting_item_resolved',
          nextState: typeof payload?.nextState === 'string' ? payload.nextState : undefined,
        },
      };
    case 'source_context.created':
    case 'source_context.updated':
      return {
        summary: `最近更新了来源材料：${String(payload?.title ?? '未命名来源')}。`,
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
    case 'artifact.created':
      return {
        summary: `最近生成了产物：${String(payload?.title ?? '未命名产物')}。`,
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
          objectAction: { label: null, targetType: null, targetId: null },
          recentChange: {
            kind: 'risk_changed',
          },
        };
      }
    case 'task.next_step_changed':
      return {
        summary: `下一步从“${String(payload?.from ?? '未填写')}”调整为“${String(payload?.to ?? '未填写')}”`,
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: { kind: 'unknown' },
      };
    case 'task.transitioned':
      return {
        summary: `状态从 ${String(payload?.from ?? '未知')} 变更为 ${String(payload?.to ?? '未知')}`,
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: { kind: 'unknown' },
      };
    default:
      return {
        summary: '最近有新的任务活动。',
        objectAction: { label: null, targetType: null, targetId: null },
        recentChange: { kind: 'unknown' },
      };
  }
}

export function getTaskTimelineFollowUpActionLabel(type: string): string | null {
  switch (type) {
    case 'task.decision_cancelled':
      return '生成新的 Decision';
    case 'task.decision_approved':
      return '继续推进任务';
    case 'task.decision_deferred':
      return '补跟进动作';
    case 'task.run_failed':
      return '准备重试 Run';
    case 'task.waiting_changed':
      return '补跟进动作';
    case 'task.risk_changed':
      return '处理风险';
    case 'artifact.created':
      return '基于产物继续推进';
    default:
      return null;
  }
}

export function getTaskTimelinePriority(type: string): TaskTimelinePriority {
  switch (type) {
    case 'task.run_failed':
    case 'task.run_completed':
    case 'task.decision_approved':
    case 'task.decision_deferred':
    case 'task.decision_cancelled':
    case 'waiting_item.resolved':
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
    case 'process_template.selected':
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
