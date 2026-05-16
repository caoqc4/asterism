import type { TaskListItemRecord, TaskState } from './types/task.js';

export type RuntimeTaskCaptureIssueCode =
  | 'missing_title'
  | 'duplicate_open_task'
  | 'generic_title'
  | 'generic_child_title'
  | 'generic_phase_template'
  | 'child_title_matches_parent';

export type RuntimeTaskCaptureIssue = {
  code: RuntimeTaskCaptureIssueCode;
  message: string;
  matchedTaskId?: string | null;
  matchedTaskTitle?: string | null;
};

export type RuntimeTaskCaptureEvaluation = {
  allowed: boolean;
  summary: string;
  issues: RuntimeTaskCaptureIssue[];
};

type ExistingTask = Pick<TaskListItemRecord, 'id' | 'title' | 'state'> & {
  parentTaskId?: string | null;
};

const CLOSED_STATES = new Set<TaskState>(['completed', 'archived']);
const GENERIC_CAPTURE_TITLE_PATTERN = /^(下一步|后续任务|继续|推进|处理|实现|优化|调整|检查|评估|设计|开发|修复|完成|todo|task)$/i;
const GENERIC_CHILD_TITLE_PATTERN = /^(拆解下一步|实现调整|验收回归|下一步|后续任务|执行任务|实现任务|验收任务)(：|:|\s|$)/i;

function normalizeTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[：:，,。.、\s_-]+/g, '');
}

function titleSimilarity(a: string, b: string): number {
  const left = new Set(Array.from(a));
  const right = new Set(Array.from(b));
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / new Set([...left, ...right]).size;
}

function isLikelyDuplicateTitle(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4) return false;
  return titleSimilarity(a, b) >= 0.9;
}

function isOpenTask(task: ExistingTask): boolean {
  return !CLOSED_STATES.has(task.state);
}

function issue(params: RuntimeTaskCaptureIssue): RuntimeTaskCaptureIssue {
  return params;
}

export function evaluateRuntimeTaskCapture(params: {
  title: string;
  summary?: string | null;
  existingTasks?: ExistingTask[];
  parentTaskId?: string | null;
}): RuntimeTaskCaptureEvaluation {
  const title = params.title.trim();
  const summary = params.summary?.trim() ?? '';
  const issues: RuntimeTaskCaptureIssue[] = [];

  if (!title) {
    issues.push(issue({
      code: 'missing_title',
      message: '任务标题为空，不能捕获为任务。',
    }));
  }

  const normalizedTitle = normalizeTitle(title);
  const targetParentTaskId = params.parentTaskId ?? null;
  if (normalizedTitle) {
    const parentTask = targetParentTaskId
      ? (params.existingTasks ?? []).find((task) => task.id === targetParentTaskId) ?? null
      : null;
    const normalizedParentTitle = parentTask ? normalizeTitle(parentTask.title) : '';

    const duplicate = (params.existingTasks ?? [])
      .filter(isOpenTask)
      .find((task) => (
        isLikelyDuplicateTitle(normalizeTitle(task.title), normalizedTitle)
        && (task.parentTaskId ?? null) === targetParentTaskId
      ));

    if (duplicate) {
      issues.push(issue({
        code: 'duplicate_open_task',
        message: `已有未完成任务「${duplicate.title}」，不应重复捕获同名任务。`,
        matchedTaskId: duplicate.id,
        matchedTaskTitle: duplicate.title,
      }));
    }

    if (!summary && GENERIC_CAPTURE_TITLE_PATTERN.test(title)) {
      issues.push(issue({
        code: 'generic_title',
        message: '任务标题过于泛化，缺少对象、交付物或验收边界。',
      }));
    }

    if (GENERIC_CHILD_TITLE_PATTERN.test(title)) {
      issues.push(issue({
        code: targetParentTaskId ? 'generic_child_title' : 'generic_phase_template',
        message: targetParentTaskId
          ? '子任务标题像阶段模板，不应作为真实子任务创建。请先交接到已有子任务，或提供具体独立目标和验收边界。'
          : '任务标题像阶段模板，不应作为真实任务创建。请先交接到已有任务，或提供具体独立目标和验收边界。',
      }));
    }

    if (targetParentTaskId && normalizedParentTitle && normalizedTitle === normalizedParentTitle) {
      issues.push(issue({
        code: 'child_title_matches_parent',
        message: `子任务标题与父任务「${parentTask?.title ?? '当前父任务'}」相同，缺少独立边界。`,
        matchedTaskId: parentTask?.id,
        matchedTaskTitle: parentTask?.title,
      }));
    }
  }

  return {
    allowed: issues.length === 0,
    issues,
    summary: issues.length
      ? `任务捕获暂不能继续：${issues[0]?.message ?? '存在阻断问题。'}`
      : '任务捕获通过重复和边界检查。',
  };
}
