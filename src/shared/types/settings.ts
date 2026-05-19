import type { AgentSandboxBackendStatus } from '../agent-sandbox-provider.js';
import type { AgentExecutorLifecycleServiceAvailability } from '../agent-executor-lifecycle-diagnostics.js';
import type { AgentToolScaffoldFamilySummary } from '../agent-tool-scaffold.js';
import type { CapabilityRegistryEntry } from '../capability-registry.js';
import type { ConfigurationSafetyReport } from '../configuration-safety-report.js';
import type { ExternalAccessStatus } from '../external-access-status.js';
import type { AgentCliRuntimeStatus } from '../agent-cli-runtime-status.js';

export type AiProvider = 'anthropic' | 'openai' | 'google' | 'deepseek' | 'groq' | 'fal-openrouter' | 'openai-compatible' | 'replicate';
export type AiCommunicationStyle = 'concise' | 'balanced' | 'detailed';
export type AiConfirmationThreshold = 'low' | 'normal' | 'high';

export type FeatureFlags = {
  enableScheduler: boolean;
  enableProviderNativeToolCalls?: boolean;
  enableSandboxCodingAgent?: boolean;
  enableSandboxPatchPromotionApply?: boolean;
  enableSelfCheck?: boolean;
  enableSelfLearn?: boolean;
  contextCompressionThreshold?: number;
  selfCheckRetryLimit?: number;
  communicationStyle?: AiCommunicationStyle;
  confirmationThreshold?: AiConfirmationThreshold;
};

export type AppConfigFile = {
  aiProvider: AiProvider;
  aiModel: string;
  aiBaseUrl: string | null;
  workspaceRoot: string | null;
  featureFlags: FeatureFlags;
  updatedAt: string;
};

/* ─── Per-provider keys ─── */

export type AiProviderKeysInput = {
  anthropic?: string;
  openai?: string;
  google?: string;
  deepseek?: string;
  groq?: string;
  falOpenRouter?: string;
  customKey?: string;
  customBaseUrl?: string;
};

/* ─── Config input: provider + model explicit ─── */

export type AiConfigInput = {
  provider: AiProvider;
  model: string;
  providerKeys?: AiProviderKeysInput;
  workspaceRoot?: string | null;
  featureFlags: FeatureFlags;
};

/* ─── Config status ─── */

export type AiConfigStatus = {
  configured: boolean;
  apiKeyStored: boolean;
  apiKeySource: 'keychain' | 'env' | null;
  configuredProviders?: AiProvider[];
  codeAgentWorkspaceChecks?: {
    lint: { available: boolean; reason: string };
    test: { available: boolean; reason: string };
  };
  codeAgentModelProducerEnabled?: boolean;
  provider: AiProvider | null;
  model: string | null;
  baseUrl: string | null;
  workspaceRoot: string | null;
  updatedAt: string | null;
  configPath: string | null;
  featureFlags: FeatureFlags;
  sandboxBackendStatus?: AgentSandboxBackendStatus | null;
  executorLifecycleAvailability?: AgentExecutorLifecycleServiceAvailability | null;
  toolScaffoldSummaries?: AgentToolScaffoldFamilySummary[];
  externalAccessStatus?: ExternalAccessStatus;
  agentCliRuntimeStatus?: AgentCliRuntimeStatus;
  capabilityRegistry?: CapabilityRegistryEntry[];
  configurationSafetyReport?: ConfigurationSafetyReport;
};
