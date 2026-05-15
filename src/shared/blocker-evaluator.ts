export type BlockerIssueCode = 'missing_title';

export type BlockerIssue = {
  code: BlockerIssueCode;
  message: string;
};

export type BlockerEvaluation = {
  allowed: boolean;
  summary: string;
  issues: BlockerIssue[];
};

export function evaluateBlockerBoundary(params: {
  title?: string | null;
}): BlockerEvaluation {
  const title = params.title?.trim() ?? '';
  const issues: BlockerIssue[] = [];

  if (!title) {
    issues.push({
      code: 'missing_title',
      message: '阻塞项缺少标题，不能保存。',
    });
  }

  return {
    allowed: issues.length === 0,
    issues,
    summary: issues.length
      ? `阻塞项暂不能保存：${issues[0]?.message ?? '存在阻断问题。'}`
      : '阻塞项通过边界检查。',
  };
}
