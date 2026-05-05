import { desc, eq } from 'drizzle-orm';

import type { WorkHabitRecord } from '../../../shared/types/work-habit.js';
import { workHabits } from '../schema.js';
import { initDatabase } from '../client.js';
import { nowIso } from './repository-utils.js';

function toRecord(row: typeof workHabits.$inferSelect): WorkHabitRecord {
  return {
    id: row.id,
    rule: row.rule,
    source: row.source as WorkHabitRecord['source'],
    scope: row.scope as WorkHabitRecord['scope'],
    scopeLabel: row.scopeLabel,
    status: row.status as WorkHabitRecord['status'],
    examples: row.examples,
    createdAt: row.createdAt,
    lastAppliedAt: row.lastAppliedAt,
    applicationCount: row.applicationCount,
  };
}

export class WorkHabitRepository {
  async list(): Promise<WorkHabitRecord[]> {
    const db = initDatabase();
    const rows = await db.select().from(workHabits).orderBy(desc(workHabits.updatedAt));
    return rows.map(toRecord);
  }

  async replaceAll(habits: WorkHabitRecord[]): Promise<WorkHabitRecord[]> {
    const db = initDatabase();
    const timestamp = nowIso();

    await db.delete(workHabits);
    if (habits.length) {
      await db.insert(workHabits).values(habits.map((habit) => ({
        id: habit.id,
        rule: habit.rule,
        source: habit.source,
        scope: habit.scope,
        scopeLabel: habit.scopeLabel,
        status: habit.status,
        examples: habit.examples,
        createdAt: habit.createdAt,
        lastAppliedAt: habit.lastAppliedAt,
        applicationCount: habit.applicationCount,
        updatedAt: timestamp,
      })));
    }

    return this.list();
  }

  async get(id: string): Promise<WorkHabitRecord | null> {
    const db = initDatabase();
    const [row] = await db.select().from(workHabits).where(eq(workHabits.id, id)).limit(1);
    return row ? toRecord(row) : null;
  }
}
