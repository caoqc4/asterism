import { describe, expect, it } from 'vitest';

import {
  normalizeCreateSourceContextMemoryMetadata,
  normalizeUpdateSourceContextMemoryMetadata,
} from './source-context-memory-metadata.js';
import type { SourceContextRecord } from './types/source-context.js';

describe('source context memory metadata', () => {
  it('fills known quality metadata when creating source contexts', () => {
    expect(normalizeCreateSourceContextMemoryMetadata({
      taskId: 'task_1',
      title: 'PRD',
      kind: 'doc',
      uri: 'https://example.com/prd',
      note: 'Primary product source',
    })).toMatchObject({
      sourceRole: 'raw',
      credibility: 'unknown',
      containsSensitiveData: false,
    });

    expect(normalizeCreateSourceContextMemoryMetadata({
      taskId: 'task_1',
      title: 'Agent handbook',
      kind: 'doc',
      sourceRole: 'stable_reference',
    })).toMatchObject({
      sourceRole: 'stable_reference',
      credibility: 'verified',
    });
  });

  it('keeps generated task records in digest role without treating them as raw source evidence', () => {
    expect(normalizeCreateSourceContextMemoryMetadata({
      taskId: 'task_1',
      title: '阶段收尾记录',
      kind: 'note',
      note: '任务记录：阶段收尾、质量检查和执行交接。',
    })).toMatchObject({
      sourceRole: 'digest',
      credibility: 'unknown',
    });
  });

  it('detects sensitive source content when no explicit flag is provided', () => {
    expect(normalizeCreateSourceContextMemoryMetadata({
      taskId: 'task_1',
      title: '部署记录',
      kind: 'note',
      content: 'token=secret-value',
      uri: 'https://example.com/deploy',
    })).toMatchObject({
      containsSensitiveData: true,
    });
  });

  it('normalizes quality metadata on updates without losing existing flags', () => {
    const current = buildSourceContext({
      sourceRole: 'raw',
      credibility: null,
      containsSensitiveData: true,
    });

    expect(normalizeUpdateSourceContextMemoryMetadata(current, {
      id: 'source_1',
      content: 'Updated public content',
    })).toMatchObject({
      id: 'source_1',
      sourceRole: 'raw',
      credibility: 'unknown',
      isDuplicate: false,
      containsSensitiveData: true,
    });

    expect(normalizeUpdateSourceContextMemoryMetadata(current, {
      id: 'source_1',
      containsSensitiveData: false,
      credibility: 'verified',
    })).toMatchObject({
      credibility: 'verified',
      containsSensitiveData: false,
    });
  });
});

function buildSourceContext(partial: Partial<SourceContextRecord> = {}): SourceContextRecord {
  return {
    id: 'source_1',
    taskId: 'task_1',
    title: 'Source',
    kind: 'doc',
    isKey: false,
    uri: 'https://example.com/source',
    content: null,
    note: null,
    status: 'active',
    capturedAt: '2026-05-13T00:00:00.000Z',
    runId: null,
    batchId: null,
    sourceRole: 'raw',
    credibility: 'unknown',
    isDuplicate: false,
    containsSensitiveData: false,
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
    archivedAt: null,
    ...partial,
  };
}
