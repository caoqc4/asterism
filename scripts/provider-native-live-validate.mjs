import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, jsonSchema, tool } from 'ai';
import process from 'node:process';

import {
  getProviderNativeLivePreflight,
  printProviderNativeLivePreflight,
} from './provider-native-live-preflight.mjs';

const FAL_OPENROUTER_BASE_URL = 'https://fal.run/openrouter/router/openai/v1';
export const PROVIDER_NATIVE_LIVE_TOOL_NAME = 'taskplane__task__inspect_context';

export function getProviderNativeLiveLanguageModel(config) {
  if (config.provider === 'anthropic') {
    return createAnthropic({ apiKey: config.apiKey })(config.model);
  }

  if (config.provider === 'fal-openrouter') {
    return createOpenAI({
      apiKey: 'not-needed',
      baseURL: config.baseUrl || FAL_OPENROUTER_BASE_URL,
      headers: {
        Authorization: `Key ${config.apiKey}`,
      },
      name: 'fal-openrouter',
    }).chat(config.model);
  }

  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.provider === 'openai-compatible' ? config.baseUrl : undefined,
    name: config.provider === 'openai-compatible' ? 'openai-compatible' : 'openai',
  });

  if (config.provider === 'openai-compatible') {
    return openai.chat(config.model);
  }

  return openai(config.model);
}

export async function runProviderNativeLiveValidation() {
  const preflight = getProviderNativeLivePreflight();
  printProviderNativeLivePreflight(preflight);

  if (!preflight.ready) {
    return 0;
  }

  const result = await generateText({
    experimental_include: {
      responseBody: true,
    },
    model: getProviderNativeLiveLanguageModel({
      apiKey: preflight.apiKey,
      baseUrl: preflight.baseUrl,
      model: preflight.model,
      provider: preflight.provider,
    }),
    prompt: [
      'Call the available tool exactly once.',
      'Do not answer with prose.',
      'The tool has no input fields.',
    ].join('\n'),
    toolChoice: {
      type: 'tool',
      toolName: PROVIDER_NATIVE_LIVE_TOOL_NAME,
    },
    tools: {
      [PROVIDER_NATIVE_LIVE_TOOL_NAME]: tool({
        description: 'Inspect the current Taskplane working context snapshot for this run.',
        inputSchema: jsonSchema({
          type: 'object',
          properties: {},
          additionalProperties: false,
        }),
      }),
    },
  });

  const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
  const matched = toolCalls.some((item) => item.toolName === PROVIDER_NATIVE_LIVE_TOOL_NAME);

  console.log('Provider-native live validation');
  console.log(`finishReason=${result.finishReason ?? '<unknown>'}`);
  console.log(`textLength=${result.text?.length ?? 0}`);
  console.log(`toolCalls=${toolCalls.length}`);
  console.log(`matchedTool=${matched ? 'true' : 'false'}`);
  console.log(`responseBody=${result.response?.body ? '<present>' : '<empty>'}`);

  if (!matched) {
    console.log('status=failed');
    return 1;
  }

  console.log('status=passed');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runProviderNativeLiveValidation();
}
