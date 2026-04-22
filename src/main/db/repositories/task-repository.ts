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

function hasFieldChanged(currentValue: string | null, nextValue: string | null): boolean {
  return (currentValue ?? null) !== (nextValue ?? null);
}

export class TaskRepository {
  async appendTimelineEvent(
    taskId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const db = initDatabase();

    await db.insert(timelineEvents).values({
      id: generateId('timeline'),
      taskId,
      type,
      payload: JSON.stringify(payload),
      createdAt: nowIso(),
    });
  }

  async list(): Promise<TaskRecord[]> {
    const db = initDatabase();
    const rows = await db.select().from(tasks).orderBy(desc(tasks.updatedAt));

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      state: row.state as TaskRecord['state'],
      nextStep: row.nextStep,
      waitingReason: row.waitingReason,
      riskLevel: row.riskLevel as TaskRecord['riskLevel'],
      riskNote: row.riskNote,
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
      nextStep: null,
      waitingReason: null,
      riskLevel: 'none',
      riskNote: null,
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
      nextStep: created.nextStep,
      waitingReason: created.waitingReason,
      riskLevel: created.riskLevel as TaskRecord['riskLevel'],
      riskNote: created.riskNote,
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
      nextStep: task.nextStep,
      waitingReason: task.waitingReason,
      riskLevel: task.riskLevel as TaskRecord['riskLevel'],
      riskNote: task.riskNote,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      artifacts: [],
      sourceContexts: [],
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
    const nextStep =
      input.nextStep === undefined ? current.nextStep : input.nextStep?.trim() || null;
    const nextWaitingReason =
      input.waitingReason === undefined
        ? current.waitingReason
        : input.waitingReason?.trim() || null;
    const nextRiskLevel = input.riskLevel ?? (current.riskLevel as TaskRecord['riskLevel']);
    const nextRiskNote =
      input.riskNote === undefined ? current.riskNote : input.riskNote?.trim() || null;
    const timestamp = nowIso();

    await db
      .update(tasks)
      .set({
        title: nextTitle,
        summary: nextSummary,
        nextStep,
        waitingReason: nextWaitingReason,
        riskLevel: nextRiskLevel,
        riskNote: nextRiskNote,
        updatedAt: timestamp,
      })
      .where(eq(tasks.id, input.id));

    const timelineRows = [
      {
        id: generateId('timeline'),
        taskId: input.id,
        type: 'task.updated',
        payload: JSON.stringify({
          title: nextTitle,
          summary: nextSummary,
          nextStep,
          waitingReason: nextWaitingReason,
          riskLevel: nextRiskLevel,
          riskNote: nextRiskNote,
        }),
        createdAt: timestamp,
      },
    ];

    if (hasFieldChanged(current.nextStep, nextStep)) {
      timelineRows.push({
        id: generateId('timeline'),
        taskId: input.id,
        type: 'task.next_step_changed',
        payload: JSON.stringify({
          from: current.nextStep,
          to: nextStep,
        }),
        createdAt: timestamp,
      });
    }

    if (hasFieldChanged(current.waitingReason, nextWaitingReason)) {
      timelineRows.push({
        id: generateId('timeline'),
        taskId: input.id,
        type: 'task.waiting_changed',
        payload: JSON.stringify({
          from: current.waitingReason,
          to: nextWaitingReason,
        }),
        createdAt: timestamp,
      });
    }

    if (
      current.riskLevel !== nextRiskLevel ||
      hasFieldChanged(current.riskNote, nextRiskNote)
    ) {
      timelineRows.push({
        id: generateId('timeline'),
        taskId: input.id,
        type: 'task.risk_changed',
        payload: JSON.stringify({
          from: {
            level: current.riskLevel,
            note: current.riskNote,
          },
          to: {
            level: nextRiskLevel,
            note: nextRiskNote,
          },
        }),
        createdAt: timestamp,
      });
    }

    await db.insert(timelineEvents).values(timelineRows);

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1);

    return {
      id: updated.id,
      title: updated.title,
      summary: updated.summary,
      state: updated.state as TaskRecord['state'],
      nextStep: updated.nextStep,
      waitingReason: updated.waitingReason,
      riskLevel: updated.riskLevel as TaskRecord['riskLevel'],
      riskNote: updated.riskNote,
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
    const nextWaitingReason =
      input.waitingReason === undefined
        ? current.waitingReason
        : input.waitingReason?.trim() || null;

    await db
      .update(tasks)
      .set({
        state: input.nextState,
        waitingReason: nextWaitingReason,
        updatedAt: timestamp,
      })
      .where(eq(tasks.id, input.id));

    const timelineRows = [
      {
        id: generateId('timeline'),
        taskId: input.id,
        type: 'task.transitioned',
        payload: JSON.stringify({
          from: current.state,
          to: input.nextState,
          waitingReason: nextWaitingReason,
        }),
        createdAt: timestamp,
      },
    ];

    if (hasFieldChanged(current.waitingReason, nextWaitingReason)) {
      timelineRows.push({
        id: generateId('timeline'),
        taskId: input.id,
        type: 'task.waiting_changed',
        payload: JSON.stringify({
          from: current.waitingReason,
          to: nextWaitingReason,
          state: {
            from: current.state,
            to: input.nextState,
          },
        }),
        createdAt: timestamp,
      });
    }

    await db.insert(timelineEvents).values(timelineRows);

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1);

    return {
      id: updated.id,
      title: updated.title,
      summary: updated.summary,
      state: updated.state as TaskRecord['state'],
      nextStep: updated.nextStep,
      waitingReason: updated.waitingReason,
      riskLevel: updated.riskLevel as TaskRecord['riskLevel'],
      riskNote: updated.riskNote,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
