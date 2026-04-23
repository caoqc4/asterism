import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import type {
  CompletionCriteriaRecord,
  CreateCompletionCriteriaInput,
  UpdateCompletionCriteriaInput,
} from '../../../shared/types/completion-criteria.js';
import { initDatabase } from '../client.js';
import { completionCriteria } from '../schema.js';

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function toRecord(row: typeof completionCriteria.$inferSelect): CompletionCriteriaRecord {
  return {
    id: row.id,
    taskId: row.taskId,
    text: row.text,
    verificationResponsibility:
      row.verificationResponsibility as CompletionCriteriaRecord['verificationResponsibility'],
    verificationResponsibilityLabel: row.verificationResponsibilityLabel,
    status: row.status as CompletionCriteriaRecord['status'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    satisfiedAt: row.satisfiedAt,
  };
}

export class CompletionCriteriaRepository {
  async listForTask(taskId: string): Promise<CompletionCriteriaRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(completionCriteria)
      .where(eq(completionCriteria.taskId, taskId))
      .orderBy(asc(completionCriteria.status), asc(completionCriteria.createdAt));

    return rows.map(toRecord);
  }

  async listForTasks(taskIds: string[]): Promise<CompletionCriteriaRecord[]> {
    if (taskIds.length === 0) {
      return [];
    }

    const db = initDatabase();
    const rows = await db
      .select()
      .from(completionCriteria)
      .where(inArray(completionCriteria.taskId, taskIds))
      .orderBy(asc(completionCriteria.taskId), asc(completionCriteria.status), asc(completionCriteria.createdAt));

    return rows.map(toRecord);
  }

  async listOpenForTasks(taskIds: string[]): Promise<CompletionCriteriaRecord[]> {
    if (taskIds.length === 0) {
      return [];
    }

    const db = initDatabase();
    const rows = await db
      .select()
      .from(completionCriteria)
      .where(and(inArray(completionCriteria.taskId, taskIds), eq(completionCriteria.status, 'open')))
      .orderBy(desc(completionCriteria.updatedAt));

    return rows.map(toRecord);
  }

  async create(input: CreateCompletionCriteriaInput): Promise<CompletionCriteriaRecord> {
    const db = initDatabase();
    const timestamp = nowIso();
    const id = generateId('criteria');

    await db.insert(completionCriteria).values({
      id,
      taskId: input.taskId,
      text: input.text.trim(),
      verificationResponsibility: input.verificationResponsibility ?? null,
      verificationResponsibilityLabel: input.verificationResponsibilityLabel?.trim() || null,
      status: 'open',
      createdAt: timestamp,
      updatedAt: timestamp,
      satisfiedAt: null,
    });

    return this.getOrThrow(id);
  }

  async update(input: UpdateCompletionCriteriaInput): Promise<CompletionCriteriaRecord> {
    const db = initDatabase();
    const [current] = await db
      .select()
      .from(completionCriteria)
      .where(eq(completionCriteria.id, input.id))
      .limit(1);

    if (!current) {
      throw new Error(`Completion criteria not found: ${input.id}`);
    }

    await db
      .update(completionCriteria)
      .set({
        text: input.text.trim(),
        verificationResponsibility:
          input.verificationResponsibility === undefined
            ? current.verificationResponsibility
            : input.verificationResponsibility,
        verificationResponsibilityLabel:
          input.verificationResponsibilityLabel === undefined
            ? current.verificationResponsibilityLabel
            : input.verificationResponsibilityLabel?.trim() || null,
        updatedAt: nowIso(),
      })
      .where(eq(completionCriteria.id, input.id));

    return this.getOrThrow(input.id);
  }

  async satisfy(id: string): Promise<CompletionCriteriaRecord> {
    const db = initDatabase();
    const [current] = await db
      .select()
      .from(completionCriteria)
      .where(eq(completionCriteria.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Completion criteria not found: ${id}`);
    }

    const timestamp = nowIso();
    await db
      .update(completionCriteria)
      .set({
        status: 'satisfied',
        updatedAt: timestamp,
        satisfiedAt: timestamp,
      })
      .where(eq(completionCriteria.id, id));

    return this.getOrThrow(id);
  }

  async reopen(id: string): Promise<CompletionCriteriaRecord> {
    const db = initDatabase();
    const [current] = await db
      .select()
      .from(completionCriteria)
      .where(eq(completionCriteria.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Completion criteria not found: ${id}`);
    }

    const timestamp = nowIso();
    await db
      .update(completionCriteria)
      .set({
        status: 'open',
        updatedAt: timestamp,
        satisfiedAt: null,
      })
      .where(eq(completionCriteria.id, id));

    return this.getOrThrow(id);
  }

  private async getOrThrow(id: string): Promise<CompletionCriteriaRecord> {
    const db = initDatabase();
    const [row] = await db
      .select()
      .from(completionCriteria)
      .where(eq(completionCriteria.id, id))
      .limit(1);

    if (!row) {
      throw new Error(`Completion criteria not found: ${id}`);
    }

    return toRecord(row);
  }
}
