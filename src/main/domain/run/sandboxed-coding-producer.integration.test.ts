import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { previewSandboxedCodingInjectedProducerRun } from './sandboxed-coding-producer.js';

const featureFlags = {
  enableScheduler: false,
  enableSandboxCodingAgent: true,
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

describe('previewSandboxedCodingInjectedProducerRun integration', () => {
  let tempRoot = '';
  let workspaceRoot = '';
  let stagingRoot = '';

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-producer-integration-'));
    workspaceRoot = path.join(tempRoot, 'workspace');
    stagingRoot = path.join(tempRoot, 'staging');
    await fs.mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
    await fs.mkdir(path.join(stagingRoot, 'src'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { force: true, recursive: true });
  });

  it('returns source-ready preview with source identity, steps, and untouched workspace files', async () => {
    await fs.writeFile(path.join(workspaceRoot, 'src', 'notes.md'), 'old\n', 'utf8');

    const result = await previewSandboxedCodingInjectedProducerRun({
      decisionTitle: '确认提升 injected producer patch',
      featureFlags,
      patchSummary: 'Update notes from injected producer',
      request: buildRequest(workspaceRoot),
      runner: async ({ emit, request, sessionId, stagingRoot: nextStagingRoot }) => {
        await fs.writeFile(path.join(nextStagingRoot, 'src', 'notes.md'), 'new\n', 'utf8');
        emit({
          outputSummary: 'lint: passed',
          runId: request.runId,
          script: 'lint',
          sessionId,
          sourceId: request.sourceId,
          status: 'passed',
          type: 'sandbox_producer.check_completed',
        });

        return {
          evidence: {
            commandSummaries: ['lint: passed'],
            observations: ['Staged src/notes.md'],
          },
          sessionSummary: 'source-ready integration producer completed',
          status: 'completed',
          summary: 'Staged src/notes.md',
        };
      },
      stagingRoot,
    });

    expect(result.status).toBe('preview_ready');

    if (result.status === 'preview_ready') {
      expect(result.source).toMatchObject({
        runId: 'run_1',
        sourceId: 'sandbox_source_1',
        sourceKind: 'sandbox_session',
        taskId: 'task_1',
        workspaceRoot,
      });
      expect(result.plan.status).toBe('ready');
      expect(result.steps.map((step) => [step.kind, step.status, step.title])).toEqual([
        ['plan', 'running', 'Sandboxed coding producer started'],
        ['tool_result', 'completed', 'Sandbox producer check passed: lint'],
        ['artifact', 'completed', 'Sandbox producer source ready'],
      ]);
      expect(await fs.readFile(path.join(workspaceRoot, 'src', 'notes.md'), 'utf8')).toBe('old\n');
    }
  });

  it('returns blocked when the injected runner blocks before staged collection', async () => {
    const result = await previewSandboxedCodingInjectedProducerRun({
      featureFlags,
      patchSummary: 'Blocked patch',
      request: buildRequest(workspaceRoot),
      runner: async () => ({
        reason: 'No sandbox backend is ready.',
        sessionSummary: 'blocked integration producer',
        status: 'blocked',
      }),
      stagingRoot,
    });

    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'No sandbox backend is ready.',
      sessionSummary: 'blocked integration producer',
    });
    expect(result.steps.at(-1)).toMatchObject({
      kind: 'final',
      status: 'completed',
      title: 'Sandbox producer blocked',
    });
  });

  it('returns failed when the injected runner throws', async () => {
    const result = await previewSandboxedCodingInjectedProducerRun({
      featureFlags,
      patchSummary: 'Failed patch',
      request: buildRequest(workspaceRoot),
      runner: async () => {
        throw new Error('Injected runner failed.');
      },
      stagingRoot,
    });

    expect(result).toMatchObject({
      status: 'failed',
      reason: 'Injected runner failed.',
    });
    expect(result.steps.at(-1)).toMatchObject({
      kind: 'final',
      status: 'failed',
      title: 'Sandbox producer failed',
      error: 'Injected runner failed.',
    });
  });

  it('returns failed when completed injected output produces an empty diff', async () => {
    await fs.writeFile(path.join(workspaceRoot, 'src', 'notes.md'), 'same\n', 'utf8');
    await fs.writeFile(path.join(stagingRoot, 'src', 'notes.md'), 'same\n', 'utf8');

    const result = await previewSandboxedCodingInjectedProducerRun({
      featureFlags,
      patchSummary: 'Empty patch',
      request: buildRequest(workspaceRoot),
      runner: async () => ({
        sessionSummary: 'empty-diff integration producer completed',
        status: 'completed',
        summary: 'No effective change',
      }),
      stagingRoot,
    });

    expect(result).toMatchObject({
      status: 'failed',
      reason: 'Sandboxed coding staged patch requires at least one changed file.',
    });
    expect(result.steps.at(-1)).toMatchObject({
      kind: 'final',
      status: 'failed',
      title: 'Sandbox producer failed',
    });
  });
});
