import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Pilot Decision Contract spec', () => {
  it('defines Pilot as a coordination role with pluggable decision backends', () => {
    const spec = fs.readFileSync(path.join(process.cwd(), 'docs/specs/pilot-decision-contract.md'), 'utf8');

    expect(spec).toContain('Document id: `taskplane.pilot-decision-contract.v1`');
    expect(spec).toContain('not a currently separate always-running agent');
    expect(spec).toContain('not a mandatory two-agent or two-process architecture');
    expect(spec).toContain('not a second always-loaded total rule');
    expect(spec).toContain('| `product_control_layer` |');
    expect(spec).toContain('| `bounded_decision_backend` |');
    expect(spec).toContain('| `persistent_ai_pilot_reserved` |');
    expect(spec).toContain('not returned by the current evaluator');
    expect(spec).toContain('Do not implement or imply a persistent AI Pilot');
    expect(spec).toContain('## Phase 2 Bounded Decision');
    expect(spec).toContain('Each decision carries a `backendPlan`');
    expect(spec).toContain('`maxTurns=1`');
    expect(spec).toContain('`outputContract=pilot_decision_summary`');
    expect(spec).toContain('Pilot 决策辅助计划');
    expect(spec).toContain('Pilot composes GoalPilot movement with');
    expect(spec).toContain('A Pilot decision can be produced by');
    expect(spec).toContain('Codex CLI decision run');
    expect(spec).toContain('Claude CLI decision run');
    expect(spec).toContain('| `follow_up` |');
    expect(spec).toContain('| `steer` |');
    expect(spec).toContain('| `escalate` |');
    expect(spec).toContain('wanman_matrix');
    expect(spec).toContain('Do not turn GoalPilot into an agent matrix runtime.');
    expect(spec).toContain('Taskplane gates and write services remain');
  });
});
