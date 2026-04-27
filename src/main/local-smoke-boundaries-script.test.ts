import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const envKeys = [
  'TASKPLANE_AI_PROVIDER',
  'TASKPLANE_AI_MODEL',
  'TASKPLANE_AI_BASE_URL',
  'TASKPLANE_AI_API_KEY',
  'TASKPLANE_CODE_AGENT_CONTEXT_FILES',
  'TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER',
  'TASKPLANE_ENABLE_SANDBOX_CODING_AGENT',
  'TASKPLANE_ENV_FILE',
  'TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_LIVE',
  'TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_PREVIEW_SMOKE',
  'TASKPLANE_RUN_SANDBOX_PRODUCER_DOCKER_CHECKS',
  'TASKPLANE_RUN_SANDBOX_PRODUCER_PREVIEW_SMOKE',
  'TASKPLANE_WORKSPACE_ROOT',
];

function sanitizedEnv(envFilePath: string, overrides: NodeJS.ProcessEnv = {}) {
  const env = { ...process.env };

  for (const key of envKeys) {
    delete env[key];
  }

  return {
    ...env,
    TASKPLANE_ENV_FILE: envFilePath,
    ...overrides,
  };
}

function runScript(scriptPath: string, envContents = '') {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-local-smoke-boundary-test-'));
  const envFilePath = path.join(tempRoot, '.env');
  fs.writeFileSync(envFilePath, envContents);

  try {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: sanitizedEnv(envFilePath),
    });

    return {
      output: `${result.stdout}${result.stderr}`,
      status: result.status ?? 0,
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

describe('local smoke script default boundaries', () => {
  it('keeps sandbox producer preview smoke skipped without Docker or AI by default', () => {
    const result = runScript('scripts/sandbox-coding-producer-preview-smoke.mjs');

    expect(result.status).toBe(0);
    expect(result.output).toContain('Sandbox coding producer preview smoke: skipped');
    expect(result.output).toContain('docker=not-started');
    expect(result.output).toContain('ai=not-called');
    expect(result.output).not.toContain('checks-started');
  });

  it('keeps Code Agent model producer live smoke skipped without provider spend by default', () => {
    const result = runScript('scripts/code-agent-model-producer-live-smoke.mjs');

    expect(result.status).toBe(0);
    expect(result.output).toContain('Code Agent model producer live smoke');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('docker=not-started');
    expect(result.output).toContain('workspace=unchanged');
  });

  it('keeps Code Agent model producer preview smoke skipped without provider spend by default', () => {
    const result = runScript('scripts/code-agent-model-producer-preview-smoke.mjs');

    expect(result.status).toBe(0);
    expect(result.output).toContain('Code Agent model producer preview smoke');
    expect(result.output).toContain('status=skip');
    expect(result.output).toContain('provider=not-called');
    expect(result.output).toContain('docker=not-started');
    expect(result.output).toContain('workspace=unchanged');
  });
});
