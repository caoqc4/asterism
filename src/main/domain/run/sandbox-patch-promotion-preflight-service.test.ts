import { describe, expect, it, vi } from 'vitest';

import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { RunCheckpointRecord } from '../../../shared/types/run.js';
import { createPatchPromotionCheckpointPayload } from '../../../shared/types/run-checkpoint-payload.js';
import type { SandboxPatchPromotionRecord } from '../../../shared/types/sandbox-patch-promotion.js';
import {
  buildSandboxPatchDigest,
  buildSandboxPatchReviewArtifactContent,
} from './sandbox-patch-review-persister.js';
import { SandboxPatchPromotionPreflightService } from './sandbox-patch-promotion-preflight-service.js';

const patchDiff = '--- a/notes.md\n+++ b/notes.md';
const patchDigest = buildSandboxPatchDigest(patchDiff);

function buildPromotion(partial: Partial<SandboxPatchPromotionRecord> = {}): SandboxPatchPromotionRecord {
  return {
    id: partial.id ?? 'sandbox_patch_promotion_1',
    checkpointId: partial.checkpointId ?? 'run_checkpoint_1',
    runId: partial.runId ?? 'run_1',
    taskId: partial.taskId ?? 'task_1',
    artifactId: partial.artifactId ?? 'artifact_1',
    sourceId: partial.sourceId ?? 'sandbox_source_1',
    decisionId: partial.decisionId ?? 'decision_1',
    patchDigest: partial.patchDigest ?? patchDigest,
    expectedFiles: partial.expectedFiles ?? ['notes.md'],
    status: partial.status ?? 'pending',
    auditSummary: partial.auditSummary ?? null,
    blockedReasons: partial.blockedReasons ?? [],
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    appliedAt: partial.appliedAt ?? null,
  };
}

function buildCheckpoint(partial: Partial<RunCheckpointRecord> = {}): RunCheckpointRecord {
  return {
    id: partial.id ?? 'run_checkpoint_1',
    runId: partial.runId ?? 'run_1',
    stepId: partial.stepId ?? 'run_step_1',
    kind: partial.kind ?? 'patch_promotion',
    status: partial.status ?? 'open',
    payload: partial.payload ?? JSON.stringify(createPatchPromotionCheckpointPayload({
      artifactId: 'artifact_1',
      artifactSummary: 'Reviewable sandbox patch',
      sessionId: 'sandbox_source_1',
      descriptorId: 'workspace.staged_patch',
      decisionId: 'decision_1',
      decisionTitle: '确认提升 sandbox patch',
      expectedFiles: ['notes.md'],
      patchDigest,
      policySnapshot: {
        descriptorId: 'workspace.staged_patch',
        sessionKind: 'sandbox',
        credentialPolicy: 'none',
        networkPolicy: 'disabled',
        timeoutMs: 120_000,
        outputLimitBytes: 64_000,
      },
      preview: patchDiff,
    })),
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    resolvedAt: partial.resolvedAt ?? null,
  };
}

function buildArtifact(partial: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: partial.id ?? 'artifact_1',
    taskId: partial.taskId ?? 'task_1',
    sourceType: partial.sourceType ?? 'run',
    sourceId: partial.sourceId ?? 'run_1',
    kind: partial.kind ?? 'patch',
    title: partial.title ?? 'Reviewable sandbox patch',
    content: partial.content ?? JSON.stringify(buildSandboxPatchReviewArtifactContent({
      artifact: {
        commandLogs: [],
        diff: patchDiff,
        files: ['notes.md'],
        kind: 'patch',
        riskSummary: 'Pending review.',
        summary: 'Reviewable sandbox patch',
      },
      audit: null,
      checkRun: {
        results: [],
        summary: 'No checks.',
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
        preview: patchDiff,
        reason: 'Review sandbox patch.',
        resumeTarget: 'sandbox_source_1:promote',
      },
      handle: {
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'sandbox_source_1',
        providerKind: 'local_container',
        stagingRoot: '/tmp/taskplane-sandbox',
        workspaceMode: 'staged_write',
      },
      sessionSummary: 'sandbox=sandbox_source_1',
    })),
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildService(params: {
  artifact?: ArtifactRecord | null;
  checkpoint?: RunCheckpointRecord | null;
  promotion?: SandboxPatchPromotionRecord | null;
} = {}): SandboxPatchPromotionPreflightService {
  return new SandboxPatchPromotionPreflightService(
    {
      findByCheckpointId: vi.fn().mockResolvedValue(
        'promotion' in params ? params.promotion : buildPromotion(),
      ),
    },
    {
      findById: vi.fn().mockResolvedValue(
        'checkpoint' in params ? params.checkpoint : buildCheckpoint(),
      ),
    },
    {
      findById: vi.fn().mockResolvedValue(
        'artifact' in params ? params.artifact : buildArtifact(),
      ),
    },
  );
}

describe('SandboxPatchPromotionPreflightService', () => {
  it('returns ready when promotion, checkpoint, and artifact agree', async () => {
    const service = buildService();

    const result = await service.preflight('run_checkpoint_1');

    expect(result).toMatchObject({
      status: 'ready',
      summary: 'Sandbox patch promotion preflight: ready / checkpoint=run_checkpoint_1 / source=sandbox_source_1 / files=notes.md / no workspace files written',
    });
  });

  it('blocks when no durable promotion record exists', async () => {
    const service = buildService({ promotion: null });

    const result = await service.preflight('run_checkpoint_1');

    expect(result).toMatchObject({
      blockedReasons: ['No pending sandbox patch promotion record exists for this checkpoint.'],
      status: 'blocked',
    });
  });

  it('reports already applied records without reading workspace files', async () => {
    const service = buildService({
      promotion: buildPromotion({
        appliedAt: '2026-01-01T00:01:00.000Z',
        status: 'applied',
      }),
    });

    const result = await service.preflight('run_checkpoint_1');

    expect(result).toMatchObject({
      status: 'already_applied',
      summary: 'Sandbox patch promotion preflight: already_applied / checkpoint=run_checkpoint_1',
    });
  });

  it('blocks when checkpoint readiness or artifact digest diverges', async () => {
    const service = buildService({
      artifact: buildArtifact({
        content: JSON.stringify(buildSandboxPatchReviewArtifactContent({
          artifact: {
            commandLogs: [],
            diff: '--- a/other.md\n+++ b/other.md',
            files: ['notes.md'],
            kind: 'patch',
            riskSummary: 'Pending review.',
            summary: 'Reviewable sandbox patch',
          },
          audit: null,
          checkRun: {
            results: [],
            summary: 'No checks.',
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
            preview: patchDiff,
            reason: 'Review sandbox patch.',
            resumeTarget: 'sandbox_source_1:promote',
          },
          handle: {
            createdAt: '2026-01-01T00:00:00.000Z',
            id: 'sandbox_source_1',
            providerKind: 'local_container',
            stagingRoot: '/tmp/taskplane-sandbox',
            workspaceMode: 'staged_write',
          },
          sessionSummary: 'sandbox=sandbox_source_1',
        })),
      }),
      checkpoint: buildCheckpoint({
        payload: JSON.stringify(createPatchPromotionCheckpointPayload({
          artifactId: 'artifact_1',
          artifactSummary: 'Reviewable sandbox patch',
          sessionId: 'sandbox_source_1',
          descriptorId: 'workspace.staged_patch',
          decisionId: 'decision_1',
          decisionTitle: '确认提升 sandbox patch',
          expectedFiles: ['other.md'],
          patchDigest,
          policySnapshot: {
            descriptorId: 'workspace.staged_patch',
            sessionKind: 'sandbox',
            credentialPolicy: 'none',
            networkPolicy: 'disabled',
            timeoutMs: 120_000,
            outputLimitBytes: 64_000,
          },
        })),
      }),
    });

    const result = await service.preflight('run_checkpoint_1');

    expect(result).toMatchObject({
      blockedReasons: [
        'Patch promotion expected files do not match checkpoint payload.',
        'Patch promotion artifact digest does not match promotion record.',
      ],
      status: 'blocked',
    });
  });
});
