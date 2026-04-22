import { desc } from 'drizzle-orm';

import type { BriefSnapshotRecord } from '../../../shared/types/brief-snapshot.js';
import { initDatabase } from '../client.js';
import { briefSnapshots } from '../schema.js';

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export class BriefSnapshotRepository {
  async create(
    kind: string,
    payload: string,
    source: BriefSnapshotRecord['source'],
    fallbackReason: string | null = null,
  ): Promise<BriefSnapshotRecord> {
    const db = initDatabase();
    const record = {
      id: generateId('brief'),
      kind,
      payload,
      source,
      fallbackReason,
      createdAt: nowIso(),
    };

    await db.insert(briefSnapshots).values(record);

    return record;
  }

  async listRecent(limit = 10): Promise<BriefSnapshotRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(briefSnapshots)
      .orderBy(desc(briefSnapshots.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      payload: row.payload,
      source: row.source as BriefSnapshotRecord['source'],
      fallbackReason: row.fallbackReason,
      createdAt: row.createdAt,
    }));
  }
}
