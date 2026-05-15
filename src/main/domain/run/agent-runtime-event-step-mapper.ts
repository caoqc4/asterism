import type { AgentSessionEvent } from '../../../shared/types/agent-execution.js';
import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';
import { classifyRuntimeActionEvent } from '../../../shared/runtime-surface-routing.js';

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
    event.sessionId ? `session=${event.sessionId}` : null,
    event.tool ? `tool=${event.tool}` : null,
    event.decisionId ? `decision=${event.decisionId}` : null,
    `checkpoint=${event.checkpointId}`,
  ].filter(Boolean).join('\n');
}

function pausedSessionInput(event: Extract<AgentSessionEvent, { type: 'session.paused' }>): string {
  return [
    event.sessionId ? `session=${event.sessionId}` : null,
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
        kind: classifyRuntimeActionEvent({ kind: 'session_started' }).runStepKind,
        status: 'running',
        title: 'Agent session started',
        output: `mode=${event.mode}`,
      };
    case 'plan.proposed':
      return {
        runId: event.runId,
        kind: classifyRuntimeActionEvent({ kind: 'plan_proposed', text: event.summary }).runStepKind,
        status: 'completed',
        title: 'Agent plan proposed',
        input: event.detail ?? `source=${event.source}`,
        output: event.summary,
      };
    case 'model.completed':
      return {
        runId: event.runId,
        kind: classifyRuntimeActionEvent({ kind: 'model_completed', text: event.output }).runStepKind,
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
        kind: classifyRuntimeActionEvent({ kind: 'tool_started', operation: event.tool }).runStepKind,
        status: 'running',
        title: `Tool started: ${event.tool}`,
        input: stringifyInput(event.input),
      };
    case 'tool.completed':
      return {
        runId: event.runId,
        kind: classifyRuntimeActionEvent({
          kind: 'tool_completed',
          operation: event.tool,
          text: event.result.output ?? event.result.summary,
        }).runStepKind,
        status: 'completed',
        title: `Tool completed: ${event.tool}`,
        output: event.result.output ?? event.result.summary,
      };
    case 'tool.failed':
      return {
        runId: event.runId,
        kind: classifyRuntimeActionEvent({
          kind: 'tool_failed',
          operation: event.tool,
          text: event.result?.output ?? event.result?.summary ?? event.error,
        }).runStepKind,
        status: 'failed',
        title: `Tool failed: ${event.tool}`,
        output: event.result?.output ?? event.result?.summary ?? null,
        error: event.error,
      };
    case 'checkpoint.created':
      return {
        runId: event.runId,
        kind: classifyRuntimeActionEvent({
          kind: 'checkpoint_created',
          checkpointKind: event.checkpointKind,
          operation: event.tool ?? event.checkpointKind,
          text: event.reason,
          requiresConfirmation: true,
        }).runStepKind,
        status: 'pending',
        title: `Checkpoint created: ${event.checkpointKind}`,
        input: checkpointInput(event),
        output: event.reason,
      };
    case 'session.heartbeat':
      return {
        runId: event.runId,
        kind: classifyRuntimeActionEvent({ kind: 'session_heartbeat', text: event.summary }).runStepKind,
        status: 'running',
        title: 'Agent session heartbeat',
        output: event.summary,
      };
    case 'session.paused':
      return {
        runId: event.runId,
        kind: classifyRuntimeActionEvent({
          kind: 'session_paused',
          text: event.message,
          requiresConfirmation: true,
        }).runStepKind,
        status: 'pending',
        title: 'Agent session paused',
        input: pausedSessionInput(event),
        output: event.message,
      };
    case 'session.completed':
      return {
        runId: event.runId,
        kind: classifyRuntimeActionEvent({ kind: 'session_completed', text: event.output }).runStepKind,
        status: 'completed',
        title: 'Agent session completed',
        output: event.output,
      };
    case 'session.failed':
      return {
        runId: event.runId,
        kind: classifyRuntimeActionEvent({ kind: 'session_failed', text: event.message }).runStepKind,
        status: 'failed',
        title: 'Agent session failed',
        error: event.message,
      };
    case 'session.interrupted':
      return {
        runId: event.runId,
        kind: classifyRuntimeActionEvent({ kind: 'session_interrupted', text: event.reason }).runStepKind,
        status: 'failed',
        title: 'Agent session interrupted',
        error: event.reason,
      };
    case 'session.cancelled':
      return {
        runId: event.runId,
        kind: classifyRuntimeActionEvent({ kind: 'session_cancelled', text: event.reason }).runStepKind,
        status: 'failed',
        title: 'Agent session cancelled',
        error: event.reason,
      };
  }
}
