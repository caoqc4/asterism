import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GmailOAuthControlService } from './gmail-oauth-control-service.js';

describe('GmailOAuthControlService', () => {
  beforeEach(() => {
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_ID;
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_SECRET;
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCOUNT;
  });

  afterEach(() => {
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_ID;
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_SECRET;
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCOUNT;
  });

  it('blocks connect until the caller provides explicit confirmation', async () => {
    const service = new GmailOAuthControlService({
      openExternal: vi.fn(),
      createSession: vi.fn(),
    });

    await expect(service.connect({ confirmed: false })).resolves.toMatchObject({
      status: 'blocked',
      openedAuthorizationUrl: false,
      errorReason: 'Gmail OAuth connection requires explicit user confirmation.',
    });
  });

  it('reports unavailable when OAuth client id is missing', async () => {
    const service = new GmailOAuthControlService({
      openExternal: vi.fn(),
      createSession: vi.fn(),
    });

    await expect(service.connect({ confirmed: true })).resolves.toMatchObject({
      status: 'unavailable',
      errorReason: 'TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_ID is not configured.',
    });
  });

  it('opens the authorization URL and waits for callback completion', async () => {
    process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_ID = 'client-id-1';
    process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCOUNT = 'user@example.com';
    const complete = vi.fn().mockResolvedValue({
      accessToken: 'short-lived-token',
    });
    const close = vi.fn();
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const createSession = vi.fn().mockResolvedValue({
      authorizationUrl: 'https://oauth.test/auth',
      redirectUri: 'http://127.0.0.1:40000/oauth/gmail/callback',
      complete,
      close,
    });
    const service = new GmailOAuthControlService({
      createSession,
      openExternal,
    });

    await expect(service.connect({ confirmed: true })).resolves.toEqual({
      status: 'connected',
      connectorId: 'gmail',
      accountLabel: 'user@example.com',
      openedAuthorizationUrl: true,
      redirectUri: 'http://127.0.0.1:40000/oauth/gmail/callback',
      errorReason: null,
    });
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith('https://oauth.test/auth');
    expect(complete).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('closes the session when authorization fails', async () => {
    process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_ID = 'client-id-1';
    const close = vi.fn().mockResolvedValue(undefined);
    const service = new GmailOAuthControlService({
      openExternal: vi.fn().mockResolvedValue(undefined),
      createSession: vi.fn().mockResolvedValue({
        authorizationUrl: 'https://oauth.test/auth',
        redirectUri: 'http://127.0.0.1:40000/oauth/gmail/callback',
        complete: vi.fn().mockRejectedValue(new Error('callback timed out')),
        close,
      }),
    });

    await expect(service.connect({ confirmed: true })).resolves.toMatchObject({
      status: 'failed',
      openedAuthorizationUrl: true,
      errorReason: 'callback timed out',
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('disconnects only after confirmation and delegates to OAuth credential cleanup', async () => {
    const tokenStore = {
      getRefreshToken: vi.fn().mockResolvedValue('refresh-token-secret'),
      hasRefreshToken: vi.fn(),
      setRefreshToken: vi.fn(),
      deleteRefreshToken: vi.fn(),
    };
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const service = new GmailOAuthControlService({
      tokenStore: tokenStore as never,
    });
    vi.stubGlobal('fetch', fetchImpl);

    await expect(service.disconnect({ confirmed: false })).resolves.toMatchObject({
      status: 'blocked',
      localTokenCleared: false,
    });
    await expect(service.disconnect({ confirmed: true })).resolves.toMatchObject({
      status: 'disconnected',
      hadRefreshToken: true,
      revoked: true,
      localTokenCleared: true,
    });
    expect(tokenStore.deleteRefreshToken).toHaveBeenCalledTimes(1);
  });
});

