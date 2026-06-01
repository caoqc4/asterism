import fs from 'node:fs/promises';
import path from 'node:path';

import type { LocalContainerSandboxPatchDraft } from './local-container-sandbox-backend.js';

export type CollectSandboxedCodingStagedPatchDraftResult =
  | {
      patchDraft: LocalContainerSandboxPatchDraft;
      summary: string;
      valid: true;
    }
  | {
      blockedReasons: string[];
      summary: string;
      valid: false;
    };

export async function collectSandboxedCodingStagedPatchDraft(params: {
  maxDiffBytes?: number;
  stagingRoot: string;
  summary: string;
  workspaceRoot: string;
}): Promise<CollectSandboxedCodingStagedPatchDraftResult> {
  const workspaceRoot = path.resolve(params.workspaceRoot);
  const stagingRoot = path.resolve(params.stagingRoot);
  const maxDiffBytes = params.maxDiffBytes ?? 64_000;
  const summary = params.summary.trim();
  const blockedReasons: string[] = [];

  if (!summary) {
    blockedReasons.push('Sandboxed coding staged patch requires a summary.');
  }

  if (maxDiffBytes < 1_000 || maxDiffBytes > 1_000_000) {
    blockedReasons.push('Sandboxed coding staged patch requires a bounded diff limit.');
  }

  if (workspaceRoot === stagingRoot) {
    blockedReasons.push('Sandboxed coding staged patch requires staging outside the workspace root.');
  }

  if (isInsidePath(stagingRoot, workspaceRoot)) {
    blockedReasons.push('Sandboxed coding staged patch staging root must not be inside the workspace root.');
  }

  const stagedFiles = await listFiles(stagingRoot).catch(() => null);
  if (!stagedFiles) {
    blockedReasons.push('Sandboxed coding staged patch requires a readable staging root.');
  }

  if (blockedReasons.length > 0) {
    return invalidPatch(blockedReasons);
  }

  const changedFiles: string[] = [];
  const diffChunks: string[] = [];

  for (const file of stagedFiles ?? []) {
    const relativeFile = normalizeRelativePath(path.relative(stagingRoot, file));
    if (relativeFile === 'session.json') {
      continue;
    }

    if (!relativeFile || !isWorkspaceRelativeFile(relativeFile)) {
      blockedReasons.push('Sandboxed coding staged patch changed files must stay inside the workspace.');
      continue;
    }

    const workspaceFile = path.resolve(workspaceRoot, relativeFile);
    if (!isInsidePath(workspaceFile, workspaceRoot)) {
      blockedReasons.push('Sandboxed coding staged patch changed files must stay inside the workspace.');
      continue;
    }

    const stagedContent = await readUtf8Text(file);
    const workspaceContent = await readUtf8Text(workspaceFile, { missingAsEmpty: true });

    if (stagedContent === null || workspaceContent === null) {
      blockedReasons.push('Sandboxed coding staged patch supports text files only.');
      continue;
    }

    if (stagedContent === workspaceContent) {
      continue;
    }

    changedFiles.push(relativeFile);
    diffChunks.push(buildSimpleUnifiedDiff({
      newContent: stagedContent,
      oldContent: workspaceContent,
      relativeFile,
    }));
  }

  if (blockedReasons.length > 0) {
    return invalidPatch(blockedReasons);
  }

  const files = Array.from(new Set(changedFiles)).sort();
  if (!files.length) {
    return invalidPatch(['Sandboxed coding staged patch requires at least one changed file.']);
  }

  const diff = diffChunks.join('\n');
  if (!diff.trim()) {
    return invalidPatch(['Sandboxed coding staged patch requires a diff preview.']);
  }

  const boundedDiff = diff.length > maxDiffBytes
    ? `${diff.slice(0, maxDiffBytes)}\n[diff truncated at ${maxDiffBytes} bytes]`
    : diff;

  return {
    patchDraft: {
      diff: boundedDiff,
      files,
      riskSummary: 'Staged patch collected from sandbox output. Pending human review before workspace promotion.',
      summary,
    },
    summary: [
      'Sandboxed coding staged patch collected',
      `workspace=${workspaceRoot}`,
      `staging=${stagingRoot}`,
      `files=${files.length}`,
      diff.length > maxDiffBytes ? 'diff=truncated' : 'diff=complete',
    ].join(' / '),
    valid: true,
  };
}

function invalidPatch(blockedReasons: string[]): CollectSandboxedCodingStagedPatchDraftResult {
  return {
    blockedReasons,
    summary: `Sandboxed coding staged patch blocked: ${blockedReasons.join(' ')}`,
    valid: false,
  };
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const nextPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(nextPath));
    } else if (entry.isFile()) {
      files.push(nextPath);
    }
  }

  return files.sort();
}

async function readUtf8Text(
  file: string,
  options: { missingAsEmpty?: boolean } = {},
): Promise<string | null> {
  try {
    const content = await fs.readFile(file);
    if (content.includes(0)) {
      return null;
    }

    return content.toString('utf8');
  } catch (error) {
    if (options.missingAsEmpty && isNodeError(error) && error.code === 'ENOENT') {
      return '';
    }

    throw error;
  }
}

function buildSimpleUnifiedDiff(params: {
  newContent: string;
  oldContent: string;
  relativeFile: string;
}): string {
  const oldLines = splitLines(params.oldContent);
  const newLines = splitLines(params.newContent);

  return [
    params.oldContent ? `--- a/${params.relativeFile}` : '--- /dev/null',
    `+++ b/${params.relativeFile}`,
    '@@',
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join('\n');
}

function splitLines(content: string): string[] {
  const lines = content.replace(/\n$/, '').split('\n');
  return lines.length === 1 && lines[0] === '' ? [] : lines;
}

function normalizeRelativePath(file: string): string {
  return path.posix.normalize(file.replaceAll('\\', '/'));
}

function isWorkspaceRelativeFile(file: string): boolean {
  return Boolean(file)
    && !path.posix.isAbsolute(file)
    && !path.win32.isAbsolute(file)
    && file !== '.'
    && file !== '..'
    && !file.startsWith('../')
    && !file.includes('/../')
    && !file.endsWith('/..');
}

function isInsidePath(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
