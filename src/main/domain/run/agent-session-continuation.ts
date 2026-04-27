import type { AgentSessionRecord } from '../../../shared/types/agent-execution.js';

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
