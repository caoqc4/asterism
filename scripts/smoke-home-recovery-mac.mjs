import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-home-recovery-smoke-'));
const smokePath = path.join(userDataPath, 'home-recovery-smoke.log');
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
    if (condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(`Timed out waiting for ${description}.`);
}

function seedHomeRecoveryFixture() {
  const database = new Database(dbPath, {
    fileMustExist: true,
  });

  try {
    const taskId = 'task_packaged_home_recovery';
    const sourceId = 'source_packaged_home_recovery';

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
          'Packaged Home recovery fixture',
          'Seeded task for packaged Home recovery smoke.',
          'planned',
          'Review packaged Home source recovery.',
          null,
          'none',
          null,
          '2026-05-02T10:00:00.000Z',
          '2026-05-02T10:20:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO source_contexts (
            id, task_id, title, kind, is_key, uri, content, note,
            status, created_at, updated_at, archived_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          sourceId,
          taskId,
          'Packaged Home key source',
          'note',
          'true',
          null,
          'Packaged Home recovery source content.',
          'Key source should route back into Source Context.',
          'active',
          '2026-05-02T10:05:00.000Z',
          '2026-05-02T10:25:00.000Z',
          null,
        );

      database
        .prepare(`
          INSERT INTO timeline_events (id, task_id, type, payload, created_at)
          VALUES (?, ?, ?, ?, ?)
        `)
        .run(
          'timeline_packaged_home_source',
          taskId,
          'source_context.updated',
          JSON.stringify({
            sourceContextId: sourceId,
            title: 'Packaged Home key source',
          }),
          '2026-05-02T10:25:00.000Z',
        );
    })();
  } finally {
    database.close();
  }
}

async function assertSourceContextFocused(page) {
  await page.getByRole('heading', { name: 'Packaged Home recovery fixture' }).waitFor();
  await page.getByText('任务摘要：Seeded task for packaged Home recovery smoke.').waitFor();
}

async function assertHomeSourceCardRecovery(page) {
  await page.getByRole('button', { name: 'Brief' }).click();
  await page.getByText('内部信息').waitFor();
  await page.getByText('外部信号', { exact: true }).waitFor();
  await page.getByText('暂无外部信号。').waitFor();
  await page.locator('.focus-card', { hasText: 'Packaged Home recovery fixture' }).waitFor();
  await page.getByRole('button', { name: 'Tasks' }).click();
  await page.getByRole('button', { name: '任务目录' }).click();
  await page.locator('.task-row', { hasText: 'Packaged Home recovery fixture' }).click();
  await assertSourceContextFocused(page);
}

async function assertHomeResumeContextRecovery(page) {
  await page.getByRole('button', { name: 'Brief' }).click();
  await page.locator('.focus-card', { hasText: 'Packaged Home recovery fixture' }).waitFor();
  await page.getByText('内部信息').waitFor();
}

if (process.platform !== 'darwin') {
  fail('macOS packaged Home recovery smoke requires macOS.');
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
  seedHomeRecoveryFixture();

  const page = await app.firstWindow({ timeout: timeoutMs });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertHomeSourceCardRecovery(page);
  await assertHomeResumeContextRecovery(page);

  await app.close();
  cleanup();
  console.log('macOS packaged Home recovery smoke check passed.');
} catch (error) {
  if (app) {
    await app.close().catch(() => {});
  }

  fail(
    error instanceof Error ? error.message : 'macOS packaged Home recovery smoke check failed.',
    error instanceof Error ? error.stack : null,
  );
}
