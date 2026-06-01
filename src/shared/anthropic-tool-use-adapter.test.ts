import { describe, expect, it } from 'vitest';

import { normalizeAnthropicToolUse } from './anthropic-tool-use-adapter.js';

describe('normalizeAnthropicToolUse', () => {
  it('maps Anthropic tool_use content blocks into normalized Taskplane steps', () => {
    expect(normalizeAnthropicToolUse({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      payload: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        stop_reason: 'tool_use',
        content: [
          {
            type: 'text',
            text: 'I will inspect the task.',
          },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'task.inspect_context',
            input: { includeRecentTimeline: true },
          },
        ],
      },
    })).toEqual({
      status: 'normalized',
      plan: {
        source: 'provider_tool_call',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        rawSummary: 'tool_use=1',
        providerCallIds: ['toolu_1'],
        stopReason: 'tool_use',
        proposal: {
          finalOutput: 'I will inspect the task.',
          steps: [
            {
              tool: 'task.inspect_context',
              input: { includeRecentTimeline: true },
            },
          ],
        },
      },
    });
  });

  it('fails closed when tool_use input is not an object', () => {
    expect(normalizeAnthropicToolUse({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      payload: {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_bad',
            name: 'task.inspect_context',
            input: 'not-object',
          },
        ],
      },
    })).toEqual({
      status: 'failed',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      error: 'Anthropic tool_use input must be an object.',
      rawSummary: 'content',
    });
  });

  it('fails closed when any content block is malformed', () => {
    expect(normalizeAnthropicToolUse({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      payload: {
        stop_reason: 'tool_use',
        content: [
          'malformed',
          {
            type: 'tool_use',
            id: 'toolu_good',
            name: 'task.inspect_context',
            input: {},
          },
        ],
      },
    })).toEqual({
      status: 'failed',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      error: 'Anthropic content blocks must be objects.',
      rawSummary: 'content',
    });
  });

  it('fails closed when any content block type is unsupported', () => {
    expect(normalizeAnthropicToolUse({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      payload: {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: '...' },
          },
          {
            type: 'tool_use',
            id: 'toolu_good',
            name: 'task.inspect_context',
            input: {},
          },
        ],
      },
    })).toEqual({
      status: 'failed',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      error: 'Anthropic content block type is not supported for client tool-use normalization.',
      rawSummary: 'content',
    });
  });

  it('fails closed when content blocks do not include supported tools', () => {
    expect(normalizeAnthropicToolUse({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      payload: {
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: 'No tools needed.',
          },
        ],
      },
    })).toEqual({
      status: 'failed',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      error: 'Provider tool-call payload did not contain executable Taskplane steps.',
      rawSummary: 'proposal, providerCallIds, rawSummary, source, stopReason',
    });
  });
});
