import { describe, expect, it } from 'vitest';

import { ExternalAccessStatusService } from './external-access-status-service.js';

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
});
