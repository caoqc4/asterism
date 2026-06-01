#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ENABLED = process.env.TASKPLANE_RUN_AGENT_CLI_NATIVE_WEB_SEARCH_SMOKE === 'true';
const EXPECTED_PHRASE = 'TASKPLANE_AGENT_CLI_NATIVE_WEB_SEARCH_SMOKE_OK';
const RUNTIME = normalizeRuntime(process.env.TASKPLANE_AGENT_CLI_SMOKE_RUNTIME ?? 'codex');

const RUNTIME_ADAPTERS = {
  codex: {
    authArgs: ['login', 'status'],
    command: 'codex',
    execArgs: (workspaceRoot) => [
      '--search',
      '--sandbox',
      'read-only',
      '--cd',
      workspaceRoot,
      'exec',
      '--json',
      '--skip-git-repo-check',
      '-',
    ],
    label: 'Codex CLI',
    readinessHint: 'Codex native web search requires a CLI build that accepts codex --search exec.',
  },
  claude: {
    authArgs: ['auth', 'status'],
    command: 'claude',
    execArgs: () => ['-p', '--permission-mode', 'plan', '--output-format', 'stream-json', '--verbose'],
    label: 'Claude Code',
    readinessHint: 'Claude native web/search requires a local account and enabled WebSearch/WebFetch tools.',
  },
};

export function runAgentCliNativeWebSearchSmoke() {
  console.log('Agent CLI native web/search smoke');
  console.log(`runtime=${RUNTIME ?? 'invalid'}`);
  console.log('mode=opt-in live');

  if (!ENABLED) {
    console.log('status=skip');
    console.log('skipReason=opt_in_required');
    console.log('set TASKPLANE_RUN_AGENT_CLI_NATIVE_WEB_SEARCH_SMOKE=true to run one native CLI web/search request');
    console.log('set TASKPLANE_AGENT_CLI_SMOKE_RUNTIME=codex or claude to choose the CLI');
    console.log('cli=not-called');
    console.log('network=not-called');
    console.log('workspace=unchanged');
    return 0;
  }

  if (!RUNTIME) {
    console.log('status=failed');
    console.log('cli=invalid');
    console.log('network=not-called');
    console.log('workspace=unchanged');
    console.log('error=TASKPLANE_AGENT_CLI_SMOKE_RUNTIME must be codex or claude');
    return 1;
  }

  const adapter = RUNTIME_ADAPTERS[RUNTIME];
  const versionResult = runCommand(adapter.command, ['--version']);

  if (versionResult.error) {
    console.log('status=failed');
    console.log('cli=missing');
    console.log('network=not-called');
    console.log('workspace=unchanged');
    console.log(`error=${versionResult.error.message}`);
    console.log(`note=${adapter.readinessHint}`);
    return 1;
  }

  console.log(`cli=${RUNTIME}`);
  console.log(`label=${adapter.label}`);
  console.log(`version=${firstLine(versionResult.output) || '<unknown>'}`);

  const loginResult = runCommand(adapter.command, adapter.authArgs);
  if (loginResult.status !== 0) {
    console.log('status=failed');
    console.log('auth=not-ready');
    console.log('network=not-called');
    console.log('workspace=unchanged');
    console.log(`loginStatus=${loginResult.status}`);
    console.log(`output=${preview(loginResult.output)}`);
    console.log(`note=${adapter.readinessHint}`);
    return 1;
  }

  console.log('auth=ready');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-agent-cli-native-web-search-smoke-'));
  const taskPath = path.join(tempRoot, 'TASK.md');

  try {
    fs.writeFileSync(taskPath, 'Native web/search smoke fixture. Do not modify files.\n', 'utf8');
    const beforeSnapshot = collectWorkspaceSnapshot(tempRoot);
    const prompt = [
      'You are validating Taskplane Agent CLI native web/search readiness.',
      'Use the selected CLI native web/search capability to check a current public fact from the web.',
      'Keep the answer brief and include one source URL if the runtime exposes it.',
      `When finished, include the exact phrase: ${EXPECTED_PHRASE}`,
      'Do not modify, create, delete, rename, or move any files.',
      RUNTIME === 'claude'
        ? 'You are running in Claude Code plan mode; do not ask to switch into editing mode.'
        : null,
    ].filter(Boolean).join('\n');
    const execResult = runCommand(adapter.command, adapter.execArgs(tempRoot), {
      cwd: tempRoot,
      input: prompt,
      timeout: 180_000,
    });
    const afterSnapshot = collectWorkspaceSnapshot(tempRoot);

    if (JSON.stringify(afterSnapshot) !== JSON.stringify(beforeSnapshot)) {
      console.log('status=failed');
      console.log('workspace=changed');
      return 1;
    }

    console.log('workspace=unchanged');

    if (execResult.status !== 0) {
      console.log('status=failed');
      console.log('network=not-confirmed');
      console.log(`execStatus=${execResult.status}`);
      console.log(`output=${preview(execResult.output)}`);
      console.log(`note=${adapter.readinessHint}`);
      return 1;
    }

    if (!execResult.output.includes(EXPECTED_PHRASE)) {
      console.log('status=failed');
      console.log('network=not-confirmed');
      console.log('phrase=missing');
      console.log(`output=${preview(execResult.output)}`);
      console.log(`note=${adapter.readinessHint}`);
      return 1;
    }

    console.log('phrase=matched');
    console.log('network=called');
    console.log('status=passed');
    return 0;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    cwd: options.cwd,
    input: options.input,
    maxBuffer: 256_000,
    timeout: options.timeout ?? 30_000,
  });

  return {
    error: result.error ?? null,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    status: result.status ?? 1,
  };
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

    if (entry.isDirectory()) {
      return collectFiles(entryPath);
    }

    return [entryPath];
  }).sort();
}

function firstLine(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
}

function preview(text) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const authFailure = normalized.match(/(?:401|authentication_failed|account\/organization|unauthorized)[^}]{0,240}/i);
  if (authFailure) return authFailure[0];
  return normalized.slice(0, 500) || '<empty>';
}

function normalizeRuntime(value) {
  const runtime = String(value).trim().toLowerCase();
  if (runtime === 'codex' || runtime === 'claude') return runtime;
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runAgentCliNativeWebSearchSmoke();
}
