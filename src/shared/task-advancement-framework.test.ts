import { describe, expect, it } from 'vitest';

import {
  TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK,
  TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK_ID,
  TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK_TITLE,
} from './task-advancement-framework.js';
import { TASKPLANE_CORE_AGENT_CONTEXT } from './core-agent-context.js';

describe('GoalPilot business advancement framework', () => {
  it('defines a product-level peer framework for business-line rhythm', () => {
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK_ID).toBe('taskplane.task-advancement-framework.v1');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK_TITLE).toBe('GoalPilot Business Advancement Framework');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Layer: operating-principle / always-loaded business-line advancement router');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Authority: required routing reference; detailed phase rules are loaded on demand');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Business Line is the durable product object');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Task is the execution unit');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Legacy task recovery remains supported');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('## Rule Hierarchy');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('GoalPilot is the only always-loaded total rule');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('do not treat it as a second total rule');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Priority Attention Routing is a phase-loaded ranking skill');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('## Control Sequence');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('business line, global inbox, Next Action / task');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('create the business line');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('re-rank the whole pool unless');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('## Context Readiness');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Self-research before asking');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('## Situation Map');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Today suggestion');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Scheduler loop, automation, or sensor signal');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('## On-Demand References');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Agent Operating Principles: load for concrete execution');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Context Transition Policy');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Pilot Decision Contract');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Priority Attention Routing');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('## Context Transition Decision');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Native Agent Capability Mapping');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('Decision Layer Writeback Orchestration');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('persistent goal capability');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('runtime-native goal loop');
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK).toContain('If something must always happen, implement it there instead of relying on model memory.');
  });

  it('is the always-loaded shared core Agent context', () => {
    expect(TASKPLANE_CORE_AGENT_CONTEXT).not.toContain('Taskplane Agent Operating Principles');
    expect(TASKPLANE_CORE_AGENT_CONTEXT).toContain('GoalPilot Business Advancement Framework');
    expect(TASKPLANE_CORE_AGENT_CONTEXT).toContain('What is the smallest movement');
    expect(TASKPLANE_CORE_AGENT_CONTEXT).toContain('detailed phase rules are loaded on demand');
  });

  it('stays compact enough for always-loaded context', () => {
    expect(TASKPLANE_TASK_ADVANCEMENT_FRAMEWORK.split('\n').length).toBeLessThanOrEqual(200);
  });
});
