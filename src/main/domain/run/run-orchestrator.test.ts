import { describe, expect, it, vi } from 'vitest';

import type { AppliedProcessTemplateRecord } from '../../../shared/types/process-template.js';
import type {
  CreateRunInput,
  RunRecord,
  RunStepKind,
  RunStepStatus,
} from '../../../shared/types/run.js';
import type { TaskDetail } from '../../../shared/types/task.js';
import { RunOrchestrator } from './run-orchestrator.js';

function buildTaskDetail(): TaskDetail {
  return {
    id: 'task_1',
    title: 'Task 1',
    summary: 'Summary',
    state: 'running',
    nextStep: 'Draft the response',
    waitingReason: null,
    activeWaitingItem: null,
    activeBlocker: null,
    riskLevel: 'none',
    riskNote: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    resumeCard: {
      summary: 'Resume summary',
      currentState: '状态：running',
      latestChange: {
        summary: '最近没有新的生命周期变化。',
        action: { label: null, targetType: null, targetId: null },
      },
      completionStatus: { total: 0, satisfied: 0, open: 0, summary: '尚未定义完成标准' },
      keySource: { sourceContextId: null, title: '暂无关键来源', detail: null, priorityReason: null },
      currentMethod: { templateId: null, title: '暂无方法模板', detail: null, selectionReason: null },
      currentBlocker: { blockerId: null, title: '暂无当前阻塞项', detail: null },
      nextSuggestedMove: 'Draft the response',
    },
    artifacts: [],
    completionCriteria: [],
    sourceContexts: [],
    processTemplates: [buildAppliedTemplate()],
    availableProcessTemplates: [],
    timeline: [],
  };
}

function buildAppliedTemplate(): AppliedProcessTemplateRecord {
  return {
    id: 'process_template_1',
    title: 'Outreach skill',
    summary: 'Use outreach workflow',
    content: '1. Review sources\n2. Draft outreach',
    kind: 'skill',
    tags: ['outreach'],
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    bindingId: 'task_process_binding_1',
    taskId: 'task_1',
    bindingStatus: 'active',
    bindingNote: null,
    boundAt: '2026-01-01T00:00:00.000Z',
    bindingUpdatedAt: '2026-01-01T00:00:00.000Z',
    removedAt: null,
  };
}

function buildRun(): RunRecord {
  return {
    id: 'run_1',
    taskId: 'task_1',
    type: 'draft',
    status: 'running',
    instructions: 'Please draft this',
    output: null,
    outputSource: null,
    failureReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildInput(): CreateRunInput {
  return {
    taskId: 'task_1',
    type: 'draft',
    instructions: 'Please draft this',
  };
}

function buildRunStepRepositoryMock() {
  let stepCount = 0;

  return {
    create: vi.fn().mockImplementation(async (input: {
      runId: string;
      kind: RunStepKind;
      status?: RunStepStatus;
      title: string;
    }) => {
      stepCount += 1;
      return {
        id: `run_step_${stepCount}`,
        runId: input.runId,
        index: stepCount,
        kind: input.kind,
        status: input.status ?? 'completed',
        title: input.title,
        input: null,
        output: null,
        error: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
    }),
    update: vi.fn().mockImplementation(async (id: string, input: {
      status: RunStepStatus;
      output?: string | null;
      error?: string | null;
    }) => ({
      id,
      runId: 'run_1',
      index: 2,
      kind: 'model',
      status: input.status,
      title: 'draft 模型执行',
      input: null,
      output: input.output ?? null,
      error: input.error ?? null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
  };
}

describe('RunOrchestrator', () => {
  it('writes plan/model/final steps around a successful text run', async () => {
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
      }),
    };
    const textExecutor = {
      execute: vi.fn().mockResolvedValue('Generated output'),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: true,
        selectedTemplates: [buildAppliedTemplate()],
        reason: 'Use the outreach skill.',
      }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const orchestrator = new RunOrchestrator(
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository as never,
    );

    const result = await orchestrator.executeTextRun({
      run: buildRun(),
      task: buildTaskDetail(),
      input: buildInput(),
    });

    expect(result).toMatchObject({
      status: 'completed',
      output: 'Generated output',
      selection: { shouldUse: true },
    });
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: 'plan', title: '准备执行上下文' }),
    );
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: 'model', status: 'running', title: 'draft 模型执行' }),
    );
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_2',
      expect.objectContaining({ status: 'completed', output: 'Generated output' }),
    );
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ kind: 'final', status: 'completed' }),
    );
  });

  it('keeps selector failures non-fatal but records executor failures', async () => {
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'openai',
        model: 'gpt-4.1',
        apiKey: 'secret',
        featureFlags: {
          enableScheduler: false,
          enableProviderNativeToolCalls: true,
        },
      }),
    };
    const textExecutor = {
      execute: vi.fn().mockRejectedValue(new Error('Executor exploded')),
    };
    const processTemplateSelector = {
      select: vi.fn().mockRejectedValue(new Error('selector unavailable')),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const orchestrator = new RunOrchestrator(
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository as never,
    );

    const result = await orchestrator.executeTextRun({
      run: buildRun(),
      task: buildTaskDetail(),
      input: buildInput(),
    });

    expect(result).toMatchObject({
      status: 'failed',
      message: 'Executor exploded',
      selection: {
        shouldUse: false,
        reason: 'process template selector 不可用：selector unavailable',
      },
    });
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_2',
      expect.objectContaining({ status: 'failed', error: 'Executor exploded' }),
    );
    expect(runStepRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'final', status: 'failed', error: 'Executor exploded' }),
    );
  });

  it('records provider-native shadow observation when the reserved flag has a provider payload', async () => {
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'openai-compatible',
        model: 'relay-model',
        apiKey: 'secret',
        featureFlags: {
          enableScheduler: false,
          enableProviderNativeToolCalls: true,
        },
      }),
    };
    const textExecutor = {
      executeWithResult: vi.fn().mockResolvedValue({
        text: 'Generated output',
        providerPayload: {
          source: 'provider_response_body',
          provider: 'openai-compatible',
          model: 'relay-model',
          rawSummary: 'choices=1; tool_calls=1',
          payload: {
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      id: 'call_1',
                      type: 'function',
                      function: {
                        name: 'task.inspect_context',
                        arguments: '{}',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      }),
      execute: vi.fn(),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: 'No template needed.',
      }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const orchestrator = new RunOrchestrator(
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository as never,
    );

    const result = await orchestrator.executeTextRun({
      run: buildRun(),
      task: buildTaskDetail(),
      input: buildInput(),
    });

    expect(result).toMatchObject({
      status: 'completed',
      output: 'Generated output',
    });
    expect(textExecutor.execute).not.toHaveBeenCalled();
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'model',
        status: 'completed',
        title: 'Provider 原生工具调用影子观察',
        input: [
          'provider=openai-compatible',
          'model=relay-model',
          'payload=choices=1; tool_calls=1',
        ].join('\n'),
        output: expect.stringContaining('providerCallCount=1'),
      }),
    );
    expect(runStepRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'final', status: 'completed' }),
    );
  });

  it('does not record provider-native shadow observation when the reserved flag is disabled', async () => {
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'openai-compatible',
        model: 'relay-model',
        apiKey: 'secret',
        featureFlags: {
          enableScheduler: false,
          enableProviderNativeToolCalls: false,
        },
      }),
    };
    const textExecutor = {
      executeWithResult: vi.fn().mockResolvedValue({
        text: 'Generated output',
        providerPayload: {
          source: 'provider_response_body',
          provider: 'openai-compatible',
          model: 'relay-model',
          rawSummary: 'choices=1; tool_calls=1',
          payload: {
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      id: 'call_1',
                      type: 'function',
                      function: {
                        name: 'task.inspect_context',
                        arguments: '{}',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      }),
      execute: vi.fn(),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: 'No template needed.',
      }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const orchestrator = new RunOrchestrator(
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository as never,
    );

    await orchestrator.executeTextRun({
      run: buildRun(),
      task: buildTaskDetail(),
      input: buildInput(),
    });

    expect(runStepRepository.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Provider 原生工具调用影子观察',
      }),
    );
    expect(runStepRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'final', status: 'completed' }),
    );
  });

  it('does not record provider-native shadow observation without a provider payload', async () => {
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'openai-compatible',
        model: 'relay-model',
        apiKey: 'secret',
        featureFlags: {
          enableScheduler: false,
          enableProviderNativeToolCalls: true,
        },
      }),
    };
    const textExecutor = {
      executeWithResult: vi.fn().mockResolvedValue({
        text: 'Generated output',
        providerPayload: null,
      }),
      execute: vi.fn(),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: 'No template needed.',
      }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const orchestrator = new RunOrchestrator(
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository as never,
    );

    await orchestrator.executeTextRun({
      run: buildRun(),
      task: buildTaskDetail(),
      input: buildInput(),
    });

    expect(runStepRepository.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Provider 原生工具调用影子观察',
      }),
    );
    expect(runStepRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'final', status: 'completed' }),
    );
  });

  it('keeps text execution completed when shadow normalization fails', async () => {
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
        featureFlags: {
          enableScheduler: false,
          enableProviderNativeToolCalls: true,
        },
      }),
    };
    const textExecutor = {
      executeWithResult: vi.fn().mockResolvedValue({
        text: 'Generated output',
        providerPayload: {
          source: 'provider_response_body',
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-latest',
          rawSummary: 'content=1; tool_use=0',
          payload: {
            stop_reason: 'tool_use',
            content: [
              {
                type: 'server_tool_use',
              },
            ],
          },
        },
      }),
      execute: vi.fn(),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: 'No template needed.',
      }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const orchestrator = new RunOrchestrator(
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository as never,
    );

    const result = await orchestrator.executeTextRun({
      run: buildRun(),
      task: buildTaskDetail(),
      input: buildInput(),
    });

    expect(result).toMatchObject({
      status: 'completed',
      output: 'Generated output',
    });
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'model',
        status: 'skipped',
        title: 'Provider 原生工具调用影子观察',
        output: expect.stringContaining('影子观察解析失败，Run 执行结果不受影响'),
      }),
    );
    expect(runStepRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'final', status: 'completed' }),
    );
  });

  it('runs agent mode through the local artifact note tool after model output', async () => {
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
      }),
    };
    const textExecutor = {
      execute: vi.fn().mockResolvedValue('Agent local note output'),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: 'No template needed.',
      }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const agentToolRegistry = {
      execute: vi.fn(),
    };
    const agentExecutor = {
      executeLocalNoteSession: vi.fn().mockResolvedValue({
        status: 'completed',
        output: 'Agent local note output',
      }),
    };
    const agentSessionRepository = {
      create: vi.fn().mockResolvedValue({ id: 'agent_session_1' }),
      updateStatus: vi.fn().mockResolvedValue({ id: 'agent_session_1', status: 'completed' }),
    };
    const orchestrator = new RunOrchestrator(
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository as never,
      agentToolRegistry as never,
      agentExecutor as never,
      agentSessionRepository as never,
    );

    const result = await orchestrator.executeAgentRun({
      run: buildRun(),
      task: buildTaskDetail(),
      input: { ...buildInput(), type: 'agent' },
    });

    expect(result).toMatchObject({
      status: 'completed',
      output: 'Agent local note output',
    });
    expect(agentSessionRepository.create).toHaveBeenCalledWith({
      runId: 'run_1',
      mode: 'agent',
      capabilities: {
        structuredToolCalls: false,
        textOnlyPlanning: true,
        streaming: false,
        fileContext: false,
        taskMutationTools: false,
        longRunningSessions: false,
      },
      metadata: 'executor=local_agent\nloop=local_note',
    });
    expect(agentSessionRepository.updateStatus).toHaveBeenCalledWith(
      'agent_session_1',
      'completed',
    );
    expect(agentExecutor.executeLocalNoteSession).toHaveBeenCalledWith(
      expect.objectContaining({
        modelOutput: 'Agent local note output',
        taskTitle: 'Task 1',
        request: expect.objectContaining({
          runId: 'run_1',
          taskId: 'task_1',
          policy: expect.objectContaining({
            allowLocalWorkspaceRead: false,
            confirmationRequiredRisks: ['external_write', 'sensitive'],
          }),
        }),
      }),
    );
  });

  it('stores file-context capability when an agent run opts into workspace reads', async () => {
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
      }),
    };
    const textExecutor = {
      execute: vi.fn().mockResolvedValue('Agent local note output'),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: 'No template needed.',
      }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const agentExecutor = {
      executeLocalNoteSession: vi.fn().mockResolvedValue({
        status: 'completed',
        output: 'Agent local note output',
      }),
    };
    const agentSessionRepository = {
      create: vi.fn().mockResolvedValue({ id: 'agent_session_1' }),
      updateStatus: vi.fn().mockResolvedValue({ id: 'agent_session_1', status: 'completed' }),
    };
    const orchestrator = new RunOrchestrator(
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository as never,
      { execute: vi.fn() } as never,
      agentExecutor as never,
      agentSessionRepository as never,
    );

    await orchestrator.executeAgentRun({
      run: buildRun(),
      task: buildTaskDetail(),
      input: { ...buildInput(), type: 'agent', allowLocalWorkspaceRead: true },
    });

    expect(agentSessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilities: expect.objectContaining({
          fileContext: true,
        }),
      }),
    );
    expect(agentSessionRepository.updateStatus).toHaveBeenCalledWith(
      'agent_session_1',
      'completed',
    );
    expect(agentExecutor.executeLocalNoteSession).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          policy: expect.objectContaining({
            allowLocalWorkspaceRead: true,
          }),
        }),
      }),
    );
  });

  it('stores task-mutation capability when an agent run opts into task update tools', async () => {
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
      }),
    };
    const textExecutor = {
      execute: vi.fn().mockResolvedValue('Agent local note output'),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: 'No template needed.',
      }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const agentExecutor = {
      executeLocalNoteSession: vi.fn().mockResolvedValue({
        status: 'completed',
        output: 'Agent local note output',
      }),
    };
    const agentSessionRepository = {
      create: vi.fn().mockResolvedValue({ id: 'agent_session_1' }),
      updateStatus: vi.fn().mockResolvedValue({ id: 'agent_session_1', status: 'completed' }),
    };
    const orchestrator = new RunOrchestrator(
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository as never,
      { execute: vi.fn() } as never,
      agentExecutor as never,
      agentSessionRepository as never,
    );

    await orchestrator.executeAgentRun({
      run: buildRun(),
      task: buildTaskDetail(),
      input: { ...buildInput(), type: 'agent', allowTaskMutationTools: true },
    });

    expect(agentSessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilities: expect.objectContaining({
          taskMutationTools: true,
        }),
      }),
    );
    expect(agentExecutor.executeLocalNoteSession).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          policy: expect.objectContaining({
            allowTaskMutationTools: true,
          }),
        }),
      }),
    );
  });

  it('keeps structured tool calls disabled for tool-capable providers until an adapter exists', async () => {
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'openai',
        model: 'gpt-4.1',
        apiKey: 'secret',
      }),
    };
    const textExecutor = {
      execute: vi.fn().mockResolvedValue('Agent local note output'),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: 'No template needed.',
      }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const agentExecutor = {
      executeLocalNoteSession: vi.fn().mockResolvedValue({
        status: 'completed',
        output: 'Agent local note output',
      }),
    };
    const agentSessionRepository = {
      create: vi.fn().mockResolvedValue({ id: 'agent_session_1' }),
      updateStatus: vi.fn().mockResolvedValue({ id: 'agent_session_1', status: 'completed' }),
    };
    const orchestrator = new RunOrchestrator(
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository as never,
      { execute: vi.fn() } as never,
      agentExecutor as never,
      agentSessionRepository as never,
    );

    await orchestrator.executeAgentRun({
      run: buildRun(),
      task: buildTaskDetail(),
      input: {
        ...buildInput(),
        type: 'agent',
        allowLocalWorkspaceRead: true,
        allowTaskMutationTools: true,
      },
    });

    expect(agentSessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilities: {
          structuredToolCalls: false,
          textOnlyPlanning: true,
          streaming: false,
          fileContext: true,
          taskMutationTools: true,
          longRunningSessions: false,
        },
      }),
    );
    expect(agentExecutor.executeLocalNoteSession).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          policy: expect.objectContaining({
            allowLocalWorkspaceRead: true,
            allowTaskMutationTools: true,
          }),
        }),
      }),
    );
  });

  it('returns paused when the agent loop stops before a local write', async () => {
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
      }),
    };
    const textExecutor = {
      execute: vi.fn().mockResolvedValue('Agent local note output'),
    };
    const selection = {
      shouldUse: false,
      selectedTemplates: [],
      reason: 'No template needed.',
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue(selection),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const agentToolRegistry = {
      execute: vi.fn(),
    };
    const agentExecutor = {
      executeLocalNoteSession: vi.fn().mockResolvedValue({
        status: 'paused',
        message: '观察到任务仍有阻塞项。暂停执行 artifact.create_note。',
        checkpointId: 'run_checkpoint_1',
      }),
    };
    const agentSessionRepository = {
      create: vi.fn().mockResolvedValue({ id: 'agent_session_1' }),
      updateStatus: vi.fn().mockResolvedValue({ id: 'agent_session_1', status: 'paused' }),
    };
    const orchestrator = new RunOrchestrator(
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository as never,
      agentToolRegistry as never,
      agentExecutor as never,
      agentSessionRepository as never,
    );

    const result = await orchestrator.executeAgentRun({
      run: buildRun(),
      task: buildTaskDetail(),
      input: { ...buildInput(), type: 'agent' },
    });

    expect(result).toEqual({
      status: 'paused',
      message: '观察到任务仍有阻塞项。暂停执行 artifact.create_note。',
      checkpointId: 'run_checkpoint_1',
      selection,
    });
    expect(agentSessionRepository.updateStatus).toHaveBeenCalledWith(
      'agent_session_1',
      'paused',
    );
  });
});
