import { describe, expect, it } from 'vitest';

import { normalizeProviderToolCallPlan } from './provider-tool-call-normalizer.js';

describe('normalizeProviderToolCallPlan', () => {
  it('normalizes a provider adapter draft into a Taskplane proposal', () => {
    expect(normalizeProviderToolCallPlan({
      provider: 'openai',
      model: 'gpt-4.1',
      payload: {
        source: 'provider_tool_call',
        rawSummary: 'tool_calls=1',
        providerCallIds: ['call_1'],
        stopReason: 'tool_calls',
        proposal: {
          finalOutput: 'I will inspect the task first.',
          steps: [
            {
              tool: 'task.inspect_context',
              input: { includeRecentTimeline: true },
            },
          ],
        },
      },
    })).toEqual({
      status: 'normalized',
      plan: {
        source: 'provider_tool_call',
        provider: 'openai',
        model: 'gpt-4.1',
        rawSummary: 'tool_calls=1',
        providerCallIds: ['call_1'],
        stopReason: 'tool_calls',
        proposal: {
          finalOutput: 'I will inspect the task first.',
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

  it('normalizes provider-safe tool aliases back into Taskplane tool names', () => {
    expect(normalizeProviderToolCallPlan({
      provider: 'openai',
      model: 'gpt-4.1',
      payload: {
        source: 'provider_tool_call',
        proposal: {
          steps: [
            {
              tool: 'taskplane__workspace__search',
              input: { query: 'AgentToolRegistry' },
            },
          ],
        },
      },
    })).toEqual({
      status: 'normalized',
      plan: {
        source: 'provider_tool_call',
        provider: 'openai',
        model: 'gpt-4.1',
        rawSummary: 'proposal, source',
        providerCallIds: [],
        stopReason: null,
        proposal: {
          finalOutput: null,
          steps: [
            {
              tool: 'workspace.search',
              input: { query: 'AgentToolRegistry' },
            },
          ],
        },
      },
    });
  });

  it('fails closed for malformed provider payloads without producing steps', () => {
    expect(normalizeProviderToolCallPlan({
      provider: 'openai-compatible',
      model: 'relay/model',
      payload: {
        source: 'provider_tool_call',
        proposal: {
          steps: [
            {
              tool: 'unknown.execute',
              input: { command: 'npm test' },
            },
          ],
        },
      },
    })).toEqual({
      status: 'failed',
      provider: 'openai-compatible',
      model: 'relay/model',
      error: 'Provider tool-call payload did not contain executable Taskplane steps.',
      rawSummary: 'proposal, source',
    });
  });

  it('fails closed when an otherwise valid provider payload includes an unknown tool', () => {
    expect(normalizeProviderToolCallPlan({
      provider: 'openai',
      model: 'gpt-4.1',
      payload: {
        source: 'provider_tool_call',
        proposal: {
          steps: [
            {
              tool: 'task.inspect_context',
              input: {},
            },
            {
              tool: 'unknown.execute',
              input: { command: 'npm test' },
            },
          ],
        },
      },
    })).toEqual({
      status: 'failed',
      provider: 'openai',
      model: 'gpt-4.1',
      error: 'Provider tool-call payload did not contain executable Taskplane steps.',
      rawSummary: 'proposal, source',
    });
  });

  it('fails closed for raw provider payloads until a dedicated adapter translates them', () => {
    expect(normalizeProviderToolCallPlan({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      payload: {
        content: [
          {
            type: 'tool_use',
            name: 'task.inspect_context',
            input: {},
          },
        ],
      },
    })).toEqual({
      status: 'failed',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      error: 'Provider tool-call payload source is not supported.',
      rawSummary: 'content',
    });
  });
});
