import type { AgentSessionEvent } from './types/agent-execution.js';

export const AGENT_RUNTIME_EVENT_TYPES = [
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
] as const satisfies readonly AgentSessionEvent['type'][];

export type AgentRuntimeEventType = typeof AGENT_RUNTIME_EVENT_TYPES[number];

export function isTerminalAgentRuntimeEvent(
  event: AgentSessionEvent,
): event is Extract<AgentSessionEvent, {
  type:
    | 'session.paused'
    | 'session.completed'
    | 'session.failed'
    | 'session.interrupted'
    | 'session.cancelled';
}> {
  return (
    event.type === 'session.paused' ||
    event.type === 'session.completed' ||
    event.type === 'session.failed' ||
    event.type === 'session.interrupted' ||
    event.type === 'session.cancelled'
  );
}

export function isCheckpointAgentRuntimeEvent(
  event: AgentSessionEvent,
): event is Extract<AgentSessionEvent, { type: 'checkpoint.created' }> {
  return event.type === 'checkpoint.created';
}
