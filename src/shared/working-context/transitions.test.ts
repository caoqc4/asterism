import { describe, expect, it } from 'vitest';

import {
  getCompletionTransitionGuidance,
  getRecommendedTaskTransition,
  getTaskTransitionGuidance,
  orderTaskTransitions,
} from './transitions.js';

describe('task transition guidance', () => {
  it('prefers bringing escalation tasks back to an actionable state before waiting', () => {
    const availableStates = ['planned', 'waiting_external', 'completed', 'archived'] as const;

    expect(
      getRecommendedTaskTransition({
        currentState: 'running',
        availableStates: [...availableStates],
        lane: 'escalate_now',
      }),
    ).toBe('planned');

    expect(
      orderTaskTransitions({
        currentState: 'running',
        availableStates: [...availableStates],
        lane: 'escalate_now',
      }),
    ).toEqual(['planned', 'waiting_external', 'completed', 'archived']);

    expect(
      getTaskTransitionGuidance({
        currentState: 'running',
        availableStates: [...availableStates],
        lane: 'escalate_now',
      }),
    ).toContain('不建议继续挂起等待');
  });

  it('includes verification responsibility in completion transition guidance when criteria remain open', () => {
    expect(
      getCompletionTransitionGuidance({
        currentState: 'planned',
        availableStates: ['running', 'waiting_external', 'completed', 'archived'],
        completionTotal: 2,
        completionOpen: 1,
        openCriteriaTexts: ['Final review recorded'],
        nextOpenResponsibilitySummary: '确认责任：客户确认',
      }),
    ).toEqual({
      tone: 'open',
      summary:
        '当前还有 1 条完成标准未满足：Final review recorded。你仍可完成任务，但更建议先补齐这些收尾标准。 确认责任：客户确认。',
      buttonLabel: '转到 completed（仍有 1 条未满足）',
    });
  });
});
