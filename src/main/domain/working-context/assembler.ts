import type { HomeActivityRecord, HomeTaskResumePreviewRecord } from '../../../shared/types/brief.js';
import type { BlockerRecord } from '../../../shared/types/blocker.js';
import type { AppliedProcessTemplateRecord } from '../../../shared/types/process-template.js';
import type { SourceContextRecord } from '../../../shared/types/source-context.js';
import type { TaskDetailBase, TaskResumeCardRecord, TaskRiskLevel, TaskState, TimelineEventRecord } from '../../../shared/types/task.js';
import { formatBlockerAgeLabel, getBlockerAgeReason, isStaleBlocker } from '../../../shared/working-context/blocker.js';
import {
  formatDependencyAgeLabel,
  getDependencyAgeReason,
  isStaleDependency,
} from '../../../shared/working-context/dependency.js';
import { getLatestResumeRelevantTimelineEvent } from '../../../shared/working-context/timeline.js';

type TimelineLite = Array<Pick<TimelineEventRecord, 'type' | 'payload'>>;
type CompletionStatusLite = {
  total: number;
  satisfied: number;
  open: number;
};

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

function isEarlyTaskState(state: TaskState | undefined | null): boolean {
  return state === 'captured' || state === 'triaged';
}

function isCloseoutCompletionProgress(
  progress: CompletionStatusLite | null | undefined,
): boolean {
  if (!progress || progress.total <= 0) {
    return false;
  }

  return progress.open === 0 || (progress.satisfied > 0 && progress.open === 1);
}

function isCloseoutEvidenceChange(
  progress: CompletionStatusLite | null | undefined,
  recentChange: WorkingContextRecentChange | null | undefined,
): boolean {
  if (!isCloseoutCompletionProgress(progress) || !recentChange) {
    return false;
  }

  return (
    recentChange.kind === 'run_completed'
    || recentChange.kind === 'decision_approved'
    || recentChange.kind === 'artifact_created'
  );
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
    if (currentMethod.summary?.trim()) {
      return audience === 'task'
        ? `当前任务已挂载该方法：${currentMethod.summary.trim()}`
        : `当前方法：${currentMethod.summary.trim()}`;
    }

    return audience === 'task' ? '当前任务已挂载该方法模板。' : '当前已挂载该方法模板。';
  }

  const payload = safeJsonParse(selectedEvent.payload);
  const reason = typeof payload?.reason === 'string' ? payload.reason.trim() : '';

  if (!reason) {
    if (currentMethod.summary?.trim()) {
      return audience === 'task'
        ? `当前任务已挂载该方法：${currentMethod.summary.trim()}`
        : `当前方法：${currentMethod.summary.trim()}`;
    }

    return audience === 'task' ? '当前任务已挂载该方法模板。' : '当前已挂载该方法模板。';
  }

  if (payload?.sourceType === 'decision_draft') {
    return audience === 'task'
      ? `当前任务最近采用该方法来草拟决策：${reason}`
      : `当前方法最近用于决策草拟：${reason}`;
  }

  return audience === 'task'
    ? `当前任务最近采用该方法：${reason}`
    : `当前方法最近用于执行：${reason}`;
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
        ? `当前在材料架中被标记为关键来源：${normalizedNote}`
        : `材料架中的关键来源：${normalizedNote}`;
    }

    if (sourceEvent?.type === 'source_context.created') {
      return audience === 'task'
        ? '当前在材料架中被标记为关键来源，并且最近加入，建议优先参考。'
        : '材料架中的关键来源最近加入。';
    }

    if (sourceEvent?.type === 'source_context.updated') {
      return audience === 'task'
        ? '当前在材料架中被标记为关键来源，并且最近更新，建议优先参考。'
        : '材料架中的关键来源最近更新。';
    }

    return audience === 'task'
      ? '当前在材料架中被标记为关键来源，建议优先参考。'
      : '材料架中的关键来源。';
  }

  if (sourceEvent?.type === 'source_context.updated') {
    return audience === 'task'
      ? '当前材料架里该来源最近更新，建议先查看。'
      : '材料架最近更新了该来源。';
  }

  if (sourceEvent?.type === 'source_context.created') {
    return audience === 'task'
      ? '当前材料架里该来源最近加入，建议先查看。'
      : '材料架最近加入了该来源。';
  }

  return normalizedNote
    ? (audience === 'task'
      ? `当前材料架里最相关的来源材料：${normalizedNote}`
      : `材料说明：${normalizedNote}`)
    : (audience === 'task' ? '当前材料架里最相关的来源材料。' : '当前最相关的来源材料。');
}

export function getCurrentBlockerPriorityReason(params: {
  blocker: Pick<BlockerRecord, 'kind' | 'detail' | 'owner' | 'sourceContextId' | 'createdAt'>;
  audience: 'task' | 'home';
}): string {
  const { blocker, audience } = params;
  const ageReason = getBlockerAgeReason(blocker.createdAt, audience);

  if (blocker.detail?.trim()) {
    const base = audience === 'task'
      ? `当前主阻塞项：${blocker.detail.trim()}`
      : `当前阻塞原因：${blocker.detail.trim()}`;
    return ageReason ? `${base} ${ageReason}` : base;
  }

  if (blocker.owner?.trim()) {
    const base = audience === 'task'
      ? `当前主阻塞项卡在 ${blocker.owner.trim()}。`
      : `当前阻塞对象：${blocker.owner.trim()}`;
    return ageReason ? `${base} ${ageReason}` : base;
  }

  let base: string;
  switch (blocker.kind) {
    case 'approval':
      base = audience === 'task' ? '当前主阻塞项是审批环节。' : '当前阻塞来自审批环节。';
      break;
    case 'document_or_material':
      base = audience === 'task'
        ? blocker.sourceContextId
          ? '当前主阻塞项与材料缺口有关，可先查看关联来源。'
          : '当前主阻塞项与资料或材料缺口有关。'
        : blocker.sourceContextId
          ? '当前阻塞与来源材料有关。'
          : '当前阻塞与资料或材料有关。';
      break;
    case 'external_person':
      base = audience === 'task' ? '当前主阻塞项卡在外部人员反馈。' : '当前阻塞来自外部人员反馈。';
      break;
    case 'external_team':
      base = audience === 'task' ? '当前主阻塞项卡在外部团队协作。' : '当前阻塞来自外部团队协作。';
      break;
    case 'system_or_tool':
      base = audience === 'task' ? '当前主阻塞项来自系统或工具限制。' : '当前阻塞来自系统或工具限制。';
      break;
    default:
      base = audience === 'task' ? '当前主阻塞项仍待解除。' : '当前仍存在主阻塞项。';
      break;
  }

  return ageReason ? `${base} ${ageReason}` : base;
}

export function getCurrentBlockerAgeLabel(
  blocker: Pick<BlockerRecord, 'createdAt'> | null,
): string | null {
  if (!blocker) {
    return null;
  }

  return formatBlockerAgeLabel(blocker.createdAt);
}

export function getCurrentDependencyAgeLabel(
  dependency: { createdAt: string } | null,
): string | null {
  if (!dependency) {
    return null;
  }

  return formatDependencyAgeLabel(dependency.createdAt);
}

export function getCurrentDependencyPriorityReason(
  dependency: { createdAt: string } | null,
  audience: 'task' | 'home',
): string | null {
  if (!dependency) {
    return null;
  }

  return getDependencyAgeReason(dependency.createdAt, audience);
}

export function buildTaskResumeLatestChange(
  timeline: TimelineLite,
  taskState?: TaskState,
  dependencyReevaluation?: {
    upstreamTaskTitle: string;
    status: 'upstream_ready' | 'upstream_unblocked';
  } | null,
  activeDependency?: {
    blockedByTaskTitle: string | null;
    createdAt: string;
  } | null,
  completionStatus?: CompletionStatusLite | null,
): TaskResumeCardRecord['latestChange'] & {
  recentChange: WorkingContextRecentChange | null;
} {
  if (dependencyReevaluation) {
    return {
      summary:
        dependencyReevaluation.status === 'upstream_ready'
          ? `上游任务已完成：${dependencyReevaluation.upstreamTaskTitle}，可重新判断当前依赖。`
          : `上游任务刚解除关键阻塞：${dependencyReevaluation.upstreamTaskTitle}，可重新判断当前依赖。`,
      action: {
        label: null,
        targetType: null,
        targetId: null,
      },
      recentChange: {
        kind: 'task_dependency_resolved',
        title: dependencyReevaluation.upstreamTaskTitle,
      },
    };
  }

  const latestEvent = getLatestResumeRelevantTimelineEvent(timeline);

  if (
    activeDependency?.blockedByTaskTitle &&
    isStaleDependency(activeDependency.createdAt) &&
    (!latestEvent ||
      latestEvent.type === 'task_dependency.created' ||
      latestEvent.type === 'task_dependency.updated')
  ) {
    return {
      summary: `这条依赖链已持续较久：${activeDependency.blockedByTaskTitle}，值得优先升级处理。`,
      action: {
        label: null,
        targetType: null,
        targetId: null,
      },
      recentChange: {
        kind: 'task_dependency_changed',
        title: activeDependency.blockedByTaskTitle,
      },
    };
  }

  if (!latestEvent) {
    return {
      summary: isEarlyTaskState(taskState)
        ? '这条任务刚进入系统，先补清摘要与下一步。'
        : '最近没有新的生命周期变化。',
      action: {
        label: null,
        targetType: null,
        targetId: null,
      },
      recentChange: null,
    };
  }

  const payload = latestEvent.payload ? safeJsonParse(latestEvent.payload) : null;

  switch (latestEvent.type) {
    case 'task.run_failed':
      return {
        summary: `最近一次执行失败：${String(payload?.failureReason ?? '未记录失败原因')}。`,
        action: {
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
        summary: isCloseoutCompletionProgress(completionStatus)
          ? `最近一次执行已完成，任务恢复到 ${String(payload?.nextState ?? 'planned')}，这可能说明某些完成标准已具备。`
          : `最近一次执行已完成，任务恢复到 ${String(payload?.nextState ?? 'planned')}。`,
        action: {
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
        summary: isCloseoutCompletionProgress(completionStatus)
          ? `最近一条决策已获批准：${String(payload?.decisionTitle ?? '未命名决策')}，这可能说明某些完成标准已具备。`
          : `最近一条决策已获批准：${String(payload?.decisionTitle ?? '未命名决策')}。`,
        action: {
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
        action: {
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
        action: {
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
    case 'waiting_item.updated':
      return {
        summary: `最近更新了等待项：${String(payload?.reason ?? '未填写')}。`,
        action: {
          label: null,
          targetType: null,
          targetId: null,
        },
        recentChange: {
          kind: 'waiting_item_changed',
          waitingReason: typeof payload?.reason === 'string' ? payload.reason : undefined,
        },
      };
    case 'waiting_item.resolved':
      return {
        summary: `最近解除等待项，任务恢复到 ${String(payload?.nextState ?? 'planned')}。`,
        action: {
          label: null,
          targetType: null,
          targetId: null,
        },
        recentChange: {
          kind: 'waiting_item_resolved',
          nextState: typeof payload?.nextState === 'string' ? payload.nextState : undefined,
        },
      };
    case 'source_context.created':
    case 'source_context.updated':
      return {
        summary: `最近更新了来源材料：${String(payload?.title ?? '未命名来源')}。`,
        action: {
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
        action: {
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
        action: {
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
        action: {
          label: null,
          targetType: null,
          targetId: null,
        },
        recentChange: {
          kind: 'task_dependency_changed',
          title:
            typeof payload?.blockedByTaskTitle === 'string' ? payload.blockedByTaskTitle : undefined,
        },
      };
    case 'task_dependency.resolved':
      return {
        summary: `最近解除任务依赖：${String(payload?.blockedByTaskTitle ?? '未命名上游任务')}。`,
        action: {
          label: null,
          targetType: null,
          targetId: null,
        },
        recentChange: {
          kind: 'task_dependency_resolved',
          title:
            typeof payload?.blockedByTaskTitle === 'string' ? payload.blockedByTaskTitle : undefined,
        },
      };
    case 'artifact.created':
      return {
        summary: isCloseoutCompletionProgress(completionStatus)
          ? `最近生成了产物：${String(payload?.title ?? '未命名产物')}，值得先对照完成标准。`
          : `最近生成了产物：${String(payload?.title ?? '未命名产物')}。`,
        action: {
          label:
            payload?.sourceType === 'run' && typeof payload?.sourceId === 'string' ? '查看 Run' : null,
          targetType:
            payload?.sourceType === 'run' && typeof payload?.sourceId === 'string' ? 'run' : null,
          targetId:
            payload?.sourceType === 'run' && typeof payload?.sourceId === 'string'
              ? payload.sourceId
              : null,
        },
        recentChange: {
          kind: 'artifact_created',
          title: typeof payload?.title === 'string' ? payload.title : undefined,
        },
      };
    case 'task.risk_changed':
      return {
        summary: '最近调整了任务风险等级。',
        action: {
          label: null,
          targetType: null,
          targetId: null,
        },
        recentChange: {
          kind: 'risk_changed',
        },
      };
    case 'task.next_step_changed':
      return {
        summary: '最近更新了下一步。',
        action: {
          label: null,
          targetType: null,
          targetId: null,
        },
        recentChange: {
          kind: 'unknown',
        },
      };
    case 'task.transitioned':
      if (payload?.to === 'captured' || payload?.to === 'triaged') {
        return {
          summary:
            payload.to === 'captured'
              ? '最近刚捕获这条任务，先补清摘要与下一步。'
              : '最近刚整理这条任务，先补清摘要与下一步。',
          action: {
            label: null,
            targetType: null,
            targetId: null,
          },
          recentChange: {
            kind: 'unknown',
          },
        };
      }

      return {
        summary: `最近状态从 ${String(payload?.from ?? '未知')} 变更为 ${String(payload?.to ?? '未知')}。`,
        action: {
          label: null,
          targetType: null,
          targetId: null,
        },
        recentChange: {
          kind: 'unknown',
        },
      };
    default:
      return {
        summary: '最近有新的任务活动。',
        action: {
          label: null,
          targetType: null,
          targetId: null,
        },
        recentChange: {
          kind: 'unknown',
        },
      };
  }
}

export function buildHomeResumeLatestChange(params: {
  latestActivity: HomeActivityRecord | undefined;
  keySource: Pick<SourceContextRecord, 'id' | 'title'> | null;
  activeBlocker?: Pick<BlockerRecord, 'id' | 'title' | 'sourceContextId'> | null;
  activeDependency?: { blockedByTaskTitle: string | null } | null;
  taskState?: TaskState;
  completionStatus?: CompletionStatusLite | null;
}): {
  summary: string;
  action: HomeTaskResumePreviewRecord['latestChange']['action'];
  recentChange: WorkingContextRecentChange | null;
} {
  const { latestActivity, keySource, activeBlocker, activeDependency, taskState, completionStatus } = params;

  if (latestActivity) {
    if (latestActivity.sourceType === 'task') {
      return {
        summary:
          latestActivity.status === 'captured'
            ? '最近刚捕获这条任务，先补清摘要与下一步。'
            : '最近刚整理这条任务，先补清摘要与下一步。',
        action: {
          label: null,
          targetType: null,
          targetId: null,
        },
        recentChange: {
          kind: 'unknown',
        },
      };
    }

    if (latestActivity.sourceType === 'decision') {
      return {
        summary:
          latestActivity.status === 'approved' && isCloseoutCompletionProgress(completionStatus)
            ? `最近决策动态：${latestActivity.title} · ${latestActivity.status}，这可能说明某些完成标准已具备`
            : `最近决策动态：${latestActivity.title} · ${latestActivity.status}`,
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

    if (latestActivity.sourceType === 'dependency') {
      return {
        summary:
          latestActivity.status === 'upstream_ready'
            ? `上游任务已完成：${latestActivity.title}，可重新判断当前依赖。`
            : `上游任务刚解除关键阻塞：${latestActivity.title}，可重新判断当前依赖。`,
        action: {
          label: null,
          targetType: null,
          targetId: null,
        },
        recentChange: {
          kind: 'task_dependency_resolved',
          title: latestActivity.title,
        },
      };
    }

    return {
      summary:
        latestActivity.status === 'completed' && isCloseoutCompletionProgress(completionStatus)
          ? `最近执行动态：${latestActivity.title} · ${latestActivity.status}，这可能说明某些完成标准已具备`
          : `最近执行动态：${latestActivity.title} · ${latestActivity.status}`,
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

  if (activeBlocker) {
    return {
      summary: `当前阻塞项：${activeBlocker.title}`,
      action: {
        label: activeBlocker.sourceContextId ? '查看来源' : null,
        targetType: activeBlocker.sourceContextId ? 'source_context' : null,
        targetId: activeBlocker.sourceContextId ?? null,
      },
      recentChange: {
        kind: 'blocker_changed',
        title: activeBlocker.title,
      },
    };
  }

  if (activeDependency?.blockedByTaskTitle) {
    return {
      summary: `当前依赖上游任务：${activeDependency.blockedByTaskTitle}`,
      action: {
        label: null,
        targetType: null,
        targetId: null,
      },
      recentChange: {
        kind: 'task_dependency_changed',
        title: activeDependency.blockedByTaskTitle,
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
    summary: isEarlyTaskState(taskState)
      ? '这条任务刚进入系统，先补清摘要与下一步。'
      : '最近没有新的关键变化。',
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
  taskState?: TaskState;
  taskSummary?: string | null;
  waitingReason?: string | null;
  riskLevel: TaskRiskLevel;
  riskNote?: string | null;
  blockerTitle?: string | null;
  blockerCreatedAt?: string | null;
  dependencyTitle?: string | null;
  dependencyCreatedAt?: string | null;
  keySourceTitle?: string | null;
  latestArtifactTitle?: string | null;
  completionStatus?: CompletionStatusLite | null;
  recentChange?: WorkingContextRecentChange | null;
}): string {
  const explicitNextStep = params.explicitNextStep?.trim();

  if (explicitNextStep) {
    return explicitNextStep;
  }

  if (isEarlyTaskState(params.taskState)) {
    return params.taskSummary?.trim()
      ? '先补清下一步，并判断这条任务是否需要正式拍板或继续执行。'
      : '先补一句任务摘要，再明确下一步。';
  }

  const { recentChange } = params;

  if (isCloseoutEvidenceChange(params.completionStatus, recentChange)) {
    switch (recentChange?.kind) {
      case 'run_completed':
        return '先对照 Completion Criteria，判断最近执行结果是否已满足完成标准。';
      case 'decision_approved':
        return '先对照 Completion Criteria，判断这次批准是否已满足完成标准。';
      case 'artifact_created':
        return '先对照 Completion Criteria，判断这份最新产物是否已满足完成标准。';
      default:
        break;
    }
  }

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
        return params.blockerTitle
          ? `基于来源更新重新判断是否解除阻塞：${params.blockerTitle}`
          : `基于来源材料继续推进：${recentChange.title ?? '最新来源材料'}`;
      case 'blocker_changed':
        return params.blockerCreatedAt && isStaleBlocker(params.blockerCreatedAt)
          ? `优先升级当前阻塞项：${recentChange.title ?? params.blockerTitle ?? params.taskTitle}`
          : `先解除阻塞项：${recentChange.title ?? params.blockerTitle ?? params.taskTitle}`;
      case 'blocker_resolved':
        return `确认解除阻塞后的下一步推进：${recentChange.title ?? params.taskTitle}`;
      case 'task_dependency_changed':
        return params.dependencyCreatedAt && isStaleDependency(params.dependencyCreatedAt)
          ? `优先升级依赖链路：${recentChange.title ?? params.dependencyTitle ?? params.taskTitle}`
          : `先推动上游任务完成：${recentChange.title ?? params.dependencyTitle ?? params.taskTitle}`;
      case 'task_dependency_resolved':
        return `确认上游任务就绪后的下一步推进：${recentChange.title ?? params.dependencyTitle ?? params.taskTitle}`;
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

  if (params.blockerTitle) {
    return params.blockerCreatedAt && isStaleBlocker(params.blockerCreatedAt)
      ? `优先升级当前阻塞项：${params.blockerTitle}`
      : `先解除阻塞项：${params.blockerTitle}`;
  }

  if (params.dependencyTitle) {
    return params.dependencyCreatedAt && isStaleDependency(params.dependencyCreatedAt)
      ? `优先升级依赖链路：${params.dependencyTitle}`
      : `先推动上游任务完成：${params.dependencyTitle}`;
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
