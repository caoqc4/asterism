import { createHash, randomBytes } from 'node:crypto';

import type { GmailOAuthTokenStore } from './gmail-oauth-token-store.js';

const GOOGLE_OAUTH_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_OAUTH_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const DEFAULT_GMAIL_OAUTH_SCOPE = 'https://www.googleapis.com/auth/gmail.metadata';

type FetchLike = typeof fetch;

export type GmailOAuthServiceOptions = {
  clientId: string | null;
  clientSecret?: string | null;
  tokenStore: GmailOAuthTokenStore;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  revokeEndpoint?: string;
  fetchImpl?: FetchLike;
  randomBytesImpl?: (size: number) => Buffer;
};

export type GmailOAuthAccessToken = {
  accessToken: string;
  expiresIn: number | null;
  refreshToken?: string | null;
  scope: string | null;
  tokenType: string | null;
};

export type GmailOAuthAuthorizationRequest = {
  authorizationUrl: string;
  codeVerifier: string;
  state: string;
  redirectUri: string;
};

export type GmailOAuthAuthorizationInput = {
  redirectUri: string;
  scope?: string | string[] | null;
};

export type GmailOAuthCodeExchangeInput = {
  code: string;
  codeVerifier: string;
  redirectUri: string;
};

export type GmailOAuthDisconnectResult = {
  hadRefreshToken: boolean;
  revoked: boolean;
  localTokenCleared: boolean;
  errorReason: string | null;
};

type TokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
  scope?: unknown;
  token_type?: unknown;
};

export class GmailOAuthService {
  private readonly fetchImpl: FetchLike;
  private readonly authorizationEndpoint: string;
  private readonly tokenEndpoint: string;
  private readonly revokeEndpoint: string;
  private readonly randomBytesImpl: (size: number) => Buffer;

  constructor(private readonly options: GmailOAuthServiceOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.authorizationEndpoint = options.authorizationEndpoint ?? GOOGLE_OAUTH_AUTHORIZATION_ENDPOINT;
    this.tokenEndpoint = options.tokenEndpoint ?? GOOGLE_OAUTH_TOKEN_ENDPOINT;
    this.revokeEndpoint = options.revokeEndpoint ?? GOOGLE_OAUTH_REVOKE_ENDPOINT;
    this.randomBytesImpl = options.randomBytesImpl ?? randomBytes;
  }

  createAuthorizationRequest(input: GmailOAuthAuthorizationInput): GmailOAuthAuthorizationRequest {
    const clientId = this.requireClientId();
    const redirectUri = input.redirectUri.trim();
    if (!redirectUri) throw new Error('Gmail OAuth redirect uri is not configured.');

    const codeVerifier = base64Url(this.randomBytesImpl(32));
    const state = base64Url(this.randomBytesImpl(24));
    const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest());
    const scope = normalizeScope(input.scope);
    const url = new URL(this.authorizationEndpoint);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scope);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);

    return {
      authorizationUrl: url.toString(),
      codeVerifier,
      state,
      redirectUri,
    };
  }

  async exchangeAuthorizationCode(input: GmailOAuthCodeExchangeInput): Promise<GmailOAuthAccessToken> {
    const clientId = this.requireClientId();
    const code = input.code.trim();
    const codeVerifier = input.codeVerifier.trim();
    const redirectUri = input.redirectUri.trim();
    if (!code) throw new Error('Gmail OAuth authorization code is empty.');
    if (!codeVerifier) throw new Error('Gmail OAuth code verifier is empty.');
    if (!redirectUri) throw new Error('Gmail OAuth redirect uri is not configured.');

    const body = new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    const clientSecret = this.options.clientSecret?.trim();
    if (clientSecret) body.set('client_secret', clientSecret);

    const payload = await this.postTokenRequest(body, 'Gmail OAuth authorization code exchange failed');
    const token = tokenFromPayload(payload, 'Gmail OAuth authorization code exchange did not return an access token.');
    if (token.refreshToken) await this.options.tokenStore.setRefreshToken(token.refreshToken);
    return token;
  }

  async refreshAccessToken(): Promise<GmailOAuthAccessToken> {
    const clientId = this.requireClientId();

    const refreshToken = await this.options.tokenStore.getRefreshToken();
    if (!refreshToken) throw new Error('Gmail OAuth refresh token is not configured.');

    const body = new URLSearchParams({
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const clientSecret = this.options.clientSecret?.trim();
    if (clientSecret) body.set('client_secret', clientSecret);

    const payload = await this.postTokenRequest(body, 'Gmail OAuth token refresh failed');
    return tokenFromPayload(payload, 'Gmail OAuth token refresh did not return an access token.');
  }

  async disconnect(): Promise<GmailOAuthDisconnectResult> {
    const refreshToken = await this.options.tokenStore.getRefreshToken();
    if (!refreshToken) {
      await this.options.tokenStore.deleteRefreshToken();
      return {
        hadRefreshToken: false,
        revoked: false,
        localTokenCleared: true,
        errorReason: null,
      };
    }

    let revoked = false;
    let errorReason: string | null = null;
    try {
      revoked = await this.revokeToken(refreshToken);
    } catch (error) {
      errorReason = error instanceof Error ? error.message : 'Gmail OAuth revoke failed.';
    } finally {
      await this.options.tokenStore.deleteRefreshToken();
    }

    return {
      hadRefreshToken: true,
      revoked,
      localTokenCleared: true,
      errorReason,
    };
  }

  private async postTokenRequest(body: URLSearchParams, errorPrefix: string): Promise<TokenResponse> {
    const response = await this.fetchImpl(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`${errorPrefix}: ${response.status} ${response.statusText}`.trim());
    }

    return await response.json() as TokenResponse;
  }

  private async revokeToken(token: string): Promise<boolean> {
    const response = await this.fetchImpl(this.revokeEndpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token }),
    });

    if (!response.ok) {
      throw new Error(`Gmail OAuth token revoke failed: ${response.status} ${response.statusText}`.trim());
    }

    return true;
  }

  private requireClientId(): string {
    const clientId = this.options.clientId?.trim();
    if (!clientId) throw new Error('Gmail OAuth client id is not configured.');
    return clientId;
  }
}

function tokenFromPayload(payload: TokenResponse, missingAccessTokenMessage: string): GmailOAuthAccessToken {
  const accessToken = stringOrNull(payload.access_token);
  if (!accessToken) throw new Error(missingAccessTokenMessage);
  return {
    accessToken,
    expiresIn: numberOrNull(payload.expires_in),
    refreshToken: stringOrNull(payload.refresh_token),
    scope: stringOrNull(payload.scope),
    tokenType: stringOrNull(payload.token_type),
  };
}

function normalizeScope(scope: string | string[] | null | undefined): string {
  if (Array.isArray(scope)) {
    const normalized = scope.map((value) => value.trim()).filter(Boolean);
    return normalized.length > 0 ? normalized.join(' ') : DEFAULT_GMAIL_OAUTH_SCOPE;
  }
  const normalized = scope?.trim();
  return normalized || DEFAULT_GMAIL_OAUTH_SCOPE;
}

function base64Url(value: Buffer): string {
  return value
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
