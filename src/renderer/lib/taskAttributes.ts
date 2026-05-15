export type TaskExecutionType = 'simple' | 'project' | 'scheduled' | 'event' | 'routine';

export type TaskOwner = 'user' | 'system';

export type TaskVisibility = 'visible' | 'hidden';

export type TaskTypeProfile = {
  primaryType: TaskExecutionType;
  facets: TaskExecutionType[];
  owner: TaskOwner;
  visibility: TaskVisibility;
};

export type TaskPlanningPrompt = {
  label: string;
  prompt: string;
};

export type TaskPlanningPromptSurface = 'capture' | 'panel';

export type TaskAttributeRecord = {
  taskId: string;
  type: TaskExecutionType;
  facets?: TaskExecutionType[];
  owner?: TaskOwner;
  visibility?: TaskVisibility;
  typeConfirmed?: boolean;
  parentTaskId: string | null;
  childTaskIds: string[];
  commitment: string | null;
  schedule: string | null;
  trigger: string | null;
  updatedAt: string;
};

const STORAGE_KEY = 'taskplane.taskAttributes.v1';

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeParse(value: string | null): Record<string, TaskAttributeRecord> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, TaskAttributeRecord>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadTaskAttributes(): Record<string, TaskAttributeRecord> {
  if (!canUseLocalStorage()) return {};
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

export function getTaskAttributes(taskId: string): TaskAttributeRecord | null {
  return loadTaskAttributes()[taskId] ?? null;
}

export function saveTaskAttributes(
  taskId: string,
  patch: Partial<Omit<TaskAttributeRecord, 'taskId' | 'updatedAt'>>,
): TaskAttributeRecord {
  const all = loadTaskAttributes();
  const existing = all[taskId];
  const type = patch.type ?? existing?.type ?? 'simple';
  const next: TaskAttributeRecord = {
    taskId,
    type,
    facets: normalizeTaskTypeFacets(patch.facets ?? existing?.facets, type),
    owner: patch.owner ?? existing?.owner ?? 'user',
    visibility: patch.visibility ?? existing?.visibility ?? 'visible',
    typeConfirmed: patch.typeConfirmed ?? (patch.type !== undefined ? true : existing?.typeConfirmed ?? false),
    parentTaskId: patch.parentTaskId !== undefined ? patch.parentTaskId ?? null : existing?.parentTaskId ?? null,
    childTaskIds: patch.childTaskIds ?? existing?.childTaskIds ?? [],
    commitment: patch.commitment !== undefined ? normalizeText(patch.commitment) : existing?.commitment ?? null,
    schedule: patch.schedule !== undefined ? normalizeText(patch.schedule) : existing?.schedule ?? null,
    trigger: patch.trigger !== undefined ? normalizeText(patch.trigger) : existing?.trigger ?? null,
    updatedAt: new Date().toISOString(),
  };

  all[taskId] = next;
  if (canUseLocalStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
  return next;
}

export function moveTaskToProject(taskId: string, projectId: string | null): {
  task: TaskAttributeRecord;
  previousProject: TaskAttributeRecord | null;
  nextProject: TaskAttributeRecord | null;
} {
  const all = loadTaskAttributes();
  const existing = all[taskId];
  const previousProjectId = existing?.parentTaskId ?? null;
  const now = new Date().toISOString();
  let previousProject: TaskAttributeRecord | null = null;
  let nextProject: TaskAttributeRecord | null = null;

  if (previousProjectId && previousProjectId !== projectId) {
    const previous = all[previousProjectId];
    previousProject = {
      taskId: previousProjectId,
      type: previous?.type ?? 'project',
      facets: normalizeTaskTypeFacets(previous?.facets, previous?.type ?? 'project'),
      owner: previous?.owner ?? 'user',
      visibility: previous?.visibility ?? 'visible',
      typeConfirmed: previous?.typeConfirmed ?? true,
      parentTaskId: previous?.parentTaskId ?? null,
      childTaskIds: (previous?.childTaskIds ?? []).filter((id) => id !== taskId),
      commitment: previous?.commitment ?? null,
      schedule: previous?.schedule ?? null,
      trigger: previous?.trigger ?? null,
      updatedAt: now,
    };
    all[previousProjectId] = previousProject;
  }

  if (projectId && projectId !== taskId) {
    const project = all[projectId];
    const childIds = project?.childTaskIds ?? [];
    nextProject = {
      taskId: projectId,
      type: 'project',
      facets: normalizeTaskTypeFacets(project?.facets, 'project'),
      owner: project?.owner ?? 'user',
      visibility: project?.visibility ?? 'visible',
      typeConfirmed: true,
      parentTaskId: project?.parentTaskId ?? null,
      childTaskIds: childIds.includes(taskId) ? childIds : [...childIds, taskId],
      commitment: project?.commitment ?? null,
      schedule: project?.schedule ?? null,
      trigger: project?.trigger ?? null,
      updatedAt: now,
    };
    all[projectId] = nextProject;
  }

  const task: TaskAttributeRecord = {
    taskId,
    type: existing?.type ?? 'simple',
    facets: normalizeTaskTypeFacets(existing?.facets, existing?.type ?? 'simple'),
    owner: existing?.owner ?? 'user',
    visibility: existing?.visibility ?? 'visible',
    typeConfirmed: existing?.typeConfirmed ?? false,
    parentTaskId: projectId && projectId !== taskId ? projectId : null,
    childTaskIds: existing?.childTaskIds ?? [],
    commitment: existing?.commitment ?? null,
    schedule: existing?.schedule ?? null,
    trigger: existing?.trigger ?? null,
    updatedAt: now,
  };
  all[taskId] = task;

  if (canUseLocalStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
  return { task, previousProject, nextProject };
}

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

export function defaultScheduleForType(type: TaskExecutionType): string | null {
  if (type === 'scheduled') return '每周一 09:00';
  return null;
}

export function defaultTriggerForType(type: TaskExecutionType): string | null {
  if (type === 'event') return '外部信号更新时';
  return null;
}

export function buildProjectDecompositionGuidance(projectTitle: string): string {
  const shortTitle = projectTitle.replace(/[。.!！?？]+$/g, '').trim() || '这个项目';
  return [
    `请把「${shortTitle}」拆解成父任务和子任务结构。`,
    '',
    '流程要求：',
    '1. 先拆一版：根据项目边界决定子任务数量，通常 2-7 个；不要为凑数量拆任务，也不要机械套“调研/初稿/验收”模板。',
    '2. 再自检查：评估每个子任务是否足够独立、边界清楚、仍保持合适的大块粒度。',
    '3. 如果发现子任务过细、互相重叠、缺少验收标准或依赖关系不清，请重拆一版。',
    '4. 保持最多两层：项目 → 子任务；复杂子任务应升级为项目型，后续再拆自己的子任务。',
  ].join('\n');
}

export function buildProjectDecompositionPrompt(projectTitle: string): string {
  return [
    buildProjectDecompositionGuidance(projectTitle),
    '',
    '输出格式：',
    '- 父任务：一句话说明目标。',
    '- 子任务列表：每项包含标题、目标、交付物/验收标准、依赖关系、为什么这个粒度合适。',
    '- 拆解检查：说明哪些任务保持为大块任务，哪些需要继续拆，哪些暂不应拆。',
    '- 下一步建议：建议我先确认什么，或者是否直接创建这些子任务。',
  ].join('\n');
}

export function buildTaskPlanningPrompt(
  taskTitle: string,
  type: TaskExecutionType,
  surface: TaskPlanningPromptSurface = 'capture',
): TaskPlanningPrompt {
  if (type === 'project') {
    return {
      label: surface === 'panel' ? '拆解项目结构' : '让 AI 拆解并检查',
      prompt: buildProjectDecompositionPrompt(taskTitle),
    };
  }
  if (type === 'scheduled') {
    return {
      label: '确认周期与节奏',
      prompt: [
        `请继续规划「${taskTitle}」这条定时任务。`,
        '先确认它是否应该保持为定时重复任务，再帮我梳理周期、执行时间、结束条件和第一次执行前需要补齐的信息。',
      ].join('\n'),
    };
  }
  if (type === 'event') {
    return {
      label: '确认触发条件',
      prompt: [
        `请继续规划「${taskTitle}」这条事件触发任务。`,
        '先确认它是否应该保持为事件触发任务，再帮我梳理监听来源、触发条件、触发后写入哪里，以及什么情况下需要推到 Brief。',
      ].join('\n'),
    };
  }
  if (type === 'routine') {
    return {
      label: '规划常设维护',
      prompt: [
        `请继续规划「${taskTitle}」这条常设任务。`,
        '先确认它长期存在的目的、维护范围、触发/检查节奏、记录位置和什么情况下需要推到 Brief。',
        '如果它包含阶段性建设工作，请建议是否拆出一个项目型任务；如果只是日常维护，请保持为常设任务。',
      ].join('\n'),
    };
  }
  return {
    label: surface === 'panel' ? '规划下一步' : '继续规划任务',
    prompt: [
      `请继续规划「${taskTitle}」这条一次性任务。`,
      '先确认目标和验收标准，再给出下一步行动；如果信息不足，请直接问我最关键的一个问题。',
    ].join('\n'),
  };
}

function normalizeText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}
