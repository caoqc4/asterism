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

export function getCodeAgentModelProducerPreflight() {
  const envPath = process.env.TASKPLANE_ENV_FILE
    ? path.resolve(process.env.TASKPLANE_ENV_FILE)
    : path.join(process.cwd(), '.env');
  const values = parseEnvFile(envPath);
  const provider = envValue(values, 'TASKPLANE_AI_PROVIDER');
  const model = envValue(values, 'TASKPLANE_AI_MODEL');
  const baseUrl = envValue(values, 'TASKPLANE_AI_BASE_URL');
  const workspaceRoot = envValue(values, 'TASKPLANE_WORKSPACE_ROOT');
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

  return {
    baseUrl,
    envPath,
    hasApiKey,
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
  console.log(`sandboxCodingAgent=${formatBoolean(result.sandboxFlag)}`);
  console.log(`modelProducer=${formatBoolean(result.modelProducerFlag)}`);

  if (!result.ready) {
    console.log('status=skip');
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
