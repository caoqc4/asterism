import { and, desc, eq } from 'drizzle-orm';

import type { ArtifactKind, ArtifactRecord } from '../../../shared/types/artifact.js';
import { assertCanonicalWriteInput } from '../../../shared/canonical-data-contract.js';
import { artifacts, timelineEvents } from '../schema.js';
import { initDatabase } from '../client.js';
import { generateId, nowIso } from './repository-utils.js';

function toRecord(row: typeof artifacts.$inferSelect): ArtifactRecord {
  return {
    id: row.id,
    taskId: row.taskId,
    sourceType: row.sourceType as ArtifactRecord['sourceType'],
    sourceId: row.sourceId,
    kind: row.kind as ArtifactKind,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function assertArtifactCreateInput(input: {
  taskId: string;
  sourceType: ArtifactRecord['sourceType'];
  sourceId: string;
  kind: ArtifactKind;
  title: string;
  content: string;
}): void {
  assertCanonicalWriteInput({
    domain: 'artifact',
    input,
    allowedFields: ['taskId', 'sourceType', 'sourceId', 'kind', 'title', 'content'],
    requiredFields: ['taskId', 'sourceType', 'sourceId', 'kind', 'title', 'content'],
  });
}

export class ArtifactRepository {
  async listRecent(limit = 5): Promise<ArtifactRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(artifacts)
      .orderBy(desc(artifacts.updatedAt))
      .limit(limit);

    return rows.map(toRecord);
  }

  async listRecentForTask(taskId: string, limit = 5): Promise<ArtifactRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.taskId, taskId))
      .orderBy(desc(artifacts.updatedAt))
      .limit(limit);

    return rows.map(toRecord);
  }

  async listForRun(runId: string): Promise<ArtifactRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.sourceType, 'run'), eq(artifacts.sourceId, runId)))
      .orderBy(desc(artifacts.updatedAt));

    return rows.map(toRecord);
  }

  async findById(id: string): Promise<ArtifactRecord | null> {
    const db = initDatabase();
    const [row] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, id))
      .limit(1);

    return row ? toRecord(row) : null;
  }

  async createFromRun(params: {
    taskId: string;
    runId: string;
    runType: string;
    content: string;
  }): Promise<ArtifactRecord> {
    const db = initDatabase();
    const id = generateId('artifact');
    const timestamp = nowIso();
    const title = `${params.runType} output`;
    assertArtifactCreateInput({
      taskId: params.taskId,
      sourceType: 'run',
      sourceId: params.runId,
      kind: 'run_output',
      title,
      content: params.content,
    });

    await db.insert(artifacts).values({
      id,
      taskId: params.taskId,
      sourceType: 'run',
      sourceId: params.runId,
      kind: 'run_output',
      title,
      content: params.content,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await db.insert(timelineEvents).values({
      id: generateId('timeline'),
      taskId: params.taskId,
      type: 'artifact.created',
      payload: JSON.stringify({
        artifactId: id,
        sourceType: 'run',
        sourceId: params.runId,
        kind: 'run_output',
        title,
      }),
      createdAt: timestamp,
    });

    const [created] = await db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
    return toRecord(created);
  }

  async createNoteFromRun(params: {
    taskId: string;
    runId: string;
    title: string;
    content: string;
  }): Promise<ArtifactRecord> {
    const db = initDatabase();
    const id = generateId('artifact');
    const timestamp = nowIso();
    const title = params.title.trim();
    assertArtifactCreateInput({
      taskId: params.taskId,
      sourceType: 'run',
      sourceId: params.runId,
      kind: 'note',
      title,
      content: params.content,
    });

    await db.insert(artifacts).values({
      id,
      taskId: params.taskId,
      sourceType: 'run',
      sourceId: params.runId,
      kind: 'note',
      title,
      content: params.content,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await db.insert(timelineEvents).values({
      id: generateId('timeline'),
      taskId: params.taskId,
      type: 'artifact.created',
      payload: JSON.stringify({
        artifactId: id,
        sourceType: 'run',
        sourceId: params.runId,
        kind: 'note',
        title,
      }),
      createdAt: timestamp,
    });

    const [created] = await db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
    return toRecord(created);
  }

  async createPatchFromRun(params: {
    taskId: string;
    runId: string;
    title: string;
    content: string;
  }): Promise<ArtifactRecord> {
    const db = initDatabase();
    const id = generateId('artifact');
    const timestamp = nowIso();
    const title = params.title.trim();
    assertArtifactCreateInput({
      taskId: params.taskId,
      sourceType: 'run',
      sourceId: params.runId,
      kind: 'patch',
      title,
      content: params.content,
    });

    await db.insert(artifacts).values({
      id,
      taskId: params.taskId,
      sourceType: 'run',
      sourceId: params.runId,
      kind: 'patch',
      title,
      content: params.content,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await db.insert(timelineEvents).values({
      id: generateId('timeline'),
      taskId: params.taskId,
      type: 'artifact.created',
      payload: JSON.stringify({
        artifactId: id,
        sourceType: 'run',
        sourceId: params.runId,
        kind: 'patch',
        title,
      }),
      createdAt: timestamp,
    });

    const [created] = await db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
    return toRecord(created);
  }

  async createBrowserEvidenceFromRun(params: {
    taskId: string;
    runId: string;
    title: string;
    content: string;
  }): Promise<ArtifactRecord> {
    const db = initDatabase();
    const id = generateId('artifact');
    const timestamp = nowIso();
    const title = params.title.trim();
    assertArtifactCreateInput({
      taskId: params.taskId,
      sourceType: 'run',
      sourceId: params.runId,
      kind: 'browser_evidence',
      title,
      content: params.content,
    });

    await db.insert(artifacts).values({
      id,
      taskId: params.taskId,
      sourceType: 'run',
      sourceId: params.runId,
      kind: 'browser_evidence',
      title,
      content: params.content,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await db.insert(timelineEvents).values({
      id: generateId('timeline'),
      taskId: params.taskId,
      type: 'artifact.created',
      payload: JSON.stringify({
        artifactId: id,
        sourceType: 'run',
        sourceId: params.runId,
        kind: 'browser_evidence',
        title,
      }),
      createdAt: timestamp,
    });

    const [created] = await db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
    return toRecord(created);
  }

  async createManualNote(params: {
    taskId: string;
    title: string;
    content: string;
  }): Promise<ArtifactRecord> {
    const db = initDatabase();
    const id = generateId('artifact');
    const timestamp = nowIso();
    const title = params.title.trim();
    assertArtifactCreateInput({
      taskId: params.taskId,
      sourceType: 'manual',
      sourceId: 'task_files',
      kind: 'note',
      title,
      content: params.content,
    });

    await db.insert(artifacts).values({
      id,
      taskId: params.taskId,
      sourceType: 'manual',
      sourceId: 'task_files',
      kind: 'note',
      title,
      content: params.content,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await db.insert(timelineEvents).values({
      id: generateId('timeline'),
      taskId: params.taskId,
      type: 'artifact.created',
      payload: JSON.stringify({
        artifactId: id,
        sourceType: 'manual',
        sourceId: 'task_files',
        kind: 'note',
        title,
      }),
      createdAt: timestamp,
    });

    const [created] = await db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
    return toRecord(created);
  }

  async update(input: {
    id: string;
    title?: string;
    content?: string;
  }): Promise<ArtifactRecord> {
    assertCanonicalWriteInput({
      domain: 'artifact',
      input,
      allowedFields: ['id', 'title', 'content'],
      requiredFields: ['id'],
    });
    const db = initDatabase();
    const [current] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, input.id))
      .limit(1);

    if (!current) {
      throw new Error(`Artifact not found: ${input.id}`);
    }

    await db
      .update(artifacts)
      .set({
        title: input.title?.trim() || current.title,
        content: input.content ?? current.content,
        updatedAt: nowIso(),
      })
      .where(eq(artifacts.id, input.id));

    const [updated] = await db.select().from(artifacts).where(eq(artifacts.id, input.id)).limit(1);
    return toRecord(updated);
  }

  async delete(id: string): Promise<ArtifactRecord> {
    const db = initDatabase();
    const [current] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Artifact not found: ${id}`);
    }

    await db.delete(artifacts).where(eq(artifacts.id, id));
    return toRecord(current);
  }
}
