import { describe, expect, it } from 'vitest';

import { normalizeOpenAiCompatibleToolCalls } from './openai-compatible-tool-call-adapter.js';

describe('normalizeOpenAiCompatibleToolCalls', () => {
  it('maps chat-completion tool_calls into normalized Taskplane steps', () => {
    expect(normalizeOpenAiCompatibleToolCalls({
      provider: 'openai-compatible',
      model: 'relay/model',
      payload: {
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: 'I will inspect the task.',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'task.inspect_context',
                    arguments: '{"includeRecentTimeline":true}',
                  },
                },
              ],
            },
          },
        ],
      },
    })).toEqual({
      status: 'normalized',
      plan: {
        source: 'provider_tool_call',
        provider: 'openai-compatible',
        model: 'relay/model',
        rawSummary: 'tool_calls=1',
        providerCallIds: ['call_1'],
        stopReason: 'tool_calls',
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

  it('fails closed when function arguments are not valid JSON objects', () => {
    expect(normalizeOpenAiCompatibleToolCalls({
      provider: 'openai',
      model: 'gpt-4.1',
      payload: {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: 'call_bad',
                  type: 'function',
                  function: {
                    name: 'task.inspect_context',
                    arguments: 'not json',
                  },
                },
              ],
            },
          },
        ],
      },
    })).toEqual({
      status: 'failed',
      provider: 'openai',
      model: 'gpt-4.1',
      error: 'OpenAI-compatible tool call arguments must be valid JSON objects.',
      rawSummary: 'tool_calls',
    });
  });

  it('fails closed when any tool call lacks a function object', () => {
    expect(normalizeOpenAiCompatibleToolCalls({
      provider: 'openai',
      model: 'gpt-4.1',
      payload: {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: 'call_bad',
                  type: 'custom',
                  custom: {
                    name: 'unknown.execute',
                    input: 'npm test',
                  },
                },
                {
                  id: 'call_good',
                  type: 'function',
                  function: {
                    name: 'task.inspect_context',
                    arguments: '{}',
                  },
                },
              ],
            },
          },
        ],
      },
    })).toEqual({
      status: 'failed',
      provider: 'openai',
      model: 'gpt-4.1',
      error: 'OpenAI-compatible tool call must include a function object.',
      rawSummary: 'tool_calls',
    });
  });

  it('fails closed when a tool call type is not function', () => {
    expect(normalizeOpenAiCompatibleToolCalls({
      provider: 'openai-compatible',
      model: 'relay/model',
      payload: {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: 'call_wrong_type',
                  type: 'custom',
                  function: {
                    name: 'task.inspect_context',
                    arguments: '{}',
                  },
                },
              ],
            },
          },
        ],
      },
    })).toEqual({
      status: 'failed',
      provider: 'openai-compatible',
      model: 'relay/model',
      error: 'OpenAI-compatible tool call type must be function.',
      rawSummary: 'tool_calls',
    });
  });

  it('fails closed when tool_calls are absent', () => {
    expect(normalizeOpenAiCompatibleToolCalls({
      provider: 'fal-openrouter',
      model: 'google/gemini-2.5-flash',
      payload: {
        choices: [
          {
            message: {
              content: 'No tools needed.',
            },
          },
        ],
      },
    })).toEqual({
      status: 'failed',
      provider: 'fal-openrouter',
      model: 'google/gemini-2.5-flash',
      error: 'OpenAI-compatible payload did not contain assistant tool_calls.',
      rawSummary: 'choices',
    });
  });
});
