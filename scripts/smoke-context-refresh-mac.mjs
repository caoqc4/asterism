import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const productName = packageJson.productName;
const executablePath = path.join(root, 'release/mac-arm64', `${productName}.app`, 'Contents/MacOS', productName);
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-context-refresh-smoke-'));
const smokePath = path.join(userDataPath, 'context-refresh-smoke.log');
const dbPath = path.join(userDataPath, 'taskplane.db');
const taskId = 'task_packaged_context_refresh';
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

function seedTaskFixture() {
  const database = new Database(dbPath, { fileMustExist: true });

  try {
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
          'Packaged context refresh fixture',
          'Validate right-panel context refresh preserves task memory before clearing chat.',
          'running',
          'Archive the current discussion before refreshing context.',
          null,
          'none',
          null,
          '2026-05-20T08:00:00.000Z',
          '2026-05-20T08:00:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO task_files (
            id, task_id, name, path, kind, content, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'task_file_packaged_context_refresh_md',
          taskId,
          'Task.md',
          'Task.md',
          'file',
          [
            '# Task',
            '',
            '## Goal',
            'Packaged context refresh fixture',
            '',
            '## Next Step',
            'Archive the current discussion before refreshing context.',
            '',
          ].join('\n'),
          '2026-05-20T08:00:00.000Z',
          '2026-05-20T08:00:00.000Z',
        );
    })();
  } finally {
    database.close();
  }
}

function queryTaskFiles() {
  const database = new Database(dbPath, { fileMustExist: true });
  try {
    return database.prepare('SELECT * FROM task_files WHERE task_id = ? ORDER BY created_at ASC').all(taskId);
  } finally {
    database.close();
  }
}

function querySourceContexts() {
  const database = new Database(dbPath, { fileMustExist: true });
  try {
    return database.prepare('SELECT * FROM source_contexts WHERE task_id = ? ORDER BY created_at ASC').all(taskId);
  } finally {
    database.close();
  }
}

function queryTimelineEvents() {
  const database = new Database(dbPath, { fileMustExist: true });
  try {
    return database.prepare('SELECT * FROM timeline_events WHERE task_id = ? ORDER BY created_at ASC').all(taskId);
  } finally {
    database.close();
  }
}

async function openTaskPanel(page) {
  await page.getByRole('button', { name: 'Legacy Tasks' }).click();
  await page.getByRole('button', { name: '任务目录' }).click();
  await page.locator('.task-row', { hasText: 'Packaged context refresh fixture' }).click();
  await page.getByRole('heading', { name: 'Packaged context refresh fixture' }).waitFor();
  await page.locator('.task-primary-action').click();
  await page.getByPlaceholder(/关于「Packaged context refresh fixture」/).waitFor();
}

async function sendPanelMessage(page, message) {
  const input = page.getByPlaceholder(/关于「Packaged context refresh fixture」/);
  await input.fill(message);
  await page.locator('.panel-input-foot').getByRole('button', { name: '发送' }).click();
}

if (process.platform !== 'darwin') {
  fail('macOS packaged context refresh smoke requires macOS.');
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
  seedTaskFixture();

  const page = await app.firstWindow({ timeout: timeoutMs });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openTaskPanel(page);

  const handoffSignal = '这轮决定保留 Playwright 作为动态页面验收候选，并在刷新前保存这个交接判断。';
  await sendPanelMessage(page, handoffSignal);
  await sendPanelMessage(page, handoffSignal);
  await sendPanelMessage(page, handoffSignal);
  await page.getByRole('button', { name: '整理并刷新' }).click();
  await page.getByText(/已整理并刷新/).waitFor({ timeout: timeoutMs });

  await waitFor(() => (
    queryTaskFiles().some((file) => (
      /context-refresh-handoff\.md$/.test(file.path)
      && /Playwright/.test(file.content)
    ))
  ), 'persisted context refresh Task Record');
  await waitFor(() => (
    querySourceContexts().some((source) => (
      source.title === '会话刷新前保全'
      && /Playwright/.test(source.content ?? '')
    ))
  ), 'persisted context refresh source context');
  await waitFor(() => (
    queryTimelineEvents().some((event) => (
      event.type === 'panel.context_refreshed'
      && /"fileWritten":true/.test(event.payload ?? '')
      && /"sourceWritten":true/.test(event.payload ?? '')
    ))
  ), 'persisted context refresh timeline event');

  await app.close();
  cleanup();
  console.log('macOS packaged context refresh smoke check passed.');
} catch (error) {
  if (app) {
    await app.close().catch(() => {});
  }

  fail(
    error instanceof Error ? error.message : 'macOS packaged context refresh smoke check failed.',
    error instanceof Error ? error.stack : null,
  );
}
