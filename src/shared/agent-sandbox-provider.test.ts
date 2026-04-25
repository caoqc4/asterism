import { describe, expect, it } from 'vitest';

import {
  buildAgentSandboxCheckPlan,
  buildAgentSandboxBackendStatus,
  buildAgentSandboxBackendProfileFromProbe,
  buildAgentSandboxPatchArtifact,
  buildAgentSandboxPatchPromotionCheckpoint,
  buildAgentSandboxProviderCapabilitiesFromBackendProfile,
  buildAgentSandboxSessionManifest,
  buildDefaultAgentSandboxCommandPolicy,
  canUseAgentSandboxProviderForCoding,
  DISABLED_AGENT_SANDBOX_PROVIDER_CAPABILITIES,
  evaluateAgentSandboxBackendReadiness,
  evaluateAgentSandboxCodingLaneEligibility,
  summarizeAgentSandboxBackendProbe,
  summarizeAgentSandboxBackendProfile,
  summarizeAgentSandboxSessionManifest,
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

  it('evaluates candidate sandbox backends before provider exposure', () => {
    expect(evaluateAgentSandboxBackendReadiness({
      credentialPassthrough: false,
      environmentPolicy: 'empty',
      id: 'local-container-candidate',
      isolation: 'container',
      kind: 'local_container',
      networkMode: 'disabled',
      supportsOutputLimits: true,
      supportsPatchArtifacts: true,
      supportsStagedWrites: true,
      supportsStructuredCommands: true,
      supportsTargetedCommands: true,
      supportsWorkspaceMount: true,
    })).toEqual({
      blockedReasons: [],
      ready: true,
      summary: 'Sandbox backend ready: local-container-candidate.',
    });
  });

  it('builds backend profiles only from available backend probes', () => {
    expect(buildAgentSandboxBackendProfileFromProbe({
      backendId: 'docker-local',
      environmentPolicy: 'empty',
      isolation: 'container',
      kind: 'local_container',
      networkMode: 'disabled',
      status: 'available',
      supportsOutputLimits: true,
      supportsPatchArtifacts: true,
      supportsStagedWrites: true,
      supportsStructuredCommands: true,
      supportsTargetedCommands: true,
      supportsWorkspaceMount: true,
    })).toMatchObject({
      credentialPassthrough: false,
      environmentPolicy: 'empty',
      id: 'docker-local',
      isolation: 'container',
      kind: 'local_container',
    });

    expect(buildAgentSandboxBackendProfileFromProbe({
      backendId: 'docker-local',
      kind: 'local_container',
      reason: 'Docker is not available.',
      status: 'unavailable',
    })).toBeNull();
  });

  it('summarizes backend probes before they become profiles', () => {
    expect(summarizeAgentSandboxBackendProbe({
      backendId: 'docker-local',
      kind: 'local_container',
      reason: 'Docker is not available.',
      status: 'unavailable',
    })).toBe('backend=docker-local / kind=local_container / available=no / reason=Docker is not available.');

    expect(summarizeAgentSandboxBackendProbe({
      backendId: 'docker-local',
      environmentPolicy: 'empty',
      isolation: 'container',
      kind: 'local_container',
      networkMode: 'disabled',
      status: 'available',
      supportsOutputLimits: true,
      supportsPatchArtifacts: true,
      supportsStagedWrites: true,
      supportsStructuredCommands: true,
      supportsTargetedCommands: true,
      supportsWorkspaceMount: true,
    })).toBe('backend=docker-local / kind=local_container / available=yes / isolation=container / env=empty');
  });

  it('builds backend status without forcing a runtime probe', () => {
    expect(buildAgentSandboxBackendStatus(null)).toEqual({
      probe: null,
      profile: null,
      readiness: null,
      summary: 'Sandbox backend not probed.',
    });

    expect(buildAgentSandboxBackendStatus({
      backendId: 'docker-local',
      kind: 'local_container',
      reason: 'Docker is not available.',
      status: 'unavailable',
    })).toMatchObject({
      profile: null,
      readiness: null,
      summary: 'backend=docker-local / kind=local_container / available=no / reason=Docker is not available.',
    });
  });

  it('rejects host-process or incomplete sandbox backend profiles', () => {
    const result = evaluateAgentSandboxBackendReadiness({
      credentialPassthrough: false,
      environmentPolicy: 'inherit_host',
      id: 'host-process-candidate',
      isolation: 'host_process',
      kind: 'local_container',
      networkMode: 'disabled',
      supportsOutputLimits: false,
      supportsPatchArtifacts: false,
      supportsStagedWrites: false,
      supportsStructuredCommands: false,
      supportsTargetedCommands: false,
      supportsWorkspaceMount: false,
    });

    expect(result.ready).toBe(false);
    expect(result.blockedReasons).toEqual([
      'sandbox backend must not run as a host process',
      'sandbox backend must not inherit the host environment',
      'sandbox backend must mount exactly one selected workspace',
      'sandbox backend must support staged writes',
      'sandbox backend must support structured targeted commands',
      'sandbox backend must enforce command output limits',
      'sandbox backend must produce patch artifacts',
    ]);
  });

  it('derives provider capabilities only from ready backend profiles', () => {
    expect(buildAgentSandboxProviderCapabilitiesFromBackendProfile({
      credentialPassthrough: false,
      environmentPolicy: 'allowlisted',
      id: 'remote-vm-candidate',
      isolation: 'remote_vm',
      kind: 'remote',
      networkMode: 'allowlisted',
      supportsOutputLimits: true,
      supportsPatchArtifacts: true,
      supportsStagedWrites: true,
      supportsStructuredCommands: true,
      supportsTargetedCommands: true,
      supportsWorkspaceMount: true,
    })).toEqual({
      credentialPassthrough: false,
      enabled: true,
      kind: 'remote',
      networkMode: 'allowlisted',
      supportsPatchArtifacts: true,
      supportsReadOnlyWorkspace: true,
      supportsStagedWrites: true,
      supportsTargetedCommands: true,
    });

    expect(() => buildAgentSandboxProviderCapabilitiesFromBackendProfile({
      credentialPassthrough: false,
      environmentPolicy: 'empty',
      id: 'incomplete-container-candidate',
      isolation: 'container',
      kind: 'local_container',
      networkMode: 'disabled',
      supportsOutputLimits: true,
      supportsPatchArtifacts: false,
      supportsStagedWrites: true,
      supportsStructuredCommands: true,
      supportsTargetedCommands: true,
      supportsWorkspaceMount: true,
    })).toThrow('Sandbox backend not ready: sandbox backend must produce patch artifacts.');
  });

  it('summarizes backend profiles with readiness state', () => {
    expect(summarizeAgentSandboxBackendProfile({
      credentialPassthrough: false,
      environmentPolicy: 'empty',
      id: 'local-container-candidate',
      isolation: 'container',
      kind: 'local_container',
      networkMode: 'disabled',
      supportsOutputLimits: true,
      supportsPatchArtifacts: true,
      supportsStagedWrites: true,
      supportsStructuredCommands: true,
      supportsTargetedCommands: true,
      supportsWorkspaceMount: true,
    })).toBe(
      'backend=local-container-candidate / kind=local_container / isolation=container / env=empty / network=disabled / ready=yes',
    );

    expect(summarizeAgentSandboxBackendProfile({
      credentialPassthrough: false,
      environmentPolicy: 'inherit_host',
      id: 'host-process-candidate',
      isolation: 'host_process',
      kind: 'local_container',
      networkMode: 'disabled',
      supportsOutputLimits: false,
      supportsPatchArtifacts: false,
      supportsStagedWrites: false,
      supportsStructuredCommands: false,
      supportsTargetedCommands: false,
      supportsWorkspaceMount: false,
    })).toContain('ready=no');
  });

  it('explains why the sandbox coding lane is unavailable by default', () => {
    const result = evaluateAgentSandboxCodingLaneEligibility({
      commandPolicy: buildDefaultAgentSandboxCommandPolicy(),
      executionPolicy: buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' }),
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: false,
      },
      providerCapabilities: DISABLED_AGENT_SANDBOX_PROVIDER_CAPABILITIES,
      workspaceRoot: null,
    });

    expect(result.eligible).toBe(false);
    expect(result.blockedReasons).toEqual([
      'sandbox coding-agent feature flag is disabled',
      'sandbox provider does not expose the required staged-write, targeted-check, patch-artifact capability set',
      'workspace root is required before preparing a sandbox coding session',
    ]);
    expect(result.summary).toContain('Sandbox coding lane unavailable');
  });

  it('marks the sandbox coding lane eligible only after all guard conditions pass', () => {
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

    const result = evaluateAgentSandboxCodingLaneEligibility({
      commandPolicy: buildDefaultAgentSandboxCommandPolicy(),
      executionPolicy: buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' }),
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      providerCapabilities: ready,
      workspaceRoot: '/tmp/taskplane-workspace',
    });

    expect(result).toEqual({
      blockedReasons: [],
      eligible: true,
      summary: 'Sandbox coding lane eligible for a gated staged-patch session.',
    });
  });

  it('rejects unsafe sandbox coding policies even when the rollout flag is enabled', () => {
    const ready: AgentSandboxProviderCapabilities = {
      kind: 'remote',
      enabled: true,
      supportsReadOnlyWorkspace: true,
      supportsStagedWrites: true,
      supportsTargetedCommands: true,
      supportsPatchArtifacts: true,
      networkMode: 'allowlisted',
      credentialPassthrough: false,
    };

    const result = evaluateAgentSandboxCodingLaneEligibility({
      commandPolicy: {
        ...buildDefaultAgentSandboxCommandPolicy(),
        allowArbitraryShell: true as false,
      },
      executionPolicy: {
        ...buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' }),
        credentialPolicy: 'explicit_config',
        networkPolicy: 'allowlisted',
      },
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      providerCapabilities: ready,
      workspaceRoot: '/tmp/taskplane-workspace',
    });

    expect(result.eligible).toBe(false);
    expect(result.blockedReasons).toContain('sandbox coding sessions must not receive credentials');
    expect(result.blockedReasons).toContain('sandbox coding sessions must start with network disabled');
    expect(result.blockedReasons).toContain('sandbox checks must be non-interactive and cannot allow arbitrary shell');
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

  it('builds a session manifest for later audit and artifact attachment', () => {
    const request: AgentSandboxSessionRequest = {
      commandPolicy: buildDefaultAgentSandboxCommandPolicy({ timeoutMs: 30_000 }),
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

    expect(buildAgentSandboxSessionManifest({
      handle: {
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'sandbox_session_1',
        providerKind: 'local_container',
        stagingRoot: '/tmp/taskplane-sandbox-session',
        workspaceMode: 'staged_write',
      },
      providerCapabilities: DISABLED_AGENT_SANDBOX_PROVIDER_CAPABILITIES,
      request,
    })).toMatchObject({
      commandPolicy: expect.objectContaining({
        allowArbitraryShell: false,
        timeoutMs: 30_000,
      }),
      descriptorId: 'workspace.staged_patch',
      executionPolicy: expect.objectContaining({
        credentialPolicy: 'none',
        descriptorId: 'workspace.staged_patch',
      }),
      id: 'sandbox_session_1',
      providerKind: 'local_container',
      runId: 'run_1',
      taskId: 'task_1',
      workspace: expect.objectContaining({
        mode: 'staged_write',
        workspaceRoot: '/tmp/taskplane-sandbox-workspace',
      }),
    });
  });

  it('summarizes sandbox session manifests without expanding raw policy JSON', () => {
    const manifest = buildAgentSandboxSessionManifest({
      handle: {
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'sandbox_session_1',
        providerKind: 'local_container',
        stagingRoot: '/tmp/taskplane-sandbox-session',
        workspaceMode: 'staged_write',
      },
      providerCapabilities: {
        kind: 'local_container',
        enabled: true,
        supportsReadOnlyWorkspace: true,
        supportsStagedWrites: true,
        supportsTargetedCommands: false,
        supportsPatchArtifacts: false,
        networkMode: 'disabled',
        credentialPassthrough: false,
      },
      request: {
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
      },
    });

    expect(summarizeAgentSandboxSessionManifest(manifest)).toBe(
      'sandbox=sandbox_session_1 / provider=local_container / workspace=staged_write / network=disabled / credentials=none / commands=test,lint / patchArtifacts=unsupported',
    );
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
