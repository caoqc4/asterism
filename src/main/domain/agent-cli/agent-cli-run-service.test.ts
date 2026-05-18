import { describe, expect, it, vi } from 'vitest';

import type { AiConfigStatus } from '../../../shared/types/settings.js';
import type { RunRecord, RunStepRecord } from '../../../shared/types/run.js';
import type { TaskDetail } from '../../../shared/types/task.js';
import { AgentCliRunService } from './agent-cli-run-service.js';
import { AgentCliRuntimeWorkloadTracker } from './agent-cli-runtime-workload.js';

describe('AgentCliRunService', () => {
  it('runs Codex CLI through runtime gates and records run evidence', async () => {
    const runRepository = buildRunRepository();
    const runStepRepository = buildRunStepRepository();
    const taskService = buildTaskService();
    const executor = vi.fn().mockResolvedValue({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: 'Codex CLI final answer.',
      summary: 'Agent CLI execution completed.',
    });
    const service = new AgentCliRunService(
      taskService,
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      runRepository,
      runStepRepository,
      executor,
      { upsert: vi.fn() },
    );

    const result = await service.trigger({
      operatorConfirmed: true,
      prompt: 'Review the next implementation step.',
      taskId: 'task_1',
    });

    expect(runRepository.create).toHaveBeenCalledWith({
      instructions: 'Agent CLI (Codex CLI) read-only: Review the next implementation step.',
      taskId: 'task_1',
      type: 'agent',
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'plan',
      status: 'completed',
      title: 'agent cli run accepted',
      output: expect.stringContaining('Agent CLI run context assembly gate ready'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      args: ['exec', '--sandbox', 'read-only', '--cd', '/tmp/taskplane-workspace', '--skip-git-repo-check', '-'],
      command: 'codex',
      cwd: '/tmp/taskplane-workspace',
      input: expect.stringContaining('User request:\nReview the next implementation step.'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'model',
      status: 'completed',
      title: 'codex cli completed',
      output: 'Codex CLI final answer.',
    }));
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_agent_cli_1',
      'completed',
      'Codex CLI final answer.',
      'ai',
    );
    expect(taskService.annotateRunCompleted).toHaveBeenCalledWith('task_1', 'agent', true, 'run_agent_cli_1');
    expect(result).toMatchObject({
      id: 'run_agent_cli_1',
      status: 'completed',
    });
  });

  it('marks the CLI runtime running only while the executor is active', async () => {
    const workloadTracker = new AgentCliRuntimeWorkloadTracker();
    let resolveExecution!: (result: {
      exitCode: number;
      failureReason: null;
      status: 'completed';
      stderr: string;
      stdout: string;
      summary: string;
    }) => void;
    const executor = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveExecution = resolve;
    }));
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      buildRunRepository(),
      buildRunStepRepository(),
      executor,
      { upsert: vi.fn() },
      workloadTracker,
    );

    const triggerPromise = service.trigger({
      operatorConfirmed: true,
      prompt: 'Keep running long enough to observe workload.',
      taskId: 'task_1',
    });
    await vi.waitFor(() => {
      expect(workloadTracker.getActiveRunCount('codex')).toBe(1);
    });

    resolveExecution({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: 'Done.',
      summary: 'Agent CLI execution completed.',
    });
    await triggerPromise;

    expect(workloadTracker.getActiveRunCount('codex')).toBe(0);
  });

  it('records a failed run and clears workload when the executor throws', async () => {
    const runRepository = buildRunRepository();
    const runStepRepository = buildRunStepRepository();
    const taskService = buildTaskService();
    const workloadTracker = new AgentCliRuntimeWorkloadTracker();
    const service = new AgentCliRunService(
      taskService,
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      runRepository,
      runStepRepository,
      vi.fn().mockRejectedValue(new Error('spawn failed')),
      { upsert: vi.fn() },
      workloadTracker,
    );

    const result = await service.trigger({
      operatorConfirmed: true,
      prompt: 'Run Codex.',
      taskId: 'task_1',
    });

    expect(result).toMatchObject({
      failureReason: 'spawn failed',
      status: 'failed',
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      error: 'spawn failed',
      kind: 'model',
      status: 'failed',
      title: 'codex cli failed',
    }));
    expect(taskService.annotateRunFailed).toHaveBeenCalledWith('task_1', 'spawn failed', 'run_agent_cli_1');
    expect(workloadTracker.getActiveRunCount('codex')).toBe(0);
  });

  it('blocks execution before creating a run when Codex CLI is not detected', async () => {
    const runRepository = buildRunRepository();
    const service = new AgentCliRunService(
      buildTaskService(),
      {
        getStatus: vi.fn().mockResolvedValue(buildAiStatus({
          agentCliRuntimeStatus: {
            catalogueCount: 2,
            detectedCount: 0,
            errorCount: 0,
            manualRunCount: 0,
            readyCount: 0,
            runningCount: 0,
            updatedAt: null,
            runtimes: [],
          },
        })),
      },
      runRepository,
      buildRunStepRepository(),
      vi.fn(),
    );

    await expect(service.trigger({
      operatorConfirmed: true,
      prompt: 'Run Codex.',
      taskId: 'task_1',
    })).rejects.toThrow('Codex CLI is not detected on PATH or is not enabled for manual runs.');
    expect(runRepository.create).not.toHaveBeenCalled();
  });

  it('requires explicit operator confirmation', async () => {
    const runRepository = buildRunRepository();
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      runRepository,
      buildRunStepRepository(),
      vi.fn(),
    );

    await expect(service.trigger({
      operatorConfirmed: false,
      prompt: 'Run Codex.',
      taskId: 'task_1',
    })).rejects.toThrow('Agent CLI run requires explicit operator confirmation.');
    expect(runRepository.create).not.toHaveBeenCalled();
  });

  it('rejects workspace-write mode until a product confirmation path exists', async () => {
    const runRepository = buildRunRepository();
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      runRepository,
      buildRunStepRepository(),
      vi.fn(),
    );

    await expect(service.trigger({
      operatorConfirmed: true,
      prompt: 'Modify files.',
      sandboxMode: 'workspace-write',
      taskId: 'task_1',
    } as unknown as Parameters<AgentCliRunService['trigger']>[0])).rejects.toThrow('Agent CLI workspace-write mode is not enabled in this version.');
    expect(runRepository.create).not.toHaveBeenCalled();
  });
});

function buildAiStatus(partial: Partial<AiConfigStatus> = {}): AiConfigStatus {
  return {
    configured: false,
    apiKeyStored: false,
    apiKeySource: null,
    provider: 'fal-openrouter',
    model: 'google/gemini-2.5-flash',
    baseUrl: null,
    workspaceRoot: '/tmp/taskplane-workspace',
    updatedAt: '2026-05-19T00:00:00.000Z',
    configPath: '/tmp/config.json',
    featureFlags: {
      enableScheduler: false,
      enableProviderNativeToolCalls: true,
    },
    agentCliRuntimeStatus: {
      catalogueCount: 2,
      detectedCount: 1,
      errorCount: 0,
      manualRunCount: 1,
      readyCount: 0,
      runningCount: 0,
      updatedAt: '2026-05-19T00:00:00.000Z',
      runtimes: [{
        id: 'codex',
        label: 'Codex CLI',
        command: 'codex',
        installed: true,
        version: 'codex 0.42.0',
        authState: 'unknown',
        executionSupport: 'manual_run',
        workload: 'idle',
        missingReason: 'Authentication is managed by Codex CLI.',
      }],
    },
    ...partial,
  };
}

function buildTask(): TaskDetail {
  return {
    activeBlocker: null,
    activeWaitingItem: null,
    artifacts: [],
    availableProcessTemplates: [],
    childTaskIds: [],
    completionCriteria: [],
    createdAt: '2026-05-19T00:00:00.000Z',
    decisions: [],
    id: 'task_1',
    nextStep: 'Review implementation path.',
    parentTaskId: null,
    priorityScore: 0,
    processTemplates: [],
    resumeCard: {
      completionStatus: {
        open: 0,
        satisfied: 0,
        summary: 'No criteria.',
        total: 0,
      },
      currentBlocker: {
        blockerId: null,
        detail: null,
        title: 'None',
      },
      currentMethod: {
        detail: null,
        selectionReason: null,
        templateId: null,
        title: 'None',
      },
      currentState: 'planned',
      keySource: {
        capturedAt: null,
        credibility: null,
        isDuplicate: false,
        isKey: false,
        note: null,
        sourceId: null,
        title: 'None',
      },
      latestChange: {
        at: null,
        label: 'No change',
        type: null,
      },
      nextSuggestedMove: 'Review implementation path.',
      summary: 'Task resume summary.',
    },
    riskLevel: 'none',
    riskNote: null,
    sourceContexts: [],
    state: 'planned',
    summary: 'Task summary.',
    taskFiles: [{
      content: '# Task\n\nRecovery note.',
      createdAt: '2026-05-19T00:00:00.000Z',
      id: 'task_file_1',
      kind: 'note',
      name: 'Task.md',
      path: 'Task.md',
      taskId: 'task_1',
      updatedAt: '2026-05-19T00:00:00.000Z',
    }],
    timeline: [],
    title: 'Task 1',
    type: 'task',
    updatedAt: '2026-05-19T00:00:00.000Z',
  } as TaskDetail;
}

function buildTaskService() {
  return {
    annotateRunCompleted: vi.fn(),
    annotateRunFailed: vi.fn(),
    getDetail: vi.fn().mockResolvedValue(buildTask()),
  };
}

function buildRunRepository() {
  const running = buildRun({ status: 'running' });
  return {
    create: vi.fn().mockResolvedValue(running),
    updateResult: vi.fn().mockImplementation(async (
      id: string,
      status: RunRecord['status'],
      output: string | null,
      outputSource: RunRecord['outputSource'],
      failureReason: string | null = null,
    ) => buildRun({ failureReason, id, output, outputSource, status })),
  };
}

function buildRunStepRepository() {
  const steps: RunStepRecord[] = [];
  return {
    create: vi.fn().mockImplementation(async (input: Omit<RunStepRecord, 'createdAt' | 'id' | 'index' | 'updatedAt'>) => {
      const step = {
        ...input,
        createdAt: '2026-05-19T00:00:00.000Z',
        id: `run_step_${steps.length + 1}`,
        index: steps.length,
        updatedAt: '2026-05-19T00:00:00.000Z',
      };
      steps.push(step);
      return step;
    }),
    listForRun: vi.fn().mockImplementation(async () => steps),
    listForTask: vi.fn().mockImplementation(async () => []),
  };
}

function buildRun(partial: Partial<RunRecord> = {}): RunRecord {
  return {
    createdAt: '2026-05-19T00:00:00.000Z',
    failureReason: null,
    id: 'run_agent_cli_1',
    instructions: 'Agent CLI run.',
    output: null,
    outputSource: null,
    status: 'pending',
    taskId: 'task_1',
    type: 'agent',
    updatedAt: '2026-05-19T00:00:00.000Z',
    ...partial,
  };
}
