import { describe, expect, it, vi } from 'vitest';

import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { RunCheckpointRecord, RunRecord, RunStepRecord } from '../../../shared/types/run.js';
import { PatchArtifactSandboxReviewRunService } from './patch-artifact-sandbox-review-run-service.js';

const now = '2026-01-01T00:00:00.000Z';

function buildPatchArtifact(partial: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: partial.id ?? 'artifact_patch_1',
    taskId: partial.taskId ?? 'task_1',
    sourceType: partial.sourceType ?? 'run',
    sourceId: partial.sourceId ?? 'run_agent_cli_1',
    kind: partial.kind ?? 'patch',
    title: partial.title ?? 'review.patch',
    content: partial.content ?? JSON.stringify({
      diff: [
        '--- a/notes.md',
        '+++ b/notes.md',
        '@@ -1 +1 @@',
        '-old',
        '+new',
      ].join('\n'),
      files: ['notes.md'],
      summary: 'Review patch artifact.',
    }),
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function buildRun(partial: Partial<RunRecord> = {}): RunRecord {
  return {
    id: partial.id ?? 'run_review_1',
    taskId: partial.taskId ?? 'task_1',
    type: partial.type ?? 'agent',
    status: partial.status ?? 'running',
    instructions: partial.instructions ?? 'Run sandbox review.',
    output: partial.output ?? null,
    outputSource: partial.outputSource ?? null,
    failureReason: partial.failureReason ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

function buildService(options: {
  artifact?: ArtifactRecord | null;
  enableSandboxCodingAgent?: boolean;
  runnerExitCode?: number;
} = {}) {
  let stepIndex = 0;
  const run = buildRun();
  const reviewedArtifact = buildPatchArtifact({
    id: 'artifact_patch_reviewed_1',
    sourceId: run.id,
    title: 'Review patch artifact.',
  });
  const artifactRepository = {
    createPatchFromRun: vi.fn().mockResolvedValue(reviewedArtifact),
    findById: vi.fn().mockResolvedValue(options.artifact ?? buildPatchArtifact()),
  };
  const aiConfigService = {
    getStatus: vi.fn().mockResolvedValue({
      configured: true,
      apiKeyStored: true,
      apiKeySource: 'keychain',
      provider: 'openai-compatible',
      model: 'relay-model',
      baseUrl: null,
      workspaceRoot: '/tmp/taskplane-workspace',
      updatedAt: now,
      configPath: '/tmp/config.json',
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: options.enableSandboxCodingAgent ?? true,
      },
    }),
  };
  const runRepository = {
    create: vi.fn().mockResolvedValue(run),
    updateResult: vi.fn().mockImplementation(async (
      runId: string,
      status: RunRecord['status'],
      output: string | null,
      outputSource: RunRecord['outputSource'],
      failureReason: string | null = null,
    ) => ({
      ...run,
      failureReason,
      id: runId,
      output,
      outputSource,
      status,
    })),
  };
  const runStepRepository = {
    create: vi.fn().mockImplementation(async (input: Partial<RunStepRecord>) => {
      stepIndex += 1;
      return {
        createdAt: now,
        error: null,
        id: `run_step_${stepIndex}`,
        index: stepIndex,
        input: input.input ?? null,
        kind: input.kind ?? 'plan',
        output: input.output ?? null,
        runId: input.runId ?? run.id,
        status: input.status ?? 'completed',
        title: input.title ?? 'step',
        updatedAt: now,
      } satisfies RunStepRecord;
    }),
  };
  const runCheckpointRepository = {
    create: vi.fn().mockImplementation(async (input: Partial<RunCheckpointRecord>) => ({
      createdAt: now,
      id: 'run_checkpoint_patch_1',
      kind: input.kind ?? 'patch_promotion',
      payload: input.payload ?? null,
      resolvedAt: null,
      runId: input.runId ?? run.id,
      status: 'open',
      stepId: input.stepId ?? null,
    })),
    updatePayload: vi.fn().mockImplementation(async (
      _id: string,
      payload: string | null,
    ) => ({
      createdAt: now,
      id: 'run_checkpoint_patch_1',
      kind: 'patch_promotion',
      payload,
      resolvedAt: null,
      runId: run.id,
      status: 'open',
      stepId: 'run_step_4',
    })),
  };
  const decisionRepository = {
    create: vi.fn().mockResolvedValue({
      id: 'decision_patch_1',
      title: '确认提升 patch artifact：review.patch',
    }),
  };
  const sandboxPatchPromotionRepository = {
    createPending: vi.fn().mockResolvedValue({
      id: 'sandbox_patch_promotion_1',
    }),
  };
  const runner = vi.fn().mockResolvedValue({
    exitCode: options.runnerExitCode ?? 0,
    stderr: '',
    stdout: 'test ok',
  });
  const service = new PatchArtifactSandboxReviewRunService(
    artifactRepository as never,
    aiConfigService as never,
    runRepository as never,
    runStepRepository as never,
    runCheckpointRepository as never,
    decisionRepository as never,
    sandboxPatchPromotionRepository as never,
    undefined,
    () => runner,
  );

  return {
    artifactRepository,
    decisionRepository,
    runRepository,
    runner,
    sandboxPatchPromotionRepository,
    service,
  };
}

describe('PatchArtifactSandboxReviewRunService', () => {
  it('runs sandbox review from a confirmed patch artifact and creates a promotion Decision without writing workspace files', async () => {
    const {
      artifactRepository,
      decisionRepository,
      runRepository,
      runner,
      sandboxPatchPromotionRepository,
      service,
    } = buildService();

    const result = await service.run({
      artifactId: 'artifact_patch_1',
      operatorConfirmed: true,
      requestedChecks: ['test'],
    });

    expect(result).toMatchObject({
      artifactId: 'artifact_patch_1',
      checkpointId: 'run_checkpoint_patch_1',
      decisionId: 'decision_patch_1',
      noWorkspaceFilesWritten: true,
      reviewedArtifactId: 'artifact_patch_reviewed_1',
      status: 'completed',
    });
    expect(runRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_1',
      type: 'agent',
    }));
    expect(runner).toHaveBeenCalledTimes(1);
    expect(artifactRepository.createPatchFromRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_review_1',
      taskId: 'task_1',
    }));
    expect(decisionRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      sourceLabel: 'workspace.staged_patch',
      sourceType: 'agent_checkpoint',
      taskId: 'task_1',
    }));
    expect(sandboxPatchPromotionRepository.createPending).toHaveBeenCalledWith(expect.objectContaining({
      artifactId: 'artifact_patch_reviewed_1',
      decisionId: 'decision_patch_1',
      runId: 'run_review_1',
      taskId: 'task_1',
    }));
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_review_1',
      'completed',
      expect.stringContaining('no workspace files written'),
      'system',
    );
  });

  it('records a blocked review run when sandbox review is disabled', async () => {
    const { artifactRepository, runRepository, runner, service } = buildService({
      enableSandboxCodingAgent: false,
    });

    const result = await service.run({
      artifactId: 'artifact_patch_1',
      operatorConfirmed: true,
      requestedChecks: ['test'],
    });

    expect(result).toMatchObject({
      artifactId: 'artifact_patch_1',
      noWorkspaceFilesWritten: true,
      status: 'blocked',
    });
    expect(String(result.summary)).toContain('disabled');
    expect(runner).not.toHaveBeenCalled();
    expect(artifactRepository.createPatchFromRun).not.toHaveBeenCalled();
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_review_1',
      'failed',
      expect.stringContaining('disabled'),
      'system',
      expect.stringContaining('disabled'),
    );
  });

  it('requires explicit operator confirmation before starting a sandbox review run', async () => {
    const { runRepository, service } = buildService();

    await expect(service.run({
      artifactId: 'artifact_patch_1',
      operatorConfirmed: false,
      requestedChecks: ['test'],
    })).rejects.toThrow('explicit operator confirmation');
    expect(runRepository.create).not.toHaveBeenCalled();
  });
});
