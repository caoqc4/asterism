import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  summary: text('summary'),
  state: text('state').notNull().default('captured'),
  nextStep: text('next_step'),
  waitingReason: text('waiting_reason'),
  riskLevel: text('risk_level').notNull().default('none'),
  riskNote: text('risk_note'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const timelineEvents = sqliteTable('timeline_events', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  type: text('type').notNull(),
  payload: text('payload'),
  createdAt: text('created_at').notNull(),
});

export const decisionRequests = sqliteTable('decision_requests', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  title: text('title').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  instructions: text('instructions'),
  output: text('output'),
  outputSource: text('output_source'),
  failureReason: text('failure_reason'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const briefSnapshots = sqliteTable('brief_snapshots', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  payload: text('payload').notNull(),
  source: text('source').notNull().default('fallback'),
  fallbackReason: text('fallback_reason'),
  createdAt: text('created_at').notNull(),
});

export const waitingItems = sqliteTable('waiting_items', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  resolvedAt: text('resolved_at'),
});

export const blockers = sqliteTable('blockers', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  title: text('title').notNull(),
  kind: text('kind').notNull(),
  detail: text('detail'),
  owner: text('owner'),
  sourceContextId: text('source_context_id'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  resolvedAt: text('resolved_at'),
});

export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id').notNull(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sourceContexts = sqliteTable('source_contexts', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  title: text('title').notNull(),
  kind: text('kind').notNull(),
  isKey: text('is_key').notNull().default('false'),
  uri: text('uri'),
  content: text('content'),
  note: text('note'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  archivedAt: text('archived_at'),
});

export const processTemplates = sqliteTable('process_templates', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  summary: text('summary'),
  content: text('content').notNull(),
  kind: text('kind').notNull(),
  tags: text('tags').notNull().default('[]'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  archivedAt: text('archived_at'),
});

export const taskProcessBindings = sqliteTable('task_process_bindings', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  templateId: text('template_id').notNull(),
  note: text('note'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  removedAt: text('removed_at'),
});
