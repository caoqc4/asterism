import { desc, eq } from 'drizzle-orm';

import type {
  CreateDecisionInput,
  DecisionActionInput,
  DecisionContext,
  DecisionKind,
  DecisionOption,
  DecisionRecord,
  DecisionRecommendation,
  DecisionScope,
  DecisionSourceType,
  DecisionStatus,
} from '../../../shared/types/decision.js';
import { normalizeCreateDecisionInput } from '../../../shared/runtime-surface-routing.js';
import { decisionRequests, timelineEvents } from '../schema.js';
import { initDatabase } from '../client.js';
import { generateId, nowIso } from './repository-utils.js';

function parseJsonField<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function serializeJsonField(value: unknown): string | null {
  if (value == null) return null;
  return JSON.stringify(value);
}

function toRecord(row: typeof decisionRequests.$inferSelect): DecisionRecord {
  return {
    id: row.id,
    taskId: row.taskId || null,
    title: row.title,
    status: row.status as DecisionStatus,
    scope: (row.scope as DecisionScope | null) ?? (row.taskId ? 'task' : 'global'),
    kind: (row.kind as DecisionKind | null) ?? 'direction_choice',
    sourceType: (row.sourceType as DecisionSourceType | null) ?? null,
    sourceId: row.sourceId,
    sourceLabel: row.sourceLabel,
    context: parseJsonField<DecisionContext | null>(row.context, null),
    options: parseJsonField<DecisionOption[]>(row.options, []),
    recommendation: parseJsonField<DecisionRecommendation | null>(row.recommendation, null),
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
    const normalizedInput = normalizeCreateDecisionInput(input);
    const taskId = normalizedInput.taskId ?? '';

    await db.insert(decisionRequests).values({
      id,
      taskId,
      title: normalizedInput.title,
      status: 'pending',
      scope: normalizedInput.scope,
      kind: normalizedInput.kind,
      sourceType: normalizedInput.sourceType ?? null,
      sourceId: normalizedInput.sourceId ?? null,
      sourceLabel: normalizedInput.sourceLabel ?? null,
      context: serializeJsonField(normalizedInput.context),
      options: serializeJsonField(normalizedInput.options ?? []),
      recommendation: serializeJsonField(normalizedInput.recommendation),
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    if (taskId) {
      await db.insert(timelineEvents).values({
        id: generateId('timeline'),
        taskId,
        type: 'decision.created',
        payload: JSON.stringify({
          decisionId: id,
          title: normalizedInput.title,
          scope: normalizedInput.scope,
          kind: normalizedInput.kind,
          sourceType: normalizedInput.sourceType ?? null,
          sourceId: normalizedInput.sourceId ?? null,
          sourceLabel: normalizedInput.sourceLabel ?? null,
        }),
        createdAt: timestamp,
      });
    }

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

    if (current.taskId) {
      await db.insert(timelineEvents).values({
        id: generateId('timeline'),
        taskId: current.taskId,
        type: 'decision.acted',
        payload: JSON.stringify({ decisionId: input.id, action: input.action, status: nextStatus }),
        createdAt: timestamp,
      });
    }

    const [updated] = await db
      .select()
      .from(decisionRequests)
      .where(eq(decisionRequests.id, input.id))
      .limit(1);

    return toRecord(updated);
  }
}
