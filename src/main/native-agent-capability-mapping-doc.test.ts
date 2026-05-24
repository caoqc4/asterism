import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Native Agent Capability Mapping spec', () => {
  it('maps native agent modes into Taskplane-owned product states', () => {
    const spec = fs.readFileSync(
      path.join(process.cwd(), 'docs/specs/native-agent-capability-mapping.md'),
      'utf8',
    );

    expect(spec).toContain('Document id: `taskplane.native-agent-capability-mapping.v1`');
    expect(spec).toContain('| Plan / read-only explore | Context readiness');
    expect(spec).toContain('| Persistent goal loop | Long-running executor');
    expect(spec).toContain('| AGENTS.md / CLAUDE.md / memory files |');
    expect(spec).toContain('| Hooks / permissions | Deterministic constraints');
    expect(spec).toContain('| Subagents / task tools | Isolated research');
    expect(spec).toContain('| Compact / clear / resume | Context hygiene');
    expect(spec).toContain('## Vendor Reference Paths');
    expect(spec).toContain('Codex-style path:');
    expect(spec).toContain('Claude Code-style path:');
    expect(spec).toContain('Plan Mode or read-only exploration');
    expect(spec).toContain('permissions and hooks constrain tools and side effects');
    expect(spec).toContain('If the answer can be discovered, research or inspect instead of asking.');
    expect(spec).toContain('Taskplane state and write gates still win');
    expect(spec).toContain('https://docs.anthropic.com/en/docs/claude-code/common-workflows');
    expect(spec).toContain('https://docs.anthropic.com/en/docs/claude-code/hooks');
  });
});
