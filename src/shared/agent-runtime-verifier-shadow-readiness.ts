import type { AgentRuntimeVerifierDecision } from './agent-runtime-verifier.js';

export type ApiVerifierShadowRunKind =
  | 'successful_agent_cli'
  | 'failed_or_cancelled_agent_cli'
  | 'missing_evidence'
  | 'task_goal_conditions'
  | 'pending_task_memory'
  | 'agent_api';

export type ApiVerifierShadowSample = {
  id: string;
  createdAtIso: string;
  kinds: ApiVerifierShadowRunKind[];
  lightweightDecision: AgentRuntimeVerifierDecision;
  apiDecision: AgentRuntimeVerifierDecision | null;
  apiOutputValid: boolean;
  disagreementInspectable: boolean;
};

export type ApiVerifierShadowReadinessThresholds = {
  minimumSampleCount: number;
  structuredValidityWindow: number;
  maxInvalidRate: number;
  maxDisagreementRate: number;
  requireAgentApiSamples: boolean;
};

export type ApiVerifierShadowReadiness = {
  ready: boolean;
  status: 'ready_for_assist' | 'not_ready';
  sampleCount: number;
  invalidCount: number;
  invalidRate: number;
  invalidInRecentWindow: number;
  disagreementCount: number;
  disagreementRate: number;
  uninspectableDisagreementCount: number;
  missingKinds: ApiVerifierShadowRunKind[];
  blockers: string[];
};

export const DEFAULT_API_VERIFIER_SHADOW_THRESHOLDS: ApiVerifierShadowReadinessThresholds = {
  maxDisagreementRate: 0.1,
  maxInvalidRate: 0.02,
  minimumSampleCount: 30,
  requireAgentApiSamples: false,
  structuredValidityWindow: 20,
};

const requiredCurrentKinds: ApiVerifierShadowRunKind[] = [
  'successful_agent_cli',
  'failed_or_cancelled_agent_cli',
  'missing_evidence',
  'task_goal_conditions',
  'pending_task_memory',
];

export function evaluateApiVerifierShadowReadiness(
  samples: ApiVerifierShadowSample[],
  thresholds: Partial<ApiVerifierShadowReadinessThresholds> = {},
): ApiVerifierShadowReadiness {
  const resolved = {
    ...DEFAULT_API_VERIFIER_SHADOW_THRESHOLDS,
    ...thresholds,
  };
  const sortedSamples = [...samples].sort((left, right) => left.createdAtIso.localeCompare(right.createdAtIso));
  const requiredKinds = resolved.requireAgentApiSamples
    ? [...requiredCurrentKinds, 'agent_api' as const]
    : requiredCurrentKinds;
  const presentKinds = new Set(sortedSamples.flatMap((sample) => sample.kinds));
  const missingKinds = requiredKinds.filter((kind) => !presentKinds.has(kind));
  const invalidCount = sortedSamples.filter((sample) => !sample.apiOutputValid).length;
  const invalidRate = rate(invalidCount, sortedSamples.length);
  const recentSamples = sortedSamples.slice(-resolved.structuredValidityWindow);
  const invalidInRecentWindow = recentSamples.filter((sample) => !sample.apiOutputValid).length;
  const disagreements = sortedSamples.filter((sample) => (
    sample.apiOutputValid
    && sample.apiDecision !== null
    && sample.apiDecision !== sample.lightweightDecision
  ));
  const disagreementCount = disagreements.length;
  const disagreementRate = rate(disagreementCount, sortedSamples.length);
  const uninspectableDisagreementCount = disagreements
    .filter((sample) => !sample.disagreementInspectable)
    .length;
  const blockers = [
    sortedSamples.length < resolved.minimumSampleCount
      ? `Need at least ${resolved.minimumSampleCount} shadow samples before changing verifier behavior.`
      : null,
    missingKinds.length
      ? `Missing representative samples: ${missingKinds.join(', ')}.`
      : null,
    invalidInRecentWindow > 0
      ? `Recent structured verifier window has ${invalidInRecentWindow} invalid sample(s).`
      : null,
    invalidRate > resolved.maxInvalidRate
      ? `Invalid output rate ${formatPercent(invalidRate)} exceeds ${formatPercent(resolved.maxInvalidRate)}.`
      : null,
    disagreementRate > resolved.maxDisagreementRate
      ? `Decision disagreement rate ${formatPercent(disagreementRate)} exceeds ${formatPercent(resolved.maxDisagreementRate)}.`
      : null,
    uninspectableDisagreementCount > 0
      ? `${uninspectableDisagreementCount} disagreement(s) are not inspectable from persisted evidence.`
      : null,
  ].filter((blocker): blocker is string => blocker !== null);

  return {
    blockers,
    disagreementCount,
    disagreementRate,
    invalidCount,
    invalidInRecentWindow,
    invalidRate,
    missingKinds,
    ready: blockers.length === 0,
    sampleCount: sortedSamples.length,
    status: blockers.length === 0 ? 'ready_for_assist' : 'not_ready',
    uninspectableDisagreementCount,
  };
}

function rate(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
