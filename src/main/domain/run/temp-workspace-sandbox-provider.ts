import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {
  AgentSandboxCodingLaneEligibility,
  AgentSandboxProvider,
  AgentSandboxProviderCapabilities,
  AgentSandboxSessionHandle,
  AgentSandboxSessionRequest,
} from '../../../shared/agent-sandbox-provider.js';
import {
  buildAgentSandboxSessionManifest,
  buildDefaultAgentSandboxCommandPolicy,
  evaluateAgentSandboxCodingLaneEligibility,
  summarizeAgentSandboxSessionManifest,
  type AgentSandboxSessionManifest,
} from '../../../shared/agent-sandbox-provider.js';
import { buildDefaultAgentToolExecutionPolicy } from '../../../shared/agent-tool-scaffold.js';
import type { FeatureFlags } from '../../../shared/types/settings.js';

export type TempWorkspaceSandboxCodingSessionPreparation =
  | {
      status: 'blocked';
      eligibility: AgentSandboxCodingLaneEligibility;
    }
  | {
      status: 'prepared';
      eligibility: AgentSandboxCodingLaneEligibility;
      handle: AgentSandboxSessionHandle;
      summary: string;
    };

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

    const handle: AgentSandboxSessionHandle = {
      createdAt,
      id: path.basename(stagingRoot),
      providerKind: 'local_container',
      stagingRoot,
      workspaceMode: request.workspace.mode,
    };
    const manifest = buildAgentSandboxSessionManifest({
      handle,
      providerCapabilities: this.capabilities,
      request: {
        ...request,
        workspace: {
          ...request.workspace,
          workspaceRoot,
        },
      },
    });

    await fs.writeFile(
      path.join(stagingRoot, 'session.json'),
      JSON.stringify(manifest, null, 2),
      'utf8',
    );

    return handle;
  }

  async disposeSession(handle: AgentSandboxSessionHandle): Promise<void> {
    await fs.rm(handle.stagingRoot, { force: true, recursive: true });
  }

  async summarizeSession(handle: AgentSandboxSessionHandle): Promise<string> {
    const raw = await fs.readFile(path.join(handle.stagingRoot, 'session.json'), 'utf8');
    return summarizeAgentSandboxSessionManifest(JSON.parse(raw) as AgentSandboxSessionManifest);
  }
}

export function evaluateTempWorkspaceSandboxCodingLane(params: {
  featureFlags: FeatureFlags;
  workspaceRoot?: string | null;
}) {
  const provider = new TempWorkspaceSandboxProvider();

  return evaluateAgentSandboxCodingLaneEligibility({
    commandPolicy: buildDefaultAgentSandboxCommandPolicy(),
    executionPolicy: buildDefaultAgentToolExecutionPolicy({ descriptorId: 'workspace.staged_patch' }),
    featureFlags: params.featureFlags,
    providerCapabilities: provider.capabilities,
    workspaceRoot: params.workspaceRoot,
  });
}

export async function prepareTempWorkspaceSandboxCodingSession(params: {
  featureFlags: FeatureFlags;
  request: AgentSandboxSessionRequest;
}): Promise<TempWorkspaceSandboxCodingSessionPreparation> {
  const provider = new TempWorkspaceSandboxProvider();
  const eligibility = evaluateAgentSandboxCodingLaneEligibility({
    commandPolicy: params.request.commandPolicy,
    executionPolicy: params.request.executionPolicy,
    featureFlags: params.featureFlags,
    providerCapabilities: provider.capabilities,
    workspaceRoot: params.request.workspace.workspaceRoot,
  });

  if (!eligibility.eligible) {
    return {
      eligibility,
      status: 'blocked',
    };
  }

  const handle = await provider.prepareSession(params.request);

  return {
    eligibility,
    handle,
    status: 'prepared',
    summary: await provider.summarizeSession(handle),
  };
}
