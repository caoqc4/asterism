import { describe, expect, it } from 'vitest';

import {
  buildExternalAccessStatus,
  emptyExternalAccessStatus,
  externalAccessStatusForCapability,
} from './external-access-status.js';

describe('external access status', () => {
  it('summarizes connector records for capability surfaces', () => {
    const status = buildExternalAccessStatus([
      {
        id: 'gmail',
        label: 'Gmail',
        kind: 'email',
        accountLabel: 'user@example.com',
        status: 'connected',
        lastSyncAt: '2026-05-17T08:00:00.000Z',
      },
      {
        id: 'calendar',
        label: 'Calendar',
        kind: 'calendar',
        status: 'pending',
      },
      {
        id: 'slack',
        label: 'Slack',
        kind: 'slack',
        status: 'error',
        errorReason: 'authorization expired',
      },
    ], '2026-05-17T09:00:00.000Z');

    expect(status).toMatchObject({
      connectedCount: 1,
      pendingCount: 1,
      errorCount: 1,
      updatedAt: '2026-05-17T09:00:00.000Z',
    });
    expect(externalAccessStatusForCapability(status)).toEqual({
      connectedCount: 1,
      pendingCount: 1,
      errorCount: 1,
    });
  });

  it('keeps the empty status explicit instead of using missing capability state', () => {
    expect(externalAccessStatusForCapability(emptyExternalAccessStatus())).toEqual({
      connectedCount: 0,
      pendingCount: 0,
      errorCount: 0,
    });
  });
});
