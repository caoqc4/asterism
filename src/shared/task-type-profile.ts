import type { TaskExecutionType } from './types/task.js';
export type { TaskExecutionType } from './types/task.js';

export type TaskOwner = 'user' | 'system';

export type TaskVisibility = 'visible' | 'hidden';

export type TaskTypeProfile = {
  primaryType: TaskExecutionType;
  facets: TaskExecutionType[];
  owner: TaskOwner;
  visibility: TaskVisibility;
};

export function normalizeTaskTypeFacets(
  facets: TaskExecutionType[] | undefined,
  primaryType: TaskExecutionType,
): TaskExecutionType[] {
  const ordered: TaskExecutionType[] = [primaryType];
  for (const facet of facets ?? []) {
    if (!ordered.includes(facet)) ordered.push(facet);
  }
  return ordered;
}

export function buildTaskTypeProfile(
  primaryType: TaskExecutionType,
  facets: TaskExecutionType[] = [],
  options: Partial<Pick<TaskTypeProfile, 'owner' | 'visibility'>> = {},
): TaskTypeProfile {
  return {
    primaryType,
    facets: normalizeTaskTypeFacets(facets, primaryType),
    owner: options.owner ?? 'user',
    visibility: options.visibility ?? 'visible',
  };
}

export function inferTaskExecutionType(title: string): TaskExecutionType {
  const normalized = title.toLowerCase();
  if (/每(日|天|周|月)|daily|weekly|monthly|定期|定时|周期/.test(normalized)) return 'scheduled';
  if (/收到|当.+时|触发|监听|监控|邮件|gmail|webhook|event/.test(normalized)) return 'event';
  if (/常设|常规|日常|长期|持续|运营|维护|管理|知识库|笔记|routine|ongoing|evergreen/.test(normalized)) return 'routine';
  if (/项目|开发|小程序|软件|应用|app|上线|重构|完整|方案|计划|campaign|project/.test(normalized)) return 'project';
  return 'simple';
}

export function inferTaskTypeProfile(title: string): TaskTypeProfile {
  const normalized = title.toLowerCase();
  const hasProject = /项目|开发|小程序|软件|应用|app|上线|重构|完整|方案|计划|campaign|project/.test(normalized);
  const hasScheduled = /每(日|天|周|月)|daily|weekly|monthly|定期|定时|周期|早报|日报|周报|月报/.test(normalized);
  const hasEvent = /收到|当.+时|触发|监听|监控|邮件|gmail|webhook|event|更新时|有新/.test(normalized);
  const hasRoutine = /常设|常规|日常|长期|持续|运营|维护|管理|知识库|笔记|资讯|新闻|信息跟踪|订阅|routine|ongoing|evergreen/.test(
    normalized,
  );

  const primaryType: TaskExecutionType = hasProject
    ? 'project'
    : hasRoutine
      ? 'routine'
      : hasScheduled
        ? 'scheduled'
        : hasEvent
          ? 'event'
          : 'simple';
  const facets: TaskExecutionType[] = [];
  if (hasRoutine) facets.push('routine');
  if (hasProject) facets.push('project');
  if (hasScheduled) facets.push('scheduled');
  if (hasEvent) facets.push('event');
  return buildTaskTypeProfile(primaryType, facets);
}
