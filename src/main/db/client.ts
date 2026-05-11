import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { app } from '../electron.js';
import * as schema from './schema.js';

let sqlite: Database.Database | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let userDataPathOverride: string | null = null;

function getUserDataPath(): string {
  return userDataPathOverride ?? process.env.TASKPLANE_USER_DATA_DIR ?? app.getPath('userData');
}

function ensureDatabaseFile(): string {
  const userDataPath = getUserDataPath();
  fs.mkdirSync(userDataPath, { recursive: true });
  const targetPath = path.join(userDataPath, 'taskplane.db');
  const legacyPath = path.join(userDataPath, 'supersecretary.db');

  if (!fs.existsSync(targetPath) && fs.existsSync(legacyPath)) {
    fs.copyFileSync(legacyPath, targetPath);
  }

  return targetPath;
}

function bootstrapTables(connection: Database.Database): void {
  connection.pragma('journal_mode = WAL');
  connection.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT,
      state TEXT NOT NULL DEFAULT 'captured',
      next_step TEXT,
      waiting_reason TEXT,
      risk_level TEXT NOT NULL DEFAULT 'none',
      risk_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS decision_requests (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      source_type TEXT,
      source_id TEXT,
      source_label TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      instructions TEXT,
      output TEXT,
      output_source TEXT,
      failure_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS run_steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      input TEXT,
      output TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS run_checkpoints (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      step_id TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS run_verifications (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      tone TEXT NOT NULL,
      label TEXT NOT NULL,
      detail TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sandbox_patch_promotions (
      id TEXT PRIMARY KEY,
      checkpoint_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      artifact_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      decision_id TEXT NOT NULL,
      patch_digest TEXT NOT NULL,
      expected_files TEXT NOT NULL,
      status TEXT NOT NULL,
      audit_summary TEXT,
      blocked_reasons TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      applied_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS sandbox_patch_promotions_checkpoint_idx
      ON sandbox_patch_promotions(checkpoint_id);

    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      capabilities TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS brief_snapshots (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'fallback',
      fallback_reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS waiting_items (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS blockers (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL,
      detail TEXT,
      owner TEXT,
      responsibility TEXT,
      responsibility_label TEXT,
      source_context_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      blocked_by_task_id TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS completion_criteria (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      text TEXT NOT NULL,
      verification_responsibility TEXT,
      verification_responsibility_label TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      satisfied_at TEXT
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS source_contexts (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL,
      is_key TEXT NOT NULL DEFAULT 'false',
      uri TEXT,
      content TEXT,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS task_files (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS process_templates (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT NOT NULL,
      kind TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS task_process_bindings (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      removed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS work_habits (
      id TEXT PRIMARY KEY,
      rule TEXT NOT NULL,
      source TEXT NOT NULL,
      scope TEXT NOT NULL,
      scope_label TEXT NOT NULL,
      status TEXT NOT NULL,
      examples TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      last_applied_at TEXT,
      application_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);

  ensureColumn(connection, 'runs', 'instructions', 'TEXT');
  ensureColumn(connection, 'runs', 'output', 'TEXT');
  ensureColumn(connection, 'runs', 'output_source', 'TEXT');
  ensureColumn(connection, 'runs', 'failure_reason', 'TEXT');
  ensureColumn(connection, 'decision_requests', 'source_type', 'TEXT');
  ensureColumn(connection, 'decision_requests', 'source_id', 'TEXT');
  ensureColumn(connection, 'decision_requests', 'source_label', 'TEXT');
  ensureColumn(connection, 'tasks', 'next_step', 'TEXT');
  ensureColumn(connection, 'tasks', 'waiting_reason', 'TEXT');
  ensureColumn(connection, 'tasks', 'risk_level', "TEXT NOT NULL DEFAULT 'none'");
  ensureColumn(connection, 'tasks', 'risk_note', 'TEXT');
  ensureColumn(connection, 'brief_snapshots', 'source', "TEXT NOT NULL DEFAULT 'fallback'");
  ensureColumn(connection, 'brief_snapshots', 'fallback_reason', 'TEXT');
  ensureColumn(connection, 'waiting_items', 'status', "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn(connection, 'waiting_items', 'updated_at', 'TEXT');
  ensureColumn(connection, 'waiting_items', 'resolved_at', 'TEXT');
  ensureColumn(connection, 'blockers', 'title', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(connection, 'blockers', 'kind', "TEXT NOT NULL DEFAULT 'other'");
  ensureColumn(connection, 'blockers', 'detail', 'TEXT');
  ensureColumn(connection, 'blockers', 'owner', 'TEXT');
  ensureColumn(connection, 'blockers', 'responsibility', 'TEXT');
  ensureColumn(connection, 'blockers', 'responsibility_label', 'TEXT');
  ensureColumn(connection, 'blockers', 'source_context_id', 'TEXT');
  ensureColumn(connection, 'blockers', 'status', "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn(connection, 'blockers', 'updated_at', 'TEXT');
  ensureColumn(connection, 'blockers', 'resolved_at', 'TEXT');
  ensureColumn(connection, 'task_dependencies', 'blocked_by_task_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(connection, 'task_dependencies', 'reason', 'TEXT');
  ensureColumn(connection, 'task_dependencies', 'status', "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn(connection, 'task_dependencies', 'updated_at', 'TEXT');
  ensureColumn(connection, 'task_dependencies', 'resolved_at', 'TEXT');
  ensureColumn(connection, 'completion_criteria', 'text', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(connection, 'completion_criteria', 'verification_responsibility', 'TEXT');
  ensureColumn(connection, 'completion_criteria', 'verification_responsibility_label', 'TEXT');
  ensureColumn(connection, 'completion_criteria', 'status', "TEXT NOT NULL DEFAULT 'open'");
  ensureColumn(connection, 'completion_criteria', 'updated_at', 'TEXT');
  ensureColumn(connection, 'completion_criteria', 'satisfied_at', 'TEXT');
  ensureColumn(connection, 'source_contexts', 'uri', 'TEXT');
  ensureColumn(connection, 'source_contexts', 'content', 'TEXT');
  ensureColumn(connection, 'source_contexts', 'note', 'TEXT');
  ensureColumn(connection, 'source_contexts', 'is_key', "TEXT NOT NULL DEFAULT 'false'");
  ensureColumn(connection, 'source_contexts', 'status', "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn(connection, 'source_contexts', 'updated_at', 'TEXT');
  ensureColumn(connection, 'source_contexts', 'archived_at', 'TEXT');
  ensureColumn(connection, 'process_templates', 'summary', 'TEXT');
  ensureColumn(connection, 'process_templates', 'content', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(connection, 'process_templates', 'kind', "TEXT NOT NULL DEFAULT 'skill'");
  ensureColumn(connection, 'process_templates', 'tags', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(connection, 'process_templates', 'status', "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn(connection, 'process_templates', 'updated_at', 'TEXT');
  ensureColumn(connection, 'process_templates', 'archived_at', 'TEXT');
  ensureColumn(connection, 'task_process_bindings', 'note', 'TEXT');
  ensureColumn(connection, 'task_process_bindings', 'status', "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn(connection, 'task_process_bindings', 'updated_at', 'TEXT');
  ensureColumn(connection, 'task_process_bindings', 'removed_at', 'TEXT');
}

function ensureColumn(
  connection: Database.Database,
  tableName: string,
  columnName: string,
  definition: string,
): void {
  const columns = connection.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    connection.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

export function initDatabase() {
  if (!sqlite) {
    sqlite = new Database(ensureDatabaseFile());
    bootstrapTables(sqlite);
    db = drizzle(sqlite, { schema });
  }

  return db!;
}

export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}

export function setDatabaseUserDataPathForTests(nextPath: string | null): void {
  closeDatabase();
  userDataPathOverride = nextPath;
}
