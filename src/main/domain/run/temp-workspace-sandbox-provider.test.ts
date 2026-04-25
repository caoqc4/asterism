import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildDefaultAgentSandboxCommandPolicy,
  type AgentSandboxSessionRequest,
} from '../../../shared/agent-sandbox-provider.js';
import { buildDefaultAgentToolExecutionPolicy } from '../../../shared/agent-tool-scaffold.js';
import {
  evaluateTempWorkspaceSandboxCodingLane,
  TempWorkspaceSandboxProvider,
} from './temp-workspace-sandbox-provider.js';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('TempWorkspaceSandboxProvider', () => {
  it('reports the temp provider as not yet eligible for coding-agent sessions', () => {
    const eligibility = evaluateTempWorkspaceSandboxCodingLane({
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      workspaceRoot: '/tmp/taskplane-workspace',
    });

    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockedReasons).toEqual([
      'sandbox provider does not expose the required staged-write, targeted-check, patch-artifact capability set',
    ]);
  });

  it('prepares an isolated staging root without mutating the source workspace', async () => {
    const workspaceRoot = makeTempDir('taskplane-source-workspace-');
    const sourceFile = path.join(workspaceRoot, 'source.txt');
    fs.writeFileSync(sourceFile, 'original workspace content', 'utf8');

    const provider = new TempWorkspaceSandboxProvider();
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
        workspaceRoot,
      },
    };

    const handle = await provider.prepareSession(request);

    try {
      expect(handle.providerKind).toBe('local_container');
      expect(handle.workspaceMode).toBe('staged_write');
      expect(handle.stagingRoot).not.toBe(workspaceRoot);
      expect(fs.existsSync(handle.stagingRoot)).toBe(true);
      const manifestPath = path.join(handle.stagingRoot, 'session.json');
      expect(fs.existsSync(manifestPath)).toBe(true);
      expect(JSON.parse(fs.readFileSync(manifestPath, 'utf8'))).toMatchObject({
        commandPolicy: {
          allowArbitraryShell: false,
          allowInteractive: false,
          allowedScripts: ['test', 'lint'],
        },
        descriptorId: 'workspace.staged_patch',
        executionPolicy: {
          credentialPolicy: 'none',
          descriptorId: 'workspace.staged_patch',
          networkPolicy: 'disabled',
          sessionKind: 'sandbox',
        },
        providerCapabilities: {
          supportsPatchArtifacts: false,
          supportsTargetedCommands: false,
        },
        runId: 'run_1',
        taskId: 'task_1',
        workspace: {
          mode: 'staged_write',
          workspaceRoot,
        },
      });
      expect(fs.readFileSync(sourceFile, 'utf8')).toBe('original workspace content');
      expect(provider.capabilities).toMatchObject({
        credentialPassthrough: false,
        networkMode: 'disabled',
        supportsStagedWrites: true,
        supportsTargetedCommands: false,
      });
    } finally {
      await provider.disposeSession(handle);
      fs.rmSync(workspaceRoot, { force: true, recursive: true });
    }

    expect(fs.existsSync(handle.stagingRoot)).toBe(false);
  });

  it('rejects unsupported provider kinds before creating a staging root', async () => {
    const workspaceRoot = makeTempDir('taskplane-source-workspace-');
    const provider = new TempWorkspaceSandboxProvider();

    await expect(provider.prepareSession({
      commandPolicy: buildDefaultAgentSandboxCommandPolicy(),
      descriptorId: 'workspace.staged_patch',
      executionPolicy: buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' }),
      providerKind: 'remote',
      runId: 'run_1',
      taskId: 'task_1',
      workspace: {
        mountPath: '/workspace',
        mode: 'staged_write',
        workspaceRoot,
      },
    })).rejects.toThrow('Unsupported sandbox provider: remote');

    fs.rmSync(workspaceRoot, { force: true, recursive: true });
  });
});
