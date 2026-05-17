import { describe, expect, it, vi } from 'vitest';

import type { GmailOAuthTokenStore } from './gmail-oauth-token-store.js';
import { GmailOAuthService } from './gmail-oauth-service.js';

describe('GmailOAuthService', () => {
  it('creates a desktop authorization URL with PKCE and state', () => {
    const service = new GmailOAuthService({
      clientId: 'client-id-1',
      tokenStore: tokenStoreWithRefreshToken(null),
      authorizationEndpoint: 'https://oauth.test/auth',
      randomBytesImpl: (size) => Buffer.alloc(size, 1),
    });

    const request = service.createAuthorizationRequest({
      redirectUri: 'http://127.0.0.1:49152/oauth/gmail/callback',
      scope: ['https://www.googleapis.com/auth/gmail.metadata'],
    });
    const url = new URL(request.authorizationUrl);

    expect(url.origin + url.pathname).toBe('https://oauth.test/auth');
    expect(url.searchParams.get('client_id')).toBe('client-id-1');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:49152/oauth/gmail/callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('include_granted_scopes')).toBe('true');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/gmail.metadata');
    expect(url.searchParams.get('state')).toBe(request.state);
    expect(request.codeVerifier).not.toContain('=');
    expect(request.state).not.toContain('=');
  });

  it('exchanges an authorization code and persists only the returned refresh token', async () => {
    const tokenStore = tokenStoreWithRefreshToken(null);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      access_token: 'access-token-short-lived',
      expires_in: 3600,
      refresh_token: 'refresh-token-secret',
      scope: 'https://www.googleapis.com/auth/gmail.metadata',
      token_type: 'Bearer',
    }));
    const service = new GmailOAuthService({
      clientId: 'client-id-1',
      tokenStore,
      tokenEndpoint: 'https://oauth.test/token',
      fetchImpl: fetchImpl as never,
    });

    const token = await service.exchangeAuthorizationCode({
      code: 'code-1',
      codeVerifier: 'verifier-1',
      redirectUri: 'http://127.0.0.1:49152/oauth/gmail/callback',
    });

    expect(token).toMatchObject({
      accessToken: 'access-token-short-lived',
      refreshToken: 'refresh-token-secret',
      expiresIn: 3600,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0];
    expect(String(init.body)).toContain('grant_type=authorization_code');
    expect(String(init.body)).toContain('code=code-1');
    expect(String(init.body)).toContain('code_verifier=verifier-1');
    expect(tokenStore.setRefreshToken).toHaveBeenCalledWith('refresh-token-secret');
  });

  it('refreshes an access token without persisting the access token', async () => {
    const tokenStore = tokenStoreWithRefreshToken('refresh-token-secret');
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      access_token: 'access-token-short-lived',
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/gmail.metadata',
      token_type: 'Bearer',
    }));
    const service = new GmailOAuthService({
      clientId: 'client-id-1',
      clientSecret: 'client-secret-1',
      tokenStore,
      tokenEndpoint: 'https://oauth.test/token',
      fetchImpl: fetchImpl as never,
    });

    const token = await service.refreshAccessToken();

    expect(token).toEqual({
      accessToken: 'access-token-short-lived',
      expiresIn: 3600,
      refreshToken: null,
      scope: 'https://www.googleapis.com/auth/gmail.metadata',
      tokenType: 'Bearer',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('client_id=client-id-1');
    expect(String(init.body)).toContain('grant_type=refresh_token');
    expect(String(init.body)).toContain('refresh_token=refresh-token-secret');
    expect(String(init.body)).toContain('client_secret=client-secret-1');
    expect(tokenStore.setRefreshToken).not.toHaveBeenCalled();
  });

  it('blocks refresh when required OAuth credentials are missing', async () => {
    await expect(new GmailOAuthService({
      clientId: ' ',
      tokenStore: tokenStoreWithRefreshToken('refresh-token-secret'),
    }).refreshAccessToken()).rejects.toThrow('client id');

    await expect(new GmailOAuthService({
      clientId: 'client-id-1',
      tokenStore: tokenStoreWithRefreshToken(null),
    }).refreshAccessToken()).rejects.toThrow('refresh token');
  });

  it('does not include token response bodies in refresh errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'invalid_grant',
      error_description: 'refresh-token-secret leaked here',
    }), {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'content-type': 'application/json' },
    }));
    const service = new GmailOAuthService({
      clientId: 'client-id-1',
      tokenStore: tokenStoreWithRefreshToken('refresh-token-secret'),
      fetchImpl: fetchImpl as never,
    });

    let error: unknown;
    try {
      await service.refreshAccessToken();
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Gmail OAuth token refresh failed: 400 Bad Request');
    expect((error as Error).message).not.toContain('refresh-token-secret');
  });

  it('revokes and clears the stored refresh token on disconnect', async () => {
    const tokenStore = tokenStoreWithRefreshToken('refresh-token-secret');
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const service = new GmailOAuthService({
      clientId: 'client-id-1',
      tokenStore,
      revokeEndpoint: 'https://oauth.test/revoke',
      fetchImpl: fetchImpl as never,
    });

    await expect(service.disconnect()).resolves.toEqual({
      hadRefreshToken: true,
      revoked: true,
      localTokenCleared: true,
      errorReason: null,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://oauth.test/revoke');
    expect(String(fetchImpl.mock.calls[0][1].body)).toContain('token=refresh-token-secret');
    expect(tokenStore.deleteRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('clears the stored refresh token even when revoke fails without leaking token values', async () => {
    const tokenStore = tokenStoreWithRefreshToken('refresh-token-secret');
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'invalid_token',
      error_description: 'refresh-token-secret leaked here',
    }), {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'content-type': 'application/json' },
    }));
    const service = new GmailOAuthService({
      clientId: 'client-id-1',
      tokenStore,
      fetchImpl: fetchImpl as never,
    });

    const result = await service.disconnect();

    expect(result).toMatchObject({
      hadRefreshToken: true,
      revoked: false,
      localTokenCleared: true,
      errorReason: 'Gmail OAuth token revoke failed: 400 Bad Request',
    });
    expect(result.errorReason).not.toContain('refresh-token-secret');
    expect(tokenStore.deleteRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('treats disconnect without a refresh token as local cleanup only', async () => {
    const tokenStore = tokenStoreWithRefreshToken(null);
    const fetchImpl = vi.fn();
    const service = new GmailOAuthService({
      clientId: 'client-id-1',
      tokenStore,
      fetchImpl: fetchImpl as never,
    });

    await expect(service.disconnect()).resolves.toEqual({
      hadRefreshToken: false,
      revoked: false,
      localTokenCleared: true,
      errorReason: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(tokenStore.deleteRefreshToken).toHaveBeenCalledTimes(1);
  });
});

function tokenStoreWithRefreshToken(refreshToken: string | null): GmailOAuthTokenStore {
  return {
    getRefreshToken: vi.fn().mockResolvedValue(refreshToken),
    hasRefreshToken: vi.fn().mockResolvedValue(Boolean(refreshToken)),
    setRefreshToken: vi.fn(),
    deleteRefreshToken: vi.fn(),
  } as unknown as GmailOAuthTokenStore;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
