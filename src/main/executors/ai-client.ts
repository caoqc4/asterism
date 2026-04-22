import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

import type { RuntimeAiConfig } from '../keychain/ai-config-service.js';

export function getLanguageModel(config: RuntimeAiConfig) {
  if (config.provider === 'anthropic') {
    const anthropic = createAnthropic({ apiKey: config.apiKey });
    return anthropic(config.model);
  }

  const openai = createOpenAI({ apiKey: config.apiKey });
  return openai(config.model);
}
