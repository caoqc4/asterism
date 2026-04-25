import { describe, expect, it } from 'vitest';

import {
  buildAgentSandboxCheckPlan,
  buildAgentSandboxPatchArtifact,
  buildAgentSandboxPatchPromotionCheckpoint,
  buildDefaultAgentSandboxCommandPolicy,
  canUseAgentSandboxProviderForCoding,
  DISABLED_AGENT_SANDBOX_PROVIDER_CAPABILITIES,
  summarizeAgentSandboxCheckResults,
  toAgentToolArtifactDescriptor,
  type AgentSandboxProviderCapabilities,
  type AgentSandboxSessionRequest,
} from './agent-sandbox-provider.js';
import { buildDefaultAgentToolExecutionPolicy } from './agent-tool-scaffold.js';

describe('agent sandbox provider contracts', () => {
  it('defaults to a disabled provider with no credentials or execution power', () => {
    expect(DISABLED_AGENT_SANDBOX_PROVIDER_CAPABILITIES).toEqual({
      kind: 'disabled',
      enabled: false,
      supportsReadOnlyWorkspace: false,
      supportsStagedWrites: false,
      supportsTargetedCommands: false,
      supportsPatchArtifacts: false,
      networkMode: 'disabled',
      credentialPassthrough: false,
    });
    expect(canUseAgentSandboxProviderForCoding(DISABLED_AGENT_SANDBOX_PROVIDER_CAPABILITIES)).toBe(false);
  });

  it('requires every coding capability before a sandbox provider can be used', () => {
    const ready: AgentSandboxProviderCapabilities = {
      kind: 'local_container',
      enabled: true,
      supportsReadOnlyWorkspace: true,
      supportsStagedWrites: true,
      supportsTargetedCommands: true,
      supportsPatchArtifacts: true,
      networkMode: 'disabled',
      credentialPassthrough: false,
    };

    expect(canUseAgentSandboxProviderForCoding(ready)).toBe(true);
    expect(canUseAgentSandboxProviderForCoding({ ...ready, supportsPatchArtifacts: false })).toBe(false);
    expect(canUseAgentSandboxProviderForCoding({ ...ready, enabled: false })).toBe(false);
  });

  it('builds a narrow command policy for targeted checks only', () => {
    expect(buildDefaultAgentSandboxCommandPolicy()).toEqual({
      allowedScripts: ['test', 'lint'],
      allowArbitraryShell: false,
      allowInteractive: false,
      outputLimitBytes: 64_000,
      timeoutMs: 120_000,
    });

    expect(buildDefaultAgentSandboxCommandPolicy({ timeoutMs: 30_000 })).toMatchObject({
      timeoutMs: 30_000,
      allowArbitraryShell: false,
      allowInteractive: false,
    });
  });

  it('builds targeted check plans only from allowlisted scripts', () => {
    expect(buildAgentSandboxCheckPlan({
      policy: buildDefaultAgentSandboxCommandPolicy({ timeoutMs: 30_000 }),
      requestedScripts: ['test', 'build', 'lint', 'test'],
    })).toEqual({
      outputLimitBytes: 64_000,
      scripts: ['test', 'lint'],
      timeoutMs: 30_000,
    });

    expect(() => buildAgentSandboxCheckPlan({
      policy: buildDefaultAgentSandboxCommandPolicy(),
      requestedScripts: ['build', 'verify'],
    })).toThrow('Sandbox check plan requires at least one allowlisted script.');
  });

  it('models a staged patch session request without host workspace promotion', () => {
    const request: AgentSandboxSessionRequest = {
      commandPolicy: buildDefaultAgentSandboxCommandPolicy(),
      descriptorId: 'workspace.staged_patch',
      executionPolicy: buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' }),
      providerKind: 'local_container',
      runId: 'run_1',
      taskId: 'task_1',
      workspace: {
        mountPath: '/workspace',
        mode: 'staged_write',
        workspaceRoot: '/tmp/taskplane-sandbox-workspace',
      },
    };

    expect(request.executionPolicy).toMatchObject({
      descriptorId: 'workspace.staged_patch',
      networkPolicy: 'disabled',
      sessionKind: 'sandbox',
    });
    expect(request.workspace.mode).toBe('staged_write');
    expect(request.commandPolicy.allowedScripts).toEqual(['test', 'lint']);
  });

  it('builds a normalized staged patch artifact for later Decision review', () => {
    const artifact = buildAgentSandboxPatchArtifact({
      commandLogs: [
        {
          outputPreview: 'lint passed',
          script: 'lint',
          status: 'passed',
        },
      ],
      diff: '--- a/src/a.ts\n+++ b/src/a.ts\n@@\n-old\n+new',
      files: ['src/a.ts', 'src/a.ts', ' src/b.ts '],
      riskSummary: 'Touches two source files.',
      summary: 'Proposed sandbox patch',
    });

    expect(artifact.files).toEqual(['src/a.ts', 'src/b.ts']);
    expect(artifact.commandLogs).toHaveLength(1);
    expect(toAgentToolArtifactDescriptor(artifact)).toMatchObject({
      kind: 'patch',
      preview: expect.stringContaining('+++ b/src/a.ts'),
      summary: '2 file(s): src/a.ts, src/b.ts | Touches two source files.',
      title: 'Proposed sandbox patch',
    });
  });

  it('rejects empty staged patch artifacts', () => {
    expect(() => buildAgentSandboxPatchArtifact({
      diff: '',
      files: ['src/a.ts'],
      summary: 'Empty diff',
    })).toThrow('Sandbox patch artifact requires a diff preview.');

    expect(() => buildAgentSandboxPatchArtifact({
      diff: '--- a/src/a.ts',
      files: [],
      summary: 'No files',
    })).toThrow('Sandbox patch artifact requires at least one changed file.');
  });

  it('summarizes sandbox check results without command output expansion', () => {
    expect(summarizeAgentSandboxCheckResults([
      { outputPreview: 'ok', script: 'lint', status: 'passed' },
      { outputPreview: 'failure details', script: 'test', status: 'failed' },
    ])).toBe('lint: passed; test: failed');

    expect(summarizeAgentSandboxCheckResults([])).toBe('No sandbox checks were run.');
  });

  it('builds a patch promotion checkpoint descriptor without applying the patch', () => {
    const artifact = buildAgentSandboxPatchArtifact({
      diff: '--- a/src/a.ts\n+++ b/src/a.ts',
      files: ['src/a.ts'],
      riskSummary: 'Single source file change.',
      summary: 'Reviewable patch',
    });
    const policySnapshot = buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' });

    expect(buildAgentSandboxPatchPromotionCheckpoint({
      artifact,
      policySnapshot,
      resumeTarget: 'sandbox-session-1:promote',
    })).toMatchObject({
      consequence: expect.stringContaining('workspace unchanged'),
      kind: 'patch_promotion',
      policySnapshot,
      preview: expect.stringContaining('--- a/src/a.ts'),
      reason: 'Review sandbox patch before workspace promotion: Reviewable patch | 1 file(s): src/a.ts | Single source file change.',
      resumeTarget: 'sandbox-session-1:promote',
    });
  });

  it('rejects patch promotion checkpoints with the wrong policy snapshot', () => {
    const artifact = buildAgentSandboxPatchArtifact({
      diff: '--- a/src/a.ts\n+++ b/src/a.ts',
      files: ['src/a.ts'],
      summary: 'Reviewable patch',
    });

    expect(() => buildAgentSandboxPatchPromotionCheckpoint({
      artifact,
      policySnapshot: buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.search' }),
      resumeTarget: 'sandbox-session-1:promote',
    })).toThrow('Sandbox patch promotion requires a workspace.staged_patch policy snapshot.');
  });
});
