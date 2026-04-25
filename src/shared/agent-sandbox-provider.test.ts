import { describe, expect, it } from 'vitest';

import {
  buildDefaultAgentSandboxCommandPolicy,
  canUseAgentSandboxProviderForCoding,
  DISABLED_AGENT_SANDBOX_PROVIDER_CAPABILITIES,
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
});
