import { describe, expect, it } from 'vitest';

import type { AgentPolicy } from './types/agent-execution.js';
import { AGENT_TOOL_NAMES } from './agent-tools.js';
import {
  AGENT_TOOL_EXPOSURE_MATRIX,
  getExposedAgentToolNames,
  shouldExposeAgentTool,
} from './agent-tool-exposure.js';

function buildPolicy(overrides: Partial<AgentPolicy> = {}): AgentPolicy {
  return {
    maxSteps: 4,
    maxWallTimeMs: 120_000,
    allowNetwork: false,
    allowLocalWorkspaceRead: false,
    allowLocalFileWrite: false,
    confirmationRequiredRisks: ['local_command', 'local_write'],
    ...overrides,
  };
}

describe('agent tool exposure matrix', () => {
  it('requires every known runtime agent tool to declare exposure rules', () => {
    expect(AGENT_TOOL_EXPOSURE_MATRIX.map((descriptor) => descriptor.name).sort()).toEqual([...AGENT_TOOL_NAMES].sort());
  });

  it('exposes only core observe/write-note tools to normal text prompts by default', () => {
    expect(getExposedAgentToolNames({
      channel: 'text_prompt',
      policy: buildPolicy(),
    })).toEqual([
      'task.inspect_context',
      'task.inspect_timeline',
      'artifact.create_note',
    ]);
  });

  it('requires explicit opt-ins for workspace read and task mutation prompt tools', () => {
    expect(getExposedAgentToolNames({
      channel: 'text_prompt',
      policy: buildPolicy({
        allowLocalWorkspaceRead: true,
        allowTaskMutationTools: true,
      }),
    })).toEqual([
      'task.inspect_context',
      'task.inspect_timeline',
      'workspace.search',
      'workspace.read_file',
      'task.update_next_step',
      'task.create_completion_criterion',
      'task.review_completion_evidence',
      'source_context.create',
      'decision.draft',
      'artifact.create_note',
    ]);
  });

  it('keeps local command and patch tools unexposed even when runtime policy allows them', () => {
    for (const channel of ['text_prompt', 'provider_native'] as const) {
      expect(shouldExposeAgentTool({
        channel,
        name: 'workspace.run_command',
        policy: buildPolicy({
          allowLocalCommandRun: true,
          allowLocalFileWrite: true,
          allowLocalWorkspaceRead: true,
          allowTaskMutationTools: true,
        }),
      })).toBe(false);
      expect(shouldExposeAgentTool({
        channel,
        name: 'workspace.write_patch',
        policy: buildPolicy({
          allowLocalCommandRun: true,
          allowLocalFileWrite: true,
          allowLocalWorkspaceRead: true,
          allowTaskMutationTools: true,
        }),
      })).toBe(false);
    }
  });

  it('keeps provider-native exposure narrower than text prompts', () => {
    expect(getExposedAgentToolNames({
      channel: 'provider_native',
      policy: buildPolicy({
        allowLocalWorkspaceRead: true,
        allowTaskMutationTools: true,
      }),
    })).toEqual([
      'task.inspect_context',
      'task.inspect_timeline',
      'workspace.search',
      'workspace.read_file',
      'task.review_completion_evidence',
      'decision.draft',
    ]);
  });
});
