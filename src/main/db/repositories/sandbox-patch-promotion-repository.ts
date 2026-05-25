import { and, eq } from 'drizzle-orm';

import type {
  CreateSandboxPatchPromotionInput,
  SandboxPatchPromotionRecord,
  SandboxPatchPromotionStatus,
} from '../../../shared/types/sandbox-patch-promotion.js';
import { initDatabase } from '../client.js';
import { sandboxPatchPromotions } from '../schema.js';
import { generateId, nowIso } from './repository-utils.js';

function toRecord(row: typeof sandboxPatchPromotions.$inferSelect): SandboxPatchPromotionRecord {
  return {
    id: row.id,
    checkpointId: row.checkpointId,
    runId: row.runId,
    taskId: row.taskId,
    artifactId: row.artifactId,
    sourceId: row.sourceId,
    decisionId: row.decisionId,
    patchDigest: row.patchDigest,
    expectedFiles: JSON.parse(row.expectedFiles) as string[],
    status: row.status as SandboxPatchPromotionStatus,
    auditSummary: row.auditSummary,
    blockedReasons: JSON.parse(row.blockedReasons) as string[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    appliedAt: row.appliedAt,
  };
}

export class SandboxPatchPromotionRepository {
  async createPending(input: CreateSandboxPatchPromotionInput): Promise<SandboxPatchPromotionRecord> {
    const existing = await this.findByCheckpointId(input.checkpointId);

    if (existing) {
      return existing;
    }

    const db = initDatabase();
    const id = generateId('sandbox_patch_promotion');
    const timestamp = nowIso();

    await db.insert(sandboxPatchPromotions).values({
      id,
      checkpointId: input.checkpointId,
      runId: input.runId,
      taskId: input.taskId,
      artifactId: input.artifactId,
      sourceId: input.sourceId,
      decisionId: input.decisionId,
      patchDigest: input.patchDigest,
      expectedFiles: JSON.stringify(uniqueTrimmed(input.expectedFiles)),
      status: 'pending',
      auditSummary: input.auditSummary?.trim() || null,
      blockedReasons: JSON.stringify([]),
      createdAt: timestamp,
      updatedAt: timestamp,
      appliedAt: null,
    });

    const [created] = await db
      .select()
      .from(sandboxPatchPromotions)
      .where(eq(sandboxPatchPromotions.id, id))
      .limit(1);

    return toRecord(created);
  }

  async findByCheckpointId(checkpointId: string): Promise<SandboxPatchPromotionRecord | null> {
    const db = initDatabase();
    const [row] = await db
      .select()
      .from(sandboxPatchPromotions)
      .where(eq(sandboxPatchPromotions.checkpointId, checkpointId))
      .limit(1);

    return row ? toRecord(row) : null;
  }

  async listForRun(runId: string): Promise<SandboxPatchPromotionRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(sandboxPatchPromotions)
      .where(eq(sandboxPatchPromotions.runId, runId));

    return rows.map(toRecord);
  }

  async findBySourceDigest(
    sourceId: string,
    patchDigest: string,
  ): Promise<SandboxPatchPromotionRecord | null> {
    const db = initDatabase();
    const [row] = await db
      .select()
      .from(sandboxPatchPromotions)
      .where(and(
        eq(sandboxPatchPromotions.sourceId, sourceId),
        eq(sandboxPatchPromotions.patchDigest, patchDigest),
      ))
      .limit(1);

    return row ? toRecord(row) : null;
  }

  async markApplied(
    id: string,
    auditSummary?: string | null,
  ): Promise<SandboxPatchPromotionRecord> {
    const db = initDatabase();
    const timestamp = nowIso();

    await db
      .update(sandboxPatchPromotions)
      .set({
        status: 'applied',
        auditSummary: auditSummary?.trim() || null,
        updatedAt: timestamp,
        appliedAt: timestamp,
      })
      .where(eq(sandboxPatchPromotions.id, id));

    return this.mustFindById(id);
  }

  async markBlocked(
    id: string,
    blockedReasons: string[],
    auditSummary?: string | null,
  ): Promise<SandboxPatchPromotionRecord> {
    const db = initDatabase();
    const timestamp = nowIso();

    await db
      .update(sandboxPatchPromotions)
      .set({
        status: 'blocked',
        auditSummary: auditSummary?.trim() || null,
        blockedReasons: JSON.stringify(uniqueTrimmed(blockedReasons)),
        updatedAt: timestamp,
      })
      .where(eq(sandboxPatchPromotions.id, id));

    return this.mustFindById(id);
  }

  private async mustFindById(id: string): Promise<SandboxPatchPromotionRecord> {
    const db = initDatabase();
    const [row] = await db
      .select()
      .from(sandboxPatchPromotions)
      .where(eq(sandboxPatchPromotions.id, id))
      .limit(1);

    if (!row) {
      throw new Error(`Sandbox patch promotion not found: ${id}`);
    }

    return toRecord(row);
  }
}

function uniqueTrimmed(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
