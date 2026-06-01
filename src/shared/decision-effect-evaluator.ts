import type { DecisionRecord } from './types/decision.js';

export type DecisionEffectTone =
  | 'blocking'
  | 'accepted'
  | 'deferred'
  | 'cancelled'
  | 'none';

export type DecisionEffectSummary = {
  tone: DecisionEffectTone;
  pendingCount: number;
  approvedCount: number;
  deferredCount: number;
  cancelledCount: number;
  blockingCount: number;
  latestDecisionTitle: string | null;
  effectLabel: string;
  effectDetail: string;
  requiresUserAction: boolean;
};

export type DecisionEffectGroup = {
  key: string;
  label: string;
  taskId: string | null;
  sourceType: DecisionRecord['sourceType'] | null;
  sourceId: string | null;
  sourceLabel: string | null;
  decisionIds: string[];
  latestUpdatedAt: string;
  summary: DecisionEffectSummary;
};

function latestDecisionTitle(decisions: DecisionRecord[]): string | null {
  const latest = [...decisions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return latest?.title ?? null;
}

export function groupDecisionEffects(decisions: DecisionRecord[]): DecisionEffectGroup[] {
  const groups = new Map<string, DecisionRecord[]>();

  for (const decision of decisions) {
    const key = decision.taskId
      ? `task:${decision.taskId}`
      : decision.sourceType && decision.sourceId
        ? `source:${decision.sourceType}:${decision.sourceId}`
        : 'global';
    groups.set(key, [...(groups.get(key) ?? []), decision]);
  }

  return [...groups.entries()]
    .map(([key, items]) => {
      const latest = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]!;
      return {
        key,
        label: decisionGroupLabel(latest),
        taskId: latest.taskId,
        sourceType: latest.sourceType ?? null,
        sourceId: latest.sourceId ?? null,
        sourceLabel: latest.sourceLabel ?? null,
        decisionIds: items.map((item) => item.id),
        latestUpdatedAt: latest.updatedAt,
        summary: summarizeDecisionEffects(items),
      };
    })
    .sort((left, right) => (
      decisionEffectGroupRank(right.summary) - decisionEffectGroupRank(left.summary)
      || right.latestUpdatedAt.localeCompare(left.latestUpdatedAt)
    ));
}

function decisionGroupLabel(decision: DecisionRecord): string {
  if (decision.taskId) return decision.sourceLabel ?? decision.title;
  if (decision.sourceLabel) return decision.sourceLabel;
  if (decision.sourceType) return decision.sourceType;
  return '全局拍板';
}

function decisionEffectGroupRank(summary: DecisionEffectSummary): number {
  if (summary.tone === 'blocking') return 4;
  if (summary.tone === 'deferred') return 3;
  if (summary.tone === 'cancelled') return 2;
  if (summary.tone === 'accepted') return 1;
  return 0;
}

export function summarizeDecisionEffects(decisions: DecisionRecord[]): DecisionEffectSummary {
  const pendingCount = decisions.filter((decision) => decision.status === 'pending').length;
  const approvedCount = decisions.filter((decision) => decision.status === 'approved').length;
  const deferredCount = decisions.filter((decision) => decision.status === 'deferred').length;
  const cancelledCount = decisions.filter((decision) => decision.status === 'cancelled').length;
  const latestTitle = latestDecisionTitle(decisions);

  if (pendingCount > 0) {
    return {
      tone: 'blocking',
      pendingCount,
      approvedCount,
      deferredCount,
      cancelledCount,
      blockingCount: pendingCount,
      latestDecisionTitle: latestTitle,
      effectLabel: '待拍板阻断',
      effectDetail: `仍有 ${pendingCount} 个待决策事项，完成或切换前需要用户拍板。`,
      requiresUserAction: true,
    };
  }

  if (deferredCount > 0) {
    return {
      tone: 'deferred',
      pendingCount,
      approvedCount,
      deferredCount,
      cancelledCount,
      blockingCount: 0,
      latestDecisionTitle: latestTitle,
      effectLabel: '存在延后拍板',
      effectDetail: `有 ${deferredCount} 个决策被延后，完成前应确认是否仍影响范围。`,
      requiresUserAction: true,
    };
  }

  if (cancelledCount > 0) {
    return {
      tone: 'cancelled',
      pendingCount,
      approvedCount,
      deferredCount,
      cancelledCount,
      blockingCount: 0,
      latestDecisionTitle: latestTitle,
      effectLabel: '拍板已取消',
      effectDetail: `有 ${cancelledCount} 个决策被取消，不应继续按被取消的分支推进。`,
      requiresUserAction: false,
    };
  }

  if (approvedCount > 0) {
    return {
      tone: 'accepted',
      pendingCount,
      approvedCount,
      deferredCount,
      cancelledCount,
      blockingCount: 0,
      latestDecisionTitle: latestTitle,
      effectLabel: '拍板已通过',
      effectDetail: `已有 ${approvedCount} 个决策通过，可作为收尾依据。`,
      requiresUserAction: false,
    };
  }

  return {
    tone: 'none',
    pendingCount,
    approvedCount,
    deferredCount,
    cancelledCount,
    blockingCount: 0,
    latestDecisionTitle: null,
    effectLabel: '无待决策',
    effectDetail: '没有关联决策事项。',
    requiresUserAction: false,
  };
}
