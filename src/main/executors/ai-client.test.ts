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

import { getLanguageModel } from './ai-client.js';

describe('getLanguageModel', () => {
  beforeEach(() => {
    createAnthropicMock.mockReset();
    createOpenAIMock.mockReset();
  });

  it('uses the fal OpenRouter endpoint with Key authorization', () => {
    const modelMock = vi.fn().mockReturnValue('fal-model');
    createOpenAIMock.mockReturnValue(modelMock);

    const result = getLanguageModel({
      provider: 'fal-openrouter',
      model: 'google/gemini-2.5-flash',
      apiKey: 'fal-key',
      featureFlags: {
        enableScheduler: false,
      },
    });

    expect(createOpenAIMock).toHaveBeenCalledWith({
      apiKey: 'not-needed',
      baseURL: 'https://fal.run/openrouter/router/openai/v1',
      headers: {
        Authorization: 'Key fal-key',
      },
      name: 'fal-openrouter',
    });
    expect(modelMock).toHaveBeenCalledWith('google/gemini-2.5-flash');
    expect(result).toBe('fal-model');
  });

  it('passes custom base URLs to OpenAI-compatible providers', () => {
    const modelMock = vi.fn().mockReturnValue('relay-model');
    createOpenAIMock.mockReturnValue(modelMock);

    const result = getLanguageModel({
      provider: 'openai-compatible',
      model: 'custom/model',
      baseUrl: 'https://relay.example.com/v1',
      apiKey: 'relay-key',
      featureFlags: {
        enableScheduler: false,
      },
    });

    expect(createOpenAIMock).toHaveBeenCalledWith({
      apiKey: 'relay-key',
      baseURL: 'https://relay.example.com/v1',
      name: 'openai-compatible',
    });
    expect(modelMock).toHaveBeenCalledWith('custom/model');
    expect(result).toBe('relay-model');
  });

  it('keeps Anthropic on the native provider', () => {
    const modelMock = vi.fn().mockReturnValue('anthropic-model');
    createAnthropicMock.mockReturnValue(modelMock);

    const result = getLanguageModel({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      apiKey: 'anthropic-key',
      featureFlags: {
        enableScheduler: false,
      },
    });

    expect(createAnthropicMock).toHaveBeenCalledWith({ apiKey: 'anthropic-key' });
    expect(modelMock).toHaveBeenCalledWith('claude-3-5-sonnet-latest');
    expect(result).toBe('anthropic-model');
  });
});
