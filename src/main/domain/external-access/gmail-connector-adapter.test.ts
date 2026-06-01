import { describe, expect, it, vi } from 'vitest';

import { ExternalAccessStatusService } from './external-access-status-service.js';
import { GmailConnectorAdapter } from './gmail-connector-adapter.js';

describe('GmailConnectorAdapter', () => {
  it('reports configured Gmail as a read-only email connector without probing the network', async () => {
    const fetchImpl = vi.fn();
    const adapter = new GmailConnectorAdapter({
      accessToken: 'token_1',
      accountLabel: 'user@example.com',
      fetchImpl: fetchImpl as never,
    });

    await expect(adapter.getStatus()).resolves.toMatchObject({
      id: 'gmail',
      label: 'Gmail',
      kind: 'email',
      accountLabel: 'user@example.com',
      status: 'connected',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports pending Gmail when no access token is configured', async () => {
    const adapter = new GmailConnectorAdapter({ accessToken: null });

    await expect(adapter.getStatus()).resolves.toMatchObject({
      id: 'gmail',
      kind: 'email',
      status: 'pending',
      errorReason: 'Gmail OAuth access token is not configured.',
    });
    await expect(adapter.listEvidence()).resolves.toEqual([]);
  });

  it('reports OAuth-backed Gmail as configured without refreshing during status reads', async () => {
    const accessTokenProvider = vi.fn().mockResolvedValue('short-lived-token');
    const adapter = new GmailConnectorAdapter({
      accessToken: null,
      accountLabel: 'user@example.com',
      accessTokenProvider,
      credentialConfigured: true,
    });

    await expect(adapter.getStatus()).resolves.toMatchObject({
      id: 'gmail',
      kind: 'email',
      accountLabel: 'user@example.com',
      status: 'connected',
    });
    expect(accessTokenProvider).not.toHaveBeenCalled();
  });

  it('normalizes Gmail metadata and snippets through the connector ingestion plan', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        messages: [{ id: 'message_1', threadId: 'thread_1' }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'message_1',
        threadId: 'thread_1',
        snippet: 'Can you confirm the launch checklist today?',
        payload: {
          headers: [
            { name: 'Subject', value: 'Launch checklist confirmation' },
            { name: 'From', value: 'customer@example.com' },
            { name: 'To', value: 'me@example.com' },
            { name: 'Date', value: 'Sun, 17 May 2026 09:30:00 +0800' },
          ],
        },
      }));
    const service = new ExternalAccessStatusService(undefined, [
      new GmailConnectorAdapter({
        accessToken: 'token_1',
        accountLabel: 'me@example.com',
        query: 'newer_than:1d',
        maxResults: 1,
        apiBaseUrl: 'https://gmail.test/gmail/v1',
        fetchImpl: fetchImpl as never,
      }),
    ]);

    const plans = await service.planSourceIngestion({ taskId: 'task_1' });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/users/me/messages');
    expect(String(fetchImpl.mock.calls[0][0])).toContain('maxResults=1');
    expect(String(fetchImpl.mock.calls[0][0])).toContain('newer_than%3A1d');
    expect(String(fetchImpl.mock.calls[1][0])).toContain('/users/me/messages/message_1');
    expect(plans).toEqual([
      expect.objectContaining({
        decision: 'review',
        trace: expect.objectContaining({
          connectorId: 'gmail',
          connectorName: 'Gmail',
          externalId: 'message_1',
          originLabel: 'Gmail:message_1',
        }),
        sourceContext: expect.objectContaining({
          taskId: 'task_1',
          title: 'Launch checklist confirmation',
          kind: 'note',
          uri: 'gmail://message/message_1',
          sourceRole: 'raw',
          credibility: 'verified',
          containsSensitiveData: true,
          batchId: 'connector:gmail:message_1',
        }),
        quality: expect.objectContaining({
          decision: 'caution',
          reason: 'sensitive',
        }),
      }),
    ]);
    expect(plans[0].sourceContext.content).toContain('From: customer@example.com');
    expect(plans[0].sourceContext.content).toContain('Snippet: Can you confirm');
  });

  it('refreshes an OAuth-backed access token only during task-bound evidence listing', async () => {
    const accessTokenProvider = vi.fn().mockResolvedValue('short-lived-token');
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        messages: [{ id: 'message_2', threadId: 'thread_2' }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'message_2',
        snippet: 'Please review the invoice decision.',
        payload: {
          headers: [
            { name: 'Subject', value: 'Invoice decision' },
            { name: 'From', value: 'finance@example.com' },
            { name: 'Date', value: 'Sun, 17 May 2026 10:30:00 +0800' },
          ],
        },
      }));
    const service = new ExternalAccessStatusService(undefined, [
      new GmailConnectorAdapter({
        accessToken: null,
        accessTokenProvider,
        credentialConfigured: true,
        maxResults: 1,
        apiBaseUrl: 'https://gmail.test/gmail/v1',
        fetchImpl: fetchImpl as never,
      }),
    ]);

    const plans = await service.planSourceIngestion({ taskId: 'task_2' });

    expect(accessTokenProvider).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer short-lived-token',
    });
    expect(plans[0].sourceContext).toMatchObject({
      taskId: 'task_2',
      title: 'Invoice decision',
      uri: 'gmail://message/message_2',
    });
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
