import { describe, expect, it } from 'vitest';

import { observeProviderNativeToolCalls } from './provider-tool-call-shadow.js';

describe('observeProviderNativeToolCalls', () => {
  it('skips normalization when the reserved flag is disabled', () => {
    expect(observeProviderNativeToolCalls({
      enabled: false,
      provider: 'openai',
      model: 'gpt-4.1',
      payload: {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'task.inspect_context',
                    arguments: '{}',
                  },
                },
              ],
            },
          },
        ],
      },
    })).toEqual({
      status: 'skipped',
      provider: 'openai',
      model: 'gpt-4.1',
      reason: 'Provider-native tool-call shadow normalization is disabled.',
    });
  });

  it('observes normalized provider calls without exposing executable steps', () => {
    expect(observeProviderNativeToolCalls({
      enabled: true,
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      payload: {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'task.inspect_context',
            input: {},
          },
        ],
      },
    })).toEqual({
      status: 'observed',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      rawSummary: 'tool_use=1',
      providerCallCount: 1,
      stopReason: 'tool_use',
    });
  });

  it('reports normalization failures without failing the text-only path', () => {
    expect(observeProviderNativeToolCalls({
      enabled: true,
      provider: 'replicate',
      model: 'openai/gpt-oss-20b',
      payload: {},
    })).toEqual({
      status: 'failed',
      provider: 'replicate',
      model: 'openai/gpt-oss-20b',
      error: 'Provider native structured tool calls are not supported for this provider.',
      rawSummary: 'replicate',
    });
  });
});
