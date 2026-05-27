#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { envBoolean, envValue, parseEnvFile } from './provider-native-live-preflight.mjs';

const ENABLED = process.env.TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_BACKGROUND_LIVE_PREFLIGHT === 'true';
const SUPPORTED_PROVIDERS = new Set([
  'anthropic',
  'openai',
  'openai-compatible',
  'fal-openrouter',
  'replicate',
]);
const REQUIRED_EVIDENCE = [
  'scheduler_job_connected',
  'standing_approval',
  'context_readiness',
  'task_memory_guidance',
  'subtask_start',
  'task_source_port',
  'code_agent_trigger_port',
  'timeline_evidence',
  'durable_run_limit_counting',
  'terminal_run_evidence',
  'post_step_gates',
];

export function getScheduledEventAgentBackgroundLivePreflight() {
  const envPath = process.env.TASKPLANE_ENV_FILE
    ? path.resolve(process.env.TASKPLANE_ENV_FILE)
    : path.join(process.cwd(), '.env');
  const values = parseEnvFile(envPath);
  const provider = envValue(values, 'TASKPLANE_AI_PROVIDER');
  const model = envValue(values, 'TASKPLANE_AI_MODEL');
  const baseUrl = envValue(values, 'TASKPLANE_AI_BASE_URL');
  const workspaceRoot = envValue(values, 'TASKPLANE_WORKSPACE_ROOT');
  const hasApiKey = Boolean(envValue(values, 'TASKPLANE_AI_API_KEY'));
  const schedulerFlag = envBoolean(values, 'TASKPLANE_ENABLE_SCHEDULER');
  const sandboxFlag = envBoolean(values, 'TASKPLANE_ENABLE_SANDBOX_CODING_AGENT');
  const modelProducerFlag = envBoolean(values, 'TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER');
  const issues = [];

  if (schedulerFlag !== true) {
    issues.push('TASKPLANE_ENABLE_SCHEDULER must be true for background scheduled/event Agent live preflight.');
  }

  if (sandboxFlag !== true) {
    issues.push('TASKPLANE_ENABLE_SANDBOX_CODING_AGENT must be true for Code Agent execution.');
  }

  if (modelProducerFlag !== true) {
    issues.push('TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER must be true for the selected Code Agent path.');
  }

  if (!provider) {
    issues.push('TASKPLANE_AI_PROVIDER is empty.');
  } else if (!SUPPORTED_PROVIDERS.has(provider)) {
    issues.push(`Unsupported provider for scheduled/event background live preflight: ${provider}.`);
  }

  if (!model) {
    issues.push('TASKPLANE_AI_MODEL is empty.');
  }

  if (!hasApiKey) {
    issues.push('TASKPLANE_AI_API_KEY is empty.');
  }

  if (provider === 'openai-compatible' && !baseUrl) {
    issues.push('TASKPLANE_AI_BASE_URL is required for openai-compatible scheduled/event background live preflight.');
  }

  if (provider === 'replicate' && model && !model.includes('/')) {
    issues.push('Replicate model must use owner/model format.');
  }

  if (!workspaceRoot) {
    issues.push('TASKPLANE_WORKSPACE_ROOT is empty; set it to the workspace used by the scheduled/event task.');
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
    requiredEvidence: REQUIRED_EVIDENCE,
    sandboxFlag,
    schedulerFlag,
    workspaceRoot,
  };
}

export function printScheduledEventAgentBackgroundLivePreflight(preflight) {
  console.log('Scheduled/event Agent background live preflight');
  console.log('mode=opt-in live preflight');
  console.log(`envFile=${fs.existsSync(preflight.envPath) ? preflight.envPath : '<missing>'}`);
  console.log('runtime=code_agent_model_producer');
  console.log('backgroundLiveRun=deferred');
  console.log(`provider=${preflight.provider || '<empty>'}`);
  console.log(`model=${preflight.model || '<empty>'}`);
  console.log(`baseUrl=${preflight.baseUrl ? '<set>' : '<empty>'}`);
  console.log(`apiKey=${preflight.hasApiKey ? '<set>' : '<empty>'}`);
  console.log(`workspaceRoot=${preflight.workspaceRoot || '<empty>'}`);
  console.log(`scheduler=${formatBoolean(preflight.schedulerFlag)}`);
  console.log(`sandboxCodingAgent=${formatBoolean(preflight.sandboxFlag)}`);
  console.log(`modelProducer=${formatBoolean(preflight.modelProducerFlag)}`);
  console.log(`requiredEvidence=${preflight.requiredEvidence.join(',')}`);
  console.log(`evidenceRequirements=0/${preflight.requiredEvidence.length}`);
  console.log(`missingEvidence=${preflight.requiredEvidence.join(',')}`);
}

export function runScheduledEventAgentBackgroundLivePreflight() {
  const preflight = getScheduledEventAgentBackgroundLivePreflight();
  printScheduledEventAgentBackgroundLivePreflight(preflight);

  if (!ENABLED) {
    console.log('status=skip');
    console.log('skipReason=opt_in_required');
    console.log('set TASKPLANE_RUN_SCHEDULED_EVENT_AGENT_BACKGROUND_LIVE_PREFLIGHT=true to validate live-run configuration gates');
    console.log('provider=not-called');
    console.log('docker=not-started');
    console.log('workspace=unchanged');
    return 0;
  }

  if (!preflight.ready) {
    console.log('status=skip');
    console.log('skipReason=config_missing');
    for (const issue of preflight.issues) {
      console.log(`- ${issue}`);
    }
    console.log('provider=not-called');
    console.log('docker=not-started');
    console.log('workspace=unchanged');
    return 0;
  }

  console.log('status=ready');
  console.log('backgroundLiveRun=ready_to_attempt');
  console.log('provider=not-called');
  console.log('docker=not-started');
  console.log('workspace=unchanged');
  return 0;
}

function formatBoolean(value) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'invalid';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runScheduledEventAgentBackgroundLivePreflight();
}
