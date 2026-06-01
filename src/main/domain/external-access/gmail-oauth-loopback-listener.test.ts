import { describe, expect, it } from 'vitest';

import { createGmailOAuthLoopbackListener } from './gmail-oauth-loopback-listener.js';

describe('Gmail OAuth loopback listener', () => {
  it('captures a matching OAuth code and state then closes itself', async () => {
    const listener = await createGmailOAuthLoopbackListener({ timeoutMs: 1_000 });
    const callback = listener.waitForCallback('state-1');

    const response = await fetch(`${listener.redirectUri}?code=code-1&state=state-1`);

    await expect(response.text()).resolves.toContain('Authorization complete');
    await expect(callback).resolves.toEqual({
      code: 'code-1',
      state: 'state-1',
    });
    await expect(fetch(`${listener.redirectUri}?code=again&state=state-1`)).rejects.toThrow();
  });

  it('rejects callbacks with the wrong state', async () => {
    const listener = await createGmailOAuthLoopbackListener({ timeoutMs: 1_000 });
    const callback = listener.waitForCallback('state-1');
    const handledCallback = callback.catch((error: unknown) => error);

    const response = await fetch(`${listener.redirectUri}?code=code-1&state=state-2`);

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toContain('state did not match');
    const error = await handledCallback;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('state did not match');
  });

  it('times out when no callback arrives', async () => {
    const listener = await createGmailOAuthLoopbackListener({ timeoutMs: 10 });

    await expect(listener.waitForCallback('state-1')).rejects.toThrow('timed out');
  });
});
