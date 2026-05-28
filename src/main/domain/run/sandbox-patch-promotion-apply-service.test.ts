import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { RunCheckpointRecord } from '../../../shared/types/run.js';
import type { SandboxPatchPromotionRecord } from '../../../shared/types/sandbox-patch-promotion.js';
import { makeTempDir } from '../../test-utils.js';
import { SandboxPatchPromotionApplyService } from './sandbox-patch-promotion-apply-service.js';

function buildPromotion(partial: Partial<SandboxPatchPromotionRecord> = {}): SandboxPatchPromotionRecord {
  return {
    id: partial.id ?? 'sandbox_patch_promotion_1',
    checkpointId: partial.checkpointId ?? 'run_checkpoint_1',
    runId: partial.runId ?? 'run_1',
    taskId: partial.taskId ?? 'task_1',
    artifactId: partial.artifactId ?? 'artifact_1',
    sourceId: partial.sourceId ?? 'sandbox_source_1',
    decisionId: partial.decisionId ?? 'decision_1',
    patchDigest: partial.patchDigest ?? 'sha256:patch_digest',
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
    payload: partial.payload ?? '{}',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    resolvedAt: partial.resolvedAt ?? null,
  };
}

function buildArtifact(diff: string, partial: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    id: partial.id ?? 'artifact_1',
    taskId: partial.taskId ?? 'task_1',
    sourceType: partial.sourceType ?? 'run',
    sourceId: partial.sourceId ?? 'run_1',
    kind: partial.kind ?? 'patch',
    title: partial.title ?? 'Reviewable sandbox patch',
    content: partial.content ?? JSON.stringify({
      artifact: {
        commandLogs: [],
        diff,
        files: ['notes.md'],
        kind: 'patch',
        riskSummary: 'Pending review.',
        summary: 'Reviewable sandbox patch',
      },
      review: {
        audit: null,
        sandboxSessionId: 'sandbox_source_1',
        sessionSummary: 'sandbox=sandbox_source_1',
      },
    }),
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildService(params: {
  artifact: ArtifactRecord;
  promotion?: SandboxPatchPromotionRecord;
  workspaceRoot: string;
}) {
  const promotion = params.promotion ?? buildPromotion();
  const markApplied = vi.fn().mockImplementation(
    async (_id: string, auditSummary: string) => ({
      ...promotion,
      appliedAt: '2026-01-01T00:01:00.000Z',
      auditSummary,
      status: 'applied',
    }),
  );
  const markBlocked = vi.fn().mockImplementation(
    async (_id: string, blockedReasons: string[], auditSummary: string) => ({
      ...promotion,
      auditSummary,
      blockedReasons,
      status: 'blocked',
    }),
  );
  const service = new SandboxPatchPromotionApplyService(
    {
      preflight: vi.fn().mockResolvedValue({
        artifact: params.artifact,
        checkpoint: buildCheckpoint(),
        promotion,
        status: 'ready',
        summary: 'Sandbox patch promotion preflight: ready',
      }),
    },
    { markApplied, markBlocked },
    () => params.workspaceRoot,
  );

  return { markApplied, markBlocked, service };
}

describe('SandboxPatchPromotionApplyService', () => {
  it('applies a reviewed sandbox patch and marks the promotion applied', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-apply-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'alpha\n');
      const diff = [
        '--- a/notes.md',
        '+++ b/notes.md',
        '@@',
        '-alpha',
        '+beta',
      ].join('\n');
      const { markApplied, service } = buildService({
        artifact: buildArtifact(diff),
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
      });

      expect(result).toMatchObject({
        status: 'applied',
        touchedFiles: ['notes.md'],
      });
      expect(fs.readFileSync(path.join(tempRoot, 'notes.md'), 'utf8')).toBe('beta\n');
      expect(markApplied).toHaveBeenCalledWith(
        'sandbox_patch_promotion_1',
        expect.stringContaining('Sandbox patch promotion applied / checkpoint=run_checkpoint_1 / files=notes.md'),
      );
      expect(markApplied.mock.calls[0]?.[1]).toContain('futureRuntimeRouting=Runtime patch promotion routing readiness');
      expect(markApplied.mock.calls[0]?.[1]).toContain('promotionRequirements=7/8');
      expect(markApplied.mock.calls[0]?.[1]).toContain('explicitOperatorApply=ready');
      expect(markApplied.mock.calls[0]?.[1]).toContain('sameRunEvidenceChain=ready');
      expect(markApplied.mock.calls[0]?.[1]).toContain('postApplyRunEvidence=ready');
      expect(markApplied.mock.calls[0]?.[1]).toContain('promotionMissingRequirements=selected_runtime_contract');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks without partial writes when a workspace base file diverges', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-diverge-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'first.md'), 'alpha\n');
      fs.writeFileSync(path.join(tempRoot, 'second.md'), 'changed\n');
      const diff = [
        '--- a/first.md',
        '+++ b/first.md',
        '@@',
        '-alpha',
        '+beta',
        '--- a/second.md',
        '+++ b/second.md',
        '@@',
        '-gamma',
        '+delta',
      ].join('\n');
      const promotion = buildPromotion({ expectedFiles: ['first.md', 'second.md'] });
      const { markBlocked, service } = buildService({
        artifact: buildArtifact(diff),
        promotion,
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
      });

      expect(result).toMatchObject({
        blockedReasons: ['Patch promotion workspace content does not match reviewed base: second.md'],
        status: 'blocked',
        touchedFiles: [],
      });
      expect(fs.readFileSync(path.join(tempRoot, 'first.md'), 'utf8')).toBe('alpha\n');
      expect(fs.readFileSync(path.join(tempRoot, 'second.md'), 'utf8')).toBe('changed\n');
      expect(markBlocked).toHaveBeenCalledWith(
        'sandbox_patch_promotion_1',
        ['Patch promotion workspace content does not match reviewed base: second.md'],
        'Sandbox patch promotion apply blocked: Patch promotion workspace content does not match reviewed base: second.md',
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('treats already-promoted workspace content as idempotently applied', async () => {
    const tempRoot = makeTempDir('taskplane-sandbox-promotion-idempotent-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'beta\n');
      const diff = [
        '--- a/notes.md',
        '+++ b/notes.md',
        '@@',
        '-alpha',
        '+beta',
      ].join('\n');
      const { markApplied, service } = buildService({
        artifact: buildArtifact(diff),
        workspaceRoot: tempRoot,
      });

      const result = await service.apply('run_checkpoint_1', {
        operatorConfirmed: true,
        operatorId: 'local_operator',
      });

      expect(result).toMatchObject({
        status: 'already_applied',
        touchedFiles: ['notes.md'],
      });
      expect(markApplied).toHaveBeenCalledWith(
        'sandbox_patch_promotion_1',
        expect.stringContaining('Sandbox patch promotion already applied / checkpoint=run_checkpoint_1 / files=notes.md'),
      );
      expect(markApplied.mock.calls[0]?.[1]).toContain('futureRuntimeRouting=Runtime patch promotion routing readiness');
      expect(markApplied.mock.calls[0]?.[1]).toContain('promotionRequirements=7/8');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('returns routing readiness evidence when preflight reports an already applied promotion', async () => {
    const promotion = buildPromotion({ status: 'applied' });
    const service = new SandboxPatchPromotionApplyService(
      {
        preflight: vi.fn().mockResolvedValue({
          promotion,
          status: 'already_applied',
          summary: 'Sandbox patch promotion preflight: already_applied / checkpoint=run_checkpoint_1',
        }),
      },
      {
        markApplied: vi.fn(),
        markBlocked: vi.fn(),
      },
      () => '/tmp/unused',
    );

    const result = await service.apply('run_checkpoint_1', {
      operatorConfirmed: true,
      operatorId: 'local_operator',
    });

    expect(result).toMatchObject({
      status: 'already_applied',
      touchedFiles: ['notes.md'],
    });
    expect(result.auditSummary).toContain('Sandbox patch promotion already applied / checkpoint=run_checkpoint_1 / files=notes.md');
    expect(result.auditSummary).toContain('futureRuntimeRouting=Runtime patch promotion routing readiness');
    expect(result.auditSummary).toContain('promotionRequirements=7/8');
    expect(result.auditSummary).toContain('explicitOperatorApply=ready');
    expect(result.auditSummary).toContain('sameRunEvidenceChain=ready');
    expect(result.auditSummary).toContain('postApplyRunEvidence=ready');
    expect(result.auditSummary).toContain('promotionMissingRequirements=selected_runtime_contract');
  });
});
