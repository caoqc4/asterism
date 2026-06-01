import type {
  GmailOAuthConnectInput,
  GmailOAuthConnectResult,
  GmailOAuthDisconnectInput,
  GmailOAuthDisconnectResult,
} from '../../../shared/types/external-access-control.js';
import { readEnvValue } from '../../config/env.js';
import { shell } from '../../electron.js';
import {
  EXTERNAL_ACCESS_GMAIL_ACCOUNT_ENV,
  EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_ID_ENV,
  EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_SECRET_ENV,
} from './external-access-status-service.js';
import {
  createGmailOAuthAuthorizationSession,
  type GmailOAuthAuthorizationSession,
} from './gmail-oauth-authorization-session.js';
import { GmailOAuthService } from './gmail-oauth-service.js';
import { GmailOAuthTokenStore } from './gmail-oauth-token-store.js';

type GmailOAuthSessionFactory = (options: {
  oauthService: GmailOAuthService;
}) => Promise<GmailOAuthAuthorizationSession>;

export type GmailOAuthControlServiceOptions = {
  openExternal?: (url: string) => Promise<void>;
  createSession?: GmailOAuthSessionFactory;
  tokenStore?: GmailOAuthTokenStore;
  now?: () => string;
};

export class GmailOAuthControlService {
  private readonly openExternal: (url: string) => Promise<void>;
  private readonly createSession: GmailOAuthSessionFactory;
  private readonly tokenStore: GmailOAuthTokenStore;

  constructor(options: GmailOAuthControlServiceOptions = {}) {
    this.openExternal = options.openExternal ?? ((url) => shell.openExternal(url));
    this.createSession = options.createSession ?? ((sessionOptions) => createGmailOAuthAuthorizationSession(sessionOptions));
    this.tokenStore = options.tokenStore ?? new GmailOAuthTokenStore();
  }

  async connect(input: GmailOAuthConnectInput): Promise<GmailOAuthConnectResult> {
    if (!input.confirmed) {
      return connectResult('blocked', {
        errorReason: 'Gmail OAuth connection requires explicit user confirmation.',
      });
    }

    const clientId = readEnvValue(EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_ID_ENV);
    if (!clientId) {
      return connectResult('unavailable', {
        errorReason: `${EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_ID_ENV} is not configured.`,
      });
    }

    const oauthService = this.createOAuthService(clientId);
    let session: GmailOAuthAuthorizationSession | null = null;
    try {
      session = await this.createSession({ oauthService });
      await this.openExternal(session.authorizationUrl);
      await session.complete();
      return connectResult('connected', {
        accountLabel: readEnvValue(EXTERNAL_ACCESS_GMAIL_ACCOUNT_ENV),
        openedAuthorizationUrl: true,
        redirectUri: session.redirectUri,
      });
    } catch (error) {
      await session?.close().catch(() => undefined);
      return connectResult('failed', {
        accountLabel: readEnvValue(EXTERNAL_ACCESS_GMAIL_ACCOUNT_ENV),
        openedAuthorizationUrl: Boolean(session),
        redirectUri: session?.redirectUri ?? null,
        errorReason: error instanceof Error ? error.message : 'Gmail OAuth connection failed.',
      });
    }
  }

  async disconnect(input: GmailOAuthDisconnectInput): Promise<GmailOAuthDisconnectResult> {
    if (!input.confirmed) {
      return {
        status: 'blocked',
        connectorId: 'gmail',
        hadRefreshToken: false,
        revoked: false,
        localTokenCleared: false,
        errorReason: 'Gmail OAuth disconnect requires explicit user confirmation.',
      };
    }

    const clientId = readEnvValue(EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_ID_ENV) ?? 'disconnect-only';
    try {
      const result = await this.createOAuthService(clientId).disconnect();
      return {
        status: 'disconnected',
        connectorId: 'gmail',
        hadRefreshToken: result.hadRefreshToken,
        revoked: result.revoked,
        localTokenCleared: result.localTokenCleared,
        errorReason: result.errorReason,
      };
    } catch (error) {
      return {
        status: 'failed',
        connectorId: 'gmail',
        hadRefreshToken: false,
        revoked: false,
        localTokenCleared: false,
        errorReason: error instanceof Error ? error.message : 'Gmail OAuth disconnect failed.',
      };
    }
  }

  private createOAuthService(clientId: string): GmailOAuthService {
    return new GmailOAuthService({
      clientId,
      clientSecret: readEnvValue(EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_SECRET_ENV),
      tokenStore: this.tokenStore,
    });
  }
}

function connectResult(
  status: GmailOAuthConnectResult['status'],
  overrides: Partial<Omit<GmailOAuthConnectResult, 'status' | 'connectorId'>> = {},
): GmailOAuthConnectResult {
  return {
    status,
    connectorId: 'gmail',
    accountLabel: overrides.accountLabel ?? null,
    openedAuthorizationUrl: overrides.openedAuthorizationUrl ?? false,
    redirectUri: overrides.redirectUri ?? null,
    errorReason: overrides.errorReason ?? null,
  };
}

