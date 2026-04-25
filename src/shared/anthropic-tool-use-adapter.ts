import type { ProviderToolCallNormalizationResult } from './types/agent-execution.js';
import { normalizeProviderToolCallPlan } from './provider-tool-call-normalizer.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rawSummary(payload: Record<string, unknown>): string {
  return Object.keys(payload).sort().join(', ') || 'empty object';
}

export function normalizeAnthropicToolUse(params: {
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
      error: 'Anthropic tool-use payload must be an object.',
      rawSummary: typeof payload,
    };
  }

  if (!Array.isArray(payload.content)) {
    return {
      status: 'failed',
      provider,
      model,
      error: 'Anthropic payload did not contain content blocks.',
      rawSummary: rawSummary(payload),
    };
  }

  const providerCallIds: string[] = [];
  const textBlocks: string[] = [];
  const steps = [];

  for (const block of payload.content) {
    if (!isRecord(block)) {
      continue;
    }

    if (block.type === 'text' && typeof block.text === 'string') {
      textBlocks.push(block.text);
      continue;
    }

    if (block.type !== 'tool_use') {
      continue;
    }

    if (typeof block.name !== 'string') {
      return {
        status: 'failed',
        provider,
        model,
        error: 'Anthropic tool_use block requires a tool name.',
        rawSummary: 'content',
      };
    }

    if (!isRecord(block.input)) {
      return {
        status: 'failed',
        provider,
        model,
        error: 'Anthropic tool_use input must be an object.',
        rawSummary: 'content',
      };
    }

    if (typeof block.id === 'string' && block.id.trim()) {
      providerCallIds.push(block.id);
    }

    steps.push({
      tool: block.name,
      input: block.input,
    });
  }

  return normalizeProviderToolCallPlan({
    provider,
    model,
    payload: {
      source: 'provider_tool_call',
      rawSummary: `tool_use=${steps.length}`,
      providerCallIds,
      stopReason: typeof payload.stop_reason === 'string' ? payload.stop_reason : null,
      proposal: {
        finalOutput: textBlocks.join('\n').trim() || null,
        steps,
      },
    },
  });
}
