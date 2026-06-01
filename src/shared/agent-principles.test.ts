import { describe, expect, it } from 'vitest';

import {
  TASKPLANE_AGENT_PRINCIPLES,
  TASKPLANE_AGENT_PRINCIPLES_ID,
  TASKPLANE_AGENT_PRINCIPLES_TITLE,
} from './agent-principles.js';

describe('Taskplane Agent product principles', () => {
  it('defines phase-loaded operating rules for Agent work', () => {
    expect(TASKPLANE_AGENT_PRINCIPLES_ID).toBe('taskplane.agent-operating-principles.v1');
    expect(TASKPLANE_AGENT_PRINCIPLES_TITLE).toBe('Taskplane Agent Operating Principles');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Layer: skill / phase-based execution rules');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Load: concrete execution, runtime runs, subagents, tool use, state mutation, completion claims');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Write policy: read-only for Agents and ordinary task execution');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Always-loaded router: docs/specs/goalpilot-task-advancement-framework.md');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Phase-based reference: docs/specs/task-memory-spec.md');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Phase-based reference: docs/specs/agent-output-contract.md');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('GoalPilot decides when this document should load.');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Business Line state and BusinessLineContextPack');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Business Records, Reviews, accepted SOPs');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Task.md and Task Records only when the active Next Action or legacy task recovery needs them');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## First Principles And Simplicity');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('identify the real object being managed');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Runtime Entrypoint Gate Protocol');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('classify the entrypoint by the durable object or execution boundary it can affect');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Required Read Order');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Information Routing Protocol');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('route it to the smallest durable surface');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Task Creation Protocol');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Execution Protocol');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Source Materials Protocol');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Verification Protocol');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('## Subagent Protocol');
    expect(TASKPLANE_AGENT_PRINCIPLES).toContain('Do not replace user decisions with Agent guesses.');
  });
});
