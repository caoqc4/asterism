import { describe, expect, it } from 'vitest';

import {
  buildStagedPatchEvidenceChecklist,
  formatStagedPatchEvidenceStatusLabel,
  formatStagedPatchReviewNextMove,
  type StagedPatchReviewSummary,
} from './stagedPatchReview';

function buildReview(overrides: Partial<StagedPatchReviewSummary> = {}): StagedPatchReviewSummary {
  return {
    artifactSummary: null,
    checks: [],
    decisionId: null,
    decisionTitle: null,
    files: [],
    patchPreview: null,
    promotionStatus: null,
    readinessSummary: null,
    readinessStatus: null,
    sourceId: null,
    workspaceStatus: 'workspace unchanged until Decision approval',
    ...overrides,
  };
}

describe('staged patch review helpers', () => {
  it('builds checklist evidence for ready source, passed checks, open Decision, and unchanged workspace', () => {
    const checklist = buildStagedPatchEvidenceChecklist(buildReview({
      checks: ['lint passed'],
      decisionId: 'decision_1',
      decisionTitle: '确认提升 sandbox patch',
      files: ['src/notes.md'],
      promotionStatus: 'open',
      sourceId: 'sandbox_source_1',
    }));

    expect(checklist).toEqual([
      {
        label: 'Source evidence',
        status: 'ready',
        summary: 'source=sandbox_source_1; files=src/notes.md',
      },
      {
        label: 'Targeted checks',
        status: 'ready',
        summary: 'passed=lint passed',
      },
      {
        label: 'Promotion Decision',
        status: 'pending',
        summary: 'open; 确认提升 sandbox patch',
      },
      {
        label: 'Workspace mutation',
        status: 'pending',
        summary: 'workspace unchanged until Decision approval',
      },
    ]);
    expect(formatStagedPatchReviewNextMove(buildReview({
      decisionId: 'decision_1',
      promotionStatus: 'open',
    }))).toBe('next=open promotion Decision; workspace remains unchanged until approval');
  });

  it('prioritizes failed check review before rerun', () => {
    const review = buildReview({
      checks: ['lint failed'],
      files: ['src/notes.md'],
      sourceId: 'sandbox_source_failed',
    });

    expect(buildStagedPatchEvidenceChecklist(review)[1]).toEqual({
      label: 'Targeted checks',
      status: 'blocked',
      summary: 'failed=lint failed',
    });
    expect(formatStagedPatchReviewNextMove(review)).toBe(
      'next=review failed check evidence before rerun: lint failed',
    );
  });

  it('routes applied and deferred workspaces to the correct next move', () => {
    expect(formatStagedPatchReviewNextMove(buildReview({
      decisionId: 'decision_1',
      promotionStatus: 'resolved',
      workspaceStatus: 'workspace promotion applied after Decision approval',
    }))).toBe('next=return to task and verify completion criteria against promoted workspace changes');

    expect(formatStagedPatchReviewNextMove(buildReview({
      decisionId: 'decision_1',
      promotionStatus: 'resolved',
      workspaceStatus: 'Decision resolved in preflight-only mode; workspace files were not written',
    }))).toBe('next=return to task and prepare rerun or explicit apply validation');
  });

  it('formats evidence status labels', () => {
    expect(formatStagedPatchEvidenceStatusLabel('ready')).toBe('ready');
    expect(formatStagedPatchEvidenceStatusLabel('blocked')).toBe('blocked');
    expect(formatStagedPatchEvidenceStatusLabel('pending')).toBe('pending');
  });
});
