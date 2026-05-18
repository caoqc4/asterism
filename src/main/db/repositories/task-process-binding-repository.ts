import { and, desc, eq, inArray } from 'drizzle-orm';

import type {
  AppliedProcessTemplateRecord,
  ApplyProcessTemplateInput,
} from '../../../shared/types/process-template.js';
import { assertCanonicalWriteInput } from '../../../shared/canonical-data-contract.js';
import { processTemplates, taskProcessBindings } from '../schema.js';
import { initDatabase } from '../client.js';
import { generateId, normalizeValue, nowIso, parseTags } from './repository-utils.js';

function toAppliedRecord(
  binding: typeof taskProcessBindings.$inferSelect,
  template: typeof processTemplates.$inferSelect,
): AppliedProcessTemplateRecord {
  return {
    id: template.id,
    title: template.title,
    summary: template.summary,
    content: template.content,
    kind: template.kind as AppliedProcessTemplateRecord['kind'],
    tags: parseTags(template.tags),
    status: template.status as AppliedProcessTemplateRecord['status'],
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    archivedAt: template.archivedAt,
    bindingId: binding.id,
    taskId: binding.taskId,
    bindingStatus: binding.status as AppliedProcessTemplateRecord['bindingStatus'],
    bindingNote: binding.note,
    boundAt: binding.createdAt,
    bindingUpdatedAt: binding.updatedAt,
    removedAt: binding.removedAt,
  };
}

export class TaskProcessBindingRepository {
  async get(bindingId: string): Promise<AppliedProcessTemplateRecord | null> {
    const db = initDatabase();
    const [binding] = await db
      .select()
      .from(taskProcessBindings)
      .where(eq(taskProcessBindings.id, bindingId))
      .limit(1);

    if (!binding) {
      return null;
    }

    const [template] = await db
      .select()
      .from(processTemplates)
      .where(eq(processTemplates.id, binding.templateId))
      .limit(1);

    return template ? toAppliedRecord(binding, template) : null;
  }

  async listActiveForTask(taskId: string): Promise<AppliedProcessTemplateRecord[]> {
    const db = initDatabase();
    const bindings = await db
      .select()
      .from(taskProcessBindings)
      .where(and(eq(taskProcessBindings.taskId, taskId), eq(taskProcessBindings.status, 'active')))
      .orderBy(desc(taskProcessBindings.updatedAt));

    if (bindings.length === 0) {
      return [];
    }

    const templates = await db
      .select()
      .from(processTemplates)
      .where(
        and(
          inArray(
            processTemplates.id,
            bindings.map((binding) => binding.templateId),
          ),
          eq(processTemplates.status, 'active'),
        ),
      );

    const templateById = new Map(templates.map((template) => [template.id, template]));

    return bindings
      .map((binding) => {
        const template = templateById.get(binding.templateId);
        return template ? toAppliedRecord(binding, template) : null;
      })
      .filter((record): record is AppliedProcessTemplateRecord => Boolean(record));
  }

  async listActiveForTasks(taskIds: string[]): Promise<AppliedProcessTemplateRecord[]> {
    if (taskIds.length === 0) {
      return [];
    }

    const db = initDatabase();
    const bindings = await db
      .select()
      .from(taskProcessBindings)
      .where(
        and(
          inArray(taskProcessBindings.taskId, taskIds),
          eq(taskProcessBindings.status, 'active'),
        ),
      )
      .orderBy(desc(taskProcessBindings.updatedAt));

    if (bindings.length === 0) {
      return [];
    }

    const templates = await db
      .select()
      .from(processTemplates)
      .where(
        and(
          inArray(
            processTemplates.id,
            bindings.map((binding) => binding.templateId),
          ),
          eq(processTemplates.status, 'active'),
        ),
      );

    const templateById = new Map(templates.map((template) => [template.id, template]));

    return bindings
      .map((binding) => {
        const template = templateById.get(binding.templateId);
        return template ? toAppliedRecord(binding, template) : null;
      })
      .filter((record): record is AppliedProcessTemplateRecord => Boolean(record));
  }

  async apply(input: ApplyProcessTemplateInput): Promise<{
    action: 'created' | 'reactivated' | 'existing';
    binding: AppliedProcessTemplateRecord;
  }> {
    assertCanonicalWriteInput({
      domain: 'process_template_binding',
      input: input as Record<string, unknown>,
      allowedFields: ['taskId', 'templateId', 'note'],
      requiredFields: ['taskId', 'templateId'],
    });
    const db = initDatabase();
    const [template] = await db
      .select()
      .from(processTemplates)
      .where(eq(processTemplates.id, input.templateId))
      .limit(1);

    if (!template || template.status !== 'active') {
      throw new Error(`Process template not found: ${input.templateId}`);
    }

    const [current] = await db
      .select()
      .from(taskProcessBindings)
      .where(
        and(
          eq(taskProcessBindings.taskId, input.taskId),
          eq(taskProcessBindings.templateId, input.templateId),
        ),
      )
      .limit(1);

    const timestamp = nowIso();

    if (current?.status === 'active') {
      return {
        action: 'existing',
        binding: toAppliedRecord(current, template),
      };
    }

    if (current) {
      await db
        .update(taskProcessBindings)
        .set({
          status: 'active',
          note: normalizeValue(input.note),
          updatedAt: timestamp,
          removedAt: null,
        })
        .where(eq(taskProcessBindings.id, current.id));

      const [reactivated] = await db
        .select()
        .from(taskProcessBindings)
        .where(eq(taskProcessBindings.id, current.id))
        .limit(1);

      return {
        action: 'reactivated',
        binding: toAppliedRecord(reactivated, template),
      };
    }

    const id = generateId('task_process_binding');
    await db.insert(taskProcessBindings).values({
      id,
      taskId: input.taskId,
      templateId: input.templateId,
      note: normalizeValue(input.note),
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      removedAt: null,
    });

    const [created] = await db
      .select()
      .from(taskProcessBindings)
      .where(eq(taskProcessBindings.id, id))
      .limit(1);

    return {
      action: 'created',
      binding: toAppliedRecord(created, template),
    };
  }

  async remove(bindingId: string): Promise<AppliedProcessTemplateRecord> {
    const db = initDatabase();
    const [binding] = await db
      .select()
      .from(taskProcessBindings)
      .where(eq(taskProcessBindings.id, bindingId))
      .limit(1);

    if (!binding) {
      throw new Error(`Process template binding not found: ${bindingId}`);
    }

    const [template] = await db
      .select()
      .from(processTemplates)
      .where(eq(processTemplates.id, binding.templateId))
      .limit(1);

    if (!template) {
      throw new Error(`Process template not found: ${binding.templateId}`);
    }

    const timestamp = nowIso();
    await db
      .update(taskProcessBindings)
      .set({
        status: 'removed',
        updatedAt: timestamp,
        removedAt: timestamp,
      })
      .where(eq(taskProcessBindings.id, bindingId));

    const [removed] = await db
      .select()
      .from(taskProcessBindings)
      .where(eq(taskProcessBindings.id, bindingId))
      .limit(1);

    return toAppliedRecord(removed, template);
  }
}
