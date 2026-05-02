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
  await page.getByRole('heading', { name: 'Source Context' }).waitFor();
  await page.getByText('Edit Material').waitFor();

  const sourceTitle = await page.locator('label', { hasText: '来源标题' }).locator('input').inputValue();
  if (sourceTitle !== 'Packaged Home key source') {
    throw new Error(`Home recovery focused the wrong source context: ${sourceTitle}`);
  }
}

async function assertHomeSourceCardRecovery(page) {
  await page.getByRole('button', { name: 'Home 局势概览与系统状态' }).click();

  const keySourcePanel = page.locator('.panel', { hasText: 'Key Source Materials' });
  await keySourcePanel.getByText('Packaged Home key source').waitFor();
  await keySourcePanel
    .locator('.task-card', { hasText: 'Packaged Home key source' })
    .click();
  await assertSourceContextFocused(page);
}

async function assertHomeResumeContextRecovery(page) {
  await page.getByRole('button', { name: 'Home 局势概览与系统状态' }).click();

  const resumePanel = page.locator('.panel', { hasText: 'Resume Previews' });
  await resumePanel.getByRole('button', { name: /恢复任务 Packaged Home recovery fixture/ }).waitFor();
  await resumePanel
    .locator('.task-card', { hasText: 'Packaged Home recovery fixture' })
    .getByRole('button', { name: '查看关键来源' })
    .click();
  await assertSourceContextFocused(page);
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
