import {
  BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
  mapBrowserControlledInteractionStepToRunSteps,
  type BrowserControlledInteractionRequestValidation,
  type BrowserControlledInteractionStepDraft,
} from '@shared/types/browser-controlled-interaction';

export type BrowserControlledInteractionReviewStatus = 'ready' | 'checkpoint_required' | 'blocked';

export type BrowserControlledInteractionReview = {
  actionSummary: string | null;
  blockedReasons: string[];
  descriptorId: typeof BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID;
  nextMove: string;
  policySummary: string;
  runStepTitles: string[];
  status: BrowserControlledInteractionReviewStatus;
  summary: string;
};

export function buildBrowserControlledInteractionReview(
  validation: BrowserControlledInteractionRequestValidation,
): BrowserControlledInteractionReview {
  if (!validation.valid) {
    return {
      actionSummary: null,
      blockedReasons: validation.blockedReasons,
      descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
      nextMove: 'next=fix request or policy before any browser runtime can start',
      policySummary: 'modelExposure=hidden / browserStart=no / scheduler=no / providerCall=no',
      runStepTitles: [],
      status: 'blocked',
      summary: `Browser controlled interaction blocked: ${validation.blockedReasons.join(' ')}`,
    };
  }

  const step = validation.step;
  const status: BrowserControlledInteractionReviewStatus = step.checkpointRequired
    ? 'checkpoint_required'
    : 'ready';

  return {
    actionSummary: formatBrowserControlledActionSummary(step),
    blockedReasons: [],
    descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
    nextMove: step.checkpointRequired
      ? 'next=create Decision checkpoint before browser action execution'
      : 'next=eligible for local QA dry-run review; browser runtime still disabled',
    policySummary: [
      'modelExposure=hidden',
      'browserStart=no',
      'scheduler=no',
      'providerCall=no',
      `evidence=${step.artifactKinds.join(',') || 'none'}`,
    ].join(' / '),
    runStepTitles: mapBrowserControlledInteractionStepToRunSteps(step).map((item) => item.title),
    status,
    summary: step.checkpointRequired
      ? `Browser controlled interaction requires checkpoint: ${step.summary}`
      : `Browser controlled interaction ready for dry-run review: ${step.summary}`,
  };
}

export function formatBrowserControlledActionSummary(step: BrowserControlledInteractionStepDraft): string {
  return [
    `action=${step.action.action}`,
    step.currentUrl ? `url=${step.currentUrl}` : null,
    step.action.targetRef ? `targetRef=${step.action.targetRef}` : null,
    step.action.targetLabel ? `targetLabel=${step.action.targetLabel}` : null,
    step.action.value ? `value=${step.action.value}` : null,
    `checkpoint=${step.checkpointRequired ? 'required' : 'no'}`,
    `sideEffect=${step.sideEffectClassification}`,
  ].filter(Boolean).join(' / ');
}
