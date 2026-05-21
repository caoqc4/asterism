import type {
  ProjectDecompositionResult,
  ProjectSubtaskDraft,
} from './types/ipc.js';

export function extractJsonObjectFromText(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return JSON.parse(trimmed);
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }
  throw new Error('Project decomposition response did not contain JSON.');
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function normalizeProjectDecompositionDraft(value: unknown): ProjectDecompositionResult {
  if (!value || typeof value !== 'object') {
    throw new Error('Project decomposition response must be an object.');
  }
  const record = value as Record<string, unknown>;
  const rawSubtasks = Array.isArray(record.subtasks) ? record.subtasks : [];
  const subtasks: ProjectSubtaskDraft[] = rawSubtasks.slice(0, 8).map((item, index) => {
    const subtask = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const title = readString(subtask.title, `子任务 ${index + 1}`);
    return {
      title,
      summary: readString(subtask.summary, title),
      acceptanceCriteria: readString(subtask.acceptanceCriteria, '完成后能明确验收。'),
      dependency: readString(subtask.dependency) || null,
      rationale: readString(subtask.rationale, '保持为相对独立的大块任务。'),
    };
  }).filter((item) => item.title);

  if (subtasks.length === 0) {
    throw new Error('Project decomposition response did not include subtasks.');
  }

  return {
    parentGoal: readString(record.parentGoal, '明确项目目标并拆解可执行子任务。'),
    subtasks,
    review: readString(record.review, '已检查子任务边界、依赖和粒度。'),
    nextStep: readString(record.nextStep, '请确认是否创建这些子任务。'),
  };
}
