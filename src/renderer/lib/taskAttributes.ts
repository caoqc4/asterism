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

export function buildProjectDecompositionPrompt(projectTitle: string): string {
  const shortTitle = projectTitle.replace(/[。.!！?？]+$/g, '').trim() || '这个项目';
  return [
    `请把「${shortTitle}」拆解成父任务和子任务结构。`,
    '',
    '流程要求：',
    '1. 先拆一版：给出 3-7 个子任务，不要机械按“调研/初稿/验收”套模板。',
    '2. 再自检查：评估每个子任务是否足够独立、边界清楚、仍保持合适的大块粒度。',
    '3. 如果发现子任务过细、互相重叠、缺少验收标准或依赖关系不清，请重拆一版。',
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
