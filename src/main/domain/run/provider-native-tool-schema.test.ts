import { describe, expect, it } from 'vitest';

import type { AgentPolicy } from '../../../shared/types/agent-execution.js';
import type { AgentToolDefinition } from './agent-tool-registry.js';
import { buildProviderNativeToolSchemas } from './provider-native-tool-schema.js';

const definitions: AgentToolDefinition[] = [
  {
    name: 'task.inspect_context',
    description: 'Inspect context.',
    risk: 'safe_read',
    requiresConfirmation: false,
  },
  {
    name: 'task.inspect_timeline',
    description: 'Inspect timeline.',
    risk: 'safe_read',
    requiresConfirmation: false,
  },
  {
    name: 'task.review_completion_evidence',
    description: 'Review completion evidence.',
    risk: 'safe_read',
    requiresConfirmation: false,
  },
  {
    name: 'decision.draft',
    description: 'Draft a decision.',
    risk: 'safe_read',
    requiresConfirmation: false,
  },
  {
    name: 'workspace.search',
    description: 'Search workspace.',
    risk: 'safe_read',
    requiresConfirmation: false,
  },
  {
    name: 'workspace.read_file',
    description: 'Read workspace file.',
    risk: 'safe_read',
    requiresConfirmation: false,
  },
  {
    name: 'task.update_next_step',
    description: 'Update task.',
    risk: 'local_write',
    requiresConfirmation: false,
  },
  {
    name: 'workspace.run_command',
    description: 'Run command.',
    risk: 'local_command',
    requiresConfirmation: true,
  },
  {
    name: 'workspace.write_patch',
    description: 'Write patch.',
    risk: 'local_write',
    requiresConfirmation: true,
  },
];

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

describe('buildProviderNativeToolSchemas', () => {
  it('exposes only safe read tools that are currently allowed by policy', () => {
    expect(buildProviderNativeToolSchemas({
      definitions,
      policy: buildPolicy(),
    })).toEqual([
      {
        name: 'taskplane__task__inspect_context',
        taskplaneToolName: 'task.inspect_context',
        description: 'Inspect context.',
        risk: 'safe_read',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: 'taskplane__task__inspect_timeline',
        taskplaneToolName: 'task.inspect_timeline',
        description: 'Inspect timeline.',
        risk: 'safe_read',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    ]);
  });

  it('adds workspace read schemas only when workspace reads are opted in', () => {
    const schemas = buildProviderNativeToolSchemas({
      definitions,
      policy: buildPolicy({ allowLocalWorkspaceRead: true }),
    });

    expect(schemas.map((schema) => schema.taskplaneToolName)).toEqual([
      'task.inspect_context',
      'task.inspect_timeline',
      'workspace.search',
      'workspace.read_file',
    ]);
    expect(schemas.map((schema) => schema.name)).toEqual([
      'taskplane__task__inspect_context',
      'taskplane__task__inspect_timeline',
      'taskplane__workspace__search',
      'taskplane__workspace__read_file',
    ]);
    expect(schemas.find((schema) => schema.taskplaneToolName === 'workspace.search')?.inputSchema)
      .toMatchObject({
        required: ['query'],
        additionalProperties: false,
      });
  });

  it('adds task evidence and decision schemas only when task tools are opted in', () => {
    const schemas = buildProviderNativeToolSchemas({
      definitions,
      policy: buildPolicy({ allowTaskMutationTools: true }),
    });

    expect(schemas.map((schema) => schema.taskplaneToolName)).toEqual([
      'task.inspect_context',
      'task.inspect_timeline',
      'task.review_completion_evidence',
      'decision.draft',
    ]);
    expect(schemas.find((schema) => schema.taskplaneToolName === 'decision.draft')?.inputSchema)
      .toMatchObject({
        properties: {
          note: {
            type: 'string',
          },
        },
        additionalProperties: false,
      });
  });

  it('can combine task-tool and workspace-read opt-ins without exposing mutations', () => {
    const schemas = buildProviderNativeToolSchemas({
      definitions,
      policy: buildPolicy({
        allowLocalWorkspaceRead: true,
        allowTaskMutationTools: true,
      }),
    });

    expect(schemas.map((schema) => schema.taskplaneToolName)).toEqual([
      'task.inspect_context',
      'task.inspect_timeline',
      'task.review_completion_evidence',
      'decision.draft',
      'workspace.search',
      'workspace.read_file',
    ]);
  });

  it('never exposes local write or command tools even when policy allows them', () => {
    const schemas = buildProviderNativeToolSchemas({
      definitions,
      policy: buildPolicy({
        allowLocalCommandRun: true,
        allowLocalFileWrite: true,
        allowTaskMutationTools: true,
      }),
    });

    expect(schemas.map((schema) => schema.taskplaneToolName)).not.toContain('task.update_next_step');
    expect(schemas.map((schema) => schema.taskplaneToolName)).not.toContain('workspace.run_command');
    expect(schemas.map((schema) => schema.taskplaneToolName)).not.toContain('workspace.write_patch');
  });
});
