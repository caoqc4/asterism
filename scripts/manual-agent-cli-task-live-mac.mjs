#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { _electron as electron } from 'playwright';

const ENABLED = process.env.TASKPLANE_RUN_AGENT_CLI_TASK_LIVE_SMOKE === 'true';
const RUNTIME_ID = process.env.TASKPLANE_AGENT_CLI_TASK_LIVE_RUNTIME === 'claude' ? 'claude' : 'codex';
const RUNTIME = {
  codex: {
    authArgs: ['login', 'status'],
    command: 'codex',
    label: 'Codex CLI',
    terminalStepTitle: 'codex cli completed',
  },
  claude: {
    authArgs: ['auth', 'status'],
    command: 'claude',
    label: 'Claude Code',
    terminalStepTitle: 'claude code completed',
  },
}[RUNTIME_ID];
const EXPECTED_PHRASE = 'TASKPLANE_AGENT_CLI_TASK_LIVE_OK';
const root = process.cwd();
const executablePath = path.join(root, 'release/mac-arm64/Taskplane.app/Contents/MacOS/Taskplane');
const timeoutMs = Number(process.env.TASKPLANE_AGENT_CLI_TASK_LIVE_TIMEOUT_MS ?? 180_000);
const pollMs = 500;
const taskId = 'task_agent_cli_task_live_smoke';
const workspaceFile = 'README.md';

console.log('Agent CLI packaged task live smoke');
console.log(`runtime=${RUNTIME_ID}`);

if (!ENABLED) {
  console.log('status=skip');
  console.log(`set TASKPLANE_RUN_AGENT_CLI_TASK_LIVE_SMOKE=true to launch the packaged app and call the local ${RUNTIME.label} account`);
  console.log('accountReadiness=not-checked');
  console.log('manualEvidence=not-recorded');
  console.log('cli=not-called');
  console.log('packagedApp=not-launched');
  console.log('workspace=unchanged');
  process.exit(0);
}

if (process.platform !== 'darwin') {
  fail('status=failed\nerror=macOS packaged Agent CLI task live smoke requires macOS.');
}

if (!fs.existsSync(executablePath)) {
  fail(`status=failed\nerror=Missing packaged app executable: ${executablePath}\nrun=npm run dist:mac:dir`);
}

const runtimePath = firstLine(runCommand('sh', ['-lc', `command -v ${RUNTIME.command}`]).output);
if (!runtimePath) {
  fail(`status=failed\ncli=missing\nworkspace=unchanged\nerror=${RUNTIME.command} command not found in PATH`);
}

const versionResult = runCommand(runtimePath, ['--version']);
if (versionResult.status !== 0) {
  fail(`status=failed\ncli=${RUNTIME_ID}\nworkspace=unchanged\nerror=${RUNTIME.command} --version failed\noutput=${preview(versionResult.output)}`);
}
console.log(`cli=${RUNTIME_ID}`);
console.log(`executablePath=${runtimePath}`);
console.log(`version=${firstLine(versionResult.output) || '<unknown>'}`);

const loginResult = runCommand(runtimePath, RUNTIME.authArgs);
if (loginResult.status !== 0) {
  fail(`status=failed\ncli=${RUNTIME_ID}\nauth=not-ready\nworkspace=unchanged\noutput=${preview(loginResult.output)}`);
}
console.log('auth=ready');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `taskplane-agent-cli-${RUNTIME_ID}-task-live-smoke-`));
const userDataPath = path.join(tempRoot, 'user-data');
const workspaceRoot = path.join(tempRoot, 'workspace');
const dbPath = path.join(userDataPath, 'taskplane.db');
const smokePath = path.join(userDataPath, 'agent-cli-task-live-smoke.log');

function cleanup() {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function prepareWorkspace() {
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, workspaceFile),
    [
      'Taskplane Agent CLI packaged live smoke fixture.',
      `Expected phrase: ${EXPECTED_PHRASE}`,
      'This workspace must remain unchanged.',
      '',
    ].join('\n'),
    'utf8',
  );
}

function workspaceSnapshot() {
  return collectFiles(workspaceRoot).map((filePath) => {
    const relativePath = path.relative(workspaceRoot, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    return `${relativePath}\0${content}`;
  });
}

function collectFiles(rootPath) {
  return fs.readdirSync(rootPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) return collectFiles(entryPath);
    return [entryPath];
  }).sort();
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
          `Agent CLI packaged live task smoke (${RUNTIME.label})`,
          `Use the real local ${RUNTIME.label} runtime to inspect this task without modifying files.`,
          'running',
          `Run a real read-only ${RUNTIME.label} task smoke request.`,
          null,
          'none',
          null,
          '2026-05-20T08:00:00.000Z',
          '2026-05-20T08:00:00.000Z',
        );
      database
        .prepare(`
          INSERT INTO task_files (
            id, task_id, name, path, kind, content, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          'task_file_agent_cli_task_live_smoke_md',
          taskId,
          'Task.md',
          'Task.md',
          'file',
          [
            '# Task',
            '',
            '## Goal',
            `Agent CLI packaged live task smoke (${RUNTIME.label})`,
            '',
            '## Next Step',
            `Run a real read-only ${RUNTIME.label} task smoke request.`,
            '',
          ].join('\n'),
          '2026-05-20T08:00:00.000Z',
          '2026-05-20T08:00:00.000Z',
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

async function waitFor(condition, description) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function openTaskPanel(page) {
  await page.getByRole('button', { name: 'Tasks' }).click();
  await page.getByRole('button', { name: '任务目录' }).click();
  await page.locator('.task-row', { hasText: `Agent CLI packaged live task smoke (${RUNTIME.label})` }).click();
  await page.getByRole('heading', { name: `Agent CLI packaged live task smoke (${RUNTIME.label})` }).waitFor();
  await page.locator('.task-primary-action').click();
  await page.getByPlaceholder(new RegExp(`关于「Agent CLI packaged live task smoke \\(${escapeRegExp(RUNTIME.label)}\\)」`)).waitFor();
}

async function sendPanelMessage(page, message) {
  const input = page.getByPlaceholder(new RegExp(`关于「Agent CLI packaged live task smoke \\(${escapeRegExp(RUNTIME.label)}\\)」`));
  await input.fill(message);
  await page.locator('.panel-input-foot').getByRole('button', { name: '发送' }).click();
}

function firstLine(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
}

function preview(text) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 500) || '<empty>';
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    input: options.input,
    maxBuffer: 128_000,
    shell: options.shell ?? false,
    timeout: options.timeout ?? 30_000,
  });
  return {
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    status: result.status ?? 1,
  };
}

function fail(message, error) {
  console.error(message);
  if (error) console.error(error);
  process.exit(1);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

prepareWorkspace();
const beforeWorkspace = workspaceSnapshot();
let app;

try {
  app = await electron.launch({
    executablePath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '',
      TASKPLANE_USER_DATA_DIR: userDataPath,
      TASKPLANE_WORKSPACE_ROOT: workspaceRoot,
      TASKPLANE_AI_RUNTIME_MODE: RUNTIME_ID,
      TASKPLANE_ENABLE_SCHEDULER: 'false',
      TASKPLANE_RUNTIME_SMOKE_PATH: smokePath,
      TASKPLANE_AGENT_CLI_RUNTIME_FIXTURE_JSON: JSON.stringify({
        updatedAt: '2026-05-20T08:00:00.000Z',
        runtimes: [{
          id: RUNTIME_ID,
          label: RUNTIME.label,
          command: RUNTIME.command,
          executablePath: runtimePath,
          installed: true,
          version: firstLine(versionResult.output) || RUNTIME.command,
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

  const page = await app.firstWindow({ timeout: timeoutMs });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openTaskPanel(page);
  await page.locator('.panel-runtime-chip', { hasText: RUNTIME.label }).waitFor({ timeout: timeoutMs });

  await sendPanelMessage(page, [
    `Run a real packaged ${RUNTIME.label} read-only smoke.`,
    `Reply with the exact phrase ${EXPECTED_PHRASE}.`,
    `You may inspect ${workspaceFile}, but do not modify, create, delete, rename, or move files.`,
  ].join('\n'));

  await waitFor(() => queryRunRows().length >= 1, 'created Agent CLI live run');
  await waitFor(() => queryRunRows()[0]?.status === 'completed', 'completed Agent CLI live run');

  const [run] = queryRunRows();
  const steps = queryRunStepRows(run.id);
  const terminalStep = steps.find((step) => step.title === RUNTIME.terminalStepTitle);
  if (!terminalStep) {
    throw new Error(`Missing real ${RUNTIME.label} terminal run step.`);
  }
  if (!String(terminalStep.output ?? '').includes(EXPECTED_PHRASE)) {
    throw new Error(`Real ${RUNTIME.label} output did not include expected phrase. output=${preview(terminalStep.output ?? '')}`);
  }
  if (!steps.some((step) => step.title === 'agent cli run accepted')) {
    throw new Error(`Missing accepted run step for real ${RUNTIME.label} task smoke.`);
  }
  if (!steps.some((step) => step.title === '验收子 Agent 检查')) {
    throw new Error(`Missing verifier step for real ${RUNTIME.label} task smoke.`);
  }

  const afterWorkspace = workspaceSnapshot();
  if (JSON.stringify(afterWorkspace) !== JSON.stringify(beforeWorkspace)) {
    throw new Error(`Real packaged ${RUNTIME.label} task smoke changed the workspace fixture.`);
  }

  await app.close();
  cleanup();
  console.log('workspace=unchanged');
  console.log('phrase=matched');
  console.log('status=passed');
} catch (error) {
  if (app) await app.close().catch(() => {});
  cleanup();
  fail(
    [
      'status=failed',
      'workspace=unknown',
      `error=${error instanceof Error ? error.message : String(error)}`,
    ].join('\n'),
    error instanceof Error ? error.stack : null,
  );
}
