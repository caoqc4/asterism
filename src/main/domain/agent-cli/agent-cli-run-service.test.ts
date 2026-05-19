import { describe, expect, it, vi } from 'vitest';

import type { AiConfigStatus } from '../../../shared/types/settings.js';
import type { RunRecord, RunStepRecord } from '../../../shared/types/run.js';
import type { TaskDetail } from '../../../shared/types/task.js';
import {
  AgentCliRunService,
  executeAgentCliCommand,
  type AgentCliExecutor,
} from './agent-cli-run-service.js';
import { AgentCliRuntimeWorkloadTracker } from './agent-cli-runtime-workload.js';

describe('AgentCliRunService', () => {
  const workspaceRoot = process.cwd();

  it('runs Codex CLI through runtime gates and records run evidence', async () => {
    const runRepository = buildRunRepository();
    const runStepRepository = buildRunStepRepository();
    const taskService = buildTaskService();
    const runVerificationRepository = { upsert: vi.fn() };
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
      runVerificationRepository,
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
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'plan',
      status: 'completed',
      title: 'Agent CLI 目标契约',
      input: expect.stringContaining('"runtimeLabel": "Codex CLI"'),
      output: expect.stringContaining('taskGoal=active'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Agent CLI 目标契约',
      output: expect.stringContaining('objective=Review implementation path.'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      args: ['exec', '--sandbox', 'read-only', '--cd', workspaceRoot, '--skip-git-repo-check', '-'],
      command: 'codex',
      cwd: workspaceRoot,
      input: expect.stringContaining('Taskplane run contract:'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('User request:\nReview the next implementation step.'),
    }));
    expect(result).toMatchObject({
      id: 'run_agent_cli_1',
      status: 'running',
    });
    await vi.waitFor(() => {
      expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'model',
        status: 'completed',
        title: 'codex cli completed',
        output: 'Codex CLI final answer.',
      }));
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'plan',
      status: 'completed',
      title: '任务记忆建议',
      input: expect.stringContaining('"decision":"accept_for_review"'),
      output: expect.stringContaining('Verifier decision: accept_for_review'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      title: '任务记忆建议',
      input: expect.stringContaining('"targets":["task_record"]'),
      output: expect.stringContaining('Next action: review_memory_proposal'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      title: '任务记忆建议',
      input: expect.stringContaining('- Runtime mode: Codex CLI / read-only.'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      title: '任务记忆建议',
      input: expect.stringContaining('- Run objective: Review implementation path.'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      title: '任务记忆建议',
      input: expect.stringContaining('- Completion conditions checked: 1'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'final',
      status: 'completed',
      title: '验收子 Agent 检查',
      input: expect.stringContaining('taskplane.verifier.lightweight'),
      output: expect.stringContaining('Task Goal status: active'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      title: '验收子 Agent 检查',
      input: expect.stringContaining('"decision": "accept_for_review"'),
      output: expect.stringContaining('Can mark task complete: no'),
    }));
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_agent_cli_1',
      'completed',
      'Codex CLI final answer.',
      'ai',
    );
    expect(taskService.annotateRunCompleted).toHaveBeenCalledWith('task_1', 'agent', true, 'run_agent_cli_1');
    expect(runVerificationRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_agent_cli_1',
      targetType: 'step',
      tone: 'pass',
      label: '执行后检查通过',
    }));
    expect(runVerificationRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_agent_cli_1',
      targetType: 'run',
      targetId: 'run_agent_cli_1',
      tone: 'warn',
      label: 'Run 任务记忆待处理',
    }));
  });

  it('notifies the app when an async Agent CLI run reaches a terminal state', async () => {
    const onTerminalRun = vi.fn();
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      buildRunRepository(),
      buildRunStepRepository(),
      vi.fn().mockResolvedValue({
        exitCode: 0,
        failureReason: null,
        status: 'completed',
        stderr: '',
        stdout: 'Done.',
        summary: 'Agent CLI execution completed.',
      }),
      { upsert: vi.fn() },
      new AgentCliRuntimeWorkloadTracker(),
      onTerminalRun,
    );

    const result = await service.trigger({
      operatorConfirmed: true,
      prompt: 'Run Codex.',
      taskId: 'task_1',
    });

    expect(result.status).toBe('running');
    await vi.waitFor(() => {
      expect(onTerminalRun).toHaveBeenCalledWith(expect.objectContaining({
        id: 'run_agent_cli_1',
        status: 'completed',
      }));
    });
  });

  it('records explicit runtime-native goal requests as skipped audit runs without executing CLI', async () => {
    const runRepository = buildRunRepository();
    const runStepRepository = buildRunStepRepository();
    const executor = vi.fn();
    const onTerminalRun = vi.fn();
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      runRepository,
      runStepRepository,
      executor,
      null,
      new AgentCliRuntimeWorkloadTracker(),
      onTerminalRun,
    );

    const result = await service.recordNativeGoalRequest({
      forwarded: false,
      objective: '跑完验收',
      operatorConfirmed: true,
      reason: 'Adapter native goal capability is disabled.',
      runtimeId: 'codex',
      runtimeLabel: 'Codex CLI',
      supportsNativeGoalMode: false,
      taskId: 'task_1',
    });

    expect(executor).not.toHaveBeenCalled();
    expect(runRepository.create).toHaveBeenCalledWith({
      instructions: 'Runtime native goal request (Codex CLI): 跑完验收',
      taskId: 'task_1',
      type: 'agent',
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'plan',
      status: 'skipped',
      title: 'Runtime Native Goal 请求审计',
      input: expect.stringContaining('"forwarded": false'),
      output: expect.stringContaining('Taskplane kept this as audit evidence'),
    }));
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_agent_cli_1',
      'completed',
      expect.stringContaining('Runtime-native goal request recorded without forwarding'),
      'system',
    );
    expect(onTerminalRun).toHaveBeenCalledWith(expect.objectContaining({
      id: 'run_agent_cli_1',
      status: 'completed',
    }));
    expect(result.outputSource).toBe('system');
  });

  it('does not project a paused Task Goal into the next Agent CLI run contract', async () => {
    const taskService = buildTaskService();
    vi.mocked(taskService.getDetail).mockResolvedValue({
      ...buildTask(),
      nextStep: 'Durable goal that is currently paused.',
      timeline: [{
        id: 'event_goal_paused',
        taskId: 'task_1',
        type: 'panel.task_goal_paused',
        payload: JSON.stringify({
          objective: 'Durable goal that is currently paused.',
          source: '/goal pause',
        }),
        createdAt: '2026-05-20T00:00:00.000Z',
      }],
    });
    const executor = vi.fn().mockResolvedValue({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: 'One-off inspection complete.',
      summary: 'Agent CLI execution completed.',
    });
    const service = new AgentCliRunService(
      taskService,
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      buildRunRepository(),
      buildRunStepRepository(),
      executor,
    );

    await service.trigger({
      operatorConfirmed: true,
      prompt: 'Run a one-off inspection.',
      taskId: 'task_1',
    });

    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('- Objective: Run a one-off inspection.'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.not.stringContaining('- Objective: Durable goal that is currently paused.'),
    }));
  });

  it('does not create a task memory proposal when verifier says evidence is missing', async () => {
    const runStepRepository = buildRunStepRepository();
    const executor = vi.fn().mockResolvedValue({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: '',
      summary: 'Agent CLI execution completed without output.',
    });
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      buildRunRepository(),
      runStepRepository,
      executor,
    );

    await service.trigger({
      operatorConfirmed: true,
      prompt: 'Run without output.',
      taskId: 'task_1',
    });

    await vi.waitFor(() => {
      expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        title: '验收子 Agent 检查',
        input: expect.stringContaining('"decision": "needs_evidence"'),
        output: expect.stringContaining('Should propose task memory: no'),
      }));
    });
    expect(runStepRepository.create).not.toHaveBeenCalledWith(expect.objectContaining({
      title: '任务记忆建议',
    }));
  });

  it('uses the resolved executable path when the runtime status provides one', async () => {
    const executor = vi.fn().mockResolvedValue({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: 'Done.',
      summary: 'Agent CLI execution completed.',
    });
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus({
        agentCliRuntimeStatus: {
          ...buildAiStatus().agentCliRuntimeStatus!,
          runtimes: buildAiStatus().agentCliRuntimeStatus!.runtimes.map((runtime) => (
            runtime.id === 'codex'
              ? { ...runtime, executablePath: '/opt/homebrew/bin/codex' }
              : runtime
          )),
        },
      })) },
      buildRunRepository(),
      buildRunStepRepository(),
      executor,
      { upsert: vi.fn() },
    );

    await service.trigger({
      operatorConfirmed: true,
      prompt: 'Run Codex.',
      taskId: 'task_1',
    });

    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      command: '/opt/homebrew/bin/codex',
    }));
  });

  it('bridges confirmed sources and optional capability boundaries into the CLI prompt', async () => {
    const executor = vi.fn().mockResolvedValue({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: 'Done.',
      summary: 'Agent CLI execution completed.',
    });
    const task = {
      ...buildTask(),
      sourceContexts: [
        {
          archivedAt: null,
          capturedAt: '2026-05-19T00:00:00.000Z',
          content: 'Confirmed Gmail source says the launch note needs legal review.',
          containsSensitiveData: false,
          createdAt: '2026-05-19T00:00:00.000Z',
          credibility: 'verified',
          id: 'source_external_access_1',
          isDuplicate: false,
          isKey: true,
          kind: 'note',
          note: 'Confirmed External Access source',
          runId: null,
          sourceRole: 'digest',
          status: 'active',
          taskId: 'task_1',
          title: 'Gmail launch digest',
          updatedAt: '2026-05-19T00:00:00.000Z',
          uri: 'gmail://message/1',
        },
        {
          archivedAt: null,
          capturedAt: '2026-05-19T00:00:00.000Z',
          content: 'token=secret',
          containsSensitiveData: true,
          createdAt: '2026-05-19T00:00:00.000Z',
          credibility: 'verified',
          id: 'source_sensitive_1',
          isDuplicate: false,
          isKey: true,
          kind: 'note',
          note: 'Sensitive source',
          runId: null,
          sourceRole: 'digest',
          status: 'active',
          taskId: 'task_1',
          title: 'Sensitive digest',
          updatedAt: '2026-05-19T00:00:00.000Z',
          uri: null,
        },
      ],
    } satisfies TaskDetail;
    const service = new AgentCliRunService(
      {
        ...buildTaskService(),
        getDetail: vi.fn().mockResolvedValue(task),
      },
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus({
        capabilityRegistry: [
          {
            access: 'read_only',
            configured: true,
            family: 'external_access',
            id: 'external_access.connectors',
            label: 'External Access',
            missingReason: null,
            requiredGate: 'runtime_entrypoint_coverage',
            requiresApproval: true,
            status: 'available',
            summary: 'connected=1 / pending=0 / errors=0 / catalogue=1',
            visibility: 'policy_gated',
          },
          {
            access: 'read_only',
            configured: false,
            family: 'skill',
            id: 'skills.catalogue',
            label: 'Skills',
            missingReason: 'No ready model-visible Skill is enabled.',
            requiredGate: 'runtime_entrypoint_coverage',
            requiresApproval: false,
            status: 'unconfigured',
            summary: 'enabled=1 / ready=1 / modelVisible=0 / needsConfig=0 / catalogue=1',
            visibility: 'hidden',
          },
          {
            access: 'mixed',
            configured: false,
            family: 'mcp',
            id: 'mcp.servers',
            label: 'MCP Servers',
            missingReason: 'Connected MCP tools are not exposed through the runtime tool gate.',
            requiredGate: 'runtime_entrypoint_coverage',
            requiresApproval: true,
            status: 'unconfigured',
            summary: 'connectedServers=1 / tools=3 / modelVisibleTools=0 / errors=0 / catalogue=1',
            visibility: 'hidden',
          },
        ],
      })) },
      buildRunRepository(),
      buildRunStepRepository(),
      executor,
      { upsert: vi.fn() },
    );

    await service.trigger({
      operatorConfirmed: true,
      prompt: 'Inspect bridged context.',
      taskId: 'task_1',
    });

    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('Capability bridge policy:'),
    }));
    const prompt = vi.mocked(executor).mock.calls[0]?.[0].input ?? '';
    expect(prompt).toContain('External Access context bridge');
    expect(prompt).toContain('Skills context bridge');
    expect(prompt).toContain('MCP context bridge');
    expect(prompt).toContain('Confirmed source previews:');
    expect(prompt).toContain('Gmail launch digest');
    expect(prompt).toContain('Confirmed Gmail source says the launch note needs legal review.');
    expect(prompt).not.toContain('token=secret');
    expect(prompt).toContain('Do not claim live connector/tool access');
  });

  it('records the accepted run immediately before the executor completes', async () => {
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
    const runRepository = buildRunRepository();
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      runRepository,
      buildRunStepRepository(),
      executor,
      { upsert: vi.fn() },
      workloadTracker,
    );

    const result = await service.trigger({
      operatorConfirmed: true,
      prompt: 'Keep running long enough to observe async start.',
      taskId: 'task_1',
    });

    expect(result).toMatchObject({
      id: 'run_agent_cli_1',
      status: 'running',
    });
    expect(workloadTracker.getActiveRunCount('codex')).toBe(1);
    expect(runRepository.updateResult).not.toHaveBeenCalled();

    resolveExecution({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: 'Done.',
      summary: 'Agent CLI execution completed.',
    });
    await vi.waitFor(() => {
      expect(workloadTracker.getActiveRunCount('codex')).toBe(0);
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

    const result = await service.trigger({
      operatorConfirmed: true,
      prompt: 'Keep running long enough to observe workload.',
      taskId: 'task_1',
    });
    expect(result.status).toBe('running');
    expect(workloadTracker.getActiveRunCount('codex')).toBe(1);

    resolveExecution({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: 'Done.',
      summary: 'Agent CLI execution completed.',
    });
    await vi.waitFor(() => {
      expect(workloadTracker.getActiveRunCount('codex')).toBe(0);
    });
  });

  it('records a failed run and clears workload when the executor throws', async () => {
    const runRepository = buildRunRepository();
    const runStepRepository = buildRunStepRepository();
    const taskService = buildTaskService();
    const workloadTracker = new AgentCliRuntimeWorkloadTracker();
    const runVerificationRepository = { upsert: vi.fn() };
    const service = new AgentCliRunService(
      taskService,
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      runRepository,
      runStepRepository,
      vi.fn().mockRejectedValue(new Error('spawn failed')),
      runVerificationRepository,
      workloadTracker,
    );

    const result = await service.trigger({
      operatorConfirmed: true,
      prompt: 'Run Codex.',
      taskId: 'task_1',
    });

    expect(result).toMatchObject({
      id: 'run_agent_cli_1',
      status: 'running',
    });
    await vi.waitFor(() => {
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      error: 'spawn failed',
      kind: 'model',
      status: 'failed',
      title: 'codex cli failed',
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      error: 'spawn failed',
      kind: 'final',
      status: 'failed',
      title: '验收子 Agent 检查',
      output: expect.stringContaining('Verdict: fail'),
    }));
    });
    expect(taskService.annotateRunFailed).toHaveBeenCalledWith('task_1', 'spawn failed', 'run_agent_cli_1');
    expect(workloadTracker.getActiveRunCount('codex')).toBe(0);
    expect(runVerificationRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_agent_cli_1',
      targetType: 'step',
      tone: 'fail',
      label: '执行后检查未通过',
      detail: 'spawn failed',
    }));
    expect(runVerificationRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_agent_cli_1',
      targetType: 'run',
      targetId: 'run_agent_cli_1',
      tone: 'fail',
      label: 'Run 检查未通过',
      detail: 'spawn failed',
    }));
  });

  it('cancels an active Agent CLI run through the workload control handle', async () => {
    const runRepository = buildRunRepository();
    const runStepRepository = buildRunStepRepository();
    const taskService = buildTaskService();
    const workloadTracker = new AgentCliRuntimeWorkloadTracker();
    const executor: AgentCliExecutor = vi.fn().mockImplementation((params) =>
      new Promise((resolve) => {
        params.signal?.addEventListener('abort', () => {
          resolve({
            exitCode: null,
            failureReason: String(params.signal?.reason ?? 'cancelled'),
            status: 'failed',
            stderr: '',
            stdout: '',
            summary: 'Agent CLI execution cancelled.',
          });
        }, { once: true });
      }));
    const service = new AgentCliRunService(
      taskService,
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      runRepository,
      runStepRepository,
      executor,
      { upsert: vi.fn() },
      workloadTracker,
    );

    const result = await service.trigger({
      operatorConfirmed: true,
      prompt: 'Run until cancelled.',
      taskId: 'task_1',
    });
    expect(result.status).toBe('running');
    expect(workloadTracker.getActiveRunCount('codex')).toBe(1);

    const cancellation = await service.cancel({
      operatorConfirmed: true,
      reason: 'Operator stopped the run from Taskplane.',
      runId: 'run_agent_cli_1',
    });

    expect(cancellation).toMatchObject({
      cancelled: true,
      runId: 'run_agent_cli_1',
    });
    await vi.waitFor(() => {
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Operator stopped the run from Taskplane.',
      kind: 'model',
      status: 'failed',
      title: 'codex cli failed',
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Operator stopped the run from Taskplane.',
      kind: 'final',
      status: 'failed',
      title: '验收子 Agent 检查',
    }));
    });
    expect(runStepRepository.create).not.toHaveBeenCalledWith(expect.objectContaining({
      title: '任务记忆建议',
    }));
    expect(taskService.annotateRunFailed).toHaveBeenCalledWith(
      'task_1',
      'Operator stopped the run from Taskplane.',
      'run_agent_cli_1',
    );
    expect(workloadTracker.getActiveRunCount('codex')).toBe(0);
  });

  it('waits for the CLI subprocess to close after cancellation before returning terminal evidence', async () => {
    const controller = new AbortController();
    const execution = executeAgentCliCommand({
      args: ['-e', [
        "process.stdout.write('started\\n');",
        "process.on('SIGTERM', () => {",
        "  process.stdout.write('cleanup-after-sigterm\\n');",
        '  setTimeout(() => process.exit(0), 40);',
        '});',
        'setInterval(() => {}, 1000);',
      ].join('')],
      command: process.execPath,
      cwd: process.cwd(),
      input: '',
      outputLimitBytes: 64_000,
      signal: controller.signal,
      timeoutMs: 5_000,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    controller.abort('Operator cancelled from test.');

    await expect(execution).resolves.toMatchObject({
      failureReason: 'Operator cancelled from test.',
      status: 'failed',
      stdout: expect.stringContaining('cleanup-after-sigterm'),
      summary: 'Agent CLI execution cancelled.',
    });
  });

  it('requires explicit operator confirmation before cancelling an Agent CLI run', async () => {
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      buildRunRepository(),
      buildRunStepRepository(),
      vi.fn(),
    );

    await expect(service.cancel({
      operatorConfirmed: false,
      runId: 'run_agent_cli_1',
    })).rejects.toThrow('Agent CLI cancellation requires explicit operator confirmation.');
  });

  it('returns a no-op cancellation result when the Agent CLI run is no longer active', async () => {
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      buildRunRepository(),
      buildRunStepRepository(),
      vi.fn(),
      null,
      new AgentCliRuntimeWorkloadTracker(),
    );

    await expect(service.cancel({
      operatorConfirmed: true,
      runId: 'run_agent_cli_1',
    })).resolves.toMatchObject({
      cancelled: false,
      summary: 'No active Agent CLI run found for run_agent_cli_1.',
    });
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
            readyManualRunCount: 0,
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

  it('blocks execution before creating a run when Codex CLI is not authenticated', async () => {
    const runRepository = buildRunRepository();
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus({
        agentCliRuntimeStatus: {
          catalogueCount: 2,
          detectedCount: 1,
          errorCount: 0,
          manualRunCount: 1,
          readyCount: 0,
          readyManualRunCount: 0,
          runningCount: 0,
          updatedAt: '2026-05-19T00:00:00.000Z',
          runtimes: [{
            id: 'codex',
            label: 'Codex CLI',
            command: 'codex',
            installed: true,
            version: 'codex 0.42.0',
            authState: 'needs_login',
            executionSupport: 'manual_run',
            workload: 'idle',
            missingReason: 'Codex CLI is installed but not logged in; run codex login.',
          }],
        },
      })) },
      runRepository,
      buildRunStepRepository(),
      vi.fn(),
    );

    await expect(service.trigger({
      operatorConfirmed: true,
      prompt: 'Run Codex.',
      taskId: 'task_1',
    })).rejects.toThrow('Codex CLI is installed but not logged in; run codex login.');
    expect(runRepository.create).not.toHaveBeenCalled();
  });

  it('blocks execution before creating a run when no runtime workspace is available', async () => {
    const runRepository = buildRunRepository();
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus({ suggestedWorkspaceRoot: null, workspaceRoot: null })) },
      runRepository,
      buildRunStepRepository(),
      vi.fn(),
    );

    await expect(service.trigger({
      operatorConfirmed: true,
      prompt: 'Run Codex.',
      taskId: 'task_1',
    })).rejects.toThrow('Agent CLI run requires an available runtime workspace.');
    expect(runRepository.create).not.toHaveBeenCalled();
  });

  it('blocks execution before creating a run when workspace root is unreadable', async () => {
    const runRepository = buildRunRepository();
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus({ workspaceRoot: '/tmp/taskplane-missing-agent-cli-workspace' })) },
      runRepository,
      buildRunStepRepository(),
      vi.fn(),
    );

    await expect(service.trigger({
      operatorConfirmed: true,
      prompt: 'Run Codex.',
      taskId: 'task_1',
    })).rejects.toThrow('Agent CLI workspace root is not a readable directory: /tmp/taskplane-missing-agent-cli-workspace');
    expect(runRepository.create).not.toHaveBeenCalled();
  });

  it('runs Claude Code through the dedicated plan-mode adapter', async () => {
    const runRepository = buildRunRepository();
    const runStepRepository = buildRunStepRepository();
    const executor = vi.fn().mockResolvedValue({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: 'Claude Code plan.',
      summary: 'Agent CLI execution completed.',
    });
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus({
        agentCliRuntimeStatus: {
          catalogueCount: 2,
          detectedCount: 2,
          errorCount: 0,
          manualRunCount: 2,
          readyCount: 2,
          readyManualRunCount: 2,
          runningCount: 0,
          updatedAt: '2026-05-19T00:00:00.000Z',
          runtimes: [
            {
              id: 'codex',
              label: 'Codex CLI',
              command: 'codex',
              installed: true,
              version: 'codex 0.42.0',
              authState: 'ready',
              executionSupport: 'manual_run',
              workload: 'idle',
              missingReason: null,
            },
            {
              id: 'claude',
              label: 'Claude Code',
              command: 'claude',
              installed: true,
              version: 'claude 1.0.0',
              authState: 'ready',
              executionSupport: 'manual_run',
              workload: 'idle',
              missingReason: null,
            },
          ],
        },
      })) },
      runRepository,
      runStepRepository,
      executor,
      { upsert: vi.fn() },
    );

    const result = await service.trigger({
      operatorConfirmed: true,
      prompt: 'Run Claude.',
      runtimeId: 'claude',
      taskId: 'task_1',
    });

    expect(result).toMatchObject({
      id: 'run_agent_cli_1',
      status: 'running',
    });
    expect(runRepository.create).toHaveBeenCalledWith({
      instructions: 'Agent CLI (Claude Code) read-only: Run Claude.',
      taskId: 'task_1',
      type: 'agent',
    });
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      args: ['-p', '--permission-mode', 'plan', '--output-format', 'text'],
      command: 'claude',
      cwd: workspaceRoot,
      input: expect.stringContaining('Claude Code is launched with --permission-mode plan.'),
    }));
    await vi.waitFor(() => {
      expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'model',
        status: 'completed',
        title: 'claude code completed',
        output: 'Claude Code plan.',
      }));
    });
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
  const workspaceRoot = process.cwd();
  return {
    configured: false,
    apiKeyStored: false,
    apiKeySource: null,
    provider: 'fal-openrouter',
    model: 'google/gemini-2.5-flash',
    baseUrl: null,
    workspaceRoot,
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
      readyCount: 1,
      readyManualRunCount: 1,
      runningCount: 0,
      updatedAt: '2026-05-19T00:00:00.000Z',
      runtimes: [{
        id: 'codex',
        label: 'Codex CLI',
        command: 'codex',
        installed: true,
        version: 'codex 0.42.0',
        authState: 'ready',
        executionSupport: 'manual_run',
        workload: 'idle',
        missingReason: null,
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
