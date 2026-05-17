import { describe, expect, it, vi } from 'vitest';

import type { GmailOAuthTokenStore } from './gmail-oauth-token-store.js';
import { GmailOAuthService } from './gmail-oauth-service.js';

describe('GmailOAuthService', () => {
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
