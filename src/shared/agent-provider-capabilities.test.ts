import { describe, expect, it } from 'vitest';

import type { AiConfigStatus, AiProvider } from './types/settings.js';
import { getProviderExecutionCapabilities } from './agent-provider-capabilities.js';

function buildAiStatus(provider: AiProvider): AiConfigStatus {
  return {
    configured: true,
    apiKeyStored: true,
    apiKeySource: 'env',
    provider,
    model: provider === 'replicate' ? 'openai/gpt-oss-20b' : 'claude-3-5-sonnet-latest',
    baseUrl: null,
    workspaceRoot: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    configPath: '/tmp/config.json',
    featureFlags: {
      enableScheduler: false,
    },
  };
}

describe('getProviderExecutionCapabilities', () => {
  it('marks provider capabilities unavailable before configuration', () => {
    expect(getProviderExecutionCapabilities(null)).toEqual({
      provider: null,
      model: null,
      textPlanningPath: 'unconfigured',
      structuredToolCallState: 'unconfigured',
      taskplaneStructuredToolCallsEnabled: false,
    });
  });

  it.each([
    'anthropic',
    'openai',
    'openai-compatible',
    'fal-openrouter',
  ] as const)('keeps %s structured tool calls deferred until a Taskplane adapter exists', (provider) => {
    expect(getProviderExecutionCapabilities(buildAiStatus(provider))).toMatchObject({
      provider,
      textPlanningPath: 'local_text_executor',
      structuredToolCallState: 'deferred_until_adapter',
      taskplaneStructuredToolCallsEnabled: false,
    });
  });

  it('keeps Replicate on the native text-only path', () => {
    expect(getProviderExecutionCapabilities(buildAiStatus('replicate'))).toMatchObject({
      provider: 'replicate',
      model: 'openai/gpt-oss-20b',
      textPlanningPath: 'replicate_native_text',
      structuredToolCallState: 'unavailable_on_replicate_text_path',
      taskplaneStructuredToolCallsEnabled: false,
    });
  });
});
