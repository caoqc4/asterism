import type { AgentToolName } from './types/agent-execution.js';

export const AGENT_TOOL_NAMES = [
  'artifact.create_note',
  'decision.draft',
  'source_context.create',
  'task.create_completion_criterion',
  'task.inspect_context',
  'task.inspect_timeline',
  'task.review_completion_evidence',
  'task.update_next_step',
  'workspace.read_file',
  'workspace.run_command',
  'workspace.search',
  'workspace.write_patch',
] as const satisfies readonly AgentToolName[];

const AGENT_TOOL_NAME_SET = new Set<string>(AGENT_TOOL_NAMES);

export function isAgentToolName(value: unknown): value is AgentToolName {
  return typeof value === 'string' && AGENT_TOOL_NAME_SET.has(value);
}
