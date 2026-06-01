import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const secretEnvKeys = [
  'APPLE_API_ISSUER',
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_ID',
  'APPLE_TEAM_ID',
  'CSC_KEY_PASSWORD',
  'CSC_LINK',
  'CSC_NAME',
  'TASKPLANE_ENV_FILE',
];

function sanitizedEnv(envFilePath: string, overrides: NodeJS.ProcessEnv = {}) {
  const env = { ...process.env };

  for (const key of secretEnvKeys) {
    delete env[key];
  }

  return {
    ...env,
    TASKPLANE_ENV_FILE: envFilePath,
    ...overrides,
  };
}

function runPreflight(envContents: string, args: string[] = [], envOverrides: NodeJS.ProcessEnv = {}) {
  const envFilePath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-release-preflight-test-')),
    '.env',
  );

  fs.writeFileSync(envFilePath, envContents);

  try {
    const result = spawnSync(
      process.execPath,
      ['scripts/release-mac-preflight.mjs', ...args],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: sanitizedEnv(envFilePath, envOverrides),
      },
    );

    return {
      output: `${result.stdout}${result.stderr}`,
      status: result.status ?? 0,
    };
  } finally {
    fs.rmSync(path.dirname(envFilePath), { recursive: true, force: true });
  }
}

describe('release-mac-preflight script', () => {
  it('accepts App Store Connect API key notarization vars without printing secret values', () => {
    const result = runPreflight([
      'CSC_NAME=Developer ID Application: Test Team (TEAMID1234)',
      'APPLE_API_KEY=/tmp/AuthKey_TEST_SECRET.p8',
      'APPLE_API_KEY_ID=KEYIDSECRET',
      'APPLE_API_ISSUER=issuer-secret-value',
    ].join('\n'));

    expect(result.status).toBe(0);
    expect(result.output).toContain(
      '[OK] notarization credential source: App Store Connect API key env vars are set.',
    );
    expect(result.output).toContain('[OK] APPLE_API_KEY (App Store Connect API key path): <set>');
    expect(result.output).toContain('[OK] APPLE_API_KEY_ID (App Store Connect API key path): <set>');
    expect(result.output).toContain('[OK] APPLE_API_ISSUER (App Store Connect API key path): <set>');
    expect(result.output).not.toContain('AuthKey_TEST_SECRET');
    expect(result.output).not.toContain('KEYIDSECRET');
    expect(result.output).not.toContain('issuer-secret-value');
  });

  it('accepts Apple ID notarization vars without printing secret values', () => {
    const result = runPreflight([
      'CSC_NAME=Developer ID Application: Test Team (TEAMID1234)',
      'APPLE_ID=test-secret@example.com',
      'APPLE_APP_SPECIFIC_PASSWORD=app-password-secret',
      'APPLE_TEAM_ID=TEAMIDSECRET',
    ].join('\n'));

    expect(result.status).toBe(0);
    expect(result.output).toContain(
      '[OK] notarization credential source: Apple ID app-specific password env vars are set.',
    );
    expect(result.output).toContain('[OK] APPLE_ID (Apple ID path): <set>');
    expect(result.output).toContain('[OK] APPLE_APP_SPECIFIC_PASSWORD (Apple ID path): <set>');
    expect(result.output).toContain('[OK] APPLE_TEAM_ID (Apple ID path): <set>');
    expect(result.output).not.toContain('test-secret@example.com');
    expect(result.output).not.toContain('app-password-secret');
    expect(result.output).not.toContain('TEAMIDSECRET');
  });

  it('fails strict mode locally when required release inputs are absent', () => {
    const result = runPreflight('', ['--strict']);

    expect(result.status).toBe(1);
    expect(result.output).toContain('status=not-ready');
    expect(result.output).toContain('No signing, notarization, upload, or Apple network request was performed.');
  });

  it('requires CSC_KEY_PASSWORD when CSC_LINK is used', () => {
    const result = runPreflight([
      'CSC_LINK=/tmp/cert-secret.p12',
      'APPLE_ID=test-secret@example.com',
      'APPLE_APP_SPECIFIC_PASSWORD=app-password-secret',
      'APPLE_TEAM_ID=TEAMIDSECRET',
    ].join('\n'), ['--strict']);

    expect(result.status).toBe(1);
    expect(result.output).toContain('[OK] electron-builder signing certificate source: CSC_LINK is set.');
    expect(result.output).toContain('[MISSING] CSC_KEY_PASSWORD for CSC_LINK: <empty>');
    expect(result.output).toContain('status=not-ready');
    expect(result.output).not.toContain('cert-secret.p12');
    expect(result.output).not.toContain('app-password-secret');
  });

  it('redacts CSC_LINK and CSC_KEY_PASSWORD values when certificate-link signing is configured', () => {
    const result = runPreflight([
      'CSC_LINK=/tmp/cert-secret.p12',
      'CSC_KEY_PASSWORD=certificate-password-secret',
      'APPLE_ID=test-secret@example.com',
      'APPLE_APP_SPECIFIC_PASSWORD=app-password-secret',
      'APPLE_TEAM_ID=TEAMIDSECRET',
    ].join('\n'));

    expect(result.status).toBe(0);
    expect(result.output).toContain('[OK] electron-builder signing certificate source: CSC_LINK is set.');
    expect(result.output).toContain('[OK] CSC_KEY_PASSWORD for CSC_LINK: <set>');
    expect(result.output).not.toContain('cert-secret.p12');
    expect(result.output).not.toContain('certificate-password-secret');
    expect(result.output).not.toContain('test-secret@example.com');
    expect(result.output).not.toContain('app-password-secret');
  });

  it('lets shell environment override .env values without printing either secret', () => {
    const result = runPreflight([
      'CSC_LINK=/tmp/env-file-cert-secret.p12',
      'CSC_KEY_PASSWORD=env-file-password-secret',
      'APPLE_ID=env-file-secret@example.com',
      'APPLE_APP_SPECIFIC_PASSWORD=env-file-app-password-secret',
      'APPLE_TEAM_ID=ENVFILETEAM',
    ].join('\n'), [], {
      CSC_LINK: '/tmp/shell-cert-secret.p12',
      CSC_KEY_PASSWORD: 'shell-certificate-password-secret',
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain('[OK] electron-builder signing certificate source: CSC_LINK is set.');
    expect(result.output).toContain('[OK] CSC_KEY_PASSWORD for CSC_LINK: <set>');
    expect(result.output).not.toContain('env-file-cert-secret');
    expect(result.output).not.toContain('env-file-password-secret');
    expect(result.output).not.toContain('shell-cert-secret');
    expect(result.output).not.toContain('shell-certificate-password-secret');
  });
});
