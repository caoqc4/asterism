import type { AgentSessionRecord } from '../../../shared/types/agent-execution.js';

export type AgentSessionSettlementProjection = {
  action:
    | 'checkpoint_backed_settlement'
    | 'inspect_terminal_evidence'
    | 'requires_executor_liveness'
    | 'not_settleable';
  sessionId: string;
  status: AgentSessionRecord['status'];
  summary: string;
};

export function findLatestContinuableAgentSession(
  sessions: AgentSessionRecord[],
): AgentSessionRecord | null {
  return [...sessions]
    .filter(isContinuableAgentSession)
    .sort(compareAgentSessionsByRecency)
    .at(-1) ?? null;
}

export function findLatestCheckpointBackedAgentSession(
  sessions: AgentSessionRecord[],
): AgentSessionRecord | null {
  return [...sessions]
    .filter(isCheckpointBackedAgentSession)
    .sort(compareAgentSessionsByRecency)
    .at(-1) ?? null;
}

export function projectAgentSessionSettlement(
  session: AgentSessionRecord,
): AgentSessionSettlementProjection {
  if (isCheckpointBackedAgentSession(session)) {
    return {
      action: 'checkpoint_backed_settlement',
      sessionId: session.id,
      status: session.status,
      summary: [
        'Agent session settlement',
        `session=${session.id}`,
        `status=${session.status}`,
        'action=checkpoint_backed_settlement',
        'requiresOpenCheckpoint=yes',
        'autoReplay=no',
      ].join(' / '),
    };
  }

  if (session.status === 'running') {
    return {
      action: 'requires_executor_liveness',
      sessionId: session.id,
      status: session.status,
      summary: [
        'Agent session settlement',
        `session=${session.id}`,
        'status=running',
        'action=requires_executor_liveness',
        'requiresOpenCheckpoint=no',
        'autoReplay=no',
      ].join(' / '),
    };
  }

  if (session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled') {
    return {
      action: 'inspect_terminal_evidence',
      sessionId: session.id,
      status: session.status,
      summary: [
        'Agent session settlement',
        `session=${session.id}`,
        `status=${session.status}`,
        'action=inspect_terminal_evidence',
        'requiresOpenCheckpoint=no',
        'autoReplay=no',
      ].join(' / '),
    };
  }

  return {
    action: 'not_settleable',
    sessionId: session.id,
    status: session.status,
    summary: [
      'Agent session settlement',
      `session=${session.id}`,
      `status=${session.status}`,
      'action=not_settleable',
      'requiresOpenCheckpoint=no',
      'autoReplay=no',
    ].join(' / '),
  };
}

function isContinuableAgentSession(session: AgentSessionRecord): boolean {
  return session.status === 'paused'
    || session.status === 'needs_confirmation'
    || session.status === 'running';
}

function isCheckpointBackedAgentSession(session: AgentSessionRecord): boolean {
  return session.status === 'paused'
    || session.status === 'needs_confirmation';
}

function compareAgentSessionsByRecency(
  left: Pick<AgentSessionRecord, 'createdAt' | 'updatedAt'>,
  right: Pick<AgentSessionRecord, 'createdAt' | 'updatedAt'>,
): number {
  const updated = left.updatedAt.localeCompare(right.updatedAt);

  if (updated !== 0) {
    return updated;
  }

  return left.createdAt.localeCompare(right.createdAt);
}
