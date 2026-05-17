import type { GmailOAuthTokenStore } from './gmail-oauth-token-store.js';

const GOOGLE_OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

type FetchLike = typeof fetch;

export type GmailOAuthServiceOptions = {
  clientId: string | null;
  clientSecret?: string | null;
  tokenStore: GmailOAuthTokenStore;
  tokenEndpoint?: string;
  fetchImpl?: FetchLike;
};

export type GmailOAuthAccessToken = {
  accessToken: string;
  expiresIn: number | null;
  scope: string | null;
  tokenType: string | null;
};

type TokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  token_type?: unknown;
};

export class GmailOAuthService {
  private readonly fetchImpl: FetchLike;
  private readonly tokenEndpoint: string;

  constructor(private readonly options: GmailOAuthServiceOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.tokenEndpoint = options.tokenEndpoint ?? GOOGLE_OAUTH_TOKEN_ENDPOINT;
  }

  async refreshAccessToken(): Promise<GmailOAuthAccessToken> {
    const clientId = this.options.clientId?.trim();
    if (!clientId) throw new Error('Gmail OAuth client id is not configured.');

    const refreshToken = await this.options.tokenStore.getRefreshToken();
    if (!refreshToken) throw new Error('Gmail OAuth refresh token is not configured.');

    const body = new URLSearchParams({
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const clientSecret = this.options.clientSecret?.trim();
    if (clientSecret) body.set('client_secret', clientSecret);

    const response = await this.fetchImpl(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Gmail OAuth token refresh failed: ${response.status} ${response.statusText}`.trim());
    }

    const payload = await response.json() as TokenResponse;
    const accessToken = stringOrNull(payload.access_token);
    if (!accessToken) throw new Error('Gmail OAuth token refresh did not return an access token.');

    return {
      accessToken,
      expiresIn: numberOrNull(payload.expires_in),
      scope: stringOrNull(payload.scope),
      tokenType: stringOrNull(payload.token_type),
    };
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

