import {
  mapBrowserControlledInteractionStepToRunSteps,
  validateBrowserControlledInteractionRequest,
  type BrowserControlledInteractionRequest,
} from '../../../shared/types/browser-controlled-interaction.js';
import type { RunStepRecord } from '../../../shared/types/run.js';
import type { RunStepRepository } from '../../db/repositories/run-step-repository.js';

export type BrowserControlledInteractionDryRunStatus =
  | 'planned'
  | 'checkpoint_required'
  | 'blocked';

export type BrowserControlledInteractionDryRunResult = {
  blockedReasons: string[];
  checkpointCount: number;
  plannedActionCount: number;
  status: BrowserControlledInteractionDryRunStatus;
  steps: RunStepRecord[];
  summary: string;
};

export async function runBrowserControlledInteractionDryRun(params: {
  requests: unknown[];
  runId: string;
  runStepRepository: Pick<RunStepRepository, 'create'>;
}): Promise<BrowserControlledInteractionDryRunResult> {
  const steps: RunStepRecord[] = [];
  const blockedReasons: string[] = [];
  let checkpointCount = 0;
  let plannedActionCount = 0;

  steps.push(await params.runStepRepository.create({
    runId: params.runId,
    kind: 'plan',
    status: 'completed',
    title: 'browser controlled dry-run accepted',
    input: `requests=${params.requests.length}`,
    output: 'browserStart=no / networkCall=no / pageMutation=no / modelExposure=hidden / scheduler=no / providerCall=no',
  }));

  for (const request of params.requests) {
    const validation = validateBrowserControlledInteractionRequest(request);

    if (!validation.valid) {
      blockedReasons.push(...validation.blockedReasons);
      steps.push(await params.runStepRepository.create({
        runId: params.runId,
        kind: 'tool_result',
        status: 'failed',
        title: 'browser controlled interaction blocked',
        input: formatDryRunRequestInput(request),
        output: validation.summary,
        error: validation.summary,
      }));
      continue;
    }

    plannedActionCount += 1;
    if (validation.step.checkpointRequired) {
      checkpointCount += 1;
    }

    const drafts = mapBrowserControlledInteractionStepToRunSteps(validation.step);
    for (const draft of drafts) {
      steps.push(await params.runStepRepository.create({
        runId: params.runId,
        kind: draft.kind,
        status: draft.status,
        title: draft.title,
        input: draft.input,
        output: draft.output,
      }));
    }
  }

  const status: BrowserControlledInteractionDryRunStatus = blockedReasons.length
    ? 'blocked'
    : checkpointCount
      ? 'checkpoint_required'
      : 'planned';
  const summary = [
    `Browser controlled interaction dry-run: ${status}`,
    `plannedActions=${plannedActionCount}`,
    `checkpointRequired=${checkpointCount}`,
    `blocked=${blockedReasons.length}`,
    'browserStart=no',
    'networkCall=no',
    'modelExposure=hidden',
  ].join(' / ');

  return {
    blockedReasons,
    checkpointCount,
    plannedActionCount,
    status,
    steps,
    summary,
  };
}

function formatDryRunRequestInput(request: unknown): string | null {
  const candidate = request as Partial<BrowserControlledInteractionRequest> | null;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  return [
    typeof candidate.descriptorId === 'string' ? `descriptor=${candidate.descriptorId}` : null,
    typeof candidate.action?.action === 'string' ? `action=${candidate.action.action}` : null,
    typeof candidate.action?.currentUrl === 'string' ? `url=${candidate.action.currentUrl}` : null,
    typeof candidate.action?.url === 'string' ? `url=${candidate.action.url}` : null,
    typeof candidate.action?.targetRef === 'string' ? `targetRef=${candidate.action.targetRef}` : null,
    typeof candidate.action?.targetLabel === 'string' ? `targetLabel=${candidate.action.targetLabel}` : null,
  ].filter(Boolean).join('\n') || null;
}
