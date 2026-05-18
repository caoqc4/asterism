import type {
  CreateProcessTemplateInput,
  ProcessTemplateKind,
  UpdateProcessTemplateInput,
} from './types/process-template.js';

export const PROCESS_TEMPLATE_KINDS: ProcessTemplateKind[] = ['skill', 'workflow', 'sop', 'checklist'];

export function normalizeProcessTemplateTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
}

export function normalizeCreateProcessTemplateInput(input: CreateProcessTemplateInput): CreateProcessTemplateInput {
  assertProcessTemplateKind(input.kind);
  const title = requireNonBlank(input.title, 'title');
  const content = requireNonBlank(input.content, 'content');

  return {
    title,
    summary: normalizeOptionalText(input.summary),
    content,
    kind: input.kind,
    tags: normalizeProcessTemplateTags(input.tags),
  };
}

export function normalizeUpdateProcessTemplateInput(input: UpdateProcessTemplateInput): UpdateProcessTemplateInput {
  const id = requireNonBlank(input.id, 'id');
  const next: UpdateProcessTemplateInput = { id };

  if (input.title !== undefined) next.title = requireNonBlank(input.title, 'title');
  if (input.summary !== undefined) next.summary = normalizeOptionalText(input.summary);
  if (input.content !== undefined) next.content = requireNonBlank(input.content, 'content');
  if (input.kind !== undefined) {
    assertProcessTemplateKind(input.kind);
    next.kind = input.kind;
  }
  if (input.tags !== undefined) next.tags = normalizeProcessTemplateTags(input.tags);

  return next;
}

function assertProcessTemplateKind(value: string): asserts value is ProcessTemplateKind {
  if (!PROCESS_TEMPLATE_KINDS.includes(value as ProcessTemplateKind)) {
    throw new Error(`Process template kind must be one of: ${PROCESS_TEMPLATE_KINDS.join(', ')}.`);
  }
}

function requireNonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Process template ${field} is required.`);
  }
  return normalized;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}
