import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Priority Attention Routing spec', () => {
  it('keeps Brief and Pilot on the same multi-task priority semantics', () => {
    const spec = fs.readFileSync(path.join(process.cwd(), 'docs/specs/priority-attention-routing.md'), 'utf8');

    expect(spec).toContain('Document id: `taskplane.priority-attention-routing.v1`');
    expect(spec).toContain('| `escalate_now` |');
    expect(spec).toContain('| `unblock_or_decide` |');
    expect(spec).toContain('| `continue_or_review` |');
    expect(spec).toContain('| `clarify` |');
    expect(spec).toContain('| `steady` |');
    expect(spec).toContain('Brief and Pilot must use the same priority semantics');
    expect(spec).toContain('type PriorityRoute');
  });
});
