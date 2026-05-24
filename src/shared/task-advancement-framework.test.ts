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
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Layer: operating-principle / always-loaded task router');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Authority: required routing reference; detailed phase rules are loaded on demand');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('fuzzy intent to shaped, executable, verified, and recoverable task state');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('## Runtime Layers');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('| Skills / Flows |');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('| Hooks / Gates |');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('## Goal And Pilot Loop');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('## Situation Map');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('## On-Demand References');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Agent Operating Principles: load for concrete execution');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Decision Layer Writeback Orchestration');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('If something must always happen, implement it as a hook/gate.');
  });

  it('is the always-loaded shared core Agent context', () => {
    expect(TASKPLANE_CORE_AGENT_CONTEXT).not.toContain('Taskplane Agent Operating Principles');
    expect(TASKPLANE_CORE_AGENT_CONTEXT).toContain('GoalPilot Task Advancement Framework');
    expect(TASKPLANE_CORE_AGENT_CONTEXT).toContain('What is the smallest movement');
    expect(TASKPLANE_CORE_AGENT_CONTEXT).toContain('detailed phase rules are loaded on demand');
  });
});
