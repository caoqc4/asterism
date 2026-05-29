import { desc, eq } from 'drizzle-orm';

import type {
  BusinessLine,
  BusinessLineActionLink,
  BusinessLineActionStatus,
  BusinessLineKind,
  BusinessLineRecord,
  BusinessLineRecordType,
  BusinessLineReview,
  BusinessLineSkillRevision,
  BusinessLineSkillRevisionStatus,
  CreateBusinessLineInput,
  RecordBusinessLineReviewInput,
} from '../../../shared/types/business-line.js';
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
} from '../schema.js';
import { initDatabase } from '../client.js';
import { generateId, nowIso } from './repository-utils.js';

type BusinessLineRow = typeof businessLines.$inferSelect;
type BusinessLineActionRow = typeof businessLineActions.$inferSelect;
type BusinessLineRecordRow = typeof businessLineRecords.$inferSelect;
type BusinessLineReviewRow = typeof businessLineReviews.$inferSelect;
type BusinessLineSkillRevisionRow = typeof businessLineSkillRevisions.$inferSelect;

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
  if (value === 'proposed' || value === 'active' || value === 'disabled' || value === 'superseded') {
    return value;
  }
  return 'proposed';
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
  return {
    id: row.id,
    type: normalizeRecordType(row.type),
    businessLineId: row.businessLineId,
    source: row.source,
    summary: row.summary,
    confidence: row.confidence,
    linkedActionId: row.linkedActionId,
    linkedDecisionId: row.linkedDecisionId,
    shouldAffectFutureContext: row.shouldAffectFutureContext === 'true',
    createdAt: row.createdAt,
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
  return {
    id: row.id,
    skillId: row.skillId,
    businessLineId: row.businessLineId,
    scopePath: row.scopePath,
    previousContent: row.previousContent,
    nextContent: row.nextContent,
    changeReason: row.changeReason,
    sourceReviewId: row.sourceReviewId,
    approvedBy: row.approvedBy,
    status: normalizeRevisionStatus(row.status),
    effectiveAt: row.effectiveAt,
    rollbackTargetRevisionId: row.rollbackTargetRevisionId,
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

  async listLinkedActionIds(businessLineId: string): Promise<string[]> {
    const db = initDatabase();
    const actionRows = await db
      .select()
      .from(businessLineActions)
      .where(eq(businessLineActions.businessLineId, businessLineId))
      .orderBy(desc(businessLineActions.updatedAt));
    const linkedFromActionTable = actionRows
      .map(businessLineActionFromRow)
      .filter((link) => link.status === 'active')
      .map((link) => link.taskId);

    if (linkedFromActionTable.length > 0) {
      return linkedFromActionTable;
    }

    const recordRows = await db
      .select()
      .from(businessLineRecords)
      .where(eq(businessLineRecords.businessLineId, businessLineId))
      .orderBy(desc(businessLineRecords.createdAt));

    return recordRows
      .map(businessLineRecordFromRow)
      .filter((record) => record.type === 'action' && Boolean(record.linkedActionId))
      .map((record) => record.linkedActionId!);
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
  }): Promise<BusinessLineSkillRevision> {
    const db = initDatabase();
    const timestamp = nowIso();
    const id = generateId('business_line_skill_revision');
    await db.insert(businessLineSkillRevisions).values({
      id,
      skillId: generateId('business_line_skill'),
      businessLineId: input.businessLineId,
      scopePath: input.scopePath ?? 'Learning / SOP',
      previousContent: input.previousContent ?? null,
      nextContent: input.nextContent.trim(),
      changeReason: input.changeReason.trim(),
      sourceReviewId: input.sourceReviewId,
      approvedBy: null,
      status: 'proposed',
      effectiveAt: null,
      rollbackTargetRevisionId: null,
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

  async activateSkillRevision(id: string, approvedBy: string | null): Promise<BusinessLineSkillRevision> {
    const db = initDatabase();
    const timestamp = nowIso();
    await db
      .update(businessLineSkillRevisions)
      .set({
        approvedBy,
        status: 'active',
        effectiveAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(businessLineSkillRevisions.id, id));
    const [updated] = await db
      .select()
      .from(businessLineSkillRevisions)
      .where(eq(businessLineSkillRevisions.id, id))
      .limit(1);
    if (!updated) throw new Error(`Business line skill revision not found: ${id}`);
    return businessLineSkillRevisionFromRow(updated);
  }
}
