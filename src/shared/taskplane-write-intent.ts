import { isTaskMdPath, isTaskRecordPath } from './task-memory-path.js';

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

export type TaskplaneTaskFileProposeIntent = {
  content: string;
  evidenceRunId: string;
  path: string;
  summary?: string;
  taskId: string;
  type: 'task_file.propose';
};

export type TaskplaneArtifactProposeIntent = {
  content: string;
  evidenceRunId: string;
  kind: 'note' | 'patch';
  summary?: string;
  taskId: string;
  title: string;
  type: 'artifact.propose';
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
  credibility?: 'verified' | 'unknown' | 'low';
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

export type TaskplaneBusinessRecordCreateIntent = {
  businessLineId?: string | null;
  confidence?: number;
  evidenceRunId: string;
  recordType?: 'signal' | 'hypothesis' | 'decision' | 'action' | 'artifact' | 'result' | 'review' | 'rule';
  shouldAffectFutureContext?: boolean;
  source?: string | null;
  summary: string;
  taskId?: string | null;
  type: 'business_record.create';
};

export type TaskplaneBusinessReviewRecordIntent = {
  businessLineId?: string | null;
  confidence?: number;
  evidenceItems?: string[];
  evidenceRunId: string;
  hypothesisChange?: string | null;
  nextActionSuggestions?: string[];
  requiresDecision?: boolean;
  resultSummary: string;
  skillUpdateSuggestions?: string[];
  sourceActionId?: string | null;
  taskId?: string | null;
  type: 'business_review.record';
};

export type TaskplaneBusinessNextActionCreateIntent = {
  businessLineId?: string | null;
  evidenceRunId: string;
  nextStep?: string | null;
  sourceActionId?: string | null;
  summary?: string | null;
  taskId?: string | null;
  title: string;
  type: 'business_next_action.create';
};

export type TaskplaneBusinessSopRevisionProposeIntent = {
  businessLineId?: string | null;
  changeReason: string;
  evidenceItems?: string[];
  evidenceRunId: string;
  nextContent: string;
  requiresDecision?: boolean;
  reviewAfterAt?: string | null;
  scopePath?: string | null;
  sourceActionId?: string | null;
  taskId?: string | null;
  type: 'business_sop_revision.propose';
};

export type TaskplaneBusinessHandoffRecordIntent = {
  businessLineId?: string | null;
  currentState: string;
  evidenceItems?: string[];
  evidenceRunId: string;
  nextSafeAction: string;
  reason: string;
  shouldAffectFutureContext?: boolean;
  sourceActionId?: string | null;
  taskId?: string | null;
  type: 'business_handoff.record';
};

export type TaskplaneWriteIntent =
  | TaskplaneTaskRecordCreateIntent
  | TaskplaneTaskFileProposeIntent
  | TaskplaneArtifactProposeIntent
  | TaskplaneDecisionCreateIntent
  | TaskplaneSourceContextCreateIntent
  | TaskplaneTaskNextStepIntent
  | TaskplaneSubtaskDraftIntent
  | TaskplaneTaskBlockedIntent
  | TaskplaneTaskCompleteIntent
  | TaskplaneBusinessRecordCreateIntent
  | TaskplaneBusinessReviewRecordIntent
  | TaskplaneBusinessNextActionCreateIntent
  | TaskplaneBusinessSopRevisionProposeIntent
  | TaskplaneBusinessHandoffRecordIntent;

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

export function extractTaskplaneWriteIntentTypeNamesFromText(text: string): string[] {
  const candidates = extractJsonCandidates(text);
  const types: string[] = [];
  for (const candidate of candidates) {
    const parsed = parseJsonCandidate(candidate);
    if (parsed === null) continue;
    types.push(...collectWriteIntentTypeNames(parsed));
  }
  return Array.from(new Set(types));
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
  } else if (isTaskNativeIntentWithRequiredTask(intent) && !intent.taskId.trim()) {
    issues.push(`${intent.type} requires taskId.`);
  }
  if (intent.type === 'task_record.create') {
    if (!intent.content.trim()) issues.push('Task record intent requires content.');
    if (!['low', 'medium', 'high'].includes(intent.confidence)) issues.push('Task record intent requires confidence.');
  }
  if (intent.type === 'task_file.propose') {
    const path = normalizeWriteIntentPath(intent.path);
    if (!path) issues.push('Task file proposal requires path.');
    if (!intent.content.trim()) issues.push('Task file proposal requires content.');
    if (path && (isTaskMdPath(path) || isTaskRecordPath(path))) {
      issues.push('Task file proposal cannot target Task.md or Task Records/. Use the dedicated task-memory or task-record intent.');
    }
    if (path && !/\.(md|txt)$/i.test(path)) {
      issues.push('Task file proposal currently supports .md or .txt files.');
    }
  }
  if (intent.type === 'artifact.propose') {
    if (!intent.title.trim()) issues.push('Artifact proposal requires title.');
    if (!intent.content.trim()) issues.push('Artifact proposal requires content.');
    if (intent.kind !== 'note' && intent.kind !== 'patch') {
      issues.push('Artifact proposal currently supports note or patch artifacts.');
    }
    if (intent.kind === 'patch' && !looksLikePatchContent(intent.content)) {
      issues.push('Patch artifact proposal requires reviewable diff content.');
    }
  }
  if (intent.type === 'source_context.create') {
    if (!intent.title.trim()) issues.push('Source context intent requires title.');
    if (!intent.note.trim()) issues.push('Source context intent requires note.');
  }
  if (intent.type === 'decision.create') {
    if (!intent.title.trim()) issues.push('Decision intent requires title.');
    if (!intent.rationale.trim()) issues.push('Decision intent requires rationale.');
  }
  if (intent.type === 'task.update_next_step') {
    if (!intent.nextStep.trim()) issues.push('Next step intent requires nextStep.');
    if (!intent.reason.trim()) issues.push('Next step intent requires reason.');
  }
  if (intent.type === 'task.mark_blocked') {
    if (!intent.reason.trim()) issues.push('Blocked intent requires reason.');
  }
  if (intent.type === 'task.complete.propose') {
    if (!intent.evidence.trim()) issues.push('Completion proposal requires evidence.');
  }
  if (intent.type === 'business_record.create') {
    if (!intent.summary.trim()) issues.push('Business record intent requires summary.');
  }
  if (intent.type === 'business_review.record') {
    if (!intent.resultSummary.trim()) issues.push('Business review intent requires resultSummary.');
  }
  if (intent.type === 'business_next_action.create') {
    if (!intent.title.trim()) issues.push('Business next action intent requires title.');
  }
  if (intent.type === 'business_sop_revision.propose') {
    if (!intent.nextContent.trim()) issues.push('Business SOP revision intent requires nextContent.');
    if (!intent.changeReason.trim()) issues.push('Business SOP revision intent requires changeReason.');
  }
  if (intent.type === 'business_handoff.record') {
    if (!intent.currentState.trim()) issues.push('Business handoff intent requires currentState.');
    if (!intent.nextSafeAction.trim()) issues.push('Business handoff intent requires nextSafeAction.');
    if (!intent.reason.trim()) issues.push('Business handoff intent requires reason.');
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
  if (type === 'task_record.create') {
    const content = readString(value.content);
    if (!content) return [];
    const confidence = normalizeConfidence(value.confidence);
    return [{
      confidence,
      content,
      evidenceRunId: readString(value.evidenceRunId, params.evidenceRunId),
      taskId: readString(value.taskId, params.taskId),
      type: 'task_record.create',
    }];
  }
  if (type === 'task_file.propose') {
    const path = normalizeWriteIntentPath(readString(value.path));
    const content = readString(value.content);
    if (!path || !content) return [];
    return [{
      content,
      evidenceRunId: readString(value.evidenceRunId, params.evidenceRunId),
      path,
      summary: readString(value.summary) || undefined,
      taskId: readString(value.taskId, params.taskId),
      type: 'task_file.propose',
    }];
  }
  if (type === 'artifact.propose') {
    const title = readString(value.title);
    const content = readString(value.content);
    if (!title || !content) return [];
    return [{
      content,
      evidenceRunId: readString(value.evidenceRunId, params.evidenceRunId),
      kind: normalizeArtifactKind(value.kind),
      summary: readString(value.summary) || undefined,
      taskId: readString(value.taskId, params.taskId),
      title,
      type: 'artifact.propose',
    }];
  }
  if (type === 'source_context.create') {
    const title = readString(value.title);
    const note = readString(value.note);
    if (!title || !note) return [];
    return [{
      credibility: normalizeSourceCredibility(value.credibility),
      evidenceRunId: readString(value.evidenceRunId, params.evidenceRunId),
      note,
      taskId: readString(value.taskId, params.taskId),
      title,
      type: 'source_context.create',
      uri: readString(value.uri) || null,
    }];
  }
  if (type === 'decision.create') {
    const title = readString(value.title);
    const rationale = readString(value.rationale);
    if (!title || !rationale) return [];
    return [{
      evidenceRunId: readString(value.evidenceRunId, params.evidenceRunId),
      options: normalizeStringArray(value.options),
      proposedOutcome: readString(value.proposedOutcome) || undefined,
      rationale,
      taskId: readString(value.taskId, params.taskId),
      title,
      type: 'decision.create',
    }];
  }
  if (type === 'task.update_next_step') {
    const nextStep = readString(value.nextStep);
    const reason = readString(value.reason);
    if (!nextStep || !reason) return [];
    return [{
      evidenceRunId: readString(value.evidenceRunId, params.evidenceRunId),
      nextStep,
      reason,
      taskId: readString(value.taskId, params.taskId),
      type: 'task.update_next_step',
    }];
  }
  if (type === 'task.mark_blocked') {
    const reason = readString(value.reason);
    if (!reason) return [];
    return [{
      evidenceRunId: readString(value.evidenceRunId, params.evidenceRunId),
      reason,
      taskId: readString(value.taskId, params.taskId),
      type: 'task.mark_blocked',
      unblockCondition: readString(value.unblockCondition) || null,
    }];
  }
  if (type === 'task.complete.propose') {
    const evidence = readString(value.evidence);
    if (!evidence) return [];
    return [{
      evidence,
      evidenceRunId: readString(value.evidenceRunId, params.evidenceRunId),
      taskId: readString(value.taskId, params.taskId),
      type: 'task.complete.propose',
    }];
  }
  if (type === 'business_record.create') {
    const summary = readString(value.summary);
    if (!summary) return [];
    return [{
      businessLineId: readString(value.businessLineId) || null,
      confidence: normalizeNumber(value.confidence),
      evidenceRunId: readString(value.evidenceRunId, params.evidenceRunId),
      recordType: normalizeBusinessRecordType(value.recordType ?? value.typeHint),
      shouldAffectFutureContext: normalizeBoolean(value.shouldAffectFutureContext, true),
      source: readString(value.source) || null,
      summary,
      taskId: readString(value.taskId) || params.taskId || null,
      type: 'business_record.create',
    }];
  }
  if (type === 'business_review.record') {
    const resultSummary = readString(value.resultSummary);
    if (!resultSummary) return [];
    return [{
      businessLineId: readString(value.businessLineId) || null,
      confidence: normalizeNumber(value.confidence),
      evidenceItems: normalizeStringArray(value.evidenceItems),
      evidenceRunId: readString(value.evidenceRunId, params.evidenceRunId),
      hypothesisChange: readString(value.hypothesisChange) || null,
      nextActionSuggestions: normalizeStringArray(value.nextActionSuggestions),
      requiresDecision: normalizeBoolean(value.requiresDecision, false),
      resultSummary,
      skillUpdateSuggestions: normalizeStringArray(value.skillUpdateSuggestions),
      sourceActionId: readString(value.sourceActionId) || readString(value.taskId) || params.taskId || null,
      taskId: readString(value.taskId) || params.taskId || null,
      type: 'business_review.record',
    }];
  }
  if (type === 'business_next_action.create') {
    const title = readString(value.title);
    if (!title) return [];
    return [{
      businessLineId: readString(value.businessLineId) || null,
      evidenceRunId: readString(value.evidenceRunId, params.evidenceRunId),
      nextStep: readString(value.nextStep) || null,
      sourceActionId: readString(value.sourceActionId) || readString(value.taskId) || params.taskId || null,
      summary: readString(value.summary) || null,
      taskId: readString(value.taskId) || params.taskId || null,
      title,
      type: 'business_next_action.create',
    }];
  }
  if (type === 'business_sop_revision.propose') {
    const nextContent = readString(value.nextContent);
    const changeReason = readString(value.changeReason);
    if (!nextContent || !changeReason) return [];
    return [{
      businessLineId: readString(value.businessLineId) || null,
      changeReason,
      evidenceItems: normalizeStringArray(value.evidenceItems),
      evidenceRunId: readString(value.evidenceRunId, params.evidenceRunId),
      nextContent,
      requiresDecision: normalizeBoolean(value.requiresDecision, false),
      reviewAfterAt: readString(value.reviewAfterAt) || null,
      scopePath: readString(value.scopePath) || null,
      sourceActionId: readString(value.sourceActionId) || readString(value.taskId) || params.taskId || null,
      taskId: readString(value.taskId) || params.taskId || null,
      type: 'business_sop_revision.propose',
    }];
  }
  if (type === 'business_handoff.record') {
    const currentState = readString(value.currentState);
    const nextSafeAction = readString(value.nextSafeAction);
    const reason = readString(value.reason);
    if (!currentState || !nextSafeAction || !reason) return [];
    return [{
      businessLineId: readString(value.businessLineId) || null,
      currentState,
      evidenceItems: normalizeStringArray(value.evidenceItems),
      evidenceRunId: readString(value.evidenceRunId, params.evidenceRunId),
      nextSafeAction,
      reason,
      shouldAffectFutureContext: normalizeBoolean(value.shouldAffectFutureContext, true),
      sourceActionId: readString(value.sourceActionId) || readString(value.taskId) || params.taskId || null,
      taskId: readString(value.taskId) || params.taskId || null,
      type: 'business_handoff.record',
    }];
  }
  return [];
}

function collectWriteIntentTypeNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectWriteIntentTypeNames(item));
  }
  if (!isRecord(value)) return [];
  const type = readString(value.type);
  if (type === 'TASKPLANE_WRITE_INTENTS' || type === 'TASKPLANE_WRITE_INTENT') {
    return Array.isArray(value.intents)
      ? value.intents.flatMap((item) => collectWriteIntentTypeNames(item))
      : [];
  }
  return type ? [type] : [];
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

function normalizeWriteIntentPath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

function normalizeConfidence(value: unknown): TaskplaneWriteIntentConfidence {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium';
}

function normalizeArtifactKind(value: unknown): TaskplaneArtifactProposeIntent['kind'] {
  return value === 'patch' ? 'patch' : 'note';
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => readString(item))
    .filter(Boolean)
    .slice(0, 8);
  return items.length ? items : undefined;
}

function normalizeSourceCredibility(value: unknown): TaskplaneSourceContextCreateIntent['credibility'] {
  return value === 'verified' || value === 'low' || value === 'unknown' ? value : 'unknown';
}

function normalizeBusinessRecordType(value: unknown): TaskplaneBusinessRecordCreateIntent['recordType'] {
  return value === 'hypothesis'
    || value === 'decision'
    || value === 'action'
    || value === 'artifact'
    || value === 'result'
    || value === 'review'
    || value === 'rule'
    ? value
    : 'signal';
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function looksLikePatchContent(value: string): boolean {
  const normalized = value.replace(/\r\n/g, '\n');
  return /\ndiff --git\s+a\/.+\s+b\/.+/.test(`\n${normalized}`)
    || (/^---\s+/m.test(normalized) && /^\+\+\+\s+/m.test(normalized));
}

function isTaskNativeIntentWithRequiredTask(
  intent: TaskplaneWriteIntent,
): intent is Exclude<TaskplaneWriteIntent, TaskplaneSubtaskDraftIntent
  | TaskplaneBusinessRecordCreateIntent
  | TaskplaneBusinessReviewRecordIntent
  | TaskplaneBusinessNextActionCreateIntent
  | TaskplaneBusinessSopRevisionProposeIntent
  | TaskplaneBusinessHandoffRecordIntent> {
  return intent.type === 'task_record.create'
    || intent.type === 'task_file.propose'
    || intent.type === 'artifact.propose'
    || intent.type === 'decision.create'
    || intent.type === 'source_context.create'
    || intent.type === 'task.update_next_step'
    || intent.type === 'task.mark_blocked'
    || intent.type === 'task.complete.propose';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
