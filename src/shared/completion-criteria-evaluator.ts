import type { CompletionCriteriaRecord } from './types/completion-criteria.js';

export type CompletionCriteriaIssueCode =
  | 'empty'
  | 'generic_acceptance'
  | 'duplicate_open_criteria';

export type CompletionCriteriaIssue = {
  code: CompletionCriteriaIssueCode;
  message: string;
  matchedCriteriaId?: string | null;
  matchedCriteriaText?: string | null;
};

export type CompletionCriteriaEvaluation = {
  allowed: boolean;
  summary: string;
  issues: CompletionCriteriaIssue[];
};

type ExistingCompletionCriteria = Pick<CompletionCriteriaRecord, 'id' | 'text' | 'status'>;

const GENERIC_ACCEPTANCE_PATTERN = /^(完成后能明确验收。?|完成即可。?|待确认。?|验收通过。?|done|complete)$/i;

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[：:，,。.、\s_-]+/g, '');
}

export function evaluateCompletionCriteria(params: {
  text: string;
  existingCriteria?: ExistingCompletionCriteria[];
  excludeCriteriaId?: string | null;
}): CompletionCriteriaEvaluation {
  const text = params.text.trim();
  const issues: CompletionCriteriaIssue[] = [];

  if (!text) {
    issues.push({
      code: 'empty',
      message: '完成标准为空，不能保存。',
    });
  }

  if (text && GENERIC_ACCEPTANCE_PATTERN.test(text)) {
    issues.push({
      code: 'generic_acceptance',
      message: '完成标准过于泛化，需要可验证的验收条件。',
    });
  }

  const normalizedText = normalizeText(text);
  if (normalizedText) {
    const duplicate = (params.existingCriteria ?? [])
      .filter((criteria) => criteria.id !== params.excludeCriteriaId)
      .find((criteria) => criteria.status === 'open' && normalizeText(criteria.text) === normalizedText);
    if (duplicate) {
      issues.push({
        code: 'duplicate_open_criteria',
        message: `已有未满足完成标准「${duplicate.text}」，不应重复创建。`,
        matchedCriteriaId: duplicate.id,
        matchedCriteriaText: duplicate.text,
      });
    }
  }

  return {
    allowed: issues.length === 0,
    issues,
    summary: issues.length
      ? `完成标准暂不能保存：${issues[0]?.message ?? '存在阻断问题。'}`
      : '完成标准通过可验证性检查。',
  };
}
