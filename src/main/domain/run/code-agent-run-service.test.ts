import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CodeAgentRunService } from './code-agent-run-service.js';

const readyCodeAgentWorkspaceChecks = {
  lint: {
    available: true,
    reason: 'package.json exposes npm run lint.',
  },
  test: {
    available: true,
    reason: 'package.json exposes npm run test.',
  },
};

function buildTask() {
  return {
    id: 'task_1',
    title: 'Prepare notes patch',
    summary: null,
    nextStep: null,
    state: 'planned',
    riskLevel: 'none',
    riskNote: null,
    waitingReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    artifacts: [],
    availableProcessTemplates: [],
    blockers: [],
    completionCriteria: [{ id: 'criteria_1', text: 'Patch is reviewable' }],
    dependencies: [],
    processTemplates: [],
    sourceContexts: [],
    taskFiles: [
      {
        id: 'task_file_1',
        taskId: 'task_1',
        name: 'Task.md',
        path: 'Task.md',
        kind: 'file',
        content: '# Task\n\nCurrent recovery context.',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    timeline: [],
  };
}

function buildSourceContext(overrides = {}) {
  return {
    archivedAt: null,
    content: 'Use the source note as implementation context.',
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'source_context_1',
    isKey: false,
    kind: 'note',
    note: 'Selected by operator.',
    status: 'active',
    taskId: 'task_1',
    title: 'Reference doc',
    updatedAt: '2026-01-01T00:00:00.000Z',
    uri: null,
    ...overrides,
  };
}

function buildArtifact(overrides = {}) {
  return {
    content: 'Prior generated output stays out of the prompt.',
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'artifact_1',
    kind: 'run_output',
    sourceId: 'run_prior',
    sourceType: 'run',
    taskId: 'task_1',
    title: 'Prior run output',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildAiStatus() {
  return {
    configured: true,
    apiKeyStored: true,
    apiKeySource: 'env',
    provider: 'fal-openrouter',
    model: 'google/gemini-2.5-flash',
    baseUrl: null,
    workspaceRoot: '/tmp/taskplane-workspace',
    codeAgentWorkspaceChecks: readyCodeAgentWorkspaceChecks,
    updatedAt: '2026-01-01T00:00:00.000Z',
    configPath: '/tmp/config.json',
    featureFlags: {
      enableScheduler: false,
      enableSandboxCodingAgent: true,
    },
  };
}

function buildRunningRun() {
  return {
    id: 'run_code_agent_1',
    taskId: 'task_1',
    type: 'agent',
    status: 'running',
    instructions: 'Code Agent manual sandbox producer preview.',
    output: null,
    outputSource: null,
    failureReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildFailedRun(output: string, failureReason = output) {
  return {
    ...buildRunningRun(),
    status: 'failed',
    output,
    outputSource: 'system',
    failureReason,
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
}

describe('CodeAgentRunService', () => {
  const taskService = {
    getDetail: vi.fn(),
  };
  const aiConfigService = {
    getStatus: vi.fn(),
    resolveRuntimeConfig: vi.fn(),
  };
  const runRepository = {
    create: vi.fn(),
    updateResult: vi.fn(),
  };
  const runStepRepository = {
    create: vi.fn(),
    listForRun: vi.fn().mockResolvedValue([
      {
        createdAt: '2026-01-01T00:00:00.000Z',
        error: null,
        id: 'run_step_1',
        index: 1,
        input: 'Prepare a staged notes patch.',
        kind: 'plan',
        output: 'operator-started code-agent run accepted',
        runId: 'run_code_agent_1',
        status: 'completed',
        title: 'operator-started code-agent run accepted',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]),
    update: vi.fn(),
  };
  const artifactRepository = {
    createPatchFromRun: vi.fn(),
  };
  const runCheckpointRepository = {
    create: vi.fn(),
    findById: vi.fn(),
    findOpenByDecisionId: vi.fn(),
    listForRun: vi.fn(),
    updatePayload: vi.fn(),
    updateStatus: vi.fn(),
  };
  const decisionRepository = {
    create: vi.fn(),
  };
  const sandboxPatchPromotionRepository = {
    createPending: vi.fn(),
  };
  const runVerificationRepository = {
    upsert: vi.fn(),
  };
  const executionService = {
    run: vi.fn(),
  };

  function createService() {
    return new CodeAgentRunService(
      taskService as never,
      aiConfigService as never,
      runRepository as never,
      runStepRepository as never,
      artifactRepository as never,
      runCheckpointRepository as never,
      decisionRepository as never,
      sandboxPatchPromotionRepository as never,
      () => executionService,
      runVerificationRepository as never,
    );
  }

  beforeEach(() => {
    delete process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER;
    delete process.env.TASKPLANE_CODE_AGENT_CONTEXT_FILES;
    vi.clearAllMocks();
    taskService.getDetail.mockResolvedValue(buildTask());
    aiConfigService.getStatus.mockResolvedValue(buildAiStatus());
    runRepository.create.mockResolvedValue(buildRunningRun());
  });

  it('keeps local diagnostic previews no-provider by default', async () => {
    process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER = 'true';
    const failedRun = buildFailedRun('Fake preview blocked', 'fake blocked');
    runRepository.updateResult.mockResolvedValue(failedRun);
    executionService.run.mockResolvedValue({
      reason: 'fake blocked',
      status: 'blocked',
      summary: 'Fake preview blocked',
    });

    const result = await createService().trigger({
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      taskId: 'task_1',
    });

    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(runStepRepository.create).toHaveBeenCalledWith({
      input: 'Prepare a staged notes patch.',
      kind: 'plan',
      output: 'descriptor=workspace.staged_patch / producer=local_diagnostic / providerCall=disabled / checks=test / Orchestration request / lane=coding / source=code_agent_preview / profile=manual_sandbox_producer / runtime=local_sandbox / start=manual / providerCall=no / queue=no / autoStart=no',
      runId: 'run_code_agent_1',
      status: 'completed',
      title: 'operator-started code-agent run accepted',
    });
    expect(executionService.run).toHaveBeenCalledWith(expect.objectContaining({
      operatorConfirmed: true,
      patchSummary: 'Prepare a staged notes patch.',
      producerLoop: expect.any(Function),
      producerSource: 'local_diagnostic',
      request: expect.objectContaining({
        commandPolicy: expect.objectContaining({
          allowedScripts: ['test'],
        }),
        runId: 'run_code_agent_1',
        sourceId: 'sandbox_source_run_code_agent_1',
        taskId: 'task_1',
      }),
    }));
    expect(runVerificationRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_code_agent_1',
      targetType: 'run',
      targetId: 'run_code_agent_1',
      source: 'lightweight_rule_engine',
    }));
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_code_agent_1',
      'failed',
      'Fake preview blocked',
      'system',
      'fake blocked',
    );
    expect(result).toBe(failedRun);
  });

  it('blocks model producer requests when the env capability is disabled', async () => {
    const failedRun = buildFailedRun(
      'Code Agent model producer runtime blocked: TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER is not enabled.',
      'TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER is not enabled.',
    );
    runRepository.updateResult.mockResolvedValue(failedRun);

    const result = await createService().trigger({
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      taskId: 'task_1',
      useModelProducer: true,
    });

    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      output: 'descriptor=workspace.staged_patch / producer=model_backed_requested / providerCall=explicit_user_opt_in_required / checks=test / Orchestration request / lane=coding / source=code_agent_preview / profile=manual_sandbox_producer / runtime=local_sandbox / start=manual / providerCall=explicit_opt_in / queue=no / autoStart=no',
      title: 'operator-started code-agent run accepted',
    }));
    expect(executionService.run).not.toHaveBeenCalled();
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_code_agent_1',
      'failed',
      'Code Agent model producer runtime blocked: TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER is not enabled.',
      'system',
      'TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER is not enabled.',
    );
    expect(result).toBe(failedRun);
  });

  it('blocks code-agent run start when the target task cannot start', async () => {
    taskService.getDetail.mockResolvedValue({
      ...buildTask(),
      activeBlocker: {
        id: 'blocker_1',
        taskId: 'task_1',
        title: '等待评审',
        kind: 'approval',
        detail: null,
        owner: null,
        responsibility: null,
        responsibilityLabel: null,
        sourceContextId: null,
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      },
    });

    await expect(createService().trigger({
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      taskId: 'task_1',
    })).rejects.toThrow('仍有阻塞、依赖或等待状态');
    expect(runRepository.create).not.toHaveBeenCalled();
    expect(runStepRepository.create).not.toHaveBeenCalled();
  });

  it('blocks model-backed runs before provider config resolution when selected context is invalid', async () => {
    process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER = 'true';
    process.env.TASKPLANE_CODE_AGENT_CONTEXT_FILES = '../escape.md';
    const failedRun = buildFailedRun(
      'Code Agent workspace context blocked: Code Agent workspace context path is not allowed: ../escape.md.',
      'Code Agent workspace context path is not allowed: ../escape.md.',
    );
    runRepository.updateResult.mockResolvedValue(failedRun);

    const result = await createService().trigger({
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      taskId: 'task_1',
      useModelProducer: true,
    });

    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      output: 'descriptor=workspace.staged_patch / producer=model_backed_requested / providerCall=explicit_user_opt_in_required / checks=test / Orchestration request / lane=coding / source=code_agent_preview / profile=manual_sandbox_producer / runtime=local_sandbox / start=manual / providerCall=explicit_opt_in / queue=no / autoStart=no',
      title: 'operator-started code-agent run accepted',
    }));
    expect(runStepRepository.create).not.toHaveBeenCalledWith(expect.objectContaining({
      title: 'Code Agent provider-visible context manifest',
    }));
    expect(executionService.run).not.toHaveBeenCalled();
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_code_agent_1',
      'failed',
      'Code Agent workspace context blocked: Code Agent workspace context path is not allowed: ../escape.md.',
      'system',
      'Code Agent workspace context path is not allowed: ../escape.md.',
    );
    expect(result).toBe(failedRun);
  });

  it('blocks model-backed runs when required task recovery context is missing', async () => {
    process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER = 'true';
    taskService.getDetail.mockResolvedValue({
      ...buildTask(),
      taskFiles: [],
    });
    const failedRun = buildFailedRun(
      'Code Agent model producer runtime blocked: Runtime context assembly missing required inputs: task_md.',
      'Runtime context assembly missing required inputs: task_md.',
    );
    runRepository.updateResult.mockResolvedValue(failedRun);

    const result = await createService().trigger({
      contextFiles: ['docs/notes.md'],
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      taskId: 'task_1',
      useModelProducer: true,
    });

    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(executionService.run).not.toHaveBeenCalled();
    expect(runStepRepository.create).not.toHaveBeenCalledWith(expect.objectContaining({
      title: 'Code Agent provider-visible context manifest',
    }));
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_code_agent_1',
      'failed',
      'Code Agent model producer runtime blocked: Runtime context assembly missing required inputs: task_md.',
      'system',
      'Runtime context assembly missing required inputs: task_md.',
    );
    expect(result).toBe(failedRun);
  });

  it('blocks model-backed source context selections that are not attached to the task', async () => {
    process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER = 'true';
    const failedRun = buildFailedRun(
      'Code Agent source context selection blocked: Code Agent source context selection was not found on this task: source_context_missing.',
      'Code Agent source context selection was not found on this task: source_context_missing.',
    );
    runRepository.updateResult.mockResolvedValue(failedRun);

    const result = await createService().trigger({
      contextFiles: ['docs/notes.md'],
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      sourceContextIds: ['source_context_missing'],
      taskId: 'task_1',
      useModelProducer: true,
    });

    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(executionService.run).not.toHaveBeenCalled();
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_code_agent_1',
      'failed',
      'Code Agent source context selection blocked: Code Agent source context selection was not found on this task: source_context_missing.',
      'system',
      'Code Agent source context selection was not found on this task: source_context_missing.',
    );
    expect(result).toBe(failedRun);
  });

  it('blocks duplicate model-backed source context selections before resolving AI config', async () => {
    process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER = 'true';
    taskService.getDetail.mockResolvedValue({
      ...buildTask(),
      sourceContexts: [buildSourceContext()],
    });
    const failedRun = buildFailedRun(
      'Code Agent source context selection blocked: Code Agent source context selection was duplicated: source_context_1.',
      'Code Agent source context selection was duplicated: source_context_1.',
    );
    runRepository.updateResult.mockResolvedValue(failedRun);

    const result = await createService().trigger({
      contextFiles: ['docs/notes.md'],
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      sourceContextIds: ['source_context_1', 'source_context_1'],
      taskId: 'task_1',
      useModelProducer: true,
    });

    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(executionService.run).not.toHaveBeenCalled();
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_code_agent_1',
      'failed',
      'Code Agent source context selection blocked: Code Agent source context selection was duplicated: source_context_1.',
      'system',
      'Code Agent source context selection was duplicated: source_context_1.',
    );
    expect(result).toBe(failedRun);
  });

  it('marks explicitly included source context content in the provider-visible manifest', async () => {
    process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER = 'true';
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'taskplane-code-agent-run-service-'));
    await fs.mkdir(path.join(workspaceRoot, 'docs'), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, 'docs/notes.md'), 'Use this workspace note.\n', 'utf8');
    taskService.getDetail.mockResolvedValue({
      ...buildTask(),
      artifacts: [buildArtifact()],
      sourceContexts: [buildSourceContext()],
    });
    aiConfigService.getStatus.mockResolvedValue({
      ...buildAiStatus(),
      workspaceRoot,
    });
    const failedRun = buildFailedRun(
      'Code Agent model producer runtime blocked: test runtime missing',
      'test runtime missing',
    );
    aiConfigService.resolveRuntimeConfig.mockRejectedValue(new Error('test runtime missing'));
    runRepository.updateResult.mockResolvedValue(failedRun);

    const result = await createService().trigger({
      artifactIds: ['artifact_1'],
      contextFiles: ['docs/notes.md'],
      includeSourceContextContent: true,
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      sourceContextIds: ['source_context_1'],
      taskId: 'task_1',
      useModelProducer: true,
    });

    expect(runStepRepository.create).toHaveBeenCalledWith({
      input: [
        'Provider-visible context manifest / items=3 / workspace_files=docs/notes.md / source_context=Reference doc / artifacts=1 / content=partial',
        'providerPromptContent=partial',
        'workspace_file:docs/notes.md:docs/notes.md:content=yes',
        'source_context:source_context_1:Reference doc:content=yes',
        'artifact:artifact_1:Prior run output:content=no:artifactKind=run_output:sourceType=run:sourceId=run_prior',
      ].join('\n'),
      kind: 'plan',
      output: 'Provider-visible context manifest / items=3 / workspace_files=docs/notes.md / source_context=Reference doc / artifacts=1 / content=partial',
      runId: 'run_code_agent_1',
      status: 'completed',
      title: 'Code Agent provider-visible context manifest',
    });
    expect(aiConfigService.resolveRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(executionService.run).not.toHaveBeenCalled();
    expect(result).toBe(failedRun);
  });

  it('blocks model-backed artifact selections that are not attached to the task', async () => {
    process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER = 'true';
    const failedRun = buildFailedRun(
      'Code Agent artifact selection blocked: Code Agent artifact selection was not found on this task: artifact_missing.',
      'Code Agent artifact selection was not found on this task: artifact_missing.',
    );
    runRepository.updateResult.mockResolvedValue(failedRun);

    const result = await createService().trigger({
      artifactIds: ['artifact_missing'],
      contextFiles: ['docs/notes.md'],
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      taskId: 'task_1',
      useModelProducer: true,
    });

    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(executionService.run).not.toHaveBeenCalled();
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_code_agent_1',
      'failed',
      'Code Agent artifact selection blocked: Code Agent artifact selection was not found on this task: artifact_missing.',
      'system',
      'Code Agent artifact selection was not found on this task: artifact_missing.',
    );
    expect(result).toBe(failedRun);
  });

  it('blocks duplicate model-backed artifact selections before resolving AI config', async () => {
    process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER = 'true';
    taskService.getDetail.mockResolvedValue({
      ...buildTask(),
      artifacts: [buildArtifact()],
    });
    const failedRun = buildFailedRun(
      'Code Agent artifact selection blocked: Code Agent artifact selection was duplicated: artifact_1.',
      'Code Agent artifact selection was duplicated: artifact_1.',
    );
    runRepository.updateResult.mockResolvedValue(failedRun);

    const result = await createService().trigger({
      artifactIds: ['artifact_1', 'artifact_1'],
      contextFiles: ['docs/notes.md'],
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      taskId: 'task_1',
      useModelProducer: true,
    });

    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(executionService.run).not.toHaveBeenCalled();
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_code_agent_1',
      'failed',
      'Code Agent artifact selection blocked: Code Agent artifact selection was duplicated: artifact_1.',
      'system',
      'Code Agent artifact selection was duplicated: artifact_1.',
    );
    expect(result).toBe(failedRun);
  });

  it('blocks artifact content inclusion before resolving AI config', async () => {
    process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER = 'true';
    taskService.getDetail.mockResolvedValue({
      ...buildTask(),
      artifacts: [buildArtifact()],
    });
    const failedRun = buildFailedRun(
      'Code Agent artifact content blocked: artifact content is not accepted as provider-visible context.',
      'Artifact content requires kind-specific policy, source-run status checks, stale-patch handling, and generated-output truth labeling before provider use.',
    );
    runRepository.updateResult.mockResolvedValue(failedRun);

    const result = await createService().trigger({
      artifactIds: ['artifact_1'],
      contextFiles: ['docs/notes.md'],
      includeArtifactContent: true,
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      taskId: 'task_1',
      useModelProducer: true,
    });

    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(executionService.run).not.toHaveBeenCalled();
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_code_agent_1',
      'failed',
      'Code Agent artifact content blocked: artifact content is not accepted as provider-visible context.',
      'system',
      'Artifact content requires kind-specific policy, source-run status checks, stale-patch handling, and generated-output truth labeling before provider use.',
    );
    expect(result).toBe(failedRun);
  });

  it('blocks oversized source context content before resolving AI config', async () => {
    process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER = 'true';
    taskService.getDetail.mockResolvedValue({
      ...buildTask(),
      sourceContexts: [
        buildSourceContext({
          content: 'x'.repeat(8_100),
        }),
      ],
    });
    const failedRun = buildFailedRun(
      'Code Agent source context content blocked: Code Agent source context content exceeds per-item size limit: source_context_1.',
      'Code Agent source context content exceeds per-item size limit: source_context_1.',
    );
    runRepository.updateResult.mockResolvedValue(failedRun);

    const result = await createService().trigger({
      contextFiles: ['docs/notes.md'],
      includeSourceContextContent: true,
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      sourceContextIds: ['source_context_1'],
      taskId: 'task_1',
      useModelProducer: true,
    });

    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(executionService.run).not.toHaveBeenCalled();
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_code_agent_1',
      'failed',
      'Code Agent source context content blocked: Code Agent source context content exceeds per-item size limit: source_context_1.',
      'system',
      'Code Agent source context content exceeds per-item size limit: source_context_1.',
    );
    expect(result).toBe(failedRun);
  });

  it('blocks source context content opt-in without a selected source context before resolving AI config', async () => {
    process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER = 'true';
    const failedRun = buildFailedRun(
      'Code Agent source context content blocked: Code Agent source context content requires at least one selected source context.',
      'Code Agent source context content requires at least one selected source context.',
    );
    runRepository.updateResult.mockResolvedValue(failedRun);

    const result = await createService().trigger({
      contextFiles: ['docs/notes.md'],
      includeSourceContextContent: true,
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      taskId: 'task_1',
      useModelProducer: true,
    });

    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(executionService.run).not.toHaveBeenCalled();
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_code_agent_1',
      'failed',
      'Code Agent source context content blocked: Code Agent source context content requires at least one selected source context.',
      'system',
      'Code Agent source context content requires at least one selected source context.',
    );
    expect(result).toBe(failedRun);
  });

  it('blocks model-backed runs without bounded context before resolving AI config', async () => {
    process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER = 'true';
    const failedRun = buildFailedRun(
      'Code Agent model producer runtime blocked: bounded workspace context files are required.',
      'Model-backed Code Agent preview requires at least one selected context file.',
    );
    runRepository.updateResult.mockResolvedValue(failedRun);

    const result = await createService().trigger({
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      taskId: 'task_1',
      useModelProducer: true,
    });

    expect(aiConfigService.resolveRuntimeConfig).not.toHaveBeenCalled();
    expect(executionService.run).not.toHaveBeenCalled();
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_code_agent_1',
      'failed',
      'Code Agent model producer runtime blocked: bounded workspace context files are required.',
      'system',
      'Model-backed Code Agent preview requires at least one selected context file.',
    );
    expect(result).toBe(failedRun);
  });
});
