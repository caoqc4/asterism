import { and, desc, eq } from 'drizzle-orm';

import type {
  BusinessLine,
  BusinessLineActionLink,
  BusinessLineActionStatus,
  BusinessLineKind,
  BusinessLineOwnershipInput,
  BusinessLineOwnershipResolution,
  BusinessLineOwnershipSource,
  BusinessLineRecord,
  BusinessLineRecordType,
  BusinessLineReview,
  BusinessLineSkillRevision,
  BusinessLineSkillRevisionApprovalSourceType,
  BusinessLineSkillRevisionProvenance,
  BusinessLineSkillRevisionStatus,
  CreateBusinessLineInput,
  RecordBusinessLineReviewInput,
} from '../../../shared/types/business-line.js';
import type { ArtifactKind, ArtifactRecord } from '../../../shared/types/artifact.js';
import type {
  SourceContextCredibility,
  SourceContextRecord,
  SourceContextRole,
} from '../../../shared/types/source-context.js';
import type { TaskFileKind, TaskFileRecord } from '../../../shared/types/task-file.js';
import {
  businessLineIdForLegacyTask,
  inferBusinessLineKindFromTask,
} from '../../../shared/types/business-line.js';
import type { TaskRecord } from '../../../shared/types/task.js';
import {
  businessLineActions,
  businessLineRecords,
  businessLineReviews,
  businessLines,
  businessLineSkillRevisions,
  artifacts,
  decisionRequests,
  runs,
  sourceContexts,
  taskFiles,
  tasks,
} from '../schema.js';
import { initDatabase } from '../client.js';
import { generateId, nowIso } from './repository-utils.js';

type BusinessLineRow = typeof businessLines.$inferSelect;
type BusinessLineActionRow = typeof businessLineActions.$inferSelect;
type BusinessLineRecordRow = typeof businessLineRecords.$inferSelect;
type BusinessLineReviewRow = typeof businessLineReviews.$inferSelect;
type BusinessLineSkillRevisionRow = typeof businessLineSkillRevisions.$inferSelect;
type SourceContextRow = typeof sourceContexts.$inferSelect;
type ArtifactRow = typeof artifacts.$inferSelect;
type TaskFileRow = typeof taskFiles.$inferSelect;

type ResolvedOwnershipCandidate = Extract<BusinessLineOwnershipResolution, { status: 'resolved' }>;
type MissingOwnershipCandidate = Extract<BusinessLineOwnershipResolution, { status: 'missing' }>;
type OwnershipCandidate = ResolvedOwnershipCandidate | MissingOwnershipCandidate | null;

function parseJsonArray(value: string | null | undefined): string[] {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function serializeJson(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
}

function buildContentDiff(previousContent: string | null, nextContent: string): string {
  const previous = previousContent?.trim();
  const next = nextContent.trim();
  if (!previous) return `+ ${next}`;
  if (previous === next) return 'No content changes.';
  return [`- ${previous}`, `+ ${next}`].join('\n');
}

function normalizeKind(value: string | null | undefined): BusinessLineKind {
  if (value === 'software_product' || value === 'project' || value === 'routine' || value === 'general') {
    return value;
  }
  return 'general';
}

function normalizeRecordType(value: string | null | undefined): BusinessLineRecordType {
  if (
    value === 'signal' ||
    value === 'hypothesis' ||
    value === 'decision' ||
    value === 'action' ||
    value === 'artifact' ||
    value === 'result' ||
    value === 'review' ||
    value === 'rule'
  ) {
    return value;
  }
  return 'signal';
}

function normalizeActionStatus(value: string | null | undefined): BusinessLineActionStatus {
  if (value === 'active' || value === 'completed' || value === 'archived') return value;
  return 'active';
}

function normalizeRevisionStatus(value: string | null | undefined): BusinessLineSkillRevisionStatus {
  if (
    value === 'proposed' ||
    value === 'active' ||
    value === 'rejected' ||
    value === 'disabled' ||
    value === 'superseded'
  ) {
    return value;
  }
  return 'proposed';
}

function normalizeApprovalSourceType(value: string | null | undefined): BusinessLineSkillRevisionApprovalSourceType | null {
  if (value === 'operator' || value === 'decision' || value === 'rollback') return value;
  return null;
}

function businessLineFromRow(row: BusinessLineRow): BusinessLine {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    goal: row.goal,
    kind: normalizeKind(row.kind),
    legacyTaskId: row.legacyTaskId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function businessLineRecordFromRow(row: BusinessLineRecordRow): BusinessLineRecord {
  const shouldAffectFutureContext = row.shouldAffectFutureContext === 'true';
  return {
    id: row.id,
    type: normalizeRecordType(row.type),
    businessLineId: row.businessLineId,
    source: row.source,
    summary: row.summary,
    confidence: row.confidence,
    linkedActionId: row.linkedActionId,
    linkedDecisionId: row.linkedDecisionId,
    shouldAffectFutureContext,
    futureContextReason: shouldAffectFutureContext
      ? 'Native business-line record marked should_affect_future_context.'
      : 'Native business-line record kept as memory but excluded from default future context.',
    provenance: {
      sourceType: 'business_line_record',
      sourceId: row.id,
      sourceLabel: row.source,
      taskId: row.linkedActionId,
    },
    createdAt: row.createdAt,
  };
}

function sourceContextFromRow(row: SourceContextRow): SourceContextRecord {
  const sourceRole = row.sourceRole as SourceContextRole | null;
  const credibility = row.credibility as SourceContextCredibility | null;
  return {
    id: row.id,
    taskId: row.taskId,
    businessLineId: row.businessLineId,
    title: row.title,
    kind: row.kind as SourceContextRecord['kind'],
    isKey: row.isKey === 'true',
    uri: row.uri,
    content: row.content,
    note: row.note,
    status: row.status as SourceContextRecord['status'],
    capturedAt: row.capturedAt ?? row.createdAt,
    runId: row.runId,
    batchId: row.batchId,
    sourceRole: sourceRole ?? 'raw',
    credibility: credibility ?? null,
    isDuplicate: row.isDuplicate === 'true',
    containsSensitiveData: row.containsSensitiveData === 'true',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

function artifactFromRow(row: ArtifactRow): ArtifactRecord {
  return {
    id: row.id,
    taskId: row.taskId,
    businessLineId: row.businessLineId,
    sourceType: row.sourceType as ArtifactRecord['sourceType'],
    sourceId: row.sourceId,
    kind: row.kind as ArtifactKind,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function taskFileFromRow(row: TaskFileRow): TaskFileRecord {
  return {
    id: row.id,
    taskId: row.taskId,
    businessLineId: row.businessLineId,
    name: row.name,
    path: row.path,
    kind: row.kind as TaskFileKind,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function businessLineActionFromRow(row: BusinessLineActionRow): BusinessLineActionLink {
  return {
    id: row.id,
    businessLineId: row.businessLineId,
    taskId: row.taskId,
    sourceReviewId: row.sourceReviewId,
    sourceRecordId: row.sourceRecordId,
    status: normalizeActionStatus(row.status),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function businessLineReviewFromRow(row: BusinessLineReviewRow): BusinessLineReview {
  return {
    id: row.id,
    businessLineId: row.businessLineId,
    sourceActionId: row.sourceActionId,
    resultSummary: row.resultSummary,
    evidenceItems: parseJsonArray(row.evidenceItems),
    hypothesisChange: row.hypothesisChange,
    skillUpdateSuggestions: parseJsonArray(row.skillUpdateSuggestions),
    nextActionSuggestions: parseJsonArray(row.nextActionSuggestions),
    confidence: row.confidence,
    requiresDecision: row.requiresDecision === 'true',
    createdAt: row.createdAt,
  };
}

function businessLineSkillRevisionFromRow(row: BusinessLineSkillRevisionRow): BusinessLineSkillRevision {
  const provenanceFallback: BusinessLineSkillRevisionProvenance = {
    sourceType: 'business_line_review',
    sourceReviewId: row.sourceReviewId,
  };
  return {
    id: row.id,
    skillId: row.skillId,
    businessLineId: row.businessLineId,
    scopePath: row.scopePath,
    previousContent: row.previousContent,
    nextContent: row.nextContent,
    contentDiff: row.contentDiff ?? buildContentDiff(row.previousContent, row.nextContent),
    changeReason: row.changeReason,
    sourceReviewId: row.sourceReviewId,
    provenance: parseJsonObject<BusinessLineSkillRevisionProvenance>(row.provenance, provenanceFallback),
    approvedBy: row.approvedBy,
    approvalSourceType: normalizeApprovalSourceType(row.approvalSourceType),
    approvalSourceId: row.approvalSourceId,
    status: normalizeRevisionStatus(row.status),
    effectiveAt: row.effectiveAt,
    rollbackTargetRevisionId: row.rollbackTargetRevisionId,
    supersededByRevisionId: row.supersededByRevisionId,
    rejectedBy: row.rejectedBy,
    rejectedAt: row.rejectedAt,
    disabledBy: row.disabledBy,
    disabledAt: row.disabledAt,
    reviewAfterAt: row.reviewAfterAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class BusinessLineRepository {
  async list(): Promise<BusinessLine[]> {
    const db = initDatabase();
    const rows = await db.select().from(businessLines).orderBy(desc(businessLines.updatedAt));
    return rows.map(businessLineFromRow);
  }

  async findById(id: string): Promise<BusinessLine | null> {
    const db = initDatabase();
    const [row] = await db.select().from(businessLines).where(eq(businessLines.id, id)).limit(1);
    return row ? businessLineFromRow(row) : null;
  }

  async findByLegacyTaskId(taskId: string): Promise<BusinessLine | null> {
    const db = initDatabase();
    const [row] = await db
      .select()
      .from(businessLines)
      .where(eq(businessLines.legacyTaskId, taskId))
      .limit(1);
    return row ? businessLineFromRow(row) : null;
  }

  async create(input: CreateBusinessLineInput): Promise<BusinessLine> {
    const db = initDatabase();
    const timestamp = nowIso();
    const id = input.legacyTaskId ? businessLineIdForLegacyTask(input.legacyTaskId) : generateId('business_line');

    await db.insert(businessLines).values({
      id,
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      goal: input.goal?.trim() || null,
      kind: input.kind ?? 'general',
      legacyTaskId: input.legacyTaskId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const [created] = await db.select().from(businessLines).where(eq(businessLines.id, id)).limit(1);
    return businessLineFromRow(created);
  }

  async ensureForLegacyTask(task: TaskRecord): Promise<BusinessLine> {
    const existing = await this.findByLegacyTaskId(task.id);
    if (existing) return existing;

    return this.create({
      title: task.title,
      summary: task.summary,
      goal: task.nextStep ?? task.summary ?? null,
      kind: inferBusinessLineKindFromTask(task),
      legacyTaskId: task.id,
    });
  }

  async listRecords(businessLineId: string, limit = 25): Promise<BusinessLineRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(businessLineRecords)
      .where(eq(businessLineRecords.businessLineId, businessLineId))
      .orderBy(desc(businessLineRecords.createdAt))
      .limit(limit);
    return rows.map(businessLineRecordFromRow);
  }

  async listSourceContextsForBusinessLine(businessLineId: string): Promise<SourceContextRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(sourceContexts)
      .orderBy(desc(sourceContexts.updatedAt));
    const records: SourceContextRecord[] = [];
    for (const row of rows) {
      if (row.status !== 'active') continue;
      const resolvedBusinessLineId = await this.resolveBusinessLineForSource(row.id);
      if (resolvedBusinessLineId === businessLineId) {
        records.push(sourceContextFromRow(row));
      }
    }
    return records;
  }

  async listArtifactsForBusinessLine(businessLineId: string): Promise<ArtifactRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(artifacts)
      .orderBy(desc(artifacts.updatedAt));
    const records: ArtifactRecord[] = [];
    for (const row of rows) {
      const resolvedBusinessLineId = await this.resolveBusinessLineForArtifact(row.id);
      if (resolvedBusinessLineId === businessLineId) {
        records.push(artifactFromRow(row));
      }
    }
    return records;
  }

  async listTaskFilesForBusinessLine(businessLineId: string): Promise<TaskFileRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(taskFiles)
      .orderBy(desc(taskFiles.updatedAt));
    const records: TaskFileRecord[] = [];
    for (const row of rows) {
      const resolvedBusinessLineId = await this.resolveBusinessLineForTaskFile(row.id);
      if (resolvedBusinessLineId === businessLineId) {
        records.push(taskFileFromRow(row));
      }
    }
    return records;
  }

  async listActionTaskIds(businessLineId: string): Promise<string[]> {
    const db = initDatabase();
    const ownedTaskRows = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.businessLineId, businessLineId))
      .orderBy(desc(tasks.updatedAt));

    const actionRows = await db
      .select()
      .from(businessLineActions)
      .where(eq(businessLineActions.businessLineId, businessLineId))
      .orderBy(desc(businessLineActions.updatedAt));
    const linkedFromActionTable = actionRows
      .map(businessLineActionFromRow)
      .filter((link) => link.status === 'active')
      .map((link) => link.taskId);

    const recordRows = await db
      .select()
      .from(businessLineRecords)
      .where(eq(businessLineRecords.businessLineId, businessLineId))
      .orderBy(desc(businessLineRecords.createdAt));

    const linkedFromRecords = recordRows
      .map(businessLineRecordFromRow)
      .filter((record) => record.type === 'action' && Boolean(record.linkedActionId))
      .map((record) => record.linkedActionId!);

    return [...new Set([
      ...ownedTaskRows.map((row) => row.id),
      ...linkedFromActionTable,
      ...linkedFromRecords,
    ])];
  }

  async listLinkedActionIds(businessLineId: string): Promise<string[]> {
    return this.listActionTaskIds(businessLineId);
  }

  async resolveBusinessLineOwnership(input: BusinessLineOwnershipInput): Promise<BusinessLineOwnershipResolution> {
    const explicitBusinessLineId = input.explicitBusinessLineId?.trim() || null;
    const explicitLine = explicitBusinessLineId ? await this.findById(explicitBusinessLineId) : null;
    if (explicitBusinessLineId && !explicitLine) {
      return {
        status: 'missing',
        reason: 'business_line_not_found',
        missingBusinessLineId: explicitBusinessLineId,
      };
    }

    const carrier = await this.resolveCarrierOwnership(input, explicitBusinessLineId);
    if (carrier?.status === 'missing') return carrier;
    if (explicitBusinessLineId) {
      if (carrier?.status === 'resolved' && carrier.businessLineId !== explicitBusinessLineId) {
        return {
          status: 'mismatch',
          explicitBusinessLineId,
          resolvedBusinessLineId: carrier.businessLineId,
          resolvedSource: carrier.source,
          taskId: carrier.taskId,
          runId: carrier.runId,
          decisionId: carrier.decisionId,
          sourceContextId: carrier.sourceContextId,
          artifactId: carrier.artifactId,
          taskFileId: carrier.taskFileId,
        };
      }
      return this.resolvedOwnership({
        businessLineId: explicitBusinessLineId,
        explicitBusinessLineId,
        source: 'explicit',
        legacy: Boolean(explicitLine?.legacyTaskId),
        taskId: carrier?.status === 'resolved' ? carrier.taskId : input.taskId?.trim() || null,
        runId: carrier?.status === 'resolved' ? carrier.runId : input.runId?.trim() || null,
        decisionId: carrier?.status === 'resolved' ? carrier.decisionId : input.decisionId?.trim() || null,
        sourceContextId: carrier?.status === 'resolved' ? carrier.sourceContextId : input.sourceContextId?.trim() || null,
        artifactId: carrier?.status === 'resolved' ? carrier.artifactId : input.artifactId?.trim() || null,
        taskFileId: carrier?.status === 'resolved' ? carrier.taskFileId : input.taskFileId?.trim() || null,
      });
    }

    if (carrier?.status === 'resolved') return carrier;
    if (input.allowOneOff) {
      return {
        status: 'one_off',
        businessLineId: null,
        legacy: false,
      };
    }

    return {
      status: 'missing',
      reason: 'no_business_line_owner',
      taskId: input.taskId?.trim() || null,
      runId: input.runId?.trim() || null,
      decisionId: input.decisionId?.trim() || null,
      sourceContextId: input.sourceContextId?.trim() || null,
      artifactId: input.artifactId?.trim() || null,
      taskFileId: input.taskFileId?.trim() || null,
    };
  }

  async resolveBusinessLineForTask(taskId: string): Promise<string | null> {
    const resolved = await this.resolveBusinessLineOwnership({ taskId });
    return resolved.status === 'resolved' ? resolved.businessLineId : null;
  }

  async resolveBusinessLineForRun(runId: string): Promise<string | null> {
    const resolved = await this.resolveBusinessLineOwnership({ runId });
    return resolved.status === 'resolved' ? resolved.businessLineId : null;
  }

  async resolveBusinessLineForDecision(decisionId: string): Promise<string | null> {
    const resolved = await this.resolveBusinessLineOwnership({ decisionId });
    return resolved.status === 'resolved' ? resolved.businessLineId : null;
  }

  async resolveBusinessLineForSource(sourceContextId: string): Promise<string | null> {
    const resolved = await this.resolveBusinessLineOwnership({ sourceContextId });
    return resolved.status === 'resolved' ? resolved.businessLineId : null;
  }

  async resolveBusinessLineForArtifact(artifactId: string): Promise<string | null> {
    const resolved = await this.resolveBusinessLineOwnership({ artifactId });
    return resolved.status === 'resolved' ? resolved.businessLineId : null;
  }

  async resolveBusinessLineForTaskFile(taskFileId: string): Promise<string | null> {
    const resolved = await this.resolveBusinessLineOwnership({ taskFileId });
    return resolved.status === 'resolved' ? resolved.businessLineId : null;
  }

  private async resolveCarrierOwnership(
    input: BusinessLineOwnershipInput,
    explicitBusinessLineId: string | null,
  ): Promise<OwnershipCandidate> {
    if (input.taskFileId?.trim()) return this.resolveTaskFileOwnership(input.taskFileId.trim(), explicitBusinessLineId);
    if (input.artifactId?.trim()) return this.resolveArtifactOwnership(input.artifactId.trim(), explicitBusinessLineId);
    if (input.sourceContextId?.trim()) return this.resolveSourceContextOwnership(input.sourceContextId.trim(), explicitBusinessLineId);
    if (input.decisionId?.trim()) return this.resolveDecisionOwnership(input.decisionId.trim(), explicitBusinessLineId);
    if (input.runId?.trim()) return this.resolveRunOwnership(input.runId.trim(), explicitBusinessLineId);
    if (input.taskId?.trim()) return this.resolveTaskOwnership(input.taskId.trim(), explicitBusinessLineId);
    return null;
  }

  private async resolveTaskOwnership(
    taskId: string,
    explicitBusinessLineId: string | null,
  ): Promise<OwnershipCandidate> {
    const db = initDatabase();
    let currentTaskId: string | null = taskId;
    const visited = new Set<string>();

    while (currentTaskId && !visited.has(currentTaskId)) {
      visited.add(currentTaskId);
      const [task] = await db.select().from(tasks).where(eq(tasks.id, currentTaskId)).limit(1);
      if (!task) {
        return {
          status: 'missing',
          reason: 'task_not_found',
          taskId,
        };
      }
      if (task.businessLineId) {
        return this.resolvedOwnership({
          businessLineId: task.businessLineId,
          explicitBusinessLineId,
          source: currentTaskId === taskId ? 'task' : 'task_parent',
          taskId,
        });
      }
      const [legacyLine] = await db
        .select()
        .from(businessLines)
        .where(eq(businessLines.legacyTaskId, currentTaskId))
        .limit(1);
      if (legacyLine) {
        return this.resolvedOwnership({
          businessLineId: legacyLine.id,
          explicitBusinessLineId,
          source: 'legacy_task',
          legacy: true,
          taskId,
        });
      }
      currentTaskId = task.parentTaskId;
    }

    return null;
  }

  private async resolveRunOwnership(
    runId: string,
    explicitBusinessLineId: string | null,
  ): Promise<OwnershipCandidate> {
    const db = initDatabase();
    const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
    if (!run) {
      return {
        status: 'missing',
        reason: 'run_not_found',
        runId,
      };
    }
    if (run.businessLineId) {
      return this.resolvedOwnership({
        businessLineId: run.businessLineId,
        explicitBusinessLineId,
        source: 'run',
        taskId: run.taskId,
        runId,
      });
    }
    return this.retargetOwnershipSource(
      await this.resolveTaskOwnership(run.taskId, explicitBusinessLineId),
      'run_task',
      { runId },
    );
  }

  private async resolveDecisionOwnership(
    decisionId: string,
    explicitBusinessLineId: string | null,
  ): Promise<OwnershipCandidate> {
    const db = initDatabase();
    const [decision] = await db
      .select()
      .from(decisionRequests)
      .where(eq(decisionRequests.id, decisionId))
      .limit(1);
    if (!decision) {
      return {
        status: 'missing',
        reason: 'decision_not_found',
        decisionId,
      };
    }
    if (decision.businessLineId) {
      return this.resolvedOwnership({
        businessLineId: decision.businessLineId,
        explicitBusinessLineId,
        source: 'decision',
        taskId: decision.taskId,
        decisionId,
      });
    }
    if (!decision.taskId) return null;
    return this.retargetOwnershipSource(
      await this.resolveTaskOwnership(decision.taskId, explicitBusinessLineId),
      'decision_task',
      { decisionId },
    );
  }

  private async resolveSourceContextOwnership(
    sourceContextId: string,
    explicitBusinessLineId: string | null,
  ): Promise<OwnershipCandidate> {
    const db = initDatabase();
    const [source] = await db
      .select()
      .from(sourceContexts)
      .where(eq(sourceContexts.id, sourceContextId))
      .limit(1);
    if (!source) {
      return {
        status: 'missing',
        reason: 'source_context_not_found',
        sourceContextId,
      };
    }
    if (source.businessLineId) {
      return this.resolvedOwnership({
        businessLineId: source.businessLineId,
        explicitBusinessLineId,
        source: 'source_context',
        taskId: source.taskId,
        runId: source.runId,
        sourceContextId,
      });
    }
    if (source.runId) {
      const runOwnership = await this.resolveRunOwnership(source.runId, explicitBusinessLineId);
      if (runOwnership?.status === 'resolved') {
        return this.retargetOwnershipSource(runOwnership, 'source_context_run', { sourceContextId });
      }
      if (runOwnership?.status === 'missing') return runOwnership;
    }
    return this.retargetOwnershipSource(
      await this.resolveTaskOwnership(source.taskId, explicitBusinessLineId),
      'source_context_task',
      { sourceContextId },
    );
  }

  private async resolveArtifactOwnership(
    artifactId: string,
    explicitBusinessLineId: string | null,
  ): Promise<OwnershipCandidate> {
    const db = initDatabase();
    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, artifactId))
      .limit(1);
    if (!artifact) {
      return {
        status: 'missing',
        reason: 'artifact_not_found',
        artifactId,
      };
    }
    if (artifact.businessLineId) {
      return this.resolvedOwnership({
        businessLineId: artifact.businessLineId,
        explicitBusinessLineId,
        source: 'artifact',
        taskId: artifact.taskId,
        runId: artifact.sourceType === 'run' ? artifact.sourceId : null,
        artifactId,
      });
    }
    if (artifact.sourceType === 'run') {
      const runOwnership = await this.resolveRunOwnership(artifact.sourceId, explicitBusinessLineId);
      if (runOwnership?.status === 'resolved') {
        return this.retargetOwnershipSource(runOwnership, 'artifact_run', { artifactId });
      }
      if (runOwnership?.status === 'missing') return runOwnership;
    }
    return this.retargetOwnershipSource(
      await this.resolveTaskOwnership(artifact.taskId, explicitBusinessLineId),
      'artifact_task',
      { artifactId },
    );
  }

  private async resolveTaskFileOwnership(
    taskFileId: string,
    explicitBusinessLineId: string | null,
  ): Promise<OwnershipCandidate> {
    const db = initDatabase();
    const [taskFile] = await db
      .select()
      .from(taskFiles)
      .where(eq(taskFiles.id, taskFileId))
      .limit(1);
    if (!taskFile) {
      return {
        status: 'missing',
        reason: 'task_file_not_found',
        taskFileId,
      };
    }
    if (taskFile.businessLineId) {
      return this.resolvedOwnership({
        businessLineId: taskFile.businessLineId,
        explicitBusinessLineId,
        source: 'task_file',
        taskId: taskFile.taskId,
        taskFileId,
      });
    }
    return this.retargetOwnershipSource(
      await this.resolveTaskOwnership(taskFile.taskId, explicitBusinessLineId),
      'task_file_task',
      { taskFileId },
    );
  }

  private async resolvedOwnership(params: {
    businessLineId: string;
    explicitBusinessLineId?: string | null;
    source: BusinessLineOwnershipSource;
    legacy?: boolean;
    taskId?: string | null;
    runId?: string | null;
    decisionId?: string | null;
    sourceContextId?: string | null;
    artifactId?: string | null;
    taskFileId?: string | null;
  }): Promise<ResolvedOwnershipCandidate> {
    const line = await this.findById(params.businessLineId);
    return {
      status: 'resolved',
      businessLineId: params.businessLineId,
      source: params.source,
      legacy: params.legacy ?? Boolean(line?.legacyTaskId),
      explicitBusinessLineId: params.explicitBusinessLineId ?? null,
      taskId: params.taskId ?? null,
      runId: params.runId ?? null,
      decisionId: params.decisionId ?? null,
      sourceContextId: params.sourceContextId ?? null,
      artifactId: params.artifactId ?? null,
      taskFileId: params.taskFileId ?? null,
    };
  }

  private retargetOwnershipSource(
    candidate: OwnershipCandidate,
    source: BusinessLineOwnershipSource,
    ids: Partial<Pick<ResolvedOwnershipCandidate, 'artifactId' | 'decisionId' | 'runId' | 'sourceContextId' | 'taskFileId'>>,
  ): OwnershipCandidate {
    if (candidate?.status !== 'resolved') return candidate;
    return {
      ...candidate,
      source,
      ...ids,
    };
  }

  async createActionLink(input: {
    businessLineId: string;
    taskId: string;
    sourceReviewId?: string | null;
    sourceRecordId?: string | null;
  }): Promise<BusinessLineActionLink> {
    const db = initDatabase();
    const timestamp = nowIso();
    const id = generateId('business_line_action');
    await db.insert(businessLineActions).values({
      id,
      businessLineId: input.businessLineId,
      taskId: input.taskId,
      sourceReviewId: input.sourceReviewId ?? null,
      sourceRecordId: input.sourceRecordId ?? null,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const [created] = await db
      .select()
      .from(businessLineActions)
      .where(eq(businessLineActions.id, id))
      .limit(1);
    return businessLineActionFromRow(created);
  }

  async createRecord(input: {
    businessLineId: string;
    type: BusinessLineRecordType;
    source: string;
    summary: string;
    confidence?: number;
    linkedActionId?: string | null;
    linkedDecisionId?: string | null;
    shouldAffectFutureContext?: boolean;
  }): Promise<BusinessLineRecord> {
    const db = initDatabase();
    const timestamp = nowIso();
    const id = generateId('business_line_record');
    await db.insert(businessLineRecords).values({
      id,
      type: input.type,
      businessLineId: input.businessLineId,
      source: input.source,
      summary: input.summary.trim(),
      confidence: input.confidence ?? 70,
      linkedActionId: input.linkedActionId ?? null,
      linkedDecisionId: input.linkedDecisionId ?? null,
      shouldAffectFutureContext: input.shouldAffectFutureContext === false ? 'false' : 'true',
      createdAt: timestamp,
    });
    const [created] = await db
      .select()
      .from(businessLineRecords)
      .where(eq(businessLineRecords.id, id))
      .limit(1);
    return businessLineRecordFromRow(created);
  }

  async listReviews(businessLineId: string): Promise<BusinessLineReview[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(businessLineReviews)
      .where(eq(businessLineReviews.businessLineId, businessLineId))
      .orderBy(desc(businessLineReviews.createdAt));
    return rows.map(businessLineReviewFromRow);
  }

  async createReview(input: RecordBusinessLineReviewInput): Promise<BusinessLineReview> {
    const db = initDatabase();
    const timestamp = nowIso();
    const id = generateId('business_line_review');
    await db.insert(businessLineReviews).values({
      id,
      businessLineId: input.businessLineId,
      sourceActionId: input.sourceActionId?.trim() || null,
      resultSummary: input.resultSummary.trim(),
      evidenceItems: JSON.stringify(input.evidenceItems ?? []),
      hypothesisChange: input.hypothesisChange?.trim() || null,
      skillUpdateSuggestions: JSON.stringify(input.skillUpdateSuggestions ?? []),
      nextActionSuggestions: JSON.stringify(input.nextActionSuggestions ?? []),
      confidence: input.confidence ?? 70,
      requiresDecision: input.requiresDecision ? 'true' : 'false',
      createdAt: timestamp,
    });
    const [created] = await db
      .select()
      .from(businessLineReviews)
      .where(eq(businessLineReviews.id, id))
      .limit(1);
    return businessLineReviewFromRow(created);
  }

  async listSkillRevisions(businessLineId: string): Promise<BusinessLineSkillRevision[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(businessLineSkillRevisions)
      .where(eq(businessLineSkillRevisions.businessLineId, businessLineId))
      .orderBy(desc(businessLineSkillRevisions.createdAt));
    return rows.map(businessLineSkillRevisionFromRow);
  }

  async findSkillRevisionById(id: string): Promise<BusinessLineSkillRevision | null> {
    const db = initDatabase();
    const [row] = await db
      .select()
      .from(businessLineSkillRevisions)
      .where(eq(businessLineSkillRevisions.id, id))
      .limit(1);
    return row ? businessLineSkillRevisionFromRow(row) : null;
  }

  async createSkillRevision(input: {
    businessLineId: string;
    sourceReviewId: string;
    nextContent: string;
    changeReason: string;
    previousContent?: string | null;
    scopePath?: string;
    provenance?: BusinessLineSkillRevisionProvenance | null;
    reviewAfterAt?: string | null;
    expiresAt?: string | null;
  }): Promise<BusinessLineSkillRevision> {
    const db = initDatabase();
    const timestamp = nowIso();
    const id = generateId('business_line_skill_revision');
    const previousContent = input.previousContent ?? null;
    const nextContent = input.nextContent.trim();
    await db.insert(businessLineSkillRevisions).values({
      id,
      skillId: generateId('business_line_skill'),
      businessLineId: input.businessLineId,
      scopePath: input.scopePath ?? 'Learning / SOP',
      previousContent,
      nextContent,
      contentDiff: buildContentDiff(previousContent, nextContent),
      changeReason: input.changeReason.trim(),
      sourceReviewId: input.sourceReviewId,
      provenance: serializeJson(input.provenance ?? {
        sourceType: 'business_line_review',
        sourceReviewId: input.sourceReviewId,
      }),
      approvedBy: null,
      approvalSourceType: null,
      approvalSourceId: null,
      status: 'proposed',
      effectiveAt: null,
      rollbackTargetRevisionId: null,
      supersededByRevisionId: null,
      rejectedBy: null,
      rejectedAt: null,
      disabledBy: null,
      disabledAt: null,
      reviewAfterAt: input.reviewAfterAt ?? null,
      expiresAt: input.expiresAt ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const [created] = await db
      .select()
      .from(businessLineSkillRevisions)
      .where(eq(businessLineSkillRevisions.id, id))
      .limit(1);
    return businessLineSkillRevisionFromRow(created);
  }

  async activateSkillRevision(input: {
    id: string;
    approvedBy: string | null;
    approvalSourceType: BusinessLineSkillRevisionApprovalSourceType;
    approvalSourceId?: string | null;
  }): Promise<BusinessLineSkillRevision> {
    const db = initDatabase();
    const timestamp = nowIso();
    return db.transaction((tx) => {
      const [current] = tx
        .select()
        .from(businessLineSkillRevisions)
        .where(eq(businessLineSkillRevisions.id, input.id))
        .limit(1)
        .all();
      if (!current) throw new Error(`Business line skill revision not found: ${input.id}`);
      const currentRevision = businessLineSkillRevisionFromRow(current);
      if (currentRevision.status !== 'proposed') {
        throw new Error(`Only proposed business-line skill revisions can be activated: ${input.id}`);
      }
      const activeRows = tx
        .select()
        .from(businessLineSkillRevisions)
        .where(and(
          eq(businessLineSkillRevisions.businessLineId, currentRevision.businessLineId),
          eq(businessLineSkillRevisions.scopePath, currentRevision.scopePath),
          eq(businessLineSkillRevisions.status, 'active'),
        ))
        .orderBy(desc(businessLineSkillRevisions.effectiveAt))
        .all();
      const activeRevisions = activeRows.map(businessLineSkillRevisionFromRow);
      const rollbackTargetRevision = activeRevisions[0] ?? null;
      for (const activeRevision of activeRevisions) {
        tx
          .update(businessLineSkillRevisions)
          .set({
            status: 'superseded',
            supersededByRevisionId: currentRevision.id,
            updatedAt: timestamp,
          })
          .where(eq(businessLineSkillRevisions.id, activeRevision.id))
          .run();
      }
      tx
        .update(businessLineSkillRevisions)
        .set({
          approvedBy: input.approvedBy,
          approvalSourceType: input.approvalSourceType,
          approvalSourceId: input.approvalSourceId ?? null,
          status: 'active',
          effectiveAt: timestamp,
          rollbackTargetRevisionId: rollbackTargetRevision?.id ?? currentRevision.rollbackTargetRevisionId ?? null,
          previousContent: currentRevision.previousContent ?? rollbackTargetRevision?.nextContent ?? null,
          contentDiff: buildContentDiff(
            currentRevision.previousContent ?? rollbackTargetRevision?.nextContent ?? null,
            currentRevision.nextContent,
          ),
          updatedAt: timestamp,
        })
        .where(eq(businessLineSkillRevisions.id, input.id))
        .run();
      const [updated] = tx
        .select()
        .from(businessLineSkillRevisions)
        .where(eq(businessLineSkillRevisions.id, input.id))
        .limit(1)
        .all();
      if (!updated) throw new Error(`Business line skill revision not found: ${input.id}`);
      return businessLineSkillRevisionFromRow(updated);
    });
  }

  async rejectSkillRevision(id: string, rejectedBy: string | null): Promise<BusinessLineSkillRevision> {
    return this.updateSkillRevisionStatus({
      id,
      status: 'rejected',
      actorField: 'rejectedBy',
      atField: 'rejectedAt',
      actor: rejectedBy,
      allowedStatuses: ['proposed'],
    });
  }

  async disableSkillRevision(id: string, disabledBy: string | null): Promise<BusinessLineSkillRevision> {
    return this.updateSkillRevisionStatus({
      id,
      status: 'disabled',
      actorField: 'disabledBy',
      atField: 'disabledAt',
      actor: disabledBy,
      allowedStatuses: ['active'],
    });
  }

  async rollbackSkillRevision(id: string, approvedBy: string | null): Promise<BusinessLineSkillRevision> {
    const db = initDatabase();
    const timestamp = nowIso();
    return db.transaction((tx) => {
      const [current] = tx
        .select()
        .from(businessLineSkillRevisions)
        .where(eq(businessLineSkillRevisions.id, id))
        .limit(1)
        .all();
      if (!current) throw new Error(`Business line skill revision not found: ${id}`);
      const currentRevision = businessLineSkillRevisionFromRow(current);
      if (currentRevision.status !== 'active') {
        throw new Error(`Only active business-line skill revisions can be rolled back: ${id}`);
      }

      tx
        .update(businessLineSkillRevisions)
        .set({
          status: 'disabled',
          disabledBy: approvedBy,
          disabledAt: timestamp,
          updatedAt: timestamp,
        })
        .where(eq(businessLineSkillRevisions.id, id))
        .run();

      if (!currentRevision.rollbackTargetRevisionId) {
        const [disabled] = tx
          .select()
          .from(businessLineSkillRevisions)
          .where(eq(businessLineSkillRevisions.id, id))
          .limit(1)
          .all();
        return businessLineSkillRevisionFromRow(disabled);
      }

      tx
        .update(businessLineSkillRevisions)
        .set({
          approvedBy: approvedBy ?? currentRevision.approvedBy,
          approvalSourceType: 'rollback',
          approvalSourceId: currentRevision.id,
          status: 'active',
          effectiveAt: timestamp,
          supersededByRevisionId: null,
          updatedAt: timestamp,
        })
        .where(eq(businessLineSkillRevisions.id, currentRevision.rollbackTargetRevisionId))
        .run();

      const [restored] = tx
        .select()
        .from(businessLineSkillRevisions)
        .where(eq(businessLineSkillRevisions.id, currentRevision.rollbackTargetRevisionId))
        .limit(1)
        .all();
      return businessLineSkillRevisionFromRow(restored);
    });
  }

  private async updateSkillRevisionStatus(input: {
    id: string;
    status: Extract<BusinessLineSkillRevisionStatus, 'rejected' | 'disabled'>;
    actorField: 'rejectedBy' | 'disabledBy';
    atField: 'rejectedAt' | 'disabledAt';
    actor: string | null;
    allowedStatuses: BusinessLineSkillRevisionStatus[];
  }): Promise<BusinessLineSkillRevision> {
    const db = initDatabase();
    const [current] = await db
      .select()
      .from(businessLineSkillRevisions)
      .where(eq(businessLineSkillRevisions.id, input.id))
      .limit(1);
    if (!current) throw new Error(`Business line skill revision not found: ${input.id}`);
    const currentRevision = businessLineSkillRevisionFromRow(current);
    if (!input.allowedStatuses.includes(currentRevision.status)) {
      throw new Error(`Business line skill revision ${input.id} cannot move from ${currentRevision.status} to ${input.status}.`);
    }
    const timestamp = nowIso();
    await db
      .update(businessLineSkillRevisions)
      .set({
        status: input.status,
        [input.actorField]: input.actor,
        [input.atField]: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(businessLineSkillRevisions.id, input.id));
    const [updated] = await db
      .select()
      .from(businessLineSkillRevisions)
      .where(eq(businessLineSkillRevisions.id, input.id))
      .limit(1);
    return businessLineSkillRevisionFromRow(updated);
  }
}
