import type { AgentSessionRecord } from './types/agent-execution.js';
import type { RunCheckpointRecord, RunStepRecord } from './types/run.js';

export type AgentSessionReplayReview = {
  latestStepTitle: string | null;
  latestStepStatus: string | null;
  mode: 'inspect_only' | 'manual_resume' | 'new_run';
  openCheckpointCount: number;
  restartSafety:
    | 'checkpoint_gated'
    | 'checkpoint_missing'
    | 'interrupted_or_stale'
    | 'live_status_unknown'
    | 'new_run_required'
    | 'terminal_evidence';
  runStepCount: number;
  sessionId: string;
  status: AgentSessionRecord['status'];
  summary: string;
};

export type AgentSessionRecoveryIntent = {
  action: 'inspect_evidence' | 'manual_checkpoint_resume' | 'prepare_new_manual_run';
  automaticReplayAllowed: false;
  manualRunRequired: boolean;
  resumeCheckpointRequired: boolean;
  summary: string;
};

export function buildAgentSessionReplayReview(params: {
  checkpoints?: Pick<RunCheckpointRecord, 'status'>[];
  session: AgentSessionRecord;
  steps: Pick<RunStepRecord, 'createdAt' | 'index' | 'kind' | 'status' | 'title'>[];
}): AgentSessionReplayReview {
  const latestStep = [...params.steps].sort(compareRunStepsForReplay).at(-1) ?? null;
  const openCheckpointCount = (params.checkpoints ?? []).filter((checkpoint) =>
    checkpoint.status === 'open').length;
  const mode = getReplayReviewMode(params.session.status, openCheckpointCount);
  const action = getReplayReviewAction(params.session.status, openCheckpointCount);
  const restartSafety = getRestartSafety(params.session.status, latestStep?.status ?? null, openCheckpointCount);

  return {
    latestStepStatus: latestStep?.status ?? null,
    latestStepTitle: latestStep?.title ?? null,
    mode,
    openCheckpointCount,
    restartSafety,
    runStepCount: params.steps.length,
    sessionId: params.session.id,
    status: params.session.status,
    summary: [
      `Replay review：${action}`,
      `mode=${mode}`,
      `session=${params.session.id}`,
      `status=${params.session.status}`,
      `restartSafety=${restartSafety}`,
      `steps=${params.steps.length}`,
      `openCheckpoints=${openCheckpointCount}`,
      latestStep ? `latest=${latestStep.kind}:${latestStep.status}:${latestStep.title}` : 'latest=none',
      'autoReplay=no',
    ].join(' / '),
  };
}

export function buildAgentSessionRecoveryIntent(
  review: Pick<
    AgentSessionReplayReview,
    'mode' | 'openCheckpointCount' | 'restartSafety' | 'sessionId' | 'status'
  >,
): AgentSessionRecoveryIntent {
  if (review.mode === 'manual_resume' && review.openCheckpointCount > 0) {
    return {
      action: 'manual_checkpoint_resume',
      automaticReplayAllowed: false,
      manualRunRequired: false,
      resumeCheckpointRequired: true,
      summary: [
        'Recovery intent：manual checkpoint resume',
        `session=${review.sessionId}`,
        `status=${review.status}`,
        `restartSafety=${review.restartSafety}`,
        `openCheckpoints=${review.openCheckpointCount}`,
        'manualRunRequired=no',
        'autoReplay=no',
      ].join(' / '),
    };
  }

  if (review.mode === 'new_run' || review.restartSafety === 'interrupted_or_stale') {
    return {
      action: 'prepare_new_manual_run',
      automaticReplayAllowed: false,
      manualRunRequired: true,
      resumeCheckpointRequired: false,
      summary: [
        'Recovery intent：prepare new manual run',
        `session=${review.sessionId}`,
        `status=${review.status}`,
        `restartSafety=${review.restartSafety}`,
        `openCheckpoints=${review.openCheckpointCount}`,
        'manualRunRequired=yes',
        'autoReplay=no',
      ].join(' / '),
    };
  }

  return {
    action: 'inspect_evidence',
    automaticReplayAllowed: false,
    manualRunRequired: false,
    resumeCheckpointRequired: false,
    summary: [
      'Recovery intent：inspect evidence',
      `session=${review.sessionId}`,
      `status=${review.status}`,
      `restartSafety=${review.restartSafety}`,
      `openCheckpoints=${review.openCheckpointCount}`,
      'manualRunRequired=no',
      'autoReplay=no',
    ].join(' / '),
  };
}

function getReplayReviewMode(
  status: AgentSessionRecord['status'],
  openCheckpointCount: number,
): AgentSessionReplayReview['mode'] {
  switch (status) {
    case 'needs_confirmation':
    case 'paused':
      return openCheckpointCount > 0 ? 'manual_resume' : 'inspect_only';
    case 'failed':
    case 'cancelled':
      return 'new_run';
    case 'completed':
    case 'running':
      return 'inspect_only';
  }
}

function getReplayReviewAction(status: AgentSessionRecord['status'], openCheckpointCount: number): string {
  switch (status) {
    case 'completed':
      return 'inspect completed evidence';
    case 'failed':
      return 'inspect failed steps before starting a new run';
    case 'needs_confirmation':
      return openCheckpointCount > 0
        ? 'resume only after Decision approval'
        : 'inspect confirmation evidence; no open checkpoint';
    case 'paused':
      return openCheckpointCount > 0
        ? 'resume only through the open checkpoint'
        : 'inspect paused evidence; no open checkpoint';
    case 'cancelled':
      return 'not resumable; inspect decision history';
    case 'running':
      return 'inspect latest step before any recovery';
  }
}

function getRestartSafety(
  status: AgentSessionRecord['status'],
  latestStepStatus: string | null,
  openCheckpointCount: number,
): AgentSessionReplayReview['restartSafety'] {
  switch (status) {
    case 'completed':
      return 'terminal_evidence';
    case 'failed':
    case 'cancelled':
      return 'new_run_required';
    case 'needs_confirmation':
    case 'paused':
      return openCheckpointCount > 0 ? 'checkpoint_gated' : 'checkpoint_missing';
    case 'running':
      return latestStepStatus === 'running' || latestStepStatus === 'pending'
        ? 'live_status_unknown'
        : 'interrupted_or_stale';
  }
}

function compareRunStepsForReplay(
  left: Pick<RunStepRecord, 'createdAt' | 'index'>,
  right: Pick<RunStepRecord, 'createdAt' | 'index'>,
): number {
  if (left.index !== right.index) {
    return left.index - right.index;
  }

  return left.createdAt.localeCompare(right.createdAt);
}
