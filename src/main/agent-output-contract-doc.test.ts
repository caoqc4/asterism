import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Agent Output Contract spec', () => {
  it('maps GoalPilot advancement moves to user-visible output shapes', () => {
    const spec = fs.readFileSync(
      path.join(process.cwd(), 'docs/specs/agent-output-contract.md'),
      'utf8',
    );

    expect(spec).toContain('### Advancement Move Output Contracts');
    expect(spec).toContain('Use this section after the GoalPilot Task Advancement Framework chooses the');
    expect(spec).toContain('| Clarify | Chat message |');
    expect(spec).toContain('| Decompose | Decomposition draft |');
    expect(spec).toContain('| Execute | Run or progress card plus final chat summary |');
    expect(spec).toContain('| Verify | Verification result |');
    expect(spec).toContain('| Pause | Chat message or Decision card |');
  });
});
