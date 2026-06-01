import { describe, expect, it } from 'vitest';

import { planConnectorSourceIngestion } from './connector-source-ingestion.js';

describe('connector source ingestion', () => {
  it('normalizes connector evidence into source-context input with trace metadata', () => {
    const plan = planConnectorSourceIngestion({
      taskId: 'task_1',
      connectorId: 'gmail',
      connectorName: 'Gmail',
      externalId: 'message_1',
      title: '客户确认邮件',
      kind: 'doc',
      uri: 'gmail://message/message_1',
      note: '客户确认了发布时间。',
      capturedAt: '2026-05-17T09:00:00.000Z',
      credibility: 'verified',
      isKey: true,
    });

    expect(plan).toMatchObject({
      planId: 'connector:gmail:message_1',
      decision: 'create',
      trace: {
        connectorId: 'gmail',
        connectorName: 'Gmail',
        externalId: 'message_1',
        originLabel: 'Gmail:message_1',
      },
      sourceContext: {
        taskId: 'task_1',
        title: '客户确认邮件',
        sourceRole: 'raw',
        credibility: 'verified',
        isDuplicate: false,
        containsSensitiveData: false,
        batchId: 'connector:gmail:message_1',
      },
      quality: {
        decision: 'include',
      },
    });
    expect(plan.sourceContext.note).toContain('Connector source: Gmail:message_1');
  });

  it('requires review before ingesting sensitive connector evidence', () => {
    const plan = planConnectorSourceIngestion({
      taskId: 'task_1',
      connectorId: 'slack',
      connectorName: 'Slack',
      title: '部署频道消息',
      content: 'API_KEY=secret-value',
      uri: 'slack://channel/message',
      capturedAt: '2026-05-17T09:00:00.000Z',
    });

    expect(plan).toMatchObject({
      decision: 'review',
      quality: {
        decision: 'caution',
        reason: 'sensitive',
        sensitive: true,
      },
    });
    expect(plan.reviewReason).toContain('可能包含敏感信息');
  });

  it('skips duplicate connector evidence instead of creating repeated context', () => {
    const plan = planConnectorSourceIngestion({
      taskId: 'task_1',
      connectorId: 'calendar',
      connectorName: 'Calendar',
      externalId: 'event_1',
      title: '例会纪要',
      uri: 'calendar://event/event_1',
      capturedAt: '2026-05-17T09:00:00.000Z',
      isDuplicate: true,
    });

    expect(plan).toMatchObject({
      decision: 'skip',
      quality: {
        decision: 'exclude',
        reason: 'duplicate',
        duplicate: true,
      },
    });
  });

  it('rejects connector evidence without a stable connector identity', () => {
    expect(() => planConnectorSourceIngestion({
      taskId: 'task_1',
      connectorId: ' ',
      connectorName: 'Gmail',
      title: '消息',
    })).toThrow('connectorId');

    expect(() => planConnectorSourceIngestion({
      taskId: 'task_1',
      connectorId: 'gmail',
      connectorName: ' ',
      title: '消息',
    })).toThrow('connectorName');

    expect(() => planConnectorSourceIngestion({
      taskId: 'task_1',
      connectorId: 'gmail',
      connectorName: 'Gmail',
      title: '消息',
    })).toThrow('capturedAt');
  });
});
