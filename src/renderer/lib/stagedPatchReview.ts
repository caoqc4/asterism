export type StagedPatchReviewSummary = {
  artifactSummary: string | null;
  decisionId: string | null;
  checks: string[];
  decisionTitle: string | null;
  files: string[];
  patchPreview: string | null;
  promotionStatus: string | null;
  readinessSummary: string | null;
  readinessStatus: string | null;
  sourceId: string | null;
  workspaceStatus: string;
};

export type StagedPatchEvidenceItem = {
  label: string;
  status: 'ready' | 'blocked' | 'pending';
  summary: string;
};

export function buildStagedPatchEvidenceChecklist(review: StagedPatchReviewSummary): StagedPatchEvidenceItem[] {
  const failedChecks = review.checks.filter((check) => check.includes('failed'));
  const passedChecks = review.checks.filter((check) => check.includes('passed'));
  const workspaceApplied = review.workspaceStatus.includes('applied')
    || review.workspaceStatus.includes('already matched');
  const workspaceUnchanged = review.workspaceStatus.includes('unchanged')
    || review.workspaceStatus.includes('not written')
    || review.workspaceStatus.includes('deferred');

  return [
    {
      label: 'Source evidence',
      status: review.sourceId && review.files.length ? 'ready' : 'blocked',
      summary: review.sourceId && review.files.length
        ? `source=${review.sourceId}; files=${review.files.join(', ')}`
        : 'missing source id or changed-file list',
    },
    {
      label: 'Targeted checks',
      status: failedChecks.length ? 'blocked' : passedChecks.length ? 'ready' : 'pending',
      summary: failedChecks.length
        ? `failed=${failedChecks.join(', ')}`
        : passedChecks.length
          ? `passed=${passedChecks.join(', ')}`
          : 'no check evidence recorded',
    },
    {
      label: 'Promotion Decision',
      status: review.decisionId
        ? review.promotionStatus === 'open' ? 'pending' : 'ready'
        : 'blocked',
      summary: review.decisionId
        ? `${review.promotionStatus ?? 'unknown'}; ${review.decisionTitle ?? review.decisionId}`
        : 'missing promotion Decision link',
    },
    {
      label: 'Workspace mutation',
      status: workspaceApplied ? 'ready' : workspaceUnchanged ? 'pending' : 'blocked',
      summary: review.workspaceStatus,
    },
  ];
}

export function formatStagedPatchEvidenceStatusLabel(status: StagedPatchEvidenceItem['status']): string {
  const labels: Record<StagedPatchEvidenceItem['status'], string> = {
    ready: 'ready',
    blocked: 'blocked',
    pending: 'pending',
  };

  return labels[status];
}

export function isStagedPatchWorkspaceApplied(workspaceStatus: string): boolean {
  return workspaceStatus.includes('applied') || workspaceStatus.includes('already matched');
}

export function formatStagedPatchReviewNextMove(review: StagedPatchReviewSummary): string {
  const failedChecks = review.checks.filter((check) => check.includes('failed'));

  if (failedChecks.length) {
    return `next=review failed check evidence before rerun: ${failedChecks.join(', ')}`;
  }

  if (!review.decisionId) {
    return 'next=inspect checkpoint evidence; promotion Decision link is missing';
  }

  if (review.promotionStatus === 'open') {
    return 'next=open promotion Decision; workspace remains unchanged until approval';
  }

  if (isStagedPatchWorkspaceApplied(review.workspaceStatus)) {
    return 'next=return to task and verify completion criteria against promoted workspace changes';
  }

  if (review.workspaceStatus.includes('not written') || review.workspaceStatus.includes('deferred')) {
    return 'next=return to task and prepare rerun or explicit apply validation';
  }

  return 'next=review Run result and task timeline before deciding whether to rerun';
}
