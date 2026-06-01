import { and, desc, eq, inArray } from 'drizzle-orm';

import type {
  BlockerRecord,
  CreateBlockerInput,
  UpdateBlockerInput,
} from '../../../shared/types/blocker.js';
import { initDatabase } from '../client.js';
import { blockers } from '../schema.js';
import { generateId, normalizeValue, nowIso } from './repository-utils.js';

function toRecord(row: typeof blockers.$inferSelect): BlockerRecord {
  return {
    id: row.id,
    taskId: row.taskId,
    title: row.title,
    kind: row.kind as BlockerRecord['kind'],
    detail: row.detail,
    owner: row.owner,
    responsibility: row.responsibility as BlockerRecord['responsibility'],
    responsibilityLabel: row.responsibilityLabel,
    sourceContextId: row.sourceContextId,
    status: row.status as BlockerRecord['status'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt,
  };
}

export class BlockerRepository {
  async get(id: string): Promise<BlockerRecord | null> {
    const db = initDatabase();
    const [row] = await db.select().from(blockers).where(eq(blockers.id, id)).limit(1);
    return row ? toRecord(row) : null;
  }

  async getActiveForTask(taskId: string): Promise<BlockerRecord | null> {
    const db = initDatabase();
    const [row] = await db
      .select()
      .from(blockers)
      .where(and(eq(blockers.taskId, taskId), eq(blockers.status, 'active')))
      .orderBy(desc(blockers.updatedAt))
      .limit(1);

    return row ? toRecord(row) : null;
  }

  async listActiveForTasks(taskIds: string[]): Promise<BlockerRecord[]> {
    if (taskIds.length === 0) {
      return [];
    }

    const db = initDatabase();
    const rows = await db
      .select()
      .from(blockers)
      .where(and(inArray(blockers.taskId, taskIds), eq(blockers.status, 'active')))
      .orderBy(desc(blockers.updatedAt));

    return rows.map(toRecord);
  }

  async create(input: CreateBlockerInput): Promise<BlockerRecord> {
    const db = initDatabase();
    const timestamp = nowIso();
    const id = generateId('blocker');

    await db.insert(blockers).values({
      id,
      taskId: input.taskId,
      title: input.title.trim(),
      kind: input.kind,
      detail: normalizeValue(input.detail),
      owner: normalizeValue(input.owner),
      responsibility: normalizeValue(input.responsibility),
      responsibilityLabel: normalizeValue(input.responsibilityLabel),
      sourceContextId: normalizeValue(input.sourceContextId),
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      resolvedAt: null,
    });

    const [created] = await db.select().from(blockers).where(eq(blockers.id, id)).limit(1);
    return toRecord(created);
  }

  async update(input: UpdateBlockerInput): Promise<BlockerRecord> {
    const db = initDatabase();
    const [current] = await db.select().from(blockers).where(eq(blockers.id, input.id)).limit(1);

    if (!current) {
      throw new Error(`Blocker not found: ${input.id}`);
    }

    await db
      .update(blockers)
      .set({
        title: input.title?.trim() || current.title,
        kind: input.kind ?? current.kind,
        detail: input.detail === undefined ? current.detail : normalizeValue(input.detail),
        owner: input.owner === undefined ? current.owner : normalizeValue(input.owner),
        responsibility:
          input.responsibility === undefined ? current.responsibility : normalizeValue(input.responsibility),
        responsibilityLabel:
          input.responsibilityLabel === undefined
            ? current.responsibilityLabel
            : normalizeValue(input.responsibilityLabel),
        sourceContextId:
          input.sourceContextId === undefined
            ? current.sourceContextId
            : normalizeValue(input.sourceContextId),
        updatedAt: nowIso(),
      })
      .where(eq(blockers.id, input.id));

    const [updated] = await db.select().from(blockers).where(eq(blockers.id, input.id)).limit(1);
    return toRecord(updated);
  }

  async resolve(id: string): Promise<BlockerRecord> {
    const db = initDatabase();
    const [current] = await db.select().from(blockers).where(eq(blockers.id, id)).limit(1);

    if (!current) {
      throw new Error(`Blocker not found: ${id}`);
    }

    const timestamp = nowIso();
    await db
      .update(blockers)
      .set({
        status: 'resolved',
        updatedAt: timestamp,
        resolvedAt: timestamp,
      })
      .where(eq(blockers.id, id));

    const [resolved] = await db.select().from(blockers).where(eq(blockers.id, id)).limit(1);
    return toRecord(resolved);
  }
}
