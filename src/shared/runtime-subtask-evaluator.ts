import type { ProjectSubtaskDraft } from './types/ipc.js';
import type { TaskHierarchyNode } from './task-hierarchy.js';
import { effectiveParentTaskId } from './task-hierarchy.js';
import {
  isLikelyDuplicateTaskTitle,
  normalizeTaskTitle,
} from './task-title-identity.js';

export type RuntimeSubtaskDraftIssueSeverity =
  | 'error'
  | 'warning';

export type RuntimeSubtaskDraftIssueCode =
  | 'parent_has_children'
  | 'duplicate_title'
  | 'generic_phase_template'
  | 'missing_summary'
  | 'missing_acceptance'
  | 'too_close_to_parent'
  | 'unknown_dependency';

export type RuntimeSubtaskDraftIssue = {
  severity: RuntimeSubtaskDraftIssueSeverity;
  code: RuntimeSubtaskDraftIssueCode;
  title: string | null;
  message: string;
};

export type RuntimeSubtaskDraftEvaluation = {
  allowed: boolean;
  summary: string;
  issues: RuntimeSubtaskDraftIssue[];
  errorCount: number;
  warningCount: number;
};

const GENERIC_PHASE_TEMPLATE_PATTERN = /^(拆解下一步|实现调整|验收回归|下一步|后续任务|执行任务|实现任务|验收任务)(：|:|\s|$)/i;
const GENERIC_ACCEPTANCE_PATTERN = /^(完成后能明确验收。?|完成即可。?|待确认。?|验收通过。?|done|complete)$/i;

function textHasMeaning(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function taskIsOpen(task: TaskHierarchyNode): boolean {
  return task.state !== 'completed'
    && task.state !== 'archived'
    && task.status !== 'done';
}

function directChildrenForParent(parent: TaskHierarchyNode, allTasks: TaskHierarchyNode[]): TaskHierarchyNode[] {
  const childIds = new Set(parent.childTaskIds ?? []);
  return allTasks.filter((task) => (
    childIds.has(task.id)
    || effectiveParentTaskId(task, allTasks) === parent.id
  ));
}

function issue(
  severity: RuntimeSubtaskDraftIssueSeverity,
  code: RuntimeSubtaskDraftIssueCode,
  title: string | null,
  message: string,
): RuntimeSubtaskDraftIssue {
  return {
    severity,
    code,
    title,
    message,
  };
}

export function evaluateRuntimeSubtaskDraft(params: {
  parentTask: TaskHierarchyNode;
  proposedSubtasks: ProjectSubtaskDraft[];
  existingTasks?: TaskHierarchyNode[];
}): RuntimeSubtaskDraftEvaluation {
  const existingTasks = params.existingTasks ?? [];
  const existingChildren = directChildrenForParent(params.parentTask, existingTasks).filter(taskIsOpen);
  const issues: RuntimeSubtaskDraftIssue[] = [];

  if (existingChildren.length > 0) {
    issues.push(issue(
      'error',
      'parent_has_children',
      params.parentTask.title,
      `父任务已有 ${existingChildren.length} 个未完成子任务，应先推进或调整现有子任务，不应继续追加一批新的拆解结果。`,
    ));
  }

  const seenDraftTitles: Array<{ normalizedTitle: string; title: string }> = [];
  const existingTitles = existingTasks
    .filter((task) => task.id !== params.parentTask.id)
    .map((task) => ({
      normalizedTitle: normalizeTaskTitle(task.title),
      title: task.title,
    }));
  const parentTitle = normalizeTaskTitle(params.parentTask.title);
  const draftTitles = new Set<string>();

  params.proposedSubtasks.forEach((subtask) => {
    const title = subtask.title.trim();
    const normalizedTitle = normalizeTaskTitle(title);
    draftTitles.add(normalizedTitle);

    if (!normalizedTitle) {
      issues.push(issue('error', 'missing_summary', null, '子任务缺少标题。'));
      return;
    }

    const firstSeen = seenDraftTitles.find((item) => isLikelyDuplicateTaskTitle(item.title, title));
    if (firstSeen) {
      issues.push(issue('error', 'duplicate_title', title, `草稿中存在重复子任务：「${firstSeen.title}」和「${title}」。`));
    }
    seenDraftTitles.push({ normalizedTitle, title });

    const existingTitle = existingTitles.find((item) => isLikelyDuplicateTaskTitle(item.title, title))?.title;
    if (existingTitle) {
      issues.push(issue('error', 'duplicate_title', title, `已有任务「${existingTitle}」，不应重复创建同名子任务。`));
    }

    if (GENERIC_PHASE_TEMPLATE_PATTERN.test(title)) {
      issues.push(issue('error', 'generic_phase_template', title, '子任务标题像通用阶段模板，而不是围绕当前项目边界形成的独立工作块。'));
    }

    if (normalizedTitle === parentTitle || normalizedTitle.includes(parentTitle) || parentTitle.includes(normalizedTitle)) {
      issues.push(issue('error', 'too_close_to_parent', title, '子任务标题与父任务过于接近，缺少独立边界。'));
    }

    if (!textHasMeaning(subtask.summary) || normalizeTaskTitle(subtask.summary) === normalizedTitle) {
      issues.push(issue('error', 'missing_summary', title, '子任务需要说明独立目标或交付物，不能只重复标题。'));
    }

    if (!textHasMeaning(subtask.acceptanceCriteria) || GENERIC_ACCEPTANCE_PATTERN.test(subtask.acceptanceCriteria.trim())) {
      issues.push(issue('error', 'missing_acceptance', title, '子任务需要可验证的验收标准，不能使用泛化占位句。'));
    }
  });

  params.proposedSubtasks.forEach((subtask) => {
    const dependency = subtask.dependency?.trim();
    if (!dependency) return;
    const dependencyKey = normalizeTaskTitle(dependency);
    const knownDraft = Array.from(draftTitles).some((title) => dependencyKey.includes(title) || title.includes(dependencyKey));
    const knownExisting = existingTitles.some((item) => dependencyKey.includes(item.normalizedTitle) || item.normalizedTitle.includes(dependencyKey));
    if (!knownDraft && !knownExisting) {
      issues.push(issue('warning', 'unknown_dependency', subtask.title, `依赖「${dependency}」没有匹配到草稿或现有任务，创建前应确认依赖关系。`));
    }
  });

  const errorCount = issues.filter((item) => item.severity === 'error').length;
  const warningCount = issues.length - errorCount;
  const allowed = errorCount === 0;
  return {
    allowed,
    issues,
    errorCount,
    warningCount,
    summary: allowed
      ? warningCount > 0
        ? `子任务草稿可以创建，但有 ${warningCount} 条依赖或边界提醒。`
        : '子任务草稿通过创建前检查。'
      : `子任务草稿暂不能创建：${issues.find((item) => item.severity === 'error')?.message ?? '存在阻断问题。'}`,
  };
}
