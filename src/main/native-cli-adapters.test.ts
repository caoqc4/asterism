import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('native CLI adapter instruction files', () => {
  it('keeps AGENTS.md as a thin Codex adapter to canonical Taskplane specs', () => {
    const content = fs.readFileSync(path.join(process.cwd(), 'AGENTS.md'), 'utf8');

    expect(content).toContain('thin native Codex CLI adapter');
    expect(content).toContain('docs/specs/goalpilot-task-advancement-framework.md');
    expect(content).toContain('docs/specs/agent-operating-principles.md');
    expect(content).toContain('docs/specs/agent-output-contract.md');
    expect(content).toContain('docs/specs/task-memory-spec.md');
    expect(content).toContain('docs/specs/pilot-coordinator.md');
    expect(content).toContain('docs/specs/priority-attention-routing.md');
    expect(content).toContain('docs/specs/native-agent-capability-mapping.md');
    expect(content).toContain('docs/specs/decision-layer-writeback-orchestration.md');
    expect(content).toContain('docs/specs/native-agent-runtime-orchestration.md');
    expect(content).toContain('Do not mutate Taskplane structured data directly');
  });

  it('keeps CLAUDE.md as a thin Claude Code adapter to canonical Taskplane specs', () => {
    const content = fs.readFileSync(path.join(process.cwd(), 'CLAUDE.md'), 'utf8');

    expect(content).toContain('thin native Claude Code adapter');
    expect(content).toContain('docs/specs/goalpilot-task-advancement-framework.md');
    expect(content).toContain('docs/specs/agent-operating-principles.md');
    expect(content).toContain('docs/specs/agent-output-contract.md');
    expect(content).toContain('docs/specs/task-memory-spec.md');
    expect(content).toContain('docs/specs/pilot-coordinator.md');
    expect(content).toContain('docs/specs/priority-attention-routing.md');
    expect(content).toContain('docs/specs/native-agent-capability-mapping.md');
    expect(content).toContain('docs/specs/decision-layer-writeback-orchestration.md');
    expect(content).toContain('docs/specs/native-agent-runtime-orchestration.md');
    expect(content).toContain('Do not mutate Taskplane structured data directly');
  });
});
