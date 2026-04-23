import type { HomeBriefData, PriorityLane } from '../types/brief.js';
import type { DecisionRecord } from '../types/decision.js';
import type { TaskListItemRecord } from '../types/task.js';

const PRIORITY_LANE_LABELS: Record<PriorityLane, string> = {
  escalate_now: '立即升级',
  unblock_or_decide: '先解阻塞/拍板',
  continue_or_review: '继续推进/复核',
  clarify: '先补清晰度',
  steady: '稳态推进',
};

const PRIORITY_LANE_ORDER: Record<PriorityLane, number> = {
  escalate_now: 0,
  unblock_or_decide: 1,
  continue_or_review: 2,
  clarify: 3,
  steady: 4,
};

export function getPriorityLaneLabel(lane: PriorityLane | undefined): string | null {
  if (!lane) {
    return null;
  }

  return PRIORITY_LANE_LABELS[lane];
}

export function comparePriorityLanes(left: PriorityLane | undefined, right: PriorityLane | undefined): number {
  return PRIORITY_LANE_ORDER[left ?? 'steady'] - PRIORITY_LANE_ORDER[right ?? 'steady'];
}

export function deriveTaskPriorityLaneMap(params: {
  tasks: TaskListItemRecord[];
  briefData: HomeBriefData | null;
  decisions: DecisionRecord[];
}): Map<string, PriorityLane> {
  const laneByTaskId = new Map<string, PriorityLane>();

  for (const task of params.tasks) {
    laneByTaskId.set(task.id, 'steady');
  }

  const assignLane = (taskId: string, lane: PriorityLane) => {
    const currentLane = laneByTaskId.get(taskId);

    if (!currentLane || comparePriorityLanes(lane, currentLane) < 0) {
      laneByTaskId.set(taskId, lane);
    }
  };

  for (const task of params.briefData?.missingNextStepTasks ?? []) {
    assignLane(task.id, 'clarify');
  }

  for (const task of params.briefData?.waitingTasks ?? []) {
    assignLane(task.id, 'clarify');
  }

  for (const artifact of params.briefData?.recentArtifacts ?? []) {
    assignLane(artifact.taskId, 'continue_or_review');
  }

  for (const source of params.briefData?.recentSourceContexts ?? []) {
    assignLane(source.taskId, 'continue_or_review');
  }

  for (const activity of params.briefData?.recentActivity ?? []) {
    assignLane(activity.taskId, activity.lane ?? 'steady');
  }

  for (const task of params.briefData?.blockerTasks ?? []) {
    assignLane(task.id, 'unblock_or_decide');
  }

  for (const decision of params.decisions) {
    if (decision.status === 'pending') {
      assignLane(decision.taskId, 'unblock_or_decide');
    }
  }

  for (const task of params.briefData?.highRiskTasks ?? []) {
    assignLane(task.id, 'escalate_now');
  }

  for (const task of params.briefData?.escalationTasks ?? []) {
    assignLane(task.id, 'escalate_now');
  }

  return laneByTaskId;
}
