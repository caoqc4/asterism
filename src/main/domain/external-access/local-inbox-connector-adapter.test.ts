import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LocalInboxConnectorAdapter } from './local-inbox-connector-adapter.js';
import { ExternalAccessStatusService } from './external-access-status-service.js';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('LocalInboxConnectorAdapter', () => {
  it('reports a configured local inbox as a read-only connected connector', async () => {
    const inbox = await makeInbox();
    await fs.writeFile(path.join(inbox, 'customer-note.md'), '# 客户确认\n发布时间已确认。', 'utf8');

    const adapter = new LocalInboxConnectorAdapter(inbox);

    await expect(adapter.getStatus()).resolves.toMatchObject({
      id: 'local_inbox',
      label: 'Local Inbox',
      kind: 'other',
      status: 'connected',
      accountLabel: path.basename(inbox),
    });
  });

  it('normalizes markdown and json inbox files through the connector ingestion plan', async () => {
    const inbox = await makeInbox();
    await fs.writeFile(path.join(inbox, 'customer-note.md'), '# 客户确认\n发布时间已确认。', 'utf8');
    await fs.writeFile(path.join(inbox, 'signal.json'), JSON.stringify({
      externalId: 'signal_1',
      title: '客服系统提醒',
      kind: 'note',
      content: '客户问是否已经完成上线验收。',
      capturedAt: '2026-05-17T10:00:00.000Z',
      credibility: 'verified',
      isKey: true,
    }), 'utf8');

    const service = new ExternalAccessStatusService(undefined, [new LocalInboxConnectorAdapter(inbox)]);
    const plans = await service.planSourceIngestion({ taskId: 'task_1' });

    expect(plans.map((plan) => plan.trace.connectorId)).toEqual(['local_inbox', 'local_inbox']);
    expect(plans).toEqual(expect.arrayContaining([
      expect.objectContaining({
        decision: 'create',
        trace: expect.objectContaining({
          externalId: 'signal_1',
          originLabel: 'Local Inbox:signal_1',
        }),
        sourceContext: expect.objectContaining({
          taskId: 'task_1',
          title: '客服系统提醒',
          kind: 'note',
          credibility: 'verified',
          isKey: true,
          batchId: 'connector:local_inbox:signal_1',
        }),
      }),
      expect.objectContaining({
        sourceContext: expect.objectContaining({
          title: '客户确认',
          content: '# 客户确认\n发布时间已确认。',
          credibility: 'unknown',
          batchId: 'connector:local_inbox:customer-note.md',
        }),
      }),
    ]));
  });

  it('reports a missing local inbox directory as an error without throwing', async () => {
    const adapter = new LocalInboxConnectorAdapter(path.join(os.tmpdir(), 'taskplane-missing-local-inbox'));

    await expect(adapter.getStatus()).resolves.toMatchObject({
      id: 'local_inbox',
      status: 'error',
    });
    await expect(adapter.listEvidence({ taskId: 'task_1' })).resolves.toEqual([]);
  });

  it('keeps invalid json evidence as a low-credibility review item instead of failing the connector', async () => {
    const inbox = await makeInbox();
    await fs.writeFile(path.join(inbox, 'broken.json'), '{not json', 'utf8');

    const service = new ExternalAccessStatusService(undefined, [new LocalInboxConnectorAdapter(inbox)]);
    const plans = await service.planSourceIngestion({ taskId: 'task_1' });

    expect(plans).toEqual([
      expect.objectContaining({
        decision: 'review',
        sourceContext: expect.objectContaining({
          title: 'Invalid local inbox JSON: broken.json',
          credibility: 'low',
          batchId: 'connector:local_inbox:broken.json',
        }),
        quality: expect.objectContaining({
          decision: 'caution',
          reason: 'low_credibility',
        }),
      }),
    ]);
  });
});

async function makeInbox(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-local-inbox-'));
  tempRoots.push(root);
  return root;
}
