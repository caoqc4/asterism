#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ENABLED = process.env.TASKPLANE_RUN_AGENT_CLI_NATIVE_GOAL_DISCOVERY === 'true';
const RUNTIME = normalizeRuntime(process.env.TASKPLANE_AGENT_CLI_NATIVE_GOAL_RUNTIME ?? 'codex');
const OBJECTIVE = (process.env.TASKPLANE_AGENT_CLI_NATIVE_GOAL_OBJECTIVE ?? '').trim();
const ARGS_JSON = (process.env.TASKPLANE_AGENT_CLI_NATIVE_GOAL_ARGS_JSON ?? '').trim();
const STDIN = process.env.TASKPLANE_AGENT_CLI_NATIVE_GOAL_STDIN ?? '';
const TIMEOUT_MS = Number(process.env.TASKPLANE_AGENT_CLI_NATIVE_GOAL_TIMEOUT_MS ?? 30_000);

const RUNTIME_ADAPTERS = {
  codex: {
    command: 'codex',
    helpProbes: [
      ['--version'],
      ['--help'],
      ['exec', '--help'],
    ],
    label: 'Codex CLI',
    minimumNativeGoalVersion: '0.133.0',
    candidateExamples: [
      'TASKPLANE_AGENT_CLI_NATIVE_GOAL_ARGS_JSON=\'["exec","--json","--sandbox","read-only","--enable","goals","/goal inspect disposable goal support"]\'',
    ],
  },
  claude: {
    command: 'claude',
    helpProbes: [
      ['--version'],
      ['--help'],
    ],
    label: 'Claude Code',
    minimumNativeGoalVersion: 'adapter-not-verified',
    candidateExamples: [
      'TASKPLANE_AGENT_CLI_NATIVE_GOAL_ARGS_JSON=\'["-p","/goal inspect disposable goal support","--permission-mode","plan","--output-format","text"]\'',
    ],
  },
};

export function runAgentCliNativeGoalDiscovery() {
  console.log('Agent CLI native-goal discovery');
  console.log(`runtime=${RUNTIME ?? 'invalid'}`);
  console.log(`enabled=${ENABLED ? 'true' : 'false'}`);

  if (!RUNTIME) {
    console.log('status=failed');
    console.log('error=TASKPLANE_AGENT_CLI_NATIVE_GOAL_RUNTIME must be codex or claude');
    return 1;
  }

  const adapter = RUNTIME_ADAPTERS[RUNTIME];
  console.log(`label=${adapter.label}`);
  console.log(`minimumNativeGoalVersion=${adapter.minimumNativeGoalVersion}`);
  console.log('taskplaneGoalLoop=available');
  console.log('nativeGoalForwarding=audit-only');
  console.log('passthrough=closed');

  for (const args of adapter.helpProbes) {
    const result = runCommand(adapter.command, args, { timeout: 10_000 });
    printProbe(adapter.command, args, result);
  }

  if (!ENABLED) {
    console.log('status=skip');
    console.log('note=default discovery only probes version/help. Set TASKPLANE_RUN_AGENT_CLI_NATIVE_GOAL_DISCOVERY=true to run one explicit disposable candidate command.');
    console.log('continueWith=taskplane_goal_loop');
    console.log('required=TASKPLANE_AGENT_CLI_NATIVE_GOAL_ARGS_JSON');
    console.log('required=TASKPLANE_AGENT_CLI_NATIVE_GOAL_OBJECTIVE');
    for (const example of adapter.candidateExamples) {
      console.log(`candidateExample=${example}`);
    }
    return 0;
  }

  if (!OBJECTIVE) {
    console.log('status=failed');
    console.log('error=TASKPLANE_AGENT_CLI_NATIVE_GOAL_OBJECTIVE is required when execution is enabled.');
    return 1;
  }

  const args = parseArgsJson(ARGS_JSON);
  if (!args.ok) {
    console.log('status=failed');
    console.log(`error=${args.error}`);
    return 1;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-native-goal-discovery-'));
  try {
    fs.writeFileSync(path.join(tempRoot, 'TASK.md'), [
      '# Native Goal Discovery Fixture',
      '',
      `Objective: ${OBJECTIVE}`,
      '',
      'This workspace is disposable. The discovery script will fail if files change.',
      '',
    ].join('\n'), 'utf8');

    const beforeSnapshot = collectWorkspaceSnapshot(tempRoot);
    const result = runCommand(adapter.command, args.value, {
      cwd: tempRoot,
      input: STDIN || [
        'Taskplane native-goal discovery.',
        `Objective: ${OBJECTIVE}`,
        'Do not create, modify, delete, rename, or move files.',
      ].join('\n'),
      timeout: Number.isFinite(TIMEOUT_MS) && TIMEOUT_MS > 0 ? TIMEOUT_MS : 30_000,
    });
    const afterSnapshot = collectWorkspaceSnapshot(tempRoot);
    const workspaceChanged = JSON.stringify(beforeSnapshot) !== JSON.stringify(afterSnapshot);

    console.log(`candidateCommand=${adapter.command} ${args.value.join(' ')}`);
    console.log(`candidateStatus=${result.status}`);
    console.log(`candidateTimedOut=${result.timedOut ? 'true' : 'false'}`);
    console.log(`workspace=${workspaceChanged ? 'changed' : 'unchanged'}`);
    console.log(`candidateOutput=${preview(result.output, 2_000)}`);
    console.log(`status=${workspaceChanged ? 'failed' : 'completed'}`);
    return workspaceChanged ? 1 : 0;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function parseArgsJson(value) {
  if (!value) {
    return { ok: false, error: 'TASKPLANE_AGENT_CLI_NATIVE_GOAL_ARGS_JSON is required when execution is enabled.' };
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string' || item.trim() === '')) {
      return { ok: false, error: 'TASKPLANE_AGENT_CLI_NATIVE_GOAL_ARGS_JSON must be a JSON array of non-empty strings.' };
    }
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, error: `TASKPLANE_AGENT_CLI_NATIVE_GOAL_ARGS_JSON is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    input: options.input,
    maxBuffer: 256_000,
    timeout: options.timeout ?? 30_000,
  });

  return {
    error: result.error ?? null,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    status: result.status ?? (result.error ? 1 : 0),
    timedOut: result.error?.code === 'ETIMEDOUT',
  };
}

function printProbe(command, args, result) {
  console.log(`probe=${command} ${args.join(' ')}`);
  console.log(`probeStatus=${result.status}`);
  console.log(`probeTimedOut=${result.timedOut ? 'true' : 'false'}`);
  if (result.error && result.error.code !== 'ETIMEDOUT') {
    console.log(`probeError=${result.error.message}`);
  }
  console.log(`probeOutput=${preview(result.output, 600)}`);
}

function collectWorkspaceSnapshot(rootPath) {
  return collectFiles(rootPath).map((filePath) => {
    const relativePath = path.relative(rootPath, filePath);
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

function preview(text, maxLength) {
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength) || '<empty>';
}

function normalizeRuntime(value) {
  const runtime = String(value).trim().toLowerCase();
  if (runtime === 'codex' || runtime === 'claude') return runtime;
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runAgentCliNativeGoalDiscovery();
}
