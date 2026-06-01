import { isTaskMdPath, isTaskRecordPath, normalizeTaskMemoryPath } from './task-memory-path.js';
import type { TaskRecordWorthinessReason } from './task-record-worthiness.js';

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
  suggestedContentByTarget?: Partial<Record<TaskMemoryGuidanceTarget, string>>;
  taskRecordReasonsByTarget?: Partial<Record<TaskMemoryGuidanceTarget, TaskRecordWorthinessReason>>;
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
      taskRecordReasonsByTarget: mergeTaskRecordReasonMaps(
        parseStructuredTaskRecordReasons(signal.input),
        parseHumanReadableTaskRecordReasons(signal.output),
      ),
      suggestedContentByTarget: parseStructuredGuidanceSuggestedContent(signal.input),
      targets: normalizeGuidanceTargets(signal.targets)
        ?? parseStructuredGuidanceTargets(signal.input)
        ?? detectImplicitTaskMemoryGuidanceTargets(signal),
    }))
    .filter((signal) => signal.targets.length > 0);

  if (guidance.length === 0) {
    return {
      latestGuidanceAt: null,
      outcome: 'none',
      pendingTargets: [],
      reason: '没有发现待处理的任务记忆建议。',
      referencePathsByTarget: {},
      suggestedContentByTarget: {},
      taskRecordReasonsByTarget: {},
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
      suggestedContentByTarget: suggestedContentForTargets(targets, latestByTarget),
      taskRecordReasonsByTarget: taskRecordReasonsForTargets(targets, latestByTarget),
      targets,
    };
  }

  return {
    latestGuidanceAt: latestPendingGuidanceAt(pendingTargets, latestByTarget),
    outcome: 'pending',
    pendingTargets,
    reason: `最新任务记忆建议仍缺少对应写入：${pendingTargets.map(labelTarget).join('、')}。`,
    referencePathsByTarget: referencePathsForTargets(pendingTargets, latestByTarget),
    suggestedContentByTarget: suggestedContentForTargets(pendingTargets, latestByTarget),
    taskRecordReasonsByTarget: taskRecordReasonsForTargets(pendingTargets, latestByTarget),
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

function detectImplicitTaskMemoryGuidanceTargets(signal: TaskMemoryGuidanceSignal): TaskMemoryGuidanceTarget[] {
  const text = [
    signal.title ?? '',
    signal.output ?? '',
  ].join('\n');
  if (!looksLikeTaskMemoryGuidance(text)) return [];
  return detectTaskMemoryGuidanceTargets(text);
}

function looksLikeTaskMemoryGuidance(text: string): boolean {
  return /任务记忆建议|任务记忆写入提案|写入提案|Task Memory|memory guidance|memory proposal|Task\.md update recommended|Task Record may be useful/i.test(text);
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

function parseStructuredGuidanceSuggestedContent(input?: string | null): Partial<Record<TaskMemoryGuidanceTarget, string>> {
  if (!input) return {};
  try {
    const parsed = JSON.parse(input) as { suggestedContentByTarget?: unknown };
    const value = parsed.suggestedContentByTarget;
    if (!value || typeof value !== 'object') return {};
    const record = value as Partial<Record<TaskMemoryGuidanceTarget, unknown>>;
    return {
      task_md: normalizeSuggestedContent(record.task_md),
      task_record: normalizeSuggestedContent(record.task_record),
    };
  } catch {
    return {};
  }
}

function parseStructuredTaskRecordReasons(input?: string | null): Partial<Record<TaskMemoryGuidanceTarget, TaskRecordWorthinessReason>> {
  if (!input) return {};
  try {
    const parsed = JSON.parse(input) as {
      items?: Array<{ target?: unknown; reason?: unknown }>;
      taskRecordReasonHint?: unknown;
      taskRecordReasonsByTarget?: unknown;
    };
    const record = parsed.taskRecordReasonsByTarget && typeof parsed.taskRecordReasonsByTarget === 'object'
      ? parsed.taskRecordReasonsByTarget as Partial<Record<TaskMemoryGuidanceTarget, unknown>>
      : {};
    const taskRecordReason = normalizeTaskRecordReason(record.task_record)
      ?? normalizeTaskRecordReason(parsed.taskRecordReasonHint);
    const itemReason = (parsed.items ?? [])
      .filter((item) => item.target === 'task_record')
      .map((item) => normalizeTaskRecordReason(item.reason))
      .find((reason): reason is TaskRecordWorthinessReason => Boolean(reason));
    return {
      task_record: taskRecordReason ?? itemReason,
    };
  } catch {
    return {};
  }
}

function normalizeSuggestedContent(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const content = value.trim();
  return content || undefined;
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

function parseHumanReadableTaskRecordReasons(output?: string | null): Partial<Record<TaskMemoryGuidanceTarget, TaskRecordWorthinessReason>> {
  for (const line of output?.split(/\r?\n/) ?? []) {
    const match = line.match(/Task Record(?: may be useful)?\s*[:：]\s*(.+)$/i);
    if (!match) continue;
    const reason = normalizeTaskRecordReason(match[1]);
    if (reason) return { task_record: reason };
  }
  return {};
}

function normalizeTaskRecordReason(value: unknown): TaskRecordWorthinessReason | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) return undefined;
  if (/context.*(archive|clear|refresh)|context_archive/.test(normalized)) return 'context_clear_archive';
  if (/phase.*close|closeout|milestone/.test(normalized)) return 'phase_closeout';
  if (/handoff|handover/.test(normalized)) return 'handoff';
  if (/correction|correct|user_correction/.test(normalized)) return 'user_correction';
  if (/option|tradeoff|comparison/.test(normalized)) return 'option_comparison';
  if (/decision|rationale|approved|rejected/.test(normalized)) return 'decision_rationale';
  if (/failure|failed|postmortem|rollback/.test(normalized)) return 'failure_review';
  if (/external|signal|webhook|source/.test(normalized)) return 'external_signal';
  if (/durable|state|agent_cli|runtime|verifier|review/.test(normalized)) return 'durable_state_change';
  return undefined;
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

function mergeTaskRecordReasonMaps(
  first: Partial<Record<TaskMemoryGuidanceTarget, TaskRecordWorthinessReason>>,
  second: Partial<Record<TaskMemoryGuidanceTarget, TaskRecordWorthinessReason>>,
): Partial<Record<TaskMemoryGuidanceTarget, TaskRecordWorthinessReason>> {
  return {
    task_record: first.task_record ?? second.task_record,
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
    suggestedContentByTarget?: Partial<Record<TaskMemoryGuidanceTarget, string>>;
    taskRecordReasonsByTarget?: Partial<Record<TaskMemoryGuidanceTarget, TaskRecordWorthinessReason>>;
    targets: TaskMemoryGuidanceTarget[];
  }>,
): Map<TaskMemoryGuidanceTarget, {
  createdAt: string | null;
  index: number;
  referencePaths: string[];
  suggestedContent: string | null;
  taskRecordReason: TaskRecordWorthinessReason | null;
}> {
  const byTarget = new Map<TaskMemoryGuidanceTarget, {
    createdAt: string | null;
    index: number;
    referencePaths: string[];
    suggestedContent: string | null;
    taskRecordReason: TaskRecordWorthinessReason | null;
  }>();
  for (const signal of signals) {
    for (const target of signal.targets) {
      const current = byTarget.get(target);
      if (!current || compareSignalOrder(signal, current) > 0) {
        byTarget.set(target, {
          createdAt: signal.createdAt,
          index: signal.index,
          referencePaths: signal.referencePathsByTarget?.[target] ?? [],
          suggestedContent: signal.suggestedContentByTarget?.[target] ?? null,
          taskRecordReason: signal.taskRecordReasonsByTarget?.[target] ?? null,
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

function suggestedContentForTargets(
  targets: TaskMemoryGuidanceTarget[],
  latestByTarget: Map<TaskMemoryGuidanceTarget, { suggestedContent: string | null }>,
): Partial<Record<TaskMemoryGuidanceTarget, string>> {
  const result: Partial<Record<TaskMemoryGuidanceTarget, string>> = {};
  for (const target of targets) {
    const content = latestByTarget.get(target)?.suggestedContent;
    if (content) result[target] = content;
  }
  return result;
}

function taskRecordReasonsForTargets(
  targets: TaskMemoryGuidanceTarget[],
  latestByTarget: Map<TaskMemoryGuidanceTarget, { taskRecordReason: TaskRecordWorthinessReason | null }>,
): Partial<Record<TaskMemoryGuidanceTarget, TaskRecordWorthinessReason>> {
  const result: Partial<Record<TaskMemoryGuidanceTarget, TaskRecordWorthinessReason>> = {};
  for (const target of targets) {
    const reason = latestByTarget.get(target)?.taskRecordReason;
    if (reason) result[target] = reason;
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
