import fs from 'node:fs';
import path from 'node:path';

import electron from 'electron';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema.js';

const { app } = electron;

let sqlite: Database.Database | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function ensureDatabaseFile(): string {
  const userDataPath = app.getPath('userData');
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
  `);

  ensureColumn(connection, 'runs', 'instructions', 'TEXT');
  ensureColumn(connection, 'runs', 'output', 'TEXT');
  ensureColumn(connection, 'runs', 'output_source', 'TEXT');
  ensureColumn(connection, 'runs', 'failure_reason', 'TEXT');
  ensureColumn(connection, 'brief_snapshots', 'source', "TEXT NOT NULL DEFAULT 'fallback'");
  ensureColumn(connection, 'brief_snapshots', 'fallback_reason', 'TEXT');
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
