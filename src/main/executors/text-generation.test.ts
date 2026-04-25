import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  generateReplicateTextMock,
  generateTextMock,
  getLanguageModelMock,
} = vi.hoisted(() => ({
  generateReplicateTextMock: vi.fn(),
  generateTextMock: vi.fn(),
  getLanguageModelMock: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
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
});
