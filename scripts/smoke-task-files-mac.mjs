import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-task-files-smoke-'));
const smokePath = path.join(userDataPath, 'task-files-smoke.log');
const dbPath = path.join(userDataPath, 'taskplane.db');
const timeoutMs = 20_000;
const pollMs = 250;

function cleanup() {
  fs.rmSync(userDataPath, { recursive: true, force: true });
}

function fail(message, error) {
  console.error(message);

  if (error) {
    console.error(error);
  }

  cleanup();
  process.exit(1);
}

async function waitFor(condition, description) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(`Timed out waiting for ${description}.`);
}

function seedTaskFileFixture() {
  const database = new Database(dbPath, { fileMustExist: true });

  try {
    const taskId = 'task_packaged_task_files';
    const fileId = 'task_file_packaged_notes';
    const now = '2026-05-05T09:00:00.000Z';

    database.transaction(() => {
      database
        .prepare(`
          INSERT INTO tasks (
            id, title, summary, state, next_step, waiting_reason,
            risk_level, risk_note, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          taskId,
          'Packaged Task files fixture',
          'Seeded task for packaged task file smoke.',
          'planned',
          'Open and save the seeded task file.',
          null,
          'none',
          null,
          now,
          now,
        );

      database
        .prepare(`
          INSERT INTO task_files (id, task_id, name, path, kind, content, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          fileId,
          taskId,
          'Smoke note.md',
          'Notes/smoke-note.md',
          'file',
          'Initial packaged task file content.',
          now,
          now,
        );
    })();
  } finally {
    database.close();
  }
}

function assertSavedContent() {
  const database = new Database(dbPath, { fileMustExist: true });

  try {
    const row = database
      .prepare('SELECT content FROM task_files WHERE id = ?')
      .get('task_file_packaged_notes');

    if (!row?.content?.includes('Edited by packaged task file smoke.')) {
      throw new Error('Task file content did not persist after packaged UI save.');
    }
  } finally {
    database.close();
  }
}

async function assertTaskFileWorkspace(page) {
  await page.getByRole('button', { name: 'Tasks' }).click();
  await page.getByRole('button', { name: '任务目录' }).click();
  await page.locator('.task-row', { hasText: 'Packaged Task files fixture' }).click();
  await page.getByRole('heading', { name: 'Packaged Task files fixture' }).waitFor();
  await page.getByRole('button', { name: /Smoke note\.md/ }).click();
  await page.getByText('Smoke note.md').first().waitFor();
  await page.getByText('文件').first().waitFor();
  await page.getByText('Task file', { exact: true }).waitFor();

  const editor = page.locator('textarea.file-editor');
  await editor.fill('Initial packaged task file content.\n\nEdited by packaged task file smoke.');
  await page.getByRole('button', { name: '保存' }).click();
  await page.getByText('Saved').waitFor();
}

if (process.platform !== 'darwin') {
  fail('macOS packaged task files smoke requires macOS.');
}

if (!fs.existsSync(executablePath)) {
  fail(`Missing packaged app executable: ${executablePath}`);
}

let app;

try {
  app = await electron.launch({
    executablePath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '',
      TASKPLANE_USER_DATA_DIR: userDataPath,
      TASKPLANE_ENABLE_SCHEDULER: 'false',
      TASKPLANE_RUNTIME_SMOKE_PATH: smokePath,
    },
    timeout: timeoutMs,
  });

  await waitFor(() => fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0, 'packaged app database');
  seedTaskFileFixture();

  const page = await app.firstWindow({ timeout: timeoutMs });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertTaskFileWorkspace(page);
  assertSavedContent();

  await app.close();
  cleanup();
  console.log('macOS packaged task files smoke check passed.');
} catch (error) {
  if (app) {
    await app.close().catch(() => {});
  }

  fail(
    error instanceof Error ? error.message : 'macOS packaged task files smoke check failed.',
    error instanceof Error ? error.stack : null,
  );
}
