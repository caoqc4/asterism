import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  generateReplicateTextMock,
  generateTextMock,
  getLanguageModelMock,
  jsonSchemaMock,
  toolMock,
} = vi.hoisted(() => ({
  generateReplicateTextMock: vi.fn(),
  generateTextMock: vi.fn(),
  getLanguageModelMock: vi.fn(),
  jsonSchemaMock: vi.fn((schema) => ({ kind: 'json-schema', schema })),
  toolMock: vi.fn((definition) => ({ kind: 'tool', ...definition })),
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
  jsonSchema: jsonSchemaMock,
  tool: toolMock,
}));

vi.mock('./ai-client.js', () => ({
  getLanguageModel: getLanguageModelMock,
}));

vi.mock('./replicate-client.js', () => ({
  generateReplicateText: generateReplicateTextMock,
}));

import type { RuntimeAiConfig } from '../keychain/ai-config-service.js';
import { generateRuntimeText, generateRuntimeTextResult } from './text-generation.js';

beforeEach(() => {
  generateReplicateTextMock.mockReset();
  generateTextMock.mockReset();
  getLanguageModelMock.mockReset();
  jsonSchemaMock.mockClear();
  toolMock.mockClear();
});

function buildConfig(overrides: Partial<RuntimeAiConfig> = {}): RuntimeAiConfig {
  return {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    apiKey: 'secret',
    featureFlags: {
      enableScheduler: false,
      enableProviderNativeToolCalls: false,
    },
    ...overrides,
  };
}

describe('generateRuntimeTextResult', () => {
  it('keeps the legacy text helper returning trimmed text only', async () => {
    getLanguageModelMock.mockReturnValue('language-model');
    generateTextMock.mockResolvedValue({
      text: '  Generated output  ',
      response: {},
    });

    await expect(generateRuntimeText(buildConfig(), 'Prompt')).resolves.toBe('Generated output');
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        experimental_include: {
          responseBody: true,
        },
        model: 'language-model',
        prompt: 'Prompt',
      }),
    );
  });

  it('extracts a minimal OpenAI-compatible tool-call payload from response body', async () => {
    getLanguageModelMock.mockReturnValue('language-model');
    generateTextMock.mockResolvedValue({
      text: 'Generated output',
      response: {
        body: {
          id: 'chatcmpl_1',
          choices: [
            {
              message: {
                content: null,
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
      },
    });

    await expect(generateRuntimeTextResult(buildConfig({
      provider: 'openai-compatible',
      model: 'relay-model',
    }), 'Prompt')).resolves.toEqual({
      text: 'Generated output',
      providerPayload: {
        source: 'provider_response_body',
        provider: 'openai-compatible',
        model: 'relay-model',
        rawSummary: 'choices=1; tool_calls=1',
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
      },
    });
  });

  it('extracts a redacted Anthropic content payload from response body', async () => {
    getLanguageModelMock.mockReturnValue('language-model');
    generateTextMock.mockResolvedValue({
      text: 'Generated output',
      response: {
        body: {
          id: 'msg_1',
          stop_reason: 'tool_use',
          content: [
            {
              type: 'text',
              text: 'Do not persist this full provider text.',
            },
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'task.inspect_context',
              input: {},
            },
          ],
        },
      },
    });

    await expect(generateRuntimeTextResult(buildConfig({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
    }), 'Prompt')).resolves.toEqual({
      text: 'Generated output',
      providerPayload: {
        source: 'provider_response_body',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        rawSummary: 'content=2; tool_use=1',
        payload: {
          stop_reason: 'tool_use',
          content: [
            {
              type: 'text',
              text: '[redacted]',
            },
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'task.inspect_context',
              input: {},
            },
          ],
        },
      },
    });
  });

  it('extracts AI SDK standard tool calls when raw response body is unavailable', async () => {
    getLanguageModelMock.mockReturnValue('language-model');
    generateTextMock.mockResolvedValue({
      text: '',
      finishReason: 'tool-calls',
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: 'call_sdk_1',
          toolName: 'taskplane__task__inspect_context',
          input: {},
        },
      ],
      response: {},
    });

    await expect(generateRuntimeTextResult(buildConfig({
      provider: 'openai-compatible',
      model: 'relay-model',
    }), 'Prompt')).resolves.toEqual({
      text: '',
      providerPayload: {
        source: 'ai_sdk_tool_calls',
        provider: 'openai-compatible',
        model: 'relay-model',
        rawSummary: 'sdk_tool_calls=1',
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
      },
    });
  });

  it('prefers AI SDK standard tool calls over raw provider response bodies', async () => {
    getLanguageModelMock.mockReturnValue('language-model');
    generateTextMock.mockResolvedValue({
      text: '',
      finishReason: 'tool-calls',
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: 'call_sdk_1',
          toolName: 'taskplane__workspace__search',
          input: { query: 'Taskplane' },
        },
      ],
      response: {
        body: {
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: 'call_raw_1',
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
      },
    });

    const result = await generateRuntimeTextResult(buildConfig({
      provider: 'openai-compatible',
      model: 'relay-model',
    }), 'Prompt');

    expect(result.providerPayload?.rawSummary).toBe('sdk_tool_calls=1');
    expect(result.providerPayload?.payload).toMatchObject({
      providerCallIds: ['call_sdk_1'],
      proposal: {
        steps: [
          {
            tool: 'taskplane__workspace__search',
            input: { query: 'Taskplane' },
          },
        ],
      },
    });
  });

  it('keeps Replicate on text-only runtime output', async () => {
    generateReplicateTextMock.mockResolvedValue('Replicate output');

    await expect(generateRuntimeTextResult(buildConfig({
      provider: 'replicate',
      model: 'openai/gpt-oss-20b',
    }), 'Prompt')).resolves.toEqual({
      text: 'Replicate output',
      providerPayload: null,
    });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('passes provider-native tool schemas to AI SDK without local execute handlers', async () => {
    getLanguageModelMock.mockReturnValue('language-model');
    generateTextMock.mockResolvedValue({
      text: 'Generated output',
      response: {},
    });
    const inputSchema = {
      type: 'object',
      properties: {},
      additionalProperties: false,
    };

    await generateRuntimeTextResult(buildConfig(), 'Prompt', {
      providerNativeToolSchemas: [
        {
          name: 'taskplane__task__inspect_context',
          description: 'Inspect context.',
          inputSchema,
        },
      ],
    });

    expect(jsonSchemaMock).toHaveBeenCalledWith(inputSchema);
    expect(toolMock).toHaveBeenCalledWith({
      description: 'Inspect context.',
      inputSchema: {
        kind: 'json-schema',
        schema: inputSchema,
      },
    });
    expect(toolMock.mock.calls[0][0]).not.toHaveProperty('execute');
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: {
          taskplane__task__inspect_context: expect.objectContaining({
            kind: 'tool',
            description: 'Inspect context.',
          }),
        },
        toolChoice: 'auto',
      }),
    );
  });
});
