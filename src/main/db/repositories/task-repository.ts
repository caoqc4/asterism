import { desc, eq } from 'drizzle-orm';

import type {
  CreateTaskInput,
  TaskDetailBase,
  TaskExecutionType,
  TaskRecord,
  TransitionTaskInput,
  UpdateTaskInput,
} from '../../../shared/types/task.js';
import type { TaskMdDurableField } from '../../../shared/task-md-update-need.js';
import { tasks, timelineEvents } from '../schema.js';
import { initDatabase } from '../client.js';
import { generateId, nowIso } from './repository-utils.js';

function hasFieldChanged(currentValue: string | null, nextValue: string | null): boolean {
  return (currentValue ?? null) !== (nextValue ?? null);
}

function haveArraysChanged(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return true;
  return left.some((value, index) => value !== right[index]);
}

function normalizeTaskType(value: string | null | undefined): TaskExecutionType {
  if (
    value === 'simple' ||
    value === 'project' ||
    value === 'scheduled' ||
    value === 'event' ||
    value === 'routine'
  ) {
    return value;
  }
  return 'simple';
}

function normalizeTaskFacets(value: unknown, primaryType: TaskExecutionType): TaskExecutionType[] {
  const values = Array.isArray(value) ? value : [];
  const ordered: TaskExecutionType[] = [primaryType];
  for (const item of values) {
    const type = normalizeTaskType(typeof item === 'string' ? item : null);
    if (!ordered.includes(type)) ordered.push(type);
  }
  return ordered;
}

function parseTaskFacets(value: string | null | undefined, primaryType: TaskExecutionType): TaskExecutionType[] {
  try {
    return normalizeTaskFacets(value ? JSON.parse(value) : [], primaryType);
  } catch {
    return [primaryType];
  }
}

function parseChildTaskIds(value: string | null | undefined): string[] {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
      : [];
  } catch {
    return [];
  }
}

type TaskRow = typeof tasks.$inferSelect;

function taskRecordFromRow(row: TaskRow): TaskRecord {
  const taskType = normalizeTaskType(row.taskType);
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    taskType,
    taskFacets: parseTaskFacets(row.taskFacets, taskType),
    parentTaskId: row.parentTaskId,
    childTaskIds: parseChildTaskIds(row.childTaskIds),
    state: row.state as TaskRecord['state'],
    nextStep: row.nextStep,
    waitingReason: row.waitingReason,
    riskLevel: row.riskLevel as TaskRecord['riskLevel'],
    riskNote: row.riskNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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

    return rows.map(taskRecordFromRow);
  }

  async create(input: CreateTaskInput): Promise<TaskRecord> {
    const db = initDatabase();
    const timestamp = nowIso();
    const id = generateId('task');

    await db.insert(tasks).values({
      id,
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      taskType: input.taskType ?? 'simple',
      taskFacets: JSON.stringify(normalizeTaskFacets(input.taskFacets, input.taskType ?? 'simple')),
      parentTaskId: input.parentTaskId ?? null,
      childTaskIds: JSON.stringify(input.childTaskIds ?? []),
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

    return taskRecordFromRow(created);
  }

  async getDetail(taskId: string): Promise<TaskDetailBase | null> {
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
      taskType: normalizeTaskType(task.taskType),
      taskFacets: parseTaskFacets(task.taskFacets, normalizeTaskType(task.taskType)),
      parentTaskId: task.parentTaskId,
      childTaskIds: parseChildTaskIds(task.childTaskIds),
      state: task.state as TaskRecord['state'],
      nextStep: task.nextStep,
      waitingReason: task.waitingReason,
      activeWaitingItem: null,
      activeBlocker: null,
      activeDependency: null,
      riskLevel: task.riskLevel as TaskRecord['riskLevel'],
      riskNote: task.riskNote,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      artifacts: [],
      completionCriteria: [],
      sourceContexts: [],
      decisions: [],
      processTemplates: [],
      availableProcessTemplates: [],
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
    const currentTaskType = normalizeTaskType(current.taskType);
    const nextTaskType = input.taskType ?? currentTaskType;
    const nextTaskFacets =
      input.taskFacets === undefined
        ? parseTaskFacets(current.taskFacets, nextTaskType)
        : normalizeTaskFacets(input.taskFacets, nextTaskType);
    const nextParentTaskId =
      input.parentTaskId === undefined ? current.parentTaskId : input.parentTaskId?.trim() || null;
    const nextChildTaskIds =
      input.childTaskIds === undefined ? parseChildTaskIds(current.childTaskIds) : input.childTaskIds;
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
    const changedFields: TaskMdDurableField[] = [];

    if (hasFieldChanged(current.title, nextTitle)) changedFields.push('title');
    if (hasFieldChanged(current.summary, nextSummary)) changedFields.push('summary');
    if (currentTaskType !== nextTaskType) changedFields.push('taskType');
    if (haveArraysChanged(parseTaskFacets(current.taskFacets, currentTaskType), nextTaskFacets)) {
      changedFields.push('taskFacets');
    }
    if (hasFieldChanged(current.parentTaskId, nextParentTaskId)) changedFields.push('parentTaskId');
    if (haveArraysChanged(parseChildTaskIds(current.childTaskIds), nextChildTaskIds)) {
      changedFields.push('childTaskIds');
    }
    if (hasFieldChanged(current.nextStep, nextStep)) changedFields.push('nextStep');
    if (hasFieldChanged(current.waitingReason, nextWaitingReason)) changedFields.push('waitingReason');
    if (current.riskLevel !== nextRiskLevel) changedFields.push('riskLevel');
    if (hasFieldChanged(current.riskNote, nextRiskNote)) changedFields.push('riskNote');

    await db
      .update(tasks)
      .set({
        title: nextTitle,
        summary: nextSummary,
        taskType: nextTaskType,
        taskFacets: JSON.stringify(nextTaskFacets),
        parentTaskId: nextParentTaskId,
        childTaskIds: JSON.stringify(nextChildTaskIds),
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
          taskType: nextTaskType,
          taskFacets: nextTaskFacets,
          parentTaskId: nextParentTaskId,
          childTaskIds: nextChildTaskIds,
          nextStep,
          waitingReason: nextWaitingReason,
          riskLevel: nextRiskLevel,
          riskNote: nextRiskNote,
          changedFields,
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

    return taskRecordFromRow(updated);
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

    return taskRecordFromRow(updated);
  }
}
