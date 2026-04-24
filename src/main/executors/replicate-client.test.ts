import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateReplicateText } from './replicate-client.js';

describe('generateReplicateText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a Replicate prediction and returns text output', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'succeeded',
        output: ['Hello ', 'from Replicate'],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const output = await generateReplicateText(
      {
        provider: 'replicate',
        model: 'openai/gpt-oss-20b',
        apiKey: 'replicate-key',
        featureFlags: {
          enableScheduler: false,
        },
      },
      'Draft a short update.',
    );

    expect(fetchMock).toHaveBeenCalledWith('https://api.replicate.com/v1/models/openai/gpt-oss-20b/predictions', {
      body: JSON.stringify({
        input: {
          prompt: 'Draft a short update.',
          system_prompt: 'You are Taskplane, a concise assistant for local-first knowledge work.',
        },
      }),
      headers: {
        Authorization: 'Bearer replicate-key',
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      method: 'POST',
    });
    expect(output).toBe('Hello from Replicate');
  });

  it('requires owner/model format', async () => {
    await expect(
      generateReplicateText(
        {
          provider: 'replicate',
          model: 'gpt-oss-20b',
          apiKey: 'replicate-key',
          featureFlags: {
            enableScheduler: false,
          },
        },
        'Prompt',
      ),
    ).rejects.toThrow('Replicate model must use the owner/model format.');
  });
});
