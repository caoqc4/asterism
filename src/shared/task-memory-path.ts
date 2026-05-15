export function normalizeTaskMemoryPath(path: string | null | undefined): string | null {
  const normalized = path?.trim().replace(/\\/g, '/') ?? '';
  return normalized || null;
}

export function isTaskMdPath(path: string | null | undefined): boolean {
  return normalizeTaskMemoryPath(path) === 'Task.md';
}

export function isTaskRecordPath(path: string | null | undefined): boolean {
  return Boolean(normalizeTaskMemoryPath(path)?.startsWith('Task Records/'));
}
