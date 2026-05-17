import { describe, expect, it, vi } from 'vitest';

import { planConnectorSourceIngestion } from '../../../shared/connector-source-ingestion.js';
import type { SourceContextRecord } from '../../../shared/types/source-context.js';
import { ExternalAccessSourceIngestionService } from './external-access-source-ingestion-service.js';

function sourceRecord(overrides: Partial<SourceContextRecord>): SourceContextRecord {
  return {
    id: 'source_1',
    taskId: 'task_1',
    title: '客户确认邮件',
    kind: 'doc',
    isKey: false,
    uri: 'gmail://message/message_1',
    content: null,
    note: null,
    status: 'active',
    capturedAt: '2026-05-17T09:00:00.000Z',
    runId: null,
    batchId: 'connector:gmail:message_1',
    sourceRole: 'raw',
    credibility: 'verified',
    isDuplicate: false,
    containsSensitiveData: false,
    createdAt: '2026-05-17T09:01:00.000Z',
    updatedAt: '2026-05-17T09:01:00.000Z',
    archivedAt: null,
    ...overrides,
  };
}

describe('ExternalAccessSourceIngestionService', () => {
  it('previews connector source plans without writing task memory', async () => {
    const plan = planConnectorSourceIngestion({
      taskId: 'task_1',
      connectorId: 'gmail',
      connectorName: 'Gmail',
      externalId: 'message_1',
      title: '客户确认邮件',
      kind: 'doc',
      uri: 'gmail://message/message_1',
      capturedAt: '2026-05-17T09:00:00.000Z',
      credibility: 'verified',
    });
    const writer = { createSourceContext: vi.fn() };
    const service = new ExternalAccessSourceIngestionService({
      planSourceIngestion: vi.fn().mockResolvedValue([plan]),
    }, writer);

    await expect(service.preview({ taskId: ' task_1 ' })).resolves.toMatchObject({
      taskId: 'task_1',
      createCount: 1,
      reviewCount: 0,
      skipCount: 0,
      plans: [{ planId: 'connector:gmail:message_1' }],
    });
    expect(writer.createSourceContext).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation before creating source contexts', async () => {
    const plan = planConnectorSourceIngestion({
      taskId: 'task_1',
      connectorId: 'gmail',
      connectorName: 'Gmail',
      externalId: 'message_1',
      title: '客户确认邮件',
      uri: 'gmail://message/message_1',
      capturedAt: '2026-05-17T09:00:00.000Z',
    });
    const writer = { createSourceContext: vi.fn() };
    const service = new ExternalAccessSourceIngestionService({
      planSourceIngestion: vi.fn().mockResolvedValue([plan]),
    }, writer);

    await expect(service.commit({
      taskId: 'task_1',
      planIds: [plan.planId],
      confirmed: false,
    })).rejects.toThrow('explicit confirmation');
    expect(writer.createSourceContext).not.toHaveBeenCalled();
  });

  it('commits selected create and review plans through the task source-context writer', async () => {
    const createPlan = planConnectorSourceIngestion({
      taskId: 'task_1',
      connectorId: 'gmail',
      connectorName: 'Gmail',
      externalId: 'message_1',
      title: '客户确认邮件',
      uri: 'gmail://message/message_1',
      capturedAt: '2026-05-17T09:00:00.000Z',
      credibility: 'verified',
    });
    const reviewPlan = planConnectorSourceIngestion({
      taskId: 'task_1',
      connectorId: 'slack',
      connectorName: 'Slack',
      externalId: 'message_2',
      title: '包含凭证的消息',
      uri: 'slack://message/message_2',
      content: 'token=secret',
      capturedAt: '2026-05-17T09:05:00.000Z',
    });
    const writer = {
      createSourceContext: vi.fn()
        .mockResolvedValueOnce(sourceRecord({ id: 'source_1', batchId: createPlan.sourceContext.batchId }))
        .mockResolvedValueOnce(sourceRecord({
          id: 'source_2',
          title: '包含凭证的消息',
          batchId: reviewPlan.sourceContext.batchId,
          containsSensitiveData: true,
        })),
    };
    const service = new ExternalAccessSourceIngestionService({
      planSourceIngestion: vi.fn().mockResolvedValue([createPlan, reviewPlan]),
    }, writer);

    await expect(service.commit({
      taskId: 'task_1',
      planIds: [createPlan.planId, reviewPlan.planId],
      confirmed: true,
    })).resolves.toMatchObject({
      taskId: 'task_1',
      created: [
        { id: 'source_1' },
        { id: 'source_2', containsSensitiveData: true },
      ],
      skippedPlanIds: [],
    });
    expect(writer.createSourceContext).toHaveBeenNthCalledWith(1, createPlan.sourceContext);
    expect(writer.createSourceContext).toHaveBeenNthCalledWith(2, reviewPlan.sourceContext);
  });

  it('never writes connector plans that quality evaluation marked as skip', async () => {
    const skipPlan = planConnectorSourceIngestion({
      taskId: 'task_1',
      connectorId: 'gmail',
      connectorName: 'Gmail',
      externalId: 'message_1',
      title: '重复邮件',
      uri: 'gmail://message/message_1',
      capturedAt: '2026-05-17T09:00:00.000Z',
      isDuplicate: true,
    });
    const writer = { createSourceContext: vi.fn() };
    const service = new ExternalAccessSourceIngestionService({
      planSourceIngestion: vi.fn().mockResolvedValue([skipPlan]),
    }, writer);

    await expect(service.commit({
      taskId: 'task_1',
      planIds: [skipPlan.planId],
      confirmed: true,
    })).resolves.toMatchObject({
      created: [],
      skippedPlanIds: [skipPlan.planId],
    });
    expect(writer.createSourceContext).not.toHaveBeenCalled();
  });
});
