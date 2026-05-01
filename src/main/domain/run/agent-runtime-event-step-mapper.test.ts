import { describe, expect, it } from 'vitest';

import type { AgentSessionEvent } from '../../../shared/types/agent-execution.js';
import { mapAgentRuntimeEventToRunStep } from './agent-runtime-event-step-mapper.js';

describe('mapAgentRuntimeEventToRunStep', () => {
  it('maps plan and model events into product-level run steps', () => {
    expect(mapAgentRuntimeEventToRunStep({
      type: 'plan.proposed',
      runId: 'run_1',
      source: 'provider_tool_call',
      detail: '{"steps":[]}',
      summary: 'Inspect context, then create a note.',
    })).toEqual({
      runId: 'run_1',
      kind: 'plan',
      status: 'completed',
      title: 'Agent plan proposed',
      input: '{"steps":[]}',
      output: 'Inspect context, then create a note.',
    });

    expect(mapAgentRuntimeEventToRunStep({
      type: 'model.completed',
      runId: 'run_1',
      provider: 'openai-compatible',
      model: 'relay-model',
      output: 'Model output',
    })).toMatchObject({
      kind: 'model',
      status: 'completed',
      input: 'provider=openai-compatible\nmodel=relay-model',
      output: 'Model output',
    });
  });

  it('maps tool events into call/result steps without executing the tool', () => {
    expect(mapAgentRuntimeEventToRunStep({
      type: 'tool.started',
      runId: 'run_1',
      tool: 'workspace.search',
      input: { query: 'AgentToolRegistry' },
    })).toEqual({
      runId: 'run_1',
      kind: 'tool_call',
      status: 'running',
      title: 'Tool started: workspace.search',
      input: '{"query":"AgentToolRegistry"}',
    });

    expect(mapAgentRuntimeEventToRunStep({
      type: 'tool.completed',
      runId: 'run_1',
      tool: 'workspace.search',
      result: {
        success: true,
        summary: 'Searched workspace',
        output: 'src/main/domain/run/agent-tool-registry.ts',
      },
    })).toMatchObject({
      kind: 'tool_result',
      status: 'completed',
      title: 'Tool completed: workspace.search',
      output: 'src/main/domain/run/agent-tool-registry.ts',
    });
  });

  it('maps checkpoint events with enough metadata for review surfaces', () => {
    const event = {
      type: 'checkpoint.created',
      runId: 'run_1',
      sessionId: 'agent_session_1',
      checkpointId: 'run_checkpoint_1',
      checkpointKind: 'tool_permission',
      reason: 'Confirm workspace command before continuing.',
      decisionId: 'decision_1',
      tool: 'workspace.run_command',
    } satisfies AgentSessionEvent;

    expect(mapAgentRuntimeEventToRunStep(event)).toEqual({
      runId: 'run_1',
      kind: 'checkpoint',
      status: 'pending',
      title: 'Checkpoint created: tool_permission',
      input: 'kind=tool_permission\nsession=agent_session_1\ntool=workspace.run_command\ndecision=decision_1\ncheckpoint=run_checkpoint_1',
      output: 'Confirm workspace command before continuing.',
    });
  });

  it('maps terminal session events into checkpoint or final steps', () => {
    expect(mapAgentRuntimeEventToRunStep({
      type: 'session.heartbeat',
      runId: 'run_1',
      summary: 'Executor still active.',
    })).toMatchObject({
      kind: 'plan',
      status: 'running',
      title: 'Agent session heartbeat',
      output: 'Executor still active.',
    });

    expect(mapAgentRuntimeEventToRunStep({
      type: 'session.paused',
      runId: 'run_1',
      sessionId: 'agent_session_1',
      checkpointId: 'run_checkpoint_1',
      message: 'Waiting for user confirmation.',
    })).toMatchObject({
      kind: 'checkpoint',
      status: 'pending',
      title: 'Agent session paused',
      input: 'session=agent_session_1\ncheckpoint=run_checkpoint_1',
    });

    expect(mapAgentRuntimeEventToRunStep({
      type: 'session.completed',
      runId: 'run_1',
      output: 'Final output',
    })).toMatchObject({
      kind: 'final',
      status: 'completed',
      output: 'Final output',
    });

    expect(mapAgentRuntimeEventToRunStep({
      type: 'session.failed',
      runId: 'run_1',
      failureKind: 'tool',
      message: 'Tool failed.',
    })).toMatchObject({
      kind: 'final',
      status: 'failed',
      error: 'Tool failed.',
    });

    expect(mapAgentRuntimeEventToRunStep({
      type: 'session.interrupted',
      runId: 'run_1',
      reason: 'Executor process exited.',
    })).toMatchObject({
      kind: 'final',
      status: 'failed',
      title: 'Agent session interrupted',
      error: 'Executor process exited.',
    });

    expect(mapAgentRuntimeEventToRunStep({
      type: 'session.cancelled',
      runId: 'run_1',
      reason: 'User cancelled.',
    })).toMatchObject({
      kind: 'final',
      status: 'failed',
      title: 'Agent session cancelled',
      error: 'User cancelled.',
    });
  });
});
