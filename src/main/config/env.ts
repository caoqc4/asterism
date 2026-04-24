import fs from 'node:fs';
import path from 'node:path';

let loaded = false;

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const equalsIndex = trimmed.indexOf('=');

  if (equalsIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();

  if (!key) {
    return null;
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

export function loadTaskplaneEnv(): void {
  if (loaded) {
    return;
  }

  loaded = true;

  if (!process.env.TASKPLANE_ENV_FILE && process.env.VITEST) {
    return;
  }

  const envPath = process.env.TASKPLANE_ENV_FILE ?? path.join(process.cwd(), '.env');

  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, 'utf8');

  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);

    if (!parsed) {
      continue;
    }

    const [key, value] = parsed;

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function readEnvValue(key: string): string | null {
  loadTaskplaneEnv();
  const value = process.env[key]?.trim();
  return value ? value : null;
}

export function readEnvBoolean(key: string): boolean | null {
  const value = readEnvValue(key)?.toLowerCase();

  if (value === undefined || value === null) {
    return null;
  }

  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(value)) {
    return false;
  }

  return null;
}
