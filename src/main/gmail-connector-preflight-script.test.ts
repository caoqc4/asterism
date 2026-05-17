import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const preflightEnvKeys = [
  'TASKPLANE_ENV_FILE',
  'TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCESS_TOKEN',
  'TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCOUNT',
  'TASKPLANE_EXTERNAL_ACCESS_GMAIL_QUERY',
  'TASKPLANE_EXTERNAL_ACCESS_GMAIL_MAX_RESULTS',
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

describe('gmail connector preflight script', () => {
  it('reports ready without printing the access token or calling Gmail', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-gmail-preflight-test-'));
    const envFilePath = path.join(tempRoot, '.env');
    fs.writeFileSync(envFilePath, [
      'TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCESS_TOKEN=env-file-gmail-token-secret',
      'TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCOUNT=env-file@example.com',
      'TASKPLANE_EXTERNAL_ACCESS_GMAIL_QUERY=newer_than:30d',
      'TASKPLANE_EXTERNAL_ACCESS_GMAIL_MAX_RESULTS=25',
    ].join('\n'));

    try {
      const result = spawnSync(process.execPath, ['scripts/gmail-connector-preflight.mjs'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: sanitizedEnv(envFilePath, {
          TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCESS_TOKEN: 'shell-gmail-token-secret',
          TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCOUNT: 'shell@example.com',
          TASKPLANE_EXTERNAL_ACCESS_GMAIL_QUERY: 'newer_than:1d',
          TASKPLANE_EXTERNAL_ACCESS_GMAIL_MAX_RESULTS: '3',
        }),
      });
      const output = `${result.stdout}${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain('Gmail connector preflight');
      expect(output).toContain('accessToken=<set>');
      expect(output).toContain('account=shell@example.com');
      expect(output).toContain('query=newer_than:1d');
      expect(output).toContain('maxResults=3');
      expect(output).toContain('status=ready');
      expect(output).toContain('No Gmail request or task memory write was performed.');
      expect(output).not.toContain('env-file-gmail-token-secret');
      expect(output).not.toContain('shell-gmail-token-secret');
      expect(output).not.toContain('env-file@example.com');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('skips when Gmail token is missing or max results are unsafe', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-gmail-preflight-test-'));
    const envFilePath = path.join(tempRoot, '.env');
    fs.writeFileSync(envFilePath, 'TASKPLANE_EXTERNAL_ACCESS_GMAIL_MAX_RESULTS=100\n');

    try {
      const result = spawnSync(process.execPath, ['scripts/gmail-connector-preflight.mjs'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: sanitizedEnv(envFilePath),
      });
      const output = `${result.stdout}${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain('status=skip');
      expect(output).toContain('TASKPLANE_EXTERNAL_ACCESS_GMAIL_ACCESS_TOKEN is empty.');
      expect(output).toContain('TASKPLANE_EXTERNAL_ACCESS_GMAIL_MAX_RESULTS must be between 1 and 25.');
      expect(output).toContain('No Gmail request or task memory write was performed.');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
