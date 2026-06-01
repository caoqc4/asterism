import {
  BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
  mapBrowserControlledInteractionStepToRunSteps,
  parseBrowserControlledInteractionCheckpointPayload,
  type BrowserControlledInteractionCheckpointPayloadV1,
  type BrowserControlledInteractionPolicy,
  type BrowserControlledInteractionRequestValidation,
  type BrowserControlledInteractionStepDraft,
  validateBrowserControlledInteractionResume,
} from '@shared/types/browser-controlled-interaction';
import type { DecisionRecord, DecisionStatus } from '@shared/types/decision';
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

export type BrowserControlledInteractionResumeReviewStatus =
  | 'resumeReady'
  | 'blocked'
  | 'stalePayload'
  | 'alreadyConsumed'
  | 'resumed';

export type BrowserControlledInteractionResumeReview = {
  actionSummary: string | null;
  blockedReasons: string[];
  checkpointId: string;
  consequence: string;
  decisionSummary: string;
  evidenceSummary: string;
  nextMove: string;
  policySummary: string;
  status: BrowserControlledInteractionResumeReviewStatus;
  summary: string;
};

export type BrowserControlledInteractionResumeReviewOptions = {
  currentPolicy?: BrowserControlledInteractionPolicy | null;
  decisionStatus?: DecisionStatus | null;
  resumed?: boolean;
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

export function buildBrowserControlledInteractionResumeReview(
  checkpoint: RunCheckpointRecord,
  options: BrowserControlledInteractionResumeReviewOptions = {},
): BrowserControlledInteractionResumeReview {
  const parsed = parseBrowserControlledInteractionCheckpointPayload(checkpoint.payload);
  if (!parsed.valid) {
    return {
      actionSummary: null,
      blockedReasons: parsed.blockedReasons,
      checkpointId: checkpoint.id,
      consequence: 'approval cannot resume because the checkpoint payload is not a valid browser action',
      decisionSummary: 'decision=unusable',
      evidenceSummary: 'reviewEvidence=unavailable',
      nextMove: 'next=create a new browser checkpoint with a valid v1 payload',
      policySummary: 'modelExposure=hidden / scheduler=no / providerCall=no / genericPrompt=no',
      status: 'stalePayload',
      summary: `Browser controlled resume blocked by stale payload: ${parsed.blockedReasons.join(' ')}`,
    };
  }

  const payload = parsed.payload;
  const policy = options.currentPolicy ?? payload.policySnapshot;
  const decisionStatus = options.decisionStatus ?? null;

  if (options.resumed) {
    return buildBrowserControlledResumeState({
      blockedReasons: [],
      checkpoint,
      decisionStatus,
      payload,
      policy,
      status: 'resumed',
    });
  }

  if (checkpoint.status === 'resolved') {
    return buildBrowserControlledResumeState({
      blockedReasons: ['Browser controlled checkpoint was already resolved or consumed.'],
      checkpoint,
      decisionStatus,
      payload,
      policy,
      status: 'alreadyConsumed',
    });
  }

  const validation = validateBrowserControlledInteractionResume({
    context: {
      checkpointStatus: checkpoint.status,
      currentPolicy: policy,
      decisionStatus,
      descriptorId: BROWSER_CONTROLLED_INTERACTION_DESCRIPTOR_ID,
      modelExposure: 'hidden',
      providerCallAllowed: false,
      schedulerAllowed: false,
    },
    payload,
  });
  const blockedReasons = validation.valid ? [] : validation.blockedReasons;

  return buildBrowserControlledResumeState({
    blockedReasons,
    checkpoint,
    decisionStatus,
    payload,
    policy,
    status: blockedReasons.length ? 'blocked' : 'resumeReady',
  });
}

export function buildBrowserControlledInteractionResumeRunReviews(
  detail: Pick<RunDetailRecord, 'checkpoints' | 'output' | 'steps'> | null,
  decisions: Array<Pick<DecisionRecord, 'id' | 'sourceId' | 'status'>> = [],
): BrowserControlledInteractionResumeReview[] {
  const checkpoints = detail?.checkpoints ?? [];
  const hasResumeEvidence = Boolean(detail?.output?.includes('Browser controlled resume local QA completed'))
    || (detail?.steps ?? []).some((step) =>
      step.title.startsWith('Browser resume evidence pending:')
      || step.title.startsWith('Browser resume planned:'));

  return checkpoints
    .filter((checkpoint) => checkpoint.payload)
    .map((checkpoint) => {
      const parsed = parseBrowserControlledInteractionCheckpointPayload(checkpoint.payload);
      if (!parsed.valid && parsed.blockedReasons.includes('Browser controlled checkpoint payload kind is not supported.')) {
        return null;
      }

      const linkedDecision = parsed.valid
        ? decisions.find((decision) =>
          decision.id === parsed.payload.decisionId
          || decision.sourceId === checkpoint.id)
        : null;

      return buildBrowserControlledInteractionResumeReview(checkpoint, {
        decisionStatus: linkedDecision?.status ?? null,
        resumed: hasResumeEvidence,
      });
    })
    .filter((review): review is BrowserControlledInteractionResumeReview => Boolean(review));
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

export function formatBrowserControlledCheckpointActionSummary(
  payload: BrowserControlledInteractionCheckpointPayloadV1,
): string {
  return [
    `action=${payload.action.action}`,
    `url=${payload.currentUrl}`,
    `origin=${payload.origin}`,
    payload.action.targetRef ? `targetRef=${payload.action.targetRef}` : null,
    payload.action.targetLabel ? `targetLabel=${payload.action.targetLabel}` : null,
    payload.action.value ? `value=${payload.action.value}` : null,
    `sideEffect=${payload.sideEffectClassification}`,
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
  const completed = typeof detail?.output === 'string'
    && detail.output.includes('Browser controlled local QA completed');
  const hasControlledBoundary = completed
    || controlledCheckpoints.length > 0
    || controlledSteps.some(isBrowserControlledBoundaryStep);

  if (!hasControlledBoundary) {
    return null;
  }

  const planStep = controlledSteps.find((step) => step.title === 'browser controlled dry-run accepted');
  const plannedActionSteps = controlledSteps.filter((step) => step.title.startsWith('Browser action planned:'));
  const blockedSteps = controlledSteps.filter((step) => step.title === 'browser controlled interaction blocked');
  const checkpointSteps = controlledSteps.filter((step) => step.title === 'Browser action requires checkpoint');
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
    return 'next=review checkpoint payload and Browser Controlled Resume state; approval can resume one recorded action only';
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

function isBrowserControlledBoundaryStep(step: RunStepRecord): boolean {
  return step.title === 'browser controlled dry-run accepted'
    || step.title === 'browser controlled interaction blocked'
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
    'resume=decision_gated_single_action',
  ].filter(Boolean).join(' / ');
}

function buildBrowserControlledResumeState(params: {
  blockedReasons: string[];
  checkpoint: RunCheckpointRecord;
  decisionStatus: DecisionStatus | null;
  payload: BrowserControlledInteractionCheckpointPayloadV1;
  policy: BrowserControlledInteractionPolicy;
  status: BrowserControlledInteractionResumeReviewStatus;
}): BrowserControlledInteractionResumeReview {
  const { blockedReasons, checkpoint, decisionStatus, payload, policy, status } = params;
  const actionSummary = formatBrowserControlledCheckpointActionSummary(payload);

  return {
    actionSummary,
    blockedReasons,
    checkpointId: checkpoint.id,
    consequence: `approval resumes exactly one recorded ${payload.action.action} action; it does not grant a browser session`,
    decisionSummary: `decision=${decisionStatus ?? 'missing'} / checkpoint=${checkpoint.status}`,
    evidenceSummary: [
      payload.screenshotArtifactId ? `screenshot=${payload.screenshotArtifactId}` : null,
      payload.visibleTextSummary ? `visibleText=${payload.visibleTextSummary}` : null,
      `decisionTitle=${payload.decisionTitle}`,
    ].filter(Boolean).join(' / '),
    nextMove: formatBrowserControlledResumeNextMove(status),
    policySummary: [
      'modelExposure=hidden',
      'scheduler=no',
      'providerCall=no',
      'genericPrompt=no',
      `origin=${payload.origin}`,
      `allowed=${policy.allowedActions.join(',') || 'none'}`,
    ].join(' / '),
    status,
    summary: status === 'resumeReady'
      ? `Browser controlled resume ready: ${actionSummary}`
      : `Browser controlled resume ${status}: ${blockedReasons.join(' ')}`,
  };
}

function formatBrowserControlledResumeNextMove(status: BrowserControlledInteractionResumeReviewStatus): string {
  if (status === 'resumed') {
    return 'next=review post-resume evidence; another browser action requires a new checkpoint';
  }

  if (status === 'resumeReady') {
    return 'next=resume exactly one approved browser action after pre-launch validation';
  }

  if (status === 'alreadyConsumed') {
    return 'next=review post-resume evidence or create a new checkpoint for another action';
  }

  if (status === 'stalePayload') {
    return 'next=create a new browser checkpoint payload before approval can resume';
  }

  return 'next=resolve blocked approval, policy, or checkpoint state before browser resume';
}
