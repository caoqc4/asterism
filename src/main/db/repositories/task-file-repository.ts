import { desc, eq } from 'drizzle-orm';

import type {
  CreateTaskFileInput,
  TaskFileKind,
  TaskFileRecord,
  UpdateTaskFileInput,
} from '../../../shared/types/task-file.js';
import { taskFiles } from '../schema.js';
import { initDatabase } from '../client.js';
import { generateId, nowIso } from './repository-utils.js';

function toRecord(row: typeof taskFiles.$inferSelect): TaskFileRecord {
  return {
    id: row.id,
    taskId: row.taskId,
    name: row.name,
    path: row.path,
    kind: row.kind as TaskFileKind,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizePath(input: CreateTaskFileInput): string {
  const rawPath = input.path?.trim() || input.name.trim();
  return input.kind === 'folder' && !rawPath.endsWith('/') ? `${rawPath}/` : rawPath;
}

export class TaskFileRepository {
  async listForTask(taskId: string): Promise<TaskFileRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(taskFiles)
      .where(eq(taskFiles.taskId, taskId))
      .orderBy(desc(taskFiles.updatedAt));

    return rows.map(toRecord);
  }

  async create(input: CreateTaskFileInput): Promise<TaskFileRecord> {
    const db = initDatabase();
    const timestamp = nowIso();
    const id = generateId('task_file');
    const path = normalizePath(input);

    await db.insert(taskFiles).values({
      id,
      taskId: input.taskId,
      name: input.name.trim(),
      path,
      kind: input.kind,
      content: input.kind === 'folder' ? '' : input.content ?? '',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const [created] = await db.select().from(taskFiles).where(eq(taskFiles.id, id)).limit(1);
    return toRecord(created);
  }

  async update(input: UpdateTaskFileInput): Promise<TaskFileRecord> {
    const db = initDatabase();
    const [current] = await db
      .select()
      .from(taskFiles)
      .where(eq(taskFiles.id, input.id))
      .limit(1);

    if (!current) {
      throw new Error(`Task file not found: ${input.id}`);
    }

    await db
      .update(taskFiles)
      .set({
        name: input.name?.trim() || current.name,
        path: input.path?.trim() || current.path,
        content: input.content ?? current.content,
        updatedAt: nowIso(),
      })
      .where(eq(taskFiles.id, input.id));

    const [updated] = await db.select().from(taskFiles).where(eq(taskFiles.id, input.id)).limit(1);
    return toRecord(updated);
  }

  async delete(id: string): Promise<TaskFileRecord> {
    const db = initDatabase();
    const [current] = await db
      .select()
      .from(taskFiles)
      .where(eq(taskFiles.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Task file not found: ${id}`);
    }

    await db.delete(taskFiles).where(eq(taskFiles.id, id));
    return toRecord(current);
  }
}
