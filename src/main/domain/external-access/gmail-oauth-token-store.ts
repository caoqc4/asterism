import keytar from 'keytar';

const SERVICE_NAME = 'taskplane';
const GMAIL_REFRESH_TOKEN_ACCOUNT = 'external_access_gmail_refresh_token';

export type GmailOAuthTokenStoreOptions = {
  serviceName?: string;
  refreshTokenAccount?: string;
};

export class GmailOAuthTokenStore {
  private readonly serviceName: string;
  private readonly refreshTokenAccount: string;

  constructor(options: GmailOAuthTokenStoreOptions = {}) {
    this.serviceName = options.serviceName ?? SERVICE_NAME;
    this.refreshTokenAccount = options.refreshTokenAccount ?? GMAIL_REFRESH_TOKEN_ACCOUNT;
  }

  async getRefreshToken(): Promise<string | null> {
    const token = await keytar.getPassword(this.serviceName, this.refreshTokenAccount);
    return token?.trim() || null;
  }

  async hasRefreshToken(): Promise<boolean> {
    return Boolean(await this.getRefreshToken());
  }

  async setRefreshToken(token: string): Promise<void> {
    const normalized = token.trim();
    if (!normalized) throw new Error('Gmail OAuth refresh token cannot be empty.');
    await keytar.setPassword(this.serviceName, this.refreshTokenAccount, normalized);
  }

  async deleteRefreshToken(): Promise<void> {
    await keytar.deletePassword(this.serviceName, this.refreshTokenAccount);
  }
}

