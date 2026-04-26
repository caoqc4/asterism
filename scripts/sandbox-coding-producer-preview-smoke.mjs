#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ENABLED = process.env.TASKPLANE_RUN_SANDBOX_PRODUCER_PREVIEW_SMOKE === 'true';

if (!ENABLED) {
  console.log([
    'Sandbox coding producer preview smoke: skipped',
    'set TASKPLANE_RUN_SANDBOX_PRODUCER_PREVIEW_SMOKE=true to run the non-live service wiring smoke',
    'docker=not-started',
    'ai=not-called',
  ].join(' / '));
  process.exit(0);
}

const root = process.cwd();
const distRunDir = path.join(root, 'dist-electron', 'main', 'domain', 'run');
const serviceModulePath = path.join(
  distRunDir,
  'local-container-sandboxed-coding-producer-preview-service.js',
);
const persisterModulePath = path.join(
  distRunDir,
  'sandboxed-coding-producer-persister.js',
);
const previewServiceModulePath = path.join(
  distRunDir,
  'sandboxed-coding-injected-producer-preview-service.js',
);
const preflightServiceModulePath = path.join(
  distRunDir,
  'sandboxed-coding-producer-backend-preflight-service.js',
);
const localBackendModulePath = path.join(
  distRunDir,
  'local-container-sandbox-backend.js',
);

await assertBuiltModule(serviceModulePath);

const [
  { LocalContainerSandboxedCodingProducerPreviewService },
  { SandboxedCodingProducerPreviewPersister },
  { SandboxedCodingInjectedProducerPreviewService },
  { SandboxedCodingProducerBackendPreflightService },
  { LocalContainerSandboxProvider },
] = await Promise.all([
  import(pathToFileUrl(serviceModulePath)),
  import(pathToFileUrl(persisterModulePath)),
  import(pathToFileUrl(previewServiceModulePath)),
  import(pathToFileUrl(preflightServiceModulePath)),
  import(pathToFileUrl(localBackendModulePath)),
]);

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-producer-preview-smoke-'));
const workspaceRoot = path.join(tempRoot, 'workspace');
await fs.mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
await fs.writeFile(path.join(workspaceRoot, 'src', 'notes.md'), 'old\n', 'utf8');

try {
  const persister = buildMemoryPersister();
  const service = new LocalContainerSandboxedCodingProducerPreviewService(
    new SandboxedCodingProducerBackendPreflightService(persister),
    new SandboxedCodingInjectedProducerPreviewService(persister),
    new LocalContainerSandboxProvider(),
  );

  const result = await service.run({
    commandRunner: async () => ({
      exitCode: 0,
      stderr: '',
      stdout: 'smoke check ok',
    }),
    featureFlags: {
      enableScheduler: false,
      enableSandboxCodingAgent: true,
    },
    patchSummary: 'Smoke update from local-container producer preview service',
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
    producerLoop: async ({ stagingRoot }) => {
      await fs.mkdir(path.join(stagingRoot, 'src'), { recursive: true });
      await fs.writeFile(path.join(stagingRoot, 'src', 'notes.md'), 'new\n', 'utf8');

      return {
        evidence: {
          modelSummary: 'Smoke loop wrote a staged notes file.',
          observations: ['Wrote src/notes.md in staging.'],
        },
        sessionSummary: 'producer preview smoke loop completed',
        status: 'completed',
        summary: 'Staged src/notes.md',
      };
    },
    request: buildRequest(workspaceRoot),
  });

  if (result.status !== 'previewed' || result.preview.preview.status !== 'preview_ready') {
    throw new Error(`Producer preview smoke failed: ${JSON.stringify(result)}`);
  }

  const workspaceContent = await fs.readFile(path.join(workspaceRoot, 'src', 'notes.md'), 'utf8');
  if (workspaceContent !== 'old\n') {
    throw new Error('Producer preview smoke mutated the workspace.');
  }

  console.log([
    'Sandbox coding producer preview smoke: ready',
    result.summary,
    'workspace=unchanged',
    'docker=not-started',
    'ai=not-called',
  ].join(' / '));
} finally {
  await fs.rm(tempRoot, { force: true, recursive: true });
}

async function assertBuiltModule(modulePath) {
  try {
    await fs.access(modulePath);
  } catch {
    throw new Error('Run npm run build:main before the producer preview smoke.');
  }
}

function buildRequest(workspaceRoot) {
  return {
    commandPolicy: {
      allowedScripts: ['test', 'lint'],
      outputLimitBytes: 64_000,
      timeoutMs: 120_000,
    },
    executionPolicy: {
      network: 'disabled',
      noCredentialPassthrough: true,
      promotion: 'decision_required',
    },
    intent: {
      completionCriteria: ['Patch is reviewable'],
      instructions: 'Prepare a staged notes patch.',
      taskTitle: 'Prepare notes patch',
    },
    modelPolicy: {
      providerKind: 'openai-compatible',
      toolExposure: 'sandboxed_coding_producer',
    },
    runId: 'run_smoke_1',
    sourceId: 'sandbox_source_smoke_1',
    taskId: 'task_smoke_1',
    workspaceRoot,
  };
}

function buildMemoryPersister() {
  return new SandboxedCodingProducerPreviewPersister(
    {
      create: async (input) => ({
        capabilities: input.capabilities,
        createdAt: new Date(0).toISOString(),
        id: 'agent_session_smoke_1',
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
        runId: 'run_smoke_1',
        status,
        updatedAt: new Date(0).toISOString(),
      }),
    },
    {
      create: async (input) => ({
        createdAt: new Date(0).toISOString(),
        error: input.error ?? null,
        id: 'run_step_smoke_1',
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

function pathToFileUrl(value) {
  return pathToFileURL(value).href;
}
