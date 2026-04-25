import { describe, expect, it } from 'vitest';

import type { AiConfigStatus } from '@shared/types/settings';
import { formatPreRunAgentCapabilitySummary } from './agentCapabilities';

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
      'Agent 能力预览：provider not configured / text-only planning unavailable until provider configured / read-only workspace context disabled for this run / task update/evidence tools disabled for this run / structured tool calls unavailable until provider configured / patch/commands unavailable',
    );
  });

  it('previews local executor capabilities before an agent run', () => {
    expect(formatPreRunAgentCapabilitySummary(buildAiStatus('anthropic'), false)).toBe(
      'Agent 能力预览：anthropic / claude-3-5-sonnet-latest / text-only planning in the local executor / read-only workspace context disabled for this run / task update/evidence tools disabled for this run / structured tool calls deferred in Taskplane local executor / patch/commands unavailable',
    );
    expect(formatPreRunAgentCapabilitySummary(buildAiStatus('anthropic'), true)).toContain(
      'read-only workspace context enabled for this run',
    );
  });

  it('names Replicate as text-only planning before an agent run', () => {
    expect(formatPreRunAgentCapabilitySummary(buildAiStatus('replicate'), true)).toBe(
      'Agent 能力预览：replicate / openai/gpt-oss-20b / text-only planning via Replicate / read-only workspace context enabled for this run / task update/evidence tools disabled for this run / structured tool calls unavailable on native Replicate text path / patch/commands unavailable',
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
    expect(summary).toContain('structured tool calls deferred in Taskplane local executor');
    expect(summary).toContain('patch/commands unavailable');
  });
});
