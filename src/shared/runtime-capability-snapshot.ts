import type { AgentToolScaffoldFamily, AgentToolScaffoldFamilySummary } from './agent-tool-scaffold.js';
import type { CapabilityRegistryEntry } from './capability-registry.js';
import type { AiConfigStatus, AiRuntimeMode } from './types/settings.js';

export type RuntimeCapabilityStatus = 'available' | 'disabled' | 'unknown';
export type RuntimeExecutionSelectionKind = 'agent_cli' | 'agent_api' | 'unknown';

export type RuntimeExecutionSelectionSnapshot = {
  mode: AiRuntimeMode | null;
  kind: RuntimeExecutionSelectionKind;
  label: string;
  executable: boolean;
  reason: string;
};

export type RuntimeCapabilitySnapshot = {
  executionRuntime: RuntimeExecutionSelectionSnapshot;
  model: {
    configured: boolean;
    provider: string | null;
    model: string | null;
    producer: RuntimeCapabilityStatus;
  };
  workspace: {
    rootConfigured: boolean;
    lintAvailable: boolean;
    testAvailable: boolean;
  };
  flags: {
    scheduler: RuntimeCapabilityStatus;
    sandboxCodingAgent: RuntimeCapabilityStatus;
    selfCheck: RuntimeCapabilityStatus;
  };
  sandbox: {
    backendProbed: boolean;
    backendReady: boolean;
    producerBackendReady: boolean;
    summary: string | null;
    blockedReasons: string[];
  };
  tools: {
    familyCount: number;
    modelVisibleCount: number;
    checkpointRequiredCount: number;
    families: AgentToolScaffoldFamily[];
    summaries: AgentToolScaffoldFamilySummary[];
  };
  registry: {
    entryCount: number;
    availableCount: number;
    hiddenCount: number;
    modelVisibleCount: number;
    policyGatedCount: number;
    blockedCount: number;
  };
  summary: string;
};

function flagStatus(value: boolean | undefined): RuntimeCapabilityStatus {
  if (value === true) return 'available';
  if (value === false) return 'disabled';
  return 'unknown';
}

export function describeRuntimeExecutionSelection(mode: AiRuntimeMode | null | undefined): RuntimeExecutionSelectionSnapshot {
  if (mode === 'codex') {
    return {
      executable: true,
      kind: 'agent_cli',
      label: 'Codex CLI',
      mode,
      reason: 'Codex CLI is the selected first-version Agent CLI runtime.',
    };
  }
  if (mode === 'claude') {
    return {
      executable: true,
      kind: 'agent_cli',
      label: 'Claude Code',
      mode,
      reason: 'Claude Code is the selected first-version Agent CLI runtime.',
    };
  }
  if (mode === 'api') {
    return {
      executable: false,
      kind: 'agent_api',
      label: 'Agent API Runtime',
      mode,
      reason: 'Agent API Runtime is selected for supported provider-backed phases: chat, decomposition, decision, and scheduled brief. Task execution run remains deferred.',
    };
  }
  return {
    executable: false,
    kind: 'unknown',
    label: 'Unknown Runtime',
    mode: null,
    reason: 'No AI runtime mode is selected.',
  };
}

export function buildRuntimeCapabilitySnapshot(params: {
  aiStatus?: AiConfigStatus | null;
}): RuntimeCapabilitySnapshot {
  const aiStatus = params.aiStatus ?? null;
  const toolSummaries = aiStatus?.toolScaffoldSummaries ?? [];
  const modelVisibleCount = toolSummaries.reduce((sum, family) => sum + family.modelVisibleIds.length, 0);
  const checkpointRequiredCount = toolSummaries.reduce((sum, family) => sum + family.checkpointRequiredIds.length, 0);
  const registry = summarizeCapabilityRegistry(aiStatus?.capabilityRegistry ?? []);
  const sandboxBackendStatus = aiStatus?.sandboxBackendStatus ?? null;
  const sandboxReadiness = sandboxBackendStatus?.readiness ?? null;
  const producerReadiness = sandboxBackendStatus?.producerBackendReadiness ?? null;
  const executionRuntime = describeRuntimeExecutionSelection(aiStatus?.runtimeMode);
  const snapshot: RuntimeCapabilitySnapshot = {
    executionRuntime,
    model: {
      configured: Boolean(aiStatus?.configured),
      provider: aiStatus?.provider ?? null,
      model: aiStatus?.model ?? null,
      producer: aiStatus?.codeAgentModelProducerEnabled ? 'available' : 'disabled',
    },
    workspace: {
      rootConfigured: Boolean(aiStatus?.workspaceRoot),
      lintAvailable: Boolean(aiStatus?.codeAgentWorkspaceChecks?.lint.available),
      testAvailable: Boolean(aiStatus?.codeAgentWorkspaceChecks?.test.available),
    },
    flags: {
      scheduler: flagStatus(aiStatus?.featureFlags.enableScheduler),
      sandboxCodingAgent: flagStatus(aiStatus?.featureFlags.enableSandboxCodingAgent),
      selfCheck: flagStatus(aiStatus?.featureFlags.enableSelfCheck),
    },
    sandbox: {
      backendProbed: Boolean(sandboxBackendStatus?.probe),
      backendReady: Boolean(sandboxReadiness?.ready),
      producerBackendReady: Boolean(producerReadiness?.ready),
      summary: producerReadiness?.summary ?? sandboxReadiness?.summary ?? sandboxBackendStatus?.summary ?? null,
      blockedReasons: producerReadiness?.blockedReasons ?? sandboxReadiness?.blockedReasons ?? [],
    },
    tools: {
      familyCount: toolSummaries.length,
      modelVisibleCount,
      checkpointRequiredCount,
      families: toolSummaries.map((family) => family.family),
      summaries: toolSummaries.map((family) => ({ ...family })),
    },
    registry,
    summary: '',
  };

  snapshot.summary = [
    `runtime=${snapshot.executionRuntime.mode ?? 'unknown'}`,
    `runtimeKind=${snapshot.executionRuntime.kind}`,
    `runtimeExecutable=${snapshot.executionRuntime.executable ? 'yes' : 'no'}`,
    `model=${snapshot.model.configured ? 'configured' : 'missing'}`,
    snapshot.model.provider ? `provider=${snapshot.model.provider}` : null,
    snapshot.model.model ? `modelId=${snapshot.model.model}` : null,
    `modelProducer=${snapshot.model.producer}`,
    `workspace=${snapshot.workspace.rootConfigured ? 'configured' : 'missing'}`,
    `checks=lint:${snapshot.workspace.lintAvailable ? 'yes' : 'no'},test:${snapshot.workspace.testAvailable ? 'yes' : 'no'}`,
    `sandbox=${snapshot.sandbox.producerBackendReady ? 'ready' : snapshot.sandbox.backendProbed ? 'blocked' : 'not_probed'}`,
    `tools=${snapshot.tools.familyCount}`,
    `modelVisibleTools=${snapshot.tools.modelVisibleCount}`,
    `checkpointTools=${snapshot.tools.checkpointRequiredCount}`,
    `capabilityRows=${snapshot.registry.entryCount}`,
    `capabilityAvailable=${snapshot.registry.availableCount}`,
    `capabilityModelVisible=${snapshot.registry.modelVisibleCount}`,
    `capabilityBlocked=${snapshot.registry.blockedCount}`,
  ].filter(Boolean).join(' / ');

  return snapshot;
}

function summarizeCapabilityRegistry(registry: CapabilityRegistryEntry[]): RuntimeCapabilitySnapshot['registry'] {
  return {
    availableCount: registry.filter((entry) => entry.status === 'available').length,
    blockedCount: registry.filter((entry) => entry.status !== 'available').length,
    entryCount: registry.length,
    hiddenCount: registry.filter((entry) => entry.visibility === 'hidden').length,
    modelVisibleCount: registry.filter((entry) => entry.visibility === 'model_visible').length,
    policyGatedCount: registry.filter((entry) => entry.visibility === 'policy_gated').length,
  };
}

export function capabilitySnapshotAllowsModelExecution(snapshot: RuntimeCapabilitySnapshot): boolean {
  return snapshot.executionRuntime.kind === 'agent_api' && snapshot.model.configured;
}

export function capabilitySnapshotAllowsWorkspaceVerification(snapshot: RuntimeCapabilitySnapshot): boolean {
  return snapshot.workspace.rootConfigured && (snapshot.workspace.lintAvailable || snapshot.workspace.testAvailable);
}
