import type { AgentToolScaffoldFamily, AgentToolScaffoldFamilySummary } from './agent-tool-scaffold.js';
import type { AiConfigStatus } from './types/settings.js';

export type RuntimeCapabilityStatus = 'available' | 'disabled' | 'unknown';

export type RuntimeCapabilitySnapshot = {
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
  summary: string;
};

function flagStatus(value: boolean | undefined): RuntimeCapabilityStatus {
  if (value === true) return 'available';
  if (value === false) return 'disabled';
  return 'unknown';
}

export function buildRuntimeCapabilitySnapshot(params: {
  aiStatus?: AiConfigStatus | null;
}): RuntimeCapabilitySnapshot {
  const aiStatus = params.aiStatus ?? null;
  const toolSummaries = aiStatus?.toolScaffoldSummaries ?? [];
  const modelVisibleCount = toolSummaries.reduce((sum, family) => sum + family.modelVisibleIds.length, 0);
  const checkpointRequiredCount = toolSummaries.reduce((sum, family) => sum + family.checkpointRequiredIds.length, 0);
  const sandboxBackendStatus = aiStatus?.sandboxBackendStatus ?? null;
  const sandboxReadiness = sandboxBackendStatus?.readiness ?? null;
  const producerReadiness = sandboxBackendStatus?.producerBackendReadiness ?? null;
  const snapshot: RuntimeCapabilitySnapshot = {
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
    summary: '',
  };

  snapshot.summary = [
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
  ].filter(Boolean).join(' / ');

  return snapshot;
}

export function capabilitySnapshotAllowsModelExecution(snapshot: RuntimeCapabilitySnapshot): boolean {
  return snapshot.model.configured;
}

export function capabilitySnapshotAllowsWorkspaceVerification(snapshot: RuntimeCapabilitySnapshot): boolean {
  return snapshot.workspace.rootConfigured && (snapshot.workspace.lintAvailable || snapshot.workspace.testAvailable);
}
