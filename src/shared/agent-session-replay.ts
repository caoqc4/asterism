import type { AgentSessionRecord } from './types/agent-execution.js';
import type { RunCheckpointRecord, RunStepRecord } from './types/run.js';

export type AgentSessionReplayCheckpointEvidence =
  Pick<RunCheckpointRecord, 'status'> &
  Partial<Pick<RunCheckpointRecord, 'id' | 'kind'>>;

export type AgentSessionReplayReview = {
  automaticReplayAllowed: false;
  latestStepKind: RunStepRecord['kind'] | null;
  latestStepTitle: string | null;
  latestStepStatus: RunStepRecord['status'] | null;
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
  recoveryCheckpointCount: number;
  recoveryCheckpointIds: string[];
  runId: string;
  sessionId: string;
  status: AgentSessionRecord['status'];
  summary: string;
};

export type AgentSessionRecoveryIntent = {
  action: 'inspect_evidence' | 'manual_checkpoint_resume' | 'prepare_new_manual_run';
  automaticReplayAllowed: false;
  manualRunRequired: boolean;
  openCheckpointCount: number;
  recoveryCheckpointCount: number;
  recoveryCheckpointIds: string[];
  recoveryCheckpointRequired: boolean;
  restartSafety: AgentSessionReplayReview['restartSafety'];
  resumeCheckpointRequired: boolean;
  runId: string;
  sessionId: string;
  status: AgentSessionRecord['status'];
  summary: string;
};

export function buildAgentSessionReplayReview(params: {
  checkpoints?: AgentSessionReplayCheckpointEvidence[];
  session: AgentSessionRecord;
  steps: Pick<RunStepRecord, 'createdAt' | 'index' | 'kind' | 'status' | 'title'>[];
}): AgentSessionReplayReview {
  const latestStep = [...params.steps].sort(compareRunStepsForReplay).at(-1) ?? null;
  const openCheckpoints = (params.checkpoints ?? []).filter((checkpoint) => checkpoint.status === 'open');
  const openCheckpointCount = openCheckpoints.length;
  const recoveryCheckpoints = openCheckpoints.filter((checkpoint) =>
    isRecoveryCheckpointForSessionStatus(params.session.status, checkpoint.kind));
  const recoveryCheckpointCount = recoveryCheckpoints.length;
  const recoveryCheckpointIds = recoveryCheckpoints
    .map((checkpoint) => checkpoint.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const mode = getReplayReviewMode(params.session.status, recoveryCheckpointCount);
  const action = getReplayReviewAction(params.session.status, recoveryCheckpointCount);
  const restartSafety = getRestartSafety(
    params.session.status,
    latestStep?.status ?? null,
    recoveryCheckpointCount,
  );

  return {
    automaticReplayAllowed: false,
    latestStepKind: latestStep?.kind ?? null,
    latestStepStatus: latestStep?.status ?? null,
    latestStepTitle: latestStep?.title ?? null,
    mode,
    openCheckpointCount,
    restartSafety,
    runStepCount: params.steps.length,
    recoveryCheckpointCount,
    recoveryCheckpointIds,
    runId: params.session.runId,
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
      `recoveryCheckpoints=${recoveryCheckpointCount}`,
      latestStep ? `latest=${latestStep.kind}:${latestStep.status}:${latestStep.title}` : 'latest=none',
      'autoReplay=no',
    ].join(' / '),
  };
}

export function buildAgentSessionRecoveryIntent(
  review: Pick<
    AgentSessionReplayReview,
    | 'mode'
    | 'openCheckpointCount'
    | 'recoveryCheckpointCount'
    | 'recoveryCheckpointIds'
    | 'restartSafety'
    | 'runId'
    | 'sessionId'
    | 'status'
  >,
): AgentSessionRecoveryIntent {
  if (review.mode === 'manual_resume' && review.recoveryCheckpointCount > 0) {
    return {
      action: 'manual_checkpoint_resume',
      automaticReplayAllowed: false,
      manualRunRequired: false,
      openCheckpointCount: review.openCheckpointCount,
      recoveryCheckpointCount: review.recoveryCheckpointCount,
      recoveryCheckpointIds: review.recoveryCheckpointIds,
      recoveryCheckpointRequired: true,
      restartSafety: review.restartSafety,
      resumeCheckpointRequired: true,
      runId: review.runId,
      sessionId: review.sessionId,
      status: review.status,
      summary: [
        'Recovery intent：manual checkpoint resume',
        `session=${review.sessionId}`,
        `status=${review.status}`,
        `restartSafety=${review.restartSafety}`,
        `openCheckpoints=${review.openCheckpointCount}`,
        `recoveryCheckpoints=${review.recoveryCheckpointCount}`,
        'recoveryCheckpointRequired=yes',
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
      openCheckpointCount: review.openCheckpointCount,
      recoveryCheckpointCount: review.recoveryCheckpointCount,
      recoveryCheckpointIds: review.recoveryCheckpointIds,
      recoveryCheckpointRequired: false,
      restartSafety: review.restartSafety,
      resumeCheckpointRequired: false,
      runId: review.runId,
      sessionId: review.sessionId,
      status: review.status,
      summary: [
        'Recovery intent：prepare new manual run',
        `session=${review.sessionId}`,
        `status=${review.status}`,
        `restartSafety=${review.restartSafety}`,
        `openCheckpoints=${review.openCheckpointCount}`,
        `recoveryCheckpoints=${review.recoveryCheckpointCount}`,
        'recoveryCheckpointRequired=no',
        'manualRunRequired=yes',
        'autoReplay=no',
      ].join(' / '),
    };
  }

  return {
    action: 'inspect_evidence',
    automaticReplayAllowed: false,
    manualRunRequired: false,
    openCheckpointCount: review.openCheckpointCount,
    recoveryCheckpointCount: review.recoveryCheckpointCount,
    recoveryCheckpointIds: review.recoveryCheckpointIds,
    recoveryCheckpointRequired: false,
    restartSafety: review.restartSafety,
    resumeCheckpointRequired: false,
    runId: review.runId,
    sessionId: review.sessionId,
    status: review.status,
    summary: [
      'Recovery intent：inspect evidence',
      `session=${review.sessionId}`,
      `status=${review.status}`,
      `restartSafety=${review.restartSafety}`,
      `openCheckpoints=${review.openCheckpointCount}`,
      `recoveryCheckpoints=${review.recoveryCheckpointCount}`,
      'recoveryCheckpointRequired=no',
      'manualRunRequired=no',
      'autoReplay=no',
    ].join(' / '),
  };
}

function isRecoveryCheckpointForSessionStatus(
  status: AgentSessionRecord['status'],
  checkpointKind: RunCheckpointRecord['kind'] | undefined,
): boolean {
  switch (status) {
    case 'paused':
      return checkpointKind === undefined || checkpointKind === 'resume';
    case 'needs_confirmation':
      return checkpointKind === undefined
        || checkpointKind === 'confirmation'
        || checkpointKind === 'tool_permission'
        || checkpointKind === 'patch_promotion';
    case 'cancelled':
    case 'completed':
    case 'failed':
    case 'running':
      return false;
  }
}

function getReplayReviewMode(
  status: AgentSessionRecord['status'],
  recoveryCheckpointCount: number,
): AgentSessionReplayReview['mode'] {
  switch (status) {
    case 'needs_confirmation':
    case 'paused':
      return recoveryCheckpointCount > 0 ? 'manual_resume' : 'inspect_only';
    case 'failed':
    case 'cancelled':
      return 'new_run';
    case 'completed':
    case 'running':
      return 'inspect_only';
  }
}

function getReplayReviewAction(status: AgentSessionRecord['status'], recoveryCheckpointCount: number): string {
  switch (status) {
    case 'completed':
      return 'inspect completed evidence';
    case 'failed':
      return 'inspect failed steps before starting a new run';
    case 'needs_confirmation':
      return recoveryCheckpointCount > 0
        ? 'resume only after Decision approval'
        : 'inspect confirmation evidence; no recovery checkpoint';
    case 'paused':
      return recoveryCheckpointCount > 0
        ? 'resume only through the recovery checkpoint'
        : 'inspect paused evidence; no recovery checkpoint';
    case 'cancelled':
      return 'inspect cancellation evidence before starting a new run';
    case 'running':
      return 'inspect latest step before any recovery';
  }
}

function getRestartSafety(
  status: AgentSessionRecord['status'],
  latestStepStatus: string | null,
  recoveryCheckpointCount: number,
): AgentSessionReplayReview['restartSafety'] {
  switch (status) {
    case 'completed':
      return 'terminal_evidence';
    case 'failed':
    case 'cancelled':
      return 'new_run_required';
    case 'needs_confirmation':
    case 'paused':
      return recoveryCheckpointCount > 0 ? 'checkpoint_gated' : 'checkpoint_missing';
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
