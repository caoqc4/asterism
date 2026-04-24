import { asc, eq } from 'drizzle-orm';

import type {
  RunStepKind,
  RunStepRecord,
  RunStepStatus,
} from '../../../shared/types/run.js';
import { initDatabase } from '../client.js';
import { runSteps } from '../schema.js';
import { generateId, nowIso } from './repository-utils.js';

type CreateRunStepInput = {
  runId: string;
  kind: RunStepKind;
  status?: RunStepStatus;
  title: string;
  input?: string | null;
  output?: string | null;
  error?: string | null;
};

type UpdateRunStepInput = {
  status: RunStepStatus;
  output?: string | null;
  error?: string | null;
};

function toRecord(row: typeof runSteps.$inferSelect): RunStepRecord {
  return {
    id: row.id,
    runId: row.runId,
    index: row.index,
    kind: row.kind as RunStepKind,
    status: row.status as RunStepStatus,
    title: row.title,
    input: row.input,
    output: row.output,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class RunStepRepository {
  async listForRun(runId: string): Promise<RunStepRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(runSteps)
      .where(eq(runSteps.runId, runId))
      .orderBy(asc(runSteps.index), asc(runSteps.createdAt));

    return rows.map(toRecord);
  }

  async create(input: CreateRunStepInput): Promise<RunStepRecord> {
    const db = initDatabase();
    const existing = await this.listForRun(input.runId);
    const timestamp = nowIso();
    const id = generateId('run_step');

    await db.insert(runSteps).values({
      id,
      runId: input.runId,
      index: existing.length + 1,
      kind: input.kind,
      status: input.status ?? 'completed',
      title: input.title,
      input: input.input?.trim() || null,
      output: input.output?.trim() || null,
      error: input.error?.trim() || null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const [created] = await db.select().from(runSteps).where(eq(runSteps.id, id)).limit(1);
    return toRecord(created);
  }

  async update(id: string, input: UpdateRunStepInput): Promise<RunStepRecord> {
    const db = initDatabase();
    const timestamp = nowIso();

    await db
      .update(runSteps)
      .set({
        status: input.status,
        output: input.output?.trim() || null,
        error: input.error?.trim() || null,
        updatedAt: timestamp,
      })
      .where(eq(runSteps.id, id));

    const [updated] = await db.select().from(runSteps).where(eq(runSteps.id, id)).limit(1);

    if (!updated) {
      throw new Error(`Run step not found: ${id}`);
    }

    return toRecord(updated);
  }
}
