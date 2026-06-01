import fs from 'node:fs/promises';
import path from 'node:path';

export type CodeAgentStagedFilePlanFile = {
  content: string;
  path: string;
};

export type CodeAgentStagedFilePlan = {
  files: CodeAgentStagedFilePlanFile[];
  observations: string[];
  summary: string;
};

export type NormalizeCodeAgentStagedFilePlanResult =
  | {
      plan: CodeAgentStagedFilePlan;
      status: 'accepted';
      summary: string;
    }
  | {
      blockedReasons: string[];
      status: 'blocked';
      summary: string;
    };

export type WriteCodeAgentStagedFilePlanResult = {
  files: string[];
  summary: string;
};

const DEFAULT_MAX_FILES = 8;
const DEFAULT_MAX_FILE_BYTES = 64_000;
const DEFAULT_MAX_TOTAL_BYTES = 128_000;
const FORBIDDEN_PATH_SEGMENTS = new Set(['.git', 'node_modules']);
const FORBIDDEN_BASENAMES = new Set(['.env', '.env.local', '.npmrc', '.netrc']);

export function parseCodeAgentStagedFilePlanPayload(text: string): NormalizeCodeAgentStagedFilePlanResult {
  try {
    return normalizeCodeAgentStagedFilePlanPayload(JSON.parse(text));
  } catch {
    const fencedPayload = extractFencedJsonPayload(text);

    if (!fencedPayload) {
      return blockedPlan(['Code Agent staged file plan must be strict JSON.']);
    }

    try {
      return normalizeCodeAgentStagedFilePlanPayload(JSON.parse(fencedPayload));
    } catch {
      return blockedPlan(['Code Agent staged file plan must be strict JSON.']);
    }
  }
}

export function normalizeCodeAgentStagedFilePlanPayload(
  value: unknown,
  options: {
    maxFileBytes?: number;
    maxFiles?: number;
    maxTotalBytes?: number;
  } = {},
): NormalizeCodeAgentStagedFilePlanResult {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const blockedReasons: string[] = [];

  if (!isRecord(value)) {
    return blockedPlan(['Code Agent staged file plan must be an object.']);
  }

  const summary = readBoundedString(value.summary, 400);
  const observations = normalizeStringArray(value.observations, 8, 400);

  if (!summary) {
    blockedReasons.push('Code Agent staged file plan requires a summary.');
  }

  if (!Array.isArray(value.files)) {
    blockedReasons.push('Code Agent staged file plan requires a files array.');
  }

  const files: CodeAgentStagedFilePlanFile[] = [];
  const seenPaths = new Set<string>();
  let totalBytes = 0;

  for (const rawFile of Array.isArray(value.files) ? value.files : []) {
    if (!isRecord(rawFile)) {
      blockedReasons.push('Code Agent staged file entries must be objects.');
      continue;
    }

    const rawPath = typeof rawFile.path === 'string' ? rawFile.path : '';
    const normalizedPath = normalizeRelativePath(rawPath);
    const content = typeof rawFile.content === 'string' ? rawFile.content : null;

    if (!isAllowedStagedFilePath(normalizedPath)) {
      blockedReasons.push(`Code Agent staged file path is not allowed: ${rawPath || '[missing]'}.`);
      continue;
    }

    if (seenPaths.has(normalizedPath)) {
      blockedReasons.push(`Code Agent staged file path is duplicated: ${normalizedPath}.`);
      continue;
    }

    if (content === null) {
      blockedReasons.push(`Code Agent staged file content must be text: ${normalizedPath}.`);
      continue;
    }

    if (content.includes('\0')) {
      blockedReasons.push(`Code Agent staged file content must not contain binary data: ${normalizedPath}.`);
      continue;
    }

    const byteLength = Buffer.byteLength(content, 'utf8');
    if (byteLength > maxFileBytes) {
      blockedReasons.push(`Code Agent staged file exceeds per-file size limit: ${normalizedPath}.`);
      continue;
    }

    totalBytes += byteLength;
    seenPaths.add(normalizedPath);
    files.push({
      content,
      path: normalizedPath,
    });
  }

  if (files.length === 0) {
    blockedReasons.push('Code Agent staged file plan requires at least one accepted file.');
  }

  if (files.length > maxFiles) {
    blockedReasons.push('Code Agent staged file plan contains too many files.');
  }

  if (totalBytes > maxTotalBytes) {
    blockedReasons.push('Code Agent staged file plan exceeds total size limit.');
  }

  if (blockedReasons.length > 0) {
    return blockedPlan(blockedReasons);
  }

  return {
    plan: {
      files,
      observations,
      summary,
    },
    status: 'accepted',
    summary: [
      'Code Agent staged file plan accepted',
      `files=${files.length}`,
      `bytes=${totalBytes}`,
    ].join(' / '),
  };
}

export async function writeCodeAgentStagedFilePlan(params: {
  plan: CodeAgentStagedFilePlan;
  stagingRoot: string;
}): Promise<WriteCodeAgentStagedFilePlanResult> {
  const stagingRoot = path.resolve(params.stagingRoot);

  for (const file of params.plan.files) {
    const target = path.resolve(stagingRoot, file.path);

    if (!isInsidePath(target, stagingRoot)) {
      throw new Error(`Code Agent staged file escaped staging root: ${file.path}`);
    }

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, 'utf8');
  }

  return {
    files: params.plan.files.map((file) => file.path),
    summary: `Code Agent staged file plan wrote ${params.plan.files.length} file(s) to staging.`,
  };
}

function blockedPlan(blockedReasons: string[]): NormalizeCodeAgentStagedFilePlanResult {
  return {
    blockedReasons,
    status: 'blocked',
    summary: `Code Agent staged file plan blocked: ${blockedReasons.join(' ')}`,
  };
}

function normalizeRelativePath(file: string): string {
  return path.posix.normalize(file.replaceAll('\\', '/').trim());
}

function extractFencedJsonPayload(text: string): string | null {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);

  return match?.[1]?.trim() || null;
}

function isAllowedStagedFilePath(file: string): boolean {
  if (!file
    || path.posix.isAbsolute(file)
    || path.win32.isAbsolute(file)
    || file === '.'
    || file === '..'
    || file.startsWith('../')
    || file.includes('/../')
    || file.endsWith('/..')
    || file === 'session.json') {
    return false;
  }

  const segments = file.split('/');
  if (segments.some((segment) => !segment || FORBIDDEN_PATH_SEGMENTS.has(segment))) {
    return false;
  }

  const basename = segments.at(-1) ?? '';
  return !FORBIDDEN_BASENAMES.has(basename);
}

function readBoundedString(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.trim().slice(0, maxLength)
    : '';
}

function normalizeStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInsidePath(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative));
}
