import { generateText } from 'ai';

import type { RuntimeAiConfig } from '../keychain/ai-config-service.js';
import { getLanguageModel } from './ai-client.js';
import { generateReplicateText } from './replicate-client.js';

export async function generateRuntimeText(config: RuntimeAiConfig, prompt: string): Promise<string> {
  if (config.provider === 'replicate') {
    return generateReplicateText(config, prompt);
  }

  const { text } = await generateText({
    model: getLanguageModel(config),
    prompt,
  });

  return text.trim();
}
