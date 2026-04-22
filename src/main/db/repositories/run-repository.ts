import { and, desc, eq, inArray, lt } from 'drizzle-orm';

import type {
  CreateRunInput,
  RunOutputSource,
  RunRecord,
  RunStatus,
} from '../../../shared/types/run.js';
import { runs, timelineEvents } from '../schema.js';
import { initDatabase } from '../client.js';

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function toRecord(row: typeof runs.$inferSelect): RunRecord {
  return {
    id: row.id,
    taskId: row.taskId,
    type: row.type as RunRecord['type'],
    status: row.status as RunStatus,
    instructions: row.instructions,
    output: row.output,
    outputSource: (row.outputSource as RunOutputSource | null) ?? null,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class RunRepository {
  async list(): Promise<RunRecord[]> {
    const db = initDatabase();
    const rows = await db.select().from(runs).orderBy(desc(runs.updatedAt));
    return rows.map(toRecord);
  }

  async getDetail(runId: string): Promise<RunRecord | null> {
    const db = initDatabase();
    const [row] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
    return row ? toRecord(row) : null;
  }

  async create(input: CreateRunInput): Promise<RunRecord> {
    const db = initDatabase();
    const id = generateId('run');
    const timestamp = nowIso();

    await db.insert(runs).values({
      id,
      taskId: input.taskId,
      type: input.type,
      status: 'running',
      instructions: input.instructions?.trim() || null,
      output: null,
      outputSource: null,
      failureReason: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await db.insert(timelineEvents).values({
      id: generateId('timeline'),
      taskId: input.taskId,
      type: 'run.created',
      payload: JSON.stringify({ runId: id, type: input.type }),
      createdAt: timestamp,
    });

    const [created] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
    return toRecord(created);
  }

  async updateResult(
    runId: string,
    status: RunStatus,
    output: string | null,
    outputSource: RunOutputSource,
    failureReason: string | null = null,
  ): Promise<RunRecord> {
    const db = initDatabase();
    const [current] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);

    if (!current) {
      throw new Error(`Run not found: ${runId}`);
    }

    const timestamp = nowIso();

    await db
      .update(runs)
      .set({
        status,
        output,
        outputSource,
        failureReason,
        updatedAt: timestamp,
      })
      .where(eq(runs.id, runId));

    await db.insert(timelineEvents).values({
      id: generateId('timeline'),
      taskId: current.taskId,
      type: status === 'failed' ? 'run.failed' : 'run.completed',
      payload: JSON.stringify({ runId, status }),
      createdAt: timestamp,
    });

    const [updated] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
    return toRecord(updated);
  }

  async listIncompleteOlderThan(olderThanIso: string): Promise<RunRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(runs)
      .where(
        and(
          inArray(runs.status, ['pending', 'running']),
          lt(runs.updatedAt, olderThanIso),
        ),
      )
      .orderBy(desc(runs.updatedAt));

    return rows.map(toRecord);
  }
}
