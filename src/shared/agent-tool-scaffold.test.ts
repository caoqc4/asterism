import { describe, expect, it } from 'vitest';

import {
  AGENT_TOOL_SCAFFOLD_DESCRIPTORS,
  getAgentToolScaffoldDescriptor,
  getAgentToolScaffoldDescriptorsByFamily,
  getReservedAgentToolScaffoldDescriptors,
  shouldExposeAgentToolScaffold,
} from './agent-tool-scaffold.js';
import { AGENT_TOOL_NAMES } from './agent-tools.js';
import type { AgentPolicy } from './types/agent-execution.js';

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

describe('agent tool scaffold descriptors', () => {
  it('represents the shared scaffold families needed for future execution lanes', () => {
    expect(new Set(AGENT_TOOL_SCAFFOLD_DESCRIPTORS.map((descriptor) => descriptor.family))).toEqual(new Set([
      'task_domain',
      'workspace_coding',
      'browser_playwright',
      'mcp',
      'skill',
      'computer_use',
      'creator_connector',
    ]));
  });

  it('keeps reserved scaffold descriptors hidden by default', () => {
    expect(getReservedAgentToolScaffoldDescriptors()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'workspace.staged_patch' }),
        expect.objectContaining({ id: 'browser.readonly_evidence' }),
        expect.objectContaining({ id: 'mcp.safe_read' }),
        expect.objectContaining({ id: 'skill.prompt_shape' }),
        expect.objectContaining({ id: 'computer.inspect_only' }),
        expect.objectContaining({ id: 'creator.publish_preview' }),
      ]),
    );

    expect(getReservedAgentToolScaffoldDescriptors().every((descriptor) => (
      descriptor.defaultExposure === 'hidden' && descriptor.runtimeToolName === undefined
    ))).toBe(true);
  });

  it('maps every current runtime agent tool into the scaffold', () => {
    expect(AGENT_TOOL_SCAFFOLD_DESCRIPTORS
      .map((descriptor) => ('runtimeToolName' in descriptor ? descriptor.runtimeToolName : undefined))
      .filter((name) => name !== undefined)
      .sort()).toEqual([...AGENT_TOOL_NAMES].sort());
  });

  it('marks high-risk future lanes with sessions, artifacts, checkpoints, or credential gates', () => {
    expect(getAgentToolScaffoldDescriptor('workspace.staged_patch')).toMatchObject({
      family: 'workspace_coding',
      sessionKind: 'sandbox',
      artifactKinds: ['patch', 'command_log'],
      checkpointKind: 'patch_promotion',
      credentialPolicy: 'none',
    });

    expect(getAgentToolScaffoldDescriptor('browser.readonly_evidence')).toMatchObject({
      family: 'browser_playwright',
      sessionKind: 'browser',
      artifactKinds: ['screenshot', 'browser_trace', 'browser_extract'],
      credentialPolicy: 'explicit_config',
    });

    expect(getAgentToolScaffoldDescriptor('creator.publish_preview')).toMatchObject({
      family: 'creator_connector',
      sessionKind: 'connector',
      checkpointKind: 'external_action',
      credentialPolicy: 'connector_decision',
    });
  });

  it('can list descriptors by family without exposing them', () => {
    expect(getAgentToolScaffoldDescriptorsByFamily('workspace_coding').map((descriptor) => descriptor.id)).toEqual([
      'workspace.search',
      'workspace.read_file',
      'workspace.run_command',
      'workspace.write_patch',
      'workspace.staged_patch',
    ]);
  });

  it('delegates implemented runtime exposure while keeping reserved scaffold descriptors hidden', () => {
    expect(shouldExposeAgentToolScaffold({
      id: 'task.inspect_context',
      channel: 'text_prompt',
      policy: buildPolicy(),
    })).toBe(true);

    expect(shouldExposeAgentToolScaffold({
      id: 'workspace.search',
      channel: 'text_prompt',
      policy: buildPolicy(),
    })).toBe(false);

    expect(shouldExposeAgentToolScaffold({
      id: 'workspace.search',
      channel: 'text_prompt',
      policy: buildPolicy({ allowLocalWorkspaceRead: true }),
    })).toBe(true);

    expect(shouldExposeAgentToolScaffold({
      id: 'workspace.write_patch',
      channel: 'text_prompt',
      policy: buildPolicy({ allowLocalFileWrite: true }),
    })).toBe(false);

    expect(shouldExposeAgentToolScaffold({
      id: 'browser.readonly_evidence',
      channel: 'provider_native',
      policy: buildPolicy({ allowLocalWorkspaceRead: true, allowTaskMutationTools: true }),
    })).toBe(false);
  });
});
