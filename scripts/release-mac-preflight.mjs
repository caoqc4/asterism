import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { envValue, parseEnvFile } from './provider-native-live-preflight.mjs';

const strict = process.argv.includes('--strict');
const root = process.cwd();
const envPath = process.env.TASKPLANE_ENV_FILE
  ? path.resolve(process.env.TASKPLANE_ENV_FILE)
  : path.join(root, '.env');
const envValues = parseEnvFile(envPath);
const checks = [];

function addCheck({ detail, name, ok, required = true }) {
  checks.push({ detail, name, ok, required });
}

function run(command, args) {
  try {
    return {
      ok: true,
      output: execFileSync(command, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim(),
    };
  }
}

function redactedEnv(key) {
  return envValue(envValues, key) ? '<set>' : '<empty>';
}

function findDeveloperIdIdentity() {
  if (process.platform !== 'darwin') {
    return {
      found: false,
      message: 'macOS keychain is only available on darwin.',
    };
  }

  const result = run('security', ['find-identity', '-v', '-p', 'codesigning']);

  if (!result.ok) {
    return {
      found: false,
      message: result.output || 'security find-identity failed.',
    };
  }

  const identity = result.output
    .split(/\r?\n/)
    .find((line) => line.includes('Developer ID Application:'));

  return {
    found: Boolean(identity),
    message: identity?.trim() || 'No Developer ID Application identity found in the current keychain.',
  };
}

function checkNotarytool() {
  if (process.platform !== 'darwin') {
    return {
      found: false,
      message: 'notarytool is only required for macOS notarization.',
    };
  }

  const result = run('xcrun', ['--find', 'notarytool']);

  return {
    found: result.ok && Boolean(result.output),
    message: result.output || 'xcrun could not find notarytool.',
  };
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const build = packageJson.build ?? {};
const mac = build.mac ?? {};
const developerId = findDeveloperIdIdentity();
const notarytool = checkNotarytool();
const cscName = envValue(envValues, 'CSC_NAME');
const cscLink = envValue(envValues, 'CSC_LINK');

addCheck({
  detail: process.platform,
  name: 'macOS host',
  ok: process.platform === 'darwin',
});
addCheck({
  detail: developerId.message,
  name: 'Developer ID Application identity',
  ok: developerId.found,
});
addCheck({
  detail: cscName
    ? 'CSC_NAME is set.'
    : cscLink
      ? 'CSC_LINK is set.'
      : developerId.found
        ? 'Using keychain Developer ID identity.'
        : 'Set CSC_NAME or CSC_LINK, or install a Developer ID Application certificate.',
  name: 'electron-builder signing certificate source',
  ok: Boolean(cscName || cscLink || developerId.found),
});
addCheck({
  detail: notarytool.message,
  name: 'notarytool available',
  ok: notarytool.found,
});
addCheck({
  detail: redactedEnv('APPLE_ID'),
  name: 'APPLE_ID',
  ok: Boolean(envValue(envValues, 'APPLE_ID')),
});
addCheck({
  detail: redactedEnv('APPLE_APP_SPECIFIC_PASSWORD'),
  name: 'APPLE_APP_SPECIFIC_PASSWORD',
  ok: Boolean(envValue(envValues, 'APPLE_APP_SPECIFIC_PASSWORD')),
});
addCheck({
  detail: redactedEnv('APPLE_TEAM_ID'),
  name: 'APPLE_TEAM_ID',
  ok: Boolean(envValue(envValues, 'APPLE_TEAM_ID')),
});
addCheck({
  detail: build.appId || '<missing>',
  name: 'build.appId',
  ok: Boolean(build.appId),
});
addCheck({
  detail: packageJson.productName || build.productName || '<missing>',
  name: 'productName',
  ok: Boolean(packageJson.productName || build.productName),
});
addCheck({
  detail: Array.isArray(mac.target) ? mac.target.join(', ') : '<missing>',
  name: 'mac targets',
  ok: Array.isArray(mac.target) && mac.target.includes('dmg') && mac.target.includes('zip'),
});

const missingRequired = checks.filter((check) => check.required && !check.ok);

console.log('macOS signing/notarization preflight (read-only)');
console.log(`envFile=${fs.existsSync(envPath) ? envPath : '<missing>'}`);

for (const check of checks) {
  const status = check.ok ? 'OK' : check.required ? 'MISSING' : 'SKIP';
  console.log(`[${status}] ${check.name}: ${check.detail}`);
}

if (missingRequired.length > 0) {
  console.log('status=not-ready');
  console.log('No signing, notarization, upload, or Apple network request was performed.');

  if (strict) {
    process.exit(1);
  }
} else {
  console.log('status=ready');
  console.log('Ready to attempt a dedicated signed/notarized release pass.');
}
