import { describe, expect, it, vi } from 'vitest';

import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';
import type { LocalContainerSandboxPatchReviewPreparation } from './local-container-sandbox-backend.js';
import {
  buildSandboxPatchDigest,
  SandboxPatchReviewPersister,
} from './sandbox-patch-review-persister.js';

function buildRunStepRepositoryMock() {
  let stepCount = 0;

  return {
    create: vi.fn().mockImplementation(async (input: {
      runId: string;
      kind: RunStepKind;
      status?: RunStepStatus;
      title: string;
      input?: string | null;
      output?: string | null;
    }) => {
      stepCount += 1;
      return {
        id: `run_step_${stepCount}`,
        status: input.status ?? 'completed',
        ...input,
      };
    }),
  };
}

describe('SandboxPatchReviewPersister', () => {
  it('persists sandbox patch review outputs as steps, patch artifact, and promotion checkpoint', async () => {
    const artifactRecord: ArtifactRecord = {
      id: 'artifact_patch_1',
      taskId: 'task_1',
      sourceType: 'run',
      sourceId: 'run_1',
      kind: 'patch',
      title: 'Reviewable sandbox patch',
      content: '{}',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const artifactRepository = {
      createPatchFromRun: vi.fn().mockResolvedValue(artifactRecord),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const checkpointRecorder = {
      createPatchPromotionCheckpoint: vi.fn().mockResolvedValue({
        checkpointId: 'run_checkpoint_patch_1',
        decisionId: 'decision_patch_1',
        event: {
          type: 'checkpoint.created',
          runId: 'run_1',
          checkpointId: 'run_checkpoint_patch_1',
          checkpointKind: 'patch_promotion',
          reason: 'Sandbox patch promotion 需要确认后才能继续，已创建 Decision：确认提升 sandbox patch。',
          decisionId: 'decision_patch_1',
          tool: null,
        },
        summary: 'Sandbox patch promotion 需要确认后才能继续，已创建 Decision：确认提升 sandbox patch。',
      }),
    };
    const preparation: LocalContainerSandboxPatchReviewPreparation = {
      artifact: {
        commandLogs: [
          {
            outputPreview: 'lint ok',
            script: 'lint',
            status: 'passed',
          },
        ],
        diff: '--- a/notes.md\n+++ b/notes.md',
        files: ['notes.md'],
        kind: 'patch',
        riskSummary: 'Checks: lint: passed. Pending human review before workspace promotion.',
        summary: 'Reviewable sandbox patch',
      },
      audit: {
        acceptedScripts: ['lint'],
        idempotencyKey: 'sandbox-patch-review:sandbox_session:sandbox_session_1:run_1:task_1:lint',
        initiatedBy: 'internal_sandbox_patch_review',
        patchDraftSource: {
          sourceId: 'sandbox_session_1',
          sourceKind: 'sandbox_session',
        },
        reason: 'Review sandbox patch before promotion.',
        rejectedScripts: [],
        requestedScripts: ['lint'],
        workspaceRoot: '/tmp/taskplane-sandbox-workspace',
      },
      checkRun: {
        results: [
          {
            outputPreview: 'lint ok',
            script: 'lint',
            status: 'passed',
          },
        ],
        summary: 'lint: passed',
      },
      checkpoint: {
        consequence: 'Review required',
        kind: 'patch_promotion',
        policySnapshot: {
          descriptorId: 'workspace.staged_patch',
          sessionKind: 'sandbox',
          credentialPolicy: 'none',
          networkPolicy: 'disabled',
          timeoutMs: 120_000,
          outputLimitBytes: 64_000,
        },
        preview: '--- a/notes.md\n+++ b/notes.md',
        reason: 'Review sandbox patch.',
        resumeTarget: 'sandbox_1:promote',
      },
      handle: {
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'sandbox_1',
        providerKind: 'local_container',
        stagingRoot: '/tmp/taskplane-sandbox-1',
        workspaceMode: 'staged_write',
      },
      sessionSummary: 'sandbox=sandbox_1 / provider=local_container / patchArtifacts=supported',
    };

    const persister = new SandboxPatchReviewPersister(
      artifactRepository as never,
      runStepRepository as never,
      checkpointRecorder as never,
    );

    const result = await persister.persist({
      decisionTitle: '确认提升 sandbox patch',
      preparation,
      runId: 'run_1',
      taskId: 'task_1',
    });

    expect(runStepRepository.create).toHaveBeenNthCalledWith(1, {
      runId: 'run_1',
      kind: 'plan',
      status: 'completed',
      title: '准备 sandbox patch review',
      input: preparation.sessionSummary,
      output: 'sandbox=sandbox_1',
    });
    expect(runStepRepository.create).toHaveBeenNthCalledWith(2, {
      runId: 'run_1',
      kind: 'tool_result',
      status: 'completed',
      title: 'sandbox targeted checks',
      input: 'lint',
      output: 'lint: passed',
    });
    expect(artifactRepository.createPatchFromRun).toHaveBeenCalledWith({
      taskId: 'task_1',
      runId: 'run_1',
      title: 'Reviewable sandbox patch',
      content: JSON.stringify({
        artifact: preparation.artifact,
        review: {
          audit: preparation.audit,
          sandboxSessionId: 'sandbox_1',
          sessionSummary: preparation.sessionSummary,
        },
      }, null, 2),
    });
    expect(runStepRepository.create).toHaveBeenNthCalledWith(3, {
      runId: 'run_1',
      kind: 'artifact',
      status: 'completed',
      title: '记录 sandbox patch artifact',
      input: 'notes.md',
      output: 'artifact_patch_1',
    });
    expect(checkpointRecorder.createPatchPromotionCheckpoint).toHaveBeenCalledWith({
      runId: 'run_1',
      taskId: 'task_1',
      artifactId: 'artifact_patch_1',
      artifactSummary: 'Reviewable sandbox patch',
      expectedFiles: ['notes.md'],
      patchDigest: buildSandboxPatchDigest(preparation.artifact.diff),
      sessionId: 'sandbox_1',
      policySnapshot: preparation.checkpoint.policySnapshot,
      decisionTitle: '确认提升 sandbox patch',
      preview: preparation.artifact.diff,
    });
    expect(result.artifact.id).toBe('artifact_patch_1');
    expect(result.checkpoint?.checkpointId).toBe('run_checkpoint_patch_1');
  });

  it('persists failed sandbox checks without creating a promotion checkpoint', async () => {
    const artifactRepository = {
      createPatchFromRun: vi.fn().mockResolvedValue({
        id: 'artifact_patch_failed',
        taskId: 'task_1',
        sourceType: 'run',
        sourceId: 'run_1',
        kind: 'patch',
        title: 'Patch with failed checks',
        content: '{}',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      } satisfies ArtifactRecord),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const checkpointRecorder = {
      createPatchPromotionCheckpoint: vi.fn(),
    };
    const preparation: LocalContainerSandboxPatchReviewPreparation = {
      artifact: {
        commandLogs: [
          {
            outputPreview: 'test failed',
            script: 'test',
            status: 'failed',
          },
        ],
        diff: '--- a/notes.md\n+++ b/notes.md',
        files: ['notes.md'],
        kind: 'patch',
        riskSummary: 'Checks: test: failed. Pending human review before workspace promotion.',
        summary: 'Patch with failed checks',
      },
      audit: null,
      checkRun: {
        results: [
          {
            outputPreview: 'test failed',
            script: 'test',
            status: 'failed',
          },
        ],
        summary: 'test: failed',
      },
      checkpoint: {
        consequence: 'Review required',
        kind: 'patch_promotion',
        policySnapshot: {
          descriptorId: 'workspace.staged_patch',
          sessionKind: 'sandbox',
          credentialPolicy: 'none',
          networkPolicy: 'disabled',
          timeoutMs: 120_000,
          outputLimitBytes: 64_000,
        },
        preview: '--- a/notes.md\n+++ b/notes.md',
        reason: 'Review sandbox patch.',
        resumeTarget: 'sandbox_1:promote',
      },
      handle: {
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'sandbox_1',
        providerKind: 'local_container',
        stagingRoot: '/tmp/taskplane-sandbox-1',
        workspaceMode: 'staged_write',
      },
      sessionSummary: 'sandbox=sandbox_1 / provider=local_container / patchArtifacts=supported',
    };

    const persister = new SandboxPatchReviewPersister(
      artifactRepository as never,
      runStepRepository as never,
      checkpointRecorder as never,
    );

    const result = await persister.persist({
      preparation,
      runId: 'run_1',
      taskId: 'task_1',
    });

    expect(runStepRepository.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      kind: 'tool_result',
      status: 'failed',
      output: 'test: failed',
    }));
    expect(checkpointRecorder.createPatchPromotionCheckpoint).not.toHaveBeenCalled();
    expect(result.checkpoint).toBeNull();
  });
});
