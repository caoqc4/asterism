import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-decisions-center-smoke-'));
const smokePath = path.join(userDataPath, 'decisions-center-smoke.log');
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

function seedDecisionFixture() {
  const database = new Database(dbPath, { fileMustExist: true });

  try {
    const taskId = 'task_packaged_decisions_center';
    const decisionId = 'decision_packaged_center_pending';
    const now = '2026-05-04T09:00:00.000Z';

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
          'Packaged Decisions center fixture',
          'Seeded task for packaged Decisions judgment center smoke.',
          'waiting',
          'Resolve the seeded approval checkpoint.',
          '等待用户确认本地写入边界。',
          'medium',
          'Local write requires explicit approval.',
          now,
          now,
        );

      database
        .prepare(`
          INSERT INTO decision_requests (
            id, task_id, title, status, scope, kind, source_type, source_id,
            source_label, context, options, recommendation, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          decisionId,
          taskId,
          '确认 packaged judgment boundary',
          'pending',
          'task',
          'risk_approval',
          'agent_checkpoint',
          'checkpoint_packaged_center',
          'workspace.write_patch',
          JSON.stringify({
            whyNow: 'Agent paused before a local write checkpoint.',
            ifDeferred: 'The task remains blocked until the boundary is confirmed.',
          }),
          JSON.stringify([
            { label: '批准本地写入', desc: '允许继续执行本地安全写入。' },
            { label: '稍后再定', desc: '保持暂停，等待补充判断。' },
          ]),
          '批准本地写入',
          now,
          now,
        );
    })();
  } finally {
    database.close();
  }
}

async function assertDecisionCenter(page) {
  await page.getByRole('button', { name: 'Decisions' }).click();
  await page.getByRole('heading', { name: 'Decisions' }).waitFor();
  await page.getByText('确认 packaged judgment boundary').waitFor();
  await page.getByText('待拍板').first().waitFor();
  await page.getByText('风险确认').first().waitFor();
  await page.getByText('推荐').first().waitFor();
  await page.getByRole('button', { name: '拍板 →' }).first().click();
  await page.getByLabel('拍板结果').waitFor();
  await page.getByText('已批准').waitFor();
}

if (process.platform !== 'darwin') {
  fail('macOS packaged Decisions center smoke requires macOS.');
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
  seedDecisionFixture();

  const page = await app.firstWindow({ timeout: timeoutMs });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertDecisionCenter(page);

  await app.close();
  cleanup();
  console.log('macOS packaged Decisions center smoke check passed.');
} catch (error) {
  if (app) {
    await app.close().catch(() => {});
  }

  fail(
    error instanceof Error ? error.message : 'macOS packaged Decisions center smoke check failed.',
    error instanceof Error ? error.stack : null,
  );
}
