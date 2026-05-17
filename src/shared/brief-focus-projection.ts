import type {
  BriefFocusLane,
  BriefFocusStatus,
  HomeBriefData,
  HomeBriefFocusTask,
  HomeTaskSliceRecord,
  PriorityLane,
  RecommendedAction,
} from './types/brief.js';
import {
  briefAttentionLaneForCandidate,
  briefAttentionReasonForCandidate,
} from './brief-attention-boundary.js';

export type BriefFocusProjectionInput = {
  tasks: HomeTaskSliceRecord[];
  recommendedActions: RecommendedAction[];
  displayLimit?: number;
};

export function laneFromPriorityLane(lane: PriorityLane | undefined): BriefFocusLane {
  if (lane === 'escalate_now') return 'escalate';
  if (lane === 'unblock_or_decide') return 'unblock';
  if (lane === 'continue_or_review') return 'continue';
  if (lane === 'clarify') return 'clarify';
  return 'steady';
}

export function statusFromBriefTask(task: HomeTaskSliceRecord | undefined): BriefFocusStatus | undefined {
  if (!task) return undefined;
  if (task.state === 'running') return 'running';
  if (task.state === 'waiting_external') return 'waiting';
  if (task.activeBlocker || task.activeDependency) return 'blocked';
  if (task.state === 'captured') return 'clarify';
  if (task.state === 'planned' || task.state === 'triaged') return 'progressing';
  return undefined;
}

export function statusFromRecommendedAction(action: RecommendedAction): BriefFocusStatus | undefined {
  if (action.id.startsWith('blocker:') || action.id.startsWith('source-context:blocker:')) return 'blocked';
  if (action.id.startsWith('waiting:')) return 'waiting';
  if (action.id.startsWith('next-step:') || action.id.startsWith('source-context:next-step:')) return 'clarify';
  if (
    action.id.startsWith('task-dependency:')
    || action.id.startsWith('artifact:')
    || action.id.startsWith('source-context:')
    || action.id.startsWith('completion-ready:')
    || action.id.startsWith('near-completion:')
  ) {
    return 'progressing';
  }
  return undefined;
}

export function titleFromRecommendedAction(action: RecommendedAction): string {
  const [, title] = action.label.split('：');
  return title?.trim() || action.taskId || action.id;
}

export function actionLabelFromStatus(
  status: BriefFocusStatus | undefined,
  fallback: string,
): string {
  if (status === 'running') return '查看 Run';
  if (status === 'waiting') return '起草跟进';
  if (status === 'blocked') return '解除阻塞';
  return fallback;
}

export function projectBriefFocusTasks({
  tasks,
  recommendedActions,
  displayLimit = 5,
}: BriefFocusProjectionInput): HomeBriefFocusTask[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const titleById = new Map(tasks.map((task) => [task.id, task.title]));

  for (const action of recommendedActions) {
    if (action.taskId && !titleById.has(action.taskId)) {
      titleById.set(action.taskId, titleFromRecommendedAction(action));
    }
  }

  const seen = new Set<string>();
  const candidates = recommendedActions
    .filter((action) => {
      if (!action.taskId || seen.has(action.taskId)) return false;
      seen.add(action.taskId);
      return true;
    })
    .map((action, index) => {
      const taskId = action.taskId!;
      const task = taskById.get(taskId);
      const status = statusFromBriefTask(task) ?? statusFromRecommendedAction(action);
      const parentTaskId = task?.parentTaskId ?? null;
      const priorityCandidate = {
        id: action.id,
        taskId: action.taskId,
        lane: action.lane ?? 'steady',
        priority: action.priority,
        order: index,
      };
      return {
        id: taskId,
        title: task?.title ?? titleById.get(taskId) ?? titleFromRecommendedAction(action),
        lane: laneFromPriorityLane(action.lane),
        whyNow: action.reason,
        action: actionLabelFromStatus(status, action.label),
        sourceActionId: action.id,
        rank: index + 1,
        attentionLane: briefAttentionLaneForCandidate(priorityCandidate),
        attentionReason: briefAttentionReasonForCandidate(priorityCandidate),
        state: task?.state,
        status,
        parentTaskId,
        parentTitle: parentTaskId ? titleById.get(parentTaskId) ?? null : null,
      };
    });

  const visibleChildParentIds = new Set(
    candidates
      .map((task) => task.parentTaskId)
      .filter((parentTaskId): parentTaskId is string => Boolean(parentTaskId)),
  );

  return candidates
    .filter((task) => {
      const record = taskById.get(task.id);
      const isProjectParentWithVisibleChild =
        !task.parentTaskId &&
        (record?.childTaskIds ?? []).length > 0 &&
        visibleChildParentIds.has(task.id);

      if (!isProjectParentWithVisibleChild) {
        return true;
      }

      return task.lane === 'escalate' || task.lane === 'unblock';
    })
    .slice(0, displayLimit);
}

export function projectBriefFocusTasksFromHomeData(
  data: Pick<HomeBriefData, 'recentTasks' | 'recommendedActions'>,
): HomeBriefFocusTask[] {
  return projectBriefFocusTasks({
    tasks: data.recentTasks,
    recommendedActions: data.recommendedActions,
  });
}
