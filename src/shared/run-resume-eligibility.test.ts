import { describe, expect, it } from 'vitest';

import type { AgentSessionRecord } from './types/agent-execution.js';
import type { RunCheckpointRecord } from './types/run.js';
import {
  evaluatePausedRunResumeEligibility,
  getSessionScopedReplayCheckpoints,
} from './run-resume-eligibility.js';

function buildCheckpoint(partial: Partial<RunCheckpointRecord> = {}): RunCheckpointRecord {
  return {
    id: partial.id ?? 'run_checkpoint_resume',
    runId: partial.runId ?? 'run_1',
    stepId: partial.stepId ?? null,
    kind: partial.kind ?? 'resume',
    status: partial.status ?? 'open',
    payload: partial.payload ?? JSON.stringify({
      version: 1,
      kind: 'resume',
      runId: partial.runId ?? 'run_1',
      taskId: 'task_1',
      nextTool: 'artifact.create_note',
      nextInput: { title: 'Recovered note', content: 'Recovered note' },
    }),
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    resolvedAt: partial.resolvedAt ?? null,
  };
}

function buildSession(partial: Partial<AgentSessionRecord> = {}): AgentSessionRecord {
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

describe('run resume eligibility', () => {
  it('selects one valid supported open resume checkpoint', () => {
    const checkpoint = buildCheckpoint();

    expect(evaluatePausedRunResumeEligibility({
      checkpoints: [checkpoint],
      runId: 'run_1',
      taskId: 'task_1',
    })).toMatchObject({
      status: 'eligible',
      checkpoint,
      payload: expect.objectContaining({
        nextTool: 'artifact.create_note',
      }),
    });
  });

  it('blocks stale, unsupported, ambiguous, and session-detached resume checkpoints', () => {
    expect(evaluatePausedRunResumeEligibility({
      checkpoints: [],
      runId: 'run_1',
      taskId: 'task_1',
    })).toEqual({
      status: 'blocked',
      reason: 'Open resume checkpoint not found for run: run_1',
    });

    expect(evaluatePausedRunResumeEligibility({
      checkpoints: [
        buildCheckpoint({
          payload: JSON.stringify({
            version: 1,
            kind: 'resume',
            runId: 'run_other',
            taskId: 'task_1',
            nextTool: 'artifact.create_note',
            nextInput: { title: 'Recovered note', content: 'Recovered note' },
          }),
        }),
      ],
      runId: 'run_1',
      taskId: 'task_1',
    })).toEqual({
      status: 'blocked',
      reason: 'Resume checkpoint run_checkpoint_resume is not valid: Resume checkpoint payload runId does not match run: run_1.',
    });

    expect(evaluatePausedRunResumeEligibility({
      checkpoints: [
        buildCheckpoint({
          id: 'run_checkpoint_unsupported_tool',
          payload: JSON.stringify({
            version: 1,
            kind: 'resume',
            runId: 'run_1',
            taskId: 'task_1',
            nextTool: 'unknown.execute',
            nextInput: {},
          }),
        }),
      ],
      runId: 'run_1',
      taskId: 'task_1',
    })).toEqual({
      status: 'blocked',
      reason: 'Resume checkpoint run_checkpoint_unsupported_tool is not valid: Unsupported resume tool: unknown.execute',
    });

    expect(evaluatePausedRunResumeEligibility({
      checkpoints: [
        buildCheckpoint({
          id: 'run_checkpoint_valid_but_not_resumable',
          payload: JSON.stringify({
            version: 1,
            kind: 'resume',
            runId: 'run_1',
            taskId: 'task_1',
            nextTool: 'workspace.search',
            nextInput: { query: 'launch notes' },
          }),
        }),
      ],
      runId: 'run_1',
      taskId: 'task_1',
    })).toEqual({
      status: 'blocked',
      reason: 'Resume checkpoint run_checkpoint_valid_but_not_resumable uses unsupported tool: workspace.search',
    });

    expect(evaluatePausedRunResumeEligibility({
      checkpoints: [
        buildCheckpoint({ id: 'run_checkpoint_resume_a' }),
        buildCheckpoint({ id: 'run_checkpoint_resume_b' }),
      ],
      runId: 'run_1',
      taskId: 'task_1',
    })).toEqual({
      status: 'blocked',
      reason: 'Multiple open resume checkpoints found for run: run_1: run_checkpoint_resume_a, run_checkpoint_resume_b.',
    });

    expect(evaluatePausedRunResumeEligibility({
      agentSessions: [],
      checkpoints: [
        buildCheckpoint({
          payload: JSON.stringify({
            version: 1,
            kind: 'resume',
            agentSessionId: 'agent_session_missing',
            runId: 'run_1',
            taskId: 'task_1',
            nextTool: 'artifact.create_note',
            nextInput: { title: 'Recovered note', content: 'Recovered note' },
          }),
        }),
      ],
      runId: 'run_1',
      taskId: 'task_1',
    })).toEqual({
      status: 'blocked',
      reason: 'Resume checkpoint agent session is not resumable for run: run_1 (agent_session_missing).',
    });
  });

  it('accepts payload-bound paused or confirmation sessions and rejects running sessions', () => {
    const checkpoint = buildCheckpoint({
      payload: JSON.stringify({
        version: 1,
        kind: 'resume',
        agentSessionId: 'agent_session_1',
        runId: 'run_1',
        taskId: 'task_1',
        nextTool: 'artifact.create_note',
        nextInput: { title: 'Recovered note', content: 'Recovered note' },
      }),
    });

    expect(evaluatePausedRunResumeEligibility({
      agentSessions: [buildSession({ status: 'needs_confirmation' })],
      checkpoints: [checkpoint],
      runId: 'run_1',
      taskId: 'task_1',
    })).toMatchObject({ status: 'eligible' });

    expect(evaluatePausedRunResumeEligibility({
      agentSessions: [buildSession({ status: 'running' })],
      checkpoints: [checkpoint],
      runId: 'run_1',
      taskId: 'task_1',
    })).toEqual({
      status: 'blocked',
      reason: 'Resume checkpoint agent session is not resumable for run: run_1 (agent_session_1).',
    });
  });

  it('filters replay checkpoints by payload-bound session while preserving legacy unbound checkpoints', () => {
    const unbound = buildCheckpoint({ id: 'run_checkpoint_legacy' });
    const current = buildCheckpoint({
      id: 'run_checkpoint_current',
      payload: JSON.stringify({
        kind: 'resume',
        agentSessionId: 'agent_session_current',
        nextTool: 'artifact.create_note',
        nextInput: { title: 'Recovered note', content: 'Recovered note' },
      }),
    });
    const other = buildCheckpoint({
      id: 'run_checkpoint_other',
      payload: JSON.stringify({
        kind: 'resume',
        agentSessionId: 'agent_session_other',
        nextTool: 'artifact.create_note',
        nextInput: { title: 'Recovered note', content: 'Recovered note' },
      }),
    });

    expect(getSessionScopedReplayCheckpoints([
      unbound,
      current,
      other,
    ], 'agent_session_current').map((item) => item.id)).toEqual([
      'run_checkpoint_legacy',
      'run_checkpoint_current',
    ]);
  });
});
