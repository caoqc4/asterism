import { orderedTaskChildren, type TaskHierarchyNode } from '@shared/task-hierarchy';
import type { TaskListItemRecord } from '@shared/types/task';
import { getTaskAttributes, loadTaskAttributes, type TaskAttributeRecord } from './taskAttributes';

export type TaskHierarchyRecord = TaskListItemRecord & TaskHierarchyNode;

export function taskHierarchyNodesFromList(
  tasks: TaskListItemRecord[],
  attrsByTaskId: Record<string, TaskAttributeRecord | null | undefined> = loadTaskAttributes(),
): TaskHierarchyRecord[] {
  return tasks.map((task) => ({
    ...task,
    type: task.taskType && task.taskType !== 'simple' ? task.taskType : attrsByTaskId[task.id]?.type ?? task.taskType ?? 'simple',
    parentTaskId: task.parentTaskId ?? attrsByTaskId[task.id]?.parentTaskId ?? null,
    childTaskIds: (task.childTaskIds?.length ?? 0) > 0 ? task.childTaskIds ?? [] : attrsByTaskId[task.id]?.childTaskIds ?? [],
  }));
}

export function hierarchyParentNodeForTask(
  task: TaskListItemRecord,
  attrs: TaskAttributeRecord | null = getTaskAttributes(task.id),
): TaskHierarchyNode {
  return {
    id: task.id,
    title: task.title,
    type: task.taskType && task.taskType !== 'simple' ? task.taskType : attrs?.type ?? task.taskType ?? 'simple',
    state: task.state,
    parentTaskId: task.parentTaskId ?? attrs?.parentTaskId ?? null,
    childTaskIds: (task.childTaskIds?.length ?? 0) > 0 ? task.childTaskIds ?? [] : attrs?.childTaskIds ?? [],
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
