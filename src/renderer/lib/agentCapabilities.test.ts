import { describe, expect, it } from 'vitest';

import type { AiConfigStatus } from '@shared/types/settings';
import {
  formatAgentSessionMetadataSummary,
  formatPreRunAgentCapabilitySummary,
} from './agentCapabilities';

function buildAiStatus(provider: AiConfigStatus['provider']): AiConfigStatus {
  return {
    configured: true,
    apiKeyStored: true,
    apiKeySource: 'env',
    provider,
    model: provider === 'replicate' ? 'openai/gpt-oss-20b' : 'claude-3-5-sonnet-latest',
    baseUrl: null,
    workspaceRoot: '/tmp/taskplane-workspace',
    updatedAt: '2026-01-01T00:00:00.000Z',
    configPath: '/tmp/config.json',
    featureFlags: {
      enableScheduler: false,
    },
  };
}

describe('agent capability formatting', () => {
  it('keeps the pre-run preview honest before a provider is configured', () => {
    expect(formatPreRunAgentCapabilitySummary(null, false)).toBe(
      'Agent 能力预览：provider not configured / text-only planning unavailable until AI config is ready / read-only workspace context disabled for this run / task update/evidence tools disabled for this run / structured tool calls unavailable until AI config is ready / sandbox coding lane disabled; workspace patch/commands unavailable',
    );
  });

  it('keeps the pre-run preview unavailable when provider defaults exist without an API key', () => {
    expect(formatPreRunAgentCapabilitySummary({
      ...buildAiStatus('anthropic'),
      configured: false,
      apiKeyStored: false,
      apiKeySource: null,
    }, false)).toBe(
      'Agent 能力预览：anthropic / claude-3-5-sonnet-latest / text-only planning unavailable until AI config is ready / read-only workspace context disabled for this run / task update/evidence tools disabled for this run / structured tool calls unavailable until AI config is ready / sandbox coding lane disabled; workspace patch/commands unavailable',
    );
  });

  it('previews local executor capabilities before an agent run', () => {
    expect(formatPreRunAgentCapabilitySummary(buildAiStatus('anthropic'), false)).toBe(
      'Agent 能力预览：anthropic / claude-3-5-sonnet-latest / text-only planning in the local executor / read-only workspace context disabled for this run / task update/evidence tools disabled for this run / structured tool calls disabled until provider-native flag is enabled / sandbox coding lane disabled; workspace patch/commands unavailable',
    );
    expect(formatPreRunAgentCapabilitySummary(buildAiStatus('anthropic'), true)).toContain(
      'read-only workspace context enabled for this run',
    );
  });

  it('names Replicate as text-only planning before an agent run', () => {
    expect(formatPreRunAgentCapabilitySummary(buildAiStatus('replicate'), true)).toBe(
      'Agent 能力预览：replicate / openai/gpt-oss-20b / text-only planning via Replicate / read-only workspace context enabled for this run / task update/evidence tools disabled for this run / structured tool calls unavailable on native Replicate text path / sandbox coding lane disabled; workspace patch/commands unavailable',
    );
  });

  it('names task update tool opt-in before an agent run', () => {
    expect(formatPreRunAgentCapabilitySummary(buildAiStatus('anthropic'), false, true)).toContain(
      'task update/evidence tools enabled for this run',
    );
  });

  it.each([
    'anthropic',
    'openai',
    'openai-compatible',
    'fal-openrouter',
  ] as const)('keeps %s routed through the local text-only executor preview', (provider) => {
    const summary = formatPreRunAgentCapabilitySummary(buildAiStatus(provider), false);

    expect(summary).toContain(`${provider} / claude-3-5-sonnet-latest`);
    expect(summary).toContain('text-only planning in the local executor');
    expect(summary).toContain('read-only workspace context disabled for this run');
    expect(summary).toContain('task update/evidence tools disabled for this run');
    expect(summary).toContain('structured tool calls disabled until provider-native flag is enabled');
    expect(summary).toContain('sandbox coding lane disabled; workspace patch/commands unavailable');
  });

  it('previews limited provider-native safe-read tool calls when the flag is enabled', () => {
    expect(formatPreRunAgentCapabilitySummary({
      ...buildAiStatus('openai-compatible'),
      featureFlags: {
        enableScheduler: false,
        enableProviderNativeToolCalls: true,
      },
    }, true)).toContain('structured tool calls enabled for provider safe-read tools');
  });

  it('formats provider-native agent session metadata for run detail', () => {
    expect(formatAgentSessionMetadataSummary({
      id: 'agent_session_1',
      runId: 'run_1',
      mode: 'agent',
      status: 'completed',
      capabilities: {
        structuredToolCalls: true,
        textOnlyPlanning: false,
        streaming: false,
        fileContext: false,
        taskMutationTools: false,
        longRunningSessions: false,
      },
      metadata: [
        'executor=provider_native_agent',
        'loop=provider_tool_call',
        'provider=openai-compatible',
        'model=relay-model',
        'adapter=provider_native_tool_call_adapter',
        'rawSummary=tool_calls=1',
        'providerCallIds=call_1',
        'stopReason=tool_calls',
      ].join('\n'),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })).toBe(
      'Provider-native session / openai-compatible / relay-model / adapter=provider_native_tool_call_adapter / raw=tool_calls=1 / calls=call_1 / stop=tool_calls',
    );
  });

  it('formats local agent session metadata with disabled sandbox state', () => {
    expect(formatAgentSessionMetadataSummary({
      id: 'agent_session_1',
      runId: 'run_1',
      mode: 'agent',
      status: 'completed',
      capabilities: {
        structuredToolCalls: false,
        textOnlyPlanning: true,
        streaming: false,
        fileContext: true,
        taskMutationTools: true,
        longRunningSessions: false,
      },
      metadata: [
        'executor=local_agent',
        'loop=local_note',
        'sandboxCoding=disabled',
        'sandboxProvider=disabled',
        'sandboxPromotion=decision_required',
      ].join('\n'),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })).toBe(
      'executor=local_agent / loop=local_note / sandboxCoding=disabled / sandboxProvider=disabled / sandboxPromotion=decision_required',
    );
  });
});
