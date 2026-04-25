import type { AgentSessionEvent } from '../../../shared/types/agent-execution.js';
import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';

export type AgentRuntimeRunStepDraft = {
  runId: string;
  kind: RunStepKind;
  status?: RunStepStatus;
  title: string;
  input?: string | null;
  output?: string | null;
  error?: string | null;
};

function stringifyInput(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable input]';
  }
}

function checkpointInput(event: Extract<AgentSessionEvent, { type: 'checkpoint.created' }>): string {
  return [
    `kind=${event.checkpointKind}`,
    event.tool ? `tool=${event.tool}` : null,
    event.decisionId ? `decision=${event.decisionId}` : null,
    `checkpoint=${event.checkpointId}`,
  ].filter(Boolean).join('\n');
}

export function mapAgentRuntimeEventToRunStep(
  event: AgentSessionEvent,
): AgentRuntimeRunStepDraft {
  switch (event.type) {
    case 'session.started':
      return {
        runId: event.runId,
        kind: 'plan',
        status: 'running',
        title: 'Agent session started',
        output: `mode=${event.mode}`,
      };
    case 'plan.proposed':
      return {
        runId: event.runId,
        kind: 'plan',
        status: 'completed',
        title: 'Agent plan proposed',
        input: `source=${event.source}`,
        output: event.summary,
      };
    case 'model.completed':
      return {
        runId: event.runId,
        kind: 'model',
        status: 'completed',
        title: 'Model output',
        input: [
          event.provider ? `provider=${event.provider}` : null,
          event.model ? `model=${event.model}` : null,
        ].filter(Boolean).join('\n') || null,
        output: event.output,
      };
    case 'tool.started':
      return {
        runId: event.runId,
        kind: 'tool_call',
        status: 'running',
        title: `Tool started: ${event.tool}`,
        input: stringifyInput(event.input),
      };
    case 'tool.completed':
      return {
        runId: event.runId,
        kind: 'tool_result',
        status: 'completed',
        title: `Tool completed: ${event.tool}`,
        output: event.result.output ?? event.result.summary,
      };
    case 'tool.failed':
      return {
        runId: event.runId,
        kind: 'tool_result',
        status: 'failed',
        title: `Tool failed: ${event.tool}`,
        output: event.result?.output ?? event.result?.summary ?? null,
        error: event.error,
      };
    case 'checkpoint.created':
      return {
        runId: event.runId,
        kind: 'checkpoint',
        status: 'pending',
        title: `Checkpoint created: ${event.checkpointKind}`,
        input: checkpointInput(event),
        output: event.reason,
      };
    case 'session.paused':
      return {
        runId: event.runId,
        kind: 'checkpoint',
        status: 'pending',
        title: 'Agent session paused',
        input: `checkpoint=${event.checkpointId}`,
        output: event.message,
      };
    case 'session.completed':
      return {
        runId: event.runId,
        kind: 'final',
        status: 'completed',
        title: 'Agent session completed',
        output: event.output,
      };
    case 'session.failed':
      return {
        runId: event.runId,
        kind: 'final',
        status: 'failed',
        title: 'Agent session failed',
        error: event.message,
      };
  }
}
