import type {
  PriorityAttentionProjection,
  PriorityRecommendationCandidate,
} from './priority-recommendation-ranking.js';

export type BriefAttentionLane =
  | 'unblock_or_decide'
  | 'continue_next_step'
  | 'review_evidence'
  | 'external_signal'
  | 'recent_outcome';

export type BriefAttentionItem<T extends PriorityRecommendationCandidate = PriorityRecommendationCandidate> = {
  candidate: T;
  lane: BriefAttentionLane;
  reason: string;
};

export type BriefAttentionSummary<T extends PriorityRecommendationCandidate = PriorityRecommendationCandidate> = {
  items: BriefAttentionItem<T>[];
  totalCount: number;
  displayedCount: number;
  displayLimit: number | null;
  truncated: boolean;
  summary: string;
};

export function projectBriefAttention<T extends PriorityRecommendationCandidate>(
  projection: PriorityAttentionProjection<T>,
): BriefAttentionSummary<T> {
  const items = projection.items.map((candidate) => ({
    candidate,
    lane: briefAttentionLaneForCandidate(candidate),
    reason: briefAttentionReasonForCandidate(candidate),
  }));

  return {
    items,
    totalCount: projection.totalCount,
    displayedCount: projection.displayedCount,
    displayLimit: projection.displayLimit,
    truncated: projection.truncated,
    summary: projection.truncated
      ? `Brief shows ${projection.displayedCount} of ${projection.totalCount} attention items; Tasks owns the full queue.`
      : `Brief shows ${projection.displayedCount} attention items using the shared priority order.`,
  };
}

export function briefAttentionLaneForCandidate(candidate: PriorityRecommendationCandidate): BriefAttentionLane {
  if (
    candidate.lane === 'unblock_or_decide'
    || candidate.lane === 'escalate_now'
    || candidate.id.startsWith('decision:')
    || candidate.id.startsWith('risk:')
    || candidate.id.startsWith('blocker:')
    || candidate.id.startsWith('task-dependency:')
    || candidate.id.startsWith('source-context:blocker:')
  ) {
    return 'unblock_or_decide';
  }

  if (candidate.id.startsWith('artifact:') || candidate.id.startsWith('source-context:')) {
    return 'review_evidence';
  }

  if (candidate.id.startsWith('external-signal:')) {
    return 'external_signal';
  }

  if (candidate.id.startsWith('completion-ready:') || candidate.id.startsWith('near-completion:')) {
    return 'recent_outcome';
  }

  return 'continue_next_step';
}

export function briefAttentionReasonForCandidate(candidate: PriorityRecommendationCandidate): string {
  const lane = briefAttentionLaneForCandidate(candidate);
  if (lane === 'unblock_or_decide') return 'Needs a decision, unblock, risk review, or dependency check before work can continue.';
  if (lane === 'review_evidence') return 'New or important evidence may change the next action.';
  if (lane === 'external_signal') return 'External signal needs review before it affects task context.';
  if (lane === 'recent_outcome') return 'Recent completion or near-completion state deserves a short review.';
  return 'Shared priority order says this is the next actionable task.';
}
