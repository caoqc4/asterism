import { desc, eq } from 'drizzle-orm';

import type {
  CreateProcessTemplateInput,
  ProcessTemplateRecord,
  UpdateProcessTemplateInput,
} from '../../../shared/types/process-template.js';
import { processTemplates } from '../schema.js';
import { initDatabase } from '../client.js';

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function normalizeValue(value: string | null | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

function normalizeTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
}

function toRecord(row: typeof processTemplates.$inferSelect): ProcessTemplateRecord {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    kind: row.kind as ProcessTemplateRecord['kind'],
    tags: JSON.parse(row.tags) as string[],
    status: row.status as ProcessTemplateRecord['status'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

export class ProcessTemplateRepository {
  async listActive(): Promise<ProcessTemplateRecord[]> {
    const db = initDatabase();
    const rows = await db
      .select()
      .from(processTemplates)
      .where(eq(processTemplates.status, 'active'))
      .orderBy(desc(processTemplates.updatedAt));

    return rows.map(toRecord);
  }

  async create(input: CreateProcessTemplateInput): Promise<ProcessTemplateRecord> {
    const db = initDatabase();
    const timestamp = nowIso();
    const id = generateId('process_template');

    await db.insert(processTemplates).values({
      id,
      title: input.title.trim(),
      summary: normalizeValue(input.summary),
      content: input.content.trim(),
      kind: input.kind,
      tags: JSON.stringify(normalizeTags(input.tags)),
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    });

    const [created] = await db.select().from(processTemplates).where(eq(processTemplates.id, id)).limit(1);
    return toRecord(created);
  }

  async update(input: UpdateProcessTemplateInput): Promise<ProcessTemplateRecord> {
    const db = initDatabase();
    const [current] = await db
      .select()
      .from(processTemplates)
      .where(eq(processTemplates.id, input.id))
      .limit(1);

    if (!current) {
      throw new Error(`Process template not found: ${input.id}`);
    }

    await db
      .update(processTemplates)
      .set({
        title: input.title?.trim() || current.title,
        summary: input.summary === undefined ? current.summary : normalizeValue(input.summary),
        content: input.content?.trim() || current.content,
        kind: input.kind ?? current.kind,
        tags:
          input.tags === undefined ? current.tags : JSON.stringify(normalizeTags(input.tags)),
        updatedAt: nowIso(),
      })
      .where(eq(processTemplates.id, input.id));

    const [updated] = await db
      .select()
      .from(processTemplates)
      .where(eq(processTemplates.id, input.id))
      .limit(1);

    return toRecord(updated);
  }

  async archive(id: string): Promise<ProcessTemplateRecord> {
    const db = initDatabase();
    const [current] = await db
      .select()
      .from(processTemplates)
      .where(eq(processTemplates.id, id))
      .limit(1);

    if (!current) {
      throw new Error(`Process template not found: ${id}`);
    }

    const timestamp = nowIso();
    await db
      .update(processTemplates)
      .set({
        status: 'archived',
        updatedAt: timestamp,
        archivedAt: timestamp,
      })
      .where(eq(processTemplates.id, id));

    const [updated] = await db
      .select()
      .from(processTemplates)
      .where(eq(processTemplates.id, id))
      .limit(1);

    return toRecord(updated);
  }
}
