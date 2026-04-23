import type { PriorityLane } from '../types/brief.js';
import type { TaskState } from '../types/task.js';

type TransitionRecommendationInput = {
  currentState: TaskState;
  availableStates: TaskState[];
  lane?: PriorityLane;
  hasActiveBlocker?: boolean;
  hasPendingDecision?: boolean;
  hasWaitingContext?: boolean;
};

const DEFAULT_PRIORITY: TaskState[] = ['planned', 'running', 'waiting_external', 'completed', 'archived'];

function firstAvailable(availableStates: TaskState[], preferredStates: TaskState[]): TaskState | null {
  return preferredStates.find((state) => availableStates.includes(state)) ?? null;
}

export function getRecommendedTaskTransition(input: TransitionRecommendationInput): TaskState | null {
  const {
    availableStates,
    currentState,
    lane,
    hasActiveBlocker = false,
    hasPendingDecision = false,
    hasWaitingContext = false,
  } = input;

  switch (lane) {
    case 'escalate_now':
      return firstAvailable(availableStates, ['running', 'planned', 'waiting_external', 'completed', 'archived']);
    case 'unblock_or_decide':
      if (hasPendingDecision) {
        return firstAvailable(availableStates, ['planned', 'running', 'waiting_external', 'completed', 'archived']);
      }

      if (hasActiveBlocker && currentState !== 'waiting_external') {
        return firstAvailable(availableStates, ['waiting_external', 'planned', 'running', 'completed', 'archived']);
      }

      return firstAvailable(availableStates, ['planned', 'running', 'waiting_external', 'completed', 'archived']);
    case 'continue_or_review':
      return firstAvailable(availableStates, ['running', 'planned', 'completed', 'waiting_external', 'archived']);
    case 'clarify':
      if (hasWaitingContext && currentState !== 'waiting_external') {
        return firstAvailable(availableStates, ['waiting_external', 'planned', 'running', 'completed', 'archived']);
      }

      return firstAvailable(availableStates, DEFAULT_PRIORITY);
    default:
      return firstAvailable(availableStates, DEFAULT_PRIORITY);
  }
}

export function orderTaskTransitions(input: TransitionRecommendationInput): TaskState[] {
  const recommendedState = getRecommendedTaskTransition(input);

  if (!recommendedState) {
    return input.availableStates;
  }

  return [
    recommendedState,
    ...input.availableStates.filter((state) => state !== recommendedState),
  ];
}

export function getTaskTransitionGuidance(input: TransitionRecommendationInput): string | null {
  const recommendedState = getRecommendedTaskTransition(input);

  if (!recommendedState) {
    return null;
  }

  switch (input.lane) {
    case 'escalate_now':
      return `当前按「立即升级」语义，状态流转优先建议转到 ${recommendedState}，先把任务拉回可处理状态并明确升级动作，不建议继续挂起等待。`;
    case 'unblock_or_decide':
      return input.hasPendingDecision
        ? `当前按「先解阻塞/拍板」语义，状态流转优先建议转到 ${recommendedState}，先把任务拉回可拍板状态。`
        : `当前按「先解阻塞/拍板」语义，状态流转优先建议转到 ${recommendedState}，先把任务放到最利于解除阻塞的状态。`;
    case 'continue_or_review':
      return `当前按「继续推进/复核」语义，状态流转优先建议转到 ${recommendedState}，让任务回到便于继续执行或复核结果的状态。`;
    case 'clarify':
      return `当前按「先补清晰度」语义，状态流转优先建议转到 ${recommendedState}，先补清下一步、等待条件或缺失上下文。`;
    default:
      return `当前保持「稳态推进」，状态流转优先建议转到 ${recommendedState}。`;
  }
}
