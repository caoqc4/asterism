import type { TaskRecord } from '@shared/types/task';
import {
  normalizeTaskTypeFacets,
  type TaskExecutionType,
  type TaskOwner,
  type TaskVisibility,
} from '@shared/task-type-profile';
export {
  buildTaskTypeProfile,
  inferTaskExecutionType,
  inferTaskTypeProfile,
  normalizeTaskTypeFacets,
  type TaskExecutionType,
  type TaskOwner,
  type TaskTypeProfile,
  type TaskVisibility,
} from '@shared/task-type-profile';

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
  parentTaskId?: string | null;
  childTaskIds?: string[];
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
    commitment: patch.commitment !== undefined ? normalizeText(patch.commitment) : existing?.commitment ?? null,
    schedule: patch.schedule !== undefined ? normalizeText(patch.schedule) : existing?.schedule ?? null,
    trigger: patch.trigger !== undefined ? normalizeText(patch.trigger) : existing?.trigger ?? null,
    updatedAt: new Date().toISOString(),
  };
  if (patch.parentTaskId !== undefined) {
    next.parentTaskId = patch.parentTaskId ?? null;
  } else if (existing && Object.prototype.hasOwnProperty.call(existing, 'parentTaskId')) {
    next.parentTaskId = existing.parentTaskId ?? null;
  }
  if (patch.childTaskIds !== undefined) {
    next.childTaskIds = patch.childTaskIds;
  } else if (existing && Object.prototype.hasOwnProperty.call(existing, 'childTaskIds')) {
    next.childTaskIds = existing.childTaskIds ?? [];
  }

  all[taskId] = next;
  if (canUseLocalStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
  return next;
}

export function clearTaskHierarchyAttributes(taskIds?: string[]): {
  clearedTaskIds: string[];
  remaining: Record<string, TaskAttributeRecord>;
} {
  const all = loadTaskAttributes();
  const targetIds = taskIds ?? Object.keys(all);
  const clearedTaskIds: string[] = [];
  for (const taskId of targetIds) {
    const existing = all[taskId];
    if (!existing) continue;
    const hadParent = Object.prototype.hasOwnProperty.call(existing, 'parentTaskId');
    const hadChildren = Object.prototype.hasOwnProperty.call(existing, 'childTaskIds');
    if (!hadParent && !hadChildren) continue;
    const next: TaskAttributeRecord = { ...existing, updatedAt: new Date().toISOString() };
    delete next.parentTaskId;
    delete next.childTaskIds;
    all[taskId] = next;
    clearedTaskIds.push(taskId);
  }
  if (clearedTaskIds.length && canUseLocalStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
  return { clearedTaskIds, remaining: all };
}

export function clearTaskHierarchyAttributesForPersistedTasks(
  tasks: Array<Pick<TaskRecord, 'id' | 'parentTaskId' | 'childTaskIds'>>,
): {
  clearedTaskIds: string[];
  remaining: Record<string, TaskAttributeRecord>;
} {
  const taskIdsWithPersistedHierarchy = tasks
    .filter((task) => (
      Object.prototype.hasOwnProperty.call(task, 'parentTaskId')
      || Object.prototype.hasOwnProperty.call(task, 'childTaskIds')
    ))
    .map((task) => task.id);
  return clearTaskHierarchyAttributes(taskIdsWithPersistedHierarchy);
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
