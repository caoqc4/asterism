import { generateText, jsonSchema, tool, type ToolSet } from 'ai';

import type { RuntimeAiConfig } from '../keychain/ai-config-service.js';
import { getLanguageModel } from './ai-client.js';
import { generateReplicateText } from './replicate-client.js';

type RuntimeProviderNativeToolSchema = {
  name: string;
  description: string;
  inputSchema: unknown;
};

type RuntimeTextOptions = {
  providerNativeToolSchemas?: RuntimeProviderNativeToolSchema[];
};

type RuntimeTextProviderPayload = {
  source: 'provider_response_body' | 'ai_sdk_tool_calls';
  provider: RuntimeAiConfig['provider'];
  model: string;
  payload: unknown;
  rawSummary: string;
};

export type RuntimeTextResult = {
  text: string;
  providerPayload: RuntimeTextProviderPayload | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function buildProviderNativeTools(schemas: RuntimeProviderNativeToolSchema[] | undefined): ToolSet | undefined {
  if (!schemas?.length) {
    return undefined;
  }

  return Object.fromEntries(
    schemas.map((schema) => [
      schema.name,
      tool({
        description: schema.description,
        inputSchema: jsonSchema(schema.inputSchema as never),
      }),
    ]),
  ) as ToolSet;
}

function extractOpenAiCompatiblePayload(body: unknown): Pick<RuntimeTextProviderPayload, 'payload' | 'rawSummary'> | null {
  if (!isRecord(body) || !Array.isArray(body.choices)) {
    return null;
  }

  const choices = body.choices
    .filter(isRecord)
    .map((choice) => {
      const message = isRecord(choice.message) ? choice.message : {};
      return {
        message: 'tool_calls' in message
          ? { tool_calls: message.tool_calls }
          : {},
      };
    });
  const toolCallCount = choices.reduce((count, choice) => {
    const toolCalls = choice.message.tool_calls;
    return count + (Array.isArray(toolCalls) ? toolCalls.length : 0);
  }, 0);

  if (!choices.some((choice) => 'tool_calls' in choice.message)) {
    return null;
  }

  return {
    payload: { choices },
    rawSummary: `choices=${choices.length}; tool_calls=${toolCallCount}`,
  };
}

function extractAnthropicPayload(body: unknown): Pick<RuntimeTextProviderPayload, 'payload' | 'rawSummary'> | null {
  if (!isRecord(body) || !('content' in body)) {
    return null;
  }

  const content = Array.isArray(body.content)
    ? body.content.map((block) => {
        if (!isRecord(block)) {
          return block;
        }

        if (block.type === 'text') {
          return { type: 'text', text: '[redacted]' };
        }

        if (block.type === 'tool_use') {
          return {
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input,
          };
        }

        return { type: block.type };
      })
    : body.content;

  const toolUseCount = Array.isArray(content)
    ? content.filter((block) => isRecord(block) && block.type === 'tool_use').length
    : 0;

  return {
    payload: {
      stop_reason: body.stop_reason,
      content,
    },
    rawSummary: `content=${Array.isArray(content) ? content.length : 'malformed'}; tool_use=${toolUseCount}`,
  };
}

function extractSdkToolCallPayload(
  toolCalls: unknown,
  finishReason: unknown,
): Pick<RuntimeTextProviderPayload, 'payload' | 'rawSummary'> | null {
  if (!Array.isArray(toolCalls) || !toolCalls.length) {
    return null;
  }

  const steps = [];
  const providerCallIds: string[] = [];

  for (const toolCall of toolCalls) {
    if (!isRecord(toolCall) || typeof toolCall.toolName !== 'string') {
      return null;
    }

    if (typeof toolCall.toolCallId === 'string' && toolCall.toolCallId.trim()) {
      providerCallIds.push(toolCall.toolCallId);
    }

    steps.push({
      tool: toolCall.toolName,
      input: isRecord(toolCall.input) ? toolCall.input : undefined,
    });
  }

  return {
    payload: {
      source: 'provider_tool_call',
      rawSummary: `sdk_tool_calls=${steps.length}`,
      providerCallIds,
      stopReason: typeof finishReason === 'string' ? finishReason : null,
      proposal: {
        finalOutput: null,
        steps,
      },
    },
    rawSummary: `sdk_tool_calls=${steps.length}`,
  };
}

function extractProviderPayload(
  config: RuntimeAiConfig,
  body: unknown,
  toolCalls: unknown,
  finishReason: unknown,
): RuntimeTextProviderPayload | null {
  const sdkToolCalls = extractSdkToolCallPayload(toolCalls, finishReason);

  if (sdkToolCalls) {
    return {
      source: 'ai_sdk_tool_calls',
      provider: config.provider,
      model: config.model,
      ...sdkToolCalls,
    };
  }

  const extracted = config.provider === 'anthropic'
    ? extractAnthropicPayload(body)
    : extractOpenAiCompatiblePayload(body);

  if (!extracted) {
    return null;
  }

  return {
    source: 'provider_response_body',
    provider: config.provider,
    model: config.model,
    ...extracted,
  };
}

export async function generateRuntimeTextResult(
  config: RuntimeAiConfig,
  prompt: string,
  options: RuntimeTextOptions = {},
): Promise<RuntimeTextResult> {
  if (config.provider === 'replicate') {
    return {
      text: await generateReplicateText(config, prompt),
      providerPayload: null,
    };
  }

  const result = await generateText({
    experimental_include: {
      responseBody: true,
    },
    model: getLanguageModel(config),
    prompt,
    tools: buildProviderNativeTools(options.providerNativeToolSchemas),
    toolChoice: options.providerNativeToolSchemas?.length ? 'auto' : undefined,
  });

  return {
    text: result.text.trim(),
    providerPayload: extractProviderPayload(
      config,
      result.response?.body,
      result.toolCalls,
      result.finishReason,
    ),
  };
}

export async function generateRuntimeText(config: RuntimeAiConfig, prompt: string): Promise<string> {
  const result = await generateRuntimeTextResult(config, prompt);
  return result.text;
}
