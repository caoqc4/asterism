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
    expect(content).toContain('completed chat summary');
    expect(content).toContain('task records, source contexts,');
    expect(content).toContain('decisions, next-step updates, blockers, completion proposals, and subtask');
    expect(content).toContain('for task, source, decision, and task-file writes');
    expect(content).toContain('still need to invoke that adapter outside the right panel');
    expect(content).not.toContain('completion proposals are not fully wired into the same pipeline');
  });
});
