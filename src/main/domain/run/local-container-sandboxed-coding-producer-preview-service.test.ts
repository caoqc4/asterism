import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentSandboxBackendProbe } from '../../../shared/agent-sandbox-provider.js';
import type { AgentSessionRecord } from '../../../shared/types/agent-execution.js';
import type { RunStepRecord } from '../../../shared/types/run.js';
import { LocalContainerSandboxProvider } from './local-container-sandbox-backend.js';
import { LocalContainerSandboxedCodingProducerPreviewService } from './local-container-sandboxed-coding-producer-preview-service.js';
import { SandboxedCodingInjectedProducerPreviewService } from './sandboxed-coding-injected-producer-preview-service.js';
import { SandboxedCodingProducerBackendPreflightService } from './sandboxed-coding-producer-backend-preflight-service.js';

const featureFlags = {
  enableScheduler: false,
  enableSandboxCodingAgent: true,
};

const availableProbe: AgentSandboxBackendProbe = {
  backendId: 'local-container',
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
};

function buildRequest(workspaceRoot: string) {
  return {
    commandPolicy: {
      allowedScripts: ['test', 'lint'],
      outputLimitBytes: 64_000,
      timeoutMs: 120_000,
    },
    executionPolicy: {
      network: 'disabled',
      noCredentialPassthrough: true,
      promotion: 'decision_required',
    },
    intent: {
      completionCriteria: ['Patch is reviewable'],
      instructions: 'Prepare a staged notes patch.',
      taskTitle: 'Prepare notes patch',
    },
    modelPolicy: {
      providerKind: 'openai-compatible',
      toolExposure: 'sandboxed_coding_producer',
    },
    runId: 'run_1',
    sourceId: 'sandbox_source_1',
    taskId: 'task_1',
    workspaceRoot,
  };
}

function buildPersisterMock() {
  const session: AgentSessionRecord = {
    capabilities: {
      fileContext: true,
      longRunningSessions: true,
      streaming: false,
      structuredToolCalls: false,
      taskMutationTools: false,
      textOnlyPlanning: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'agent_session_1',
    metadata: 'executor=sandboxed_coding_producer',
    mode: 'agent',
    runId: 'run_1',
    status: 'completed',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const step: RunStepRecord = {
    createdAt: '2026-01-01T00:00:00.000Z',
    error: null,
    id: 'run_step_1',
    index: 1,
    input: null,
    kind: 'artifact',
    output: 'ready',
    runId: 'run_1',
    status: 'completed',
    title: 'Sandbox producer source ready',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  return {
    persist: vi.fn().mockResolvedValue({
      session,
      steps: [step],
    }),
  };
}

describe('LocalContainerSandboxedCodingProducerPreviewService', () => {
  let tempRoot = '';
  let workspaceRoot = '';

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-local-producer-preview-'));
    workspaceRoot = path.join(tempRoot, 'workspace');
    await fs.mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, 'src', 'notes.md'), 'old\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { force: true, recursive: true });
  });

  it('runs preflight, prepares a local container runner session, previews, persists, and disposes', async () => {
    const persister = buildPersisterMock();
    const service = new LocalContainerSandboxedCodingProducerPreviewService(
      new SandboxedCodingProducerBackendPreflightService(persister as never),
      new SandboxedCodingInjectedProducerPreviewService(persister as never),
      new LocalContainerSandboxProvider(),
    );
    const commandRunner = vi.fn().mockResolvedValue({
      exitCode: 0,
      stderr: '',
      stdout: 'check ok',
    });
    let preparedStagingRoot = '';

    const result = await service.run({
      commandRunner,
      featureFlags,
      patchSummary: 'Update notes from local container producer',
      probe: availableProbe,
      producerLoop: async ({ stagingRoot }) => {
        preparedStagingRoot = stagingRoot;
        await fs.mkdir(path.join(stagingRoot, 'src'), { recursive: true });
        await fs.writeFile(path.join(stagingRoot, 'src', 'notes.md'), 'new\n', 'utf8');

        return {
          evidence: {
            modelSummary: 'Staged notes update.',
            observations: ['Wrote staged notes.'],
          },
          sessionSummary: 'producer completed',
          status: 'completed',
          summary: 'Staged src/notes.md',
        };
      },
      request: buildRequest(workspaceRoot),
    });

    expect(result).toMatchObject({
      preview: {
        preview: {
          status: 'preview_ready',
        },
        persistenceSummary: 'producer=preview_ready / session=completed / steps=1',
      },
      status: 'previewed',
    });
    expect(commandRunner).toHaveBeenCalledTimes(2);
    expect(persister.persist).toHaveBeenCalledWith({
      result: expect.objectContaining({
        status: 'preview_ready',
      }),
      runId: 'run_1',
    });
    await expect(fs.stat(preparedStagingRoot)).rejects.toThrow();
    expect(await fs.readFile(path.join(workspaceRoot, 'src', 'notes.md'), 'utf8')).toBe('old\n');
  });

  it('returns blocked preflight diagnostics without preparing a local container session', async () => {
    const preflightService = {
      run: vi.fn().mockResolvedValue({
        diagnostic: null,
        plan: {
          blockedReasons: ['docker daemon unavailable'],
          gateSummary: 'blocked',
          status: 'blocked',
          summary: 'Sandboxed coding producer backend connection plan blocked: docker daemon unavailable',
        },
        reason: 'docker daemon unavailable',
        status: 'blocked',
        summary: 'Sandboxed coding producer backend connection plan blocked: docker daemon unavailable',
      }),
    };
    const previewService = {
      run: vi.fn(),
    };
    const provider = {
      disposeSession: vi.fn(),
      prepareSession: vi.fn(),
      runChecks: vi.fn(),
    };
    const service = new LocalContainerSandboxedCodingProducerPreviewService(
      preflightService as never,
      previewService as never,
      provider as never,
    );

    await expect(service.run({
      commandRunner: vi.fn(),
      featureFlags,
      patchSummary: 'No patch',
      probe: {
        backendId: 'local-container',
        kind: 'local_container',
        reason: 'docker daemon unavailable',
        status: 'unavailable',
      },
      producerLoop: vi.fn(),
      request: buildRequest(workspaceRoot),
    })).resolves.toMatchObject({
      status: 'blocked',
      summary: 'Sandboxed coding producer backend connection plan blocked: docker daemon unavailable',
    });
    expect(provider.prepareSession).not.toHaveBeenCalled();
    expect(previewService.run).not.toHaveBeenCalled();
  });
});
