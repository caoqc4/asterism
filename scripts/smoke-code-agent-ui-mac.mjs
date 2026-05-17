import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-code-agent-ui-smoke-'));
const userDataPath = path.join(tempRoot, 'user-data');
const workspaceRoot = path.join(tempRoot, 'workspace');
const smokePath = path.join(userDataPath, 'code-agent-ui-smoke.log');
const dbPath = path.join(userDataPath, 'taskplane.db');
const contextFile = 'docs/code-agent-context.md';
const timeoutMs = 20_000;
const pollMs = 250;

function cleanup() {
  fs.rmSync(tempRoot, { recursive: true, force: true });
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

function prepareWorkspace() {
  fs.mkdirSync(path.join(workspaceRoot, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true });
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, 'package.json'),
    JSON.stringify({
      private: true,
      scripts: {
        lint: 'node -e "console.log(\'lint packaged smoke ok\')"',
        test: 'node -e "console.log(\'test packaged smoke ok\')"',
      },
    }, null, 2),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspaceRoot, contextFile),
    [
      '# Code Agent packaged UI smoke',
      '',
      'This file is read-only context for packaged Code Agent preflight visibility.',
      '',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(workspaceRoot, 'src', 'manual-target.md'),
    '# Packaged smoke target\n',
    'utf8',
  );
}

function seedCodeAgentFixture() {
  const database = new Database(dbPath, {
    fileMustExist: true,
  });

  try {
    const taskId = 'task_packaged_code_agent_ui_smoke';

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
          'Packaged Code Agent UI fixture',
          `Review ${contextFile} before preparing src/manual-target.md.`,
          'running',
          'Inspect packaged Code Agent preflight visibility.',
          null,
          'none',
          null,
          '2026-05-02T08:00:00.000Z',
          '2026-05-02T08:10:00.000Z',
        );

      database
        .prepare(`
          INSERT INTO completion_criteria (
            id, task_id, text, verification_responsibility,
            verification_responsibility_label, status, created_at, updated_at,
            satisfied_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'criteria_packaged_code_agent_ui_1',
          taskId,
          'Code Agent preflight is visible before any provider or Docker action',
          'self',
          'Operator confirms preflight visibility',
          'open',
          '2026-05-02T08:01:00.000Z',
          '2026-05-02T08:01:00.000Z',
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
          'source_packaged_code_agent_ui_1',
          taskId,
          'Code Agent context note',
          'note',
          'true',
          null,
          `Use ${contextFile} and src/manual-target.md as read-only context candidates.`,
          'Visible only after model producer is explicitly selected.',
          'active',
          '2026-05-02T08:02:00.000Z',
          '2026-05-02T08:02:00.000Z',
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
          'artifact_packaged_code_agent_ui_1',
          taskId,
          'task',
          taskId,
          'note',
          'Code Agent patch notes',
          'Suggested packaged smoke patch target: src/manual-target.md.',
          '2026-05-02T08:03:00.000Z',
          '2026-05-02T08:03:00.000Z',
        );
    })();
  } finally {
    database.close();
  }
}

async function openTaskFromTaskList(page, title) {
  await page.getByRole('button', { name: 'Tasks' }).click();
  await page.getByRole('button', { name: '任务目录' }).click();
  await page.locator('.task-row', { hasText: title }).click();
}

async function assertCodeAgentPreflightUi(page) {
  await openTaskFromTaskList(page, 'Packaged Code Agent UI fixture');
  await page.getByRole('heading', { name: 'Packaged Code Agent UI fixture' }).waitFor();
  await page.getByRole('button', { name: '任务管理' }).waitFor();
  await page.getByRole('button', { name: '任务动态' }).waitFor();
  await page.getByText('标准满足', { exact: true }).waitFor();
  await page.getByText('Code Agent preflight is visible before any provider or Docker action').waitFor();
  await page.getByText('Code Agent context note').waitFor();
  await page.getByText('Code Agent patch notes').waitFor();
}

if (process.platform !== 'darwin') {
  fail('macOS packaged Code Agent UI smoke requires macOS.');
}

if (!fs.existsSync(executablePath)) {
  fail(`Missing packaged app executable: ${executablePath}`);
}

prepareWorkspace();

let app;

try {
  app = await electron.launch({
    executablePath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '',
      TASKPLANE_USER_DATA_DIR: userDataPath,
      TASKPLANE_WORKSPACE_ROOT: workspaceRoot,
      TASKPLANE_ENABLE_SCHEDULER: 'false',
      TASKPLANE_ENABLE_SANDBOX_CODING_AGENT: 'true',
      TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER: 'true',
      TASKPLANE_CODE_AGENT_CONTEXT_FILES: contextFile,
      TASKPLANE_ENABLE_SANDBOX_PATCH_PROMOTION_APPLY: 'false',
      TASKPLANE_RUNTIME_SMOKE_PATH: smokePath,
    },
    timeout: timeoutMs,
  });

  await waitFor(() => fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0, 'packaged app database');
  seedCodeAgentFixture();

  const page = await app.firstWindow({ timeout: timeoutMs });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await assertCodeAgentPreflightUi(page);

  await app.close();
  cleanup();
  console.log('macOS packaged Code Agent UI smoke check passed.');
} catch (error) {
  if (app) {
    await app.close().catch(() => {});
  }

  fail(
    error instanceof Error ? error.message : 'macOS packaged Code Agent UI smoke check failed.',
    error instanceof Error ? error.stack : null,
  );
}
