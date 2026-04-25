import type { ProviderToolCallNormalizationResult } from './types/agent-execution.js';
import { normalizeProviderToolCallPlan } from './provider-tool-call-normalizer.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseArguments(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null || value === '') {
    return {};
  }

  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function firstChoiceMessage(payload: Record<string, unknown>): Record<string, unknown> | null {
  const choices = payload.choices;

  if (!Array.isArray(choices)) {
    return null;
  }

  const [firstChoice] = choices;

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return null;
  }

  return firstChoice.message;
}

function firstChoiceStopReason(payload: Record<string, unknown>): string | null {
  const choices = payload.choices;

  if (!Array.isArray(choices)) {
    return null;
  }

  const [firstChoice] = choices;

  if (!isRecord(firstChoice)) {
    return null;
  }

  return typeof firstChoice.finish_reason === 'string' ? firstChoice.finish_reason : null;
}

export function normalizeOpenAiCompatibleToolCalls(params: {
  provider: string;
  model: string;
  payload: unknown;
}): ProviderToolCallNormalizationResult {
  const { model, payload, provider } = params;

  if (!isRecord(payload)) {
    return {
      status: 'failed',
      provider,
      model,
      error: 'OpenAI-compatible tool-call payload must be an object.',
      rawSummary: typeof payload,
    };
  }

  const message = firstChoiceMessage(payload);

  if (!message || !Array.isArray(message.tool_calls)) {
    return {
      status: 'failed',
      provider,
      model,
      error: 'OpenAI-compatible payload did not contain assistant tool_calls.',
      rawSummary: Object.keys(payload).sort().join(', ') || 'empty object',
    };
  }

  const providerCallIds: string[] = [];
  const steps = [];

  for (const toolCall of message.tool_calls) {
    if (!isRecord(toolCall) || !isRecord(toolCall.function)) {
      return {
        status: 'failed',
        provider,
        model,
        error: 'OpenAI-compatible tool call must include a function object.',
        rawSummary: 'tool_calls',
      };
    }

    if (toolCall.type !== undefined && toolCall.type !== 'function') {
      return {
        status: 'failed',
        provider,
        model,
        error: 'OpenAI-compatible tool call type must be function.',
        rawSummary: 'tool_calls',
      };
    }

    const tool = toolCall.function.name;
    const input = parseArguments(toolCall.function.arguments);

    if (input === null) {
      return {
        status: 'failed',
        provider,
        model,
        error: 'OpenAI-compatible tool call arguments must be valid JSON objects.',
        rawSummary: 'tool_calls',
      };
    }

    if (typeof toolCall.id === 'string' && toolCall.id.trim()) {
      providerCallIds.push(toolCall.id);
    }

    steps.push({
      tool,
      input,
    });
  }

  return normalizeProviderToolCallPlan({
    provider,
    model,
    payload: {
      source: 'provider_tool_call',
      rawSummary: `tool_calls=${message.tool_calls.length}`,
      providerCallIds,
      stopReason: firstChoiceStopReason(payload),
      proposal: {
        finalOutput: typeof message.content === 'string' ? message.content : null,
        steps,
      },
    },
  });
}
