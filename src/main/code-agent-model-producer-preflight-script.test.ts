import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const preflightEnvKeys = [
  'TASKPLANE_AI_PROVIDER',
  'TASKPLANE_AI_MODEL',
  'TASKPLANE_AI_BASE_URL',
  'TASKPLANE_AI_API_KEY',
  'TASKPLANE_CODE_AGENT_CONTEXT_FILES',
  'TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER',
  'TASKPLANE_ENABLE_SANDBOX_CODING_AGENT',
  'TASKPLANE_ENV_FILE',
  'TASKPLANE_WORKSPACE_ROOT',
];

function sanitizedEnv(envFilePath: string, overrides: NodeJS.ProcessEnv = {}) {
  const env = { ...process.env };

  for (const key of preflightEnvKeys) {
    delete env[key];
  }

  return {
    ...env,
    TASKPLANE_ENV_FILE: envFilePath,
    ...overrides,
  };
}

describe('code-agent-model-producer-preflight script', () => {
  it('lets shell environment override .env values without printing the API key', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-code-agent-preflight-test-'));
    const envFilePath = path.join(tempRoot, '.env');
    const workspaceRoot = path.join(tempRoot, 'workspace');
    const contextFile = 'package.json';

    fs.mkdirSync(workspaceRoot);
    fs.writeFileSync(path.join(workspaceRoot, contextFile), '{"name":"fixture"}\n');
    fs.writeFileSync(envFilePath, [
      'TASKPLANE_AI_PROVIDER=anthropic',
      'TASKPLANE_AI_MODEL=claude-env-file',
      'TASKPLANE_AI_API_KEY=env-file-code-agent-key-secret',
      'TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER=true',
      'TASKPLANE_ENABLE_SANDBOX_CODING_AGENT=true',
      'TASKPLANE_WORKSPACE_ROOT=/tmp/env-file-workspace-secret',
      'TASKPLANE_CODE_AGENT_CONTEXT_FILES=env-file-context-secret.md',
    ].join('\n'));

    try {
      const result = spawnSync(process.execPath, ['scripts/code-agent-model-producer-preflight.mjs'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: sanitizedEnv(envFilePath, {
          TASKPLANE_AI_PROVIDER: 'fal-openrouter',
          TASKPLANE_AI_MODEL: 'google/gemini-2.5-flash',
          TASKPLANE_AI_API_KEY: 'shell-code-agent-key-secret',
          TASKPLANE_CODE_AGENT_CONTEXT_FILES: contextFile,
          TASKPLANE_WORKSPACE_ROOT: workspaceRoot,
        }),
      });
      const output = `${result.stdout}${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain('Code Agent model producer preflight');
      expect(output).toContain('provider=fal-openrouter');
      expect(output).toContain('model=google/gemini-2.5-flash');
      expect(output).toContain('apiKey=<set>');
      expect(output).toContain('contextFiles=1');
      expect(output).toContain('status=ready');
      expect(output).toContain('No provider request, Docker probe, or workspace mutation was performed.');
      expect(output).not.toContain('env-file-code-agent-key-secret');
      expect(output).not.toContain('shell-code-agent-key-secret');
      expect(output).not.toContain('env-file-workspace-secret');
      expect(output).not.toContain('env-file-context-secret');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
