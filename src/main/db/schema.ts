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
