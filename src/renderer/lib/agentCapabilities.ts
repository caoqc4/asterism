import type { AgentSessionRecord } from '@shared/types/agent-execution';
import type { RunRecord, RunStepRecord } from '@shared/types/run';
import type { DecisionRecord } from '@shared/types/decision';
import type { AiConfigStatus } from '@shared/types/settings';
import { getProviderExecutionCapabilities } from '@shared/agent-provider-capabilities';
import {
  buildAgentSessionRecoveryIntent,
  buildAgentSessionReplayReview,
  type AgentSessionReplayCheckpointEvidence,
  type AgentSessionRecoveryIntent,
  type AgentSessionReplayReview,
} from '@shared/agent-session-replay';
import {
  formatAgentSessionRestartHint,
  formatAgentSessionToolFamilySummary,
  parseAgentSessionMetadata,
} from '@shared/agent-session-metadata';

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
    capabilities.longRunningSessions ? 'long-running session' : 'single-session record',
  ];

  return parts.join(' / ');
}

export function formatAgentSessionToolFamiliesSummary(session: AgentSessionRecord): string {
  return formatAgentSessionToolFamilySummary(session);
}

export function formatAgentSessionRestartSummary(session: AgentSessionRecord): string {
  return formatAgentSessionRestartHint(session);
}

export function formatAgentSessionReplayReviewSummary(
  session: AgentSessionRecord,
  steps: Pick<RunStepRecord, 'createdAt' | 'index' | 'kind' | 'status' | 'title'>[],
  checkpoints: AgentSessionReplayCheckpointEvidence[] = [],
): string {
  return buildAgentSessionReplayReview({ checkpoints, session, steps }).summary;
}

export function buildAgentSessionReplayReviewPresentation(
  session: AgentSessionRecord,
  steps: Pick<RunStepRecord, 'createdAt' | 'index' | 'kind' | 'status' | 'title'>[],
  checkpoints: AgentSessionReplayCheckpointEvidence[] = [],
): AgentSessionReplayReview {
  return buildAgentSessionReplayReview({ checkpoints, session, steps });
}

export function formatAgentSessionRecoveryIntentSummary(
  session: AgentSessionRecord,
  steps: Pick<RunStepRecord, 'createdAt' | 'index' | 'kind' | 'status' | 'title'>[],
  checkpoints: AgentSessionReplayCheckpointEvidence[] = [],
): string {
  const review = buildAgentSessionReplayReview({ checkpoints, session, steps });
  return buildAgentSessionRecoveryIntent(review).summary;
}

export function buildAgentSessionRecoveryIntentPresentation(
  session: AgentSessionRecord,
  steps: Pick<RunStepRecord, 'createdAt' | 'index' | 'kind' | 'status' | 'title'>[],
  checkpoints: AgentSessionReplayCheckpointEvidence[] = [],
): AgentSessionRecoveryIntent {
  const review = buildAgentSessionReplayReview({ checkpoints, session, steps });
  return buildAgentSessionRecoveryIntent(review);
}

export function formatAgentSessionReplayNextStepDraft(params: {
  runType: string;
  session: AgentSessionRecord;
  steps: Pick<RunStepRecord, 'createdAt' | 'index' | 'kind' | 'status' | 'title'>[];
  checkpoints?: AgentSessionReplayCheckpointEvidence[];
}): string {
  const review = buildAgentSessionReplayReview({
    checkpoints: params.checkpoints ?? [],
    session: params.session,
    steps: params.steps,
  });
  const recoveryIntent = buildAgentSessionRecoveryIntent(review);

  if (review.mode === 'manual_resume') {
    return review.recoveryCheckpointCount > 0
      ? `处理最近一次 ${params.runType} run 的 ${review.recoveryCheckpointCount} 个 recovery checkpoint / Decision，再决定是否继续执行。`
      : `复核最近一次 ${params.runType} run 的暂停或确认原因；没有 recovery checkpoint 时，先查看执行证据再决定是否重跑。`;
  }

  if (recoveryIntent.action === 'prepare_new_manual_run' && review.mode === 'new_run') {
    return `检查最近一次 ${params.runType} run 的失败或取消证据，整理重试输入后再启动新的 run。`;
  }

  if (review.restartSafety === 'interrupted_or_stale') {
    return `确认最近一次 ${params.runType} run 是否已中断；若没有活动执行器，先基于证据整理输入，再启动新的 run，不自动重放。`;
  }

  if (review.restartSafety === 'live_status_unknown') {
    return `确认最近一次 ${params.runType} run 是否仍有活动执行器；若无法确认，先查看最新步骤和证据，不自动重放。`;
  }

  if (review.restartSafety === 'checkpoint_missing') {
    return review.openCheckpointCount > 0
      ? `复核最近一次 ${params.runType} run 的暂停或确认原因；当前有 ${review.openCheckpointCount} 个 open checkpoint，但没有适用于该 session 的 recovery checkpoint。`
      : `复核最近一次 ${params.runType} run 的暂停或确认原因；没有 recovery checkpoint 时，先查看执行证据再决定是否重跑。`;
  }

  return review.status === 'running'
    ? `检查最近一次 ${params.runType} run 的最新步骤，确认是否仍在执行或需要人工介入。`
    : `审阅最近一次 ${params.runType} run 的证据和输出，再决定是否继续推进任务。`;
}

export function formatAgentSessionRecoveryRunInstructions(params: {
  runType: string;
  session: AgentSessionRecord;
  steps: Pick<RunStepRecord, 'createdAt' | 'index' | 'kind' | 'status' | 'title'>[];
  checkpoints?: AgentSessionReplayCheckpointEvidence[];
}): string | null {
  const review = buildAgentSessionReplayReview({
    checkpoints: params.checkpoints ?? [],
    session: params.session,
    steps: params.steps,
  });
  const recoveryIntent = buildAgentSessionRecoveryIntent(review);

  if (recoveryIntent.action !== 'prepare_new_manual_run') {
    return null;
  }

  const latest = review.latestStepTitle
    ? `最近步骤：${review.latestStepTitle}（${review.latestStepStatus ?? 'unknown'}）。`
    : '最近步骤：暂无。';

  return [
    `基于最近一次 ${params.runType} run 的证据准备新的手动 run。`,
    `来源：run=${params.session.runId} / session=${params.session.id}。`,
    latest,
    `恢复判断：${recoveryIntent.summary}`,
    '不要自动重放旧 session；先复核失败/取消/中断证据、补齐输入，再由用户手动启动。',
  ].join(' ');
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

export function isCodeAgentSandboxRun(
  run: Pick<RunRecord, 'failureReason' | 'instructions' | 'output' | 'type'>,
): boolean {
  if (run.type !== 'agent') {
    return false;
  }

  const evidence = [
    run.instructions,
    run.output,
    run.failureReason,
  ].filter(Boolean).join('\n');

  return evidence.includes('Code Agent manual sandbox producer preview')
    || evidence.includes('sandboxed coding producer')
    || evidence.includes('staged patch')
    || evidence.includes('patch review Decision');
}

export function isCodeAgentPromotionDecision(
  decision: Pick<DecisionRecord, 'sourceLabel' | 'title'>,
): boolean {
  return decision.sourceLabel === 'workspace.staged_patch'
    || decision.title.startsWith('Review Code Agent preview');
}

export function formatCodeAgentReviewRecoverySummary(
  run: Pick<RunRecord, 'failureReason' | 'output' | 'status'> | null,
  decision: Pick<DecisionRecord, 'id' | 'status' | 'title'> | null,
): string {
  if (!run && decision) {
    return '已有待处理的 Code Agent staged patch promotion Decision；先复核 Run 证据、staged patch 和 promotion Decision。';
  }

  if (!run) {
    return '当前没有可恢复的 Code Agent staged patch review。';
  }

  if (run.status === 'completed') {
    return decision
      ? '最近一次 Code Agent sandbox preview 已完成，先复核 Run 证据、staged patch 和 promotion Decision。'
      : '最近一次 Code Agent sandbox preview 已完成，但当前任务没有待处理 promotion Decision；请先从 Run 证据判断是否需要重跑。';
  }

  if (run.status === 'failed') {
    return `最近一次 Code Agent sandbox preview 失败：${run.failureReason || run.output || '未记录失败原因'}`;
  }

  if (run.status === 'paused' || run.status === 'needs_confirmation') {
    return '最近一次 Code Agent sandbox preview 正在等待 checkpoint / Decision 确认；先打开 Run 证据审查 staged patch / checkpoint，再决定是否续跑或重跑。';
  }

  return '最近一次 Code Agent sandbox preview 记录显示 running；先查看 Run 证据和最新步骤，再判断是否等待、重跑或新建 run。';
}

export function formatCodeAgentRerunIntent(params: {
  decisionTitle?: string | null;
  files?: string[];
  runId?: string | null;
  taskTitle?: string | null;
  workspaceStatus?: string | null;
}): string {
  if (!params.runId) {
    return [
      `Re-run the Code Agent staged patch review for ${params.taskTitle?.trim() || 'this task'}.`,
      params.decisionTitle ? `Review prior promotion Decision: ${params.decisionTitle}.` : null,
    ].filter(Boolean).join(' ');
  }

  return [
    `Re-run the Code Agent staged patch review for run ${params.runId}.`,
    params.files?.length ? `Review affected files: ${params.files.join(', ')}.` : null,
    params.decisionTitle ? `Compare against promotion Decision: ${params.decisionTitle}.` : null,
    params.workspaceStatus ? `Prior workspace status: ${params.workspaceStatus}.` : null,
  ].filter(Boolean).join(' ');
}

export function formatCodeAgentModelProducerOptInSummary(aiStatus: AiConfigStatus | null): string {
  return aiStatus?.codeAgentModelProducerEnabled
    ? 'Model producer：available by local env / provider calls require Use model producer, context files, and operator confirmation / sandbox preview and Decision promotion still apply'
    : 'Model producer：disabled / manual preview uses the local diagnostic producer and does not call the provider';
}
