import type { AgentRuntimeVerifierDecision } from './agent-runtime-verifier.js';
import type { RunDetailRecord, RunVerificationRecord, RunVerificationTone } from './types/run.js';

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

export type BuildApiVerifierShadowSampleOptions = {
  requireAgentCliInstruction?: boolean;
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

export function buildApiVerifierShadowSampleFromRunDetail(
  detail: RunDetailRecord,
  options: BuildApiVerifierShadowSampleOptions = {},
): ApiVerifierShadowSample | null {
  if (options.requireAgentCliInstruction !== false && !isAgentCliRun(detail)) return null;
  const verifications = detail.verifications ?? [];
  const lightweight = selectRunVerification(verifications, detail.id, 'lightweight_rule_engine');
  const api = selectRunVerification(verifications, detail.id, 'ai_verifier');
  if (!lightweight || !api) return null;

  const apiOutputValid = isApiVerifierOutputValid(api);
  return {
    apiDecision: apiOutputValid ? verificationDecision(api.tone) : null,
    apiOutputValid,
    createdAtIso: latestIso([detail.updatedAt, lightweight.updatedAt, api.updatedAt]),
    disagreementInspectable: apiOutputValid
      ? isDisagreementInspectable(lightweight, api)
      : true,
    id: `${detail.id}:api_verifier_shadow`,
    kinds: classifyShadowRunKinds(detail, lightweight),
    lightweightDecision: verificationDecision(lightweight.tone),
  };
}

function rate(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function selectRunVerification(
  verifications: RunVerificationRecord[],
  runId: string,
  source: RunVerificationRecord['source'],
): RunVerificationRecord | null {
  return verifications.find((item) => (
    item.source === source
    && item.targetType === 'run'
    && item.targetId === runId
  )) ?? null;
}

function verificationDecision(tone: RunVerificationTone): AgentRuntimeVerifierDecision {
  if (tone === 'fail') return 'failed';
  if (tone === 'warn' || tone === 'pending') return 'needs_evidence';
  return 'accept_for_review';
}

function isAgentCliRun(detail: RunDetailRecord): boolean {
  return /^Agent CLI\b/.test(detail.instructions ?? '')
    || (detail.steps ?? []).some((step) => /^Agent CLI\b/.test(step.title));
}

function isApiVerifierOutputValid(record: RunVerificationRecord): boolean {
  return !/(schema|structured|invalid|unparsable|partial|结构化|无效|解析失败|不完整)/i.test([
    record.label,
    record.detail,
  ].join('\n'));
}

function isDisagreementInspectable(
  lightweight: RunVerificationRecord,
  api: RunVerificationRecord,
): boolean {
  return Boolean(lightweight.detail.trim() && api.detail.trim());
}

function classifyShadowRunKinds(
  detail: RunDetailRecord,
  lightweight: RunVerificationRecord,
): ApiVerifierShadowRunKind[] {
  const kinds: ApiVerifierShadowRunKind[] = [];
  if (detail.status === 'completed' && isAgentCliRun(detail)) kinds.push('successful_agent_cli');
  if (detail.status === 'failed' && isAgentCliRun(detail)) kinds.push('failed_or_cancelled_agent_cli');
  if (
    lightweight.tone === 'warn'
    || /missing|缺少|缺证据|无证据|no terminal output/i.test(`${lightweight.label}\n${lightweight.detail}`)
  ) {
    kinds.push('missing_evidence');
  }
  if (hasTaskGoalConditions(detail)) kinds.push('task_goal_conditions');
  if (detail.taskMemoryGuidance?.outcome === 'pending') kinds.push('pending_task_memory');
  return uniqueKinds(kinds.length ? kinds : ['successful_agent_cli']);
}

function hasTaskGoalConditions(detail: RunDetailRecord): boolean {
  return (detail.steps ?? []).some((step) => (
    /目标契约|Run Goal Contract|Agent CLI 目标契约/i.test(step.title)
    && /completionConditions\s*[=:]\s*(?!0\b)|completion conditions|完成条件|验收条件/i.test(`${step.input ?? ''}\n${step.output ?? ''}`)
  ));
}

function latestIso(values: string[]): string {
  return values.slice().sort((left, right) => left.localeCompare(right)).at(-1) ?? new Date(0).toISOString();
}

function uniqueKinds(kinds: ApiVerifierShadowRunKind[]): ApiVerifierShadowRunKind[] {
  return [...new Set(kinds)];
}
