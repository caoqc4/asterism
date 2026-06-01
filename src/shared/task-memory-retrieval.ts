import { evaluateSourceMaterialQuality, type SourceMaterialQualityEvaluation } from './source-material-quality-evaluator.js';
import { evaluateSourceFreshness, type SourceFreshnessEvaluation } from './source-freshness-evaluator.js';
import { isTaskMdPath, isTaskRecordPath } from './task-memory-path.js';
import {
  contextOwnerBusinessLineId,
  contextOwnerTaskId,
  type ContextOwner,
} from './context-owner.js';
import type { ArtifactRecord } from './types/artifact.js';
import type { BlockerRecord } from './types/blocker.js';
import type { DecisionRecord } from './types/decision.js';
import type { AppliedProcessTemplateRecord } from './types/process-template.js';
import type { SourceContextRecord } from './types/source-context.js';
import type { TaskDependencyRecord } from './types/task-dependency.js';
import type { TaskFileRecord } from './types/task-file.js';
import type { TaskListItemRecord, TaskRecord, TimelineEventRecord } from './types/task.js';
import type { WorkHabitRecord } from './types/work-habit.js';
import type {
  BusinessLineRecord,
  BusinessLineReview,
  BusinessLineSkillRevision,
} from './types/business-line.js';
import type { RunRecord } from './types/run.js';

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
  freshness?: SourceFreshnessEvaluation | null;
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
  currentRunId?: string | null;
  now?: string;
  query?: string | null;
  selectedFileIds?: string[];
  maxResults?: number;
};

export type TaskMemorySearchIndexInput = Omit<TaskMemoryRetrievalInput, 'query' | 'selectedFileIds' | 'maxResults'>;

export type BusinessMemoryRetrievalItemKind =
  | 'business_record'
  | 'business_review'
  | 'accepted_sop'
  | 'active_decision'
  | 'selected_source'
  | 'artifact'
  | 'current_next_action'
  | 'run_evidence'
  | 'work_habit';

export type BusinessMemoryRetrievalDecision = 'include' | 'caution' | 'exclude';

export type BusinessMemoryRetrievalItem = {
  decision: BusinessMemoryRetrievalDecision;
  id: string;
  item: BusinessLineRecord | BusinessLineReview | BusinessLineSkillRevision | DecisionRecord | SourceContextRecord | ArtifactRecord | TaskListItemRecord | RunRecord | WorkHabitRecord;
  kind: BusinessMemoryRetrievalItemKind;
  ownerBusinessLineId: string | null;
  reasons: string[];
  score: number;
  title: string;
  updatedAt: string | null;
};

export type BusinessMemoryRetrievalInput = {
  artifacts?: ArtifactRecord[];
  currentNextAction?: TaskListItemRecord | null;
  decisions?: DecisionRecord[];
  explicitItemIds?: string[];
  includeNonFutureContext?: boolean;
  owner: ContextOwner;
  records?: BusinessLineRecord[];
  reviews?: BusinessLineReview[];
  runs?: RunRecord[];
  selectedSourceIds?: string[];
  skillRevisions?: BusinessLineSkillRevision[];
  sources?: SourceContextRecord[];
  workHabits?: WorkHabitRecord[];
  maxResults?: number;
};

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
    const freshness = evaluateSourceFreshness({
      capturedAt: source.capturedAt,
      createdAt: source.createdAt,
      currentRunId: input.currentRunId,
      isKey: source.isKey,
      runId: source.runId,
      sourceRole: source.sourceRole,
      status: source.status,
      title: source.title,
      updatedAt: source.updatedAt,
      now: input.now,
    });
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
      freshness,
      quality,
      importanceSignals: [
        source.isKey ? 'key_source' : null,
        source.sourceRole === 'stable_reference' ? 'stable_reference' : null,
        freshness.reason,
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

export function retrieveBusinessMemory(input: BusinessMemoryRetrievalInput): BusinessMemoryRetrievalItem[] {
  const ownerBusinessLineId = contextOwnerBusinessLineId(input.owner);
  const ownerTaskId = contextOwnerTaskId(input.owner);
  const explicitItemIds = new Set(input.explicitItemIds ?? []);
  const selectedSourceIds = new Set(input.selectedSourceIds ?? []);
  const items: BusinessMemoryRetrievalItem[] = [];

  for (const record of input.records ?? []) {
    const sameOwner = ownerBusinessLineId !== null && record.businessLineId === ownerBusinessLineId;
    const explicit = explicitItemIds.has(record.id);
    let decision: BusinessMemoryRetrievalDecision = 'include';
    const reasons = [sameOwner ? 'owner_scope' : 'cross_business_excluded'];
    if (!sameOwner && !explicit) decision = 'exclude';
    if (!record.shouldAffectFutureContext && !input.includeNonFutureContext && !explicit) {
      decision = 'exclude';
      reasons.push('future_context_disabled');
    } else if (record.shouldAffectFutureContext) {
      reasons.push('future_context_enabled');
    } else if (explicit || input.includeNonFutureContext) {
      reasons.push('explicit_non_future_context');
    }
    if (record.futureContextReason) reasons.push(`future_context_reason:${record.futureContextReason}`);
    if (explicit) reasons.push('explicitly_selected');
    items.push(businessMemoryItem({
      decision,
      id: record.id,
      item: record,
      kind: 'business_record',
      ownerBusinessLineId: record.businessLineId,
      reasons,
      score: 1000 + record.confidence,
      title: `${record.type}: ${record.summary}`,
      updatedAt: record.createdAt,
    }));
  }

  for (const review of input.reviews ?? []) {
    const sameOwner = ownerBusinessLineId !== null && review.businessLineId === ownerBusinessLineId;
    const explicit = explicitItemIds.has(review.id) || explicitItemIds.has(`review:${review.id}`);
    items.push(businessMemoryItem({
      decision: sameOwner || explicit ? 'include' : 'exclude',
      id: `review:${review.id}`,
      item: review,
      kind: 'business_review',
      ownerBusinessLineId: review.businessLineId,
      reasons: [
        sameOwner ? 'owner_scope' : 'cross_business_excluded',
        'structured_review',
        explicit ? 'explicitly_selected' : null,
      ].filter((item): item is string => Boolean(item)),
      score: 940 + review.confidence,
      title: review.resultSummary,
      updatedAt: review.createdAt,
    }));
  }

  for (const revision of input.skillRevisions ?? []) {
    const sameOwner = ownerBusinessLineId !== null && revision.businessLineId === ownerBusinessLineId;
    const explicit = explicitItemIds.has(revision.id);
    const expired = isPastIso(revision.expiresAt) || revision.isExpired === true;
    const accepted = revision.status === 'active' && !expired;
    items.push(businessMemoryItem({
      decision: (sameOwner || explicit) && accepted ? 'include' : 'exclude',
      id: revision.id,
      item: revision,
      kind: 'accepted_sop',
      ownerBusinessLineId: revision.businessLineId,
      reasons: [
        sameOwner ? 'owner_scope' : 'cross_business_excluded',
        accepted ? 'accepted_sop' : `inactive_sop:${revision.status}`,
        expired ? 'expired_sop' : null,
        explicit ? 'explicitly_selected' : null,
      ].filter((item): item is string => Boolean(item)),
      score: 900,
      title: revision.scopePath,
      updatedAt: revision.updatedAt,
    }));
  }

  for (const decisionRecord of input.decisions ?? []) {
    const decisionBusinessLineId = decisionRecord.businessLineId ?? null;
    const sameOwner = ownerBusinessLineId !== null && decisionBusinessLineId === ownerBusinessLineId;
    const sameTaskCarrier = ownerTaskId !== null && decisionRecord.taskId === ownerTaskId;
    const explicit = explicitItemIds.has(decisionRecord.id);
    const active = decisionRecord.status === 'pending';
    const includedScope = sameOwner || sameTaskCarrier;
    items.push(businessMemoryItem({
      decision: (includedScope || explicit) && active ? 'include' : 'exclude',
      id: decisionRecord.id,
      item: decisionRecord,
      kind: 'active_decision',
      ownerBusinessLineId: decisionBusinessLineId,
      reasons: [
        includedScope ? 'owner_scope' : 'cross_business_excluded',
        active ? 'active_decision' : `inactive_decision:${decisionRecord.status}`,
        explicit ? 'explicitly_selected' : null,
      ].filter((item): item is string => Boolean(item)),
      score: 880,
      title: decisionRecord.title,
      updatedAt: decisionRecord.updatedAt,
    }));
  }

  for (const source of input.sources ?? []) {
    const sameOwner = ownerBusinessLineId !== null && source.businessLineId === ownerBusinessLineId;
    const sameTaskCarrier = ownerTaskId !== null && source.taskId === ownerTaskId;
    const explicit = selectedSourceIds.has(source.id) || explicitItemIds.has(source.id);
    const selected = explicit;
    const active = source.status === 'active';
    const traceable = Boolean(source.uri || source.content || source.note);
    const includedScope = sameOwner || sameTaskCarrier;
    items.push(businessMemoryItem({
      decision: (includedScope || explicit) && selected && active && traceable
        ? 'include'
        : (includedScope || explicit) && selected && active
          ? 'caution'
          : 'exclude',
      id: source.id,
      item: source,
      kind: 'selected_source',
      ownerBusinessLineId: source.businessLineId ?? null,
      reasons: [
        includedScope ? 'owner_scope' : 'cross_business_excluded',
        selected ? 'selected_source' : 'not_selected_source',
        active ? 'active_source' : 'archived_source',
        traceable ? 'traceable_source' : 'missing_source_content',
        explicit ? 'explicitly_selected' : null,
      ].filter((item): item is string => Boolean(item)),
      score: 760 + (source.isKey ? 80 : 0),
      title: source.title,
      updatedAt: source.updatedAt,
    }));
  }

  for (const artifact of input.artifacts ?? []) {
    const sameOwner = ownerBusinessLineId !== null && artifact.businessLineId === ownerBusinessLineId;
    const sameTaskCarrier = ownerTaskId !== null && artifact.taskId === ownerTaskId;
    const explicit = explicitItemIds.has(artifact.id);
    const includedScope = sameOwner || sameTaskCarrier;
    items.push(businessMemoryItem({
      decision: includedScope || explicit ? 'include' : 'exclude',
      id: artifact.id,
      item: artifact,
      kind: 'artifact',
      ownerBusinessLineId: artifact.businessLineId ?? null,
      reasons: [
        includedScope ? 'owner_scope' : 'cross_business_excluded',
        artifact.sourceType === 'run' ? 'run_artifact' : 'manual_artifact',
        explicit ? 'explicitly_selected' : null,
      ].filter((item): item is string => Boolean(item)),
      score: 720,
      title: artifact.title,
      updatedAt: artifact.updatedAt,
    }));
  }

  if (input.currentNextAction) {
    const action = input.currentNextAction;
    const sameOwner = ownerBusinessLineId !== null && action.businessLineId === ownerBusinessLineId;
    const sameTaskCarrier = ownerTaskId !== null && action.id === ownerTaskId;
    const explicit = explicitItemIds.has(action.id);
    const active = action.state !== 'completed' && action.state !== 'archived';
    items.push(businessMemoryItem({
      decision: (sameOwner || sameTaskCarrier || explicit) && active ? 'include' : 'exclude',
      id: action.id,
      item: action,
      kind: 'current_next_action',
      ownerBusinessLineId: action.businessLineId ?? null,
      reasons: [
        sameOwner || sameTaskCarrier ? 'owner_scope' : 'cross_business_excluded',
        active ? 'open_next_action' : `inactive_next_action:${action.state}`,
        action.nextStep ? 'next_safe_action_present' : 'next_safe_action_missing',
        explicit ? 'explicitly_selected' : null,
      ].filter((item): item is string => Boolean(item)),
      score: 860,
      title: action.title,
      updatedAt: action.updatedAt,
    }));
  }

  for (const run of input.runs ?? []) {
    const sameOwner = ownerBusinessLineId !== null && run.businessLineId === ownerBusinessLineId;
    const sameTaskCarrier = ownerTaskId !== null && run.taskId === ownerTaskId;
    const explicit = explicitItemIds.has(run.id);
    const hasEvidence = Boolean(run.output?.trim() || run.failureReason?.trim());
    const terminal = run.status === 'completed' || run.status === 'failed';
    items.push(businessMemoryItem({
      decision: (sameOwner || sameTaskCarrier || explicit) && hasEvidence && terminal ? 'include' : 'exclude',
      id: run.id,
      item: run,
      kind: 'run_evidence',
      ownerBusinessLineId: run.businessLineId ?? null,
      reasons: [
        sameOwner || sameTaskCarrier ? 'owner_scope' : 'cross_business_excluded',
        terminal ? `terminal_run:${run.status}` : `non_terminal_run:${run.status}`,
        hasEvidence ? 'run_evidence_present' : 'run_evidence_missing',
        explicit ? 'explicitly_selected' : null,
      ].filter((item): item is string => Boolean(item)),
      score: 700,
      title: `Run ${run.id}`,
      updatedAt: run.updatedAt,
    }));
  }

  for (const habit of input.workHabits ?? []) {
    const confirmed = habit.status === 'confirmed';
    items.push(businessMemoryItem({
      decision: confirmed ? 'include' : 'exclude',
      id: habit.id,
      item: habit,
      kind: 'work_habit',
      ownerBusinessLineId: null,
      reasons: [
        confirmed ? 'confirmed_work_habit' : `inactive_work_habit:${habit.status}`,
        `scope:${habit.scope}`,
      ],
      score: 640 + habit.applicationCount,
      title: habit.rule,
      updatedAt: habit.lastAppliedAt ?? habit.createdAt,
    }));
  }

  return items
    .sort((left, right) =>
      decisionWeight(right.decision) - decisionWeight(left.decision)
      || right.score - left.score
      || compareDateDesc(left.updatedAt, right.updatedAt)
      || left.kind.localeCompare(right.kind)
      || left.id.localeCompare(right.id))
    .slice(0, input.maxResults ?? items.length);
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

  if (entity.entityType === 'source_context' && entity.freshness) {
    if (entity.freshness.decision === 'exclude') decision = 'exclude';
    if (entity.freshness.decision === 'caution' && decision !== 'exclude') decision = 'caution';
    reasons.push(`source_freshness:${entity.freshness.reason}`);
  }

  if (entity.entityType === 'decision' && entity.importanceSignals.includes('pending')) {
    reasons.push('pending_decision');
    score += 80;
  }

  if (entity.entityType === 'blocker' && entity.importanceSignals.includes('active')) {
    reasons.push('active_blocker');
    score += 70;
  } else if (entity.entityType === 'blocker' && entity.importanceSignals.includes('resolved')) {
    reasons.push('resolved_blocker');
    score -= 220;
  }

  if (entity.entityType === 'dependency' && entity.importanceSignals.includes('active')) {
    reasons.push('active_dependency');
    score += 60;
  } else if (entity.entityType === 'dependency' && entity.importanceSignals.includes('resolved')) {
    reasons.push('resolved_dependency');
    score -= 220;
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

function businessMemoryItem(
  params: BusinessMemoryRetrievalItem,
): BusinessMemoryRetrievalItem {
  return {
    ...params,
    reasons: uniqueReasons(params.reasons),
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

function isPastIso(value: string | null | undefined): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= Date.now();
}

function uniqueReasons(reasons: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const reason of reasons) {
    const clean = reason.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
  }
  return result;
}
