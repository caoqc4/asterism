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
    expect(spec).toContain('## Mature Product Lessons');
    expect(spec).toContain('## Claude Code Deep Reference');
    expect(spec).toContain('| `auto` mode | Autonomy requires background classification and fallback.');
    expect(spec).toContain('business-line loop lanes');
    expect(spec).toContain('scheduled/event task carriers pass Standing Approval gates');
    expect(spec).toContain('Skills may survive compaction only within a budget');
    expect(spec).toContain('## Codex Deep Reference');
    expect(spec).toContain('## Agent Matrix Reference');
    expect(spec).toContain('Wanman-style matrix runtimes are useful reference executors');
    expect(spec).toContain('Taskplane Pilot coordinates across business lines');
    expect(spec).toContain('Do not replace Taskplane\'s business-line control layer');
    expect(spec).toContain('remains a future opt-in capability');
    expect(spec).toContain('`context.readiness.evaluate` should return one of');
    expect(spec).toContain('| `plan_first` | Work is broad, risky, or code-changing.');
    expect(spec).toContain('If the answer can be discovered, research or inspect instead of asking.');
    expect(spec).toContain('adapter-level native capability declarations surfaced before execution');
    expect(spec).toContain('minimum pre-run contract');
    expect(spec).toContain('business-line loop scheduling');
    expect(spec).toContain('Decision-gated mutation for scheduled/event carriers');
    expect(spec).toContain('provider-owned');
    expect(spec).toContain('package.json');
    expect(spec).toContain('.codex/config.*');
    expect(spec).toContain('explicit web/search tool declarations');
    expect(spec).toContain('placeholder-only files');
    expect(spec).toContain('Taskplane state and write gates still win');
    expect(spec).toContain('https://docs.anthropic.com/en/docs/claude-code/common-workflows');
    expect(spec).toContain('https://docs.anthropic.com/en/docs/claude-code/hooks');
  });
});
