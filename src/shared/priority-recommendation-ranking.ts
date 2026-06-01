import type { PriorityLane } from './types/brief.js';
import { isStaleBlocker } from './working-context/blocker.js';

export type PriorityRecommendationPriority = 'high' | 'medium' | 'low';
export type PrioritySuggestionType = 'progress' | 'record_gap' | 'improvement';

export type PriorityRecommendationCandidate = {
  id: string;
  businessLineId?: string | null;
  nextActionTaskId?: string | null;
  suggestionType?: PrioritySuggestionType | null;
  taskId: string | null;
  lane: PriorityLane;
  priority: PriorityRecommendationPriority;
  order: number;
  whyNow?: string | null;
};

export type PriorityRecommendationTaskSignal = {
  id: string;
  activeDependency?: {
    blockedByTaskId: string;
  } | null;
  activeBlocker?: {
    createdAt: string;
  } | null;
  completionProgress?: {
    total: number;
    open: number;
  } | null;
};

export type PriorityRecommendationRanking = {
  actionabilityRank: number;
  score: number;
};

export type PriorityAttentionProjection<T extends PriorityRecommendationCandidate> = {
  items: T[];
  totalCount: number;
  displayedCount: number;
  truncated: boolean;
  displayLimit: number | null;
};

export type PriorityRouteMovement = 'ask' | 'research' | 'shape' | 'execute' | 'verify' | 'persist' | 'pause';

export type PriorityRoute = {
  executableTaskId: string | null;
  focusBusinessLineId: string | null;
  focusTaskId: string | null;
  lane: PriorityLane;
  reason: string;
  recommendedMovement: PriorityRouteMovement;
  escalationRequired: boolean;
  suggestionType: PrioritySuggestionType | null;
  whyNow: string;
};

export const PRIORITY_RECOMMENDATION_LANE_ORDER: Record<PriorityLane, number> = {
  escalate_now: 0,
  unblock_or_decide: 1,
  continue_or_review: 2,
  clarify: 3,
  steady: 4,
};

export function priorityRecommendationDependsOnTask(
  taskId: string | null,
  upstreamTaskId: string | null,
  taskById: Map<string, PriorityRecommendationTaskSignal>,
): boolean {
  if (!taskId || !upstreamTaskId || taskId === upstreamTaskId) {
    return false;
  }

  const visited = new Set<string>();
  let current = taskById.get(taskId);

  while (current?.activeDependency?.blockedByTaskId) {
    const nextId = current.activeDependency.blockedByTaskId;

    if (nextId === upstreamTaskId) {
      return true;
    }

    if (visited.has(nextId)) {
      return false;
    }

    visited.add(nextId);
    current = taskById.get(nextId);
  }

  return false;
}

export function rankPriorityRecommendation(
  action: PriorityRecommendationCandidate,
  taskById: Map<string, PriorityRecommendationTaskSignal>,
): PriorityRecommendationRanking {
  const task = action.taskId ? taskById.get(action.taskId) : null;
  let actionabilityRank = 9;
  let score = 0;

  if (action.id.startsWith('decision:')) {
    actionabilityRank = 0;
    score += 100;
  } else if (action.id.startsWith('risk:')) {
    actionabilityRank = 1;
    score += 95;
  } else if (action.id.startsWith('blocker:')) {
    const staleBlocker = task?.activeBlocker ? isStaleBlocker(task.activeBlocker.createdAt) : false;
    actionabilityRank = staleBlocker ? 1 : 2;
    score += staleBlocker ? 92 : 84;
  } else if (action.id.startsWith('task-dependency:')) {
    actionabilityRank = action.lane === 'continue_or_review' ? 3 : action.lane === 'escalate_now' ? 1 : 2;
    score += action.lane === 'escalate_now' ? 90 : action.lane === 'continue_or_review' ? 78 : 86;
  } else if (action.id.startsWith('source-context:blocker:')) {
    actionabilityRank = 2;
    score += 82;
  } else if (action.suggestionType === 'record_gap' || action.id.startsWith('business-line-record-gap:')) {
    actionabilityRank = 3;
    score += 76;
  } else if (action.suggestionType === 'improvement' || action.id.startsWith('business-line-improvement:')) {
    actionabilityRank = 4;
    score += 73;
  } else if (action.id.startsWith('completion-ready:')) {
    actionabilityRank = 4;
    score += 74;
  } else if (action.id.startsWith('near-completion:')) {
    actionabilityRank = 5;
    score += 70;
  } else if (action.id.startsWith('artifact:')) {
    actionabilityRank = 5;
    score += 68;
  } else if (action.id.startsWith('source-context:next-step:')) {
    actionabilityRank = 6;
    score += 60;
  } else if (action.suggestionType === 'progress' || action.id.startsWith('business-line-progress:')) {
    actionabilityRank = 6;
    score += 64;
  } else if (action.id.startsWith('next-step:')) {
    actionabilityRank = 6;
    score += 62;
  } else if (action.id.startsWith('waiting:')) {
    actionabilityRank = 7;
    score += 58;
  } else if (action.id.startsWith('source-context:')) {
    actionabilityRank = 5;
    score += 69;
  } else if (action.id === 'steady-state') {
    actionabilityRank = 10;
  }

  if (action.priority === 'high') {
    score += 12;
  } else if (action.priority === 'medium') {
    score += 6;
  }

  score += Math.max(0, 4 - PRIORITY_RECOMMENDATION_LANE_ORDER[action.lane]);

  if (task?.activeDependency?.blockedByTaskId) {
    score += action.id.startsWith('task-dependency:') ? 8 : -8;
  }

  if (task?.completionProgress) {
    if (task.completionProgress.total > 0 && task.completionProgress.open === 0) {
      score += 6;
    } else if (task.completionProgress.open === 1) {
      score += 4;
    }
  }

  return { actionabilityRank, score };
}

export function comparePriorityRecommendations(
  left: PriorityRecommendationCandidate,
  right: PriorityRecommendationCandidate,
  taskById: Map<string, PriorityRecommendationTaskSignal>,
): number {
  if (
    left.taskId &&
    right.taskId &&
    priorityRecommendationDependsOnTask(right.taskId, left.taskId, taskById)
  ) {
    return -1;
  }

  if (
    left.taskId &&
    right.taskId &&
    priorityRecommendationDependsOnTask(left.taskId, right.taskId, taskById)
  ) {
    return 1;
  }

  const leftRanking = rankPriorityRecommendation(left, taskById);
  const rightRanking = rankPriorityRecommendation(right, taskById);
  const actionabilityDiff = leftRanking.actionabilityRank - rightRanking.actionabilityRank;

  if (actionabilityDiff !== 0) {
    return actionabilityDiff;
  }

  const scoreDiff = rightRanking.score - leftRanking.score;

  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const laneDiff = PRIORITY_RECOMMENDATION_LANE_ORDER[left.lane] - PRIORITY_RECOMMENDATION_LANE_ORDER[right.lane];

  if (laneDiff !== 0) {
    return laneDiff;
  }

  return left.order - right.order;
}

export function sortPriorityRecommendations<T extends PriorityRecommendationCandidate>(
  candidates: T[],
  taskById: Map<string, PriorityRecommendationTaskSignal>,
): T[] {
  return [...candidates].sort((left, right) => comparePriorityRecommendations(left, right, taskById));
}

export function projectPriorityAttention<T extends PriorityRecommendationCandidate>(params: {
  candidates: T[];
  taskById: Map<string, PriorityRecommendationTaskSignal>;
  displayLimit?: number | null;
}): PriorityAttentionProjection<T> {
  const sorted = sortPriorityRecommendations(params.candidates, params.taskById);
  const displayLimit = params.displayLimit ?? null;
  const items = typeof displayLimit === 'number' ? sorted.slice(0, displayLimit) : sorted;

  return {
    items,
    totalCount: sorted.length,
    displayedCount: items.length,
    truncated: typeof displayLimit === 'number' && sorted.length > displayLimit,
    displayLimit,
  };
}

export function routePriorityAttention<T extends PriorityRecommendationCandidate & { reason?: string | null }>(params: {
  candidates: T[];
  taskById: Map<string, PriorityRecommendationTaskSignal>;
}): PriorityRoute {
  const [focus] = projectPriorityAttention({
    candidates: params.candidates,
    displayLimit: 1,
    taskById: params.taskById,
  }).items;

  if (!focus) {
    return {
      executableTaskId: null,
      escalationRequired: false,
      focusBusinessLineId: null,
      focusTaskId: null,
      lane: 'steady',
      reason: 'No competing business-line attention signals are present.',
      recommendedMovement: 'pause',
      suggestionType: null,
      whyNow: 'No competing business-line attention signals are present.',
    };
  }

  const whyNow = priorityRouteWhyNow(focus);
  return {
    executableTaskId: focus.nextActionTaskId ?? focus.taskId,
    escalationRequired: focus.lane === 'escalate_now',
    focusBusinessLineId: focus.businessLineId ?? null,
    focusTaskId: focus.taskId,
    lane: focus.lane,
    reason: whyNow,
    recommendedMovement: priorityRouteMovement(focus),
    suggestionType: focus.suggestionType ?? null,
    whyNow,
  };
}

function priorityRouteWhyNow(candidate: PriorityRecommendationCandidate & { reason?: string | null }): string {
  const whyNow = candidate.whyNow?.trim();
  if (whyNow) {
    return whyNow;
  }

  const candidateReason = candidate.reason?.trim();
  if (candidateReason) {
    return candidateReason;
  }

  return `Shared business-line attention selected ${candidate.id} in lane ${candidate.lane}.`;
}

function priorityRouteMovement(candidate: PriorityRecommendationCandidate): PriorityRouteMovement {
  if (candidate.lane === 'escalate_now' || candidate.id.startsWith('risk:')) {
    return 'pause';
  }

  if (candidate.suggestionType === 'record_gap') {
    return 'shape';
  }

  if (candidate.suggestionType === 'improvement') {
    return 'persist';
  }

  if (candidate.suggestionType === 'progress') {
    return candidate.nextActionTaskId || candidate.taskId ? 'execute' : 'verify';
  }

  if (
    candidate.lane === 'clarify'
    || candidate.id.startsWith('waiting:')
    || candidate.id.startsWith('next-step:')
  ) {
    return candidate.lane === 'clarify' ? 'shape' : 'execute';
  }

  if (
    candidate.id.startsWith('decision:')
    || candidate.id.startsWith('blocker:')
    || candidate.id.startsWith('task-dependency:')
    || candidate.id.startsWith('source-context:blocker:')
  ) {
    return 'ask';
  }

  if (
    candidate.id.startsWith('artifact:')
    || candidate.id.startsWith('completion-ready:')
    || candidate.id.startsWith('near-completion:')
    || candidate.id.startsWith('source-context:')
  ) {
    return 'verify';
  }

  return candidate.lane === 'steady' ? 'execute' : 'verify';
}
