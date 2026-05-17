import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-task-dynamics-ui-smoke-'));
const smokePath = path.join(userDataPath, 'task-dynamics-ui-smoke.log');
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

function seedTaskDynamicsFixture() {
  const database = new Database(dbPath, {
    fileMustExist: true,
  });

  try {
    const taskId = 'task_packaged_task_dynamics_ui_smoke';

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
          'Packaged task dynamics fixture',
          'Seeded by packaged task dynamics smoke.',
          'running',
          'Review packaged task dynamics replay grouping.',
          null,
          'none',
          null,
          '2026-05-01T08:00:00.000Z',
          '2026-05-01T12:00:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO completion_criteria (
            id, task_id, text, verification_responsibility,
            verification_responsibility_label, status, created_at, updated_at, satisfied_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'criteria_packaged_task_dynamics',
          taskId,
          'Packaged task dynamics fixture accepted',
          'unknown',
          null,
          'satisfied',
          '2026-05-01T08:10:00.000Z',
          '2026-05-01T08:30:00.000Z',
          '2026-05-01T08:30:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO runs (
            id, task_id, type, status, instructions, output, output_source,
            failure_reason, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'run_packaged_task_dynamics',
          taskId,
          'summarize',
          'completed',
          'Packaged task dynamics smoke run.',
          'Packaged task dynamics smoke completed.',
          'system',
          null,
          '2026-05-01T11:45:00.000Z',
          '2026-05-01T12:00:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO run_steps (
            id, run_id, step_index, kind, status, title, input, output, error,
            created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'run_step_packaged_task_dynamics',
          'run_packaged_task_dynamics',
          1,
          'summary',
          'completed',
          'Packaged task dynamics step',
          null,
          'Packaged task dynamics step completed.',
          null,
          '2026-05-01T11:50:00.000Z',
          '2026-05-01T11:55:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO decision_requests (
            id, task_id, title, status, source_type, source_id,
            source_label, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'decision_packaged_task_dynamics',
          taskId,
          'Approve packaged task dynamics smoke',
          'approved',
          'run',
          'run_packaged_task_dynamics',
          'Packaged task dynamics smoke',
          '2026-05-01T11:20:00.000Z',
          '2026-05-01T11:30:00.000Z',
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
          'source_packaged_task_dynamics',
          taskId,
          'Packaged task dynamics notes',
          'note',
          'true',
          null,
          'Source context seeded by packaged task dynamics smoke.',
          'Verify task dynamics source context projection.',
          'active',
          '2026-05-01T10:55:00.000Z',
          '2026-05-01T11:00:00.000Z',
          null,
        );

      database
        .prepare(`
          INSERT INTO artifacts (
            id, task_id, source_type, source_id, kind, title, content,
            created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'artifact_packaged_task_dynamics',
          taskId,
          'run',
          'run_packaged_task_dynamics',
          'markdown',
          'Packaged task dynamics report',
          '# Packaged task dynamics report',
          '2026-05-01T12:01:00.000Z',
          '2026-05-01T12:01:00.000Z',
        );

      const insertTimeline = database.prepare(`
        INSERT INTO timeline_events (id, task_id, type, payload, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      insertTimeline.run(
        'timeline_packaged_task_dynamics_created',
        taskId,
        'task.created',
        JSON.stringify({ title: 'Packaged task dynamics fixture' }),
        '2026-05-01T08:00:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_task_dynamics_criteria',
        taskId,
        'completion_criteria.satisfied',
        JSON.stringify({ text: 'Packaged task dynamics fixture accepted' }),
        '2026-05-01T08:30:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_task_dynamics_source',
        taskId,
        'source_context.updated',
        JSON.stringify({ sourceContextId: 'source_packaged_task_dynamics', title: 'Packaged task dynamics notes' }),
        '2026-05-01T11:00:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_task_dynamics_decision',
        taskId,
        'task.decision_approved',
        JSON.stringify({ title: 'Approve packaged task dynamics smoke', decisionId: 'decision_packaged_task_dynamics' }),
        '2026-05-01T11:30:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_task_dynamics_run',
        taskId,
        'task.run_completed',
        JSON.stringify({ title: 'Packaged task dynamics smoke run', runId: 'run_packaged_task_dynamics' }),
        '2026-05-01T12:00:00.000Z',
      );
    })();
  } finally {
    database.close();
  }
}

async function openTaskFromDirectory(page, title) {
  await page.getByRole('button', { name: 'Tasks' }).click();
  await page.getByRole('button', { name: '任务目录' }).click();
  await page.locator('.task-row', { hasText: title }).click();
}

async function assertTaskDynamicsUi(page) {
  await openTaskFromDirectory(page, 'Packaged task dynamics fixture');
  await page.getByRole('heading', { name: 'Packaged task dynamics fixture' }).waitFor();
  await page.getByRole('button', { name: '任务管理' }).waitFor();
  await page.getByRole('button', { name: '任务动态' }).waitFor();
  await page.getByText('任务摘要：Seeded by packaged task dynamics smoke.').waitFor();
  await page.getByText('1/1', { exact: true }).first().waitFor();
  await page.getByText('Packaged task dynamics fixture accepted').waitFor();

  await page.getByRole('button', { name: '任务动态' }).click();
  await page.getByLabel('任务动态关键脉络').waitFor();
  await page.getByText('关键脉络', { exact: true }).waitFor();
  await page.getByText('执行与恢复').first().waitFor();
  await page.getByText('拍板事项').first().waitFor();
  await page.getByText('Run 已完成').first().waitFor();
  await page.getByText('决策已批准：Approve packaged task dynamics smoke').first().waitFor();
}

if (process.platform !== 'darwin') {
  fail('macOS packaged task dynamics UI smoke requires macOS.');
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
  seedTaskDynamicsFixture();

  const page = await app.firstWindow({ timeout: timeoutMs });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertTaskDynamicsUi(page);

  await app.close();
  cleanup();
  console.log('macOS packaged task dynamics UI smoke check passed.');
} catch (error) {
  if (app) {
    await app.close().catch(() => {});
  }

  fail(
    error instanceof Error ? error.message : 'macOS packaged task dynamics UI smoke check failed.',
    error instanceof Error ? error.stack : null,
  );
}
