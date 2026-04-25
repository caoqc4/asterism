import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {
  AgentSandboxProvider,
  AgentSandboxProviderCapabilities,
  AgentSandboxSessionHandle,
  AgentSandboxSessionRequest,
} from '../../../shared/agent-sandbox-provider.js';

export class TempWorkspaceSandboxProvider implements AgentSandboxProvider {
  readonly capabilities: AgentSandboxProviderCapabilities = {
    kind: 'local_container',
    enabled: true,
    supportsReadOnlyWorkspace: true,
    supportsStagedWrites: true,
    supportsTargetedCommands: false,
    supportsPatchArtifacts: false,
    networkMode: 'disabled',
    credentialPassthrough: false,
  };

  async prepareSession(request: AgentSandboxSessionRequest): Promise<AgentSandboxSessionHandle> {
    if (request.providerKind !== 'local_container') {
      throw new Error(`Unsupported sandbox provider: ${request.providerKind}`);
    }

    if (request.descriptorId !== 'workspace.staged_patch') {
      throw new Error(`Unsupported sandbox descriptor: ${request.descriptorId}`);
    }

    const workspaceRoot = path.resolve(request.workspace.workspaceRoot);
    const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-sandbox-'));
    const createdAt = new Date().toISOString();

    await fs.writeFile(
      path.join(stagingRoot, 'session.json'),
      JSON.stringify({
        mountPath: request.workspace.mountPath,
        runId: request.runId,
        taskId: request.taskId,
        workspaceMode: request.workspace.mode,
        workspaceRoot,
      }, null, 2),
      'utf8',
    );

    return {
      createdAt,
      id: path.basename(stagingRoot),
      providerKind: 'local_container',
      stagingRoot,
      workspaceMode: request.workspace.mode,
    };
  }

  async disposeSession(handle: AgentSandboxSessionHandle): Promise<void> {
    await fs.rm(handle.stagingRoot, { force: true, recursive: true });
  }
}
