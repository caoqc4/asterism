import { and, desc, eq } from 'drizzle-orm';

import type { WaitingItemRecord } from '../../../shared/types/waiting-item.js';
import { initDatabase } from '../client.js';
import { waitingItems } from '../schema.js';

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function mapWaitingItem(row: typeof waitingItems.$inferSelect): WaitingItemRecord {
  return {
    id: row.id,
    taskId: row.taskId,
    reason: row.reason,
    status: row.status as WaitingItemRecord['status'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt,
  };
}

export class WaitingItemRepository {
  async getActiveForTask(taskId: string): Promise<WaitingItemRecord | null> {
    const db = initDatabase();
    const [row] = await db
      .select()
      .from(waitingItems)
      .where(and(eq(waitingItems.taskId, taskId), eq(waitingItems.status, 'active')))
      .orderBy(desc(waitingItems.updatedAt))
      .limit(1);

    return row ? mapWaitingItem(row) : null;
  }

  async upsertActive(
    taskId: string,
    reason: string,
  ): Promise<{ item: WaitingItemRecord; action: 'created' | 'updated' }> {
    const db = initDatabase();
    const trimmedReason = reason.trim();
    const timestamp = nowIso();
    const active = await this.getActiveForTask(taskId);

    if (active) {
      await db
        .update(waitingItems)
        .set({
          reason: trimmedReason,
          updatedAt: timestamp,
          resolvedAt: null,
        })
        .where(eq(waitingItems.id, active.id));

      const [updated] = await db.select().from(waitingItems).where(eq(waitingItems.id, active.id)).limit(1);
      return {
        item: mapWaitingItem(updated),
        action: 'updated',
      };
    }

    const id = generateId('waiting');
    await db.insert(waitingItems).values({
      id,
      taskId,
      reason: trimmedReason,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      resolvedAt: null,
    });

    const [created] = await db.select().from(waitingItems).where(eq(waitingItems.id, id)).limit(1);
    return {
      item: mapWaitingItem(created),
      action: 'created',
    };
  }

  async resolveActive(taskId: string): Promise<WaitingItemRecord | null> {
    const db = initDatabase();
    const timestamp = nowIso();
    const active = await this.getActiveForTask(taskId);

    if (!active) {
      return null;
    }

    await db
      .update(waitingItems)
      .set({
        status: 'resolved',
        updatedAt: timestamp,
        resolvedAt: timestamp,
      })
      .where(eq(waitingItems.id, active.id));

    const [resolved] = await db.select().from(waitingItems).where(eq(waitingItems.id, active.id)).limit(1);

    return mapWaitingItem(resolved);
  }
}
