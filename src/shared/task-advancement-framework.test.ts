import { describe, expect, it } from 'vitest';

import {
  TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK,
  TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK_ID,
  TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK_TITLE,
} from './task-advancement-framework.js';
import { TASKPLANE_CORE_AGENT_CONTEXT } from './core-agent-context.js';

describe('GoalPilot task advancement framework', () => {
  it('defines a product-level peer framework for task rhythm', () => {
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK_ID).toBe('taskplane.task-advancement-framework.v1');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK_TITLE).toBe('GoalPilot Task Advancement Framework');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Priority: Peer to Taskplane Agent Operating Principles');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('unclear intent to decomposed, executable, verified, and recoverable task state');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('## GoalPilot Loop');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('## Task Situation Map');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('## Advancement Moves');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('## Situation To Default Move');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('| Project needing decomposition | Decompose |');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('## Decomposition Guidance');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('## Subtask Advancement Guidance');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Use the framework silently as a reasoning aid.');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('lightweight routing reference');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('official CLI-native tools are separate capability layers');
  });

  it('is injected into the shared core Agent context with operating principles', () => {
    expect(TASKPLANE_CORE_AGENT_CONTEXT).toContain('Taskplane Agent Operating Principles');
    expect(TASKPLANE_CORE_AGENT_CONTEXT).toContain('GoalPilot Task Advancement Framework');
    expect(TASKPLANE_CORE_AGENT_CONTEXT).toContain('What is the smallest useful next movement?');
  });
});
