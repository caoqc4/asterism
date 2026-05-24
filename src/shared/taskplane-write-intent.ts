export type TaskplaneWriteIntentConfidence = 'low' | 'medium' | 'high';

export type TaskplaneSubtaskDraftIntent = {
  evidenceRunId: string;
  parentTaskId: string;
  review?: string | null;
  nextStep?: string | null;
  subtasks: Array<{
    acceptanceCriteria: string;
    dependency?: string | null;
    summary: string;
    title: string;
  }>;
  type: 'subtask.propose';
};

export type TaskplaneTaskRecordCreateIntent = {
  confidence: TaskplaneWriteIntentConfidence;
  content: string;
  evidenceRunId: string;
  taskId: string;
  type: 'task_record.create';
};

export type TaskplaneDecisionCreateIntent = {
  evidenceRunId: string;
  options?: string[];
  proposedOutcome?: string;
  rationale: string;
  taskId: string;
  title: string;
  type: 'decision.create';
};

export type TaskplaneSourceContextCreateIntent = {
  credibility?: 'unknown' | 'low' | 'medium' | 'high';
  evidenceRunId: string;
  note: string;
  taskId: string;
  title: string;
  type: 'source_context.create';
  uri?: string | null;
};

export type TaskplaneTaskNextStepIntent = {
  evidenceRunId: string;
  nextStep: string;
  reason: string;
  taskId: string;
  type: 'task.update_next_step';
};

export type TaskplaneTaskBlockedIntent = {
  evidenceRunId: string;
  reason: string;
  taskId: string;
  type: 'task.mark_blocked';
  unblockCondition?: string | null;
};

export type TaskplaneTaskCompleteIntent = {
  evidence: string;
  evidenceRunId: string;
  taskId: string;
  type: 'task.complete.propose';
};

export type TaskplaneWriteIntent =
  | TaskplaneTaskRecordCreateIntent
  | TaskplaneDecisionCreateIntent
  | TaskplaneSourceContextCreateIntent
  | TaskplaneTaskNextStepIntent
  | TaskplaneSubtaskDraftIntent
  | TaskplaneTaskBlockedIntent
  | TaskplaneTaskCompleteIntent;

export type TaskplaneWriteIntentValidation =
  | {
      intent: TaskplaneWriteIntent;
      status: 'ready';
    }
  | {
      intent: TaskplaneWriteIntent | null;
      issues: string[];
      status: 'blocked';
    };

export function extractTaskplaneWriteIntentsFromText(params: {
  evidenceRunId: string;
  parentTaskId?: string | null;
  taskId: string;
  text: string;
}): TaskplaneWriteIntent[] {
  const candidates = extractJsonCandidates(params.text);
  const intents: TaskplaneWriteIntent[] = [];
  for (const candidate of candidates) {
    const parsed = parseJsonCandidate(candidate);
    if (parsed === null) continue;
    intents.push(...normalizeWriteIntentValue(parsed, params));
  }
  return dedupeWriteIntents(intents);
}

export function validateTaskplaneWriteIntent(intent: TaskplaneWriteIntent): TaskplaneWriteIntentValidation {
  const issues: string[] = [];
  if (!intent.evidenceRunId.trim()) {
    issues.push('Write intent requires evidenceRunId.');
  }

  if (intent.type === 'subtask.propose') {
    if (!intent.parentTaskId.trim()) issues.push('Subtask proposal requires parentTaskId.');
    if (intent.subtasks.length < 2) issues.push('Subtask proposal requires at least two subtasks.');
    intent.subtasks.forEach((subtask, index) => {
      if (!subtask.title.trim()) issues.push(`Subtask ${index + 1} requires title.`);
      if (!subtask.summary.trim()) issues.push(`Subtask ${index + 1} requires summary.`);
      if (!subtask.acceptanceCriteria.trim()) issues.push(`Subtask ${index + 1} requires acceptanceCriteria.`);
    });
  } else if ('taskId' in intent && !intent.taskId.trim()) {
    issues.push(`${intent.type} requires taskId.`);
  }

  return issues.length
    ? { intent, issues, status: 'blocked' }
    : { intent, status: 'ready' };
}

function normalizeWriteIntentValue(value: unknown, params: {
  evidenceRunId: string;
  parentTaskId?: string | null;
  taskId: string;
}): TaskplaneWriteIntent[] {
  if (!isRecord(value)) return [];
  if (Array.isArray(value.intents)) {
    return value.intents.flatMap((item) => normalizeWriteIntentValue(item, params));
  }
  const type = readString(value.type);
  if (type === 'TASKPLANE_WRITE_INTENTS' || type === 'TASKPLANE_WRITE_INTENT') {
    return Array.isArray(value.intents)
      ? value.intents.flatMap((item) => normalizeWriteIntentValue(item, params))
      : [];
  }
  if (type === 'TASKPLANE_DECOMPOSITION' || type === 'subtask.propose') {
    const subtasks = normalizeSubtaskDrafts(value.subtasks);
    if (!subtasks.length) return [];
    return [{
      evidenceRunId: readString(value.evidenceRunId, params.evidenceRunId),
      parentTaskId: readString(value.parentTaskId, params.parentTaskId ?? params.taskId),
      review: readString(value.review) || null,
      nextStep: readString(value.nextStep) || null,
      subtasks,
      type: 'subtask.propose',
    }];
  }
  return [];
}

function normalizeSubtaskDrafts(value: unknown): TaskplaneSubtaskDraftIntent['subtasks'] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 8)
    .map((item) => {
      const record = isRecord(item) ? item : {};
      const title = readString(record.title);
      const summary = readString(record.summary, title);
      return {
        acceptanceCriteria: readString(record.acceptanceCriteria, '确认该环节交付物满足父任务目标。'),
        dependency: readString(record.dependency) || null,
        summary,
        title,
      };
    })
    .filter((item) => item.title && item.summary);
}

function extractJsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const candidates = Array.from(trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi))
    .map((match) => match[1]?.trim() ?? '')
    .filter(Boolean);
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    candidates.push(trimmed);
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    candidates.push(trimmed.slice(first, last + 1));
  }
  return Array.from(new Set(candidates));
}

function parseJsonCandidate(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function dedupeWriteIntents(intents: TaskplaneWriteIntent[]): TaskplaneWriteIntent[] {
  const seen = new Set<string>();
  const result: TaskplaneWriteIntent[] = [];
  for (const intent of intents) {
    const key = JSON.stringify(intent);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(intent);
  }
  return result;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
