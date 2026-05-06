import type { FeatureFlags } from './types/settings.js';

export const CONTEXT_COMPRESSION_THRESHOLD = {
  default: 45,
  min: 30,
  max: 70,
  step: 5,
} as const;

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enableScheduler: false,
  enableProviderNativeToolCalls: false,
  enableSandboxCodingAgent: false,
  enableSandboxPatchPromotionApply: false,
  enableSelfCheck: true,
  enableSelfLearn: true,
  contextCompressionThreshold: CONTEXT_COMPRESSION_THRESHOLD.default,
};
