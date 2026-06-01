import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  normalizeCodeAgentStagedFilePlanPayload,
  parseCodeAgentStagedFilePlanPayload,
  writeCodeAgentStagedFilePlan,
} from './code-agent-staged-file-plan.js';

describe('normalizeCodeAgentStagedFilePlanPayload', () => {
  it('accepts a bounded text-only staged file plan', () => {
    const result = normalizeCodeAgentStagedFilePlanPayload({
      files: [
        {
          content: 'hello\n',
          path: 'docs/notes.md',
        },
      ],
      observations: ['Read the task intent.'],
      summary: 'Update notes.',
    });

    expect(result.status).toBe('accepted');

    if (result.status === 'accepted') {
      expect(result.plan.files).toEqual([
        {
          content: 'hello\n',
          path: 'docs/notes.md',
        },
      ]);
      expect(result.summary).toContain('files=1');
    }
  });

  it('parses strict JSON payloads', () => {
    const result = parseCodeAgentStagedFilePlanPayload(JSON.stringify({
      files: [{ content: 'ok', path: 'src/a.ts' }],
      summary: 'Add fixture.',
    }));

    expect(result.status).toBe('accepted');
  });

  it('accepts a single fenced JSON object from providers that wrap raw JSON', () => {
    expect(parseCodeAgentStagedFilePlanPayload([
      '```json',
      JSON.stringify({
        files: [{ content: 'ok', path: 'docs/provider.md' }],
        summary: 'Provider wrapped JSON.',
      }),
      '```',
    ].join('\n'))).toMatchObject({
      status: 'accepted',
      plan: {
        files: [{ content: 'ok', path: 'docs/provider.md' }],
        summary: 'Provider wrapped JSON.',
      },
    });
  });

  it('blocks invalid JSON and non-object payloads', () => {
    expect(parseCodeAgentStagedFilePlanPayload('Here is JSON: {"files":[]}')).toMatchObject({
      status: 'blocked',
      blockedReasons: ['Code Agent staged file plan must be strict JSON.'],
    });
    expect(normalizeCodeAgentStagedFilePlanPayload(null)).toMatchObject({
      status: 'blocked',
      blockedReasons: ['Code Agent staged file plan must be an object.'],
    });
  });

  it('blocks path escapes, absolute paths, and sensitive files', () => {
    const result = normalizeCodeAgentStagedFilePlanPayload({
      files: [
        { content: 'escape', path: '../escape.md' },
        { content: 'absolute', path: '/tmp/escape.md' },
        { content: 'secret', path: '.env.local' },
        { content: 'git', path: '.git/config' },
        { content: 'deps', path: 'node_modules/pkg/index.js' },
        { content: 'manifest', path: 'session.json' },
      ],
      summary: 'Bad plan.',
    });

    expect(result.status).toBe('blocked');

    if (result.status === 'blocked') {
      expect(result.blockedReasons.join('\n')).toContain('../escape.md');
      expect(result.blockedReasons.join('\n')).toContain('/tmp/escape.md');
      expect(result.blockedReasons.join('\n')).toContain('.env.local');
      expect(result.blockedReasons.join('\n')).toContain('.git/config');
      expect(result.blockedReasons.join('\n')).toContain('node_modules/pkg/index.js');
      expect(result.blockedReasons.join('\n')).toContain('session.json');
    }
  });

  it('blocks duplicate, binary, and oversized file content', () => {
    const result = normalizeCodeAgentStagedFilePlanPayload(
      {
        files: [
          { content: 'first', path: 'docs/a.md' },
          { content: 'second', path: './docs/a.md' },
          { content: 'binary\0data', path: 'docs/b.md' },
          { content: 'x'.repeat(12), path: 'docs/c.md' },
        ],
        summary: 'Bad content.',
      },
      {
        maxFileBytes: 10,
        maxTotalBytes: 30,
      },
    );

    expect(result.status).toBe('blocked');

    if (result.status === 'blocked') {
      expect(result.blockedReasons).toEqual(expect.arrayContaining([
        'Code Agent staged file path is duplicated: docs/a.md.',
        'Code Agent staged file content must not contain binary data: docs/b.md.',
        'Code Agent staged file exceeds per-file size limit: docs/c.md.',
      ]));
    }
  });
});

describe('writeCodeAgentStagedFilePlan', () => {
  it('writes accepted staged files under the staging root', async () => {
    const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-code-agent-plan-'));
    const result = normalizeCodeAgentStagedFilePlanPayload({
      files: [{ content: 'hello\n', path: 'docs/notes.md' }],
      summary: 'Write notes.',
    });

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') {
      return;
    }

    const writeResult = await writeCodeAgentStagedFilePlan({
      plan: result.plan,
      stagingRoot,
    });

    await expect(fs.readFile(path.join(stagingRoot, 'docs/notes.md'), 'utf8')).resolves.toBe('hello\n');
    expect(writeResult).toEqual({
      files: ['docs/notes.md'],
      summary: 'Code Agent staged file plan wrote 1 file(s) to staging.',
    });
  });
});
