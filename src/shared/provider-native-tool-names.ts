import type { AgentToolName } from './types/agent-execution.js';
import { isAgentToolName } from './agent-tools.js';

const TASKPLANE_PROVIDER_TOOL_PREFIX = 'taskplane__';

export function toProviderNativeToolName(name: AgentToolName): string {
  return `${TASKPLANE_PROVIDER_TOOL_PREFIX}${name.replaceAll('.', '__')}`;
}

export function resolveProviderNativeToolName(value: unknown): AgentToolName | null {
  if (isAgentToolName(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.startsWith(TASKPLANE_PROVIDER_TOOL_PREFIX)) {
    return null;
  }

  const candidate = value
    .slice(TASKPLANE_PROVIDER_TOOL_PREFIX.length)
    .replaceAll('__', '.');

  return isAgentToolName(candidate) ? candidate : null;
}
