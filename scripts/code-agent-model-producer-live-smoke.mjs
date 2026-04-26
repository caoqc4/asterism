#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  getCodeAgentModelProducerPreflight,
  printCodeAgentModelProducerPreflight,
} from './code-agent-model-producer-preflight.mjs';

const ENABLED = process.env.TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_LIVE === 'true';

export async function runCodeAgentModelProducerLiveSmoke() {
  const preflight = getCodeAgentModelProducerPreflight();
  printCodeAgentModelProducerPreflight(preflight);

  if (!ENABLED) {
    console.log('Code Agent model producer live smoke');
    console.log('status=skip');
    console.log('set TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_LIVE=true to send one provider request');
    console.log('provider=not-called');
    console.log('docker=not-started');
    console.log('workspace=unchanged');
    return 0;
  }

  if (!preflight.ready) {
    console.log('Code Agent model producer live smoke');
    console.log('status=skip');
    console.log('provider=not-called');
    return 0;
  }

  const root = process.cwd();
  const distMainDir = path.join(root, 'dist-electron', 'main');
  const textGenerationModulePath = path.join(distMainDir, 'executors', 'text-generation.js');
  const producerLoopModulePath = path.join(distMainDir, 'domain', 'run', 'code-agent-model-producer-loop.js');
  const stagedFilePlanModulePath = path.join(distMainDir, 'domain', 'run', 'code-agent-staged-file-plan.js');
  const workspaceContextModulePath = path.join(distMainDir, 'domain', 'run', 'code-agent-workspace-context.js');

  await Promise.all([
    assertBuiltModule(textGenerationModulePath),
    assertBuiltModule(producerLoopModulePath),
    assertBuiltModule(stagedFilePlanModulePath),
    assertBuiltModule(workspaceContextModulePath),
  ]);

  const [
    { generateRuntimeText },
    { buildCodeAgentModelProducerPrompt },
    { parseCodeAgentStagedFilePlanPayload },
    { collectCodeAgentWorkspaceContext },
  ] = await Promise.all([
    import(pathToFileURL(textGenerationModulePath).href),
    import(pathToFileURL(producerLoopModulePath).href),
    import(pathToFileURL(stagedFilePlanModulePath).href),
    import(pathToFileURL(workspaceContextModulePath).href),
  ]);
  const request = buildRequest(preflight);
  const workspaceContext = await collectCodeAgentWorkspaceContext({
    files: preflight.contextFiles,
    workspaceRoot: preflight.workspaceRoot,
  });

  if (workspaceContext.status === 'blocked') {
    console.log('Code Agent model producer live smoke');
    console.log('status=failed');
    console.log(workspaceContext.summary);
    console.log('provider=not-called');
    console.log('docker=not-started');
    console.log('workspace=unchanged');
    return 1;
  }

  const text = await generateRuntimeText({
    apiKey: preflight.apiKey,
    baseUrl: preflight.baseUrl || null,
    featureFlags: {
      enableSandboxCodingAgent: true,
      enableScheduler: false,
    },
    model: preflight.model,
    provider: preflight.provider,
    workspaceRoot: preflight.workspaceRoot,
  }, buildCodeAgentModelProducerPrompt(request, {
    workspaceContext: workspaceContext.snapshot,
  }));
  const normalized = parseCodeAgentStagedFilePlanPayload(text);

  console.log('Code Agent model producer live smoke');
  console.log(`provider=${preflight.provider}`);
  console.log(`model=${preflight.model}`);
  console.log(`textLength=${text.length}`);
  console.log(`contextFiles=${workspaceContext.snapshot.files.length}`);

  if (normalized.status === 'blocked') {
    console.log('status=failed');
    console.log(normalized.summary);
    return 1;
  }

  console.log(`files=${normalized.plan.files.map((file) => file.path).join(',')}`);
  console.log(`summary=${normalized.plan.summary}`);
  console.log('status=passed');
  console.log('provider=called');
  console.log('docker=not-started');
  console.log('workspace=unchanged');
  return 0;
}

function buildRequest(preflight) {
  return {
    commandPolicy: {
      allowedScripts: ['test'],
      outputLimitBytes: 64_000,
      timeoutMs: 120_000,
    },
    executionPolicy: {
      network: 'disabled',
      noCredentialPassthrough: true,
      promotion: 'decision_required',
    },
    intent: {
      completionCriteria: ['Return a reviewable staged text-file plan.'],
      instructions: [
        'Create a tiny staged documentation note for live smoke validation.',
        'Use path .taskplane/code-agent-model-producer-live-smoke.md.',
        'Keep the content short and do not mention secrets.',
      ].join(' '),
      taskTitle: 'Code Agent model producer live smoke',
    },
    modelPolicy: {
      providerKind: preflight.provider,
      toolExposure: 'sandboxed_coding_producer',
    },
    runId: 'run_code_agent_model_producer_live_smoke',
    sourceId: 'sandbox_source_code_agent_model_producer_live_smoke',
    taskId: 'task_code_agent_model_producer_live_smoke',
    workspaceRoot: preflight.workspaceRoot,
  };
}

async function assertBuiltModule(modulePath) {
  try {
    await fs.access(modulePath);
  } catch {
    throw new Error('Run npm run build:main before the Code Agent model producer live smoke.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runCodeAgentModelProducerLiveSmoke();
}
