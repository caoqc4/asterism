export type SelectedFileRelevanceDecision = 'include' | 'caution' | 'exclude';
export type SelectedFileRelevanceReason =
  | 'task_record'
  | 'task_md'
  | 'selected_file'
  | 'empty_preview'
  | 'archived_path'
  | 'generated_output';

export type SelectedFileRelevanceEvaluation = {
  decision: SelectedFileRelevanceDecision;
  reason: SelectedFileRelevanceReason;
  summary: string;
};

export type SelectedFileRelevanceInput = {
  contentPreview?: string | null;
  kind?: string | null;
  path?: string | null;
};

export function evaluateSelectedFileRelevance(input: SelectedFileRelevanceInput): SelectedFileRelevanceEvaluation {
  const path = input.path?.trim() ?? '';
  const label = path || '当前选中文件';

  if (/^Archive\//i.test(path) || /\/Archive\//i.test(path)) {
    return {
      decision: 'exclude',
      reason: 'archived_path',
      summary: `${label} 位于归档路径，不应默认作为当前执行上下文。`,
    };
  }

  if (path === 'Task.md') {
    return {
      decision: 'include',
      reason: 'task_md',
      summary: 'Task.md 是当前任务主恢复文件，应纳入上下文。',
    };
  }

  if (path.startsWith('Task Records/')) {
    return {
      decision: 'include',
      reason: 'task_record',
      summary: `${label} 是任务记录，可用于恢复历史上下文。`,
    };
  }

  if (/AI|自检|执行摘要|generated|draft/i.test(label) || input.kind === 'ai_output') {
    return {
      decision: 'caution',
      reason: 'generated_output',
      summary: `${label} 看起来是生成内容，应带来源和验证边界使用。`,
    };
  }

  if (!input.contentPreview?.trim()) {
    return {
      decision: 'caution',
      reason: 'empty_preview',
      summary: `${label} 没有可用预览，执行前应读取或确认内容。`,
    };
  }

  return {
    decision: 'include',
    reason: 'selected_file',
    summary: `${label} 被显式选中，应纳入当前上下文。`,
  };
}
