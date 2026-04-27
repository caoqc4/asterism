import { describe, expect, it } from 'vitest';

import {
  AGENT_RUNTIME_EVENT_TYPES,
  isCheckpointAgentRuntimeEvent,
  isTerminalAgentRuntimeEvent,
} from './agent-runtime-events.js';
import type { AgentSessionEvent } from './types/agent-execution.js';

describe('agent runtime events', () => {
  it('lists the v2 runtime event spine in execution order', () => {
    expect(AGENT_RUNTIME_EVENT_TYPES).toEqual([
      'session.started',
      'plan.proposed',
      'model.completed',
      'tool.started',
      'tool.completed',
      'tool.failed',
      'checkpoint.created',
      'session.heartbeat',
      'session.paused',
      'session.completed',
      'session.failed',
      'session.interrupted',
      'session.cancelled',
    ]);
  });

  it('types checkpoint events with resume metadata instead of raw payload blobs', () => {
    const event = {
      type: 'checkpoint.created',
      runId: 'run_1',
      sessionId: 'agent_session_1',
      checkpointId: 'run_checkpoint_1',
      checkpointKind: 'tool_permission',
      reason: 'Confirm local note creation before continuing.',
      decisionId: 'decision_1',
      tool: 'artifact.create_note',
    } satisfies AgentSessionEvent;

    expect(isCheckpointAgentRuntimeEvent(event)).toBe(true);
    expect(isTerminalAgentRuntimeEvent(event)).toBe(false);
  });

  it('recognizes terminal runtime events before the event-to-run-step mapper exists', () => {
    const paused = {
      type: 'session.paused',
      runId: 'run_1',
      checkpointId: 'run_checkpoint_1',
      message: 'Waiting for user confirmation.',
    } satisfies AgentSessionEvent;
    const completed = {
      type: 'session.completed',
      runId: 'run_1',
      output: 'Final agent output',
    } satisfies AgentSessionEvent;
    const failed = {
      type: 'session.failed',
      runId: 'run_1',
      failureKind: 'tool',
      message: 'Tool failed.',
    } satisfies AgentSessionEvent;
    const interrupted = {
      type: 'session.interrupted',
      runId: 'run_1',
      reason: 'Executor process exited before final output.',
    } satisfies AgentSessionEvent;
    const cancelled = {
      type: 'session.cancelled',
      runId: 'run_1',
      reason: 'User cancelled the executor.',
    } satisfies AgentSessionEvent;
    const heartbeat = {
      type: 'session.heartbeat',
      runId: 'run_1',
      summary: 'Executor still active.',
    } satisfies AgentSessionEvent;

    expect([paused, completed, failed, interrupted, cancelled].every(isTerminalAgentRuntimeEvent)).toBe(true);
    expect(isTerminalAgentRuntimeEvent(heartbeat)).toBe(false);
  });
});
