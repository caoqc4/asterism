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

function latestDecisionTitle(decisions: DecisionRecord[]): string | null {
  const latest = [...decisions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return latest?.title ?? null;
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
