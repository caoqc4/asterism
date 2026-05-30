import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Decision Layer Writeback Orchestration spec', () => {
  it('documents CLI-only closure through Write Intent and Taskplane gates', () => {
    const spec = fs.readFileSync(
      path.join(process.cwd(), 'docs/specs/decision-layer-writeback-orchestration.md'),
      'utf8',
    );

    expect(spec).toContain('Document id: `taskplane.decision-layer-writeback-orchestration.v1`');
    expect(spec).toContain('## Closed Loop With CLI Only');
    expect(spec).toContain('native CLI executes and returns evidence');
    expect(spec).toContain('WriteIntentExtractor reads structured intent or derives candidates');
    expect(spec).toContain('Hook/Gate validates scope, phase, schema, risk, and confirmation need');
    expect(spec).toContain('No backend may bypass Taskplane write gates.');
  });

  it('defines business-line-first writeback targets without weakening gates', () => {
    const spec = fs.readFileSync(
      path.join(process.cwd(), 'docs/specs/decision-layer-writeback-orchestration.md'),
      'utf8',
    );

    expect(spec).toMatch(/durable business-line\s+state/);
    expect(spec).toContain('tasks acting as Next Action execution carriers');
    expect(spec).toContain('`business_record.create`');
    expect(spec).toContain('`business_review.record`');
    expect(spec).toContain('`next_action.create` or `next_action.update`');
    expect(spec).toContain('`source_context.create`');
    expect(spec).toContain('`artifact.propose` and `task_file.propose`');
    expect(spec).toContain('`decision.create` or `decision.action`');
    expect(spec).toContain('`sop_revision.propose`');
    expect(spec).toContain('`handoff_record.propose`');
    expect(spec).toContain('Business-line Write Intent must carry or resolve a business-line owner');
    expect(spec).toContain('service validation');
    expect(spec).toContain('Cross-business reuse is not inferred');
    expect(spec).toContain('Risky learning, SOP activation, external/public writes, money-affecting writes');
    expect(spec).toContain('Runtime output may propose these writes, but only');
    expect(spec).toContain('Taskplane services apply them.');
  });

  it('separates decision skills from deterministic hooks and product writes', () => {
    const spec = fs.readFileSync(
      path.join(process.cwd(), 'docs/specs/decision-layer-writeback-orchestration.md'),
      'utf8',
    );

    expect(spec).toContain('| `context.readiness.evaluate` |');
    expect(spec).toContain('| `pilot.route` |');
    expect(spec).toContain('which operation mode applies');
    expect(spec).toContain('| `priority.route` |');
    expect(spec).toContain('| `write_intent.extract` |');
    expect(spec).toContain('| Runtime entrypoint gate |');
    expect(spec).toContain('| Context readiness gate |');
    expect(spec).toContain('Each skill returns structured output plus evidence. It must not directly call a');
    expect(spec).toContain('src/shared/product-feature-impact-audit.ts');
    expect(spec).toContain('Do not redesign every feature at once.');
  });
});
