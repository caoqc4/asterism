import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

import type { RuntimeAiConfig } from '../keychain/ai-config-service.js';

const FAL_OPENROUTER_BASE_URL = 'https://fal.run/openrouter/router/openai/v1';

export function getLanguageModel(config: RuntimeAiConfig) {
  if (config.provider === 'replicate') {
    throw new Error('Replicate uses the native prediction API for text generation.');
  }

  if (config.provider === 'anthropic') {
    const anthropic = createAnthropic({ apiKey: config.apiKey });
    return anthropic(config.model);
  }

  if (config.provider === 'fal-openrouter') {
    const fal = createOpenAI({
      apiKey: 'not-needed',
      baseURL: config.baseUrl ?? FAL_OPENROUTER_BASE_URL,
      headers: {
        Authorization: `Key ${config.apiKey}`,
      },
      name: 'fal-openrouter',
    });
    return fal(config.model);
  }

  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.provider === 'openai-compatible' ? config.baseUrl ?? undefined : undefined,
    name: config.provider === 'openai-compatible' ? 'openai-compatible' : 'openai',
  });
  return openai(config.model);
}
