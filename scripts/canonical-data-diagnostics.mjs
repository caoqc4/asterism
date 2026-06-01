import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';

const root = process.cwd();
const legacyUserDataDirName = 'Taskplane';
const defaultDbPath = path.join(os.homedir(), 'Library/Application Support', legacyUserDataDirName, 'taskplane.db');
const userDataDbPath = process.env.TASKPLANE_USER_DATA_DIR
  ? path.join(process.env.TASKPLANE_USER_DATA_DIR, 'taskplane.db')
  : null;
const dbPath = readArgValue('--db') ?? userDataDbPath ?? defaultDbPath;
const allowMissing = process.argv.includes('--allow-missing');
const evaluatorPath = path.join(root, 'dist-electron/shared/canonical-data-contract.js');

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(evaluatorPath)) {
  fail('Missing compiled canonical data evaluator. Run `npm run build:main` first.');
}

if (!dbPath || !fs.existsSync(dbPath)) {
  if (allowMissing) {
    console.log(`canonicalDataDiagnostics skipped: missing legacy ${legacyUserDataDirName} database ${dbPath}`);
    process.exit(0);
  }
  fail(`Missing legacy ${legacyUserDataDirName} database: ${dbPath}`);
}

const { evaluateCanonicalDataDiagnostics } = await import(`file://${evaluatorPath}`);

function hasTable(database, tableName) {
  const row = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(row);
}

function tableColumns(database, tableName) {
  if (!hasTable(database, tableName)) return [];
  return database.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => row.name);
}

function expressionForColumn(columns, tableName, columnName, alias) {
  return columns.has(columnName)
    ? `${tableName}.${columnName} AS ${alias}`
    : `NULL AS ${alias}`;
}

function selectMapped(database, tableName, fields) {
  if (!hasTable(database, tableName)) return [];
  const columns = new Set(tableColumns(database, tableName));
  const projection = fields
    .map(([columnName, alias]) => expressionForColumn(columns, tableName, columnName, alias))
    .join(',\n        ');
  return database.prepare(`SELECT ${projection} FROM ${tableName}`).all();
}

function list(database, tableName, sql) {
  if (!hasTable(database, tableName)) return [];
  return database.prepare(sql).all();
}

const database = new Database(dbPath, {
  fileMustExist: true,
  readonly: true,
});

try {
  const input = {
    tasks: selectMapped(database, 'tasks', [
      ['id', 'id'],
      ['title', 'title'],
      ['summary', 'summary'],
      ['task_type', 'taskType'],
      ['task_facets', 'taskFacets'],
      ['parent_task_id', 'parentTaskId'],
      ['child_task_ids', 'childTaskIds'],
      ['state', 'state'],
      ['next_step', 'nextStep'],
      ['waiting_reason', 'waitingReason'],
      ['risk_level', 'riskLevel'],
      ['risk_note', 'riskNote'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
    ]),
    taskFiles: selectMapped(database, 'task_files', [
      ['id', 'id'],
      ['task_id', 'taskId'],
      ['name', 'name'],
      ['path', 'path'],
      ['kind', 'kind'],
      ['content', 'content'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
    ]),
    sourceContexts: selectMapped(database, 'source_contexts', [
      ['id', 'id'],
      ['task_id', 'taskId'],
      ['title', 'title'],
      ['kind', 'kind'],
      ['is_key', 'isKey'],
      ['uri', 'uri'],
      ['content', 'content'],
      ['note', 'note'],
      ['status', 'status'],
      ['captured_at', 'capturedAt'],
      ['run_id', 'runId'],
      ['batch_id', 'batchId'],
      ['source_role', 'sourceRole'],
      ['credibility', 'credibility'],
      ['is_duplicate', 'isDuplicate'],
      ['contains_sensitive_data', 'containsSensitiveData'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
      ['archived_at', 'archivedAt'],
    ]),
    artifacts: selectMapped(database, 'artifacts', [
      ['id', 'id'],
      ['task_id', 'taskId'],
      ['source_type', 'sourceType'],
      ['source_id', 'sourceId'],
      ['kind', 'kind'],
      ['title', 'title'],
      ['content', 'content'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
    ]),
    decisions: selectMapped(database, 'decision_requests', [
      ['id', 'id'],
      ['task_id', 'taskId'],
      ['title', 'title'],
      ['status', 'status'],
      ['scope', 'scope'],
      ['kind', 'kind'],
      ['source_type', 'sourceType'],
      ['source_id', 'sourceId'],
      ['source_label', 'sourceLabel'],
      ['context', 'context'],
      ['options', 'options'],
      ['recommendation', 'recommendation'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
    ]),
    blockers: selectMapped(database, 'blockers', [
      ['id', 'id'],
      ['task_id', 'taskId'],
      ['title', 'title'],
      ['kind', 'kind'],
      ['detail', 'detail'],
      ['owner', 'owner'],
      ['responsibility', 'responsibility'],
      ['responsibility_label', 'responsibilityLabel'],
      ['source_context_id', 'sourceContextId'],
      ['status', 'status'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
      ['resolved_at', 'resolvedAt'],
    ]),
    dependencies: selectMapped(database, 'task_dependencies', [
      ['id', 'id'],
      ['task_id', 'taskId'],
      ['blocked_by_task_id', 'blockedByTaskId'],
      ['reason', 'reason'],
      ['status', 'status'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
      ['resolved_at', 'resolvedAt'],
    ]),
    runEvents: [
      ...list(database, 'run_steps', `
        SELECT
          run_id AS runId,
          id AS stepId,
          kind,
          input,
          output,
          status,
          created_at AS createdAt
        FROM run_steps
      `),
      ...list(database, 'runs', `
        SELECT
          id AS runId,
          NULL AS stepId,
          type AS kind,
          instructions AS input,
          output,
          status,
          created_at AS createdAt
        FROM runs
      `),
    ],
    taskDynamics: list(database, 'timeline_events', `
      SELECT
        id,
        task_id AS taskId,
        type,
        payload,
        created_at AS createdAt
      FROM timeline_events
    `),
    workHabits: list(database, 'work_habits', `
      SELECT
        id,
        rule,
        source,
        scope,
        scope_label AS scopeLabel,
        status,
        examples,
        created_at AS createdAt,
        last_applied_at AS lastAppliedAt,
        application_count AS applicationCount
      FROM work_habits
    `),
    processTemplates: list(database, 'process_templates', `
      SELECT
        process_templates.id,
        process_templates.title,
        process_templates.summary,
        process_templates.content,
        process_templates.kind,
        process_templates.tags,
        process_templates.status,
        task_process_bindings.id AS bindingId,
        task_process_bindings.task_id AS taskId,
        task_process_bindings.status AS bindingStatus,
        task_process_bindings.created_at AS boundAt
      FROM process_templates
      LEFT JOIN task_process_bindings
        ON task_process_bindings.template_id = process_templates.id
    `),
  };

  const result = evaluateCanonicalDataDiagnostics(input);
  console.log(result.summary);
  console.log(`db=${dbPath}`);
  console.log(`issues=${result.issues.length}`);
  console.log(`manualReview=${result.manualReviewCount}`);
  console.log(`readOnly=${result.readOnlyDiagnosticCount}`);
  console.log(`safeAutoRepair=${result.safeAutoRepairCount}`);

  for (const issue of result.issues.slice(0, 50)) {
    console.log([
      issue.severity.toUpperCase(),
      issue.domain,
      issue.code,
      issue.recordId,
      issue.field,
      issue.repairRoute,
      issue.message,
    ].join(' | '));
  }

  if (result.issues.length > 50) {
    console.log(`... ${result.issues.length - 50} more issues omitted`);
  }
} finally {
  database.close();
}
