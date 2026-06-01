import { desc, eq } from 'drizzle-orm';

import type {
  CreateProcessTemplateInput,
  ProcessTemplateRecord,
  UpdateProcessTemplateInput,
} from '../../../shared/types/process-template.js';
import { assertCanonicalWriteInput } from '../../../shared/canonical-data-contract.js';
import {
  normalizeCreateProcessTemplateInput,
  normalizeUpdateProcessTemplateInput,
} from '../../../shared/process-template-input.js';
import { processTemplates } from '../schema.js';
import { initDatabase } from '../client.js';
import { generateId, nowIso, parseTags } from './repository-utils.js';

function toRecord(row: typeof processTemplates.$inferSelect): ProcessTemplateRecord {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    kind: row.kind as ProcessTemplateRecord['kind'],
    tags: parseTags(row.tags),
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
    assertCanonicalWriteInput({
      domain: 'process_template',
      input: input as Record<string, unknown>,
      allowedFields: ['title', 'summary', 'content', 'kind', 'tags'],
      requiredFields: ['title', 'content', 'kind'],
    });
    const normalized = normalizeCreateProcessTemplateInput(input);
    const db = initDatabase();
    const timestamp = nowIso();
    const id = generateId('process_template');

    await db.insert(processTemplates).values({
      id,
      title: normalized.title,
      summary: normalized.summary,
      content: normalized.content,
      kind: normalized.kind,
      tags: JSON.stringify(normalized.tags),
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    });

    const [created] = await db.select().from(processTemplates).where(eq(processTemplates.id, id)).limit(1);
    return toRecord(created);
  }

  async update(input: UpdateProcessTemplateInput): Promise<ProcessTemplateRecord> {
    assertCanonicalWriteInput({
      domain: 'process_template',
      input: input as Record<string, unknown>,
      allowedFields: ['id', 'title', 'summary', 'content', 'kind', 'tags'],
      requiredFields: ['id'],
    });
    const normalized = normalizeUpdateProcessTemplateInput(input);
    const db = initDatabase();
    const [current] = await db
      .select()
      .from(processTemplates)
      .where(eq(processTemplates.id, normalized.id))
      .limit(1);

    if (!current) {
      throw new Error(`Process template not found: ${normalized.id}`);
    }

    await db
      .update(processTemplates)
      .set({
        title: normalized.title ?? current.title,
        summary: normalized.summary === undefined ? current.summary : normalized.summary,
        content: normalized.content ?? current.content,
        kind: normalized.kind ?? current.kind,
        tags: normalized.tags === undefined ? current.tags : JSON.stringify(normalized.tags),
        updatedAt: nowIso(),
      })
      .where(eq(processTemplates.id, normalized.id));

    const [updated] = await db
      .select()
      .from(processTemplates)
      .where(eq(processTemplates.id, normalized.id))
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
