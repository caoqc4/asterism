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
          id, task_type, parent_task_id, child_task_ids, title, summary, state, next_step, waiting_reason,
          risk_level, risk_note, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertTask.run(
        'task_packaged_project_parent',
        'project',
        null,
        JSON.stringify(['task_packaged_project_scope', 'task_packaged_project_plan']),
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
        'simple',
        'task_packaged_project_parent',
        JSON.stringify([]),
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
        'simple',
        'task_packaged_project_parent',
        JSON.stringify([]),
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
        'satisfied',
        '2026-05-03T08:21:00.000Z',
        '2026-05-03T08:45:00.000Z',
        '2026-05-03T08:45:00.000Z',
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
          'resolved',
          '2026-05-03T08:30:00.000Z',
          '2026-05-03T08:47:00.000Z',
          '2026-05-03T08:47:00.000Z',
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

      database
        .prepare(`
          INSERT INTO source_contexts (
            id, task_id, title, kind, is_key, uri, content, note,
            status, created_at, updated_at, archived_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'source_packaged_project_scope_evidence',
          'task_packaged_project_scope',
          'packaged 范围确认记录',
          'note',
          'true',
          null,
          '范围清单已经确认，可进入方案产出。',
          '完成 packaged completion handoff smoke 的第一子任务证据。',
          'active',
          '2026-05-03T08:46:00.000Z',
          '2026-05-03T08:46:00.000Z',
          null,
        );

      const insertTaskFile = database.prepare(`
        INSERT INTO task_files (
          id, task_id, name, path, kind, content, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertTaskFile.run(
        'task_file_packaged_project_scope_md',
        'task_packaged_project_scope',
        'Task.md',
        'Task.md',
        'file',
        [
          '# Task',
          '',
          '## Goal',
          '确认 packaged 项目范围',
          '',
          '## Next Step',
          '整理范围清单。',
          '',
        ].join('\n'),
        '2026-05-03T08:05:00.000Z',
        '2026-05-03T08:05:00.000Z',
      );

      insertTaskFile.run(
        'task_file_packaged_project_plan_md',
        'task_packaged_project_plan',
        'Task.md',
        'Task.md',
        'file',
        [
          '# Task',
          '',
          '## Goal',
          '产出 packaged 项目方案',
          '',
          '## Next Step',
          '等待范围确认后产出方案。',
          '',
        ].join('\n'),
        '2026-05-03T08:10:00.000Z',
        '2026-05-03T08:10:00.000Z',
      );
    })();
  } finally {
    database.close();
  }
}

function queryTaskRow(taskId) {
  const database = new Database(dbPath, { fileMustExist: true });
  try {
    return database.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  } finally {
    database.close();
  }
}

function queryTaskFiles(taskId) {
  const database = new Database(dbPath, { fileMustExist: true });
  try {
    return database.prepare('SELECT * FROM task_files WHERE task_id = ? ORDER BY created_at ASC').all(taskId);
  } finally {
    database.close();
  }
}

function queryTimelineEvents(taskId) {
  const database = new Database(dbPath, { fileMustExist: true });
  try {
    return database.prepare('SELECT * FROM timeline_events WHERE task_id = ? ORDER BY created_at ASC').all(taskId);
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
  await page.getByRole('button', { name: 'Legacy Tasks' }).click();
  await page.getByRole('button', { name: '+ 新建任务' }).click();
  await page.getByPlaceholder(/任务标题/).fill('打包验收新项目');
  await page.getByRole('button', { name: '创建' }).click();
  await page.getByText('✓ 已创建').waitFor();

  await page.getByRole('heading', { name: '打包验收新项目' }).waitFor();
  await page.getByText('0/0').first().waitFor();
  await page.getByText('在 AI 面板确认拆解方案后，这里会显示子任务和完成标准；确认前不会写入真实任务。').waitFor();
  const childRows = await page.locator('.project-child-card').count();
  if (childRows !== 0) {
    throw new Error(`Fresh project unexpectedly rendered ${childRows} child rows before decomposition confirmation.`);
  }
}

async function assertConfirmedProjectStructure(page) {
  await page.getByRole('button', { name: 'Legacy Tasks' }).click();
  await page.getByRole('button', { name: /项目型/ }).click();
  await page.getByRole('button', { name: '任务目录' }).click();

  const projectGroup = page.locator('.task-directory-group', { hasText: 'Packaged Project parent fixture' });
  await projectGroup.getByText('0/2 完成').waitFor();
  await projectGroup.getByText('确认 packaged 项目范围', { exact: true }).waitFor();
  await projectGroup.getByText('产出 packaged 项目方案', { exact: true }).waitFor();

  await projectGroup.locator('.task-row', { hasText: 'Packaged Project parent fixture' }).click();
  await page.getByRole('heading', { name: 'Packaged Project parent fixture' }).waitFor();
  await page.getByText('项目结构', { exact: true }).waitFor();
  await page.getByText('0/2').first().waitFor();
  await page.getByText('确认 packaged 项目范围').waitFor();
  await page.getByText('产出 packaged 项目方案').waitFor();
}

async function assertCompletionHandoff(page) {
  await page.getByRole('button', { name: 'Legacy Tasks' }).click();
  await page.getByRole('button', { name: /项目型/ }).click();
  await page.getByRole('button', { name: '任务目录' }).click();

  const projectGroup = page.locator('.task-directory-group', { hasText: 'Packaged Project parent fixture' });
  await projectGroup.locator('.task-row', { hasText: 'Packaged Project parent fixture' }).click();
  await page.getByRole('heading', { name: 'Packaged Project parent fixture' }).waitFor();

  const childList = page.locator('.project-child-list');
  await childList.getByRole('button', { name: /确认 packaged 项目范围/ }).click();
  await page.getByRole('heading', { name: '确认 packaged 项目范围' }).waitFor();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.locator('.completion-check-modal').getByRole('button', { name: '完成', exact: true }).click();
  await page.getByText('任务已完成').waitFor({ timeout: timeoutMs });
  await page.getByRole('button', { name: '进入下一任务' }).click();

  try {
    await waitFor(() => queryTaskRow('task_packaged_project_scope')?.state === 'completed', 'completed first packaged child');
  } catch (error) {
    const row = queryTaskRow('task_packaged_project_scope');
    const events = queryTimelineEvents('task_packaged_project_scope');
    throw new Error([
      error instanceof Error ? error.message : 'Timed out waiting for completed first packaged child.',
      `taskState=${row?.state ?? '<missing>'}`,
      `timeline=${events.map((event) => `${event.type}:${event.payload}`).join(' | ')}`,
    ].join('\n'));
  }
  try {
    await waitFor(() => (
      queryTaskFiles('task_packaged_project_scope').some((file) => /completion-handoff\.md$/.test(file.path))
      && queryTaskFiles('task_packaged_project_plan').some((file) => /received-handoff\.md$/.test(file.path))
    ), 'persisted completion handoff Task Records');
  } catch (error) {
    throw new Error([
      error instanceof Error ? error.message : 'Timed out waiting for persisted completion handoff Task Records.',
      `scopeFiles=${queryTaskFiles('task_packaged_project_scope').map((file) => file.path).join(',')}`,
      `planFiles=${queryTaskFiles('task_packaged_project_plan').map((file) => file.path).join(',')}`,
      `scopeTimeline=${queryTimelineEvents('task_packaged_project_scope').map((event) => `${event.type}:${event.payload}`).join(' | ')}`,
      `planTimeline=${queryTimelineEvents('task_packaged_project_plan').map((event) => `${event.type}:${event.payload}`).join(' | ')}`,
    ].join('\n'));
  }
  await waitFor(() => (
    queryTimelineEvents('task_packaged_project_scope').some((event) => (
      event.type === 'panel.completion_handoff'
      && /task_packaged_project_plan/.test(event.payload ?? '')
    ))
    && queryTimelineEvents('task_packaged_project_plan').some((event) => (
      event.type === 'panel.completion_handoff'
      && /task_packaged_project_scope/.test(event.payload ?? '')
    ))
  ), 'persisted completion handoff timeline events');

  const receivedRecord = queryTaskFiles('task_packaged_project_plan')
    .find((file) => /received-handoff\.md$/.test(file.path));
  if (!receivedRecord || !/## From/.test(receivedRecord.content) || !/确认 packaged 项目范围/.test(receivedRecord.content)) {
    throw new Error('Received handoff Task Record is missing source recovery content.');
  }

  await page.getByRole('heading', { name: '产出 packaged 项目方案' }).waitFor({ timeout: timeoutMs });
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
  await assertCompletionHandoff(page);

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
