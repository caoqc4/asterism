import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPasswordMock = vi.fn();

vi.mock('keytar', () => ({
  default: {
    getPassword: getPasswordMock,
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
  },
}));

describe('createExternalAccessStatusService Gmail OAuth wiring', () => {
  beforeEach(() => {
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCESS_TOKEN;
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_ID;
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_SECRET;
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCOUNT;
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_QUERY;
    getPasswordMock.mockReset();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCESS_TOKEN;
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_ID;
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_SECRET;
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCOUNT;
    delete process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_QUERY;
    vi.unstubAllGlobals();
  });

  it('projects OAuth-backed Gmail status from keychain without probing Gmail or refreshing tokens', async () => {
    process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_ID = 'client-id-1';
    process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCOUNT = 'user@example.com';
    getPasswordMock.mockResolvedValue('refresh-token-secret');
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);
    const { createExternalAccessStatusService } = await import('./external-access-status-service.js');

    const status = await createExternalAccessStatusService().getStatus();

    expect(status).toMatchObject({
      connectedCount: 1,
      pendingCount: 0,
      sources: [{
        id: 'gmail',
        kind: 'email',
        status: 'connected',
        accountLabel: 'user@example.com',
      }],
    });
    expect(getPasswordMock).toHaveBeenCalledWith('taskplane', 'external_access_gmail_refresh_token');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refreshes OAuth tokens only during task-bound Gmail evidence planning', async () => {
    process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_OAUTH_CLIENT_ID = 'client-id-1';
    process.env.TASKPLANE_EXTERNAL_ACCESS_GMAIL_QUERY = 'newer_than:1d';
    getPasswordMock.mockResolvedValue('refresh-token-secret');
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'short-lived-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }))
      .mockResolvedValueOnce(jsonResponse({
        messages: [{ id: 'message_1', threadId: 'thread_1' }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'message_1',
        snippet: 'OAuth-backed source candidate',
        payload: {
          headers: [
            { name: 'Subject', value: 'OAuth source candidate' },
            { name: 'From', value: 'sender@example.com' },
            { name: 'Date', value: 'Sun, 17 May 2026 10:30:00 +0800' },
          ],
        },
      }));
    vi.stubGlobal('fetch', fetchImpl);
    const { createExternalAccessStatusService } = await import('./external-access-status-service.js');

    const plans = await createExternalAccessStatusService().planSourceIngestion({ taskId: 'task_1' });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
    expect(String(fetchImpl.mock.calls[0][1].body)).toContain('refresh_token=refresh-token-secret');
    expect(String(fetchImpl.mock.calls[1][0])).toContain('/users/me/messages');
    expect(fetchImpl.mock.calls[1][1].headers).toMatchObject({
      Authorization: 'Bearer short-lived-token',
    });
    expect(plans[0]).toMatchObject({
      decision: 'review',
      sourceContext: {
        taskId: 'task_1',
        title: 'OAuth source candidate',
        containsSensitiveData: true,
      },
    });
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

