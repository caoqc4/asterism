export type TaskHierarchyState = string | null | undefined;

export type TaskHierarchyNode = {
  id: string;
  title: string;
  type?: string | null;
  state?: TaskHierarchyState;
  status?: TaskHierarchyState;
  parentTaskId?: string | null;
  childTaskIds?: string[];
  blockedByTaskId?: string | null;
  activeDependency?: {
    blockedByTaskId?: string | null;
  } | null;
  updatedAt?: string | null;
  updatedAtIso?: string | null;
};

const LEGACY_PHASE_FOLLOWUP_PREFIX = /^(拆解下一步|实现调整|验收回归)：(.+)$/;

function comparableUpdatedAt(task: TaskHierarchyNode): string {
  return task.updatedAtIso ?? task.updatedAt ?? '';
}

function isClosedTask(task: TaskHierarchyNode): boolean {
  return task.status === 'done' || task.state === 'completed' || task.state === 'archived';
}

function compactTitle(value: string): string {
  return value.replace(/[\s:：,，.。/\\|()[\]（）【】_-]+/g, '').trim();
}

function projectKeyword(value: string): string {
  return compactTitle(value).replace(/^(开发|实现|建设|搭建|制作|设计|优化|测试|上线|发布|完成|推进)/, '');
}

function dependencyUpstreamTaskId(task: TaskHierarchyNode): string | null {
  return task.blockedByTaskId ?? task.activeDependency?.blockedByTaskId ?? null;
}

function taskLooksConnectedToProjectWork<T extends TaskHierarchyNode>(
  task: T,
  allTasks: T[],
  projectKey: string,
): boolean {
  const upstreamTaskId = dependencyUpstreamTaskId(task);
  const upstreamTask = upstreamTaskId ? allTasks.find((candidate) => candidate.id === upstreamTaskId) : null;
  const downstreamTask = allTasks.find((candidate) => dependencyUpstreamTaskId(candidate) === task.id);

  return Boolean(
    upstreamTask?.title && compactTitle(upstreamTask.title).includes(projectKey)
    || downstreamTask?.title && compactTitle(downstreamTask.title).includes(projectKey),
  );
}

export function legacyPhaseFollowupParentForTask<T extends TaskHierarchyNode>(task: T, allTasks: T[]): T | null {
  if (task.parentTaskId) return null;
  const match = LEGACY_PHASE_FOLLOWUP_PREFIX.exec(task.title.trim());
  const parentTitle = match?.[2]?.trim();
  if (!parentTitle) return null;
  return allTasks.find((candidate) => (
    candidate.id !== task.id
    && candidate.type === 'project'
    && !candidate.parentTaskId
    && candidate.title.trim() === parentTitle
  )) ?? null;
}

export function inferredProjectParentForTask<T extends TaskHierarchyNode>(task: T, allTasks: T[]): T | null {
  if (task.parentTaskId) return null;
  const taskTitle = compactTitle(task.title);
  if (!taskTitle) return null;

  return allTasks.find((candidate) => {
    if (candidate.id === task.id || candidate.parentTaskId || isClosedTask(candidate)) return false;
    const key = projectKeyword(candidate.title);
    if (key.length < 2 || !taskTitle.includes(key)) return false;
    return taskLooksConnectedToProjectWork(task, allTasks, key);
  }) ?? null;
}

export function effectiveParentTaskId<T extends TaskHierarchyNode>(task: T, allTasks: T[]): string | null {
  if (task.parentTaskId) return task.parentTaskId;
  const parentSideLink = allTasks.find((candidate) => (
    candidate.id !== task.id
    && (candidate.childTaskIds ?? []).includes(task.id)
  ));
  return parentSideLink?.id
    ?? legacyPhaseFollowupParentForTask(task, allTasks)?.id
    ?? inferredProjectParentForTask(task, allTasks)?.id
    ?? null;
}

export function isTopLevelTask<T extends TaskHierarchyNode>(task: T, allTasks: T[]): boolean {
  return !effectiveParentTaskId(task, allTasks);
}

export function orderedTaskChildren<T extends TaskHierarchyNode>(parent: T, allTasks: T[]): T[] {
  const childIds = parent.childTaskIds ?? [];
  const childIdSet = new Set(childIds);
  const children = allTasks.filter((candidate) => (
    childIdSet.has(candidate.id)
    || effectiveParentTaskId(candidate, allTasks) === parent.id
  ));
  if (childIds.length === 0) {
    return children.sort((a, b) => comparableUpdatedAt(a).localeCompare(comparableUpdatedAt(b)));
  }
  const childById = new Map(children.map((child) => [child.id, child]));
  const ordered = childIds
    .map((id) => childById.get(id))
    .filter((child): child is T => Boolean(child));
  const known = new Set(ordered.map((child) => child.id));
  const unlisted = children
    .filter((child) => !known.has(child.id))
    .sort((a, b) => comparableUpdatedAt(a).localeCompare(comparableUpdatedAt(b)));
  return [...ordered, ...unlisted];
}

export function orderedChildrenForTask<T extends TaskHierarchyNode>(task: T, allTasks: T[]): T[] {
  return task.type === 'project'
    ? orderedTaskChildren(task, allTasks)
    : allTasks
      .filter((candidate) => effectiveParentTaskId(candidate, allTasks) === task.id)
      .sort((a, b) => comparableUpdatedAt(a).localeCompare(comparableUpdatedAt(b)));
}

export function findNextOpenChildAfter<T extends TaskHierarchyNode>(
  task: T,
  allTasks: T[],
): { nextTask: T | null; parentTask: T | null } {
  const parentTaskId = effectiveParentTaskId(task, allTasks);
  if (!parentTaskId) return { nextTask: null, parentTask: null };
  const parentTask = allTasks.find((candidate) => candidate.id === parentTaskId) ?? null;
  if (!parentTask) return { nextTask: null, parentTask: null };
  const siblings = orderedTaskChildren(parentTask, allTasks);
  const currentIndex = siblings.findIndex((candidate) => candidate.id === task.id);
  if (currentIndex === -1) return { nextTask: null, parentTask };
  const nextTask = siblings
    .slice(currentIndex + 1)
    .find((candidate) => candidate.id !== task.id && !isClosedTask(candidate)) ?? null;
  return { nextTask, parentTask };
}
