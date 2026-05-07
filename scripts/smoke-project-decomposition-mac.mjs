import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-project-decomposition-smoke-'));
const smokePath = path.join(userDataPath, 'project-decomposition-smoke.log');
const dbPath = path.join(userDataPath, 'taskplane.db');
const timeoutMs = 20_000;
const pollMs = 250;
const taskAttributesStorageKey = 'taskplane.taskAttributes.v1';

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

function seedConfirmedProjectFixture() {
  const database = new Database(dbPath, { fileMustExist: true });

  try {
    database.transaction(() => {
      const insertTask = database.prepare(`
        INSERT INTO tasks (
          id, title, summary, state, next_step, waiting_reason,
          risk_level, risk_note, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertTask.run(
        'task_packaged_project_parent',
        'Packaged Project parent fixture',
        '完成打包版项目拆解闭环验收。',
        'planned',
        '先确认项目范围，再推进方案产出。',
        null,
        'none',
        null,
        '2026-05-03T08:00:00.000Z',
        '2026-05-03T08:20:00.000Z',
      );

      insertTask.run(
        'task_packaged_project_scope',
        '确认 packaged 项目范围',
        '明确项目边界、目标和验收口径。',
        'planned',
        '整理范围清单。',
        null,
        'none',
        null,
        '2026-05-03T08:05:00.000Z',
        '2026-05-03T08:25:00.000Z',
      );

      insertTask.run(
        'task_packaged_project_plan',
        '产出 packaged 项目方案',
        '形成可评审的项目推进方案。',
        'planned',
        '等待范围确认后产出方案。',
        null,
        'none',
        null,
        '2026-05-03T08:10:00.000Z',
        '2026-05-03T08:30:00.000Z',
      );

      const insertCriteria = database.prepare(`
        INSERT INTO completion_criteria (
          id, task_id, text, verification_responsibility,
          verification_responsibility_label, status, created_at, updated_at,
          satisfied_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertCriteria.run(
        'criteria_packaged_project_parent',
        'task_packaged_project_parent',
        '完成并验收 2 个项目子任务。',
        'unknown',
        null,
        'open',
        '2026-05-03T08:20:00.000Z',
        '2026-05-03T08:20:00.000Z',
        null,
      );
      insertCriteria.run(
        'criteria_packaged_project_scope',
        'task_packaged_project_scope',
        '范围清单被确认。',
        'unknown',
        null,
        'open',
        '2026-05-03T08:21:00.000Z',
        '2026-05-03T08:21:00.000Z',
        null,
      );
      insertCriteria.run(
        'criteria_packaged_project_plan',
        'task_packaged_project_plan',
        '方案可供评审。',
        'unknown',
        null,
        'open',
        '2026-05-03T08:22:00.000Z',
        '2026-05-03T08:22:00.000Z',
        null,
      );

      database
        .prepare(`
          INSERT INTO task_dependencies (
            id, task_id, blocked_by_task_id, reason, status,
            created_at, updated_at, resolved_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'dependency_packaged_project_plan_scope',
          'task_packaged_project_plan',
          'task_packaged_project_scope',
          '确认 packaged 项目范围',
          'active',
          '2026-05-03T08:30:00.000Z',
          '2026-05-03T08:30:00.000Z',
          null,
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
          'source_packaged_project_review',
          'task_packaged_project_parent',
          'AI 项目拆解自检',
          'note',
          'true',
          null,
          '子任务保持大块、边界清楚，暂不继续细拆。',
          '2 个子任务；用户确认后创建。',
          'active',
          '2026-05-03T08:35:00.000Z',
          '2026-05-03T08:35:00.000Z',
          null,
        );
    })();
  } finally {
    database.close();
  }
}

async function installProjectAttributes(page) {
  const now = new Date().toISOString();
  await page.evaluate(({ key, nowValue }) => {
    window.localStorage.setItem(key, JSON.stringify({
      task_packaged_project_parent: {
        taskId: 'task_packaged_project_parent',
        type: 'project',
        parentTaskId: null,
        childTaskIds: ['task_packaged_project_scope', 'task_packaged_project_plan'],
        commitment: null,
        schedule: null,
        trigger: null,
        updatedAt: nowValue,
      },
      task_packaged_project_scope: {
        taskId: 'task_packaged_project_scope',
        type: 'simple',
        parentTaskId: 'task_packaged_project_parent',
        childTaskIds: [],
        commitment: null,
        schedule: null,
        trigger: null,
        updatedAt: nowValue,
      },
      task_packaged_project_plan: {
        taskId: 'task_packaged_project_plan',
        type: 'simple',
        parentTaskId: 'task_packaged_project_parent',
        childTaskIds: [],
        commitment: null,
        schedule: null,
        trigger: null,
        updatedAt: nowValue,
      },
    }));
  }, { key: taskAttributesStorageKey, nowValue: now });
}

async function assertFreshProjectDoesNotCreateTemplateChildren(page) {
  await page.getByRole('button', { name: 'Tasks' }).click();
  await page.getByRole('button', { name: '+ 新建任务' }).click();
  await page.getByPlaceholder(/任务标题/).fill('打包验收新项目');
  await page.getByRole('button', { name: '创建' }).click();
  await page.getByText('✓ 已创建').waitFor();

  await page.getByRole('button', { name: /项目型/ }).click();
  await page.locator('.project-group', { hasText: '打包验收新项目' }).getByText('0/0 子任务完成').waitFor();
  await page.getByText('等待 AI 根据项目目标拆解子任务').waitFor();
  await page.getByText('拆解前不会自动生成模板任务；先生成草稿，确认后再创建真实子任务。').waitFor();
}

async function assertConfirmedProjectStructure(page) {
  await page.getByRole('button', { name: 'Tasks' }).click();
  await page.getByRole('button', { name: /项目型/ }).click();

  const projectGroup = page.locator('.project-group', { hasText: 'Packaged Project parent fixture' });
  await projectGroup.getByText('0/2 子任务完成').waitFor();
  await projectGroup.getByText('确认 packaged 项目范围', { exact: true }).waitFor();
  await projectGroup.getByText('产出 packaged 项目方案', { exact: true }).waitFor();
  await projectGroup.getByText('依赖：确认 packaged 项目范围', { exact: true }).waitFor();

  await projectGroup.locator('.task-row', { hasText: 'Packaged Project parent fixture' }).dblclick();
  await page.getByRole('heading', { name: 'Packaged Project parent fixture' }).waitFor();
  await page.getByText('项目子任务执行概览').waitFor();
  await page.getByText('0/2 子任务完成').waitFor();
  await page.getByText('确认 packaged 项目范围').waitFor();
  await page.getByText('产出 packaged 项目方案').waitFor();
  await page.getByText(/父任务工作台负责汇总子任务进度/).waitFor();
  await page.getByText(/复杂子任务应先升级为项目型再重新拆解/).waitFor();

  await page.getByRole('button', { name: '来源' }).click();
  await page.getByText('AI 项目拆解自检', { exact: true }).waitFor();
  await page.getByText(/AI 上下文优先读取最多 3 条关键来源/).waitFor();
}

if (process.platform !== 'darwin') {
  fail('macOS packaged project decomposition smoke requires macOS.');
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
  seedConfirmedProjectFixture();

  const page = await app.firstWindow({ timeout: timeoutMs });
  await installProjectAttributes(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await assertFreshProjectDoesNotCreateTemplateChildren(page);
  await assertConfirmedProjectStructure(page);

  await app.close();
  cleanup();
  console.log('macOS packaged Project decomposition smoke check passed.');
} catch (error) {
  if (app) {
    await app.close().catch(() => {});
  }

  fail(
    error instanceof Error ? error.message : 'macOS packaged Project decomposition smoke check failed.',
    error instanceof Error ? error.stack : null,
  );
}
