import { desc, eq } from 'drizzle-orm';

import type {
  CreateTaskFileInput,
  TaskFileKind,
  TaskFileRecord,
  UpdateTaskFileInput,
} from '../../../shared/types/task-file.js';
import { assertCanonicalWriteInput } from '../../../shared/canonical-data-contract.js';
import { normalizeCreateTaskFileInput } from '../../../shared/runtime-surface-routing.js';
import { taskFiles } from '../schema.js';
import { initDatabase } from '../client.js';
import { generateId, nowIso } from './repository-utils.js';

function toRecord(row: typeof taskFiles.$inferSelect): TaskFileRecord {
  return {
    id: row.id,
    taskId: row.taskId,
    businessLineId: row.businessLineId,
    name: row.name,
    path: row.path,
    kind: row.kind as TaskFileKind,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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

  async findById(id: string): Promise<TaskFileRecord | null> {
    const db = initDatabase();
    const [row] = await db
      .select()
      .from(taskFiles)
      .where(eq(taskFiles.id, id))
      .limit(1);

    return row ? toRecord(row) : null;
  }

  async create(input: CreateTaskFileInput): Promise<TaskFileRecord> {
    const db = initDatabase();
    const timestamp = nowIso();
    const id = generateId('task_file');
    const normalizedInput = normalizeCreateTaskFileInput(input);
    assertCanonicalWriteInput({
      domain: 'task_file',
      input: normalizedInput as Record<string, unknown>,
      allowedFields: ['taskId', 'businessLineId', 'name', 'path', 'kind', 'content'],
      requiredFields: ['taskId', 'name', 'kind'],
    });

    await db.insert(taskFiles).values({
      id,
      taskId: normalizedInput.taskId,
      businessLineId: normalizedInput.businessLineId?.trim() || null,
      name: normalizedInput.name,
      path: normalizedInput.path ?? normalizedInput.name,
      kind: normalizedInput.kind,
      content: normalizedInput.content ?? '',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const [created] = await db.select().from(taskFiles).where(eq(taskFiles.id, id)).limit(1);
    return toRecord(created);
  }

  async update(input: UpdateTaskFileInput): Promise<TaskFileRecord> {
    assertCanonicalWriteInput({
      domain: 'task_file',
      input: input as Record<string, unknown>,
      allowedFields: ['id', 'name', 'path', 'content'],
      requiredFields: ['id'],
    });
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
