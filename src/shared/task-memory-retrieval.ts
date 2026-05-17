import { evaluateSourceMaterialQuality, type SourceMaterialQualityEvaluation } from './source-material-quality-evaluator.js';
import { isTaskMdPath, isTaskRecordPath } from './task-memory-path.js';
import type { ArtifactRecord } from './types/artifact.js';
import type { BlockerRecord } from './types/blocker.js';
import type { DecisionRecord } from './types/decision.js';
import type { AppliedProcessTemplateRecord } from './types/process-template.js';
import type { SourceContextRecord } from './types/source-context.js';
import type { TaskDependencyRecord } from './types/task-dependency.js';
import type { TaskFileRecord } from './types/task-file.js';
import type { TaskRecord, TimelineEventRecord } from './types/task.js';
import type { WorkHabitRecord } from './types/work-habit.js';

export type TaskMemorySearchEntityType =
  | 'task_state'
  | 'task_md'
  | 'task_record'
  | 'task_dynamic'
  | 'decision'
  | 'source_context'
  | 'artifact'
  | 'task_file'
  | 'blocker'
  | 'dependency'
  | 'work_habit'
  | 'process_template';

export type TaskMemoryRetrievalDecision = 'include' | 'caution' | 'exclude';

export type TaskMemorySearchEntity = {
  id: string;
  entityType: TaskMemorySearchEntityType;
  taskId: string | null;
  title: string;
  preview: string | null;
  path?: string | null;
  updatedAt: string | null;
  importanceSignals: string[];
  quality?: SourceMaterialQualityEvaluation | null;
  searchableText: string;
};

export type TaskMemoryRetrievalResult = {
  entity: TaskMemorySearchEntity;
  decision: TaskMemoryRetrievalDecision;
  reasons: string[];
  score: number;
};

export type TaskMemoryRetrievalInput = {
  currentTask: TaskRecord;
  tasks?: TaskRecord[];
  taskFiles?: TaskFileRecord[];
  sourceContexts?: SourceContextRecord[];
  artifacts?: ArtifactRecord[];
  decisions?: DecisionRecord[];
  blockers?: BlockerRecord[];
  dependencies?: TaskDependencyRecord[];
  timeline?: TimelineEventRecord[];
  workHabits?: WorkHabitRecord[];
  processTemplates?: AppliedProcessTemplateRecord[];
  query?: string | null;
  selectedFileIds?: string[];
  maxResults?: number;
};

export type TaskMemorySearchIndexInput = Omit<TaskMemoryRetrievalInput, 'query' | 'selectedFileIds' | 'maxResults'>;

const PREVIEW_LIMIT = 240;

export function buildTaskMemorySearchIndex(input: TaskMemorySearchIndexInput): TaskMemorySearchEntity[] {
  const entities: TaskMemorySearchEntity[] = [];
  const currentTaskId = input.currentTask.id;

  entities.push(entity({
    id: input.currentTask.id,
    entityType: 'task_state',
    taskId: currentTaskId,
    title: input.currentTask.title,
    preview: compact([input.currentTask.summary, input.currentTask.nextStep, input.currentTask.waitingReason, input.currentTask.riskNote].join('\n')),
    updatedAt: input.currentTask.updatedAt,
    importanceSignals: ['current_task'],
  }));

  for (const file of input.taskFiles ?? []) {
    const entityType: TaskMemorySearchEntityType = isTaskMdPath(file.path)
      ? 'task_md'
      : isTaskRecordPath(file.path)
        ? 'task_record'
        : 'task_file';
    entities.push(entity({
      id: file.id,
      entityType,
      taskId: file.taskId,
      title: file.name || file.path,
      preview: file.content,
      path: file.path,
      updatedAt: file.updatedAt,
      importanceSignals: [
        entityType === 'task_md' ? 'primary_recovery_file' : null,
        entityType === 'task_record' ? 'recovery_record' : null,
      ].filter(Boolean) as string[],
    }));
  }

  for (const source of input.sourceContexts ?? []) {
    const quality = evaluateSourceMaterialQuality({
      content: source.content,
      credibility: source.credibility,
      containsSensitiveData: source.containsSensitiveData,
      isDuplicate: source.isDuplicate,
      isKey: source.isKey,
      kind: source.kind,
      note: source.note,
      sourceRole: source.sourceRole,
      status: source.status,
      title: source.title,
      uri: source.uri,
    });
    entities.push(entity({
      id: source.id,
      entityType: 'source_context',
      taskId: source.taskId,
      title: source.title,
      preview: source.content ?? source.note ?? source.uri,
      path: source.uri,
      updatedAt: source.updatedAt,
      quality,
      importanceSignals: [
        source.isKey ? 'key_source' : null,
        source.sourceRole === 'stable_reference' ? 'stable_reference' : null,
        quality.reason,
      ].filter(Boolean) as string[],
    }));
  }

  for (const artifact of input.artifacts ?? []) {
    entities.push(entity({
      id: artifact.id,
      entityType: 'artifact',
      taskId: artifact.taskId,
      title: artifact.title,
      preview: artifact.content,
      updatedAt: artifact.updatedAt,
      importanceSignals: ['task_output', artifact.kind],
    }));
  }

  for (const decision of input.decisions ?? []) {
    entities.push(entity({
      id: decision.id,
      entityType: 'decision',
      taskId: decision.taskId,
      title: decision.title,
      preview: compact([
        decision.context?.whyNow,
        decision.context?.impact,
        decision.recommendation?.label,
        decision.recommendation?.reason,
      ].join('\n')),
      updatedAt: decision.updatedAt,
      importanceSignals: [decision.status, decision.scope, decision.kind],
    }));
  }

  for (const blocker of input.blockers ?? []) {
    entities.push(entity({
      id: blocker.id,
      entityType: 'blocker',
      taskId: blocker.taskId,
      title: blocker.title,
      preview: blocker.detail,
      updatedAt: blocker.updatedAt,
      importanceSignals: [blocker.status, blocker.kind],
    }));
  }

  for (const dependency of input.dependencies ?? []) {
    entities.push(entity({
      id: dependency.id,
      entityType: 'dependency',
      taskId: dependency.taskId,
      title: dependency.blockedByTaskTitle ?? dependency.blockedByTaskId,
      preview: dependency.reason,
      updatedAt: dependency.updatedAt,
      importanceSignals: [dependency.status, 'blocked_by_task'],
    }));
  }

  for (const event of input.timeline ?? []) {
    entities.push(entity({
      id: event.id,
      entityType: 'task_dynamic',
      taskId: event.taskId,
      title: event.type,
      preview: event.payload,
      updatedAt: event.createdAt,
      importanceSignals: ['timeline_event', event.type],
    }));
  }

  for (const habit of input.workHabits ?? []) {
    entities.push(entity({
      id: habit.id,
      entityType: 'work_habit',
      taskId: null,
      title: habit.rule,
      preview: habit.examples,
      updatedAt: habit.lastAppliedAt ?? habit.createdAt,
      importanceSignals: [habit.status, habit.scope, habit.scopeLabel],
    }));
  }

  for (const template of input.processTemplates ?? []) {
    entities.push(entity({
      id: template.bindingId,
      entityType: 'process_template',
      taskId: template.taskId,
      title: template.title,
      preview: template.summary ?? template.bindingNote ?? template.content,
      updatedAt: template.bindingUpdatedAt,
      importanceSignals: [
        template.status,
        template.bindingStatus === 'active' ? 'active_binding' : 'removed_binding',
        template.kind,
      ],
    }));
  }

  return entities;
}

export function retrieveTaskExecutionMemory(input: TaskMemoryRetrievalInput): TaskMemoryRetrievalResult[] {
  const query = normalize(input.query);
  const selectedFileIds = new Set(input.selectedFileIds ?? []);
  const indexed = buildTaskMemorySearchIndex(input);
  const results = indexed.map((candidate) => rankEntity(candidate, {
    currentTask: input.currentTask,
    query,
    selectedFileIds,
  }));

  return results
    .sort((a, b) => (
      decisionWeight(b.decision) - decisionWeight(a.decision)
      || b.score - a.score
      || compareDateDesc(a.entity.updatedAt, b.entity.updatedAt)
      || a.entity.title.localeCompare(b.entity.title)
    ))
    .slice(0, input.maxResults ?? results.length);
}

function rankEntity(
  entity: TaskMemorySearchEntity,
  context: {
    currentTask: TaskRecord;
    query: string;
    selectedFileIds: Set<string>;
  },
): TaskMemoryRetrievalResult {
  const reasons: string[] = [];
  let score = baseScore(entity.entityType);
  let decision: TaskMemoryRetrievalDecision = 'include';
  const sameTask = entity.taskId === context.currentTask.id || entity.taskId === null;
  const queryMatched = context.query ? normalize(entity.searchableText).includes(context.query) : false;

  if (!sameTask && !queryMatched) {
    decision = 'exclude';
    reasons.push('different_task');
    score = 0;
  }

  if (entity.entityType === 'source_context' && entity.quality) {
    if (entity.quality.decision === 'exclude') decision = 'exclude';
    if (entity.quality.decision === 'caution' && decision !== 'exclude') decision = 'caution';
    reasons.push(`source_quality:${entity.quality.reason}`);
  }

  if (entity.entityType === 'decision' && entity.importanceSignals.includes('pending')) {
    reasons.push('pending_decision');
    score += 80;
  }

  if (entity.entityType === 'blocker' && entity.importanceSignals.includes('active')) {
    reasons.push('active_blocker');
    score += 70;
  }

  if (entity.entityType === 'dependency' && entity.importanceSignals.includes('active')) {
    reasons.push('active_dependency');
    score += 60;
  }

  if (entity.entityType === 'source_context' && entity.importanceSignals.includes('key_source')) {
    reasons.push('key_source');
    score += 80;
  }

  if (entity.entityType === 'work_habit' && !entity.importanceSignals.includes('confirmed')) {
    decision = 'exclude';
    reasons.push('unconfirmed_work_habit');
    score = 0;
  }

  if (entity.entityType === 'process_template' && !entity.importanceSignals.includes('active_binding')) {
    decision = 'exclude';
    reasons.push('inactive_process_template');
    score = 0;
  }

  if (context.selectedFileIds.has(entity.id) || (entity.path && context.selectedFileIds.has(entity.path))) {
    if (decision === 'exclude' && entity.entityType === 'task_file') decision = 'caution';
    reasons.push('selected');
    score += 160;
  }

  if (queryMatched) {
    reasons.push('query_match');
    score += exactTitleOrPathMatch(entity, context.query) ? 180 : 60;
  }

  if (sameTask && !reasons.includes('different_task')) {
    reasons.push(entity.taskId ? 'current_task_scope' : 'global_scope');
  }

  if (reasons.length === 0) reasons.push('default_read_order');

  return {
    entity,
    decision,
    reasons,
    score,
  };
}

function entity(params: Omit<TaskMemorySearchEntity, 'preview' | 'searchableText'> & {
  preview?: string | null;
}): TaskMemorySearchEntity {
  const preview = truncate(compact(params.preview ?? ''));
  const searchableText = [params.title, params.path, preview, ...params.importanceSignals].filter(Boolean).join('\n');
  return {
    ...params,
    preview,
    searchableText,
  };
}

function baseScore(type: TaskMemorySearchEntityType): number {
  switch (type) {
    case 'task_state': return 1000;
    case 'task_md': return 950;
    case 'decision': return 860;
    case 'blocker': return 840;
    case 'dependency': return 820;
    case 'task_record': return 780;
    case 'source_context': return 700;
    case 'process_template': return 620;
    case 'artifact': return 580;
    case 'task_file': return 520;
    case 'work_habit': return 460;
    case 'task_dynamic': return 420;
  }
}

function decisionWeight(decision: TaskMemoryRetrievalDecision): number {
  if (decision === 'include') return 2;
  if (decision === 'caution') return 1;
  return 0;
}

function exactTitleOrPathMatch(entity: TaskMemorySearchEntity, query: string): boolean {
  return normalize(entity.title) === query || normalize(entity.path) === query;
}

function compareDateDesc(left: string | null, right: string | null): number {
  return timestamp(right) - timestamp(left);
}

function timestamp(value: string | null): number {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function compact(value: string | null | undefined): string | null {
  const compacted = (value ?? '').split('\n').map((line) => line.trim()).filter(Boolean).join('\n');
  return compacted || null;
}

function truncate(value: string | null): string | null {
  if (!value) return null;
  return value.length > PREVIEW_LIMIT ? `${value.slice(0, PREVIEW_LIMIT).trim()}...` : value;
}
