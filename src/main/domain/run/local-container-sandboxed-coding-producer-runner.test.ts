import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentSandboxBackendProbe } from '../../../shared/agent-sandbox-provider.js';
import { LocalContainerSandboxProvider } from './local-container-sandbox-backend.js';
import {
  buildSandboxedCodingProducerBackendLaunchEnvelope,
  evaluateSandboxedCodingProducerBackendConnectionGate,
} from './sandboxed-coding-producer-backend.js';
import { prepareLocalContainerSandboxedCodingProducerRunnerSession } from './local-container-sandboxed-coding-producer-runner.js';

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

async function buildReadyEnvelope(workspaceRoot: string) {
  const gate = evaluateSandboxedCodingProducerBackendConnectionGate({
    featureFlags,
    probe: availableProbe,
    request: buildRequest(workspaceRoot),
  });
  const envelope = buildSandboxedCodingProducerBackendLaunchEnvelope(gate);

  if (envelope.status !== 'ready') {
    throw new Error('Expected ready launch envelope');
  }

  return envelope;
}

describe('prepareLocalContainerSandboxedCodingProducerRunnerSession', () => {
  let tempRoot = '';
  let workspaceRoot = '';

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-local-producer-runner-'));
    workspaceRoot = path.join(tempRoot, 'workspace');
    await fs.mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, 'src', 'notes.md'), 'old\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { force: true, recursive: true });
  });

  it('prepares a local container producer runner session and runs checks through an injected command runner', async () => {
    const provider = new LocalContainerSandboxProvider();
    const commandRunner = vi.fn().mockResolvedValue({
      exitCode: 0,
      stderr: '',
      stdout: 'lint ok',
    });
    const producerLoop = vi.fn().mockImplementation(async ({ stagingRoot }) => {
      await fs.mkdir(path.join(stagingRoot, 'src'), { recursive: true });
      await fs.writeFile(path.join(stagingRoot, 'src', 'notes.md'), 'new\n', 'utf8');

      return {
        evidence: {
          modelSummary: 'Staged notes update.',
          observations: ['Wrote src/notes.md in staging.'],
        },
        sessionSummary: 'producer loop completed',
        status: 'completed',
        summary: 'Staged src/notes.md',
      };
    });

    const session = await prepareLocalContainerSandboxedCodingProducerRunnerSession({
      commandRunner,
      envelope: await buildReadyEnvelope(workspaceRoot),
      producerLoop,
      provider,
    });
    const emitted: unknown[] = [];

    try {
      const result = await session.runner({
        emit: (event) => emitted.push(event),
        request: buildRequest(workspaceRoot),
        sessionId: 'sandboxed_producer:sandbox_source_1',
        stagingRoot: session.stagingRoot,
      });

      expect(result).toMatchObject({
        evidence: {
          commandSummaries: ['test: passed', 'lint: passed'],
          modelSummary: 'Staged notes update.',
          observations: ['Wrote src/notes.md in staging.'],
        },
        sessionSummary: expect.stringContaining('checks=test: passed; lint: passed'),
        status: 'completed',
        summary: 'Staged src/notes.md',
      });
      expect(producerLoop).toHaveBeenCalledWith(expect.objectContaining({
        handle: session.handle,
        stagingRoot: session.stagingRoot,
      }));
      expect(commandRunner).toHaveBeenCalledTimes(2);
      expect(emitted).toEqual([
        expect.objectContaining({
          script: 'test',
          status: 'passed',
          type: 'sandbox_producer.check_completed',
        }),
        expect.objectContaining({
          script: 'lint',
          status: 'passed',
          type: 'sandbox_producer.check_completed',
        }),
      ]);
      expect(await fs.readFile(path.join(session.stagingRoot, 'src', 'notes.md'), 'utf8')).toBe('new\n');
      expect(await fs.readFile(path.join(workspaceRoot, 'src', 'notes.md'), 'utf8')).toBe('old\n');
    } finally {
      await session.dispose();
    }

    await expect(fs.stat(session.stagingRoot)).rejects.toThrow();
  });

  it('fails closed when called with a staging root outside the prepared session', async () => {
    const provider = new LocalContainerSandboxProvider();
    const session = await prepareLocalContainerSandboxedCodingProducerRunnerSession({
      commandRunner: vi.fn(),
      envelope: await buildReadyEnvelope(workspaceRoot),
      producerLoop: vi.fn(),
      provider,
    });

    try {
      await expect(session.runner({
        emit: vi.fn(),
        request: buildRequest(workspaceRoot),
        sessionId: 'sandboxed_producer:sandbox_source_1',
        stagingRoot: path.join(tempRoot, 'outside-staging'),
      })).resolves.toEqual({
        reason: 'Local container producer runner received a staging root outside its prepared session.',
        sessionSummary: `local-container producer session=${session.handle.id}`,
        status: 'failed',
      });
    } finally {
      await session.dispose();
    }
  });

  it('rejects non-local launch envelopes before preparing a provider session', async () => {
    const provider = {
      disposeSession: vi.fn(),
      prepareSession: vi.fn(),
      runChecks: vi.fn(),
    };
    const envelope = {
      ...(await buildReadyEnvelope(workspaceRoot)),
      backendKind: 'remote' as const,
      requiredRunner: 'remote_sandboxed_coding_producer' as const,
    };

    await expect(prepareLocalContainerSandboxedCodingProducerRunnerSession({
      commandRunner: vi.fn(),
      envelope,
      producerLoop: vi.fn(),
      provider,
    })).rejects.toThrow('Local container producer runner requires a local_container backend envelope.');
    expect(provider.prepareSession).not.toHaveBeenCalled();
  });
});
