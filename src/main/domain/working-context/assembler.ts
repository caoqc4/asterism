import type { HomeActivityRecord, HomeTaskResumePreviewRecord } from '../../../shared/types/brief.js';
import type { AppliedProcessTemplateRecord } from '../../../shared/types/process-template.js';
import type { SourceContextRecord } from '../../../shared/types/source-context.js';
import type { TaskDetailBase, TaskResumeCardRecord, TaskRiskLevel, TimelineEventRecord } from '../../../shared/types/task.js';

type TimelineLite = Array<Pick<TimelineEventRecord, 'type' | 'payload'>>;

type WorkingContextRecentChange =
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
  timeline: TimelineLite,
): TimelineLite[number] | undefined {
  return timeline.find((event) => !isResumeLatestChangeMetaEvent(event.type)) ?? timeline[0];
}

export function getCurrentMethodSelectionReason(params: {
  timeline: TimelineLite;
  currentMethod: AppliedProcessTemplateRecord | null;
  audience: 'task' | 'home';
}): string | null {
  const { timeline, currentMethod, audience } = params;

  if (!currentMethod) {
    return null;
  }

  const selectedEvent = timeline.find((event) => {
    if (event.type !== 'process_template.selected' || !event.payload) {
      return false;
    }

    const payload = safeJsonParse(event.payload);
    const templateIds = Array.isArray(payload?.templateIds) ? payload.templateIds : [];
    return templateIds.includes(currentMethod.id);
  });

  if (!selectedEvent?.payload) {
    return currentMethod.summary ?? null;
  }

  const payload = safeJsonParse(selectedEvent.payload);
  const reason = typeof payload?.reason === 'string' ? payload.reason.trim() : '';

  if (!reason) {
    return currentMethod.summary ?? null;
  }

  const sourceType = payload?.sourceType === 'decision_draft'
    ? (audience === 'task' ? '决策草拟' : '最近用于决策草拟')
    : (audience === 'task' ? '执行' : '最近用于执行');

  return audience === 'task' ? `最近用于${sourceType}：${reason}` : `${sourceType}：${reason}`;
}

export function getKeySourcePriorityReason(params: {
  timeline: TimelineLite;
  keySource: Pick<SourceContextRecord, 'id' | 'title' | 'note' | 'isKey'>;
  audience: 'task' | 'home';
}): string | null {
  const { timeline, keySource, audience } = params;

  const sourceEvent = timeline.find((event) => {
    if (
      (event.type !== 'source_context.created' && event.type !== 'source_context.updated')
      || !event.payload
    ) {
      return false;
    }

    const payload = safeJsonParse(event.payload);
    return payload?.sourceContextId === keySource.id;
  });

  const normalizedNote = keySource.note?.trim() || '';

  if (keySource.isKey) {
    if (normalizedNote) {
      return audience === 'task'
        ? `当前被标记为关键来源：${normalizedNote}`
        : `关键来源：${normalizedNote}`;
    }

    if (sourceEvent?.type === 'source_context.created') {
      return audience === 'task'
        ? '最近加入并标记为关键来源，建议优先参考。'
        : '最近加入并标记为关键来源。';
    }

    if (sourceEvent?.type === 'source_context.updated') {
      return audience === 'task'
        ? '最近更新并保留为关键来源，建议优先参考。'
        : '最近更新并保留为关键来源。';
    }

    return audience === 'task'
      ? '当前被标记为关键来源，建议优先参考。'
      : '当前被标记为关键来源。';
  }

  if (sourceEvent?.type === 'source_context.updated') {
    return audience === 'task' ? '最近更新了该来源，建议先查看。' : '最近更新了该来源。';
  }

  if (sourceEvent?.type === 'source_context.created') {
    return audience === 'task' ? '最近加入了该来源，建议先查看。' : '最近加入了该来源。';
  }

  return normalizedNote
    ? (audience === 'task'
      ? `当前是最相关的来源材料：${normalizedNote}`
      : `来源说明：${normalizedNote}`)
    : (audience === 'task' ? '当前是最相关的来源材料。' : '当前最相关的来源材料。');
}

export function buildTaskResumeLatestChange(
  timeline: TimelineLite,
): TaskResumeCardRecord['latestChangeAction'] & {
  summary: string;
  recentChange: WorkingContextRecentChange | null;
} {
  const latestEvent = getLatestResumeRelevantTimelineEvent(timeline);

  if (!latestEvent) {
    return {
      summary: '最近没有新的生命周期变化。',
      label: null,
      targetType: null,
      targetId: null,
      recentChange: null,
    };
  }

  const payload = latestEvent.payload ? safeJsonParse(latestEvent.payload) : null;

  switch (latestEvent.type) {
    case 'task.run_failed':
      return {
        summary: `最近一次执行失败：${String(payload?.failureReason ?? '未记录失败原因')}。`,
        label: payload?.runId ? '查看 Run' : null,
        targetType: payload?.runId ? 'run' : null,
        targetId: typeof payload?.runId === 'string' ? payload.runId : null,
        recentChange: {
          kind: 'run_failed',
          failureReason: typeof payload?.failureReason === 'string' ? payload.failureReason : undefined,
        },
      };
    case 'task.run_completed':
      return {
        summary: `最近一次执行已完成，任务恢复到 ${String(payload?.nextState ?? 'planned')}。`,
        label: payload?.runId ? '查看 Run' : null,
        targetType: payload?.runId ? 'run' : null,
        targetId: typeof payload?.runId === 'string' ? payload.runId : null,
        recentChange: {
          kind: 'run_completed',
          nextState: typeof payload?.nextState === 'string' ? payload.nextState : undefined,
        },
      };
    case 'task.decision_approved':
      return {
        summary: `最近一条决策已获批准：${String(payload?.decisionTitle ?? '未命名决策')}。`,
        label: payload?.decisionId ? '查看 Decision' : null,
        targetType: payload?.decisionId ? 'decision' : null,
        targetId: typeof payload?.decisionId === 'string' ? payload.decisionId : null,
        recentChange: {
          kind: 'decision_approved',
          title: typeof payload?.decisionTitle === 'string' ? payload.decisionTitle : undefined,
        },
      };
    case 'task.decision_deferred':
      return {
        summary: `最近一条决策被延后，当前等待：${String(payload?.waitingReason ?? '未填写')}。`,
        label: payload?.decisionId ? '查看 Decision' : null,
        targetType: payload?.decisionId ? 'decision' : null,
        targetId: typeof payload?.decisionId === 'string' ? payload.decisionId : null,
        recentChange: {
          kind: 'decision_deferred',
          title: typeof payload?.decisionTitle === 'string' ? payload.decisionTitle : undefined,
          waitingReason: typeof payload?.waitingReason === 'string' ? payload.waitingReason : undefined,
        },
      };
    case 'task.decision_cancelled':
      return {
        summary: `最近一条决策已取消：${String(payload?.decisionTitle ?? '未命名决策')}。`,
        label: payload?.decisionId ? '查看 Decision' : null,
        targetType: payload?.decisionId ? 'decision' : null,
        targetId: typeof payload?.decisionId === 'string' ? payload.decisionId : null,
        recentChange: {
          kind: 'decision_cancelled',
          title: typeof payload?.decisionTitle === 'string' ? payload.decisionTitle : undefined,
        },
      };
    case 'waiting_item.created':
    case 'waiting_item.updated':
      return {
        summary: `最近更新了等待项：${String(payload?.reason ?? '未填写')}。`,
        label: null,
        targetType: null,
        targetId: null,
        recentChange: {
          kind: 'waiting_item_changed',
          waitingReason: typeof payload?.reason === 'string' ? payload.reason : undefined,
        },
      };
    case 'waiting_item.resolved':
      return {
        summary: `最近解除等待项，任务恢复到 ${String(payload?.nextState ?? 'planned')}。`,
        label: null,
        targetType: null,
        targetId: null,
        recentChange: {
          kind: 'waiting_item_resolved',
          nextState: typeof payload?.nextState === 'string' ? payload.nextState : undefined,
        },
      };
    case 'source_context.created':
    case 'source_context.updated':
      return {
        summary: `最近更新了来源材料：${String(payload?.title ?? '未命名来源')}。`,
        label: payload?.sourceContextId ? '查看来源' : null,
        targetType: payload?.sourceContextId ? 'source_context' : null,
        targetId: typeof payload?.sourceContextId === 'string' ? payload.sourceContextId : null,
        recentChange: {
          kind: 'source_context_changed',
          title: typeof payload?.title === 'string' ? payload.title : undefined,
        },
      };
    case 'artifact.created':
      return {
        summary: `最近生成了产物：${String(payload?.title ?? '未命名产物')}。`,
        label: payload?.sourceType === 'run' && typeof payload?.sourceId === 'string' ? '查看 Run' : null,
        targetType: payload?.sourceType === 'run' && typeof payload?.sourceId === 'string' ? 'run' : null,
        targetId: payload?.sourceType === 'run' && typeof payload?.sourceId === 'string' ? payload.sourceId : null,
        recentChange: {
          kind: 'artifact_created',
          title: typeof payload?.title === 'string' ? payload.title : undefined,
        },
      };
    case 'task.risk_changed':
      return {
        summary: '最近调整了任务风险等级。',
        label: null,
        targetType: null,
        targetId: null,
        recentChange: {
          kind: 'risk_changed',
        },
      };
    case 'task.next_step_changed':
      return {
        summary: '最近更新了下一步。',
        label: null,
        targetType: null,
        targetId: null,
        recentChange: {
          kind: 'unknown',
        },
      };
    case 'task.transitioned':
      return {
        summary: `最近状态从 ${String(payload?.from ?? '未知')} 变更为 ${String(payload?.to ?? '未知')}。`,
        label: null,
        targetType: null,
        targetId: null,
        recentChange: {
          kind: 'unknown',
        },
      };
    default:
      return {
        summary: '最近有新的任务活动。',
        label: null,
        targetType: null,
        targetId: null,
        recentChange: {
          kind: 'unknown',
        },
      };
  }
}

export function buildHomeResumeLatestChange(params: {
  latestActivity: HomeActivityRecord | undefined;
  keySource: Pick<SourceContextRecord, 'id' | 'title'> | null;
}): {
  summary: string;
  action: HomeTaskResumePreviewRecord['latestChangeAction'];
  recentChange: WorkingContextRecentChange | null;
} {
  const { latestActivity, keySource } = params;

  if (latestActivity) {
    if (latestActivity.sourceType === 'decision') {
      return {
        summary: `最近决策动态：${latestActivity.title} · ${latestActivity.status}`,
        action: {
          label: '查看 Decision',
          targetType: 'decision',
          targetId: latestActivity.sourceId,
        },
        recentChange: {
          kind:
            latestActivity.status === 'approved'
              ? 'decision_approved'
              : latestActivity.status === 'deferred'
                ? 'decision_deferred'
                : latestActivity.status === 'cancelled'
                  ? 'decision_cancelled'
                  : 'unknown',
          title: latestActivity.title,
        },
      };
    }

    return {
      summary: `最近执行动态：${latestActivity.title} · ${latestActivity.status}`,
      action: {
        label: '查看 Run',
        targetType: 'run',
        targetId: latestActivity.sourceId,
      },
      recentChange: {
        kind:
          latestActivity.status === 'failed'
            ? 'run_failed'
            : latestActivity.status === 'completed'
              ? 'run_completed'
              : 'unknown',
        title: latestActivity.title,
      },
    };
  }

  if (keySource) {
    return {
      summary: `最近关键来源更新：${keySource.title}`,
      action: {
        label: '查看来源',
        targetType: 'source_context',
        targetId: keySource.id,
      },
      recentChange: {
        kind: 'source_context_changed',
        title: keySource.title,
      },
    };
  }

  return {
    summary: '最近没有新的关键变化。',
    action: {
      label: null,
      targetType: null,
      targetId: null,
    },
    recentChange: null,
  };
}

export function deriveNextSuggestedMove(params: {
  explicitNextStep?: string | null;
  taskTitle: string;
  waitingReason?: string | null;
  riskLevel: TaskRiskLevel;
  riskNote?: string | null;
  keySourceTitle?: string | null;
  latestArtifactTitle?: string | null;
  recentChange?: WorkingContextRecentChange | null;
}): string {
  const explicitNextStep = params.explicitNextStep?.trim();

  if (explicitNextStep) {
    return explicitNextStep;
  }

  const { recentChange } = params;

  if (recentChange) {
    switch (recentChange.kind) {
      case 'run_failed':
        return '检查最近一次执行失败原因，并决定是否重试。';
      case 'run_completed':
        return recentChange.title
          ? `审阅最近一次 ${recentChange.title} run 的结果，并决定是否继续推进。`
          : '审阅最新执行结果，并决定是否继续推进。';
      case 'decision_approved':
        return `已获批准，继续推进：${recentChange.title ?? params.taskTitle}`;
      case 'decision_deferred':
        return '跟进该决策是否可以恢复拍板，或准备替代推进路径。';
      case 'decision_cancelled':
        return `重新评估该决策并确定替代推进路径：${recentChange.title ?? params.taskTitle}`;
      case 'source_context_changed':
        return `基于来源材料继续推进：${recentChange.title ?? '最新来源材料'}`;
      case 'artifact_created':
        return `基于产物继续推进：${recentChange.title ?? '最新产物'}`;
      case 'waiting_item_changed':
        return `先跟进等待项：${recentChange.waitingReason ?? params.waitingReason ?? params.taskTitle}`;
      case 'waiting_item_resolved':
        return `确认解除等待后的下一步推进：${recentChange.nextState ?? 'planned'}`;
      case 'risk_changed':
        return params.riskLevel === 'high'
          ? `先处理当前风险：${params.riskNote ?? params.taskTitle}`
          : '确认风险变化后是否需要调整下一步。';
      default:
        break;
    }
  }

  if (params.waitingReason) {
    return `先跟进等待项：${params.waitingReason}`;
  }

  if (params.riskLevel === 'high') {
    return `先处理当前风险：${params.riskNote ?? params.taskTitle}`;
  }

  if (params.keySourceTitle) {
    return `基于来源材料继续推进：${params.keySourceTitle}`;
  }

  if (params.latestArtifactTitle) {
    return `先基于最新产物继续推进：${params.latestArtifactTitle}`;
  }

  return '先补一个明确的下一步。';
}

export type { WorkingContextRecentChange };
