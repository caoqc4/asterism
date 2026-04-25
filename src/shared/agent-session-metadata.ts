import type { ProviderToolCallPlan } from './types/agent-execution.js';

export function formatLocalAgentSessionMetadata(): string {
  return [
    'executor=local_agent',
    'loop=local_note',
  ].join('\n');
}

export function formatProviderNativeAgentSessionMetadata(plan: ProviderToolCallPlan): string {
  return [
    'executor=provider_native_agent',
    'loop=provider_tool_call',
    `provider=${plan.provider}`,
    `model=${plan.model}`,
    'adapter=provider_native_tool_call_adapter',
    `rawSummary=${plan.rawSummary}`,
    `providerCallIds=${plan.providerCallIds.join(',') || 'none'}`,
    `stopReason=${plan.stopReason ?? 'unknown'}`,
  ].join('\n');
}
