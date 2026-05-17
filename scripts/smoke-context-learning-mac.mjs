import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-context-learning-smoke-'));
const smokePath = path.join(userDataPath, 'context-learning-smoke.log');
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

function seedWorkHabitFixture() {
  const database = new Database(dbPath, { fileMustExist: true });

  try {
    const insertHabit = database.prepare(`
      INSERT INTO work_habits (
        id, rule, source, scope, scope_label, status, examples,
        created_at, last_applied_at, application_count, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    database.transaction(() => {
      insertHabit.run(
        'habit_packaged_confirmed',
        '发布前先跑完整 packaged smoke',
        'silent',
        'global',
        '全局',
        'confirmed',
        '来自多次发布验收。',
        '2026-05-04T08:00:00.000Z',
        '2026-05-04T08:20:00.000Z',
        4,
        '2026-05-04T08:20:00.000Z',
      );
      insertHabit.run(
        'habit_packaged_candidate',
        '发布前只跑最小 packaged smoke',
        'proposal',
        'global',
        '全局',
        'pending',
        '观察窗口：连续两次选择快速验收。',
        '2026-05-04T08:30:00.000Z',
        null,
        2,
        '2026-05-04T08:30:00.000Z',
      );
      insertHabit.run(
        'habit_packaged_sop',
        '项目拆解后先检查父子结构',
        'sop',
        'project',
        '项目',
        'confirmed',
        '从任务工作台提取并保存的 SOP 模板。',
        '2026-05-04T08:40:00.000Z',
        '2026-05-04T08:45:00.000Z',
        1,
        '2026-05-04T08:45:00.000Z',
      );
    })();
  } finally {
    database.close();
  }
}

async function assertContextLearningUi(page) {
  await page.getByRole('button', { name: 'Work Habits' }).click();
  await page.getByRole('heading', { name: 'Work Habits' }).waitFor();
  await page.getByText('工作习惯记录', { exact: true }).first().waitFor();
  await page.getByText(/任务文件和产物在 Tasks 中管理/).waitFor();
  await page.getByText('待确认规则只作为提议展示，不会自动改变后续执行流程。', { exact: true }).waitFor();
  await page.getByText(/只在 Step\/Run\/Task 完成、你编辑 AI 产物、或会话压缩前提取学习信号/).first().waitFor();

  await page.getByText('发布前只跑最小 packaged smoke').waitFor();
  await page.getByText(/与已确认规则冲突：发布前先跑完整 packaged smoke/).waitFor();
  await page.getByText('项目拆解后先检查父子结构').waitFor();

  await page.getByRole('button', { name: '保留旧规则' }).click();
  await page.locator('.ctx-habit-row', { hasText: '发布前只跑最小 packaged smoke' }).getByText('已停用').first().waitFor();

  await page.getByRole('button', { name: '新增规则' }).click();
  await page.getByPlaceholder('例如：代码合入前先跑完整测试').fill('打包验收后记录结论');
  await page.getByPlaceholder('例子或触发场景').fill('发布前验收完成后沉淀。');
  await page.getByRole('button', { name: '保存规则' }).click();
  await page.getByText('打包验收后记录结论').waitFor();
  await page.locator('.ctx-habit-row', { hasText: '打包验收后记录结论' }).getByText('用户创建', { exact: true }).waitFor();
}

async function assertSopSuggestionUsesPersistedHabits(page) {
  await page.getByRole('button', { name: 'Tasks' }).click();
  await page.getByRole('button', { name: '+ 新建任务' }).click();
  await page.getByPlaceholder(/任务标题/).fill('项目拆解验收任务');
  await page.getByText('可参考流程模板', { exact: true }).waitFor();
  await page.getByText('项目拆解后先检查父子结构').waitFor();
  await page.getByText('创建后 AI 会在规划讨论中建议是否加载，不会自动套用。').waitFor();
}

if (process.platform !== 'darwin') {
  fail('macOS packaged Work Habits learning smoke requires macOS.');
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
  seedWorkHabitFixture();

  const page = await app.firstWindow({ timeout: timeoutMs });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertContextLearningUi(page);
  await assertSopSuggestionUsesPersistedHabits(page);

  await app.close();
  cleanup();
  console.log('macOS packaged Work Habits learning smoke check passed.');
} catch (error) {
  if (app) {
    await app.close().catch(() => {});
  }

  fail(
    error instanceof Error ? error.message : 'macOS packaged Work Habits learning smoke check failed.',
    error instanceof Error ? error.stack : null,
  );
}
