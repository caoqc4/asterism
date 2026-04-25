import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectSandboxedCodingStagedPatchDraft } from './sandboxed-coding-staged-patch.js';

describe('collectSandboxedCodingStagedPatchDraft', () => {
  let tempRoot = '';
  let workspaceRoot = '';
  let stagingRoot = '';

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-staged-patch-'));
    workspaceRoot = path.join(tempRoot, 'workspace');
    stagingRoot = path.join(tempRoot, 'staging');
    await fs.mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
    await fs.mkdir(path.join(stagingRoot, 'src'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { force: true, recursive: true });
  });

  it('collects changed staged text files into a patch draft without mutating workspace files', async () => {
    const workspaceFile = path.join(workspaceRoot, 'src', 'notes.md');
    const stagedFile = path.join(stagingRoot, 'src', 'notes.md');
    await fs.writeFile(workspaceFile, 'old note\n', 'utf8');
    await fs.writeFile(stagedFile, 'new note\n', 'utf8');

    const result = await collectSandboxedCodingStagedPatchDraft({
      stagingRoot,
      summary: 'Update notes from sandbox producer',
      workspaceRoot,
    });

    expect(result.valid).toBe(true);

    if (result.valid) {
      expect(result.patchDraft.files).toEqual(['src/notes.md']);
      expect(result.patchDraft.diff).toContain('--- a/src/notes.md');
      expect(result.patchDraft.diff).toContain('+++ b/src/notes.md');
      expect(result.patchDraft.diff).toContain('-old note');
      expect(result.patchDraft.diff).toContain('+new note');
      expect(await fs.readFile(workspaceFile, 'utf8')).toBe('old note\n');
    }
  });

  it('collects newly staged files as additions', async () => {
    await fs.writeFile(path.join(stagingRoot, 'src', 'new.md'), 'new file\n', 'utf8');

    const result = await collectSandboxedCodingStagedPatchDraft({
      stagingRoot,
      summary: 'Add new notes',
      workspaceRoot,
    });

    expect(result.valid).toBe(true);

    if (result.valid) {
      expect(result.patchDraft.files).toEqual(['src/new.md']);
      expect(result.patchDraft.diff).toContain('--- /dev/null');
      expect(result.patchDraft.diff).toContain('+++ b/src/new.md');
    }
  });

  it('blocks empty staged output', async () => {
    const result = await collectSandboxedCodingStagedPatchDraft({
      stagingRoot,
      summary: 'No changes',
      workspaceRoot,
    });

    expect(result).toMatchObject({
      valid: false,
      blockedReasons: ['Sandboxed coding staged patch requires at least one changed file.'],
    });
  });

  it('blocks staging roots inside the workspace', async () => {
    const nestedStagingRoot = path.join(workspaceRoot, '.taskplane-staging');
    await fs.mkdir(nestedStagingRoot, { recursive: true });
    await fs.writeFile(path.join(nestedStagingRoot, 'notes.md'), 'new\n', 'utf8');

    const result = await collectSandboxedCodingStagedPatchDraft({
      stagingRoot: nestedStagingRoot,
      summary: 'Unsafe nested staging',
      workspaceRoot,
    });

    expect(result).toMatchObject({
      valid: false,
      blockedReasons: expect.arrayContaining([
        'Sandboxed coding staged patch staging root must not be inside the workspace root.',
      ]),
    });
  });

  it('truncates oversized diff previews', async () => {
    await fs.writeFile(path.join(stagingRoot, 'src', 'large.md'), `${'x'.repeat(2_000)}\n`, 'utf8');

    const result = await collectSandboxedCodingStagedPatchDraft({
      maxDiffBytes: 1_000,
      stagingRoot,
      summary: 'Large generated patch',
      workspaceRoot,
    });

    expect(result.valid).toBe(true);

    if (result.valid) {
      expect(result.patchDraft.diff).toContain('[diff truncated at 1000 bytes]');
      expect(result.summary).toContain('diff=truncated');
    }
  });
});
