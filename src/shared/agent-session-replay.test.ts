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
      automaticReplayAllowed: false,
      latestStepKind: 'final',
      latestStepStatus: 'completed',
      latestStepTitle: 'Final output',
      mode: 'inspect_only',
      openCheckpointCount: 0,
      recoveryCheckpointCount: 0,
      restartSafety: 'terminal_evidence',
      runStepCount: 2,
      sessionId: 'agent_session_1',
      status: 'completed',
      summary: 'Replay review：inspect completed evidence / mode=inspect_only / session=agent_session_1 / status=completed / restartSafety=terminal_evidence / steps=2 / openCheckpoints=0 / recoveryCheckpoints=0 / latest=final:completed:Final output / autoReplay=no',
    });
  });

  it('routes confirmation and paused sessions to manual resume only', () => {
    expect(buildAgentSessionReplayReview({
      checkpoints: [
        { kind: 'tool_permission', status: 'open' },
        { kind: 'tool_permission', status: 'resolved' },
      ],
      session: buildSession('needs_confirmation'),
      steps: [
        buildStep({ index: 1, kind: 'checkpoint', status: 'pending', title: 'Tool permission checkpoint' }),
      ],
    })).toMatchObject({
      latestStepKind: 'checkpoint',
      latestStepStatus: 'pending',
      latestStepTitle: 'Tool permission checkpoint',
      recoveryCheckpointCount: 1,
      summary: 'Replay review：resume only after Decision approval / mode=manual_resume / session=agent_session_1 / status=needs_confirmation / restartSafety=checkpoint_gated / steps=1 / openCheckpoints=1 / recoveryCheckpoints=1 / latest=checkpoint:pending:Tool permission checkpoint / autoReplay=no',
    });

    expect(buildAgentSessionReplayReview({
      session: buildSession('paused'),
      steps: [],
    })).toMatchObject({
      latestStepKind: null,
      latestStepStatus: null,
      latestStepTitle: null,
      mode: 'inspect_only',
      openCheckpointCount: 0,
      recoveryCheckpointCount: 0,
      restartSafety: 'checkpoint_missing',
      summary: 'Replay review：inspect paused evidence; no recovery checkpoint / mode=inspect_only / session=agent_session_1 / status=paused / restartSafety=checkpoint_missing / steps=0 / openCheckpoints=0 / recoveryCheckpoints=0 / latest=none / autoReplay=no',
    });

    expect(buildAgentSessionReplayReview({
      checkpoints: [{ kind: 'patch_promotion', status: 'open' }],
      session: buildSession('paused'),
      steps: [
        buildStep({ index: 1, kind: 'checkpoint', status: 'pending', title: 'Unrelated patch promotion' }),
      ],
    })).toMatchObject({
      mode: 'inspect_only',
      openCheckpointCount: 1,
      recoveryCheckpointCount: 0,
      restartSafety: 'checkpoint_missing',
      summary: 'Replay review：inspect paused evidence; no recovery checkpoint / mode=inspect_only / session=agent_session_1 / status=paused / restartSafety=checkpoint_missing / steps=1 / openCheckpoints=1 / recoveryCheckpoints=0 / latest=checkpoint:pending:Unrelated patch promotion / autoReplay=no',
    });

    expect(buildAgentSessionReplayReview({
      checkpoints: [{ kind: 'tool_permission', status: 'resolved' }],
      session: buildSession('needs_confirmation'),
      steps: [
        buildStep({ index: 1, kind: 'checkpoint', status: 'completed', title: 'Resolved checkpoint' }),
      ],
    })).toMatchObject({
      latestStepKind: 'checkpoint',
      latestStepStatus: 'completed',
      latestStepTitle: 'Resolved checkpoint',
      mode: 'inspect_only',
      openCheckpointCount: 0,
      recoveryCheckpointCount: 0,
      restartSafety: 'checkpoint_missing',
      summary: 'Replay review：inspect confirmation evidence; no recovery checkpoint / mode=inspect_only / session=agent_session_1 / status=needs_confirmation / restartSafety=checkpoint_missing / steps=1 / openCheckpoints=0 / recoveryCheckpoints=0 / latest=checkpoint:completed:Resolved checkpoint / autoReplay=no',
    });

    expect(buildAgentSessionReplayReview({
      checkpoints: [{ kind: 'resume', status: 'open' }],
      session: buildSession('needs_confirmation'),
      steps: [
        buildStep({ index: 1, kind: 'checkpoint', status: 'pending', title: 'Unrelated resume checkpoint' }),
      ],
    })).toMatchObject({
      mode: 'inspect_only',
      openCheckpointCount: 1,
      recoveryCheckpointCount: 0,
      restartSafety: 'checkpoint_missing',
      summary: 'Replay review：inspect confirmation evidence; no recovery checkpoint / mode=inspect_only / session=agent_session_1 / status=needs_confirmation / restartSafety=checkpoint_missing / steps=1 / openCheckpoints=1 / recoveryCheckpoints=0 / latest=checkpoint:pending:Unrelated resume checkpoint / autoReplay=no',
    });

    expect(buildAgentSessionReplayReview({
      checkpoints: [{ kind: 'external_wait', status: 'open' }],
      session: buildSession('needs_confirmation'),
      steps: [
        buildStep({ index: 1, kind: 'checkpoint', status: 'pending', title: 'External wait checkpoint' }),
      ],
    })).toMatchObject({
      mode: 'inspect_only',
      openCheckpointCount: 1,
      recoveryCheckpointCount: 0,
      restartSafety: 'checkpoint_missing',
      summary: 'Replay review：inspect confirmation evidence; no recovery checkpoint / mode=inspect_only / session=agent_session_1 / status=needs_confirmation / restartSafety=checkpoint_missing / steps=1 / openCheckpoints=1 / recoveryCheckpoints=0 / latest=checkpoint:pending:External wait checkpoint / autoReplay=no',
    });

    expect(buildAgentSessionReplayReview({
      checkpoints: [{ kind: 'confirmation', status: 'open' }],
      session: buildSession('needs_confirmation'),
      steps: [
        buildStep({ index: 1, kind: 'checkpoint', status: 'pending', title: 'Generic confirmation checkpoint' }),
      ],
    })).toMatchObject({
      mode: 'manual_resume',
      openCheckpointCount: 1,
      recoveryCheckpointCount: 1,
      restartSafety: 'checkpoint_gated',
      summary: 'Replay review：resume only after Decision approval / mode=manual_resume / session=agent_session_1 / status=needs_confirmation / restartSafety=checkpoint_gated / steps=1 / openCheckpoints=1 / recoveryCheckpoints=1 / latest=checkpoint:pending:Generic confirmation checkpoint / autoReplay=no',
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
      latestStepKind: 'tool_result',
      latestStepStatus: 'failed',
      mode: 'new_run',
      restartSafety: 'new_run_required',
      summary: 'Replay review：inspect failed steps before starting a new run / mode=new_run / session=agent_session_1 / status=failed / restartSafety=new_run_required / steps=1 / openCheckpoints=0 / recoveryCheckpoints=0 / latest=tool_result:failed:Tool failed / autoReplay=no',
    });
    expect(buildAgentSessionRecoveryIntent(review)).toEqual({
      action: 'prepare_new_manual_run',
      automaticReplayAllowed: false,
      manualRunRequired: true,
      openCheckpointCount: 0,
      recoveryCheckpointCount: 0,
      recoveryCheckpointRequired: false,
      restartSafety: 'new_run_required',
      resumeCheckpointRequired: false,
      sessionId: 'agent_session_1',
      status: 'failed',
      summary: 'Recovery intent：prepare new manual run / session=agent_session_1 / status=failed / restartSafety=new_run_required / openCheckpoints=0 / recoveryCheckpoints=0 / recoveryCheckpointRequired=no / manualRunRequired=yes / autoReplay=no',
    });

    const cancelledReview = buildAgentSessionReplayReview({
      session: buildSession('cancelled'),
      steps: [
        buildStep({ index: 2, kind: 'final', status: 'failed', title: 'Agent session cancelled' }),
      ],
    });
    expect(cancelledReview).toMatchObject({
      latestStepKind: 'final',
      latestStepStatus: 'failed',
      mode: 'new_run',
      restartSafety: 'new_run_required',
      summary: 'Replay review：inspect cancellation evidence before starting a new run / mode=new_run / session=agent_session_1 / status=cancelled / restartSafety=new_run_required / steps=1 / openCheckpoints=0 / recoveryCheckpoints=0 / latest=final:failed:Agent session cancelled / autoReplay=no',
    });
    expect(buildAgentSessionRecoveryIntent(cancelledReview)).toEqual({
      action: 'prepare_new_manual_run',
      automaticReplayAllowed: false,
      manualRunRequired: true,
      openCheckpointCount: 0,
      recoveryCheckpointCount: 0,
      recoveryCheckpointRequired: false,
      restartSafety: 'new_run_required',
      resumeCheckpointRequired: false,
      sessionId: 'agent_session_1',
      status: 'cancelled',
      summary: 'Recovery intent：prepare new manual run / session=agent_session_1 / status=cancelled / restartSafety=new_run_required / openCheckpoints=0 / recoveryCheckpoints=0 / recoveryCheckpointRequired=no / manualRunRequired=yes / autoReplay=no',
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
      summary: 'Replay review：inspect latest step before any recovery / mode=inspect_only / session=agent_session_1 / status=running / restartSafety=interrupted_or_stale / steps=1 / openCheckpoints=0 / recoveryCheckpoints=0 / latest=plan:completed:Plan accepted / autoReplay=no',
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

  it('uses created time as the latest-step tie-breaker when step indexes match', () => {
    expect(buildAgentSessionReplayReview({
      session: buildSession('running'),
      steps: [
        buildStep({
          id: 'step_old',
          index: 1,
          kind: 'plan',
          status: 'completed',
          title: 'Older plan step',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
        buildStep({
          id: 'step_new',
          index: 1,
          kind: 'tool_call',
          status: 'running',
          title: 'Newer tool still running',
          createdAt: '2026-01-01T00:01:00.000Z',
        }),
      ],
    })).toMatchObject({
      latestStepKind: 'tool_call',
      latestStepStatus: 'running',
      latestStepTitle: 'Newer tool still running',
      restartSafety: 'live_status_unknown',
      summary: 'Replay review：inspect latest step before any recovery / mode=inspect_only / session=agent_session_1 / status=running / restartSafety=live_status_unknown / steps=2 / openCheckpoints=0 / recoveryCheckpoints=0 / latest=tool_call:running:Newer tool still running / autoReplay=no',
    });
  });

  it('projects replay review into explicit recovery intent without replay authority', () => {
    const manualResumeReview = buildAgentSessionReplayReview({
      checkpoints: [{ kind: 'resume', status: 'open' }],
      session: buildSession('paused'),
      steps: [
        buildStep({ index: 1, kind: 'checkpoint', status: 'pending', title: 'Resume checkpoint' }),
      ],
    });
    expect(buildAgentSessionRecoveryIntent(manualResumeReview)).toEqual({
      action: 'manual_checkpoint_resume',
      automaticReplayAllowed: false,
      manualRunRequired: false,
      openCheckpointCount: 1,
      recoveryCheckpointCount: 1,
      recoveryCheckpointRequired: true,
      restartSafety: 'checkpoint_gated',
      resumeCheckpointRequired: true,
      sessionId: 'agent_session_1',
      status: 'paused',
      summary: 'Recovery intent：manual checkpoint resume / session=agent_session_1 / status=paused / restartSafety=checkpoint_gated / openCheckpoints=1 / recoveryCheckpoints=1 / recoveryCheckpointRequired=yes / manualRunRequired=no / autoReplay=no',
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
      openCheckpointCount: 0,
      recoveryCheckpointCount: 0,
      recoveryCheckpointRequired: false,
      restartSafety: 'interrupted_or_stale',
      resumeCheckpointRequired: false,
      sessionId: 'agent_session_1',
      status: 'running',
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
      openCheckpointCount: 0,
      recoveryCheckpointCount: 0,
      recoveryCheckpointRequired: false,
      restartSafety: 'live_status_unknown',
      resumeCheckpointRequired: false,
      sessionId: 'agent_session_1',
      status: 'running',
    });
  });
});
