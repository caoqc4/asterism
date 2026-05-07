import { asc, and, eq } from 'drizzle-orm';

import type {
  RunVerificationRecord,
  RunVerificationSource,
  RunVerificationTargetType,
  RunVerificationTone,
} from '../../../shared/types/run.js';
import { initDatabase } from '../client.js';
import { runVerifications } from '../schema.js';
import { generateId, nowIso } from './repository-utils.js';

type UpsertRunVerificationInput = {
  runId: string;
  targetType: RunVerificationTargetType;
  targetId: string;
  tone: RunVerificationTone;
  label: string;
  detail: string;
  source: RunVerificationSource;
};

function toRecord(row: typeof runVerifications.$inferSelect): RunVerificationRecord {
  return {
    id: row.id,
    runId: row.runId,
    targetType: row.targetType as RunVerificationTargetType,
    targetId: row.targetId,
    tone: row.tone as RunVerificationTone,
    label: row.label,
    detail: row.detail,
    source: row.source as RunVerificationSource,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class RunVerificationRepository {
  async listForRun(runId: string): Promise<RunVerificationRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(runVerifications)
      .where(eq(runVerifications.runId, runId))
      .orderBy(asc(runVerifications.createdAt));

    return rows.map(toRecord);
  }

  async upsert(input: UpsertRunVerificationInput): Promise<RunVerificationRecord> {
    const db = initDatabase();
    const [existing] = await db
      .select()
      .from(runVerifications)
      .where(and(
        eq(runVerifications.runId, input.runId),
        eq(runVerifications.targetType, input.targetType),
        eq(runVerifications.targetId, input.targetId),
        eq(runVerifications.source, input.source),
      ))
      .limit(1);
    const timestamp = nowIso();

    if (existing) {
      await db
        .update(runVerifications)
        .set({
          tone: input.tone,
          label: input.label,
          detail: input.detail,
          updatedAt: timestamp,
        })
        .where(eq(runVerifications.id, existing.id));

      const [updated] = await db
        .select()
        .from(runVerifications)
        .where(eq(runVerifications.id, existing.id))
        .limit(1);
      return toRecord(updated);
    }

    const id = generateId('run_verification');
    await db.insert(runVerifications).values({
      id,
      runId: input.runId,
      targetType: input.targetType,
      targetId: input.targetId,
      tone: input.tone,
      label: input.label,
      detail: input.detail,
      source: input.source,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const [created] = await db
      .select()
      .from(runVerifications)
      .where(eq(runVerifications.id, id))
      .limit(1);
    return toRecord(created);
  }
}
