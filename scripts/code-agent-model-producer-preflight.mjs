#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { envBoolean, envValue, parseEnvFile } from './provider-native-live-preflight.mjs';

const supportedProviders = new Set([
  'anthropic',
  'openai',
  'openai-compatible',
  'fal-openrouter',
  'replicate',
]);
const forbiddenContextSegments = new Set(['.git', 'node_modules']);
const forbiddenContextBasenames = new Set(['.env', '.env.local', '.npmrc', '.netrc']);
const MAX_CONTEXT_FILES = 6;
const MAX_CONTEXT_FILE_BYTES = 12_000;
const MAX_CONTEXT_TOTAL_BYTES = 30_000;

export function getCodeAgentModelProducerPreflight() {
  const envPath = process.env.TASKPLANE_ENV_FILE
    ? path.resolve(process.env.TASKPLANE_ENV_FILE)
    : path.join(process.cwd(), '.env');
  const values = parseEnvFile(envPath);
  const provider = envValue(values, 'TASKPLANE_AI_PROVIDER');
  const model = envValue(values, 'TASKPLANE_AI_MODEL');
  const baseUrl = envValue(values, 'TASKPLANE_AI_BASE_URL');
  const workspaceRoot = envValue(values, 'TASKPLANE_WORKSPACE_ROOT');
  const contextFiles = envValue(values, 'TASKPLANE_CODE_AGENT_CONTEXT_FILES')
    .split(',')
    .map((file) => file.trim())
    .filter(Boolean);
  const hasApiKey = Boolean(envValue(values, 'TASKPLANE_AI_API_KEY'));
  const sandboxFlag = envBoolean(values, 'TASKPLANE_ENABLE_SANDBOX_CODING_AGENT');
  const modelProducerFlag = envBoolean(values, 'TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER');
  const issues = [];

  if (modelProducerFlag !== true) {
    issues.push('TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER must be true for model producer validation.');
  }

  if (sandboxFlag !== true) {
    issues.push('TASKPLANE_ENABLE_SANDBOX_CODING_AGENT must be true for Code Agent sandbox execution.');
  }

  if (!provider) {
    issues.push('TASKPLANE_AI_PROVIDER is empty.');
  } else if (!supportedProviders.has(provider)) {
    issues.push(`Unsupported provider for Code Agent model producer validation: ${provider}.`);
  }

  if (!model) {
    issues.push('TASKPLANE_AI_MODEL is empty.');
  }

  if (!hasApiKey) {
    issues.push('TASKPLANE_AI_API_KEY is empty.');
  }

  if (provider === 'openai-compatible' && !baseUrl) {
    issues.push('TASKPLANE_AI_BASE_URL is required for openai-compatible model producer validation.');
  }

  if (provider === 'replicate' && model && !model.includes('/')) {
    issues.push('Replicate model must use owner/model format.');
  }

  if (!workspaceRoot) {
    issues.push('TASKPLANE_WORKSPACE_ROOT is empty; set it to the repository/workspace to inspect.');
  }

  const contextValidation = validateContextFiles({
    contextFiles,
    workspaceRoot,
  });
  issues.push(...contextValidation.issues);

  return {
    apiKey: envValue(values, 'TASKPLANE_AI_API_KEY'),
    baseUrl,
    envPath,
    hasApiKey,
    contextFiles,
    contextFileBytes: contextValidation.totalBytes,
    issues,
    model,
    modelProducerFlag,
    provider,
    ready: issues.length === 0,
    sandboxFlag,
    workspaceRoot,
  };
}

export function printCodeAgentModelProducerPreflight(result) {
  console.log('Code Agent model producer preflight');
  console.log(`envFile=${fs.existsSync(result.envPath) ? result.envPath : '<missing>'}`);
  console.log(`provider=${result.provider || '<empty>'}`);
  console.log(`model=${result.model || '<empty>'}`);
  console.log(`baseUrl=${result.baseUrl ? '<set>' : '<empty>'}`);
  console.log(`apiKey=${result.hasApiKey ? '<set>' : '<empty>'}`);
  console.log(`workspaceRoot=${result.workspaceRoot || '<empty>'}`);
  console.log(`contextFiles=${result.contextFiles.length}`);
  console.log(`contextBytes=${result.contextFileBytes}`);
  console.log(`sandboxCodingAgent=${formatBoolean(result.sandboxFlag)}`);
  console.log(`modelProducer=${formatBoolean(result.modelProducerFlag)}`);

  if (!result.ready) {
    console.log('status=skip');
    console.log('skipReason=config_missing');
    for (const issue of result.issues) {
      console.log(`- ${issue}`);
    }
    console.log('No provider request, Docker probe, or workspace mutation was performed.');
    return;
  }

  console.log('status=ready');
  console.log('No provider request, Docker probe, or workspace mutation was performed.');
  console.log('A later explicit model-producer smoke may call the configured provider and consume test credit.');
}

function validateContextFiles(params) {
  const issues = [];
  let totalBytes = 0;

  if (!params.contextFiles.length) {
    return { issues, totalBytes };
  }

  if (params.contextFiles.length > MAX_CONTEXT_FILES) {
    issues.push(`TASKPLANE_CODE_AGENT_CONTEXT_FILES can include at most ${MAX_CONTEXT_FILES} files.`);
  }

  if (!params.workspaceRoot) {
    return { issues, totalBytes };
  }

  const workspaceRoot = path.resolve(params.workspaceRoot);
  for (const rawFile of params.contextFiles.slice(0, MAX_CONTEXT_FILES)) {
    const file = normalizeContextPath(rawFile);

    if (!isAllowedContextPath(file)) {
      issues.push(`Context file path is not allowed: ${rawFile}.`);
      continue;
    }

    const target = path.resolve(workspaceRoot, file);
    if (!isInsidePath(target, workspaceRoot)) {
      issues.push(`Context file path escaped workspace root: ${rawFile}.`);
      continue;
    }

    if (!fs.existsSync(target)) {
      issues.push(`Context file does not exist: ${file}.`);
      continue;
    }

    const stat = fs.statSync(target);
    if (!stat.isFile()) {
      issues.push(`Context path is not a file: ${file}.`);
      continue;
    }

    if (stat.size > MAX_CONTEXT_FILE_BYTES) {
      issues.push(`Context file exceeds per-file size limit: ${file}.`);
      continue;
    }

    const content = fs.readFileSync(target);
    if (content.includes(0)) {
      issues.push(`Context file must be text: ${file}.`);
      continue;
    }

    totalBytes += content.byteLength;
  }

  if (totalBytes > MAX_CONTEXT_TOTAL_BYTES) {
    issues.push('Selected context files exceed total size limit.');
  }

  return { issues, totalBytes };
}

function normalizeContextPath(file) {
  return path.posix.normalize(file.replaceAll('\\', '/').trim());
}

function isAllowedContextPath(file) {
  if (!file
    || path.posix.isAbsolute(file)
    || path.win32.isAbsolute(file)
    || file === '.'
    || file === '..'
    || file.startsWith('../')
    || file.includes('/../')
    || file.endsWith('/..')) {
    return false;
  }

  const segments = file.split('/');
  if (segments.some((segment) => !segment || forbiddenContextSegments.has(segment))) {
    return false;
  }

  const basename = segments.at(-1) ?? '';
  return !forbiddenContextBasenames.has(basename);
}

function isInsidePath(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function formatBoolean(value) {
  if (value === true) {
    return 'true';
  }

  if (value === false) {
    return 'false';
  }

  return 'invalid';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  printCodeAgentModelProducerPreflight(getCodeAgentModelProducerPreflight());
}
