import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-timeline-ui-smoke-'));
const smokePath = path.join(userDataPath, 'timeline-ui-smoke.log');
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

function seedTimelineFixture() {
  const database = new Database(dbPath, {
    fileMustExist: true,
  });

  try {
    const taskId = 'task_packaged_timeline_ui_smoke';

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
          'Timeline packaged UI fixture',
          'Seeded by packaged Timeline UI smoke.',
          'running',
          'Review packaged Timeline grouping.',
          null,
          'none',
          null,
          '2026-04-30T08:00:00.000Z',
          '2026-05-01T12:00:00.000Z',
        );

      const insertTimeline = database.prepare(`
        INSERT INTO timeline_events (id, task_id, type, payload, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      database
        .prepare(`
          INSERT INTO runs (
            id, task_id, type, status, instructions, output, output_source,
            failure_reason, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'run_packaged_ui_1',
          taskId,
          'summarize',
          'completed',
          'Packaged Timeline UI smoke run.',
          'Packaged Timeline UI smoke completed.',
          'system',
          null,
          '2026-05-01T11:50:00.000Z',
          '2026-05-01T12:00:00.000Z',
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
          'decision_packaged_ui_1',
          taskId,
          'Approve packaged Timeline UI smoke',
          'approved',
          'run',
          'run_packaged_ui_1',
          'Packaged Timeline UI smoke',
          '2026-05-01T11:20:00.000Z',
          '2026-05-01T11:30:00.000Z',
        );

      insertTimeline.run(
        'timeline_packaged_ui_run',
        taskId,
        'task.run_completed',
        JSON.stringify({ runId: 'run_packaged_ui_1', nextState: 'planned' }),
        '2026-05-01T12:00:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_decision',
        taskId,
        'task.decision_approved',
        JSON.stringify({
          decisionId: 'decision_packaged_ui_1',
          decisionTitle: 'Approve packaged Timeline UI smoke',
        }),
        '2026-05-01T11:30:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_source',
        taskId,
        'source_context.updated',
        JSON.stringify({
          sourceContextId: 'source_packaged_ui_1',
          title: 'Packaged Timeline notes',
        }),
        '2026-05-01T11:00:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_next_step',
        taskId,
        'task.next_step_changed',
        JSON.stringify({
          from: null,
          to: '审阅 packaged Timeline UI smoke 结果。',
        }),
        '2026-05-01T10:45:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_waiting',
        taskId,
        'task.waiting_changed',
        JSON.stringify({
          from: null,
          to: '等待 packaged Timeline UI smoke 复核。',
        }),
        '2026-05-01T10:40:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_task_update',
        taskId,
        'task.updated',
        JSON.stringify({ summary: 'Lower priority packaged field update' }),
        '2026-05-01T10:30:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_artifact',
        taskId,
        'artifact.created',
        JSON.stringify({
          sourceType: 'run',
          sourceId: 'run_packaged_ui_1',
          title: 'Packaged Timeline smoke report',
        }),
        '2026-04-30T09:00:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_completion',
        taskId,
        'completion_criteria.satisfied',
        JSON.stringify({ text: 'Packaged Timeline fixture accepted' }),
        '2026-04-30T08:30:00.000Z',
      );
      insertTimeline.run(
        'timeline_packaged_ui_created',
        taskId,
        'task.created',
        JSON.stringify({ title: 'Timeline packaged UI fixture' }),
        '2026-04-30T08:00:00.000Z',
      );
    })();
  } finally {
    database.close();
  }
}

async function assertTimelineUi(page) {
  await page.getByRole('button', { name: /tasks/i }).click();
  await page.getByRole('button', { name: /Timeline packaged UI fixture/i }).click();
  await page.getByRole('heading', { name: 'Timeline packaged UI fixture' }).waitFor();

  await page.getByRole('button', { name: '展开全部 (9)' }).waitFor();
  await page.locator('.timeline-date-heading', { hasText: '2026-05-01' }).waitFor();
  await page.locator('.timeline-date-heading', { hasText: '2026-04-30' }).waitFor();
  await page.getByText('执行记录').first().waitFor();
  await page.getByText('决策').first().waitFor();
  await page.getByText('来源材料').first().waitFor();
  await page.getByText('产物').first().waitFor();
  await page.getByText('完成标准').first().waitFor();
  await page.getByText('关键事件').first().waitFor();
  await page.getByText('解释事件').first().waitFor();

  if (await page.getByText('任务字段已更新').count() > 0) {
    throw new Error('Packaged Timeline preview included trace task updates before expansion.');
  }

  await page.getByRole('button', { name: '展开全部 (9)' }).click();

  await page.getByText('任务字段已更新').waitFor();
  await page.getByText('创建任务：Timeline packaged UI fixture').waitFor();
  await page.getByText('执行完成，任务恢复到 planned。').waitFor();
  await page.getByText('决策已获批准：Approve packaged Timeline UI smoke。').waitFor();
  await page.getByText('来源材料更新：Packaged Timeline notes。').waitFor();
  await page.getByText('生成产物：Packaged Timeline smoke report。').waitFor();
  await page.getByText('完成标准已满足：Packaged Timeline fixture accepted。').waitFor();
  await page.getByText('留痕事件').first().waitFor();
}

async function assertRelatedRunTimelineUi(page) {
  await page.getByRole('button', { name: /runs/i }).click();
  await page.getByRole('heading', { name: '执行记录' }).waitFor();
  await page.getByText('Related Task Timeline').waitFor();
  await page.locator('.timeline-date-heading', { hasText: '2026-05-01' }).first().waitFor();
  await page.getByText('执行记录').first().waitFor();
  await page.getByText('产物').first().waitFor();
  await page.getByText('任务字段').first().waitFor();
  await page.getByText('关键事件').first().waitFor();
  await page.getByText('解释事件').first().waitFor();
  await page.getByText('执行完成，任务恢复到 planned。').waitFor();
  await page.getByText('生成产物：Packaged Timeline smoke report。').waitFor();
  await page.getByText('下一步从“未填写”调整为“审阅 packaged Timeline UI smoke 结果。”').waitFor();
}

async function assertRelatedDecisionTimelineUi(page) {
  await page.getByRole('button', { name: /decisions/i }).click();
  await page.getByRole('heading', { name: '待拍板事项' }).waitFor();
  await page.getByText('Related Task Timeline').waitFor();
  await page.locator('.timeline-date-heading', { hasText: '2026-05-01' }).first().waitFor();
  await page.getByText('决策').first().waitFor();
  await page.getByText('等待项').first().waitFor();
  await page.getByText('任务字段').first().waitFor();
  await page.getByText('关键事件').first().waitFor();
  await page.getByText('解释事件').first().waitFor();
  await page.getByText('决策已获批准：Approve packaged Timeline UI smoke。').waitFor();
  await page.getByText('等待原因从“未填写”调整为“等待 packaged Timeline UI smoke 复核。”').waitFor();
  await page.getByText('下一步从“未填写”调整为“审阅 packaged Timeline UI smoke 结果。”').waitFor();
}

if (process.platform !== 'darwin') {
  fail('macOS packaged Timeline UI smoke requires macOS.');
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
  seedTimelineFixture();

  const page = await app.firstWindow({ timeout: timeoutMs });
  await assertTimelineUi(page);
  await assertRelatedRunTimelineUi(page);
  await assertRelatedDecisionTimelineUi(page);

  await app.close();
  cleanup();
  console.log('macOS packaged Timeline UI smoke check passed.');
} catch (error) {
  if (app) {
    await app.close().catch(() => {});
  }

  fail(
    error instanceof Error ? error.message : 'macOS packaged Timeline UI smoke check failed.',
    error instanceof Error ? error.stack : null,
  );
}
