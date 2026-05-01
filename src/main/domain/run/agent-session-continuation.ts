import type { AgentSessionRecord } from '../../../shared/types/agent-execution.js';

export type AgentSessionSettlementStore = {
  listForRun(runId: string): Promise<AgentSessionRecord[]>;
  updateStatus(id: string, status: AgentSessionRecord['status']): Promise<unknown>;
};

export type AgentSessionSettlementProjection = {
  action:
    | 'checkpoint_backed_settlement'
    | 'inspect_terminal_evidence'
    | 'requires_executor_liveness';
  autoReplayAllowed: false;
  requiresOpenCheckpoint: boolean;
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

export function findCheckpointBackedAgentSessionForSettlement(params: {
  sessions: AgentSessionRecord[];
  agentSessionId?: string | null;
}): AgentSessionRecord | null {
  if (params.agentSessionId) {
    return params.sessions.find((session) =>
      session.id === params.agentSessionId && isCheckpointBackedAgentSession(session)
    ) ?? null;
  }

  return findLatestCheckpointBackedAgentSession(params.sessions);
}

export function projectAgentSessionSettlement(
  session: AgentSessionRecord,
): AgentSessionSettlementProjection {
  switch (session.status) {
    case 'needs_confirmation':
    case 'paused':
      return {
        action: 'checkpoint_backed_settlement',
        autoReplayAllowed: false,
        requiresOpenCheckpoint: true,
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

    case 'running':
      return {
        action: 'requires_executor_liveness',
        autoReplayAllowed: false,
        requiresOpenCheckpoint: false,
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

    case 'completed':
    case 'failed':
    case 'cancelled':
      return {
        action: 'inspect_terminal_evidence',
        autoReplayAllowed: false,
        requiresOpenCheckpoint: false,
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

  return assertNeverAgentSessionStatus(session.status);
}

export async function updateCheckpointBackedAgentSessionStatus(params: {
  agentSessionId?: string | null;
  runId: string;
  status: AgentSessionRecord['status'];
  store: AgentSessionSettlementStore | null;
}): Promise<AgentSessionRecord | null> {
  if (!params.store) {
    return null;
  }

  const session = findCheckpointBackedAgentSessionForSettlement({
    agentSessionId: params.agentSessionId,
    sessions: await params.store.listForRun(params.runId),
  });

  if (!session) {
    return null;
  }

  const settlement = projectAgentSessionSettlement(session);
  if (settlement.action !== 'checkpoint_backed_settlement') {
    return null;
  }

  await params.store.updateStatus(session.id, params.status);

  return session;
}

function isContinuableAgentSession(session: AgentSessionRecord): boolean {
  return session.status === 'paused'
    || session.status === 'needs_confirmation'
    || session.status === 'running';
}

function isCheckpointBackedAgentSession(
  session: AgentSessionRecord,
): session is AgentSessionRecord & { status: 'needs_confirmation' | 'paused' } {
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

function assertNeverAgentSessionStatus(status: never): never {
  throw new Error(`Unhandled agent session status: ${status}`);
}
