import { and, desc, eq, inArray } from 'drizzle-orm';

import type {
  CreateTaskDependencyInput,
  TaskDependencyRecord,
  UpdateTaskDependencyInput,
} from '../../../shared/types/task-dependency.js';
import { initDatabase } from '../client.js';
import { taskDependencies, tasks } from '../schema.js';
import { generateId, normalizeValue, nowIso } from './repository-utils.js';

function toRecord(
  row: typeof taskDependencies.$inferSelect & {
    blockedByTaskTitle?: string | null;
  },
): TaskDependencyRecord {
  return {
    id: row.id,
    taskId: row.taskId,
    blockedByTaskId: row.blockedByTaskId,
    blockedByTaskTitle: row.blockedByTaskTitle ?? null,
    reason: row.reason,
    status: row.status as TaskDependencyRecord['status'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt,
  };
}

export class TaskDependencyRepository {
  async getActiveForTask(taskId: string): Promise<TaskDependencyRecord | null> {
    const db = initDatabase();
    const [row] = await db
      .select({
        id: taskDependencies.id,
        taskId: taskDependencies.taskId,
        blockedByTaskId: taskDependencies.blockedByTaskId,
        reason: taskDependencies.reason,
        status: taskDependencies.status,
        createdAt: taskDependencies.createdAt,
        updatedAt: taskDependencies.updatedAt,
        resolvedAt: taskDependencies.resolvedAt,
        blockedByTaskTitle: tasks.title,
      })
      .from(taskDependencies)
      .leftJoin(tasks, eq(tasks.id, taskDependencies.blockedByTaskId))
      .where(and(eq(taskDependencies.taskId, taskId), eq(taskDependencies.status, 'active')))
      .orderBy(desc(taskDependencies.updatedAt))
      .limit(1);

    return row ? toRecord(row) : null;
  }

  async listActiveForTasks(taskIds: string[]): Promise<TaskDependencyRecord[]> {
    if (taskIds.length === 0) {
      return [];
    }

    const db = initDatabase();
    const rows = await db
      .select({
        id: taskDependencies.id,
        taskId: taskDependencies.taskId,
        blockedByTaskId: taskDependencies.blockedByTaskId,
        reason: taskDependencies.reason,
        status: taskDependencies.status,
        createdAt: taskDependencies.createdAt,
        updatedAt: taskDependencies.updatedAt,
        resolvedAt: taskDependencies.resolvedAt,
        blockedByTaskTitle: tasks.title,
      })
      .from(taskDependencies)
      .leftJoin(tasks, eq(tasks.id, taskDependencies.blockedByTaskId))
      .where(and(inArray(taskDependencies.taskId, taskIds), eq(taskDependencies.status, 'active')))
      .orderBy(desc(taskDependencies.updatedAt));

    return rows.map(toRecord);
  }

  async create(input: CreateTaskDependencyInput): Promise<TaskDependencyRecord> {
    const db = initDatabase();
    const timestamp = nowIso();
    const id = generateId('dependency');

    await db.insert(taskDependencies).values({
      id,
      taskId: input.taskId,
      blockedByTaskId: input.blockedByTaskId,
      reason: normalizeValue(input.reason),
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      resolvedAt: null,
    });

    return this.getOrThrow(id);
  }

  async update(input: UpdateTaskDependencyInput): Promise<TaskDependencyRecord> {
    const db = initDatabase();
    const [current] = await db
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.id, input.id))
      .limit(1);

    if (!current) {
      throw new Error(`Task dependency not found: ${input.id}`);
    }

    await db
      .update(taskDependencies)
      .set({
        blockedByTaskId: input.blockedByTaskId ?? current.blockedByTaskId,
        reason: input.reason === undefined ? current.reason : normalizeValue(input.reason),
        updatedAt: nowIso(),
      })
      .where(eq(taskDependencies.id, input.id));

    return this.getOrThrow(input.id);
  }

  async resolve(id: string): Promise<TaskDependencyRecord> {
    const db = initDatabase();
    const [current] = await db
      .select()
      .from(taskDependencies)
      .where(eq(taskDependencies.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Task dependency not found: ${id}`);
    }

    const timestamp = nowIso();
    await db
      .update(taskDependencies)
      .set({
        status: 'resolved',
        updatedAt: timestamp,
        resolvedAt: timestamp,
      })
      .where(eq(taskDependencies.id, id));

    return this.getOrThrow(id);
  }

  private async getOrThrow(id: string): Promise<TaskDependencyRecord> {
    const db = initDatabase();
    const [row] = await db
      .select({
        id: taskDependencies.id,
        taskId: taskDependencies.taskId,
        blockedByTaskId: taskDependencies.blockedByTaskId,
        reason: taskDependencies.reason,
        status: taskDependencies.status,
        createdAt: taskDependencies.createdAt,
        updatedAt: taskDependencies.updatedAt,
        resolvedAt: taskDependencies.resolvedAt,
        blockedByTaskTitle: tasks.title,
      })
      .from(taskDependencies)
      .leftJoin(tasks, eq(tasks.id, taskDependencies.blockedByTaskId))
      .where(eq(taskDependencies.id, id))
      .limit(1);

    if (!row) {
      throw new Error(`Task dependency not found: ${id}`);
    }

    return toRecord(row);
  }
}
