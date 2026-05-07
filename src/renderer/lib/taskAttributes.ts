export type TaskExecutionType = 'simple' | 'project' | 'scheduled' | 'event';

export type TaskAttributeRecord = {
  taskId: string;
  type: TaskExecutionType;
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
  const next: TaskAttributeRecord = {
    taskId,
    type: patch.type ?? existing?.type ?? 'simple',
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

export function inferTaskExecutionType(title: string): TaskExecutionType {
  const normalized = title.toLowerCase();
  if (/每(日|天|周|月)|daily|weekly|monthly|定期|定时|周期/.test(normalized)) return 'scheduled';
  if (/收到|当.+时|触发|监听|监控|邮件|gmail|webhook|event/.test(normalized)) return 'event';
  if (/项目|上线|重构|完整|方案|计划|campaign|project/.test(normalized)) return 'project';
  return 'simple';
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

function normalizeText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}
