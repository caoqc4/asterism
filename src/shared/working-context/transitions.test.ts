import { describe, expect, it } from 'vitest';

import {
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
});
