import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

import type { RuntimeAiConfig } from '../keychain/ai-config-service.js';

/* Pre-configured base URLs for known OpenAI-compatible providers */
const KNOWN_BASE_URLS: Partial<Record<string, string>> = {
  'fal-openrouter': 'https://fal.run/openrouter/router/openai/v1',
  'google':         'https://generativelanguage.googleapis.com/v1beta/openai/',
  'deepseek':       'https://api.deepseek.com/v1',
  'groq':           'https://api.groq.com/openai/v1',
};

export function getLanguageModel(config: RuntimeAiConfig) {
  if (config.provider === 'replicate') {
    throw new Error('Replicate uses the native prediction API for text generation.');
  }

  if (config.provider === 'anthropic') {
    const anthropic = createAnthropic({ apiKey: config.apiKey });
    return anthropic(config.model);
  }

  /* fal uses Key auth header instead of Bearer */
  if (config.provider === 'fal-openrouter') {
    const fal = createOpenAI({
      apiKey: 'not-needed',
      baseURL: config.baseUrl ?? KNOWN_BASE_URLS['fal-openrouter'],
      headers: { Authorization: `Key ${config.apiKey}` },
      name: 'fal-openrouter',
    });
    return fal.chat(config.model);
  }

  /* All other providers are OpenAI-compatible with Bearer auth */
  const baseURL = config.baseUrl ?? KNOWN_BASE_URLS[config.provider] ?? undefined;
  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL,
    name: config.provider,
  });

  return openai.chat(config.model);
}
