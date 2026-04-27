import type { ArtifactRecord } from '@shared/types/artifact';
import type { RunDetailRecord } from '@shared/types/run';

export type BrowserEvidenceReviewSummary = {
  artifactId: string;
  artifactTitle: string;
  evidenceKinds: string[];
  screenshotPath: string | null;
  summary: string;
  url: string | null;
};

export function buildBrowserEvidenceReviewSummary(
  detail: Pick<RunDetailRecord, 'artifacts'> | null,
): BrowserEvidenceReviewSummary | null {
  const artifact = detail?.artifacts?.find((item) => item.kind === 'browser_evidence');
  if (!artifact) {
    return null;
  }

  const payload = parseBrowserEvidenceArtifactPayload(artifact);
  const evidenceArtifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : [];
  const evidenceKinds = evidenceArtifacts
    .map((item) => typeof item?.kind === 'string' ? item.kind : null)
    .filter((item): item is string => Boolean(item));
  const screenshotPath = evidenceArtifacts
    .map((item) => typeof item?.path === 'string' && item.kind === 'screenshot' ? item.path : null)
    .find((item): item is string => Boolean(item)) ?? null;

  return {
    artifactId: artifact.id,
    artifactTitle: artifact.title,
    evidenceKinds,
    screenshotPath,
    summary: typeof payload?.result?.summary === 'string'
      ? payload.result.summary
      : artifact.content.slice(0, 240),
    url: typeof payload?.request?.url === 'string' ? payload.request.url : null,
  };
}

export function formatBrowserEvidenceReviewMeta(review: BrowserEvidenceReviewSummary): string {
  return [
    review.url ? `url=${review.url}` : null,
    review.evidenceKinds.length ? `artifacts=${review.evidenceKinds.join(', ')}` : null,
    `artifact=${review.artifactId}`,
  ].filter(Boolean).join(' / ');
}

export function formatBrowserEvidenceReviewNextMove(): string {
  return 'review captured evidence before enabling any controlled browser interaction.';
}

function parseBrowserEvidenceArtifactPayload(artifact: ArtifactRecord): Record<string, any> | null {
  try {
    const parsed = JSON.parse(artifact.content);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
