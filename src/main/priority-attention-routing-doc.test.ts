import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Priority Attention Routing spec', () => {
  it('keeps Today, Brief, and Pilot on the same business-line attention semantics', () => {
    const spec = fs.readFileSync(path.join(process.cwd(), 'docs/specs/priority-attention-routing.md'), 'utf8');

    expect(spec).toContain('Document id: `taskplane.priority-attention-routing.v1`');
    expect(spec).toContain('not a total rule');
    expect(spec).toContain('shared "why now" language for Today, Brief,');
    expect(spec).toContain('The primary ranking object is the Business Line');
    expect(spec).toContain('Next Action. A task can appear in this route only as a Next Action carrier');
    expect(spec).toContain('progress');
    expect(spec).toContain('record_gap');
    expect(spec).toContain('improvement');
    expect(spec).toContain('Legacy task queues may feed compatibility candidates');
    expect(spec).toContain('| `escalate_now` |');
    expect(spec).toContain('| `unblock_or_decide` |');
    expect(spec).toContain('| `continue_or_review` |');
    expect(spec).toContain('| `clarify` |');
    expect(spec).toContain('| `steady` |');
    expect(spec).toContain('Today, Brief, and Pilot must use the same attention semantics');
    expect(spec).toContain('type PriorityRoute');
    expect(spec).toContain('focusBusinessLineId');
    expect(spec).toContain('executableTaskId');
    expect(spec).toContain('whyNow');
  });
});
