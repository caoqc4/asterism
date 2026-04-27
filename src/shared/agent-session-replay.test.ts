import { describe, expect, it } from 'vitest';

import type { AgentSessionRecord } from './types/agent-execution.js';
import type { RunStepRecord } from './types/run.js';
import { buildAgentSessionReplayReview } from './agent-session-replay.js';

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
      runStepCount: 2,
      sessionId: 'agent_session_1',
      status: 'completed',
      summary: 'Replay review：inspect completed evidence / mode=inspect_only / session=agent_session_1 / status=completed / steps=2 / latest=final:completed:Final output / autoReplay=no',
    });
  });

  it('routes confirmation and paused sessions to manual resume only', () => {
    expect(buildAgentSessionReplayReview({
      session: buildSession('needs_confirmation'),
      steps: [
        buildStep({ index: 1, kind: 'checkpoint', status: 'pending', title: 'Tool permission checkpoint' }),
      ],
    }).summary).toBe(
      'Replay review：resume only after Decision approval / mode=manual_resume / session=agent_session_1 / status=needs_confirmation / steps=1 / latest=checkpoint:pending:Tool permission checkpoint / autoReplay=no',
    );

    expect(buildAgentSessionReplayReview({
      session: buildSession('paused'),
      steps: [],
    })).toMatchObject({
      latestStepStatus: null,
      latestStepTitle: null,
      mode: 'manual_resume',
      summary: 'Replay review：resume only through the open checkpoint / mode=manual_resume / session=agent_session_1 / status=paused / steps=0 / latest=none / autoReplay=no',
    });
  });

  it('routes failed and cancelled sessions away from auto replay', () => {
    expect(buildAgentSessionReplayReview({
      session: buildSession('failed'),
      steps: [
        buildStep({ index: 2, kind: 'tool_result', status: 'failed', title: 'Tool failed' }),
      ],
    })).toMatchObject({
      latestStepStatus: 'failed',
      mode: 'new_run',
      summary: 'Replay review：inspect failed steps before starting a new run / mode=new_run / session=agent_session_1 / status=failed / steps=1 / latest=tool_result:failed:Tool failed / autoReplay=no',
    });
  });
});
