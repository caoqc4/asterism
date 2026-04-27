import {
  type BrowserControlledInteractionResumeContext,
  validateBrowserControlledInteractionResume,
} from '../../../shared/types/browser-controlled-interaction.js';
import type { RunStepRecord } from '../../../shared/types/run.js';
import type { RunStepRepository } from '../../db/repositories/run-step-repository.js';

export type BrowserControlledInteractionResumeDryRunStatus = 'planned' | 'blocked';

export type BrowserControlledInteractionResumeDryRunResult = {
  blockedReasons: string[];
  status: BrowserControlledInteractionResumeDryRunStatus;
  steps: RunStepRecord[];
  summary: string;
};

export async function runBrowserControlledInteractionResumeDryRun(params: {
  context: BrowserControlledInteractionResumeContext;
  payload: unknown;
  runId: string;
  runStepRepository: Pick<RunStepRepository, 'create'>;
}): Promise<BrowserControlledInteractionResumeDryRunResult> {
  const steps: RunStepRecord[] = [];

  steps.push(await params.runStepRepository.create({
    runId: params.runId,
    kind: 'plan',
    status: 'completed',
    title: 'browser controlled resume dry-run accepted',
    input: [
      `checkpointStatus=${params.context.checkpointStatus}`,
      `decisionStatus=${params.context.decisionStatus ?? 'missing'}`,
      `descriptor=${params.context.descriptorId}`,
    ].join('\n'),
    output: 'browserStart=no / pageMutation=no / modelExposure=hidden / scheduler=no / providerCall=no',
  }));

  const validation = validateBrowserControlledInteractionResume({
    context: params.context,
    payload: params.payload,
  });

  steps.push(await params.runStepRepository.create({
    runId: params.runId,
    kind: 'checkpoint',
    status: validation.valid ? 'completed' : 'failed',
    title: 'Browser resume checkpoint reviewed',
    input: formatResumePayloadInput(params.payload),
    output: validation.summary,
    error: validation.valid ? null : validation.summary,
  }));

  if (!validation.valid) {
    steps.push(await params.runStepRepository.create({
      runId: params.runId,
      kind: 'tool_result',
      status: 'failed',
      title: 'browser controlled resume blocked',
      input: formatResumeContextInput(params.context),
      output: validation.summary,
      error: validation.summary,
    }));

    return {
      blockedReasons: validation.blockedReasons,
      status: 'blocked',
      steps,
      summary: [
        'Browser controlled resume dry-run: blocked',
        `blocked=${validation.blockedReasons.length}`,
        'browserStart=no',
        'pageMutation=no',
        'modelExposure=hidden',
      ].join(' / '),
    };
  }

  steps.push(await params.runStepRepository.create({
    runId: params.runId,
    kind: 'tool_call',
    status: 'pending',
    title: `Browser resume planned: ${validation.plan.action.action}`,
    input: [
      `action=${validation.plan.action.action}`,
      `url=${validation.plan.currentUrl}`,
      `origin=${validation.plan.origin}`,
      validation.plan.action.targetRef ? `targetRef=${validation.plan.action.targetRef}` : null,
      validation.plan.action.targetLabel ? `targetLabel=${validation.plan.action.targetLabel}` : null,
    ].filter(Boolean).join('\n'),
    output: 'Pending local QA resume runner; browserStart=no in dry-run.',
  }));

  steps.push(await params.runStepRepository.create({
    runId: params.runId,
    kind: 'tool_result',
    status: 'skipped',
    title: `Browser resume evidence pending: ${validation.plan.action.action}`,
    input: null,
    output: [
      validation.plan.summary,
      `expectedEvidence=${validation.plan.evidenceKinds.join(',') || 'none'}`,
      'postActionScreenshot=required',
      'postActionVisibleText=required',
      'pageMutation=no',
    ].join('\n'),
  }));

  return {
    blockedReasons: [],
    status: 'planned',
    steps,
    summary: [
      'Browser controlled resume dry-run: planned',
      `action=${validation.plan.action.action}`,
      `origin=${validation.plan.origin}`,
      'browserStart=no',
      'pageMutation=no',
      'modelExposure=hidden',
    ].join(' / '),
  };
}

function formatResumeContextInput(context: BrowserControlledInteractionResumeContext): string {
  return [
    `checkpointStatus=${context.checkpointStatus}`,
    `decisionStatus=${context.decisionStatus ?? 'missing'}`,
    `descriptor=${context.descriptorId}`,
    `scheduler=${context.schedulerAllowed ? 'yes' : 'no'}`,
    `providerCall=${context.providerCallAllowed ? 'yes' : 'no'}`,
    `modelExposure=${context.modelExposure}`,
    context.requestedAction ? `requestedAction=${context.requestedAction}` : null,
    context.requestedOrigin ? `requestedOrigin=${context.requestedOrigin}` : null,
  ].filter(Boolean).join('\n');
}

function formatResumePayloadInput(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return typeof payload === 'string' ? payload : null;
  }

  const candidate = payload as {
    action?: {
      action?: unknown;
      targetLabel?: unknown;
      targetRef?: unknown;
    };
    currentUrl?: unknown;
    kind?: unknown;
    origin?: unknown;
  };

  return [
    typeof candidate.kind === 'string' ? `kind=${candidate.kind}` : null,
    typeof candidate.action?.action === 'string' ? `action=${candidate.action.action}` : null,
    typeof candidate.currentUrl === 'string' ? `url=${candidate.currentUrl}` : null,
    typeof candidate.origin === 'string' ? `origin=${candidate.origin}` : null,
    typeof candidate.action?.targetRef === 'string' ? `targetRef=${candidate.action.targetRef}` : null,
    typeof candidate.action?.targetLabel === 'string' ? `targetLabel=${candidate.action.targetLabel}` : null,
  ].filter(Boolean).join('\n') || null;
}
