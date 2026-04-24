import { desc, eq } from 'drizzle-orm';

import type {
  CreateDecisionInput,
  DecisionActionInput,
  DecisionRecord,
  DecisionStatus,
} from '../../../shared/types/decision.js';
import { decisionRequests, timelineEvents } from '../schema.js';
import { initDatabase } from '../client.js';
import { generateId, nowIso } from './repository-utils.js';

function toRecord(row: typeof decisionRequests.$inferSelect): DecisionRecord {
  return {
    id: row.id,
    taskId: row.taskId,
    title: row.title,
    status: row.status as DecisionStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DecisionRepository {
  async list(): Promise<DecisionRecord[]> {
    const db = initDatabase();
    const rows = await db.select().from(decisionRequests).orderBy(desc(decisionRequests.updatedAt));
    return rows.map(toRecord);
  }

  async create(input: CreateDecisionInput): Promise<DecisionRecord> {
    const db = initDatabase();
    const timestamp = nowIso();
    const id = generateId('decision');

    await db.insert(decisionRequests).values({
      id,
      taskId: input.taskId,
      title: input.title.trim(),
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await db.insert(timelineEvents).values({
      id: generateId('timeline'),
      taskId: input.taskId,
      type: 'decision.created',
      payload: JSON.stringify({ decisionId: id, title: input.title.trim() }),
      createdAt: timestamp,
    });

    const [created] = await db
      .select()
      .from(decisionRequests)
      .where(eq(decisionRequests.id, id))
      .limit(1);

    return toRecord(created);
  }

  async act(input: DecisionActionInput): Promise<DecisionRecord> {
    const db = initDatabase();
    const [current] = await db
      .select()
      .from(decisionRequests)
      .where(eq(decisionRequests.id, input.id))
      .limit(1);

    if (!current) {
      throw new Error(`Decision not found: ${input.id}`);
    }

    const statusMap: Record<DecisionActionInput['action'], DecisionStatus> = {
      approve: 'approved',
      defer: 'deferred',
      cancel: 'cancelled',
    };
    const nextStatus = statusMap[input.action];
    const timestamp = nowIso();

    await db
      .update(decisionRequests)
      .set({
        status: nextStatus,
        updatedAt: timestamp,
      })
      .where(eq(decisionRequests.id, input.id));

    await db.insert(timelineEvents).values({
      id: generateId('timeline'),
      taskId: current.taskId,
      type: 'decision.acted',
      payload: JSON.stringify({ decisionId: input.id, action: input.action, status: nextStatus }),
      createdAt: timestamp,
    });

    const [updated] = await db
      .select()
      .from(decisionRequests)
      .where(eq(decisionRequests.id, input.id))
      .limit(1);

    return toRecord(updated);
  }
}
