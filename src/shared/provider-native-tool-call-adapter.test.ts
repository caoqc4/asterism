import { describe, expect, it } from 'vitest';

import { normalizeProviderNativeToolCalls } from './provider-native-tool-call-adapter.js';

describe('normalizeProviderNativeToolCalls', () => {
  it('normalizes AI SDK standard provider-tool-call payloads directly', () => {
    expect(normalizeProviderNativeToolCalls({
      provider: 'openai-compatible',
      model: 'relay-model',
      payload: {
        source: 'provider_tool_call',
        rawSummary: 'sdk_tool_calls=1',
        providerCallIds: ['call_sdk_1'],
        stopReason: 'tool-calls',
        proposal: {
          finalOutput: null,
          steps: [
            {
              tool: 'taskplane__task__inspect_context',
              input: {},
            },
          ],
        },
      },
    })).toEqual({
      status: 'normalized',
      plan: {
        source: 'provider_tool_call',
        provider: 'openai-compatible',
        model: 'relay-model',
        rawSummary: 'sdk_tool_calls=1',
        providerCallIds: ['call_sdk_1'],
        stopReason: 'tool-calls',
        proposal: {
          finalOutput: null,
          steps: [
            {
              tool: 'task.inspect_context',
              input: {},
            },
          ],
        },
      },
    });
  });

  it('routes Anthropic payloads through the Anthropic tool-use adapter', () => {
    expect(normalizeProviderNativeToolCalls({
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
    })).toMatchObject({
      status: 'normalized',
      plan: {
        provider: 'anthropic',
        proposal: {
          steps: [
            {
              tool: 'task.inspect_context',
              input: {},
            },
          ],
        },
      },
    });
  });

  it.each([
    'openai',
    'openai-compatible',
    'fal-openrouter',
  ] as const)('routes %s payloads through the OpenAI-compatible adapter', (provider) => {
    expect(normalizeProviderNativeToolCalls({
      provider,
      model: 'model',
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
    })).toMatchObject({
      status: 'normalized',
      plan: {
        provider,
        proposal: {
          steps: [
            {
              tool: 'task.inspect_context',
              input: {},
            },
          ],
        },
      },
    });
  });

  it('fails closed for Replicate native text paths', () => {
    expect(normalizeProviderNativeToolCalls({
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

  it('propagates OpenAI-compatible adapter failures', () => {
    expect(normalizeProviderNativeToolCalls({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      payload: {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'custom',
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
      status: 'failed',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      error: 'OpenAI-compatible tool call type must be function.',
      rawSummary: 'tool_calls',
    });
  });

  it('propagates Anthropic adapter failures', () => {
    expect(normalizeProviderNativeToolCalls({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      payload: {
        stop_reason: 'tool_use',
        content: [
          'unexpected block',
        ],
      },
    })).toEqual({
      status: 'failed',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      error: 'Anthropic content blocks must be objects.',
      rawSummary: 'content',
    });
  });
});
