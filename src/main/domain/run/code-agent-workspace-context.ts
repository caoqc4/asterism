import fs from 'node:fs/promises';
import path from 'node:path';

export type CodeAgentWorkspaceContextFile = {
  content: string;
  path: string;
};

export type CodeAgentWorkspaceContextSnapshot = {
  files: CodeAgentWorkspaceContextFile[];
  summary: string;
};

export type CollectCodeAgentWorkspaceContextResult =
  | {
      snapshot: CodeAgentWorkspaceContextSnapshot;
      status: 'collected';
      summary: string;
    }
  | {
      blockedReasons: string[];
      status: 'blocked';
      summary: string;
    };

const DEFAULT_MAX_FILES = 6;
const DEFAULT_MAX_FILE_BYTES = 12_000;
const DEFAULT_MAX_TOTAL_BYTES = 30_000;
const FORBIDDEN_PATH_SEGMENTS = new Set(['.git', 'node_modules']);
const FORBIDDEN_BASENAMES = new Set(['.env', '.env.local', '.npmrc', '.netrc']);

export async function collectCodeAgentWorkspaceContext(params: {
  files: string[];
  maxFileBytes?: number;
  maxFiles?: number;
  maxTotalBytes?: number;
  workspaceRoot: string;
}): Promise<CollectCodeAgentWorkspaceContextResult> {
  const maxFiles = params.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFileBytes = params.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxTotalBytes = params.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const workspaceRoot = path.resolve(params.workspaceRoot);
  const requestedFiles = Array.from(new Set(params.files
    .map((file) => normalizeRelativePath(file))
    .filter(Boolean)));
  const blockedReasons: string[] = [];

  if (!params.workspaceRoot.trim()) {
    blockedReasons.push('Code Agent workspace context requires a workspace root.');
  }

  if (requestedFiles.length > maxFiles) {
    blockedReasons.push('Code Agent workspace context requested too many files.');
  }

  const files: CodeAgentWorkspaceContextFile[] = [];
  let totalBytes = 0;

  for (const file of requestedFiles.slice(0, maxFiles)) {
    if (!isAllowedWorkspaceContextPath(file)) {
      blockedReasons.push(`Code Agent workspace context path is not allowed: ${file}.`);
      continue;
    }

    const target = path.resolve(workspaceRoot, file);
    if (!isInsidePath(target, workspaceRoot)) {
      blockedReasons.push(`Code Agent workspace context path escaped workspace root: ${file}.`);
      continue;
    }

    let content: Buffer;
    try {
      content = await fs.readFile(target);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        blockedReasons.push(`Code Agent workspace context file does not exist: ${file}.`);
        continue;
      }

      throw error;
    }

    if (content.includes(0)) {
      blockedReasons.push(`Code Agent workspace context supports text files only: ${file}.`);
      continue;
    }

    if (content.byteLength > maxFileBytes) {
      blockedReasons.push(`Code Agent workspace context file exceeds per-file size limit: ${file}.`);
      continue;
    }

    totalBytes += content.byteLength;
    files.push({
      content: content.toString('utf8'),
      path: file,
    });
  }

  if (totalBytes > maxTotalBytes) {
    blockedReasons.push('Code Agent workspace context exceeds total size limit.');
  }

  if (blockedReasons.length > 0) {
    return blockedContext(blockedReasons);
  }

  return {
    snapshot: {
      files,
      summary: files.length
        ? `Code Agent workspace context collected ${files.length} file(s).`
        : 'Code Agent workspace context empty.',
    },
    status: 'collected',
    summary: files.length
      ? `Code Agent workspace context collected / files=${files.length} / bytes=${totalBytes}`
      : 'Code Agent workspace context collected / files=0',
  };
}

export function formatCodeAgentWorkspaceContextForPrompt(
  snapshot: CodeAgentWorkspaceContextSnapshot | null | undefined,
): string[] {
  if (!snapshot?.files.length) {
    return [
      'Workspace context:',
      'No workspace file context was provided for this run.',
    ];
  }

  return [
    'Workspace context:',
    snapshot.summary,
    ...snapshot.files.flatMap((file) => [
      `--- file: ${file.path}`,
      file.content,
      `--- end file: ${file.path}`,
    ]),
  ];
}

function blockedContext(blockedReasons: string[]): CollectCodeAgentWorkspaceContextResult {
  return {
    blockedReasons,
    status: 'blocked',
    summary: `Code Agent workspace context blocked: ${blockedReasons.join(' ')}`,
  };
}

function normalizeRelativePath(file: string): string {
  return path.posix.normalize(file.replaceAll('\\', '/').trim());
}

function isAllowedWorkspaceContextPath(file: string): boolean {
  if (!file
    || path.posix.isAbsolute(file)
    || path.win32.isAbsolute(file)
    || file === '.'
    || file === '..'
    || file.startsWith('../')
    || file.includes('/../')
    || file.endsWith('/..')) {
    return false;
  }

  const segments = file.split('/');
  if (segments.some((segment) => !segment || FORBIDDEN_PATH_SEGMENTS.has(segment))) {
    return false;
  }

  const basename = segments.at(-1) ?? '';
  return !FORBIDDEN_BASENAMES.has(basename);
}

function isInsidePath(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
