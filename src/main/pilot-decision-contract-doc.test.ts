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
