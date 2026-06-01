import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAnthropicMock, createOpenAIMock } = vi.hoisted(() => ({
  createAnthropicMock: vi.fn(),
  createOpenAIMock: vi.fn(),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: createAnthropicMock,
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAIMock,
}));

const { getProviderNativeLiveLanguageModel } = await import('../../../scripts/provider-native-live-validate.mjs');

describe('getProviderNativeLiveLanguageModel', () => {
  beforeEach(() => {
    createAnthropicMock.mockReset();
    createOpenAIMock.mockReset();
  });

  it('uses chat completions for fal OpenRouter relay validation', () => {
    const chatMock = vi.fn().mockReturnValue('fal-chat-model');
    createOpenAIMock.mockReturnValue({ chat: chatMock });

    const result = getProviderNativeLiveLanguageModel({
      apiKey: 'fal-key',
      baseUrl: '',
      model: 'google/gemini-2.5-flash',
      provider: 'fal-openrouter',
    });

    expect(createOpenAIMock).toHaveBeenCalledWith({
      apiKey: 'not-needed',
      baseURL: 'https://fal.run/openrouter/router/openai/v1',
      headers: {
        Authorization: 'Key fal-key',
      },
      name: 'fal-openrouter',
    });
    expect(chatMock).toHaveBeenCalledWith('google/gemini-2.5-flash');
    expect(result).toBe('fal-chat-model');
  });

  it('uses chat completions for generic OpenAI-compatible relay validation', () => {
    const chatMock = vi.fn().mockReturnValue('relay-chat-model');
    createOpenAIMock.mockReturnValue({ chat: chatMock });

    const result = getProviderNativeLiveLanguageModel({
      apiKey: 'relay-key',
      baseUrl: 'https://relay.example.com/v1',
      model: 'relay/model',
      provider: 'openai-compatible',
    });

    expect(createOpenAIMock).toHaveBeenCalledWith({
      apiKey: 'relay-key',
      baseURL: 'https://relay.example.com/v1',
      name: 'openai-compatible',
    });
    expect(chatMock).toHaveBeenCalledWith('relay/model');
    expect(result).toBe('relay-chat-model');
  });
});
