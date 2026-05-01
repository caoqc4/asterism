import type { AgentSessionRecord } from './types/agent-execution.js';
import type { RunCheckpointRecord } from './types/run.js';
import {
  isSupportedResumeCheckpointPayload,
  parseRunCheckpointPayload,
  validateResumeCheckpointPayload,
  type ValidResumeCheckpointPayload,
} from './types/run-checkpoint-payload.js';

type ResumeCheckpointCandidate = {
  checkpoint: RunCheckpointRecord;
  payload: ValidResumeCheckpointPayload;
};

export type PausedRunResumeEligibility =
  | {
      status: 'eligible';
      checkpoint: RunCheckpointRecord;
      payload: ValidResumeCheckpointPayload;
    }
  | {
      status: 'blocked';
      reason: string;
    };

export function evaluatePausedRunResumeEligibility(params: {
  agentSessions?: AgentSessionRecord[];
  checkpoints?: RunCheckpointRecord[];
  runId: string;
  taskId: string;
}): PausedRunResumeEligibility {
  const resumeCheckpoints = (params.checkpoints ?? []).filter((item) =>
    item.status === 'open' && item.kind === 'resume'
  );

  if (resumeCheckpoints.length === 0) {
    return blocked(`Open resume checkpoint not found for run: ${params.runId}`);
  }

  const supportedCandidates: ResumeCheckpointCandidate[] = [];
  let firstInvalidReason: string | null = null;
  let firstUnsupportedTool: string | null = null;

  for (const checkpoint of resumeCheckpoints) {
    const validation = validateResumeCheckpointPayload(checkpoint.payload, {
      runId: params.runId,
      taskId: params.taskId,
    });

    if (validation.status === 'invalid') {
      firstInvalidReason ??= validation.reason;
      continue;
    }

    if (!isSupportedResumeCheckpointPayload(validation.payload)) {
      firstUnsupportedTool ??= validation.payload.nextTool;
      continue;
    }

    supportedCandidates.push({
      checkpoint,
      payload: validation.payload,
    });
  }

  if (supportedCandidates.length === 0) {
    if (firstUnsupportedTool) {
      return blocked(`Unsupported resume tool: ${firstUnsupportedTool}`);
    }

    return blocked(firstInvalidReason ?? `Open resume checkpoint not found for run: ${params.runId}`);
  }

  if (supportedCandidates.length > 1) {
    return blocked(
      `Multiple open resume checkpoints found for run: ${params.runId}: ${
        supportedCandidates.map((item) => item.checkpoint.id).join(', ')
      }.`,
    );
  }

  const [candidate] = supportedCandidates;

  if (
    candidate.payload.agentSessionId
    && !isCheckpointBackedAgentSession(params.agentSessions ?? [], candidate.payload.agentSessionId)
  ) {
    return blocked(
      `Resume checkpoint agent session is not resumable for run: ${params.runId} (${candidate.payload.agentSessionId}).`,
    );
  }

  return {
    status: 'eligible',
    checkpoint: candidate.checkpoint,
    payload: candidate.payload,
  };
}

export function getSessionScopedReplayCheckpoints(
  checkpoints: RunCheckpointRecord[],
  sessionId: string | null,
): RunCheckpointRecord[] {
  if (!sessionId) {
    return checkpoints;
  }

  return checkpoints.filter((checkpoint) => {
    const payload = parseRunCheckpointPayload(checkpoint.payload);
    const payloadSessionId = typeof payload?.agentSessionId === 'string'
      ? payload.agentSessionId
      : typeof payload?.sessionId === 'string'
        ? payload.sessionId
        : null;

    return !payloadSessionId || payloadSessionId === sessionId;
  });
}

function isCheckpointBackedAgentSession(
  sessions: AgentSessionRecord[],
  sessionId: string,
): boolean {
  return sessions.some((session) =>
    session.id === sessionId && (session.status === 'paused' || session.status === 'needs_confirmation')
  );
}

function blocked(reason: string): PausedRunResumeEligibility {
  return {
    status: 'blocked',
    reason,
  };
}
