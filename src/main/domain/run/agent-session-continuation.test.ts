import { describe, expect, it } from 'vitest';

import type { AgentSessionRecord } from '../../../shared/types/agent-execution.js';
import {
  findLatestCheckpointBackedAgentSession,
  findLatestContinuableAgentSession,
  projectAgentSessionSettlement,
} from './agent-session-continuation.js';

function buildSession(partial: Partial<AgentSessionRecord>): AgentSessionRecord {
  return {
    id: partial.id ?? 'agent_session_1',
    runId: partial.runId ?? 'run_1',
    mode: partial.mode ?? 'agent',
    status: partial.status ?? 'paused',
    capabilities: partial.capabilities ?? {
      fileContext: false,
      longRunningSessions: false,
      streaming: false,
      structuredToolCalls: false,
      taskMutationTools: false,
      textOnlyPlanning: true,
    },
    metadata: partial.metadata ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('agent session continuation helper', () => {
  it('finds the newest paused, confirmation, or running session', () => {
    expect(findLatestContinuableAgentSession([
      buildSession({
        id: 'agent_session_completed',
        status: 'completed',
        updatedAt: '2026-01-03T00:00:00.000Z',
      }),
      buildSession({
        id: 'agent_session_paused_old',
        status: 'paused',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      buildSession({
        id: 'agent_session_confirmation_new',
        status: 'needs_confirmation',
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    ])?.id).toBe('agent_session_confirmation_new');
  });

  it('uses created time as the recency tie-breaker for continuable sessions', () => {
    expect(findLatestContinuableAgentSession([
      buildSession({
        id: 'agent_session_paused_old_created',
        status: 'paused',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
      }),
      buildSession({
        id: 'agent_session_running_new_created',
        status: 'running',
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
      }),
    ])?.id).toBe('agent_session_running_new_created');
  });

  it('returns null when every session is terminal', () => {
    expect(findLatestContinuableAgentSession([
      buildSession({ status: 'completed' }),
      buildSession({ status: 'failed' }),
      buildSession({ status: 'cancelled' }),
    ])).toBeNull();
  });

  it('excludes stale running sessions when selecting a checkpoint-backed settlement target', () => {
    expect(findLatestCheckpointBackedAgentSession([
      buildSession({
        id: 'agent_session_paused',
        status: 'paused',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      buildSession({
        id: 'agent_session_running_stale',
        status: 'running',
        updatedAt: '2026-01-03T00:00:00.000Z',
      }),
      buildSession({
        id: 'agent_session_completed',
        status: 'completed',
        updatedAt: '2026-01-04T00:00:00.000Z',
      }),
    ])?.id).toBe('agent_session_paused');
  });

  it('returns null for checkpoint-backed settlement when only running sessions remain', () => {
    expect(findLatestCheckpointBackedAgentSession([
      buildSession({ status: 'running' }),
      buildSession({ status: 'completed' }),
    ])).toBeNull();
  });

  it('projects settlement boundaries without treating running sessions as resumable checkpoints', () => {
    expect(projectAgentSessionSettlement(buildSession({
      id: 'agent_session_paused',
      status: 'paused',
    }))).toEqual({
      action: 'checkpoint_backed_settlement',
      sessionId: 'agent_session_paused',
      status: 'paused',
      summary: 'Agent session settlement / session=agent_session_paused / status=paused / action=checkpoint_backed_settlement / requiresOpenCheckpoint=yes / autoReplay=no',
    });

    expect(projectAgentSessionSettlement(buildSession({
      id: 'agent_session_confirmation',
      status: 'needs_confirmation',
    }))).toEqual({
      action: 'checkpoint_backed_settlement',
      sessionId: 'agent_session_confirmation',
      status: 'needs_confirmation',
      summary: 'Agent session settlement / session=agent_session_confirmation / status=needs_confirmation / action=checkpoint_backed_settlement / requiresOpenCheckpoint=yes / autoReplay=no',
    });

    expect(projectAgentSessionSettlement(buildSession({
      id: 'agent_session_running',
      status: 'running',
    }))).toEqual({
      action: 'requires_executor_liveness',
      sessionId: 'agent_session_running',
      status: 'running',
      summary: 'Agent session settlement / session=agent_session_running / status=running / action=requires_executor_liveness / requiresOpenCheckpoint=no / autoReplay=no',
    });

    expect(projectAgentSessionSettlement(buildSession({
      id: 'agent_session_completed',
      status: 'completed',
    }))).toEqual({
      action: 'inspect_terminal_evidence',
      sessionId: 'agent_session_completed',
      status: 'completed',
      summary: 'Agent session settlement / session=agent_session_completed / status=completed / action=inspect_terminal_evidence / requiresOpenCheckpoint=no / autoReplay=no',
    });

    expect(projectAgentSessionSettlement(buildSession({
      id: 'agent_session_failed',
      status: 'failed',
    }))).toEqual({
      action: 'inspect_terminal_evidence',
      sessionId: 'agent_session_failed',
      status: 'failed',
      summary: 'Agent session settlement / session=agent_session_failed / status=failed / action=inspect_terminal_evidence / requiresOpenCheckpoint=no / autoReplay=no',
    });

    expect(projectAgentSessionSettlement(buildSession({
      id: 'agent_session_cancelled',
      status: 'cancelled',
    }))).toEqual({
      action: 'inspect_terminal_evidence',
      sessionId: 'agent_session_cancelled',
      status: 'cancelled',
      summary: 'Agent session settlement / session=agent_session_cancelled / status=cancelled / action=inspect_terminal_evidence / requiresOpenCheckpoint=no / autoReplay=no',
    });
  });
});
