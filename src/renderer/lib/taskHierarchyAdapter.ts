import { orderedTaskChildren, type TaskHierarchyNode } from '@shared/task-hierarchy';
import type { TaskExecutionType, TaskListItemRecord, TaskRecord } from '@shared/types/task';
import { getTaskAttributes, loadTaskAttributes, type TaskAttributeRecord } from './taskAttributes';

export type TaskHierarchyRecord = TaskListItemRecord & TaskHierarchyNode;
type TaskHierarchyAuthorityRecord = Pick<TaskRecord, 'taskType' | 'taskFacets' | 'parentTaskId' | 'childTaskIds'>;

export function authoritativeTaskType(
  task: TaskHierarchyAuthorityRecord,
  attrs: TaskAttributeRecord | null | undefined,
): TaskExecutionType | null {
  return task.taskType ?? attrs?.type ?? null;
}

export function authoritativeTaskFacets(
  task: TaskHierarchyAuthorityRecord,
  attrs: TaskAttributeRecord | null | undefined,
): TaskExecutionType[] | null {
  return task.taskFacets !== undefined ? task.taskFacets : attrs?.facets ?? null;
}

export function authoritativeParentTaskId(
  task: TaskHierarchyAuthorityRecord,
  attrs: TaskAttributeRecord | null | undefined,
): string | null {
  return task.parentTaskId !== undefined ? task.parentTaskId ?? null : attrs?.parentTaskId ?? null;
}

export function authoritativeChildTaskIds(
  task: TaskHierarchyAuthorityRecord,
  attrs: TaskAttributeRecord | null | undefined,
): string[] {
  return task.childTaskIds !== undefined ? task.childTaskIds ?? [] : attrs?.childTaskIds ?? [];
}

export function taskHierarchyNodesFromList(
  tasks: TaskListItemRecord[],
  attrsByTaskId: Record<string, TaskAttributeRecord | null | undefined> = loadTaskAttributes(),
): TaskHierarchyRecord[] {
  return tasks.map((task) => {
    const attrs = attrsByTaskId[task.id] ?? null;
    return {
      ...task,
      type: authoritativeTaskType(task, attrs) ?? 'simple',
      parentTaskId: authoritativeParentTaskId(task, attrs),
      childTaskIds: authoritativeChildTaskIds(task, attrs),
    };
  });
}

export function hierarchyParentNodeForTask(
  task: TaskListItemRecord,
  attrs: TaskAttributeRecord | null = getTaskAttributes(task.id),
): TaskHierarchyNode {
  return {
    id: task.id,
    title: task.title,
    type: authoritativeTaskType(task, attrs) ?? 'simple',
    state: task.state,
    parentTaskId: authoritativeParentTaskId(task, attrs),
    childTaskIds: authoritativeChildTaskIds(task, attrs),
    updatedAt: task.updatedAt,
  };
}

export function orderedChildRecordsForTask(
  task: TaskListItemRecord,
  tasks: TaskListItemRecord[],
  attrsByTaskId: Record<string, TaskAttributeRecord | null | undefined> = loadTaskAttributes(),
): TaskListItemRecord[] {
  const taskById = new Map(tasks.map((candidate) => [candidate.id, candidate]));
  const attrs = attrsByTaskId[task.id] ?? null;
  const parent = hierarchyParentNodeForTask(task, attrs);
  return orderedTaskChildren<TaskHierarchyNode>(parent, taskHierarchyNodesFromList(tasks, attrsByTaskId))
    .map((child) => taskById.get(child.id))
    .filter((child): child is TaskListItemRecord => Boolean(child));
}
