import { describe, expect, it } from 'vitest';

import type { AgentSessionRecord } from './types/agent-execution.js';
import type { RunStepRecord } from './types/run.js';
import {
  buildAgentSessionRecoveryIntent,
  buildAgentSessionReplayReview,
} from './agent-session-replay.js';

function buildSession(status: AgentSessionRecord['status']): AgentSessionRecord {
  return {
    id: 'agent_session_1',
    runId: 'run_1',
    mode: 'agent',
    status,
    capabilities: {
      fileContext: true,
      longRunningSessions: true,
      streaming: false,
      structuredToolCalls: false,
      taskMutationTools: false,
      textOnlyPlanning: true,
    },
    metadata: 'executor=local_agent',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildStep(partial: Partial<RunStepRecord>): RunStepRecord {
  return {
    id: partial.id ?? 'step_1',
    runId: partial.runId ?? 'run_1',
    index: partial.index ?? 1,
    kind: partial.kind ?? 'plan',
    status: partial.status ?? 'completed',
    title: partial.title ?? 'Step',
    input: partial.input ?? null,
    output: partial.output ?? null,
    error: partial.error ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('agent session replay review', () => {
  it('summarizes completed sessions as inspect-only evidence review', () => {
    expect(buildAgentSessionReplayReview({
      session: buildSession('completed'),
      steps: [
        buildStep({ index: 1, kind: 'plan', title: 'Plan' }),
        buildStep({ index: 2, kind: 'final', title: 'Final output' }),
      ],
    })).toEqual({
      latestStepStatus: 'completed',
      latestStepTitle: 'Final output',
      mode: 'inspect_only',
      openCheckpointCount: 0,
      restartSafety: 'terminal_evidence',
      runStepCount: 2,
      sessionId: 'agent_session_1',
      status: 'completed',
      summary: 'Replay review：inspect completed evidence / mode=inspect_only / session=agent_session_1 / status=completed / restartSafety=terminal_evidence / steps=2 / openCheckpoints=0 / latest=final:completed:Final output / autoReplay=no',
    });
  });

  it('routes confirmation and paused sessions to manual resume only', () => {
    expect(buildAgentSessionReplayReview({
      checkpoints: [
        { status: 'open' },
        { status: 'resolved' },
      ],
      session: buildSession('needs_confirmation'),
      steps: [
        buildStep({ index: 1, kind: 'checkpoint', status: 'pending', title: 'Tool permission checkpoint' }),
      ],
    }).summary).toBe(
      'Replay review：resume only after Decision approval / mode=manual_resume / session=agent_session_1 / status=needs_confirmation / restartSafety=checkpoint_gated / steps=1 / openCheckpoints=1 / latest=checkpoint:pending:Tool permission checkpoint / autoReplay=no',
    );

    expect(buildAgentSessionReplayReview({
      session: buildSession('paused'),
      steps: [],
    })).toMatchObject({
      latestStepStatus: null,
      latestStepTitle: null,
      mode: 'inspect_only',
      openCheckpointCount: 0,
      restartSafety: 'checkpoint_missing',
      summary: 'Replay review：inspect paused evidence; no open checkpoint / mode=inspect_only / session=agent_session_1 / status=paused / restartSafety=checkpoint_missing / steps=0 / openCheckpoints=0 / latest=none / autoReplay=no',
    });

    expect(buildAgentSessionReplayReview({
      checkpoints: [{ status: 'resolved' }],
      session: buildSession('needs_confirmation'),
      steps: [
        buildStep({ index: 1, kind: 'checkpoint', status: 'completed', title: 'Resolved checkpoint' }),
      ],
    })).toMatchObject({
      mode: 'inspect_only',
      openCheckpointCount: 0,
      restartSafety: 'checkpoint_missing',
      summary: 'Replay review：inspect confirmation evidence; no open checkpoint / mode=inspect_only / session=agent_session_1 / status=needs_confirmation / restartSafety=checkpoint_missing / steps=1 / openCheckpoints=0 / latest=checkpoint:completed:Resolved checkpoint / autoReplay=no',
    });
  });

  it('routes failed and cancelled sessions away from auto replay', () => {
    const review = buildAgentSessionReplayReview({
      session: buildSession('failed'),
      steps: [
        buildStep({ index: 2, kind: 'tool_result', status: 'failed', title: 'Tool failed' }),
      ],
    });

    expect(review).toMatchObject({
      latestStepStatus: 'failed',
      mode: 'new_run',
      restartSafety: 'new_run_required',
      summary: 'Replay review：inspect failed steps before starting a new run / mode=new_run / session=agent_session_1 / status=failed / restartSafety=new_run_required / steps=1 / openCheckpoints=0 / latest=tool_result:failed:Tool failed / autoReplay=no',
    });
    expect(buildAgentSessionRecoveryIntent(review)).toEqual({
      action: 'prepare_new_manual_run',
      automaticReplayAllowed: false,
      manualRunRequired: true,
      resumeCheckpointRequired: false,
      summary: 'Recovery intent：prepare new manual run / session=agent_session_1 / status=failed / restartSafety=new_run_required / openCheckpoints=0 / manualRunRequired=yes / autoReplay=no',
    });
  });

  it('marks running sessions without an active latest step as interrupted or stale', () => {
    expect(buildAgentSessionReplayReview({
      session: buildSession('running'),
      steps: [
        buildStep({ index: 1, kind: 'plan', status: 'completed', title: 'Plan accepted' }),
      ],
    })).toMatchObject({
      mode: 'inspect_only',
      restartSafety: 'interrupted_or_stale',
      summary: 'Replay review：inspect latest step before any recovery / mode=inspect_only / session=agent_session_1 / status=running / restartSafety=interrupted_or_stale / steps=1 / openCheckpoints=0 / latest=plan:completed:Plan accepted / autoReplay=no',
    });

    expect(buildAgentSessionReplayReview({
      session: buildSession('running'),
      steps: [
        buildStep({ index: 1, kind: 'tool_call', status: 'running', title: 'Tool running' }),
      ],
    })).toMatchObject({
      restartSafety: 'live_status_unknown',
    });
  });

  it('projects replay review into explicit recovery intent without replay authority', () => {
    const manualResumeReview = buildAgentSessionReplayReview({
      checkpoints: [{ status: 'open' }],
      session: buildSession('paused'),
      steps: [
        buildStep({ index: 1, kind: 'checkpoint', status: 'pending', title: 'Resume checkpoint' }),
      ],
    });
    expect(buildAgentSessionRecoveryIntent(manualResumeReview)).toEqual({
      action: 'manual_checkpoint_resume',
      automaticReplayAllowed: false,
      manualRunRequired: false,
      resumeCheckpointRequired: true,
      summary: 'Recovery intent：manual checkpoint resume / session=agent_session_1 / status=paused / restartSafety=checkpoint_gated / openCheckpoints=1 / manualRunRequired=no / autoReplay=no',
    });

    const interruptedReview = buildAgentSessionReplayReview({
      session: buildSession('running'),
      steps: [
        buildStep({ index: 1, kind: 'plan', status: 'completed', title: 'Plan accepted' }),
      ],
    });
    expect(buildAgentSessionRecoveryIntent(interruptedReview)).toMatchObject({
      action: 'prepare_new_manual_run',
      automaticReplayAllowed: false,
      manualRunRequired: true,
      resumeCheckpointRequired: false,
    });

    const activeReview = buildAgentSessionReplayReview({
      session: buildSession('running'),
      steps: [
        buildStep({ index: 1, kind: 'tool_call', status: 'running', title: 'Tool running' }),
      ],
    });
    expect(buildAgentSessionRecoveryIntent(activeReview)).toMatchObject({
      action: 'inspect_evidence',
      automaticReplayAllowed: false,
      manualRunRequired: false,
      resumeCheckpointRequired: false,
    });
  });
});
