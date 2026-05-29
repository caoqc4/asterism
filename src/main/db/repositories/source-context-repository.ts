import { and, desc, eq, inArray } from 'drizzle-orm';

import type {
  CreateSourceContextInput,
  SourceContextCredibility,
  SourceContextRole,
  SourceContextRecord,
  UpdateSourceContextInput,
} from '../../../shared/types/source-context.js';
import { assertCanonicalWriteInput } from '../../../shared/canonical-data-contract.js';
import { sourceContexts } from '../schema.js';
import { initDatabase } from '../client.js';
import { generateId, normalizeValue, nowIso } from './repository-utils.js';

function sortSourceContexts(rows: SourceContextRecord[]): SourceContextRecord[] {
  return [...rows].sort((left, right) => {
    if (left.isKey !== right.isKey) {
      return left.isKey ? -1 : 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function toRecord(row: typeof sourceContexts.$inferSelect): SourceContextRecord {
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

export class SourceContextRepository {
  async get(id: string): Promise<SourceContextRecord | null> {
    const db = initDatabase();
    const [row] = await db
      .select()
      .from(sourceContexts)
      .where(eq(sourceContexts.id, id))
      .limit(1);

    return row ? toRecord(row) : null;
  }

  async listActiveForTask(taskId: string): Promise<SourceContextRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(sourceContexts)
      .where(and(eq(sourceContexts.taskId, taskId), eq(sourceContexts.status, 'active')))
      .orderBy(desc(sourceContexts.updatedAt));

    return sortSourceContexts(rows.map(toRecord));
  }

  async listActiveForTasks(taskIds: string[]): Promise<SourceContextRecord[]> {
    if (taskIds.length === 0) {
      return [];
    }

    const db = initDatabase();
    const rows = await db
      .select()
      .from(sourceContexts)
      .where(
        and(
          inArray(sourceContexts.taskId, taskIds),
          eq(sourceContexts.status, 'active'),
        ),
      )
      .orderBy(desc(sourceContexts.updatedAt));

    return sortSourceContexts(rows.map(toRecord));
  }

  async create(input: CreateSourceContextInput): Promise<SourceContextRecord> {
    assertCanonicalWriteInput({
      domain: 'source_context',
      input: input as Record<string, unknown>,
      allowedFields: ['taskId', 'businessLineId', 'title', 'kind', 'isKey', 'uri', 'content', 'note', 'capturedAt', 'runId', 'batchId', 'sourceRole', 'credibility', 'isDuplicate', 'containsSensitiveData'],
      requiredFields: ['taskId', 'title', 'kind'],
    });
    const db = initDatabase();
    const timestamp = nowIso();
    const id = generateId('source_context');
    const runId = normalizeValue(input.runId);
    const capturedAt = normalizeValue(input.capturedAt) ?? timestamp;

    await db.insert(sourceContexts).values({
      id,
      taskId: input.taskId,
      businessLineId: input.businessLineId?.trim() || null,
      title: input.title.trim(),
      kind: input.kind,
      isKey: input.isKey ? 'true' : 'false',
      uri: normalizeValue(input.uri),
      content: normalizeValue(input.content),
      note: normalizeValue(input.note),
      status: 'active',
      capturedAt,
      runId,
      batchId: normalizeValue(input.batchId) ?? (runId ? `run:${runId}` : null),
      sourceRole: input.sourceRole ?? 'raw',
      credibility: input.credibility ?? null,
      isDuplicate: input.isDuplicate ? 'true' : 'false',
      containsSensitiveData: input.containsSensitiveData ? 'true' : 'false',
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    });

    const [created] = await db
      .select()
      .from(sourceContexts)
      .where(eq(sourceContexts.id, id))
      .limit(1);

    return toRecord(created);
  }

  async update(input: UpdateSourceContextInput): Promise<SourceContextRecord> {
    assertCanonicalWriteInput({
      domain: 'source_context',
      input: input as Record<string, unknown>,
      allowedFields: ['id', 'title', 'kind', 'isKey', 'uri', 'content', 'note', 'capturedAt', 'sourceRole', 'credibility', 'isDuplicate', 'containsSensitiveData'],
      requiredFields: ['id'],
    });
    const db = initDatabase();
    const [current] = await db
      .select()
      .from(sourceContexts)
      .where(eq(sourceContexts.id, input.id))
      .limit(1);

    if (!current) {
      throw new Error(`Source context not found: ${input.id}`);
    }

    await db
      .update(sourceContexts)
      .set({
        title: input.title?.trim() || current.title,
        kind: input.kind ?? current.kind,
        isKey: input.isKey === undefined ? current.isKey : input.isKey ? 'true' : 'false',
        uri: input.uri === undefined ? current.uri : normalizeValue(input.uri),
        content: input.content === undefined ? current.content : normalizeValue(input.content),
        note: input.note === undefined ? current.note : normalizeValue(input.note),
        capturedAt: input.capturedAt === undefined ? current.capturedAt : normalizeValue(input.capturedAt),
        sourceRole: input.sourceRole ?? current.sourceRole,
        credibility: input.credibility === undefined ? current.credibility : input.credibility,
        isDuplicate: input.isDuplicate === undefined ? current.isDuplicate : input.isDuplicate ? 'true' : 'false',
        containsSensitiveData: input.containsSensitiveData === undefined
          ? current.containsSensitiveData
          : input.containsSensitiveData ? 'true' : 'false',
        updatedAt: nowIso(),
      })
      .where(eq(sourceContexts.id, input.id));

    const [updated] = await db
      .select()
      .from(sourceContexts)
      .where(eq(sourceContexts.id, input.id))
      .limit(1);

    return toRecord(updated);
  }

  async archive(id: string): Promise<SourceContextRecord> {
    const db = initDatabase();
    const [current] = await db
      .select()
      .from(sourceContexts)
      .where(eq(sourceContexts.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Source context not found: ${id}`);
    }

    const timestamp = nowIso();

    await db
      .update(sourceContexts)
      .set({
        status: 'archived',
        archivedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(sourceContexts.id, id));

    const [updated] = await db
      .select()
      .from(sourceContexts)
      .where(eq(sourceContexts.id, id))
      .limit(1);

    return toRecord(updated);
  }
}
