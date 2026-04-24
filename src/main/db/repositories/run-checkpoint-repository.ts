import { asc, eq } from 'drizzle-orm';

import type {
  RunCheckpointKind,
  RunCheckpointRecord,
  RunCheckpointStatus,
} from '../../../shared/types/run.js';
import { initDatabase } from '../client.js';
import { runCheckpoints } from '../schema.js';
import { generateId, nowIso } from './repository-utils.js';

type CreateRunCheckpointInput = {
  runId: string;
  stepId?: string | null;
  kind: RunCheckpointKind;
  payload?: string | null;
};

function toRecord(row: typeof runCheckpoints.$inferSelect): RunCheckpointRecord {
  return {
    id: row.id,
    runId: row.runId,
    stepId: row.stepId,
    kind: row.kind as RunCheckpointKind,
    status: row.status as RunCheckpointStatus,
    payload: row.payload,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  };
}

export class RunCheckpointRepository {
  async listForRun(runId: string): Promise<RunCheckpointRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(runCheckpoints)
      .where(eq(runCheckpoints.runId, runId))
      .orderBy(asc(runCheckpoints.createdAt));

    return rows.map(toRecord);
  }

  async create(input: CreateRunCheckpointInput): Promise<RunCheckpointRecord> {
    const db = initDatabase();
    const id = generateId('run_checkpoint');
    const timestamp = nowIso();

    await db.insert(runCheckpoints).values({
      id,
      runId: input.runId,
      stepId: input.stepId ?? null,
      kind: input.kind,
      status: 'open',
      payload: input.payload?.trim() || null,
      createdAt: timestamp,
      resolvedAt: null,
    });

    const [created] = await db.select().from(runCheckpoints).where(eq(runCheckpoints.id, id)).limit(1);
    return toRecord(created);
  }
}
