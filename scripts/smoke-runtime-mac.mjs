import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';

const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-runtime-smoke-'));
const smokePath = path.join(userDataPath, 'runtime-smoke.log');
const timeoutMs = 20_000;
const pollMs = 250;

function fail(message, child, output) {
  console.error(message);

  if (output?.trim()) {
    console.error(output.trim());
  }

  if (child && !child.killed) {
    child.kill('SIGKILL');
  }

  fs.rmSync(userDataPath, { recursive: true, force: true });
  process.exit(1);
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }, 2_000);
  });
}

if (process.platform !== 'darwin') {
  fail('macOS runtime smoke check requires macOS.');
}

if (!fs.existsSync(executablePath)) {
  fail(`Missing packaged app executable: ${executablePath}`);
}

const child = spawn(executablePath, {
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '',
    TASKPLANE_USER_DATA_DIR: userDataPath,
    TASKPLANE_ENABLE_SCHEDULER: 'false',
    TASKPLANE_RUNTIME_SMOKE_PATH: smokePath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';

child.stdout.on('data', (chunk) => {
  output += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  output += chunk.toString();
});

const startedAt = Date.now();
const configPath = path.join(userDataPath, 'config.json');
const dbPath = path.join(userDataPath, 'taskplane.db');
const requiredTables = [
  'tasks',
  'timeline_events',
  'decision_requests',
  'runs',
  'run_steps',
  'run_checkpoints',
  'agent_sessions',
  'artifacts',
  'source_contexts',
  'completion_criteria',
];

function assertDatabaseSchema() {
  const database = new Database(dbPath, {
    fileMustExist: true,
    readonly: true,
  });

  try {
    const rows = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all();
    const tableNames = new Set(rows.map((row) => row.name));
    const missingTables = requiredTables.filter((table) => !tableNames.has(table));

    if (missingTables.length > 0) {
      throw new Error(`Packaged runtime database is missing tables: ${missingTables.join(', ')}`);
    }
  } finally {
    database.close();
  }
}

while (Date.now() - startedAt < timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    fail(`Packaged app exited before runtime smoke files appeared. exit=${child.exitCode} signal=${child.signalCode}`, null, output);
  }

  if (
    fs.existsSync(smokePath) &&
    fs.readFileSync(smokePath, 'utf8').includes('main:windowCreated') &&
    fs.existsSync(configPath) &&
    fs.existsSync(dbPath) &&
    fs.statSync(dbPath).size > 0
  ) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (!config.aiProvider || !config.aiModel || !config.featureFlags) {
      fail('Packaged app wrote an invalid config.json.', child, output);
    }

    try {
      assertDatabaseSchema();
    } catch (error) {
      fail(
        error instanceof Error ? error.message : 'Packaged app wrote an invalid taskplane.db.',
        child,
        output,
      );
    }

    await waitForExit(child);
    fs.rmSync(userDataPath, { recursive: true, force: true });
    console.log('macOS runtime smoke check passed.');
    process.exit(0);
  }

  await new Promise((resolve) => setTimeout(resolve, pollMs));
}

const smokeOutput = fs.existsSync(smokePath) ? fs.readFileSync(smokePath, 'utf8') : '';
fail(`Timed out waiting for packaged app runtime files in ${userDataPath}.`, child, `${output}\n${smokeOutput}`);
