export type TaskMemoryGuidanceTarget = 'task_md' | 'task_record';

export type TaskMemoryGuidanceSignal = {
  createdAt?: string | null;
  id?: string | null;
  output?: string | null;
  status?: string | null;
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
  targets: TaskMemoryGuidanceTarget[];
};

export type TaskMemoryFileSignal = {
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
      targets: detectTaskMemoryGuidanceTargets([
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
      targets: [],
    };
  }

  const latest = guidance.reduce((current, signal) => (
    compareSignalOrder(signal, current) > 0 ? signal : current
  ));
  const targets = uniqueTargets(latest.targets);
  const writes = (params.memoryWrites ?? []).filter(isCompletedSignal);
  const pendingTargets = targets.filter((target) => !writes.some((write) => {
    const writeTarget = write.target ?? inferWriteTarget(write);
    if (writeTarget !== target) return false;
    if (!latest.createdAt || !write.createdAt) return true;
    return write.createdAt >= latest.createdAt;
  }));

  if (pendingTargets.length === 0) {
    return {
      latestGuidanceAt: latest.createdAt,
      outcome: 'satisfied',
      pendingTargets: [],
      reason: '最新任务记忆建议已有对应的 Task.md 或 Task Record 写入。',
      targets,
    };
  }

  return {
    latestGuidanceAt: latest.createdAt,
    outcome: 'pending',
    pendingTargets,
    reason: `最新任务记忆建议仍缺少对应写入：${pendingTargets.map(labelTarget).join('、')}。`,
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
      .filter((file) => file.path === 'Task.md' || Boolean(file.path?.startsWith('Task Records/')))
      .map((file) => ({
        createdAt: file.updatedAt ?? null,
        path: file.path ?? null,
        status: 'completed',
        target: file.path === 'Task.md' ? 'task_md' : 'task_record',
        title: file.name ?? file.path ?? null,
      })),
  });
}

function inferWriteTarget(write: TaskMemoryWriteSignal): TaskMemoryGuidanceTarget | null {
  const text = [write.title ?? '', normalizeTaskMemoryPath(write.path) ?? ''].join('\n');
  const targets = detectTaskMemoryGuidanceTargets(text);
  return targets[0] ?? null;
}

function normalizeTaskMemoryPath(path: string | null | undefined): string | null {
  const normalized = path?.trim().replace(/\\/g, '/') ?? '';
  return normalized || null;
}

function isCompletedSignal(signal: { status?: string | null }): boolean {
  if (FAILED_STATUSES.has(signal.status ?? '')) return false;
  return COMPLETED_OR_UNKNOWN.has(signal.status);
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

function labelTarget(target: TaskMemoryGuidanceTarget): string {
  return target === 'task_md' ? 'Task.md' : 'Task Record';
}

function compareOptionalIso(a: string | null, b: string | null): number {
  if (a && b && a !== b) return a > b ? 1 : -1;
  if (a && !b) return 1;
  if (!a && b) return -1;
  return 0;
}
