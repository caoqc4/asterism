import { describe, expect, it } from 'vitest';

import { ExternalAccessStatusService, readExternalAccessFixtureStatus } from './external-access-status-service.js';

describe('ExternalAccessStatusService', () => {
  it('returns an explicit empty status by default', async () => {
    const service = new ExternalAccessStatusService();

    await expect(service.getStatus()).resolves.toEqual({
      sources: [],
      connectedCount: 0,
      pendingCount: 0,
      errorCount: 0,
      updatedAt: null,
    });
  });

  it('returns a defensive copy of connector status records', async () => {
    const service = new ExternalAccessStatusService(() => ({
      sources: [{
        id: 'gmail',
        label: 'Gmail',
        kind: 'email',
        status: 'connected',
      }],
      connectedCount: 1,
      pendingCount: 0,
      errorCount: 0,
      updatedAt: '2026-05-17T09:00:00.000Z',
    }));

    const status = await service.getStatus();
    status.sources[0].label = 'Changed locally';

    await expect(service.getStatus()).resolves.toMatchObject({
      sources: [{ label: 'Gmail' }],
    });
  });

  it('aggregates read-only connector adapter status records', async () => {
    const service = new ExternalAccessStatusService(
      () => ({
        sources: [{
          id: 'manual',
          label: 'Manual Import',
          kind: 'other',
          status: 'pending',
        }],
        connectedCount: 0,
        pendingCount: 1,
        errorCount: 0,
        updatedAt: '2026-05-17T08:00:00.000Z',
      }),
      [{
        getStatus: () => ({
          id: 'gmail',
          label: 'Gmail',
          kind: 'email',
          accountLabel: 'user@example.com',
          status: 'connected',
          lastSyncAt: '2026-05-17T09:00:00.000Z',
        }),
      }],
    );

    await expect(service.getStatus()).resolves.toMatchObject({
      connectedCount: 1,
      pendingCount: 1,
      errorCount: 0,
      sources: [
        { id: 'manual', status: 'pending' },
        { id: 'gmail', status: 'connected' },
      ],
    });
  });

  it('plans connected adapter evidence through ConnectorSourceIngestionPlan', async () => {
    const service = new ExternalAccessStatusService(
      undefined,
      [
        {
          getStatus: () => ({
            id: 'gmail',
            label: 'Gmail',
            kind: 'email',
            status: 'connected',
          }),
          listEvidence: () => [{
            externalId: 'message_1',
            title: '客户确认邮件',
            kind: 'doc',
            uri: 'gmail://message/message_1',
            capturedAt: '2026-05-17T09:00:00.000Z',
            credibility: 'verified',
            note: '客户确认了发布时间。',
          }],
        },
        {
          getStatus: () => ({
            id: 'slack',
            label: 'Slack',
            kind: 'slack',
            status: 'pending',
          }),
          listEvidence: () => [{
            title: 'Pending connector evidence should not be planned',
            capturedAt: '2026-05-17T09:00:00.000Z',
          }],
        },
      ],
    );

    await expect(service.planSourceIngestion({ taskId: 'task_1' })).resolves.toMatchObject([
      {
        decision: 'create',
        trace: {
          connectorId: 'gmail',
          connectorName: 'Gmail',
          externalId: 'message_1',
        },
        sourceContext: {
          taskId: 'task_1',
          title: '客户确认邮件',
          batchId: 'connector:gmail:message_1',
          sourceRole: 'raw',
        },
      },
    ]);
  });

  it('reads a local fixture connector status without calling external providers', () => {
    const status = readExternalAccessFixtureStatus(JSON.stringify({
      updatedAt: '2026-05-17T10:00:00.000Z',
      sources: [{
        id: 'gmail_fixture',
        label: 'Gmail',
        kind: 'email',
        accountLabel: 'user@example.com',
        status: 'connected',
        lastSyncAt: '2026-05-17T09:30:00.000Z',
      }],
    }));

    expect(status).toMatchObject({
      connectedCount: 1,
      pendingCount: 0,
      errorCount: 0,
      updatedAt: '2026-05-17T10:00:00.000Z',
      sources: [{
        id: 'gmail_fixture',
        label: 'Gmail',
        kind: 'email',
        accountLabel: 'user@example.com',
        status: 'connected',
      }],
    });
  });

  it('reports invalid local fixture configuration as connector error state', () => {
    expect(readExternalAccessFixtureStatus('{not json')).toMatchObject({
      connectedCount: 0,
      pendingCount: 0,
      errorCount: 1,
      sources: [{
        id: 'external_access_fixture',
        status: 'error',
      }],
    });
  });
});
