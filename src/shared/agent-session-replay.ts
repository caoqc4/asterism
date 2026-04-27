import type { AgentSessionRecord } from './types/agent-execution.js';
import type { RunStepRecord } from './types/run.js';

export type AgentSessionReplayReview = {
  latestStepTitle: string | null;
  latestStepStatus: string | null;
  mode: 'inspect_only' | 'manual_resume' | 'new_run';
  runStepCount: number;
  sessionId: string;
  status: AgentSessionRecord['status'];
  summary: string;
};

export function buildAgentSessionReplayReview(params: {
  session: AgentSessionRecord;
  steps: Pick<RunStepRecord, 'createdAt' | 'index' | 'kind' | 'status' | 'title'>[];
}): AgentSessionReplayReview {
  const latestStep = [...params.steps].sort(compareRunStepsForReplay).at(-1) ?? null;
  const mode = getReplayReviewMode(params.session.status);
  const action = getReplayReviewAction(params.session.status);

  return {
    latestStepStatus: latestStep?.status ?? null,
    latestStepTitle: latestStep?.title ?? null,
    mode,
    runStepCount: params.steps.length,
    sessionId: params.session.id,
    status: params.session.status,
    summary: [
      `Replay review：${action}`,
      `mode=${mode}`,
      `session=${params.session.id}`,
      `status=${params.session.status}`,
      `steps=${params.steps.length}`,
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

function compareRunStepsForReplay(
  left: Pick<RunStepRecord, 'createdAt' | 'index'>,
  right: Pick<RunStepRecord, 'createdAt' | 'index'>,
): number {
  if (left.index !== right.index) {
    return left.index - right.index;
  }

  return left.createdAt.localeCompare(right.createdAt);
}
