import { describe, expect, it } from 'vitest';

import type { ArtifactRecord } from '@shared/types/artifact';
import {
  buildBrowserEvidenceReviewSummary,
  formatBrowserEvidenceReviewMeta,
  formatBrowserEvidenceReviewNextMove,
} from './browserEvidenceReview';

function buildArtifact(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    content: 'plain evidence fallback',
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'artifact_browser_evidence',
    kind: 'browser_evidence',
    sourceId: 'run_browser_evidence',
    sourceType: 'run',
    taskId: 'task_1',
    title: 'Browser evidence',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('browser evidence review helpers', () => {
  it('builds review summaries from persisted browser evidence artifacts', () => {
    const review = buildBrowserEvidenceReviewSummary({
      artifacts: [
        buildArtifact({
          content: JSON.stringify({
            artifacts: [
              { kind: 'page_summary', summary: 'Title: Smoke', title: 'Page summary' },
              { kind: 'visible_text', summary: 'Visible text captured.', title: 'Visible text' },
              {
                kind: 'screenshot',
                path: '/tmp/browser-evidence-screenshot.png',
                summary: 'Screenshot captured.',
                title: 'Screenshot',
              },
            ],
            request: {
              url: 'http://127.0.0.1:4173/browser-evidence-smoke.html',
            },
            result: {
              summary: 'Browser evidence captured / artifacts=page_summary,visible_text,screenshot / credentials=no / mutation=no',
            },
          }),
        }),
      ],
    });

    expect(review).toMatchObject({
      artifactId: 'artifact_browser_evidence',
      artifactTitle: 'Browser evidence',
      evidenceKinds: ['page_summary', 'visible_text', 'screenshot'],
      screenshotPath: '/tmp/browser-evidence-screenshot.png',
      summary: 'Browser evidence captured / artifacts=page_summary,visible_text,screenshot / credentials=no / mutation=no',
      url: 'http://127.0.0.1:4173/browser-evidence-smoke.html',
    });
    expect(formatBrowserEvidenceReviewMeta(review!)).toBe(
      'url=http://127.0.0.1:4173/browser-evidence-smoke.html / artifacts=page_summary, visible_text, screenshot / artifact=artifact_browser_evidence',
    );
    expect(formatBrowserEvidenceReviewNextMove()).toBe(
      'review captured evidence before enabling any controlled browser interaction.',
    );
  });

  it('falls back to artifact content when browser evidence payload is not structured', () => {
    const review = buildBrowserEvidenceReviewSummary({
      artifacts: [
        buildArtifact({
          content: 'Browser evidence captured without structured payload',
        }),
      ],
    });

    expect(review).toMatchObject({
      evidenceKinds: [],
      screenshotPath: null,
      summary: 'Browser evidence captured without structured payload',
      url: null,
    });
    expect(formatBrowserEvidenceReviewMeta(review!)).toBe('artifact=artifact_browser_evidence');
  });

  it('ignores runs without browser evidence artifacts', () => {
    expect(buildBrowserEvidenceReviewSummary({ artifacts: [] })).toBeNull();
    expect(buildBrowserEvidenceReviewSummary(null)).toBeNull();
  });
});
