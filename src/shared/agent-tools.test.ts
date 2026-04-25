import { describe, expect, it } from 'vitest';

import { AGENT_TOOL_NAMES, isAgentToolName } from './agent-tools.js';

describe('agent tool helpers', () => {
  it('keeps the runtime tool-name guard aligned with known agent tools', () => {
    expect(AGENT_TOOL_NAMES).toContain('task.inspect_context');
    expect(AGENT_TOOL_NAMES).toContain('workspace.write_patch');
    expect(isAgentToolName('task.inspect_context')).toBe(true);
    expect(isAgentToolName('unknown.execute')).toBe(false);
    expect(isAgentToolName(null)).toBe(false);
  });
});
