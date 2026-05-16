import { isTaskMdPath, isTaskRecordPath, normalizeTaskMemoryPath } from './task-memory-path.js';

export type TaskMemoryGuidanceTarget = 'task_md' | 'task_record';

export type TaskMemoryGuidanceSignal = {
  createdAt?: string | null;
  id?: string | null;
  input?: string | null;
  output?: string | null;
  status?: string | null;
  targets?: TaskMemoryGuidanceTarget[] | null;
  title?: string | null;
};

export type TaskMemoryWriteSignal = {
  createdAt?: string | null;
  path?: string | null;
  status?: string | null;
  target?: TaskMemoryGuidanceTarget | null;
  title?: string | null;
};

export type TaskMemoryGuidanceState = {
  latestGuidanceAt: string | null;
  outcome: 'none' | 'pending' | 'satisfied';
  pendingTargets: TaskMemoryGuidanceTarget[];
  reason: string;
  referencePathsByTarget?: Partial<Record<TaskMemoryGuidanceTarget, string[]>>;
  targets: TaskMemoryGuidanceTarget[];
};

export type TaskMemoryFileSignal = {
  content?: string | null;
  id?: string | null;
  name?: string | null;
  path?: string | null;
  updatedAt?: string | null;
};

const COMPLETED_OR_UNKNOWN = new Set([undefined, null, '', 'completed']);
const FAILED_STATUSES = new Set(['failed', 'skipped', 'cancelled']);

export function evaluateTaskMemoryGuidanceState(params: {
  guidanceSignals: TaskMemoryGuidanceSignal[];
  memoryWrites?: TaskMemoryWriteSignal[];
}): TaskMemoryGuidanceState {
  const guidance = params.guidanceSignals
    .filter(isCompletedSignal)
    .map((signal, index) => ({
      index,
      createdAt: signal.createdAt ?? null,
      referencePathsByTarget: mergeReferenceMaps(
        parseStructuredGuidanceReferences(signal.input),
        parseHumanReadableGuidanceReferences(signal.output),
      ),
      targets: normalizeGuidanceTargets(signal.targets)
        ?? parseStructuredGuidanceTargets(signal.input)
        ?? detectTaskMemoryGuidanceTargets([
          signal.title ?? '',
          signal.output ?? '',
        ].join('\n')),
    }))
    .filter((signal) => signal.targets.length > 0);

  if (guidance.length === 0) {
    return {
      latestGuidanceAt: null,
      outcome: 'none',
      pendingTargets: [],
      reason: '没有发现待处理的任务记忆建议。',
      referencePathsByTarget: {},
      targets: [],
    };
  }

  const latest = latestSignal(guidance);
  const latestByTarget = latestGuidanceByTarget(guidance);
  const targets = uniqueTargets(Array.from(latestByTarget.keys()));
  const writes = (params.memoryWrites ?? []).filter(isCompletedSignal);
  const pendingTargets = targets.filter((target) => {
    const targetGuidance = latestByTarget.get(target);
    if (!targetGuidance) return false;
    return !writes.some((write) => isWriteAfterGuidanceForTarget(write, target, targetGuidance.createdAt));
  });

  if (pendingTargets.length === 0) {
    return {
      latestGuidanceAt: latest.createdAt,
      outcome: 'satisfied',
      pendingTargets: [],
      reason: '最新任务记忆建议已有对应的 Task.md 或 Task Record 写入。',
      referencePathsByTarget: referencePathsForTargets(targets, latestByTarget),
      targets,
    };
  }

  return {
    latestGuidanceAt: latestPendingGuidanceAt(pendingTargets, latestByTarget),
    outcome: 'pending',
    pendingTargets,
    reason: `最新任务记忆建议仍缺少对应写入：${pendingTargets.map(labelTarget).join('、')}。`,
    referencePathsByTarget: referencePathsForTargets(pendingTargets, latestByTarget),
    targets,
  };
}

export function detectTaskMemoryGuidanceTargets(text: string): TaskMemoryGuidanceTarget[] {
  const targets: TaskMemoryGuidanceTarget[] = [];
  if (/Task\.md|task_md|任务摘要|主恢复文件/i.test(text)) targets.push('task_md');
  if (/Task Record|Task Records|task_record|任务记录|阶段记录|阶段收尾记录|收尾记录|交接记录|上下文清理记录|会话刷新记录|context[-_ ]?refresh|closeout|handoff/i.test(text)) {
    targets.push('task_record');
  }
  return uniqueTargets(targets);
}

function parseStructuredGuidanceTargets(input?: string | null): TaskMemoryGuidanceTarget[] | null {
  if (!input) return null;
  try {
    const parsed = JSON.parse(input) as { targets?: unknown };
    return normalizeGuidanceTargets(parsed.targets);
  } catch {
    return null;
  }
}

function parseStructuredGuidanceReferences(input?: string | null): Partial<Record<TaskMemoryGuidanceTarget, string[]>> {
  if (!input) return {};
  try {
    const parsed = JSON.parse(input) as {
      items?: Array<{ target?: unknown; referencePath?: unknown }>;
      referencePathsByTarget?: unknown;
    };
    return mergeReferenceMaps(
      normalizeReferenceMap(parsed.referencePathsByTarget),
      normalizeGuidanceItemReferences(parsed.items),
    );
  } catch {
    return {};
  }
}

function parseHumanReadableGuidanceReferences(output?: string | null): Partial<Record<TaskMemoryGuidanceTarget, string[]>> {
  const result: Partial<Record<TaskMemoryGuidanceTarget, string[]>> = {};
  for (const line of output?.split(/\r?\n/) ?? []) {
    const target = /Task\.md/i.test(line)
      ? 'task_md'
      : /Task Record/i.test(line)
        ? 'task_record'
        : null;
    if (!target) continue;
    const referencePath = line.match(/(?:reference|引用)\s*=\s*([^/\s].*?)\s*$/i)?.[1]?.trim();
    if (!referencePath) continue;
    result[target] = uniqueStrings([...(result[target] ?? []), referencePath]);
  }
  return result;
}

function normalizeGuidanceItemReferences(
  items: Array<{ target?: unknown; referencePath?: unknown }> | undefined,
): Partial<Record<TaskMemoryGuidanceTarget, string[]>> {
  const result: Partial<Record<TaskMemoryGuidanceTarget, string[]>> = {};
  for (const item of items ?? []) {
    if (item.target !== 'task_md' && item.target !== 'task_record') continue;
    const referencePath = typeof item.referencePath === 'string' ? item.referencePath.trim() : '';
    if (!referencePath) continue;
    result[item.target] = uniqueStrings([...(result[item.target] ?? []), referencePath]);
  }
  return result;
}

function normalizeReferenceMap(value: unknown): Partial<Record<TaskMemoryGuidanceTarget, string[]>> {
  if (!value || typeof value !== 'object') return {};
  const record = value as Partial<Record<TaskMemoryGuidanceTarget, unknown>>;
  return {
    task_md: normalizeReferencePaths(record.task_md),
    task_record: normalizeReferencePaths(record.task_record),
  };
}

function normalizeReferencePaths(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const paths = value
    .filter((path): path is string => typeof path === 'string')
    .map((path) => path.trim())
    .filter(Boolean);
  return paths.length ? uniqueStrings(paths) : undefined;
}

function mergeReferenceMaps(
  first: Partial<Record<TaskMemoryGuidanceTarget, string[]>>,
  second: Partial<Record<TaskMemoryGuidanceTarget, string[]>>,
): Partial<Record<TaskMemoryGuidanceTarget, string[]>> {
  return {
    task_md: uniqueStrings([...(first.task_md ?? []), ...(second.task_md ?? [])]),
    task_record: uniqueStrings([...(first.task_record ?? []), ...(second.task_record ?? [])]),
  };
}

function normalizeGuidanceTargets(value: unknown): TaskMemoryGuidanceTarget[] | null {
  if (!Array.isArray(value)) return null;
  const targets = value.filter((target): target is TaskMemoryGuidanceTarget => (
    target === 'task_md' || target === 'task_record'
  ));
  return targets.length ? uniqueTargets(targets) : null;
}

export function selectBlockingTaskMemoryGuidance(
  states: Array<TaskMemoryGuidanceState | null | undefined>,
): TaskMemoryGuidanceState | null {
  const pending = states
    .filter((state): state is TaskMemoryGuidanceState => Boolean(state && state.outcome === 'pending'));
  if (pending.length === 0) return null;

  return pending.reduce((current, state) => (
    compareOptionalIso(state.latestGuidanceAt, current.latestGuidanceAt) > 0 ? state : current
  ));
}

export function buildTaskMemoryGuidanceStateForTaskFiles(params: {
  guidanceSignals: TaskMemoryGuidanceSignal[];
  taskFiles?: TaskMemoryFileSignal[] | null;
}): TaskMemoryGuidanceState {
  return evaluateTaskMemoryGuidanceState({
    guidanceSignals: params.guidanceSignals,
    memoryWrites: (params.taskFiles ?? [])
      .map((file) => ({
        ...file,
        path: normalizeTaskMemoryPath(file.path),
      }))
      .filter((file) => isTaskMdPath(file.path) || isTaskRecordPath(file.path))
      .map((file) => ({
        createdAt: file.updatedAt ?? null,
        path: file.path ?? null,
        status: 'completed',
        target: isTaskMdPath(file.path) ? 'task_md' : 'task_record',
        title: file.name ?? file.path ?? null,
      })),
  });
}

function inferWriteTarget(write: TaskMemoryWriteSignal): TaskMemoryGuidanceTarget | null {
  const text = [write.title ?? '', normalizeTaskMemoryPath(write.path) ?? ''].join('\n');
  const targets = detectTaskMemoryGuidanceTargets(text);
  return targets[0] ?? null;
}

function isWriteAfterGuidanceForTarget(
  write: TaskMemoryWriteSignal,
  target: TaskMemoryGuidanceTarget,
  guidanceCreatedAt: string | null,
): boolean {
  const writeTarget = write.target ?? inferWriteTarget(write);
  if (writeTarget !== target) return false;
  if (!guidanceCreatedAt || !write.createdAt) return true;
  return write.createdAt >= guidanceCreatedAt;
}

function isCompletedSignal(signal: { status?: string | null }): boolean {
  if (FAILED_STATUSES.has(signal.status ?? '')) return false;
  return COMPLETED_OR_UNKNOWN.has(signal.status);
}

function latestSignal<T extends { createdAt: string | null; index: number }>(signals: T[]): T {
  return signals.reduce((current, signal) => (
    compareSignalOrder(signal, current) > 0 ? signal : current
  ));
}

function latestGuidanceByTarget(
  signals: Array<{
    createdAt: string | null;
    index: number;
    referencePathsByTarget?: Partial<Record<TaskMemoryGuidanceTarget, string[]>>;
    targets: TaskMemoryGuidanceTarget[];
  }>,
): Map<TaskMemoryGuidanceTarget, {
  createdAt: string | null;
  index: number;
  referencePaths: string[];
}> {
  const byTarget = new Map<TaskMemoryGuidanceTarget, {
    createdAt: string | null;
    index: number;
    referencePaths: string[];
  }>();
  for (const signal of signals) {
    for (const target of signal.targets) {
      const current = byTarget.get(target);
      if (!current || compareSignalOrder(signal, current) > 0) {
        byTarget.set(target, {
          createdAt: signal.createdAt,
          index: signal.index,
          referencePaths: signal.referencePathsByTarget?.[target] ?? [],
        });
      }
    }
  }
  return byTarget;
}

function latestPendingGuidanceAt(
  pendingTargets: TaskMemoryGuidanceTarget[],
  latestByTarget: Map<TaskMemoryGuidanceTarget, { createdAt: string | null; index: number }>,
): string | null {
  const pendingSignals = pendingTargets
    .map((target) => latestByTarget.get(target))
    .filter((signal): signal is { createdAt: string | null; index: number } => Boolean(signal));
  return pendingSignals.length ? latestSignal(pendingSignals).createdAt : null;
}

function referencePathsForTargets(
  targets: TaskMemoryGuidanceTarget[],
  latestByTarget: Map<TaskMemoryGuidanceTarget, { referencePaths: string[] }>,
): Partial<Record<TaskMemoryGuidanceTarget, string[]>> {
  const result: Partial<Record<TaskMemoryGuidanceTarget, string[]>> = {};
  for (const target of targets) {
    const paths = latestByTarget.get(target)?.referencePaths ?? [];
    if (paths.length) result[target] = paths;
  }
  return result;
}

function compareSignalOrder(
  a: { createdAt: string | null; index: number },
  b: { createdAt: string | null; index: number },
): number {
  if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
    return a.createdAt > b.createdAt ? 1 : -1;
  }
  if (a.createdAt && !b.createdAt) return 1;
  if (!a.createdAt && b.createdAt) return -1;
  return a.index - b.index;
}

function uniqueTargets(targets: TaskMemoryGuidanceTarget[]): TaskMemoryGuidanceTarget[] {
  return Array.from(new Set(targets));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function labelTarget(target: TaskMemoryGuidanceTarget): string {
  return target === 'task_md' ? 'Task.md' : 'Task Record';
}

function compareOptionalIso(a: string | null, b: string | null): number {
  if (a && b && a !== b) return a > b ? 1 : -1;
  if (a && !b) return 1;
  if (!a && b) return -1;
  return 0;
}
