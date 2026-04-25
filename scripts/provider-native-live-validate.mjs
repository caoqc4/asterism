import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, jsonSchema, tool } from 'ai';
import process from 'node:process';

import {
  getProviderNativeLivePreflight,
  printProviderNativeLivePreflight,
} from './provider-native-live-preflight.mjs';

const FAL_OPENROUTER_BASE_URL = 'https://fal.run/openrouter/router/openai/v1';
const TOOL_NAME = 'taskplane__task__inspect_context';

function getLanguageModel(config) {
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
    })(config.model);
  }

  return createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.provider === 'openai-compatible' ? config.baseUrl : undefined,
    name: config.provider === 'openai-compatible' ? 'openai-compatible' : 'openai',
  })(config.model);
}

const preflight = getProviderNativeLivePreflight();
printProviderNativeLivePreflight(preflight);

if (!preflight.ready) {
  process.exit(0);
}

const result = await generateText({
  experimental_include: {
    responseBody: true,
  },
  model: getLanguageModel({
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
    toolName: TOOL_NAME,
  },
  tools: {
    [TOOL_NAME]: tool({
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
const matched = toolCalls.some((item) => item.toolName === TOOL_NAME);

console.log('Provider-native live validation');
console.log(`finishReason=${result.finishReason ?? '<unknown>'}`);
console.log(`textLength=${result.text?.length ?? 0}`);
console.log(`toolCalls=${toolCalls.length}`);
console.log(`matchedTool=${matched ? 'true' : 'false'}`);
console.log(`responseBody=${result.response?.body ? '<present>' : '<empty>'}`);

if (!matched) {
  console.log('status=failed');
  process.exit(1);
}

console.log('status=passed');
