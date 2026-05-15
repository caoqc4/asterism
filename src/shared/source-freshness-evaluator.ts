import type { SourceContextRole, SourceContextStatus } from './types/source-context.js';

export type SourceFreshnessDecision = 'include' | 'caution' | 'exclude';
export type SourceFreshnessReason =
  | 'archived'
  | 'explicitly_selected'
  | 'current_run'
  | 'key_source'
  | 'stable_reference'
  | 'recent'
  | 'stale'
  | 'undated';

export type SourceFreshnessEvaluation = {
  decision: SourceFreshnessDecision;
  reason: SourceFreshnessReason;
  ageDays: number | null;
  summary: string;
};

export type SourceFreshnessInput = {
  capturedAt?: string | null;
  createdAt?: string | null;
  currentRunId?: string | null;
  isKey?: boolean;
  now?: string;
  runId?: string | null;
  selected?: boolean;
  sourceRole?: SourceContextRole | null;
  status?: SourceContextStatus | string | null;
  title?: string | null;
  updatedAt?: string | null;
};

const RECENT_SOURCE_DAYS = 14;
const STALE_SOURCE_DAYS = 45;

function sourceTimestamp(input: SourceFreshnessInput): string | null {
  return input.capturedAt ?? input.updatedAt ?? input.createdAt ?? null;
}

function ageInDays(iso: string | null, nowIso: string): number | null {
  if (!iso) return null;
  const sourceDate = Date.parse(iso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(sourceDate) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.floor((now - sourceDate) / 86_400_000));
}

function label(input: SourceFreshnessInput): string {
  return input.title?.trim() || '来源材料';
}

export function evaluateSourceFreshness(input: SourceFreshnessInput): SourceFreshnessEvaluation {
  const now = input.now ?? new Date().toISOString();
  const ageDays = ageInDays(sourceTimestamp(input), now);
  const title = label(input);

  if (input.status === 'archived') {
    return {
      decision: 'exclude',
      reason: 'archived',
      ageDays,
      summary: `${title} 已归档，不应作为当前执行依据。`,
    };
  }

  if (input.selected) {
    return {
      decision: 'include',
      reason: 'explicitly_selected',
      ageDays,
      summary: `${title} 被显式选中，应纳入当前上下文。`,
    };
  }

  if (input.currentRunId && input.runId === input.currentRunId) {
    return {
      decision: 'include',
      reason: 'current_run',
      ageDays,
      summary: `${title} 来自当前 run，应优先纳入上下文。`,
    };
  }

  if (input.sourceRole === 'stable_reference') {
    return {
      decision: 'include',
      reason: 'stable_reference',
      ageDays,
      summary: `${title} 是稳定参考材料，可以跨时间窗口复用。`,
    };
  }

  if (input.isKey) {
    return {
      decision: ageDays !== null && ageDays > STALE_SOURCE_DAYS ? 'caution' : 'include',
      reason: 'key_source',
      ageDays,
      summary: ageDays !== null && ageDays > STALE_SOURCE_DAYS
        ? `${title} 是关键来源但已经 ${ageDays} 天未更新，使用前应确认是否仍有效。`
        : `${title} 是关键来源，应纳入当前上下文。`,
    };
  }

  if (ageDays === null) {
    return {
      decision: 'caution',
      reason: 'undated',
      ageDays,
      summary: `${title} 缺少可判断的新鲜度时间，使用前应确认来源时效。`,
    };
  }

  if (ageDays <= RECENT_SOURCE_DAYS) {
    return {
      decision: 'include',
      reason: 'recent',
      ageDays,
      summary: `${title} 是最近 ${ageDays} 天内捕获的来源，可以纳入上下文。`,
    };
  }

  return {
    decision: ageDays > STALE_SOURCE_DAYS ? 'exclude' : 'caution',
    reason: 'stale',
    ageDays,
    summary: ageDays > STALE_SOURCE_DAYS
      ? `${title} 已经 ${ageDays} 天未更新，除非被选中或标为稳定参考，否则不应作为当前依据。`
      : `${title} 已经 ${ageDays} 天未更新，使用前应确认是否仍有效。`,
  };
}
