import { describe, expect, it } from 'vitest';

import type { SourceContextRecord } from '../../../shared/types/source-context.js';
import {
  collectCodeAgentSourceContext,
  formatCodeAgentSourceContextForPrompt,
} from './code-agent-source-context.js';

function buildSourceContext(overrides: Partial<SourceContextRecord> = {}): SourceContextRecord {
  return {
    archivedAt: null,
    content: 'Use the existing task detail pattern.',
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'source_context_1',
    isKey: false,
    kind: 'note',
    note: 'Local operator note',
    status: 'active',
    taskId: 'task_1',
    title: 'Implementation note',
    updatedAt: '2026-01-01T00:00:00.000Z',
    uri: null,
    ...overrides,
  };
}

describe('collectCodeAgentSourceContext', () => {
  it('keeps source-context content empty unless explicit content opt-in is set', () => {
    const result = collectCodeAgentSourceContext({
      includeContent: false,
      sourceContexts: [buildSourceContext()],
    });

    expect(result).toMatchObject({
      status: 'collected',
      summary: 'Code Agent source context content collected / items=0 / bytes=0',
    });
    if (result.status === 'collected') {
      expect(formatCodeAgentSourceContextForPrompt(result.snapshot)).toEqual([
        'Taskplane source context:',
        'No source-context content was included for this run.',
      ]);
    }
  });

  it('renders only the stored local source-context snapshot as read-only prompt evidence', () => {
    const result = collectCodeAgentSourceContext({
      includeContent: true,
      sourceContexts: [
        buildSourceContext({
          content: 'Keep provider-visible context bounded.',
          kind: 'doc',
          uri: 'https://example.test/spec',
        }),
      ],
    });

    expect(result).toMatchObject({
      status: 'collected',
      summary: expect.stringContaining('items=1'),
    });
    if (result.status === 'collected') {
      const promptLines = formatCodeAgentSourceContextForPrompt(result.snapshot);

      expect(promptLines.join('\n')).toContain('--- source context: Implementation note (source_context_1)');
      expect(promptLines.join('\n')).toContain('uri: https://example.test/spec');
      expect(promptLines.join('\n')).toContain('content:\nKeep provider-visible context bounded.');
    }
  });

  it('blocks selected source-context content that exceeds size limits', () => {
    const result = collectCodeAgentSourceContext({
      includeContent: true,
      maxItemBytes: 20,
      sourceContexts: [buildSourceContext()],
    });

    expect(result).toEqual({
      blockedReasons: ['Code Agent source context content exceeds per-item size limit: source_context_1.'],
      status: 'blocked',
      summary: 'Code Agent source context content blocked: Code Agent source context content exceeds per-item size limit: source_context_1.',
    });
  });
});
