import type { AgentSandboxCodingLaneEligibility } from './agent-sandbox-provider.js';
import type { AgentSessionRecord, ProviderToolCallPlan } from './types/agent-execution.js';

export type SandboxedCodingProducerSessionMetadataInput = {
  backendId?: string | null;
  blockedReasons?: string[];
  commandScripts: string[];
  network: 'disabled' | 'allowlisted';
  promotion: 'decision_required';
  providerKind: string;
  producerSource?: 'local_diagnostic' | 'model_backed' | null;
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
    ...(input.producerSource ? [`producerSource=${input.producerSource}`] : []),
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

export type AgentSessionSourceMetadata = {
  backend: string | null;
  executor: string | null;
  loop: string | null;
  model: string | null;
  producerSource: string | null;
  provider: string | null;
  sessionId: string | null;
  sourceId: string | null;
};

export function parseAgentSessionMetadata(metadata?: string | null): Map<string, string> {
  return new Map(
    (metadata ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        return separatorIndex > 0
          ? [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)] as const
          : [line, ''] as const;
      }),
  );
}

export function getAgentSessionSourceMetadata(
  session: Pick<AgentSessionRecord, 'metadata'>,
): AgentSessionSourceMetadata {
  const entries = parseAgentSessionMetadata(session.metadata);

  return {
    backend: entries.get('backend') ?? null,
    executor: entries.get('executor') ?? null,
    loop: entries.get('loop') ?? null,
    model: entries.get('model') ?? null,
    producerSource: entries.get('producerSource') ?? null,
    provider: entries.get('provider') ?? null,
    sessionId: entries.get('sessionId') ?? null,
    sourceId: entries.get('sourceId') ?? null,
  };
}

export function formatAgentSessionToolFamilySummary(session: AgentSessionRecord): string {
  const source = getAgentSessionSourceMetadata(session);
  const workspace = source.executor === 'sandboxed_coding_producer'
    ? 'workspace=staged_patch_review'
    : session.capabilities.fileContext
      ? 'workspace=read_only'
      : 'workspace=not_exposed';
  const task = session.capabilities.taskMutationTools
    ? 'task=update_tools'
    : 'task=not_exposed';
  const modelTools = session.capabilities.structuredToolCalls
    ? 'provider_tools=structured'
    : 'provider_tools=not_exposed';
  const coding = source.executor === 'sandboxed_coding_producer'
    ? 'coding=sandboxed_producer'
    : 'coding=not_exposed';

  return [
    workspace,
    task,
    modelTools,
    coding,
    'browser=not_exposed',
    'computer_use=not_exposed',
    'mcp=not_exposed',
    'creator=not_exposed',
    session.capabilities.longRunningSessions
      ? 'restart=long_running_session_recorded'
      : 'restart=single_session_recorded',
  ].join(' / ');
}

export function formatAgentSessionRestartHint(session: AgentSessionRecord): string {
  switch (session.status) {
    case 'completed':
      return 'restart=not_needed / replay=run_steps_and_artifacts';
    case 'needs_confirmation':
      return 'restart=checkpoint_expected / replay=verify_decision_checkpoint';
    case 'paused':
      return 'restart=checkpoint_expected / replay=verify_resume_checkpoint';
    case 'failed':
      return 'restart=new_run_required / replay=inspect_failed_steps';
    case 'cancelled':
      return 'restart=not_resumable / replay=inspect_decision_history';
    case 'running':
      return session.capabilities.longRunningSessions
        ? 'restart=session_recorded / replay=inspect_latest_run_step'
        : 'restart=single_session_in_progress / replay=inspect_latest_run_step';
  }
}

function sanitizeMetadataValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
