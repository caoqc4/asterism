import type { ProviderToolCallNormalizationResult } from './types/agent-execution.js';
import type { AiProvider } from './types/settings.js';
import { normalizeAnthropicToolUse } from './anthropic-tool-use-adapter.js';
import { normalizeOpenAiCompatibleToolCalls } from './openai-compatible-tool-call-adapter.js';
import { normalizeProviderToolCallPlan } from './provider-tool-call-normalizer.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function normalizeProviderNativeToolCalls(params: {
  provider: AiProvider;
  model: string;
  payload: unknown;
}): ProviderToolCallNormalizationResult {
  const { model, payload, provider } = params;

  if (isRecord(payload) && payload.source === 'provider_tool_call') {
    return normalizeProviderToolCallPlan({ provider, model, payload });
  }

  if (provider === 'anthropic') {
    return normalizeAnthropicToolUse({ provider, model, payload });
  }

  if (
    provider === 'openai'
    || provider === 'openai-compatible'
    || provider === 'fal-openrouter'
  ) {
    return normalizeOpenAiCompatibleToolCalls({ provider, model, payload });
  }

  return {
    status: 'failed',
    provider,
    model,
    error: 'Provider native structured tool calls are not supported for this provider.',
    rawSummary: provider,
  };
}
