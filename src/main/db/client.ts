import fs from 'node:fs';
import path from 'node:path';

import electron from 'electron';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema.js';

const { app } = electron;

let sqlite: Database.Database | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let userDataPathOverride: string | null = null;

function getUserDataPath(): string {
  return userDataPathOverride ?? app.getPath('userData');
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
  `);

  ensureColumn(connection, 'runs', 'instructions', 'TEXT');
  ensureColumn(connection, 'runs', 'output', 'TEXT');
  ensureColumn(connection, 'runs', 'output_source', 'TEXT');
  ensureColumn(connection, 'runs', 'failure_reason', 'TEXT');
  ensureColumn(connection, 'tasks', 'next_step', 'TEXT');
  ensureColumn(connection, 'tasks', 'waiting_reason', 'TEXT');
  ensureColumn(connection, 'tasks', 'risk_level', "TEXT NOT NULL DEFAULT 'none'");
  ensureColumn(connection, 'tasks', 'risk_note', 'TEXT');
  ensureColumn(connection, 'brief_snapshots', 'source', "TEXT NOT NULL DEFAULT 'fallback'");
  ensureColumn(connection, 'brief_snapshots', 'fallback_reason', 'TEXT');
  ensureColumn(connection, 'waiting_items', 'status', "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn(connection, 'waiting_items', 'updated_at', 'TEXT');
  ensureColumn(connection, 'waiting_items', 'resolved_at', 'TEXT');
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
