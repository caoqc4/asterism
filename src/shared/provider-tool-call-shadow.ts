import type {
  ProviderToolCallShadowResult,
} from './types/agent-execution.js';
import type { AiProvider } from './types/settings.js';
import { normalizeProviderNativeToolCalls } from './provider-native-tool-call-adapter.js';

export function observeProviderNativeToolCalls(params: {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  payload: unknown;
}): ProviderToolCallShadowResult {
  const { enabled, model, payload, provider } = params;

  if (!enabled) {
    return {
      status: 'skipped',
      provider,
      model,
      reason: 'Provider-native tool-call shadow normalization is disabled.',
    };
  }

  const result = normalizeProviderNativeToolCalls({ provider, model, payload });

  if (result.status === 'failed') {
    return {
      status: 'failed',
      provider,
      model,
      error: result.error,
      rawSummary: result.rawSummary,
    };
  }

  return {
    status: 'observed',
    provider,
    model,
    rawSummary: result.plan.rawSummary,
    providerCallCount: result.plan.providerCallIds.length,
    stopReason: result.plan.stopReason ?? null,
  };
}
