#!/usr/bin/env node
import { generateText } from 'ai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { envValue, parseEnvFile } from './provider-native-live-preflight.mjs';
import { getProviderNativeLiveLanguageModel } from './provider-native-live-validate.mjs';

const ENABLED = process.env.TASKPLANE_RUN_AGENT_API_EXECUTION_PREFLIGHT_SMOKE === 'true';
const SUPPORTED_PROVIDERS = new Set([
  'anthropic',
  'openai',
  'openai-compatible',
  'fal-openrouter',
]);
const EXPECTED_PHRASE = 'TASKPLANE_AGENT_API_EXECUTION_PREFLIGHT_OK';
const EXECUTION_RUN_PROMOTION_REQUIREMENTS = [
  'selected_runtime_contract',
  'target_task_identity',
  'provider_visible_preflight',
  'runtime_context_manifest',
  'context_readiness_step',
  'task_memory_guidance',
  'run_goal_contract',
  'write_intent_extraction',
  'reviewed_patch_apply_boundary',
  'post_step_verification',
  'run_evidence_persistence',
];
const EXECUTION_RUN_REQUIRED_GATES = [
  'simplicity_check',
  'runtime_action',
  'runtime_context_assembly',
  'context_readiness',
  'task_memory_coverage',
  'task_memory_guidance',
  'pre_step',
  'subtask_start',
  'post_step',
];

export function getAgentApiExecutionPreflight() {
  const envPath = process.env.TASKPLANE_ENV_FILE
    ? path.resolve(process.env.TASKPLANE_ENV_FILE)
    : path.join(process.cwd(), '.env');
  const values = parseEnvFile(envPath);
  const provider = envValue(values, 'TASKPLANE_AI_PROVIDER');
  const model = envValue(values, 'TASKPLANE_AI_MODEL');
  const baseUrl = envValue(values, 'TASKPLANE_AI_BASE_URL');
  const apiKey = envValue(values, 'TASKPLANE_AI_API_KEY');
  const issues = [];

  if (!provider) {
    issues.push('TASKPLANE_AI_PROVIDER is empty.');
  }

  if (!model) {
    issues.push('TASKPLANE_AI_MODEL is empty.');
  }

  if (!apiKey) {
    issues.push('TASKPLANE_AI_API_KEY is empty.');
  }

  if (provider === 'replicate') {
    issues.push('Replicate native predictions are not part of this AI SDK Agent API text preflight.');
  }

  if (provider === 'openai-compatible' && !baseUrl) {
    issues.push('TASKPLANE_AI_BASE_URL is required for openai-compatible Agent API preflight.');
  }

  if (provider && provider !== 'replicate' && !SUPPORTED_PROVIDERS.has(provider)) {
    issues.push(`Unsupported provider for Agent API preflight: ${provider}.`);
  }

  return {
    apiKey,
    baseUrl,
    envPath,
    hasApiKey: Boolean(apiKey),
    issues,
    model,
    provider,
    ready: issues.length === 0,
  };
}

export function printAgentApiExecutionPreflight(preflight) {
  console.log('Agent API execution preflight smoke');
  console.log('mode=opt-in live');
  console.log(`envFile=${fs.existsSync(preflight.envPath) ? preflight.envPath : '<missing>'}`);
  console.log('runtime=agent_api');
  console.log(`provider=${preflight.provider || '<empty>'}`);
  console.log(`model=${preflight.model || '<empty>'}`);
  console.log(`baseUrl=${preflight.baseUrl ? '<set>' : '<empty>'}`);
  console.log(`apiKey=${preflight.hasApiKey ? '<set>' : '<empty>'}`);
  console.log('executionRun=deferred');
  console.log('promotionReady=no');
  console.log(`promotionRequirements=0/${EXECUTION_RUN_PROMOTION_REQUIREMENTS.length}`);
  console.log(`requiredGates=0/${EXECUTION_RUN_REQUIRED_GATES.length}`);
  console.log(`promotionMissingRequirements=${EXECUTION_RUN_PROMOTION_REQUIREMENTS.join(',')}`);
  console.log(`executionRunMissingRequirements=${EXECUTION_RUN_PROMOTION_REQUIREMENTS.join(',')}`);
  console.log(`executionRunMissingGates=${EXECUTION_RUN_REQUIRED_GATES.join(',')}`);
  console.log(`missingGates=${EXECUTION_RUN_REQUIRED_GATES.join(',')}`);
  console.log(`promotionRequirementList=${EXECUTION_RUN_PROMOTION_REQUIREMENTS.join(',')}`);
  console.log(`requiredGateList=${EXECUTION_RUN_REQUIRED_GATES.join(',')}`);
}

export async function runAgentApiExecutionPreflightSmoke() {
  const preflight = getAgentApiExecutionPreflight();
  printAgentApiExecutionPreflight(preflight);

  if (!ENABLED) {
    console.log('status=skip');
    console.log('skipReason=opt_in_required');
    console.log('provider=not-called');
    console.log('workspace=unchanged');
    console.log('set TASKPLANE_RUN_AGENT_API_EXECUTION_PREFLIGHT_SMOKE=true to send one provider request');
    return 0;
  }

  if (!preflight.ready) {
    console.log('status=skip');
    console.log('skipReason=config_missing');
    console.log('provider=not-called');
    console.log('workspace=unchanged');
    for (const issue of preflight.issues) {
      console.log(`- ${issue}`);
    }
    return 0;
  }

  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'taskplane-agent-api-preflight-workspace-'));

  try {
    fs.writeFileSync(
      path.join(workspaceRoot, 'TASK.md'),
      [
        '# Agent API execution preflight smoke',
        '',
        'This temporary workspace must remain unchanged.',
      ].join('\n'),
    );
    const before = snapshotWorkspace(workspaceRoot);
    const result = await generateText({
      model: getProviderNativeLiveLanguageModel({
        apiKey: preflight.apiKey,
        baseUrl: preflight.baseUrl,
        model: preflight.model,
        provider: preflight.provider,
      }),
      prompt: [
        `Reply exactly: ${EXPECTED_PHRASE}`,
        'Do not call tools.',
        'Do not write files.',
        'This is a provider-visible Agent API Runtime preflight, not a Taskplane execution_run.',
      ].join('\n'),
    });
    const after = snapshotWorkspace(workspaceRoot);
    const unchanged = before === after;
    const matched = (result.text ?? '').includes(EXPECTED_PHRASE);

    console.log(`finishReason=${result.finishReason ?? '<unknown>'}`);
    console.log(`textLength=${result.text?.length ?? 0}`);
    console.log(`phrase=${matched ? 'matched' : 'missing'}`);
    console.log('provider=called');
    console.log(`workspace=${unchanged ? 'unchanged' : 'changed'}`);

    if (!matched || !unchanged) {
      console.log('status=failed');
      return 1;
    }

    console.log('status=passed');
    return 0;
  } catch (error) {
    console.log('provider=called');
    console.log('workspace=unchanged');
    console.log('status=failed');
    console.log(`error=${formatError(error)}`);
    return 1;
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

function snapshotWorkspace(workspaceRoot) {
  return JSON.stringify(walk(workspaceRoot, workspaceRoot).sort((a, b) => a.path.localeCompare(b.path)));
}

function walk(root, current) {
  const entries = [];

  for (const dirent of fs.readdirSync(current, { withFileTypes: true })) {
    const fullPath = path.join(current, dirent.name);
    const relativePath = path.relative(root, fullPath);

    if (dirent.isDirectory()) {
      entries.push(...walk(root, fullPath));
      continue;
    }

    entries.push({
      contents: fs.readFileSync(fullPath, 'utf8'),
      path: relativePath,
    });
  }

  return entries;
}

function formatError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').slice(0, 500);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runAgentApiExecutionPreflightSmoke();
}
