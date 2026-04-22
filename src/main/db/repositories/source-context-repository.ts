import { and, desc, eq, inArray } from 'drizzle-orm';

import type {
  CreateSourceContextInput,
  SourceContextRecord,
  UpdateSourceContextInput,
} from '../../../shared/types/source-context.js';
import { sourceContexts } from '../schema.js';
import { initDatabase } from '../client.js';

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function normalizeValue(value: string | null | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

function sortSourceContexts(rows: SourceContextRecord[]): SourceContextRecord[] {
  return [...rows].sort((left, right) => {
    if (left.isKey !== right.isKey) {
      return left.isKey ? -1 : 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function toRecord(row: typeof sourceContexts.$inferSelect): SourceContextRecord {
  return {
    id: row.id,
    taskId: row.taskId,
    title: row.title,
    kind: row.kind as SourceContextRecord['kind'],
    isKey: row.isKey === 'true',
    uri: row.uri,
    content: row.content,
    note: row.note,
    status: row.status as SourceContextRecord['status'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

export class SourceContextRepository {
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
    const db = initDatabase();
    const timestamp = nowIso();
    const id = generateId('source_context');

    await db.insert(sourceContexts).values({
      id,
      taskId: input.taskId,
      title: input.title.trim(),
      kind: input.kind,
      isKey: input.isKey ? 'true' : 'false',
      uri: normalizeValue(input.uri),
      content: normalizeValue(input.content),
      note: normalizeValue(input.note),
      status: 'active',
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
