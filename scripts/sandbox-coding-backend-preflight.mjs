#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function main() {
  const timeoutMs = 2_000;

  try {
    const result = await execFileAsync('docker', [
      'version',
      '--format',
      '{{.Server.Version}}',
    ], {
      timeout: timeoutMs,
      windowsHide: true,
    });
    const version = result.stdout.trim() || result.stderr.trim() || 'unknown';

    console.log([
      'Sandbox coding backend preflight: ready',
      'backend=local-container',
      'kind=local_container',
      'isolation=container',
      'network=disabled',
      'credentials=none',
      `dockerServer=${version}`,
    ].join(' / '));
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Docker probe failed.';
    console.log([
      'Sandbox coding backend preflight: blocked',
      'backend=local-container',
      'kind=local_container',
      'reason=' + detail.replace(/\s+/g, ' ').trim(),
    ].join(' / '));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
