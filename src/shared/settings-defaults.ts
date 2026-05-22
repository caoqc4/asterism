import type { AgentCliCapabilityMode, FeatureFlags } from './types/settings.js';

export const CONTEXT_COMPRESSION_THRESHOLD = {
  default: 45,
  min: 30,
  max: 70,
  step: 5,
} as const;

export const SELF_CHECK_RETRY_LIMIT = {
  default: 2,
  min: 0,
  max: 5,
  step: 1,
} as const;

export const AI_COMMUNICATION_STYLES = ['concise', 'balanced', 'detailed'] as const;
export const AI_CONFIRMATION_THRESHOLDS = ['low', 'normal', 'high'] as const;
export const AGENT_CLI_CAPABILITY_MODES: AgentCliCapabilityMode[] = ['native', 'audit_enhanced', 'restricted'];

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enableScheduler: false,
  enableProviderNativeToolCalls: false,
  agentCliCapabilityMode: 'native',
  enableSandboxCodingAgent: false,
  enableSandboxPatchPromotionApply: false,
  enableSelfCheck: true,
  enableSelfLearn: true,
  contextCompressionThreshold: CONTEXT_COMPRESSION_THRESHOLD.default,
  selfCheckRetryLimit: SELF_CHECK_RETRY_LIMIT.default,
  communicationStyle: 'balanced',
  confirmationThreshold: 'normal',
};
