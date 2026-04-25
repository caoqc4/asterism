import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const supportedProviders = new Set([
  'anthropic',
  'openai',
  'openai-compatible',
  'fal-openrouter',
]);

export function parseEnvFile(filePath) {
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

export function envValue(values, key) {
  return (process.env[key] ?? values[key] ?? '').trim();
}

export function envBoolean(values, key) {
  const value = envValue(values, key).toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true;
  }

  if (['0', 'false', 'no', 'off', ''].includes(value)) {
    return false;
  }

  return null;
}

export function getProviderNativeLivePreflight() {
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

  return {
    apiKey: envValue(values, 'TASKPLANE_AI_API_KEY'),
    baseUrl,
    envPath,
    hasApiKey,
    issues,
    model,
    nativeFlag,
    provider,
    ready: issues.length === 0,
  };
}

export function printProviderNativeLivePreflight(result) {
  console.log('Provider-native live preflight');
  console.log(`envFile=${fs.existsSync(result.envPath) ? result.envPath : '<missing>'}`);
  console.log(`provider=${result.provider || '<empty>'}`);
  console.log(`model=${result.model || '<empty>'}`);
  console.log(`baseUrl=${result.baseUrl ? '<set>' : '<empty>'}`);
  console.log(`apiKey=${result.hasApiKey ? '<set>' : '<empty>'}`);
  console.log(`providerNativeToolCalls=${result.nativeFlag === true ? 'true' : result.nativeFlag === false ? 'false' : 'invalid'}`);

  if (!result.ready) {
    console.log('status=skip');
    for (const issue of result.issues) {
      console.log(`- ${issue}`);
    }
    return;
  }

  console.log('status=ready');
  console.log('Live validation may call the configured provider and consume test credit.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  printProviderNativeLivePreflight(getProviderNativeLivePreflight());
}
