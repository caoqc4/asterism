export type GmailOAuthConnectInput = {
  confirmed: boolean;
};

export type GmailOAuthConnectResult = {
  status: 'connected' | 'blocked' | 'unavailable' | 'failed';
  connectorId: 'gmail';
  openedAuthorizationUrl: boolean;
  accountLabel: string | null;
  redirectUri: string | null;
  errorReason: string | null;
};

export type GmailOAuthDisconnectInput = {
  confirmed: boolean;
};

export type GmailOAuthDisconnectResult = {
  status: 'disconnected' | 'blocked' | 'failed';
  connectorId: 'gmail';
  hadRefreshToken: boolean;
  revoked: boolean;
  localTokenCleared: boolean;
  errorReason: string | null;
};

