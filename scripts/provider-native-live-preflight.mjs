import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const supportedProviders = new Set([
  'anthropic',
  'openai',
  'openai-compatible',
  'fal-openrouter',
]);

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values = {};

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');

    if (equalsIndex < 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function envValue(values, key) {
  return (process.env[key] ?? values[key] ?? '').trim();
}

function envBoolean(values, key) {
  const value = envValue(values, key).toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true;
  }

  if (['0', 'false', 'no', 'off', ''].includes(value)) {
    return false;
  }

  return null;
}

const envPath = process.env.TASKPLANE_ENV_FILE
  ? path.resolve(process.env.TASKPLANE_ENV_FILE)
  : path.join(process.cwd(), '.env');
const values = parseEnvFile(envPath);
const provider = envValue(values, 'TASKPLANE_AI_PROVIDER');
const model = envValue(values, 'TASKPLANE_AI_MODEL');
const baseUrl = envValue(values, 'TASKPLANE_AI_BASE_URL');
const hasApiKey = Boolean(envValue(values, 'TASKPLANE_AI_API_KEY'));
const nativeFlag = envBoolean(values, 'TASKPLANE_ENABLE_PROVIDER_NATIVE_TOOL_CALLS');
const issues = [];

if (!provider) {
  issues.push('TASKPLANE_AI_PROVIDER is empty.');
}

if (!model) {
  issues.push('TASKPLANE_AI_MODEL is empty.');
}

if (!hasApiKey) {
  issues.push('TASKPLANE_AI_API_KEY is empty.');
}

if (nativeFlag !== true) {
  issues.push('TASKPLANE_ENABLE_PROVIDER_NATIVE_TOOL_CALLS must be true for live provider-native validation.');
}

if (provider === 'replicate') {
  issues.push('Replicate native text paths do not support Taskplane provider-native tool calls.');
}

if (provider === 'openai-compatible' && !baseUrl) {
  issues.push('TASKPLANE_AI_BASE_URL is required for openai-compatible provider-native validation.');
}

if (provider && provider !== 'replicate' && !supportedProviders.has(provider)) {
  issues.push(`Unsupported provider for provider-native validation: ${provider}.`);
}

console.log('Provider-native live preflight');
console.log(`envFile=${fs.existsSync(envPath) ? envPath : '<missing>'}`);
console.log(`provider=${provider || '<empty>'}`);
console.log(`model=${model || '<empty>'}`);
console.log(`baseUrl=${baseUrl ? '<set>' : '<empty>'}`);
console.log(`apiKey=${hasApiKey ? '<set>' : '<empty>'}`);
console.log(`providerNativeToolCalls=${nativeFlag === true ? 'true' : nativeFlag === false ? 'false' : 'invalid'}`);

if (issues.length) {
  console.log('status=skip');
  for (const issue of issues) {
    console.log(`- ${issue}`);
  }
  process.exit(0);
}

console.log('status=ready');
console.log('Live validation may call the configured provider and consume test credit.');
