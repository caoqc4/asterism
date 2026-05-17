import {
  createGmailOAuthLoopbackListener,
  type GmailOAuthLoopbackListenerOptions,
} from './gmail-oauth-loopback-listener.js';
import type { GmailOAuthAccessToken, GmailOAuthService } from './gmail-oauth-service.js';

export type GmailOAuthAuthorizationSessionOptions = {
  oauthService: GmailOAuthService;
  listenerOptions?: GmailOAuthLoopbackListenerOptions;
  scope?: string | string[] | null;
};

export type GmailOAuthAuthorizationSession = {
  authorizationUrl: string;
  redirectUri: string;
  close(): Promise<void>;
  complete(): Promise<GmailOAuthAccessToken>;
};

export async function createGmailOAuthAuthorizationSession(
  options: GmailOAuthAuthorizationSessionOptions,
): Promise<GmailOAuthAuthorizationSession> {
  const listener = await createGmailOAuthLoopbackListener(options.listenerOptions);
  const request = options.oauthService.createAuthorizationRequest({
    redirectUri: listener.redirectUri,
    scope: options.scope,
  });

  return {
    authorizationUrl: request.authorizationUrl,
    redirectUri: request.redirectUri,
    close: () => listener.close(),
    complete: async () => {
      const callback = await listener.waitForCallback(request.state);
      return options.oauthService.exchangeAuthorizationCode({
        code: callback.code,
        codeVerifier: request.codeVerifier,
        redirectUri: request.redirectUri,
      });
    },
  };
}

