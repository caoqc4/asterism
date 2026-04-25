import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, setDatabaseUserDataPathForTests } from '../../db/client.js';
import { AgentSessionRepository } from '../../db/repositories/agent-session-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { makeTempDir } from '../../test-utils.js';
import { SandboxedCodingInjectedProducerPreviewService } from './sandboxed-coding-injected-producer-preview-service.js';

const featureFlags = {
  enableScheduler: false,
  enableSandboxCodingAgent: true,
};

describe('SandboxedCodingInjectedProducerPreviewService integration', () => {
  let tempRoot = '';
  let workspaceRoot = '';
  let stagingRoot = '';

  beforeEach(async () => {
    tempRoot = makeTempDir('taskplane-injected-producer-service-');
    workspaceRoot = path.join(tempRoot, 'workspace');
    stagingRoot = path.join(tempRoot, 'staging');
    setDatabaseUserDataPathForTests(path.join(tempRoot, 'db'));
    await fs.mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
    await fs.mkdir(path.join(stagingRoot, 'src'), { recursive: true });
  });

  afterEach(async () => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    await fs.rm(tempRoot, { force: true, recursive: true });
  });

  it('persists a source-ready injected producer preview through real repositories', async () => {
    await fs.writeFile(path.join(workspaceRoot, 'src', 'notes.md'), 'old\n', 'utf8');
    const service = new SandboxedCodingInjectedProducerPreviewService();

    const result = await service.run({
      decisionTitle: '确认提升 injected producer patch',
      featureFlags,
      patchSummary: 'Update notes from service integration',
      request: {
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
        runId: 'run_service_1',
        sourceId: 'sandbox_source_service_1',
        taskId: 'task_service_1',
        workspaceRoot,
      },
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
          sessionSummary: 'service integration producer completed',
          status: 'completed',
          summary: 'Staged src/notes.md',
        };
      },
      stagingRoot,
    });

    const sessions = await new AgentSessionRepository().listForRun('run_service_1');
    const steps = await new RunStepRepository().listForRun('run_service_1');

    expect(result.preview.status).toBe('preview_ready');
    expect(result.persistenceSummary).toBe('producer=preview_ready / session=completed / steps=3');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      mode: 'agent',
      status: 'completed',
    });
    expect(sessions[0]?.metadata).toContain('executor=sandboxed_coding_producer');
    expect(sessions[0]?.metadata).toContain('producerStatus=source_ready');
    expect(steps.map((step) => [step.kind, step.status, step.title])).toEqual([
      ['plan', 'running', 'Sandboxed coding producer started'],
      ['tool_result', 'completed', 'Sandbox producer check passed: lint'],
      ['artifact', 'completed', 'Sandbox producer source ready'],
    ]);
    expect(await fs.readFile(path.join(workspaceRoot, 'src', 'notes.md'), 'utf8')).toBe('old\n');
  });
});
