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
          message: `子任务「${child.title}」缺少指向父任务「${parent.title}」的 parentTaskId。`,
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
