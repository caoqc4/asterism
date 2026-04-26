import { describe, expect, it } from 'vitest';

import type { RunCheckpointRecord } from '../../../shared/types/run.js';
import { evaluateSandboxPatchPromotionReadiness } from './sandbox-patch-promotion-readiness.js';

function buildCheckpoint(partial: Partial<RunCheckpointRecord> = {}): RunCheckpointRecord {
  return {
    id: partial.id ?? 'run_checkpoint_1',
    runId: partial.runId ?? 'run_1',
    stepId: partial.stepId ?? null,
    kind: partial.kind ?? 'patch_promotion',
    status: partial.status ?? 'open',
    payload: partial.payload ?? JSON.stringify({
      version: 1,
      kind: 'patch_promotion',
      artifactId: 'artifact_1',
      artifactSummary: 'Reviewable sandbox patch',
      sessionId: 'sandbox_session_1',
      descriptorId: 'workspace.staged_patch',
      decisionId: 'decision_1',
      decisionTitle: '确认提升 sandbox patch',
      policySnapshot: {
        descriptorId: 'workspace.staged_patch',
      },
    }),
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    resolvedAt: partial.resolvedAt ?? null,
  };
}

describe('evaluateSandboxPatchPromotionReadiness', () => {
  it('reports current review-only checkpoint payloads as missing apply metadata', () => {
    const readiness = evaluateSandboxPatchPromotionReadiness(buildCheckpoint());

    expect(readiness).toMatchObject({
      artifactId: 'artifact_1',
      blockedReasons: [
        'Patch promotion apply metadata is missing: expectedFiles.',
        'Patch promotion apply metadata is missing: patchDigest.',
      ],
      checkpointId: 'run_checkpoint_1',
      decisionId: 'decision_1',
      expectedFiles: [],
      patchDigest: null,
      sourceId: 'sandbox_session_1',
      status: 'missing_apply_metadata',
    });
    expect(readiness.summary).toContain('Sandbox patch promotion readiness: missing_apply_metadata');
  });

  it('reports ready when required apply metadata is present and safe', () => {
    const readiness = evaluateSandboxPatchPromotionReadiness(buildCheckpoint({
      payload: JSON.stringify({
        version: 1,
        kind: 'patch_promotion',
        artifactId: 'artifact_1',
        artifactSummary: 'Reviewable sandbox patch',
        sourceId: 'sandbox_source_1',
        descriptorId: 'workspace.staged_patch',
        decisionId: 'decision_1',
        decisionTitle: '确认提升 sandbox patch',
        expectedFiles: ['src/app.ts', 'docs/notes.md', 'src/app.ts'],
        patchDigest: 'sha256:abc123',
        policySnapshot: {
          descriptorId: 'workspace.staged_patch',
        },
      }),
    }));

    expect(readiness).toMatchObject({
      blockedReasons: [],
      expectedFiles: ['src/app.ts', 'docs/notes.md'],
      patchDigest: 'sha256:abc123',
      sourceId: 'sandbox_source_1',
      status: 'ready',
    });
    expect(readiness.summary).toBe(
      'Sandbox patch promotion readiness: ready / files=src/app.ts, docs/notes.md / workspace apply still requires the promotion service',
    );
  });

  it('blocks unsafe expected files before promotion can be ready', () => {
    const readiness = evaluateSandboxPatchPromotionReadiness(buildCheckpoint({
      payload: JSON.stringify({
        version: 1,
        kind: 'patch_promotion',
        artifactId: 'artifact_1',
        sessionId: 'sandbox_session_1',
        descriptorId: 'workspace.staged_patch',
        decisionId: 'decision_1',
        expectedFiles: ['../secrets.txt', 'src/app.ts'],
        patchDigest: 'sha256:abc123',
        policySnapshot: {
          descriptorId: 'workspace.staged_patch',
        },
      }),
    }));

    expect(readiness).toMatchObject({
      blockedReasons: ['Patch promotion expected files are unsafe: ../secrets.txt'],
      status: 'blocked',
    });
  });

  it('blocks invalid checkpoint shape and descriptor mismatches', () => {
    const readiness = evaluateSandboxPatchPromotionReadiness(buildCheckpoint({
      payload: JSON.stringify({
        version: 1,
        kind: 'tool_permission',
        artifactId: 'artifact_1',
        sessionId: 'sandbox_session_1',
        descriptorId: 'workspace.write_patch',
        decisionId: 'decision_1',
        expectedFiles: ['src/app.ts'],
        patchDigest: 'sha256:abc123',
        policySnapshot: {
          descriptorId: 'workspace.write_patch',
        },
      }),
    }));

    expect(readiness.status).toBe('blocked');
    expect(readiness.blockedReasons).toEqual([
      'Patch promotion payload kind is not patch_promotion.',
      'Patch promotion descriptor must be workspace.staged_patch.',
      'Patch promotion policy snapshot must target workspace.staged_patch.',
    ]);
  });

  it('reports non-open checkpoints as already resolved', () => {
    const readiness = evaluateSandboxPatchPromotionReadiness(buildCheckpoint({
      status: 'resolved',
    }));

    expect(readiness).toMatchObject({
      blockedReasons: ['Patch promotion checkpoint is not open.'],
      status: 'already_resolved',
      summary: 'Sandbox patch promotion readiness: already_resolved / checkpoint is no longer open',
    });
  });
});
