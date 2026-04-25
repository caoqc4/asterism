import type { AgentSandboxCodingLaneEligibility } from './agent-sandbox-provider.js';
import type { ProviderToolCallPlan } from './types/agent-execution.js';

export type SandboxedCodingProducerSessionMetadataInput = {
  backendId?: string | null;
  blockedReasons?: string[];
  commandScripts: string[];
  network: 'disabled' | 'allowlisted';
  promotion: 'decision_required';
  providerKind: string;
  sessionId: string;
  sourceId: string;
  status: 'prepared' | 'running' | 'source_ready' | 'blocked' | 'failed' | 'paused';
  summary?: string | null;
  workspaceRoot: string;
};

export function formatLocalAgentSessionMetadata(
  sandboxEligibility?: AgentSandboxCodingLaneEligibility | null,
  sandboxPatchReviewAdapter?: {
    reason: string;
    status: 'available' | 'disabled';
  } | null,
  sandboxPatchReviewPlan?: {
    reason?: string | null;
    status: 'blocked' | 'ready';
    summary: string;
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

  if (sandboxPatchReviewPlan) {
    parts.push(`sandboxPatchReviewPlan=${sandboxPatchReviewPlan.status}`);
    parts.push(`sandboxPatchReviewPlanSummary=${sandboxPatchReviewPlan.summary}`);
    if (sandboxPatchReviewPlan.reason?.trim()) {
      parts.push(`sandboxPatchReviewPlanReason=${sandboxPatchReviewPlan.reason.trim()}`);
    }
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

export function formatSandboxedCodingProducerSessionMetadata(
  input: SandboxedCodingProducerSessionMetadataInput,
): string {
  const parts = [
    'executor=sandboxed_coding_producer',
    'loop=sandboxed_coding',
    `producerStatus=${sanitizeMetadataValue(input.status)}`,
    `sessionId=${sanitizeMetadataValue(input.sessionId)}`,
    `sourceId=${sanitizeMetadataValue(input.sourceId)}`,
    `provider=${sanitizeMetadataValue(input.providerKind)}`,
    `workspace=${sanitizeMetadataValue(input.workspaceRoot)}`,
    `commands=${sanitizeMetadataValue(input.commandScripts.join(',') || 'none')}`,
    `network=${sanitizeMetadataValue(input.network)}`,
    `promotion=${sanitizeMetadataValue(input.promotion)}`,
  ];

  if (input.backendId?.trim()) {
    parts.push(`backend=${sanitizeMetadataValue(input.backendId)}`);
  }

  if (input.blockedReasons?.length) {
    parts.push(`blockedReasons=${sanitizeMetadataValue(input.blockedReasons.join('; '))}`);
  }

  if (input.summary?.trim()) {
    parts.push(`summary=${sanitizeMetadataValue(input.summary)}`);
  }

  return parts.join('\n');
}

function sanitizeMetadataValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
