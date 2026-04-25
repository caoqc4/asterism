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
      'sandboxCoding=disabled',
      'sandboxProvider=disabled',
      'sandboxPromotion=decision_required',
    ].join('\n'));
  });

  it('formats local agent metadata with sandbox eligibility details', () => {
    expect(formatLocalAgentSessionMetadata({
      blockedReasons: [
        'sandbox provider does not expose the required staged-write, targeted-check, patch-artifact capability set',
      ],
      eligible: false,
      summary: 'Sandbox coding lane unavailable.',
    })).toBe([
      'executor=local_agent',
      'loop=local_note',
      'sandboxCoding=blocked',
      'sandboxProvider=not_ready',
      'sandboxPromotion=decision_required',
      'sandboxBlockedReasons=sandbox provider does not expose the required staged-write, targeted-check, patch-artifact capability set',
    ].join('\n'));
  });

  it('formats local agent metadata with sandbox patch-review adapter resolution', () => {
    expect(formatLocalAgentSessionMetadata(null, {
      reason: 'Sandbox patch review adapter is disabled because the sandbox coding-agent feature flag is off.',
      status: 'disabled',
    }, {
      reason: 'Sandbox patch review adapter is disabled because the sandbox coding-agent feature flag is off.',
      status: 'blocked',
      summary: 'Sandbox patch review run plan blocked: Sandbox patch review adapter is disabled because the sandbox coding-agent feature flag is off.',
    })).toBe([
      'executor=local_agent',
      'loop=local_note',
      'sandboxCoding=disabled',
      'sandboxProvider=disabled',
      'sandboxPromotion=decision_required',
      'sandboxPatchReviewAdapter=disabled',
      'sandboxPatchReviewAdapterReason=Sandbox patch review adapter is disabled because the sandbox coding-agent feature flag is off.',
      'sandboxPatchReviewPlan=blocked',
      'sandboxPatchReviewPlanSummary=Sandbox patch review run plan blocked: Sandbox patch review adapter is disabled because the sandbox coding-agent feature flag is off.',
      'sandboxPatchReviewPlanReason=Sandbox patch review adapter is disabled because the sandbox coding-agent feature flag is off.',
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
