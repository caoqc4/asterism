import type { AgentSessionRecord } from '@shared/types/agent-execution';
import type { AiConfigStatus } from '@shared/types/settings';
import { getProviderExecutionCapabilities } from '@shared/agent-provider-capabilities';

const SANDBOX_CODING_DISABLED_SUMMARY = 'sandbox coding lane disabled; workspace patch/commands unavailable';
const SANDBOX_CODING_GATED_SUMMARY = 'sandbox coding lane gate enabled; waiting for provider eligibility';
const CODE_AGENT_AUTOMATIC_START_POLICY_SUMMARY =
  'Automatic start：disabled / requires mature skill or process, complete inputs, allowed tools, risk policy, accepted evidence or explicit enablement, and runtime readiness / no scheduler or auto-run flag is persisted';

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

function formatPreRunSandboxCodingSummary(aiStatus: AiConfigStatus | null): string {
  if (!aiStatus?.featureFlags.enableSandboxCodingAgent) {
    return SANDBOX_CODING_DISABLED_SUMMARY;
  }

  const producerBackendReadiness = aiStatus.sandboxBackendStatus?.producerBackendReadiness;
  if (producerBackendReadiness) {
    return producerBackendReadiness.summary;
  }

  return SANDBOX_CODING_GATED_SUMMARY;
}

export function formatAgentSessionCapabilitySummary(session: AgentSessionRecord): string {
  const metadataEntries = parseAgentSessionMetadata(session.metadata);
  if (metadataEntries.get('executor') === 'sandboxed_coding_producer') {
    return [
      'sandboxed coding producer',
      metadataEntries.get('producerStatus') ? `status=${metadataEntries.get('producerStatus')}` : null,
      metadataEntries.get('backend') ? `backend=${metadataEntries.get('backend')}` : null,
      metadataEntries.get('commands') ? `checks=${metadataEntries.get('commands')}` : null,
      metadataEntries.get('network') ? `network=${metadataEntries.get('network')}` : null,
      metadataEntries.get('promotion') ? `promotion=${metadataEntries.get('promotion')}` : null,
      'read-only workspace input',
      'staged patch output',
      'Decision review required',
    ].filter(Boolean).join(' / ');
  }

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
    SANDBOX_CODING_DISABLED_SUMMARY,
    capabilities.longRunningSessions ? 'long-running session' : 'single local session',
  ];

  return parts.join(' / ');
}

export function formatAgentSessionMetadataSummary(session: AgentSessionRecord): string | null {
  if (!session.metadata?.trim()) {
    return null;
  }

  const entries = parseAgentSessionMetadata(session.metadata);
  const executor = entries.get('executor');
  const loop = entries.get('loop');
  const provider = entries.get('provider');
  const model = entries.get('model');
  const adapter = entries.get('adapter');
  const rawSummary = entries.get('rawSummary');
  const providerCallIds = entries.get('providerCallIds');
  const stopReason = entries.get('stopReason');
  const sandboxCoding = entries.get('sandboxCoding');
  const sandboxProvider = entries.get('sandboxProvider');
  const sandboxPromotion = entries.get('sandboxPromotion');
  const sandboxBlockedReasons = entries.get('sandboxBlockedReasons');
  const sandboxPatchReviewAdapter = entries.get('sandboxPatchReviewAdapter');
  const sandboxPatchReviewAdapterReason = entries.get('sandboxPatchReviewAdapterReason');
  const sandboxPatchReviewPlan = entries.get('sandboxPatchReviewPlan');
  const sandboxPatchReviewPlanSummary = entries.get('sandboxPatchReviewPlanSummary');
  const sandboxPatchReviewPlanReason = entries.get('sandboxPatchReviewPlanReason');
  const producerStatus = entries.get('producerStatus');
  const producerSource = entries.get('producerSource');
  const sessionId = entries.get('sessionId');
  const sourceId = entries.get('sourceId');
  const commands = entries.get('commands');
  const network = entries.get('network');
  const promotion = entries.get('promotion');
  const backend = entries.get('backend');
  const blockedReasons = entries.get('blockedReasons');
  const summary = entries.get('summary');

  if (executor === 'provider_native_agent') {
    return [
      'Provider-native session',
      provider && model ? `${provider} / ${model}` : null,
      adapter ? `adapter=${adapter}` : null,
      rawSummary ? `raw=${rawSummary}` : null,
      providerCallIds ? `calls=${providerCallIds}` : null,
      stopReason ? `stop=${stopReason}` : null,
    ].filter(Boolean).join(' / ');
  }

  if (executor === 'sandboxed_coding_producer') {
    return [
      'Sandboxed coding producer',
      producerStatus ? `status=${producerStatus}` : null,
      producerSource ? `producer=${formatSandboxProducerSourceLabel(producerSource)}` : null,
      provider && model ? `${provider} / ${model}` : provider ? `provider=${provider}` : null,
      sessionId ? `session=${sessionId}` : null,
      sourceId ? `source=${sourceId}` : null,
      backend ? `backend=${backend}` : null,
      commands ? `commands=${commands}` : null,
      network ? `network=${network}` : null,
      promotion ? `promotion=${promotion}` : null,
      blockedReasons ? `blockedReasons=${blockedReasons}` : null,
      summary ? `summary=${summary}` : null,
    ].filter(Boolean).join(' / ');
  }

  if (executor || loop) {
    return [
      executor ? `executor=${executor}` : null,
      loop ? `loop=${loop}` : null,
      sandboxCoding ? `sandboxCoding=${sandboxCoding}` : null,
      sandboxProvider ? `sandboxProvider=${sandboxProvider}` : null,
      sandboxPromotion ? `sandboxPromotion=${sandboxPromotion}` : null,
      sandboxBlockedReasons ? `sandboxBlockedReasons=${sandboxBlockedReasons}` : null,
      sandboxPatchReviewAdapter ? `sandboxPatchReviewAdapter=${sandboxPatchReviewAdapter}` : null,
      sandboxPatchReviewAdapterReason ? `sandboxPatchReviewAdapterReason=${sandboxPatchReviewAdapterReason}` : null,
      sandboxPatchReviewPlan ? `sandboxPatchReviewPlan=${sandboxPatchReviewPlan}` : null,
      sandboxPatchReviewPlanSummary ? `sandboxPatchReviewPlanSummary=${sandboxPatchReviewPlanSummary}` : null,
      sandboxPatchReviewPlanReason ? `sandboxPatchReviewPlanReason=${sandboxPatchReviewPlanReason}` : null,
    ].filter(Boolean).join(' / ');
  }

  return session.metadata.trim();
}

export function formatSandboxProducerSourceSummary(session: AgentSessionRecord): string | null {
  const entries = parseAgentSessionMetadata(session.metadata);
  if (entries.get('executor') !== 'sandboxed_coding_producer') {
    return null;
  }

  const producerSource = entries.get('producerSource');
  if (producerSource === 'local_diagnostic') {
    return 'Producer source：local diagnostic preview / no provider call';
  }

  if (producerSource === 'model_backed') {
    return 'Producer source：model-backed / provider call already spent for this run / Decision promotion still required';
  }

  return null;
}

function formatSandboxProducerSourceLabel(source: string): string {
  if (source === 'local_diagnostic') {
    return 'local diagnostic preview';
  }

  if (source === 'model_backed') {
    return 'model-backed';
  }

  return source;
}

export function formatSandboxProducerLifecycleSummary(
  session: AgentSessionRecord | null,
): string | null {
  if (!session) {
    return null;
  }

  const entries = parseAgentSessionMetadata(session.metadata);
  if (entries.get('executor') !== 'sandboxed_coding_producer') {
    return null;
  }

  const status = entries.get('producerStatus') ?? session.status;
  const lifecycleLabel = getSandboxProducerLifecycleLabel(status);
  const source = entries.get('sourceId');
  const files = entries.get('files');
  const commands = entries.get('commands');
  const network = entries.get('network');
  const promotion = entries.get('promotion');
  const blockedReasons = entries.get('blockedReasons');
  const nextMove = getSandboxProducerLifecycleNextMove(status);
  const policy = [
    network ? `network=${network}` : null,
    promotion ? `promotion=${promotion}` : null,
    'workspace mutation requires approved Decision',
  ].filter(Boolean).join(', ');

  return [
    `AgentRunLifecycle：${lifecycleLabel}`,
    source ? `source=${source}` : null,
    files ? `files=${files}` : null,
    commands ? `checks=${commands}` : null,
    `policy=${policy}`,
    blockedReasons ? `blocked=${blockedReasons}` : null,
    nextMove ? `next=${nextMove}` : null,
  ].filter(Boolean).join(' / ');
}

function getSandboxProducerLifecycleLabel(status: string): string {
  const labels: Record<string, string> = {
    ready: 'ready',
    confirmed: 'confirmed',
    running: 'running checks',
    blocked: 'blocked',
    failed: 'failed',
    paused: 'paused',
    source_ready: 'source-ready',
    completed: 'completed',
  };

  return labels[status] ?? status;
}

function getSandboxProducerLifecycleNextMove(status: string): string | null {
  const nextMoves: Record<string, string> = {
    blocked: 'fix runtime readiness, then start a new manual run',
    failed: 'review failed check/tool evidence before retry',
    paused: 'resolve the linked Decision or checkpoint',
    source_ready: 'review patch-promotion Decision; workspace changes only after approval',
    completed: 'review result evidence before closing the task',
    running: 'wait for check evidence and staged patch source',
  };

  return nextMoves[status] ?? null;
}

function parseAgentSessionMetadata(metadata?: string | null): Map<string, string> {
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
    formatPreRunSandboxCodingSummary(aiStatus),
  ].join(' / ');
}

export function formatExecutionRuntimeReadinessSummary(
  aiStatus: AiConfigStatus | null,
  pending = false,
): string {
  if (pending) {
    return 'ExecutionRuntime：检查中 / 不启动 producer / 不修改工作区';
  }

  const status = aiStatus?.sandboxBackendStatus;
  if (!status) {
    return 'ExecutionRuntime：未检查 / local_container / staged patch requires manual readiness check';
  }

  const producerReadiness = status.producerBackendReadiness;
  if (producerReadiness?.ready) {
    return `ExecutionRuntime：ready / ${producerReadiness.summary}`;
  }

  if (producerReadiness) {
    return `ExecutionRuntime：blocked / ${producerReadiness.summary}`;
  }

  if (status.readiness?.ready) {
    return `ExecutionRuntime：backend ready / ${status.readiness.summary} / producer readiness not checked`;
  }

  if (status.readiness) {
    return `ExecutionRuntime：blocked / ${status.readiness.summary}`;
  }

  return `ExecutionRuntime：not ready / ${status.summary}`;
}

export type CodeAgentStartGateInput = {
  aiStatus: AiConfigStatus | null;
  operatorConfirmed: boolean;
  runPending: boolean;
  selectedContextFileCount: number;
  testCheck: boolean;
  testCheckAvailable: boolean;
  lintCheck: boolean;
  lintCheckAvailable: boolean;
  useModelProducer: boolean;
};

export function formatCodeAgentStartBlockedReason(input: CodeAgentStartGateInput): string | null {
  if (input.runPending) {
    return 'Start blocked：run is already starting.';
  }

  if (!input.aiStatus?.sandboxBackendStatus?.producerBackendReadiness?.ready) {
    return 'Start blocked：check Code Agent runtime readiness first.';
  }

  if (!input.operatorConfirmed) {
    return 'Start blocked：confirm Docker/Decision review before starting.';
  }

  if (input.useModelProducer && input.selectedContextFileCount === 0) {
    return 'Start blocked：select at least one context file before using model producer.';
  }

  if (!input.testCheckAvailable && !input.lintCheckAvailable) {
    return 'Start blocked：no package.json test/lint scripts are available.';
  }

  if (!input.testCheck && !input.lintCheck) {
    return 'Start blocked：select at least one available allowlisted check.';
  }

  return null;
}

export function formatCodeAgentPreflightSummary(input: CodeAgentStartGateInput): string {
  const blockedReason = formatCodeAgentStartBlockedReason(input);
  const runtimeSummary = input.aiStatus?.sandboxBackendStatus?.producerBackendReadiness?.ready
    ? 'runtime=ready'
    : 'runtime=needs readiness check';
  const availableChecks = [
    input.testCheckAvailable ? 'test' : null,
    input.lintCheckAvailable ? 'lint' : null,
  ].filter(Boolean).join(',');
  const selectedChecks = [
    input.testCheck ? 'test' : null,
    input.lintCheck ? 'lint' : null,
  ].filter(Boolean).join(',');
  const checkSummary = availableChecks
    ? selectedChecks
      ? `checks=${selectedChecks}`
      : `checks=none selected; available=${availableChecks}`
    : 'checks=unavailable';
  const producerSummary = input.useModelProducer
    ? input.selectedContextFileCount > 0
      ? `producer=model-backed; context=${input.selectedContextFileCount}`
      : 'producer=model-backed; context required'
    : 'producer=local diagnostic; no provider call';

  return [
    `Code Agent preflight：${blockedReason ? 'blocked' : 'ready'}`,
    runtimeSummary,
    checkSummary,
    producerSummary,
    'promotion=Decision required',
    blockedReason ? blockedReason.replace('Start blocked：', 'next=') : 'next=start sandbox preview',
  ].join(' / ');
}

export function formatCodeAgentAutomaticStartPolicySummary(): string {
  return CODE_AGENT_AUTOMATIC_START_POLICY_SUMMARY;
}

export function formatCodeAgentModelProducerOptInSummary(aiStatus: AiConfigStatus | null): string {
  return aiStatus?.codeAgentModelProducerEnabled
    ? 'Model producer：available by local env / provider calls require Use model producer, context files, and operator confirmation / sandbox preview and Decision promotion still apply'
    : 'Model producer：disabled / manual preview uses the local diagnostic producer and does not call the provider';
}
