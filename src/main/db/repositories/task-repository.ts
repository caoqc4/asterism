import { desc, eq } from 'drizzle-orm';

import type {
  CreateTaskInput,
  TaskDetail,
  TaskRecord,
  TransitionTaskInput,
  UpdateTaskInput,
} from '../../../shared/types/task.js';
import { tasks, timelineEvents } from '../schema.js';
import { initDatabase } from '../client.js';

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export class TaskRepository {
  async list(): Promise<TaskRecord[]> {
    const db = initDatabase();
    const rows = await db.select().from(tasks).orderBy(desc(tasks.updatedAt));

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      state: row.state as TaskRecord['state'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async create(input: CreateTaskInput): Promise<TaskRecord> {
    const db = initDatabase();
    const timestamp = nowIso();
    const id = generateId('task');

    await db.insert(tasks).values({
      id,
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      state: 'captured',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await db.insert(timelineEvents).values({
      id: generateId('timeline'),
      taskId: id,
      type: 'task.created',
      payload: JSON.stringify({ title: input.title.trim() }),
      createdAt: timestamp,
    });

    const [created] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);

    return {
      id: created.id,
      title: created.title,
      summary: created.summary,
      state: created.state as TaskRecord['state'],
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async getDetail(taskId: string): Promise<TaskDetail | null> {
    const db = initDatabase();
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);

    if (!task) {
      return null;
    }

    const timeline = await db
      .select()
      .from(timelineEvents)
      .where(eq(timelineEvents.taskId, taskId))
      .orderBy(desc(timelineEvents.createdAt));

    return {
      id: task.id,
      title: task.title,
      summary: task.summary,
      state: task.state as TaskRecord['state'],
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      timeline: timeline.map((event) => ({
        id: event.id,
        taskId: event.taskId,
        type: event.type,
        payload: event.payload,
        createdAt: event.createdAt,
      })),
    };
  }

  async update(input: UpdateTaskInput): Promise<TaskRecord> {
    const db = initDatabase();
    const [current] = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1);

    if (!current) {
      throw new Error(`Task not found: ${input.id}`);
    }

    const nextTitle = input.title?.trim() ? input.title.trim() : current.title;
    const nextSummary =
      input.summary === undefined ? current.summary : input.summary?.trim() || null;
    const timestamp = nowIso();

    await db
      .update(tasks)
      .set({
        title: nextTitle,
        summary: nextSummary,
        updatedAt: timestamp,
      })
      .where(eq(tasks.id, input.id));

    await db.insert(timelineEvents).values({
      id: generateId('timeline'),
      taskId: input.id,
      type: 'task.updated',
      payload: JSON.stringify({ title: nextTitle, summary: nextSummary }),
      createdAt: timestamp,
    });

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1);

    return {
      id: updated.id,
      title: updated.title,
      summary: updated.summary,
      state: updated.state as TaskRecord['state'],
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async transition(input: TransitionTaskInput): Promise<TaskRecord> {
    const db = initDatabase();
    const [current] = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1);

    if (!current) {
      throw new Error(`Task not found: ${input.id}`);
    }

    const timestamp = nowIso();

    await db
      .update(tasks)
      .set({
        state: input.nextState,
        updatedAt: timestamp,
      })
      .where(eq(tasks.id, input.id));

    await db.insert(timelineEvents).values({
      id: generateId('timeline'),
      taskId: input.id,
      type: 'task.transitioned',
      payload: JSON.stringify({ from: current.state, to: input.nextState }),
      createdAt: timestamp,
    });

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1);

    return {
      id: updated.id,
      title: updated.title,
      summary: updated.summary,
      state: updated.state as TaskRecord['state'],
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
