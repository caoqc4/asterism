import type { TaskHierarchyNode } from './task-hierarchy.js';

export type TaskHierarchyConsistencyIssueCode =
  | 'duplicate_child_id'
  | 'missing_child_record'
  | 'missing_parent_record'
  | 'missing_parent_backlink'
  | 'missing_parent_child_link'
  | 'self_child'
  | 'child_listed_under_multiple_parents';

export type TaskHierarchyConsistencyIssue = {
  code: TaskHierarchyConsistencyIssueCode;
  taskId: string;
  relatedTaskId?: string | null;
  message: string;
};

export type TaskHierarchyConsistencyEvaluation = {
  consistent: boolean;
  issues: TaskHierarchyConsistencyIssue[];
  issueCount: number;
  summary: string;
};

export type TaskHierarchyRepairActionKind =
  | 'add_parent_child_link'
  | 'set_child_parent'
  | 'manual_review';

export type TaskHierarchyRepairAction = {
  kind: TaskHierarchyRepairActionKind;
  taskId: string;
  relatedTaskId?: string | null;
  safeToApply: boolean;
  reason: string;
};

export type TaskHierarchyRepairPlan = {
  canAutoApplyAll: boolean;
  actions: TaskHierarchyRepairAction[];
  safeActionCount: number;
  manualReviewCount: number;
  summary: string;
};

export type AppliedTaskHierarchyRepairResult = {
  before: TaskHierarchyRepairPlan;
  after: TaskHierarchyRepairPlan;
  appliedActionCount: number;
  skippedManualReviewCount: number;
  summary: string;
};

export type TaskHierarchyManualReviewReason =
  | 'conflicting_parentage'
  | 'missing_record'
  | 'self_reference'
  | 'duplicate_reference'
  | 'ambiguous_relationship';

export type TaskHierarchyManualReviewItem = {
  issue: TaskHierarchyConsistencyIssue;
  reason: TaskHierarchyManualReviewReason;
  decisionQuestion: string;
  recommendedResolution: string;
};

export type TaskHierarchyManualReviewPolicy = {
  required: boolean;
  items: TaskHierarchyManualReviewItem[];
  summary: string;
};

function issue(params: TaskHierarchyConsistencyIssue): TaskHierarchyConsistencyIssue {
  return params;
}

export function evaluateTaskHierarchyConsistency(
  tasks: TaskHierarchyNode[],
): TaskHierarchyConsistencyEvaluation {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const issues: TaskHierarchyConsistencyIssue[] = [];
  const listedParentByChildId = new Map<string, string>();

  for (const parent of tasks) {
    const seenChildIds = new Set<string>();

    for (const childId of parent.childTaskIds ?? []) {
      if (childId === parent.id) {
        issues.push(issue({
          code: 'self_child',
          taskId: parent.id,
          relatedTaskId: childId,
          message: `任务「${parent.title}」不能把自己列为子任务。`,
        }));
        continue;
      }

      if (seenChildIds.has(childId)) {
        issues.push(issue({
          code: 'duplicate_child_id',
          taskId: parent.id,
          relatedTaskId: childId,
          message: `任务「${parent.title}」重复列出了子任务 ${childId}。`,
        }));
        continue;
      }
      seenChildIds.add(childId);

      const previousParentId = listedParentByChildId.get(childId);
      if (previousParentId && previousParentId !== parent.id) {
        issues.push(issue({
          code: 'child_listed_under_multiple_parents',
          taskId: parent.id,
          relatedTaskId: childId,
          message: `子任务 ${childId} 被多个父任务列出。`,
        }));
      } else {
        listedParentByChildId.set(childId, parent.id);
      }

      const child = tasksById.get(childId);
      if (!child) {
        issues.push(issue({
          code: 'missing_child_record',
          taskId: parent.id,
          relatedTaskId: childId,
          message: `任务「${parent.title}」引用了不存在的子任务 ${childId}。`,
        }));
        continue;
      }

      if (child.parentTaskId !== parent.id) {
        issues.push(issue({
          code: 'missing_parent_backlink',
          taskId: child.id,
          relatedTaskId: parent.id,
          message: child.parentTaskId
            ? `子任务「${child.title}」已指向其他父任务，不能直接归到「${parent.title}」。`
            : `子任务「${child.title}」缺少指向父任务「${parent.title}」的 parentTaskId。`,
        }));
      }
    }
  }

  for (const child of tasks) {
    const parentTaskId = child.parentTaskId ?? null;
    if (!parentTaskId) continue;

    if (parentTaskId === child.id) {
      issues.push(issue({
        code: 'self_child',
        taskId: child.id,
        relatedTaskId: parentTaskId,
        message: `任务「${child.title}」不能把自己设为父任务。`,
      }));
      continue;
    }

    const parent = tasksById.get(parentTaskId);
    if (!parent) {
      issues.push(issue({
        code: 'missing_parent_record',
        taskId: child.id,
        relatedTaskId: parentTaskId,
        message: `任务「${child.title}」指向了不存在的父任务 ${parentTaskId}。`,
      }));
      continue;
    }

    if (!(parent.childTaskIds ?? []).includes(child.id)) {
      issues.push(issue({
        code: 'missing_parent_child_link',
        taskId: parent.id,
        relatedTaskId: child.id,
        message: `父任务「${parent.title}」没有列出子任务「${child.title}」。`,
      }));
    }
  }

  return {
    consistent: issues.length === 0,
    issues,
    issueCount: issues.length,
    summary: issues.length
      ? `任务层级存在 ${issues.length} 个一致性问题。`
      : '任务层级关系一致。',
  };
}

export function buildTaskHierarchyRepairPlan(tasks: TaskHierarchyNode[]): TaskHierarchyRepairPlan {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const listedParentByChildId = new Map<string, string>();
  for (const task of tasks) {
    for (const childTaskId of task.childTaskIds ?? []) {
      if (!listedParentByChildId.has(childTaskId)) {
        listedParentByChildId.set(childTaskId, task.id);
      }
    }
  }
  const evaluation = evaluateTaskHierarchyConsistency(tasks);
  const actions: TaskHierarchyRepairAction[] = evaluation.issues.map((item) => {
    const task = tasksById.get(item.taskId);
    const relatedTask = item.relatedTaskId ? tasksById.get(item.relatedTaskId) : null;

    if (item.code === 'missing_parent_child_link' && task && relatedTask) {
      const listedParentId = listedParentByChildId.get(relatedTask.id);
      if (listedParentId && listedParentId !== task.id) {
        return {
          kind: 'manual_review',
          taskId: item.taskId,
          relatedTaskId: item.relatedTaskId,
          safeToApply: false,
          reason: `子任务「${relatedTask.title}」已被其他父任务列出，需要人工确认唯一父任务。`,
        };
      }

      return {
        kind: 'add_parent_child_link',
        taskId: item.taskId,
        relatedTaskId: item.relatedTaskId,
        safeToApply: true,
        reason: `可把「${relatedTask.title}」加入父任务「${task.title}」的子任务列表。`,
      };
    }

    if (
      item.code === 'missing_parent_backlink'
      && task
      && relatedTask
      && !task.parentTaskId
    ) {
      return {
        kind: 'set_child_parent',
        taskId: item.taskId,
        relatedTaskId: item.relatedTaskId,
        safeToApply: true,
        reason: `可把「${task.title}」的父任务设为「${relatedTask.title}」。`,
      };
    }

    return {
      kind: 'manual_review',
      taskId: item.taskId,
      relatedTaskId: item.relatedTaskId,
      safeToApply: false,
      reason: item.message,
    };
  });
  const safeActionCount = actions.filter((item) => item.safeToApply).length;
  const manualReviewCount = actions.length - safeActionCount;

  return {
    canAutoApplyAll: actions.length > 0 && manualReviewCount === 0,
    actions,
    safeActionCount,
    manualReviewCount,
    summary: actions.length
      ? `可安全修复 ${safeActionCount} 项，需人工确认 ${manualReviewCount} 项。`
      : '任务层级关系一致，无需修复。',
  };
}

export function buildTaskHierarchyManualReviewPolicy(
  tasks: TaskHierarchyNode[],
): TaskHierarchyManualReviewPolicy {
  const plan = buildTaskHierarchyRepairPlan(tasks);
  const manualActions = plan.actions.filter((item) => !item.safeToApply);
  const issueByKey = new Map(
    evaluateTaskHierarchyConsistency(tasks).issues.map((item) => [
      `${item.code}:${item.taskId}:${item.relatedTaskId ?? ''}`,
      item,
    ]),
  );
  const items: TaskHierarchyManualReviewItem[] = manualActions.map((action) => {
    const issue = issueByKey.get(`missing_parent_child_link:${action.taskId}:${action.relatedTaskId ?? ''}`)
      ?? issueByKey.get(`missing_parent_backlink:${action.taskId}:${action.relatedTaskId ?? ''}`)
      ?? issueByKey.get(`child_listed_under_multiple_parents:${action.taskId}:${action.relatedTaskId ?? ''}`)
      ?? issueByKey.get(`duplicate_child_id:${action.taskId}:${action.relatedTaskId ?? ''}`)
      ?? issueByKey.get(`missing_child_record:${action.taskId}:${action.relatedTaskId ?? ''}`)
      ?? issueByKey.get(`missing_parent_record:${action.taskId}:${action.relatedTaskId ?? ''}`)
      ?? issueByKey.get(`self_child:${action.taskId}:${action.relatedTaskId ?? ''}`)
      ?? {
        code: 'missing_parent_child_link' as const,
        taskId: action.taskId,
        relatedTaskId: action.relatedTaskId,
        message: action.reason,
      };

    if (issue.code === 'missing_child_record' || issue.code === 'missing_parent_record') {
      return {
        issue,
        reason: 'missing_record',
        decisionQuestion: '缺失的任务记录是否应恢复，还是应移除这条层级引用？',
        recommendedResolution: '先确认缺失记录来源；无法恢复时再移除悬空引用。',
      };
    }

    if (issue.code === 'self_child') {
      return {
        issue,
        reason: 'self_reference',
        decisionQuestion: '这个任务是否被错误地指向了自己？',
        recommendedResolution: '移除自引用，并重新选择真实父任务或子任务。',
      };
    }

    if (issue.code === 'duplicate_child_id') {
      return {
        issue,
        reason: 'duplicate_reference',
        decisionQuestion: '重复的子任务引用是否只是重复写入？',
        recommendedResolution: '保留一条引用，删除重复项。',
      };
    }

    if (
      issue.code === 'child_listed_under_multiple_parents'
      || issue.code === 'missing_parent_backlink'
      || issue.code === 'missing_parent_child_link'
    ) {
      return {
        issue,
        reason: 'conflicting_parentage',
        decisionQuestion: '这个子任务唯一应该归属哪个父任务？',
        recommendedResolution: '确认唯一父任务后，同步 parentTaskId 与父任务 childTaskIds。',
      };
    }

    return {
      issue,
      reason: 'ambiguous_relationship',
      decisionQuestion: '这条层级关系应该保留、移动还是删除？',
      recommendedResolution: '人工确认任务关系后再执行维护。',
    };
  });

  return {
    required: items.length > 0,
    items,
    summary: items.length
      ? `有 ${items.length} 个层级关系需要人工确认。`
      : '没有需要人工确认的层级关系。',
  };
}
