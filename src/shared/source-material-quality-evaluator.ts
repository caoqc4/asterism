import type { SourceContextKind, SourceContextRole, SourceContextStatus } from './types/source-context.js';

export type SourceMaterialQualityDecision = 'include' | 'caution' | 'exclude';

export type SourceMaterialQualityReason =
  | 'archived'
  | 'duplicate'
  | 'sensitive'
  | 'missing_trace'
  | 'low_credibility'
  | 'stable_reference'
  | 'key_source'
  | 'traceable'
  | 'ordinary_note';

export type SourceMaterialCredibility = 'verified' | 'unknown' | 'low';

export type SourceMaterialQualityEvaluation = {
  decision: SourceMaterialQualityDecision;
  reason: SourceMaterialQualityReason;
  traceable: boolean;
  credibility: SourceMaterialCredibility;
  duplicate: boolean;
  sensitive: boolean;
  summary: string;
};

export type SourceMaterialQualityInput = {
  kind?: SourceContextKind | string | null;
  sourceRole?: SourceContextRole | null;
  status?: SourceContextStatus | string | null;
  title?: string | null;
  uri?: string | null;
  content?: string | null;
  note?: string | null;
  isKey?: boolean;
  isDuplicate?: boolean;
  containsSensitiveData?: boolean;
  credibility?: SourceMaterialCredibility | null;
  selected?: boolean;
};

const SENSITIVE_PATTERN = /api[_ -]?key|secret|password|token|credential|私钥|密码|令牌|凭证/i;

function label(input: SourceMaterialQualityInput): string {
  return input.title?.trim() || '来源材料';
}

function hasTrace(input: SourceMaterialQualityInput): boolean {
  return Boolean(input.selected || input.uri?.trim() || input.note?.trim() || input.sourceRole === 'stable_reference');
}

function credibilityFromInput(input: SourceMaterialQualityInput): SourceMaterialCredibility {
  if (input.credibility) return input.credibility;
  if (input.sourceRole === 'stable_reference' || input.kind === 'issue' || input.kind === 'pr') return 'verified';
  if (input.uri?.trim()) return 'unknown';
  return 'unknown';
}

function hasSensitiveData(input: SourceMaterialQualityInput): boolean {
  if (input.containsSensitiveData) return true;
  return SENSITIVE_PATTERN.test([input.title, input.uri, input.content, input.note].filter(Boolean).join('\n'));
}

export function evaluateSourceMaterialQuality(input: SourceMaterialQualityInput): SourceMaterialQualityEvaluation {
  const title = label(input);
  const duplicate = Boolean(input.isDuplicate);
  const sensitive = hasSensitiveData(input);
  const traceable = hasTrace(input);
  const credibility = credibilityFromInput(input);

  if (input.status === 'archived') {
    return result({
      decision: 'exclude',
      reason: 'archived',
      traceable,
      credibility,
      duplicate,
      sensitive,
      summary: `${title} 已归档，不应作为新的执行依据。`,
    });
  }

  if (duplicate) {
    return result({
      decision: 'exclude',
      reason: 'duplicate',
      traceable,
      credibility,
      duplicate,
      sensitive,
      summary: `${title} 与已有来源重复，不应重复写入任务上下文。`,
    });
  }

  if (sensitive) {
    return result({
      decision: 'caution',
      reason: 'sensitive',
      traceable,
      credibility,
      duplicate,
      sensitive,
      summary: `${title} 可能包含敏感信息，纳入上下文前应确认可见范围。`,
    });
  }

  if (!traceable) {
    return result({
      decision: 'caution',
      reason: 'missing_trace',
      traceable,
      credibility,
      duplicate,
      sensitive,
      summary: `${title} 缺少 URL、来源说明或稳定参考标记，后续复核成本较高。`,
    });
  }

  if (credibility === 'low') {
    return result({
      decision: 'caution',
      reason: 'low_credibility',
      traceable,
      credibility,
      duplicate,
      sensitive,
      summary: `${title} 来源可信度较低，使用前应寻找佐证。`,
    });
  }

  if (input.selected) {
    return result({
      decision: 'include',
      reason: 'traceable',
      traceable,
      credibility,
      duplicate,
      sensitive,
      summary: `${title} 被显式选中，且没有触发重复或敏感信息拦截。`,
    });
  }

  if (input.sourceRole === 'stable_reference') {
    return result({
      decision: 'include',
      reason: 'stable_reference',
      traceable,
      credibility,
      duplicate,
      sensitive,
      summary: `${title} 是稳定参考材料，且具备可追溯上下文。`,
    });
  }

  if (input.isKey) {
    return result({
      decision: 'include',
      reason: 'key_source',
      traceable,
      credibility,
      duplicate,
      sensitive,
      summary: `${title} 是关键来源，且具备基本追溯信息。`,
    });
  }

  return result({
    decision: input.kind === 'note' ? 'caution' : 'include',
    reason: input.kind === 'note' ? 'ordinary_note' : 'traceable',
    traceable,
    credibility,
    duplicate,
    sensitive,
    summary: input.kind === 'note'
      ? `${title} 是普通备注来源，应只在确实有恢复价值时纳入。`
      : `${title} 具备基本追溯信息，可以作为任务上下文来源。`,
  });
}

function result(params: Omit<SourceMaterialQualityEvaluation, 'duplicate' | 'sensitive'> & {
  duplicate: boolean;
  sensitive: boolean;
}): SourceMaterialQualityEvaluation {
  return {
    decision: params.decision,
    reason: params.reason,
    traceable: params.traceable,
    credibility: params.credibility,
    duplicate: params.duplicate,
    sensitive: params.sensitive,
    summary: params.summary,
  };
}
