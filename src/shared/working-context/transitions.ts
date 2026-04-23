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

export type CompletionTransitionGuidance = {
  tone: 'empty' | 'open' | 'ready';
  summary: string;
  buttonLabel: string;
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

export function getCompletionTransitionGuidance(input: {
  currentState: TaskState;
  availableStates: TaskState[];
  completionTotal: number;
  completionOpen: number;
  openCriteriaTexts: string[];
  nextOpenResponsibilitySummary?: string | null;
}): CompletionTransitionGuidance | null {
  const { currentState, availableStates, completionTotal, completionOpen, openCriteriaTexts, nextOpenResponsibilitySummary } =
    input;

  if (currentState === 'completed' || currentState === 'archived' || !availableStates.includes('completed')) {
    return null;
  }

  if (completionTotal === 0) {
    return {
      tone: 'empty',
      summary: '当前还没有定义完成标准。你仍可完成任务，但更建议先补 1 到 3 条收尾标准，再判断是否真的可以结束。',
      buttonLabel: '转到 completed（未定义完成标准）',
    };
  }

  if (completionOpen > 0) {
    const openSummary = openCriteriaTexts.slice(0, 2).join('；');
    const overflow = openCriteriaTexts.length > 2 ? '；…' : '';
    const responsibilitySuffix = nextOpenResponsibilitySummary
      ? ` ${nextOpenResponsibilitySummary}。`
      : '';

    return {
      tone: 'open',
      summary: `当前还有 ${completionOpen} 条完成标准未满足：${openSummary}${overflow}。你仍可完成任务，但更建议先补齐这些收尾标准。${responsibilitySuffix}`.trim(),
      buttonLabel: `转到 completed（仍有 ${completionOpen} 条未满足）`,
    };
  }

  return {
    tone: 'ready',
    summary: '当前完成标准已全部满足。现在转到 completed 会更有依据。',
    buttonLabel: '转到 completed（完成标准已满足）',
  };
}
