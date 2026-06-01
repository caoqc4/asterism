import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPasswordMock = vi.fn();
const setPasswordMock = vi.fn();
const deletePasswordMock = vi.fn();

vi.mock('keytar', () => ({
  default: {
    getPassword: getPasswordMock,
    setPassword: setPasswordMock,
    deletePassword: deletePasswordMock,
  },
}));

describe('GmailOAuthTokenStore', () => {
  beforeEach(() => {
    getPasswordMock.mockReset();
    setPasswordMock.mockReset();
    deletePasswordMock.mockReset();
  });

  it('stores and reads the Gmail refresh token from keychain only', async () => {
    getPasswordMock.mockResolvedValue(' refresh-token-1 ');
    const { GmailOAuthTokenStore } = await import('./gmail-oauth-token-store.js');
    const store = new GmailOAuthTokenStore();

    await store.setRefreshToken(' refresh-token-1 ');

    expect(setPasswordMock).toHaveBeenCalledWith(
      'taskplane',
      'external_access_gmail_refresh_token',
      'refresh-token-1',
    );
    await expect(store.getRefreshToken()).resolves.toBe('refresh-token-1');
    await expect(store.hasRefreshToken()).resolves.toBe(true);
  });

  it('treats blank or missing refresh tokens as absent', async () => {
    getPasswordMock.mockResolvedValue('   ');
    const { GmailOAuthTokenStore } = await import('./gmail-oauth-token-store.js');
    const store = new GmailOAuthTokenStore();

    await expect(store.getRefreshToken()).resolves.toBeNull();
    await expect(store.hasRefreshToken()).resolves.toBe(false);
    await expect(store.setRefreshToken('   ')).rejects.toThrow('cannot be empty');
    expect(setPasswordMock).not.toHaveBeenCalled();
  });

  it('deletes the stored Gmail refresh token from keychain', async () => {
    const { GmailOAuthTokenStore } = await import('./gmail-oauth-token-store.js');
    const store = new GmailOAuthTokenStore();

    await store.deleteRefreshToken();

    expect(deletePasswordMock).toHaveBeenCalledWith(
      'taskplane',
      'external_access_gmail_refresh_token',
    );
  });
});

