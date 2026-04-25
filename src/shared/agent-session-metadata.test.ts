import { describe, expect, it } from 'vitest';

import {
  formatLocalAgentSessionMetadata,
  formatProviderNativeAgentSessionMetadata,
} from './agent-session-metadata.js';

describe('agent session metadata formatting', () => {
  it('formats the current local agent executor metadata', () => {
    expect(formatLocalAgentSessionMetadata()).toBe([
      'executor=local_agent',
      'loop=local_note',
    ].join('\n'));
  });

  it('formats provider-native session metadata without raw payloads', () => {
    const metadata = formatProviderNativeAgentSessionMetadata({
      source: 'provider_tool_call',
      provider: 'openai-compatible',
      model: 'relay-model',
      rawSummary: 'tool_calls=1',
      providerCallIds: ['call_1', 'call_2'],
      stopReason: 'tool_calls',
      proposal: {
        steps: [
          {
              tool: 'task.inspect_context',
            input: {
              privatePromptFragment: 'do not persist me',
            },
          },
        ],
      },
    });

    expect(metadata).toBe([
      'executor=provider_native_agent',
      'loop=provider_tool_call',
      'provider=openai-compatible',
      'model=relay-model',
      'adapter=provider_native_tool_call_adapter',
      'rawSummary=tool_calls=1',
      'providerCallIds=call_1,call_2',
      'stopReason=tool_calls',
    ].join('\n'));
    expect(metadata).not.toContain('privatePromptFragment');
    expect(metadata).not.toContain('do not persist me');
  });
});
