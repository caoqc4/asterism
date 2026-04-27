import {
  BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
  mapBrowserControlledInteractionStepToRunSteps,
  type BrowserControlledInteractionCheckpointPayloadV1,
  type BrowserControlledInteractionRequestValidation,
  type BrowserControlledInteractionStepDraft,
} from '@shared/types/browser-controlled-interaction';
import type { RunCheckpointRecord, RunDetailRecord, RunStepRecord } from '@shared/types/run';

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

export type BrowserControlledInteractionRunEvidenceItem = {
  label: string;
  status: 'ready' | 'blocked' | 'pending';
  summary: string;
};

export type BrowserControlledInteractionRunReview = {
  actionCount: number;
  blockedCount: number;
  checkpointCount: number;
  evidence: BrowserControlledInteractionRunEvidenceItem[];
  nextMove: string;
  policySummary: string;
  status: 'planned' | 'completed' | 'blocked' | 'checkpoint_required';
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

export function buildBrowserControlledInteractionRunReview(
  detail: Pick<RunDetailRecord, 'checkpoints' | 'output' | 'steps'> | null,
): BrowserControlledInteractionRunReview | null {
  const steps = detail?.steps ?? [];
  const checkpoints = detail?.checkpoints ?? [];
  const controlledSteps = steps.filter(isBrowserControlledStep);
  const controlledCheckpoints = checkpoints
    .map(readBrowserControlledCheckpointPayload)
    .filter((item): item is BrowserControlledInteractionCheckpointPayloadV1 => Boolean(item));

  if (!controlledSteps.length && !controlledCheckpoints.length) {
    return null;
  }

  const planStep = controlledSteps.find((step) => step.title === 'browser controlled dry-run accepted');
  const plannedActionSteps = controlledSteps.filter((step) => step.title.startsWith('Browser action planned:'));
  const blockedSteps = controlledSteps.filter((step) => step.title === 'browser controlled interaction blocked');
  const checkpointSteps = controlledSteps.filter((step) => step.title === 'Browser action requires checkpoint');
  const completed = typeof detail?.output === 'string'
    && detail.output.includes('Browser controlled local QA completed');
  const checkpointCount = Math.max(checkpointSteps.length, controlledCheckpoints.length);
  const status: BrowserControlledInteractionRunReview['status'] = blockedSteps.length
    ? 'blocked'
    : checkpointCount
      ? 'checkpoint_required'
      : completed
        ? 'completed'
        : 'planned';
  const evidence: BrowserControlledInteractionRunEvidenceItem[] = [
    planStep
      ? {
          label: 'Runtime boundary',
          status: 'ready',
          summary: planStep.output ?? 'browserStart=no / networkCall=no / modelExposure=hidden',
        }
      : null,
    plannedActionSteps.length
      ? {
          label: 'Action plan',
          status: status === 'blocked' ? 'blocked' : checkpointCount ? 'pending' : 'ready',
          summary: plannedActionSteps.map((step) => step.title.replace('Browser action planned: ', '')).join(', '),
        }
      : null,
    blockedSteps.length
      ? {
          label: 'Blocked validation',
          status: 'blocked',
          summary: blockedSteps.map((step) => step.error ?? step.output ?? step.title).join(' / '),
        }
      : null,
    checkpointCount
      ? {
          label: 'Checkpoint boundary',
          status: 'pending',
          summary: controlledCheckpoints.length
            ? controlledCheckpoints.map(formatBrowserControlledCheckpointPayloadSummary).join(' / ')
            : checkpointSteps.map((step) => step.output ?? step.title).join(' / '),
        }
      : null,
    completed
      ? {
          label: 'Local QA result',
          status: 'ready',
          summary: detail?.output ?? 'Browser controlled local QA completed',
        }
      : null,
  ].filter((item): item is BrowserControlledInteractionRunEvidenceItem => Boolean(item));

  return {
    actionCount: plannedActionSteps.length,
    blockedCount: blockedSteps.length,
    checkpointCount,
    evidence,
    nextMove: formatBrowserControlledRunNextMove(status),
    policySummary: 'modelExposure=hidden / scheduler=no / providerCall=no / genericPrompt=no',
    status,
    summary: [
      'Browser controlled interaction review',
      `status=${status}`,
      `actions=${plannedActionSteps.length}`,
      `blocked=${blockedSteps.length}`,
      `checkpoints=${checkpointCount}`,
    ].join(' / '),
  };
}

export function formatBrowserControlledRunEvidenceStatusLabel(
  status: BrowserControlledInteractionRunEvidenceItem['status'],
): string {
  return status;
}

function formatBrowserControlledRunNextMove(status: BrowserControlledInteractionRunReview['status']): string {
  if (status === 'blocked') {
    return 'next=fix blocked request or policy before any browser runtime can start';
  }

  if (status === 'checkpoint_required') {
    return 'next=review checkpoint payload; approval does not auto-resume browser actions yet';
  }

  if (status === 'completed') {
    return 'next=review captured local QA evidence before considering product UI exposure';
  }

  return 'next=review dry-run plan before enabling local QA runner';
}

function isBrowserControlledStep(step: RunStepRecord): boolean {
  return step.title === 'browser controlled dry-run accepted'
    || step.title === 'browser controlled interaction blocked'
    || step.title.startsWith('Browser action planned:')
    || step.title.startsWith('Browser action evidence pending:')
    || step.title === 'Browser action requires checkpoint';
}

function readBrowserControlledCheckpointPayload(
  checkpoint: RunCheckpointRecord,
): BrowserControlledInteractionCheckpointPayloadV1 | null {
  if (!checkpoint.payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(checkpoint.payload) as Partial<BrowserControlledInteractionCheckpointPayloadV1>;
    return parsed
      && parsed.kind === 'browser_controlled_interaction'
      && parsed.descriptorId === BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID
      ? parsed as BrowserControlledInteractionCheckpointPayloadV1
      : null;
  } catch {
    return null;
  }
}

function formatBrowserControlledCheckpointPayloadSummary(
  payload: BrowserControlledInteractionCheckpointPayloadV1,
): string {
  return [
    `action=${payload.action.action}`,
    `origin=${payload.origin}`,
    payload.action.targetRef ? `targetRef=${payload.action.targetRef}` : null,
    payload.action.targetLabel ? `targetLabel=${payload.action.targetLabel}` : null,
    payload.screenshotArtifactId ? `screenshot=${payload.screenshotArtifactId}` : null,
    payload.visibleTextSummary ? `visibleText=${payload.visibleTextSummary}` : null,
    'resume=deferred',
  ].filter(Boolean).join(' / ');
}
