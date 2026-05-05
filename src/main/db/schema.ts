import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
  sourceType: text('source_type'),
  sourceId: text('source_id'),
  sourceLabel: text('source_label'),
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

export const runSteps = sqliteTable('run_steps', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  index: integer('step_index').notNull(),
  kind: text('kind').notNull(),
  status: text('status').notNull(),
  title: text('title').notNull(),
  input: text('input'),
  output: text('output'),
  error: text('error'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const runCheckpoints = sqliteTable('run_checkpoints', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  stepId: text('step_id'),
  kind: text('kind').notNull(),
  status: text('status').notNull(),
  payload: text('payload'),
  createdAt: text('created_at').notNull(),
  resolvedAt: text('resolved_at'),
});

export const runVerifications = sqliteTable('run_verifications', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  tone: text('tone').notNull(),
  label: text('label').notNull(),
  detail: text('detail').notNull(),
  source: text('source').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sandboxPatchPromotions = sqliteTable('sandbox_patch_promotions', {
  id: text('id').primaryKey(),
  checkpointId: text('checkpoint_id').notNull(),
  runId: text('run_id').notNull(),
  taskId: text('task_id').notNull(),
  artifactId: text('artifact_id').notNull(),
  sourceId: text('source_id').notNull(),
  decisionId: text('decision_id').notNull(),
  patchDigest: text('patch_digest').notNull(),
  expectedFiles: text('expected_files').notNull(),
  status: text('status').notNull(),
  auditSummary: text('audit_summary'),
  blockedReasons: text('blocked_reasons').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  appliedAt: text('applied_at'),
});

export const agentSessions = sqliteTable('agent_sessions', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  mode: text('mode').notNull(),
  status: text('status').notNull(),
  capabilities: text('capabilities').notNull(),
  metadata: text('metadata'),
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
  responsibility: text('responsibility'),
  responsibilityLabel: text('responsibility_label'),
  sourceContextId: text('source_context_id'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  resolvedAt: text('resolved_at'),
});

export const taskDependencies = sqliteTable('task_dependencies', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  blockedByTaskId: text('blocked_by_task_id').notNull(),
  reason: text('reason'),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  resolvedAt: text('resolved_at'),
});

export const completionCriteria = sqliteTable('completion_criteria', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  text: text('text').notNull(),
  verificationResponsibility: text('verification_responsibility'),
  verificationResponsibilityLabel: text('verification_responsibility_label'),
  status: text('status').notNull().default('open'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  satisfiedAt: text('satisfied_at'),
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

export const workHabits = sqliteTable('work_habits', {
  id: text('id').primaryKey(),
  rule: text('rule').notNull(),
  source: text('source').notNull(),
  scope: text('scope').notNull(),
  scopeLabel: text('scope_label').notNull(),
  status: text('status').notNull(),
  examples: text('examples').notNull().default(''),
  createdAt: text('created_at').notNull(),
  lastAppliedAt: text('last_applied_at'),
  applicationCount: integer('application_count').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});
