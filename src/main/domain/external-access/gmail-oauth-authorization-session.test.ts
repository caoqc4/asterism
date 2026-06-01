import { describe, expect, it, vi } from 'vitest';

import { createGmailOAuthAuthorizationSession } from './gmail-oauth-authorization-session.js';
import { GmailOAuthService } from './gmail-oauth-service.js';

describe('Gmail OAuth authorization session', () => {
  it('composes authorization URL, loopback callback, and code exchange without opening a browser', async () => {
    const tokenStore = {
      getRefreshToken: vi.fn(),
      hasRefreshToken: vi.fn(),
      setRefreshToken: vi.fn(),
      deleteRefreshToken: vi.fn(),
    };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'short-lived-token',
      refresh_token: 'refresh-token-secret',
      expires_in: 3600,
      token_type: 'Bearer',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const service = new GmailOAuthService({
      clientId: 'client-id-1',
      tokenStore: tokenStore as never,
      authorizationEndpoint: 'https://oauth.test/auth',
      tokenEndpoint: 'https://oauth.test/token',
      fetchImpl: fetchImpl as never,
      randomBytesImpl: (size) => Buffer.alloc(size, 2),
    });

    const session = await createGmailOAuthAuthorizationSession({
      oauthService: service,
      listenerOptions: { timeoutMs: 1_000 },
    });
    const authorizationUrl = new URL(session.authorizationUrl);
    const state = authorizationUrl.searchParams.get('state');
    const codeVerifier = authorizationUrl.searchParams.get('code_challenge');
    const completion = session.complete();

    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe('https://oauth.test/auth');
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(session.redirectUri);
    expect(state).toBeTruthy();
    expect(codeVerifier).toBeTruthy();

    await fetch(`${session.redirectUri}?code=code-1&state=${state}`);
    await expect(completion).resolves.toMatchObject({
      accessToken: 'short-lived-token',
      refreshToken: 'refresh-token-secret',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0];
    expect(String(init.body)).toContain('grant_type=authorization_code');
    expect(String(init.body)).toContain('code=code-1');
    expect(tokenStore.setRefreshToken).toHaveBeenCalledWith('refresh-token-secret');
  });
});

