import { describe, expect, it, vi } from 'vitest';

import type { AiConfigStatus } from '../../../shared/types/settings.js';
import type { RunRecord, RunStepRecord } from '../../../shared/types/run.js';
import type { TaskDetail } from '../../../shared/types/task.js';
import type { PilotDecisionSnapshot } from '../../../shared/pilot-decision-contract.js';
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
      pilotDecision: buildPilotDecisionSnapshot(),
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
      title: 'Agent CLI 上下文就绪判断',
      output: expect.stringContaining('decision=ready'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'agent cli run accepted',
      output: expect.stringContaining('Context readiness: ready.'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'plan',
      status: 'completed',
      title: 'Agent CLI 目标契约',
      input: expect.stringContaining('"runtimeLabel": "Codex CLI"'),
      output: expect.stringContaining('taskGoal=active'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'decision',
      status: 'completed',
      title: 'Pilot 决策辅助计划',
      input: expect.stringContaining('"outputContract": "pilot_decision_summary"'),
      output: expect.stringContaining('status=requested'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Pilot 决策辅助计划',
      output: expect.stringContaining('triggers=user_steer'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Agent CLI 目标契约',
      output: expect.stringContaining('objective=Review implementation path.'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      args: ['exec', '--json', '--sandbox', 'read-only', '--cd', workspaceRoot, '--skip-git-repo-check', '-'],
      command: 'codex',
      cwd: workspaceRoot,
      input: expect.stringContaining('Taskplane run contract:'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('Context readiness decision:'),
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
      input: expect.stringContaining('"phase":"memory_proposal"'),
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
      title: '任务记忆建议',
      input: expect.stringContaining('  - 本次 Agent run 应回答用户请求，并给出下一步、风险和验证建议。'),
      output: expect.stringContaining('Completion conditions: 本次 Agent run 应回答用户请求，并给出下一步、风险和验证建议。'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'final',
      status: 'completed',
      title: '验收子 Agent 检查',
      input: expect.stringContaining('taskplane.verifier.lightweight'),
      output: expect.stringContaining('Completion conditions: 本次 Agent run 应回答用户请求，并给出下一步、风险和验证建议。'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      title: '验收子 Agent 检查',
      input: expect.stringContaining('"phase": "verification_assist"'),
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

  it('projects Codex JSONL native events into run steps and keeps chat output human-readable', async () => {
    const runRepository = buildRunRepository();
    const runStepRepository = buildRunStepRepository();
    const executor = vi.fn().mockResolvedValue({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: [
        JSON.stringify({ type: 'session.started', id: 's1' }),
        JSON.stringify({ type: 'tool.call', name: 'web_search', input: { query: 'Codex CLI docs' } }),
        JSON.stringify({ type: 'tool.result', name: 'web_search', content: 'Found official Codex docs.' }),
        JSON.stringify({ type: 'result', result: '整理完成：建议参考官方 Codex 文档。' }),
      ].join('\n'),
      summary: 'Agent CLI execution completed.',
    });
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      runRepository,
      runStepRepository,
      executor,
    );

    await service.trigger({
      operatorConfirmed: true,
      prompt: '调研 Codex CLI 文档。',
      taskId: 'task_1',
    });

    await vi.waitFor(() => {
      expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'tool_result',
        title: 'Codex CLI 原生事件流',
        output: expect.stringContaining('json_lines=4'),
      }));
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'tool_call',
      title: 'Codex CLI 联网检索：web_search',
      input: expect.stringContaining('Codex CLI docs'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'tool_result',
      title: 'Codex CLI 联网检索：web_search',
      output: expect.stringContaining('capability=web_search'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'tool_result',
      title: 'Codex CLI 联网检索：web_search',
      output: expect.stringContaining('Found official Codex docs.'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'model',
      title: 'codex cli completed',
      output: '整理完成：建议参考官方 Codex 文档。',
    }));
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_agent_cli_1',
      'completed',
      '整理完成：建议参考官方 Codex 文档。',
      'ai',
    );
  });

  it('tags workspace search as workspace progress instead of web research', async () => {
    const runStepRepository = buildRunStepRepository();
    const executor = vi.fn().mockResolvedValue({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: [
        JSON.stringify({ type: 'tool.call', name: 'workspace.search', input: { query: 'TaskAdvancementOrchestrator' } }),
        JSON.stringify({ type: 'result', result: '已完成本地检索。' }),
      ].join('\n'),
      summary: 'Agent CLI execution completed.',
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
      prompt: '检查本地任务推进代码。',
      taskId: 'task_1',
    });

    await vi.waitFor(() => {
      expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'tool_call',
        title: 'Codex CLI 工作区读取：workspace.search',
        output: expect.stringContaining('capability=workspace_read'),
      }));
    });
  });

  it('projects Claude stream-json tool events into run steps', async () => {
    const runStepRepository = buildRunStepRepository();
    const executor = vi.fn().mockResolvedValue({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{
              type: 'tool_use',
              name: 'WebSearch',
              input: { query: 'Claude Code headless mode' },
            }],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: '基于资料，Claude Code 支持 stream-json。' }],
          },
        }),
        JSON.stringify({ type: 'result', result: '最终建议：使用 stream-json 捕获事件。' }),
      ].join('\n'),
      summary: 'Agent CLI execution completed.',
    });
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus({
        agentCliRuntimeStatus: {
          ...buildAiStatus().agentCliRuntimeStatus!,
          runtimes: buildAiStatus().agentCliRuntimeStatus!.runtimes.map((runtime) => ({
            ...runtime,
            command: 'claude',
            id: 'claude',
            label: 'Claude Code',
            version: 'claude 2.1.144',
          })),
        },
      })) },
      buildRunRepository(),
      runStepRepository,
      executor,
    );

    await service.trigger({
      operatorConfirmed: true,
      prompt: '调研 Claude Code headless 输出。',
      runtimeId: 'claude',
      taskId: 'task_1',
    });

    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      args: ['-p', '--permission-mode', 'plan', '--output-format', 'stream-json'],
    }));
    await vi.waitFor(() => {
      expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'tool_call',
        title: 'Claude Code 联网检索：WebSearch',
        input: expect.stringContaining('Claude Code headless mode'),
        output: expect.stringContaining('capability=web_search'),
      }));
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'model',
      title: 'claude code completed',
      output: '最终建议：使用 stream-json 捕获事件。',
    }));
  });

  it('does not treat child-task advancement as another decomposition request', async () => {
    const executor = vi.fn().mockResolvedValue({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: 'Child task plan.',
      summary: 'Agent CLI execution completed.',
    });
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      buildRunRepository(),
      buildRunStepRepository(),
      executor,
      { upsert: vi.fn() },
    );

    await service.trigger({
      operatorConfirmed: true,
      prompt: [
        '请推进子任务「明确网站目标与范围」。',
        '父任务：「开发一个网站」。',
        '请先判断当前最需要确认的决策点，优先问一个问题；如果有 2-3 个紧密相关的问题能减少来回，可以一起问。',
      ].join('\n'),
      taskId: 'task_1',
    });

    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.not.stringContaining('"type":"TASKPLANE_DECOMPOSITION"'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.not.stringContaining('This is a Taskplane task-decomposition request'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('This is a Taskplane child-task advancement request'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('Do not create a subtask.propose write-intent block.'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('Do not keep the task in clarification mode'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('theme/product + target audience + content shape/use case is enough to advance'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('Taskplane write intent'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('decision.create'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('task_file.propose'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('task.complete.propose'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.not.stringContaining('ask exactly one natural follow-up question'),
    }));
  });

  it('captures OpenAI web research sources before a research-dependent Codex CLI run', async () => {
    const task = buildTask({
      nextStep: '明确网站目标和范围。',
      summary: '做一个 Codex 基础教程网站，面向 Agent 初学者，偏基础教程和案例展示。',
      title: '明确网站目标与范围',
    });
    const createdSources: unknown[] = [];
    const taskService = buildTaskService(task);
    vi.mocked(taskService.createSourceContext).mockImplementation(async (input) => {
      createdSources.push(input);
      return input as never;
    });
    vi.mocked(taskService.getDetail).mockImplementation(async () => ({
      ...task,
      sourceContexts: createdSources.map((source, index) => ({
        archivedAt: null,
        capturedAt: '2026-05-19T00:00:00.000Z',
        containsSensitiveData: false,
        content: (source as { content?: string | null }).content ?? null,
        createdAt: '2026-05-19T00:00:00.000Z',
        credibility: (source as { credibility?: 'unknown' | null }).credibility ?? 'unknown',
        id: `source_context_${index + 1}`,
        isDuplicate: false,
        isKey: true,
        kind: (source as { kind?: 'link' | 'note' }).kind ?? 'link',
        note: (source as { note?: string | null }).note ?? null,
        sourceRole: (source as { sourceRole?: 'raw' | 'digest' }).sourceRole ?? 'raw',
        status: 'active',
        taskId: task.id,
        title: (source as { title?: string }).title ?? 'Source',
        updatedAt: '2026-05-19T00:00:00.000Z',
        uri: (source as { uri?: string | null }).uri ?? null,
      })),
    }));
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        output_text: 'Codex 教程站应优先参考官方 Codex 文档和 CLI 使用说明。',
        sources: [{
          title: 'Codex docs',
          url: 'https://developers.openai.com/codex',
          snippet: 'Official Codex documentation.',
        }],
      }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);
    const executor = vi.fn().mockResolvedValue({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: '已基于来源形成首版范围。',
      summary: 'Agent CLI execution completed.',
    });
    const runStepRepository = buildRunStepRepository();
    const service = new AgentCliRunService(
      taskService,
      {
        getStatus: vi.fn().mockResolvedValue(buildAiStatus({
          provider: 'openai',
          model: 'gpt-5-mini',
          featureFlags: {
            enableScheduler: false,
            enableProviderNativeToolCalls: true,
            agentCliCapabilityMode: 'audit_enhanced',
          },
        })),
        resolveOpenAiWebResearchConfig: vi.fn().mockResolvedValue({
          apiKey: 'test-openai-key',
          model: 'gpt-5-mini',
          provider: 'openai',
        }),
      },
      buildRunRepository(),
      runStepRepository,
      executor,
    );

    await service.trigger({
      operatorConfirmed: true,
      prompt: '做一个 Codex 的基础教程网站，面向 Agent 初学者，偏基础教程和案例展示。',
      taskId: task.id,
    });

    expect(fetchMock).toHaveBeenCalledWith('https://api.openai.com/v1/responses', expect.objectContaining({
      method: 'POST',
    }));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      model: 'gpt-5-mini',
      tools: [{ type: 'web_search' }],
    });
    expect(taskService.createSourceContext).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'note',
      sourceRole: 'digest',
      title: '联网调研摘要',
    }));
    expect(taskService.createSourceContext).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'link',
      sourceRole: 'raw',
      title: 'Codex docs',
      uri: 'https://developers.openai.com/codex',
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'tool_call',
      status: 'completed',
      title: 'Agent CLI 联网调研准备',
      output: expect.stringContaining('status=captured'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('Confirmed source previews:'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('https://developers.openai.com/codex'),
    }));
  });

  it('captures visible web research in native mode when the Taskplane bridge is configured', async () => {
    const runStepRepository = buildRunStepRepository();
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        output_text: 'Codex CLI 教程站应参考官方文档。',
        sources: [{
          title: 'OpenAI Codex',
          url: 'https://developers.openai.com/codex',
          snippet: 'Codex official docs.',
        }],
      }),
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);
    const executor = vi.fn().mockResolvedValue({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: '会用 CLI 原生能力继续调研。',
      summary: 'Agent CLI execution completed.',
    });
    const service = new AgentCliRunService(
      buildTaskService(buildTask({
        summary: '做一个 Codex 基础教程网站，面向 Agent 初学者。',
        title: '明确网站目标与范围',
      })),
      {
        getStatus: vi.fn().mockResolvedValue(buildAiStatus({
          provider: 'openai',
          model: 'gpt-5-mini',
          featureFlags: {
            enableScheduler: false,
            enableProviderNativeToolCalls: true,
            agentCliCapabilityMode: 'native',
          },
        })),
        resolveOpenAiWebResearchConfig: vi.fn().mockResolvedValue({
          apiKey: 'test-openai-key',
          model: 'gpt-5-mini',
          provider: 'openai',
        }),
      },
      buildRunRepository(),
      runStepRepository,
      executor,
    );

    await service.trigger({
      operatorConfirmed: true,
      prompt: '做一个 Codex 基础教程网站，面向 Agent 初学者。',
      taskId: 'task_1',
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'tool_call',
      status: 'completed',
      title: 'Agent CLI 联网调研准备',
      output: expect.stringContaining('status=captured'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('Capability mode: native.'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('native read-only capabilities'),
    }));
  });

  it('uses decomposition instructions only for explicit decomposition requests', async () => {
    const executor = vi.fn().mockResolvedValue({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: 'Decomposition draft.',
      summary: 'Agent CLI execution completed.',
    });
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      buildRunRepository(),
      buildRunStepRepository(),
      executor,
      { upsert: vi.fn() },
    );

    await service.trigger({
      operatorConfirmed: true,
      prompt: '请帮我拆解「开发一个网站」，先给出子任务方案，不要直接创建。',
      taskId: 'task_1',
    });

    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('TASKPLANE_WRITE_INTENTS'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('subtask.propose'),
    }));
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

  it('requires an objective before recording runtime-native goal audit evidence', async () => {
    const runRepository = buildRunRepository();
    const runStepRepository = buildRunStepRepository();
    const executor = vi.fn();
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      runRepository,
      runStepRepository,
      executor,
    );

    await expect(service.recordNativeGoalRequest({
      forwarded: false,
      objective: '   ',
      operatorConfirmed: true,
      reason: 'Adapter native goal capability is disabled.',
      runtimeId: 'codex',
      runtimeLabel: 'Codex CLI',
      supportsNativeGoalMode: false,
      taskId: 'task_1',
    })).rejects.toThrow('Runtime-native goal audit requires an objective.');

    expect(runRepository.create).not.toHaveBeenCalled();
    expect(runStepRepository.create).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
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
      buildTaskService(buildTask({
        parentTaskId: 'task_parent_1',
        summary: '确认网站类型、目标用户、核心价值和页面范围。',
        title: '明确网站目标与范围',
      })),
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

  it('keeps child task advancement conversational without creating a memory confirmation proposal', async () => {
    const runStepRepository = buildRunStepRepository();
    const executor = vi.fn().mockResolvedValue({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: '请先确认网站类型：官网、作品集、产品页还是后台系统？',
      summary: 'Agent CLI execution completed.',
    });
    const service = new AgentCliRunService(
      buildTaskService(buildTask({
        parentTaskId: 'task_parent_1',
        summary: '确认网站类型、目标用户、核心价值和页面范围。',
        title: '明确网站目标与范围',
      })),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      buildRunRepository(),
      runStepRepository,
      executor,
    );

    await service.trigger({
      operatorConfirmed: true,
      prompt: [
        '请推进子任务「明确网站目标与范围」。',
        '父任务：「开发一个网站」。',
        '做一个 Codex 的基础教程网站，面向 Agent 初学者，偏基础教程和案例展示。',
      ].join('\n'),
      taskId: 'task_1',
    });

    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('first-pass goal, scope, non-goals, research/build action'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('Taskplane context: the selected task is a child task.'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('Treat the user request as the source of intent'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('Context readiness: before asking or executing'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('continue with a concrete action instead of another planning question'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.not.stringContaining('Return at most two short Chinese sentences'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.not.stringContaining('TASKPLANE_DECOMPOSITION JSON block with this exact shape'),
    }));
    await vi.waitFor(() => {
      expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        kind: 'final',
        title: '验收子 Agent 检查',
      }));
    });
    expect(runStepRepository.create).not.toHaveBeenCalledWith(expect.objectContaining({
      title: '任务记忆建议',
    }));
  });

  it('warns but allows a new Agent CLI run when the previous memory proposal still needs Task Record confirmation', async () => {
    const runRepository = buildRunRepository();
    const runStepRepository = buildRunStepRepository();
    vi.mocked(runStepRepository.listForTask).mockResolvedValue([{
      createdAt: '2026-05-20T00:00:00.000Z',
      error: null,
      id: 'run_step_pending_memory',
      index: 0,
      input: JSON.stringify({
        suggestedContentByTarget: {
          task_record: '## Agent CLI outcome\n\n- Key findings: Previous CLI result needs review.',
        },
        targets: ['task_record'],
      }),
      kind: 'plan',
      output: '- Task Record may be useful: agent_cli_summary',
      runId: 'run_previous',
      status: 'completed',
      title: '任务记忆建议',
      updatedAt: '2026-05-20T00:00:00.000Z',
    }]);
    const executor = vi.fn().mockResolvedValue({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: 'Next planning result.',
      summary: 'Agent CLI execution completed.',
    });
    const service = new AgentCliRunService(
      buildTaskService(),
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      runRepository,
      runStepRepository,
      executor,
    );

    await expect(service.trigger({
      operatorConfirmed: true,
      prompt: 'Start another Codex run.',
      taskId: 'task_1',
    })).resolves.toMatchObject({
      id: 'run_agent_cli_1',
      status: 'running',
    });

    expect(runRepository.create).toHaveBeenCalled();
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      output: expect.stringContaining('pending_memory_warning=最新任务记忆建议仍缺少对应写入：Task Record。'),
      status: 'completed',
      title: 'agent cli run accepted',
    }));
    expect(executor).toHaveBeenCalled();
  });

  it('allows the next Agent CLI run after the pending memory proposal has a Task Record write', async () => {
    const runRepository = buildRunRepository();
    const runStepRepository = buildRunStepRepository();
    vi.mocked(runStepRepository.listForTask).mockResolvedValue([{
      createdAt: '2026-05-20T00:00:00.000Z',
      error: null,
      id: 'run_step_pending_memory',
      index: 0,
      input: JSON.stringify({
        suggestedContentByTarget: {
          task_record: [
            '## Confirmed',
            '- Completion conditions checked: 1',
            '  - Run Goal Contract 包含目标',
          ].join('\n'),
        },
        targets: ['task_record'],
      }),
      kind: 'plan',
      output: '- Task Record may be useful: agent_cli_summary',
      runId: 'run_previous',
      status: 'completed',
      title: '任务记忆建议',
      updatedAt: '2026-05-20T00:00:00.000Z',
    }]);
    const taskService = buildTaskService();
    vi.mocked(taskService.getDetail).mockResolvedValue({
      ...buildTask(),
      taskFiles: [
        ...buildTask().taskFiles,
        {
          content: [
            '# Task Record: Task 1',
            '',
            '## Confirmed',
            '- Completion conditions checked: 1',
            '  - Run Goal Contract 包含目标',
          ].join('\n'),
          createdAt: '2026-05-20T00:01:00.000Z',
          id: 'task_record_memory',
          kind: 'file',
          name: '2026-05-20-memory-guidance.md',
          path: 'Task Records/2026-05-20-memory-guidance.md',
          taskId: 'task_1',
          updatedAt: '2026-05-20T00:01:00.000Z',
        },
      ],
    });
    const executor = vi.fn().mockResolvedValue({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: 'Next Codex CLI answer.',
      summary: 'Agent CLI execution completed.',
    });
    const service = new AgentCliRunService(
      taskService,
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      runRepository,
      runStepRepository,
      executor,
    );

    await expect(service.trigger({
      operatorConfirmed: true,
      prompt: 'Continue after memory write.',
      taskId: 'task_1',
    })).resolves.toMatchObject({ id: 'run_agent_cli_1' });

    expect(runRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_1',
      type: 'agent',
    }));
    expect(executor).toHaveBeenCalled();
  });

  it('persists received handoff retrieval evidence in the accepted Agent CLI run step', async () => {
    const runRepository = buildRunRepository();
    const runStepRepository = buildRunStepRepository();
    const taskService = buildTaskService();
    vi.mocked(taskService.getDetail).mockResolvedValue({
      ...buildTask(),
      taskFiles: [
        ...buildTask().taskFiles,
        {
          content: '# Record: Task Completion Handoff\n\n## From\n- Previous task\n\n## To\n- Task 1',
          createdAt: '2026-05-20T00:00:00.000Z',
          id: 'task_record_received_handoff',
          kind: 'file',
          name: '2026-05-20-received-handoff.md',
          path: 'Task Records/2026-05-20-received-handoff.md',
          taskId: 'task_1',
          updatedAt: '2026-05-20T00:00:00.000Z',
        },
      ],
    });
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
    );

    await service.trigger({
      operatorConfirmed: true,
      prompt: 'Continue from received handoff.',
      taskId: 'task_1',
    });

    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'agent cli run accepted',
      output: expect.stringContaining('task_record/task_record_received_handoff/include/current_task_scope'),
    }));
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'agent cli run accepted',
      output: expect.stringContaining('task_file:Task Records/2026-05-20-received-handoff.md:Task Records/2026-05-20-received-handoff.md'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('task_record/task_record_received_handoff/include/current_task_scope'),
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('task_file:Task Records/2026-05-20-received-handoff.md:Task Records/2026-05-20-received-handoff.md'),
    }));
  });

  it('blocks Agent CLI execution for a completed target task before creating a run', async () => {
    const taskService = buildTaskService();
    vi.mocked(taskService.getDetail).mockResolvedValue({
      ...buildTask(),
      state: 'completed',
      title: 'Completed task',
    });
    const runRepository = buildRunRepository();
    const runStepRepository = buildRunStepRepository();
    const executor = vi.fn();
    const service = new AgentCliRunService(
      taskService,
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      runRepository,
      runStepRepository,
      executor,
    );

    await expect(service.trigger({
      operatorConfirmed: true,
      prompt: 'Start Codex on a completed task.',
      taskId: 'task_1',
    })).rejects.toThrow('目标任务「Completed task」已完成或已归档，不能作为待开始子任务。');

    expect(runRepository.create).not.toHaveBeenCalled();
    expect(runStepRepository.create).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
  });

  it('synthesizes read-only Task.md context when a new task has no persisted task file yet', async () => {
    const taskService = buildTaskService();
    vi.mocked(taskService.getDetail).mockResolvedValue({
      ...buildTask(),
      taskFiles: [],
    });
    const runRepository = buildRunRepository();
    const runStepRepository = buildRunStepRepository();
    const executor = vi.fn().mockResolvedValue({
      exitCode: 0,
      failureReason: null,
      status: 'completed',
      stderr: '',
      stdout: 'Planning answer.',
      summary: 'Agent CLI execution completed.',
    });
    const service = new AgentCliRunService(
      taskService,
      { getStatus: vi.fn().mockResolvedValue(buildAiStatus()) },
      runRepository,
      runStepRepository,
      executor,
    );

    await expect(service.trigger({
      operatorConfirmed: true,
      prompt: 'Start Codex without recovery context.',
      taskId: 'task_1',
    })).resolves.toMatchObject({
      id: 'run_agent_cli_1',
      status: 'running',
    });

    expect(runRepository.create).toHaveBeenCalled();
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      output: expect.stringContaining('task_file:Task.md:Task.md:content=yes'),
      status: 'completed',
      title: 'agent cli run accepted',
    }));
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.stringContaining('This Task.md context was synthesized from structured Taskplane task state'),
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
    expect(prompt).toContain('Native mode: do not downgrade the selected official CLI.');
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
        "process.on('SIGTERM', () => {",
        "  process.stdout.write('cleanup-after-sigterm\\n');",
        '  setTimeout(() => process.exit(0), 40);',
        '});',
        "process.stdout.write('started\\n');",
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
      args: ['-p', '--permission-mode', 'plan', '--output-format', 'stream-json'],
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
      agentCliCapabilityMode: 'native',
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

function buildTask(partial: Partial<TaskDetail> = {}): TaskDetail {
  const task = {
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
  return {
    ...task,
    ...partial,
  };
}

function buildTaskService(task: TaskDetail = buildTask()) {
  return {
    annotateRunCompleted: vi.fn(),
    annotateRunFailed: vi.fn(),
    createSourceContext: vi.fn(),
    getDetail: vi.fn().mockResolvedValue(task),
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

function buildPilotDecisionSnapshot(
  partial: Partial<PilotDecisionSnapshot> = {},
): PilotDecisionSnapshot {
  return {
    backend: 'codex_cli',
    backendPlan: {
      backend: 'codex_cli',
      maxTurns: 1,
      outputContract: 'pilot_decision_summary',
      reason: 'A short model-assisted Pilot judgment may resolve ambiguous routing before execution.',
      status: 'requested',
      triggers: ['user_steer'],
    },
    confidence: 'model_assisted',
    executor: 'codex_cli',
    messagePriority: 'steer',
    movement: 'execute',
    operationMode: 'bounded_decision_backend',
    priorityLane: 'steady',
    reason: 'Pilot selected execute via agent_cli; message priority is steer.',
    ...partial,
  };
}
