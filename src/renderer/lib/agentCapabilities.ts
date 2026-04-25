import type { AgentSessionRecord } from '@shared/types/agent-execution';
import type { AiConfigStatus } from '@shared/types/settings';
import { getProviderExecutionCapabilities } from '@shared/agent-provider-capabilities';

function formatProviderSummary(aiStatus: AiConfigStatus | null): string {
  if (!aiStatus?.provider || !aiStatus.model) {
    return 'provider not configured';
  }

  return `${aiStatus.provider} / ${aiStatus.model}`;
}

function formatPreRunStructuredToolSummary(aiStatus: AiConfigStatus | null): string {
  const capabilities = getProviderExecutionCapabilities(aiStatus);

  if (capabilities.structuredToolCallState === 'unconfigured') {
    return 'structured tool calls unavailable until AI config is ready';
  }

  if (capabilities.structuredToolCallState === 'unavailable_on_replicate_text_path') {
    return 'structured tool calls unavailable on native Replicate text path';
  }

  if (capabilities.structuredToolCallState === 'safe_read_tools_available') {
    return 'structured tool calls enabled for provider safe-read tools';
  }

  return 'structured tool calls disabled until provider-native flag is enabled';
}

export function formatAgentSessionCapabilitySummary(session: AgentSessionRecord): string {
  const capabilities = session.capabilities;
  const parts = [
    capabilities.textOnlyPlanning ? 'text-only planning' : 'text planning unavailable',
    capabilities.fileContext
      ? 'read-only workspace context enabled'
      : 'read-only workspace context unavailable',
    capabilities.taskMutationTools
      ? 'task update/evidence tools enabled'
      : 'task update/evidence tools unavailable',
    capabilities.structuredToolCalls
      ? 'structured tool calls'
      : 'structured tool calls unavailable',
    'patch/commands unavailable',
    capabilities.longRunningSessions ? 'long-running session' : 'single local session',
  ];

  return parts.join(' / ');
}

export function formatAgentSessionMetadataSummary(session: AgentSessionRecord): string | null {
  if (!session.metadata?.trim()) {
    return null;
  }

  const entries = new Map(
    session.metadata
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
  const executor = entries.get('executor');
  const loop = entries.get('loop');
  const provider = entries.get('provider');
  const model = entries.get('model');
  const adapter = entries.get('adapter');
  const providerCallIds = entries.get('providerCallIds');
  const stopReason = entries.get('stopReason');

  if (executor === 'provider_native_agent') {
    return [
      'Provider-native session',
      provider && model ? `${provider} / ${model}` : null,
      adapter ? `adapter=${adapter}` : null,
      providerCallIds ? `calls=${providerCallIds}` : null,
      stopReason ? `stop=${stopReason}` : null,
    ].filter(Boolean).join(' / ');
  }

  if (executor || loop) {
    return [
      executor ? `executor=${executor}` : null,
      loop ? `loop=${loop}` : null,
    ].filter(Boolean).join(' / ');
  }

  return session.metadata.trim();
}

export function formatPreRunAgentCapabilitySummary(
  aiStatus: AiConfigStatus | null,
  allowLocalWorkspaceRead: boolean,
  allowTaskMutationTools = false,
): string {
  const providerSummary = formatProviderSummary(aiStatus);
  const providerCapabilities = getProviderExecutionCapabilities(aiStatus);
  const planningSummary = providerCapabilities.textPlanningPath === 'unconfigured'
    ? 'text-only planning unavailable until AI config is ready'
    : providerCapabilities.textPlanningPath === 'replicate_native_text'
      ? 'text-only planning via Replicate'
      : 'text-only planning in the local executor';
  const workspaceSummary = allowLocalWorkspaceRead
    ? 'read-only workspace context enabled for this run'
    : 'read-only workspace context disabled for this run';
  const taskToolsSummary = allowTaskMutationTools
    ? 'task update/evidence tools enabled for this run'
    : 'task update/evidence tools disabled for this run';

  return [
    `Agent 能力预览：${providerSummary}`,
    planningSummary,
    workspaceSummary,
    taskToolsSummary,
    formatPreRunStructuredToolSummary(aiStatus),
    'patch/commands unavailable',
  ].join(' / ');
}
