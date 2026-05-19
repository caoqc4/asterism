import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { _electron as electron } from 'playwright';

const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-agent-cli-task-smoke-'));
const userDataPath = path.join(tempRoot, 'user-data');
const workspaceRoot = path.join(tempRoot, 'workspace');
const fakeBinRoot = path.join(tempRoot, 'bin');
const fakeCodexPath = path.join(fakeBinRoot, 'codex');
const dbPath = path.join(userDataPath, 'taskplane.db');
const smokePath = path.join(userDataPath, 'agent-cli-task-smoke.log');
const workspaceFile = 'README.md';
const taskId = 'task_agent_cli_task_smoke';
const timeoutMs = 25_000;
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
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(`Timed out waiting for ${description}.`);
}

function prepareWorkspace() {
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.mkdirSync(fakeBinRoot, { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, workspaceFile),
    'Taskplane Agent CLI packaged smoke fixture.\n',
    'utf8',
  );
  fs.writeFileSync(fakeCodexPath, [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    'const args = process.argv.slice(2);',
    "if (args.includes('--version')) { console.log('codex fake 0.0.0'); process.exit(0); }",
    "if (args[0] === 'login' && args[1] === 'status') { console.log('Logged in'); process.exit(0); }",
    "if (args[0] !== 'exec') { console.error('unsupported fake codex command'); process.exit(2); }",
    "let input = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => { input += chunk; });",
    "process.stdin.on('end', () => {",
    "  if (/hold for cancellation/i.test(input)) {",
    "    process.on('SIGTERM', () => { console.log('FAKE_CODEX_CANCELLED'); process.exit(143); });",
    "    setInterval(() => {}, 1000);",
    "    return;",
    '  }',
    "  console.log('FAKE_CODEX_TASK_SMOKE_OK');",
    "  console.log('Findings: read-only task inspection completed.');",
    "  console.log('Next step: verify task dynamics and memory proposal.');",
    '});',
  ].join('\n'), 'utf8');
  fs.chmodSync(fakeCodexPath, 0o755);
}

function workspaceSnapshot() {
  return fs.readFileSync(path.join(workspaceRoot, workspaceFile), 'utf8');
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
          'Agent CLI packaged task smoke',
          'Use the selected Codex CLI runtime to inspect this task without modifying files.',
          'running',
          'Run a read-only Agent CLI smoke request.',
          null,
          'none',
          null,
          '2026-05-19T08:00:00.000Z',
          '2026-05-19T08:00:00.000Z',
        );
      database
        .prepare(`
          INSERT INTO task_files (
            id, task_id, name, path, kind, content, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'task_file_agent_cli_task_smoke_md',
          taskId,
          'Task.md',
          'Task.md',
          'file',
          [
            '# Task',
            '',
            '## Goal',
            'Agent CLI packaged task smoke',
            '',
            '## Next Step',
            'Run a read-only Agent CLI smoke request.',
            '',
          ].join('\n'),
          '2026-05-19T08:00:00.000Z',
          '2026-05-19T08:00:00.000Z',
        );
    })();
  } finally {
    database.close();
  }
}

function queryRunRows() {
  const database = new Database(dbPath, { fileMustExist: true });
  try {
    return database.prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY created_at ASC').all(taskId);
  } finally {
    database.close();
  }
}

function queryRunStepRows(runId) {
  const database = new Database(dbPath, { fileMustExist: true });
  try {
    return database.prepare('SELECT * FROM run_steps WHERE run_id = ? ORDER BY step_index ASC').all(runId);
  } finally {
    database.close();
  }
}

async function openTaskPanel(page) {
  await page.getByRole('button', { name: 'Tasks' }).click();
  await page.getByRole('button', { name: '任务目录' }).click();
  await page.locator('.task-row', { hasText: 'Agent CLI packaged task smoke' }).click();
  await page.getByRole('heading', { name: 'Agent CLI packaged task smoke' }).waitFor();
  await page.locator('.task-primary-action').click();
  await page.getByPlaceholder(/关于「Agent CLI packaged task smoke」/).waitFor();
}

async function sendPanelMessage(page, message) {
  const input = page.getByPlaceholder(/关于「Agent CLI packaged task smoke」/);
  await input.fill(message);
  await page.locator('.panel-input-foot').getByRole('button', { name: '发送' }).click();
}

async function assertTaskDynamicsShowsAgentCli(page) {
  await page.getByRole('button', { name: '任务动态' }).click();
  await page.getByText(/Codex CLI 已完成|Codex CLI 输出/).first().waitFor({ timeout: timeoutMs });
}

if (process.platform !== 'darwin') {
  fail('macOS packaged Agent CLI task smoke requires macOS.');
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
      PATH: `${fakeBinRoot}:${process.env.PATH ?? ''}`,
      TASKPLANE_USER_DATA_DIR: userDataPath,
      TASKPLANE_WORKSPACE_ROOT: workspaceRoot,
      TASKPLANE_ENABLE_SCHEDULER: 'false',
      TASKPLANE_RUNTIME_SMOKE_PATH: smokePath,
      TASKPLANE_AGENT_CLI_RUNTIME_FIXTURE_JSON: JSON.stringify({
        updatedAt: '2026-05-19T08:00:00.000Z',
        runtimes: [{
          id: 'codex',
          label: 'Codex CLI',
          command: 'codex',
          executablePath: fakeCodexPath,
          installed: true,
          version: 'codex fake 0.0.0',
          authState: 'ready',
          executionSupport: 'manual_run',
          workload: 'idle',
          missingReason: null,
        }],
      }),
    },
    timeout: timeoutMs,
  });

  await waitFor(() => fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0, 'packaged app database');
  seedTaskFixture();

  const beforeWorkspace = workspaceSnapshot();
  const page = await app.firstWindow({ timeout: timeoutMs });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openTaskPanel(page);
  await page.getByText(/(?:任务 Agent · )?Codex CLI · 只读/).waitFor();

  await sendPanelMessage(page, 'Hold for cancellation.');
  await waitFor(() => queryRunRows().length >= 1, 'created cancellable Agent CLI run');
  await page.getByRole('button', { name: '取消 Codex CLI run' }).click();
  await waitFor(() => {
    const [run] = queryRunRows();
    return run?.status === 'failed';
  }, 'cancelled Agent CLI run evidence');
  const [cancelledRun] = queryRunRows();
  const cancelledSteps = queryRunStepRows(cancelledRun.id);
  if (!cancelledSteps.some((step) => step.title === 'codex cli failed' && /cancel/i.test(step.error ?? step.output ?? ''))) {
    throw new Error('Missing Agent CLI cancellation terminal evidence.');
  }
  if (!cancelledSteps.some((step) => step.title === '验收子 Agent 检查' && step.status === 'failed')) {
    throw new Error('Missing Agent CLI cancellation acceptance-check evidence.');
  }
  if (!cancelledSteps.some((step) => step.title === '验收子 Agent 检查' && /"decision": "failed"/.test(step.input ?? '') && /Should propose task memory: no/.test(step.output ?? ''))) {
    throw new Error('Missing structured cancellation verifier decision.');
  }
  if (cancelledSteps.some((step) => step.title === '任务记忆建议')) {
    throw new Error('Cancellation must not create a task memory proposal.');
  }

  await sendPanelMessage(page, 'Run the packaged Agent CLI smoke.');
  await waitFor(() => queryRunRows().length >= 2, 'created Agent CLI run');
  await waitFor(() => {
    const rows = queryRunRows();
    return rows.length >= 2 && rows[1]?.status === 'completed';
  }, 'completed Agent CLI run');
  await page.getByText(/Codex CLI run 已完成/).waitFor({ timeout: timeoutMs });

  const completedRun = queryRunRows()[1];
  const completedSteps = queryRunStepRows(completedRun.id);
  if (!completedSteps.some((step) => step.title === 'agent cli run accepted')) {
    throw new Error('Missing Agent CLI accepted run step.');
  }
  if (!completedSteps.some((step) => step.title === 'Agent CLI 目标契约' && /taskGoal=active/.test(step.output ?? '') && /objective=/.test(step.output ?? ''))) {
    throw new Error(`Missing Agent CLI run contract evidence. steps=${completedSteps.map((step) => `${step.title}:${String(step.output ?? '').slice(0, 80)}`).join(' | ')}`);
  }
  if (!completedSteps.some((step) => step.title === 'codex cli completed')) {
    throw new Error('Missing Agent CLI terminal run step.');
  }
  if (!completedSteps.some((step) => step.title === '验收子 Agent 检查' && /Verdict: pass/.test(step.output ?? ''))) {
    throw new Error('Missing Agent CLI acceptance-check evidence.');
  }
  if (!completedSteps.some((step) => step.title === '验收子 Agent 检查' && /"decision": "accept_for_review"/.test(step.input ?? '') && /Can mark task complete: no/.test(step.output ?? ''))) {
    throw new Error('Missing structured Agent CLI acceptance verifier decision.');
  }
  if (!completedSteps.some((step) => step.title === '任务记忆建议' && /"decision":"accept_for_review"/.test(step.input ?? '') && /Verifier decision: accept_for_review/.test(step.output ?? ''))) {
    throw new Error('Missing Agent CLI task memory guidance step.');
  }
  await assertTaskDynamicsShowsAgentCli(page);

  if (workspaceSnapshot() !== beforeWorkspace) {
    throw new Error('Agent CLI packaged smoke changed the workspace fixture.');
  }

  await app.close();
  cleanup();
  console.log('macOS packaged Agent CLI task smoke check passed.');
} catch (error) {
  if (app) {
    await app.close().catch(() => {});
  }

  fail(
    error instanceof Error ? error.message : 'macOS packaged Agent CLI task smoke check failed.',
    error instanceof Error ? error.stack : null,
  );
}
