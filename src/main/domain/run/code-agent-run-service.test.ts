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
    timeline: [],
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

  it('blocks model-backed runs before producer execution when selected context is invalid', async () => {
    process.env.TASKPLANE_ENABLE_CODE_AGENT_MODEL_PRODUCER = 'true';
    process.env.TASKPLANE_CODE_AGENT_CONTEXT_FILES = '../escape.md';
    aiConfigService.resolveRuntimeConfig.mockResolvedValue({
      apiKey: 'secret',
      featureFlags: {
        enableScheduler: false,
        enableSandboxCodingAgent: true,
      },
      model: 'google/gemini-2.5-flash',
      provider: 'fal-openrouter',
      workspaceRoot: '/tmp/taskplane-workspace',
    });
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

    expect(aiConfigService.resolveRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      output: 'descriptor=workspace.staged_patch / producer=model_backed_requested / providerCall=explicit_user_opt_in_required / checks=test / Orchestration request / lane=coding / source=code_agent_preview / profile=manual_sandbox_producer / runtime=local_sandbox / start=manual / providerCall=explicit_opt_in / queue=no / autoStart=no',
      title: 'operator-started code-agent run accepted',
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith({
      input: [
        'Provider-visible context manifest / items=1 / workspace_files=../escape.md / source_context=0 / artifacts=0',
        'providerPromptContent=no',
        'workspace_file:../escape.md:../escape.md',
      ].join('\n'),
      kind: 'plan',
      output: 'Provider-visible context manifest / items=1 / workspace_files=../escape.md / source_context=0 / artifacts=0',
      runId: 'run_code_agent_1',
      status: 'completed',
      title: 'Code Agent provider-visible context manifest',
    });
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
