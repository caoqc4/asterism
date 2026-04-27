import type { AgentSessionRecord } from './types/agent-execution.js';
import type { RunCheckpointRecord, RunStepRecord } from './types/run.js';

export type AgentSessionReplayReview = {
  latestStepTitle: string | null;
  latestStepStatus: string | null;
  mode: 'inspect_only' | 'manual_resume' | 'new_run';
  openCheckpointCount: number;
  restartSafety:
    | 'checkpoint_gated'
    | 'interrupted_or_stale'
    | 'live_status_unknown'
    | 'new_run_required'
    | 'terminal_evidence';
  runStepCount: number;
  sessionId: string;
  status: AgentSessionRecord['status'];
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
  const mode = getReplayReviewMode(params.session.status);
  const action = getReplayReviewAction(params.session.status);
  const restartSafety = getRestartSafety(params.session.status, latestStep?.status ?? null);

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

function getReplayReviewMode(status: AgentSessionRecord['status']): AgentSessionReplayReview['mode'] {
  switch (status) {
    case 'needs_confirmation':
    case 'paused':
      return 'manual_resume';
    case 'failed':
    case 'cancelled':
      return 'new_run';
    case 'completed':
    case 'running':
      return 'inspect_only';
  }
}

function getReplayReviewAction(status: AgentSessionRecord['status']): string {
  switch (status) {
    case 'completed':
      return 'inspect completed evidence';
    case 'failed':
      return 'inspect failed steps before starting a new run';
    case 'needs_confirmation':
      return 'resume only after Decision approval';
    case 'paused':
      return 'resume only through the open checkpoint';
    case 'cancelled':
      return 'not resumable; inspect decision history';
    case 'running':
      return 'inspect latest step before any recovery';
  }
}

function getRestartSafety(
  status: AgentSessionRecord['status'],
  latestStepStatus: string | null,
): AgentSessionReplayReview['restartSafety'] {
  switch (status) {
    case 'completed':
      return 'terminal_evidence';
    case 'failed':
    case 'cancelled':
      return 'new_run_required';
    case 'needs_confirmation':
    case 'paused':
      return 'checkpoint_gated';
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
