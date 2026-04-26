#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  getCodeAgentModelProducerPreflight,
  printCodeAgentModelProducerPreflight,
} from './code-agent-model-producer-preflight.mjs';

const ENABLED = process.env.TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_PREVIEW_SMOKE === 'true';

export async function runCodeAgentModelProducerPreviewSmoke() {
  const preflight = getCodeAgentModelProducerPreflight();
  printCodeAgentModelProducerPreflight(preflight);

  if (!ENABLED) {
    console.log('Code Agent model producer preview smoke');
    console.log('status=skip');
    console.log('set TASKPLANE_RUN_CODE_AGENT_MODEL_PRODUCER_PREVIEW_SMOKE=true to send one provider request through the sandbox preview service');
    console.log('provider=not-called');
    console.log('docker=not-started');
    console.log('workspace=unchanged');
    return 0;
  }

  if (!preflight.ready) {
    console.log('Code Agent model producer preview smoke');
    console.log('status=skip');
    console.log('provider=not-called');
    return 0;
  }

  const root = process.cwd();
  const distRunDir = path.join(root, 'dist-electron', 'main', 'domain', 'run');
  const modules = await importBuiltModules(distRunDir);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-model-producer-preview-'));
  const workspaceRoot = path.join(tempRoot, 'workspace');

  try {
    await fs.mkdir(path.join(workspaceRoot, 'docs'), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, 'docs', 'input.md'),
      [
        '# Preview smoke input',
        '',
        'Use this read-only context to create a tiny staged note.',
        '',
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      path.join(workspaceRoot, 'package.json'),
      JSON.stringify({
        private: true,
        scripts: {
          lint: 'node -e "console.log(\'lint preview smoke ok\')"',
          test: 'node -e "console.log(\'test preview smoke ok\')"',
        },
      }, null, 2),
      'utf8',
    );

    const workspaceContext = await modules.collectCodeAgentWorkspaceContext({
      files: ['docs/input.md'],
      workspaceRoot,
    });

    if (workspaceContext.status === 'blocked') {
      console.log('Code Agent model producer preview smoke');
      console.log('status=failed');
      console.log(workspaceContext.summary);
      console.log('provider=not-called');
      console.log('docker=not-started');
      console.log('workspace=unchanged');
      return 1;
    }

    const runtime = await modules.prepareCodeAgentModelProducerRuntime({
      aiConfigService: {
        resolveRuntimeConfig: async () => ({
          apiKey: preflight.apiKey,
          baseUrl: preflight.baseUrl || null,
          featureFlags: {
            enableSandboxCodingAgent: true,
            enableScheduler: false,
          },
          model: preflight.model,
          provider: preflight.provider,
          workspaceRoot,
        }),
      },
      allowProviderCalls: true,
      workspaceContext: workspaceContext.snapshot,
    });

    if (runtime.status === 'blocked') {
      console.log('Code Agent model producer preview smoke');
      console.log('status=failed');
      console.log(runtime.summary);
      console.log('provider=not-called');
      console.log('docker=not-started');
      console.log('workspace=unchanged');
      return 1;
    }

    const service = new modules.LocalContainerSandboxedCodingProducerPreviewService(
      new modules.SandboxedCodingProducerBackendPreflightService(buildMemoryPersister(modules)),
      new modules.SandboxedCodingInjectedProducerPreviewService(buildMemoryPersister(modules)),
      new modules.LocalContainerSandboxProvider(),
    );
    const request = buildRequest({
      provider: preflight.provider,
      workspaceRoot,
    });
    const result = await service.run({
      commandRunner: async () => ({
        exitCode: 0,
        stderr: '',
        stdout: 'model producer preview smoke check ok',
      }),
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      patchSummary: 'Model producer preview smoke staged patch',
      probe: {
        backendId: 'local-container',
        environmentPolicy: 'empty',
        isolation: 'container',
        kind: 'local_container',
        networkMode: 'disabled',
        status: 'available',
        supportsOutputLimits: true,
        supportsPatchArtifacts: true,
        supportsStagedWrites: true,
        supportsStructuredCommands: true,
        supportsTargetedCommands: true,
        supportsWorkspaceMount: true,
      },
      producerLoop: runtime.createLoop({
        workspaceContext: workspaceContext.snapshot,
      }),
      request,
    });

    const workspaceInput = await fs.readFile(path.join(workspaceRoot, 'docs', 'input.md'), 'utf8');
    if (!workspaceInput.includes('Preview smoke input')) {
      throw new Error('Model producer preview smoke mutated the workspace context file.');
    }

    console.log('Code Agent model producer preview smoke');
    console.log(`provider=${preflight.provider}`);
    console.log(`model=${preflight.model}`);
    console.log(`status=${result.status}`);
    console.log(`summary=${result.summary}`);
    if (result.status === 'previewed' && result.preview.preview.status === 'preview_ready') {
      console.log(`files=${result.preview.preview.source.patchDraft.files.join(',')}`);
    } else if (result.status === 'previewed') {
      console.log(`previewStatus=${result.preview.preview.status}`);
      if ('reason' in result.preview.preview) {
        console.log(`reason=${result.preview.preview.reason}`);
      }
    } else {
      console.log(`preflightStatus=${result.preflight.status}`);
    }
    console.log('provider=called');
    console.log('docker=not-started');
    console.log('workspace=unchanged');
    return result.status === 'previewed' && result.preview.preview.status === 'preview_ready' ? 0 : 1;
  } finally {
    await fs.rm(tempRoot, { force: true, recursive: true });
  }
}

async function importBuiltModules(distRunDir) {
  const modulePaths = {
    localBackend: path.join(distRunDir, 'local-container-sandbox-backend.js'),
    previewService: path.join(distRunDir, 'local-container-sandboxed-coding-producer-preview-service.js'),
    injectedPreviewService: path.join(distRunDir, 'sandboxed-coding-injected-producer-preview-service.js'),
    preflightService: path.join(distRunDir, 'sandboxed-coding-producer-backend-preflight-service.js'),
    persister: path.join(distRunDir, 'sandboxed-coding-producer-persister.js'),
    runtime: path.join(distRunDir, 'code-agent-model-producer-runtime.js'),
    workspaceContext: path.join(distRunDir, 'code-agent-workspace-context.js'),
  };

  await Promise.all(Object.values(modulePaths).map(assertBuiltModule));

  const [
    localBackend,
    previewService,
    injectedPreviewService,
    preflightService,
    persister,
    runtime,
    workspaceContext,
  ] = await Promise.all(Object.values(modulePaths).map((modulePath) =>
    import(pathToFileURL(modulePath).href)));

  return {
    ...localBackend,
    ...previewService,
    ...injectedPreviewService,
    ...preflightService,
    ...persister,
    ...runtime,
    ...workspaceContext,
  };
}

function buildRequest(params) {
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
      completionCriteria: ['Return a source-ready staged patch preview.'],
      instructions: [
        'Create or update .taskplane/code-agent-model-producer-preview-smoke.md.',
        'Keep the content short.',
        'Use the provided read-only workspace context as evidence only.',
      ].join(' '),
      taskTitle: 'Code Agent model producer preview smoke',
    },
    modelPolicy: {
      providerKind: params.provider,
      toolExposure: 'sandboxed_coding_producer',
    },
    runId: 'run_code_agent_model_producer_preview_smoke',
    sourceId: 'sandbox_source_code_agent_model_producer_preview_smoke',
    taskId: 'task_code_agent_model_producer_preview_smoke',
    workspaceRoot: params.workspaceRoot,
  };
}

function buildMemoryPersister(modules) {
  return new modules.SandboxedCodingProducerPreviewPersister(
    {
      create: async (input) => ({
        capabilities: input.capabilities,
        createdAt: new Date(0).toISOString(),
        id: 'agent_session_model_preview_smoke_1',
        metadata: input.metadata ?? null,
        mode: input.mode,
        runId: input.runId,
        status: 'running',
        updatedAt: new Date(0).toISOString(),
      }),
      updateStatus: async (id, status) => ({
        capabilities: {
          fileContext: true,
          longRunningSessions: true,
          streaming: false,
          structuredToolCalls: false,
          taskMutationTools: false,
          textOnlyPlanning: false,
        },
        createdAt: new Date(0).toISOString(),
        id,
        metadata: null,
        mode: 'agent',
        runId: 'run_code_agent_model_producer_preview_smoke',
        status,
        updatedAt: new Date(0).toISOString(),
      }),
    },
    {
      create: async (input) => ({
        createdAt: new Date(0).toISOString(),
        error: input.error ?? null,
        id: 'run_step_model_preview_smoke_1',
        index: 1,
        input: input.input ?? null,
        kind: input.kind,
        output: input.output ?? null,
        runId: input.runId,
        status: input.status ?? 'completed',
        title: input.title,
        updatedAt: new Date(0).toISOString(),
      }),
    },
  );
}

async function assertBuiltModule(modulePath) {
  try {
    await fs.access(modulePath);
  } catch {
    throw new Error('Run npm run build:main before the Code Agent model producer preview smoke.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await runCodeAgentModelProducerPreviewSmoke();
}
