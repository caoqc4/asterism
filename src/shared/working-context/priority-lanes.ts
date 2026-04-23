import type { HomeActivityRecord, HomeSourceContextRecord, HomeTaskSliceRecord, PriorityLane } from '../types/brief.js';
import type { DecisionRecord } from '../types/decision.js';
import type { TaskDetail } from '../types/task.js';
import type { TaskListItemRecord } from '../types/task.js';
import { isStaleBlocker } from './blocker.js';
import { isStaleDependency } from './dependency.js';

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

export function isCloseoutCompletionProgress(
  progress:
    | {
        total: number;
        satisfied: number;
        open: number;
      }
    | undefined
    | null,
): boolean {
  if (!progress || progress.total <= 0) {
    return false;
  }

  return progress.open === 0 || (progress.satisfied > 0 && progress.open === 1);
}

export function getPriorityLaneContextLabel(params: {
  lane: PriorityLane | undefined;
  completionProgress?:
    | {
        total: number;
        satisfied: number;
        open: number;
      }
    | null;
}): string | null {
  const baseLabel = getPriorityLaneLabel(params.lane);

  if (!baseLabel) {
    return null;
  }

  if (params.lane === 'continue_or_review' && isCloseoutCompletionProgress(params.completionProgress)) {
    return `${baseLabel} · 收尾判断`;
  }

  return baseLabel;
}

export function comparePriorityLanes(left: PriorityLane | undefined, right: PriorityLane | undefined): number {
  return PRIORITY_LANE_ORDER[left ?? 'steady'] - PRIORITY_LANE_ORDER[right ?? 'steady'];
}

export function deriveTaskPriorityLaneMap(params: {
  tasks: TaskListItemRecord[];
  missingNextStepTasks?: HomeTaskSliceRecord[];
  waitingTasks?: HomeTaskSliceRecord[];
  completionReadyTasks?: HomeTaskSliceRecord[];
  nearCompletionTasks?: HomeTaskSliceRecord[];
  recentArtifacts?: Array<{ taskId: string }>;
  recentSourceContexts?: HomeSourceContextRecord[];
  recentActivity?: HomeActivityRecord[];
  blockerTasks?: HomeTaskSliceRecord[];
  highRiskTasks?: HomeTaskSliceRecord[];
  escalationTasks?: HomeTaskSliceRecord[];
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

  for (const task of params.missingNextStepTasks ?? []) {
    assignLane(task.id, 'clarify');
  }

  for (const task of params.waitingTasks ?? []) {
    assignLane(task.id, 'clarify');
  }

  for (const artifact of params.recentArtifacts ?? []) {
    assignLane(artifact.taskId, 'continue_or_review');
  }

  for (const task of params.completionReadyTasks ?? []) {
    assignLane(task.id, 'continue_or_review');
  }

  for (const task of params.nearCompletionTasks ?? []) {
    assignLane(task.id, 'continue_or_review');
  }

  for (const source of params.recentSourceContexts ?? []) {
    assignLane(source.taskId, 'continue_or_review');
  }

  for (const activity of params.recentActivity ?? []) {
    assignLane(activity.taskId, activity.lane ?? 'steady');
  }

  for (const task of params.blockerTasks ?? []) {
    assignLane(task.id, 'unblock_or_decide');
  }

  for (const task of params.tasks) {
    if (task.activeDependency) {
      assignLane(
        task.id,
        isStaleDependency(task.activeDependency.createdAt) ? 'escalate_now' : 'unblock_or_decide',
      );
    }
  }

  for (const decision of params.decisions) {
    if (decision.status === 'pending') {
      assignLane(decision.taskId, 'unblock_or_decide');
    }
  }

  for (const task of params.highRiskTasks ?? []) {
    assignLane(task.id, 'escalate_now');
  }

  for (const task of params.escalationTasks ?? []) {
    assignLane(task.id, 'escalate_now');
  }

  return laneByTaskId;
}

export function deriveTaskDetailPriorityLane(task: TaskDetail): PriorityLane {
  if ((task.activeBlocker && isStaleBlocker(task.activeBlocker.createdAt)) || task.riskLevel === 'high') {
    return 'escalate_now';
  }

  if (task.activeBlocker) {
    return 'unblock_or_decide';
  }

  if (task.activeDependency) {
    return isStaleDependency(task.activeDependency.createdAt) ? 'escalate_now' : 'unblock_or_decide';
  }

  if (task.state === 'waiting_external' || task.activeWaitingItem || task.waitingReason || !task.nextStep?.trim()) {
    return 'clarify';
  }

  if (task.artifacts.length || task.sourceContexts.length || task.processTemplates.length) {
    return 'continue_or_review';
  }

  return 'steady';
}

export function getPriorityLanePromptGuidance(lane: PriorityLane): string {
  switch (lane) {
    case 'escalate_now':
      return '当前优先级语义：立即升级。组织输出时优先帮助用户升级处理高风险或长期阻塞事项。';
    case 'unblock_or_decide':
      return '当前优先级语义：先解阻塞/拍板。组织输出时优先帮助用户解除阻塞、补齐拍板输入。';
    case 'continue_or_review':
      return '当前优先级语义：继续推进/复核。组织输出时优先承接最近结果、来源或产物继续推进。';
    case 'clarify':
      return '当前优先级语义：先补清晰度。组织输出时优先补清下一步、等待条件或缺失上下文。';
    default:
      return '当前优先级语义：稳态推进。组织输出时优先围绕现有下一步平稳推进。';
  }
}
