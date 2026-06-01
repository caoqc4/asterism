import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectCodeAgentWorkspaceContext,
  formatCodeAgentWorkspaceContextForPrompt,
} from './code-agent-workspace-context.js';

describe('collectCodeAgentWorkspaceContext', () => {
  it('collects bounded explicitly selected workspace text files', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-code-agent-context-'));
    await fs.mkdir(path.join(workspaceRoot, 'docs'), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, 'docs/notes.md'), 'alpha\n', 'utf8');

    const result = await collectCodeAgentWorkspaceContext({
      files: ['docs/notes.md', './docs/notes.md'],
      workspaceRoot,
    });

    expect(result.status).toBe('collected');

    if (result.status === 'collected') {
      expect(result.snapshot.files).toEqual([
        {
          content: 'alpha\n',
          path: 'docs/notes.md',
        },
      ]);
      expect(result.summary).toContain('files=1');
    }
  });

  it('returns an empty context when no files are selected', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-code-agent-context-'));
    const result = await collectCodeAgentWorkspaceContext({
      files: [],
      workspaceRoot,
    });

    expect(result).toMatchObject({
      status: 'collected',
      summary: 'Code Agent workspace context collected / files=0',
    });
  });

  it('blocks path escapes, sensitive paths, missing files, binary content, and oversized files', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-code-agent-context-'));
    await fs.writeFile(path.join(workspaceRoot, 'binary.txt'), Buffer.from([1, 0, 2]));
    await fs.writeFile(path.join(workspaceRoot, 'large.txt'), 'x'.repeat(12), 'utf8');

    const result = await collectCodeAgentWorkspaceContext({
      files: [
        '../escape.md',
        '.env.local',
        '.git/config',
        'node_modules/pkg/index.js',
        'missing.md',
        'binary.txt',
        'large.txt',
      ],
      maxFileBytes: 10,
      maxFiles: 8,
      workspaceRoot,
    });

    expect(result.status).toBe('blocked');

    if (result.status === 'blocked') {
      const reasons = result.blockedReasons.join('\n');
      expect(reasons).toContain('../escape.md');
      expect(reasons).toContain('.env.local');
      expect(reasons).toContain('.git/config');
      expect(reasons).toContain('node_modules/pkg/index.js');
      expect(reasons).toContain('missing.md');
      expect(reasons).toContain('binary.txt');
      expect(reasons).toContain('large.txt');
    }
  });
});

describe('formatCodeAgentWorkspaceContextForPrompt', () => {
  it('formats selected context files as bounded prompt evidence', () => {
    expect(formatCodeAgentWorkspaceContextForPrompt({
      files: [
        {
          content: 'alpha\n',
          path: 'docs/notes.md',
        },
      ],
      summary: 'Code Agent workspace context collected 1 file(s).',
    }).join('\n')).toContain('--- file: docs/notes.md\nalpha\n\n--- end file: docs/notes.md');
  });

  it('formats empty context explicitly', () => {
    expect(formatCodeAgentWorkspaceContextForPrompt(null)).toEqual([
      'Workspace context:',
      'No workspace file context was provided for this run.',
    ]);
  });
});
