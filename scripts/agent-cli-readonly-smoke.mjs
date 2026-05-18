#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ENABLED = process.env.TASKPLANE_RUN_AGENT_CLI_READONLY_SMOKE === 'true';
const EXPECTED_PHRASE = 'TASKPLANE_AGENT_CLI_READONLY_SMOKE_OK';

export function runAgentCliReadonlySmoke() {
  console.log('Agent CLI read-only smoke');

  if (!ENABLED) {
    console.log('status=skip');
    console.log('set TASKPLANE_RUN_AGENT_CLI_READONLY_SMOKE=true to run one Codex CLI read-only request');
    console.log('cli=not-called');
    console.log('workspace=unchanged');
    return 0;
  }

  const versionResult = runCommand('codex', ['--version']);

  if (versionResult.error) {
    console.log('status=failed');
    console.log('cli=missing');
    console.log('auth=unknown');
    console.log('workspace=unchanged');
    console.log(`error=${versionResult.error.message}`);
    return 1;
  }

  console.log('cli=codex');
  console.log(`version=${firstLine(versionResult.output) || '<unknown>'}`);

  const loginResult = runCommand('codex', ['login', 'status']);

  if (loginResult.status !== 0) {
    console.log('status=failed');
    console.log('auth=not-ready');
    console.log('workspace=unchanged');
    console.log(`loginStatus=${loginResult.status}`);
    console.log(`output=${preview(loginResult.output)}`);
    return 1;
  }

  console.log('auth=ready');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-agent-cli-readonly-smoke-'));
  const readmePath = path.join(tempRoot, 'README.md');
  const taskPath = path.join(tempRoot, 'TASK.md');

  try {
    fs.writeFileSync(readmePath, 'Taskplane Agent CLI read-only smoke fixture.\n', 'utf8');
    fs.writeFileSync(taskPath, 'Reply with the validation phrase and do not modify files.\n', 'utf8');

    const beforeSnapshot = collectWorkspaceSnapshot(tempRoot);
    const prompt = [
      'You are validating Taskplane Agent CLI read-only execution.',
      `Reply with the exact phrase: ${EXPECTED_PHRASE}`,
      'You may inspect README.md or TASK.md if helpful.',
      'Do not modify, create, delete, rename, or move any files.',
    ].join('\n');
    const execResult = runCommand('codex', [
      'exec',
      '--sandbox',
      'read-only',
      '--cd',
      tempRoot,
      '--skip-git-repo-check',
      '-',
    ], {
      input: prompt,
      timeout: 120_000,
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
      console.log(`execStatus=${execResult.status}`);
      console.log(`output=${preview(execResult.output)}`);
      return 1;
    }

    if (!execResult.output.includes(EXPECTED_PHRASE)) {
      console.log('status=failed');
      console.log('phrase=missing');
      console.log(`output=${preview(execResult.output)}`);
      return 1;
    }

    console.log('phrase=matched');
    console.log('status=passed');
    return 0;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    input: options.input,
    maxBuffer: 128_000,
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
  return text.replace(/\s+/g, ' ').trim().slice(0, 500) || '<empty>';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runAgentCliReadonlySmoke();
}
