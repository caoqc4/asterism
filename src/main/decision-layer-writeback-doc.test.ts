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

  it('separates decision skills from deterministic hooks and product writes', () => {
    const spec = fs.readFileSync(
      path.join(process.cwd(), 'docs/specs/decision-layer-writeback-orchestration.md'),
      'utf8',
    );

    expect(spec).toContain('| `context.readiness.evaluate` |');
    expect(spec).toContain('| `write_intent.extract` |');
    expect(spec).toContain('| Runtime entrypoint gate |');
    expect(spec).toContain('| Context readiness gate |');
    expect(spec).toContain('Each skill returns structured output plus evidence. It must not directly call a');
    expect(spec).toContain('src/shared/product-feature-impact-audit.ts');
    expect(spec).toContain('Do not redesign every feature at once.');
  });
});
