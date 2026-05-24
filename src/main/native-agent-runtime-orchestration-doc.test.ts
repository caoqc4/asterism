import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Native Agent Runtime Orchestration spec', () => {
  it('keeps the implementation state aligned with current native CLI writeback support', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'docs/specs/native-agent-runtime-orchestration.md'),
      'utf8',
    );

    expect(content).toContain('pre-run web research bridge');
    expect(content).toContain('context.readiness.evaluate');
    expect(content).toContain('Pilot coordination is modeled as a product role');
    expect(content).toContain('`product_control_layer` or');
    expect(content).toContain('`persistent_ai_pilot_reserved` is a future');
    expect(content).toContain('future `wanman_matrix` executor');
    expect(content).toContain('completed chat summary');
    expect(content).toContain('including child-task advancement messages');
    expect(content).toContain('task records, source contexts,');
    expect(content).toContain('decisions, next-step updates, blockers, completion proposals, and subtask');
    expect(content).toContain('for task, source, decision, subtask, and task-file writes');
    expect(content).toContain('still need to invoke that adapter outside the right panel');
    expect(content).toContain('subtask.propose` is normalized into a `subtask.create_many` apply plan');
    expect(content).not.toContain('completion proposals are not fully wired into the same pipeline');
  });
});
