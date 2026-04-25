import type { AgentSandboxCodingLaneEligibility } from './agent-sandbox-provider.js';
import type { ProviderToolCallPlan } from './types/agent-execution.js';

export function formatLocalAgentSessionMetadata(
  sandboxEligibility?: AgentSandboxCodingLaneEligibility | null,
  sandboxPatchReviewAdapter?: {
    reason: string;
    status: 'available' | 'disabled';
  } | null,
): string {
  const parts = [
    'executor=local_agent',
    'loop=local_note',
    `sandboxCoding=${sandboxEligibility ? sandboxEligibility.eligible ? 'eligible' : 'blocked' : 'disabled'}`,
    `sandboxProvider=${sandboxEligibility ? sandboxEligibility.eligible ? 'eligible' : 'not_ready' : 'disabled'}`,
    'sandboxPromotion=decision_required',
  ];

  if (sandboxEligibility?.blockedReasons.length) {
    parts.push(`sandboxBlockedReasons=${sandboxEligibility.blockedReasons.join('; ')}`);
  }

  if (sandboxPatchReviewAdapter) {
    parts.push(`sandboxPatchReviewAdapter=${sandboxPatchReviewAdapter.status}`);
    parts.push(`sandboxPatchReviewAdapterReason=${sandboxPatchReviewAdapter.reason}`);
  }

  return parts.join('\n');
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
