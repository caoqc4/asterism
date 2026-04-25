import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ArtifactRepository } from '../../db/repositories/artifact-repository.js';
import { BlockerRepository } from '../../db/repositories/blocker-repository.js';
import { CompletionCriteriaRepository } from '../../db/repositories/completion-criteria-repository.js';
import { DecisionRepository } from '../../db/repositories/decision-repository.js';
import { ProcessTemplateRepository } from '../../db/repositories/process-template-repository.js';
import { RunCheckpointRepository } from '../../db/repositories/run-checkpoint-repository.js';
import { RunRepository } from '../../db/repositories/run-repository.js';
import { RunStepRepository } from '../../db/repositories/run-step-repository.js';
import { SourceContextRepository } from '../../db/repositories/source-context-repository.js';
import { TaskDependencyRepository } from '../../db/repositories/task-dependency-repository.js';
import { TaskProcessBindingRepository } from '../../db/repositories/task-process-binding-repository.js';
import { TaskRepository } from '../../db/repositories/task-repository.js';
import { WaitingItemRepository } from '../../db/repositories/waiting-item-repository.js';
import { closeDatabase, setDatabaseUserDataPathForTests } from '../../db/client.js';
import { makeTempDir } from '../../test-utils.js';
import { TaskService } from '../task/task-service.js';
import { AgentToolRegistry } from './agent-tool-registry.js';
import { RunService } from './run-service.js';

describe('RunService integration', () => {
  let tempRoot = '';
  let workspaceRoot = '';

  beforeEach(() => {
    tempRoot = makeTempDir('taskplane-run-service-');
    workspaceRoot = makeTempDir('taskplane-workspace-agent-');
    setDatabaseUserDataPathForTests(tempRoot);
  });

  afterEach(() => {
    closeDatabase();
    setDatabaseUserDataPathForTests(null);
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('runs an opted-in read-only workspace agent path through persisted run detail', async () => {
    fs.mkdirSync(path.join(workspaceRoot, 'docs'));
    fs.writeFileSync(
      path.join(workspaceRoot, 'docs', 'alpha.md'),
      'alpha workspace evidence\nnext line\n',
    );

    const taskRepository = new TaskRepository();
    const waitingItemRepository = new WaitingItemRepository();
    const artifactRepository = new ArtifactRepository();
    const sourceContextRepository = new SourceContextRepository();
    const processTemplateRepository = new ProcessTemplateRepository();
    const taskProcessBindingRepository = new TaskProcessBindingRepository();
    const blockerRepository = new BlockerRepository();
    const taskDependencyRepository = new TaskDependencyRepository();
    const completionCriteriaRepository = new CompletionCriteriaRepository();
    const runRepository = new RunRepository();
    const runStepRepository = new RunStepRepository();
    const runCheckpointRepository = new RunCheckpointRepository();
    const decisionRepository = new DecisionRepository();
    const taskService = new TaskService(
      taskRepository,
      waitingItemRepository,
      artifactRepository,
      sourceContextRepository,
      processTemplateRepository,
      taskProcessBindingRepository,
      blockerRepository,
      taskDependencyRepository,
      completionCriteriaRepository,
    );
    const agentToolRegistry = new AgentToolRegistry(
      artifactRepository,
      runStepRepository,
      runCheckpointRepository,
      decisionRepository,
      () => workspaceRoot,
    );
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'openai-compatible',
        model: 'local-alpha-model',
        apiKey: 'test-key',
      }),
    };
    const textExecutor = {
      execute: vi.fn().mockResolvedValue(JSON.stringify({
        finalOutput: 'Workspace alpha final note',
        steps: [
          {
            tool: 'workspace.search',
            input: { query: 'alpha workspace evidence', maxResults: 3 },
          },
          {
            tool: 'workspace.read_file',
            input: { path: 'docs/alpha.md' },
          },
          {
            tool: 'artifact.create_note',
            input: {
              title: 'Workspace alpha note',
              content: 'Workspace alpha final note',
            },
          },
        ],
      })),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: 'No process template needed for workspace alpha test.',
      }),
    };
    const service = new RunService(
      runRepository,
      taskService,
      artifactRepository,
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository,
      agentToolRegistry,
      runCheckpointRepository,
    );
    const task = await taskService.create({
      title: 'Workspace alpha agent path',
      summary: 'Validate local read-only workspace agent execution.',
    });

    const run = await service.trigger({
      taskId: task.id,
      type: 'agent',
      instructions: 'Use local workspace context before writing the note.',
      allowLocalWorkspaceRead: true,
    });
    const detail = await service.getDetail(run.id);
    const agentSessions = detail?.agentSessions ?? [];
    const steps = detail?.steps ?? [];
    const artifacts = await artifactRepository.listRecentForTask(task.id, 10);

    expect(run).toMatchObject({
      status: 'completed',
      output: 'Workspace alpha final note',
      outputSource: 'ai',
    });
    expect(detail).not.toBeNull();
    expect(agentSessions).toHaveLength(1);
    expect(agentSessions[0]).toMatchObject({
      status: 'completed',
      capabilities: expect.objectContaining({
        fileContext: true,
        taskMutationTools: false,
        structuredToolCalls: false,
      }),
    });
    expect(detail?.checkpoints).toEqual([]);
    expect(steps.some((step) =>
      step.kind === 'tool_result' &&
      step.output?.includes('docs/alpha.md: alpha workspace evidence')
    )).toBe(true);
    expect(steps.some((step) =>
      step.kind === 'tool_result' &&
      step.output?.includes('alpha workspace evidence')
    )).toBe(true);
    expect(steps.some((step) =>
      step.kind === 'decision' &&
      step.output?.includes('workspace.search [completed]')
    )).toBe(true);
    expect(artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'note',
          title: 'Workspace alpha note',
          content: 'Workspace alpha final note',
        }),
      ]),
    );
  });

  it('runs an opted-in task mutation agent path through persisted task detail', async () => {
    const taskRepository = new TaskRepository();
    const waitingItemRepository = new WaitingItemRepository();
    const artifactRepository = new ArtifactRepository();
    const sourceContextRepository = new SourceContextRepository();
    const processTemplateRepository = new ProcessTemplateRepository();
    const taskProcessBindingRepository = new TaskProcessBindingRepository();
    const blockerRepository = new BlockerRepository();
    const taskDependencyRepository = new TaskDependencyRepository();
    const completionCriteriaRepository = new CompletionCriteriaRepository();
    const runRepository = new RunRepository();
    const runStepRepository = new RunStepRepository();
    const runCheckpointRepository = new RunCheckpointRepository();
    const decisionRepository = new DecisionRepository();
    const taskService = new TaskService(
      taskRepository,
      waitingItemRepository,
      artifactRepository,
      sourceContextRepository,
      processTemplateRepository,
      taskProcessBindingRepository,
      blockerRepository,
      taskDependencyRepository,
      completionCriteriaRepository,
    );
    const agentToolRegistry = new AgentToolRegistry(
      artifactRepository,
      runStepRepository,
      runCheckpointRepository,
      decisionRepository,
      () => workspaceRoot,
      taskService,
    );
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'openai-compatible',
        model: 'local-alpha-model',
        apiKey: 'test-key',
      }),
    };
    const textExecutor = {
      execute: vi.fn().mockResolvedValue(JSON.stringify({
        finalOutput: 'Task next step updated by agent',
        steps: [
          {
            tool: 'task.update_next_step',
            input: { nextStep: 'Review the updated owner plan' },
          },
          {
            tool: 'artifact.create_note',
            input: {
              title: 'Task update note',
              content: 'Task next step updated by agent',
            },
          },
        ],
      })),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: 'No process template needed for task mutation alpha test.',
      }),
    };
    const service = new RunService(
      runRepository,
      taskService,
      artifactRepository,
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository,
      agentToolRegistry,
      runCheckpointRepository,
    );
    const task = await taskService.create({
      title: 'Task mutation alpha agent path',
      summary: 'Validate task mutation tool opt-in.',
    });

    const run = await service.trigger({
      taskId: task.id,
      type: 'agent',
      instructions: 'Update the task next step and write a note.',
      allowTaskMutationTools: true,
    });
    const detail = await service.getDetail(run.id);
    const taskDetail = await taskService.getDetail(task.id);
    const steps = detail?.steps ?? [];
    const agentSessions = detail?.agentSessions ?? [];
    const artifacts = await artifactRepository.listRecentForTask(task.id, 10);

    expect(run).toMatchObject({
      status: 'completed',
      output: 'Task next step updated by agent',
      outputSource: 'ai',
    });
    expect(taskDetail?.nextStep).toBe('审阅最新 agent 产物，并决定是否继续推进。');
    expect(agentSessions[0]).toMatchObject({
      status: 'completed',
      capabilities: expect.objectContaining({
        fileContext: false,
        taskMutationTools: true,
      }),
    });
    expect(taskDetail?.timeline.some((event) =>
      event.type === 'task.next_step_changed' &&
      event.payload.includes('Review the updated owner plan')
    )).toBe(true);
    expect(steps.some((step) =>
      step.kind === 'tool_result' &&
      step.output === 'Review the updated owner plan'
    )).toBe(true);
    expect(steps.some((step) =>
      step.kind === 'decision' &&
      step.output?.includes('task.update_next_step [completed]')
    )).toBe(true);
    expect(artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'note',
          title: 'Task update note',
          content: 'Task next step updated by agent',
        }),
      ]),
    );
  });

  it('runs an opted-in completion evidence review without closing the task', async () => {
    const taskRepository = new TaskRepository();
    const waitingItemRepository = new WaitingItemRepository();
    const artifactRepository = new ArtifactRepository();
    const sourceContextRepository = new SourceContextRepository();
    const processTemplateRepository = new ProcessTemplateRepository();
    const taskProcessBindingRepository = new TaskProcessBindingRepository();
    const blockerRepository = new BlockerRepository();
    const taskDependencyRepository = new TaskDependencyRepository();
    const completionCriteriaRepository = new CompletionCriteriaRepository();
    const runRepository = new RunRepository();
    const runStepRepository = new RunStepRepository();
    const runCheckpointRepository = new RunCheckpointRepository();
    const decisionRepository = new DecisionRepository();
    const taskService = new TaskService(
      taskRepository,
      waitingItemRepository,
      artifactRepository,
      sourceContextRepository,
      processTemplateRepository,
      taskProcessBindingRepository,
      blockerRepository,
      taskDependencyRepository,
      completionCriteriaRepository,
    );
    const agentToolRegistry = new AgentToolRegistry(
      artifactRepository,
      runStepRepository,
      runCheckpointRepository,
      decisionRepository,
      () => workspaceRoot,
      taskService,
    );
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'openai-compatible',
        model: 'local-alpha-model',
        apiKey: 'test-key',
      }),
    };
    const textExecutor = {
      execute: vi.fn().mockResolvedValue(JSON.stringify({
        finalOutput: 'Completion evidence reviewed by agent',
        steps: [
          {
            tool: 'task.review_completion_evidence',
          },
          {
            tool: 'artifact.create_note',
            input: {
              title: 'Completion evidence review',
              content: 'Completion evidence reviewed by agent',
            },
          },
        ],
      })),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: 'No process template needed for completion evidence review test.',
      }),
    };
    const service = new RunService(
      runRepository,
      taskService,
      artifactRepository,
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository,
      agentToolRegistry,
      runCheckpointRepository,
    );
    const task = await taskService.create({
      title: 'Completion evidence review agent path',
      summary: 'Validate read-only closeout review through RunService.',
    });
    await taskService.createCompletionCriteria({
      taskId: task.id,
      text: 'Owner approved the final result',
    });

    const run = await service.trigger({
      taskId: task.id,
      type: 'agent',
      instructions: 'Review completion evidence without closing the task.',
      allowTaskMutationTools: true,
    });
    const detail = await service.getDetail(run.id);
    const taskDetail = await taskService.getDetail(task.id);
    const steps = detail?.steps ?? [];
    const agentSessions = detail?.agentSessions ?? [];
    const artifacts = await artifactRepository.listRecentForTask(task.id, 10);

    expect(run).toMatchObject({
      status: 'completed',
      output: 'Completion evidence reviewed by agent',
      outputSource: 'ai',
    });
    expect(agentSessions[0]).toMatchObject({
      status: 'completed',
      capabilities: expect.objectContaining({
        taskMutationTools: true,
      }),
    });
    expect(taskDetail?.state).toBe('captured');
    expect(taskDetail?.completionCriteria).toEqual([
      expect.objectContaining({
        text: 'Owner approved the final result',
        status: 'open',
      }),
    ]);
    expect(steps.some((step) =>
      step.kind === 'tool_result' &&
      step.output?.includes('完成证据审查：只读结果')
    )).toBe(true);
    expect(steps.some((step) =>
      step.kind === 'decision' &&
      step.output?.includes('task.review_completion_evidence [completed]')
    )).toBe(true);
    expect(artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'note',
          title: 'Completion evidence review',
          content: 'Completion evidence reviewed by agent',
        }),
      ]),
    );
  });

  it('persists a provider-native structured agent session when the gate passes', async () => {
    const taskRepository = new TaskRepository();
    const waitingItemRepository = new WaitingItemRepository();
    const artifactRepository = new ArtifactRepository();
    const sourceContextRepository = new SourceContextRepository();
    const processTemplateRepository = new ProcessTemplateRepository();
    const taskProcessBindingRepository = new TaskProcessBindingRepository();
    const blockerRepository = new BlockerRepository();
    const taskDependencyRepository = new TaskDependencyRepository();
    const completionCriteriaRepository = new CompletionCriteriaRepository();
    const runRepository = new RunRepository();
    const runStepRepository = new RunStepRepository();
    const runCheckpointRepository = new RunCheckpointRepository();
    const decisionRepository = new DecisionRepository();
    const taskService = new TaskService(
      taskRepository,
      waitingItemRepository,
      artifactRepository,
      sourceContextRepository,
      processTemplateRepository,
      taskProcessBindingRepository,
      blockerRepository,
      taskDependencyRepository,
      completionCriteriaRepository,
    );
    const agentToolRegistry = new AgentToolRegistry(
      artifactRepository,
      runStepRepository,
      runCheckpointRepository,
      decisionRepository,
      () => workspaceRoot,
      taskService,
    );
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'openai-compatible',
        model: 'local-alpha-model',
        apiKey: 'test-key',
        featureFlags: {
          enableScheduler: false,
          enableProviderNativeToolCalls: true,
        },
      }),
    };
    const textExecutor = {
      execute: vi.fn(),
      executeWithResult: vi.fn().mockResolvedValue({
        text: '',
        providerPayload: {
          source: 'provider_response_body',
          provider: 'openai-compatible',
          model: 'local-alpha-model',
          rawSummary: 'choices=1; tool_calls=1',
          payload: {
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_provider_native_1',
                      type: 'function',
                      function: {
                        name: 'taskplane__artifact__create_note',
                        arguments: JSON.stringify({
                          title: 'Provider native note',
                          content: 'Provider native final output',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      }),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: 'No process template needed for provider-native persistence test.',
      }),
    };
    const service = new RunService(
      runRepository,
      taskService,
      artifactRepository,
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository,
      agentToolRegistry,
      runCheckpointRepository,
    );
    const task = await taskService.create({
      title: 'Provider native persisted session',
      summary: 'Validate provider-native agent session persistence.',
    });

    const run = await service.trigger({
      taskId: task.id,
      type: 'agent',
      instructions: 'Use provider-native tool calls if available.',
    });
    const detail = await service.getDetail(run.id);
    const agentSessions = detail?.agentSessions ?? [];
    const steps = detail?.steps ?? [];
    const artifacts = await artifactRepository.listRecentForTask(task.id, 10);

    expect(run).toMatchObject({
      status: 'completed',
      output: 'Provider native final output',
      outputSource: 'ai',
    });
    expect(agentSessions).toHaveLength(1);
    expect(agentSessions[0]).toMatchObject({
      status: 'completed',
      capabilities: expect.objectContaining({
        structuredToolCalls: true,
        textOnlyPlanning: false,
      }),
      metadata: expect.stringContaining('provider=openai-compatible'),
    });
    expect(agentSessions[0].metadata).toContain('providerCallIds=call_provider_native_1');
    expect(steps.some((step) =>
      step.kind === 'model' &&
      step.title === 'Provider 原生工具调用影子观察' &&
      step.output?.includes('providerCallCount=1')
    )).toBe(true);
    expect(steps.some((step) =>
      step.kind === 'plan' &&
      step.title === '采用模型提出的 agent 步骤计划' &&
      step.input?.includes('artifact.create_note')
    )).toBe(true);
    expect(artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'note',
          title: 'Provider native note',
          content: 'Provider native final output',
        }),
      ]),
    );
  });

  it('falls back to a text-only agent session when the provider payload is missing', async () => {
    const taskRepository = new TaskRepository();
    const waitingItemRepository = new WaitingItemRepository();
    const artifactRepository = new ArtifactRepository();
    const sourceContextRepository = new SourceContextRepository();
    const processTemplateRepository = new ProcessTemplateRepository();
    const taskProcessBindingRepository = new TaskProcessBindingRepository();
    const blockerRepository = new BlockerRepository();
    const taskDependencyRepository = new TaskDependencyRepository();
    const completionCriteriaRepository = new CompletionCriteriaRepository();
    const runRepository = new RunRepository();
    const runStepRepository = new RunStepRepository();
    const runCheckpointRepository = new RunCheckpointRepository();
    const decisionRepository = new DecisionRepository();
    const taskService = new TaskService(
      taskRepository,
      waitingItemRepository,
      artifactRepository,
      sourceContextRepository,
      processTemplateRepository,
      taskProcessBindingRepository,
      blockerRepository,
      taskDependencyRepository,
      completionCriteriaRepository,
    );
    const agentToolRegistry = new AgentToolRegistry(
      artifactRepository,
      runStepRepository,
      runCheckpointRepository,
      decisionRepository,
      () => workspaceRoot,
      taskService,
    );
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'openai-compatible',
        model: 'local-alpha-model',
        apiKey: 'test-key',
        featureFlags: {
          enableScheduler: false,
          enableProviderNativeToolCalls: true,
        },
      }),
    };
    const textExecutor = {
      execute: vi.fn(),
      executeWithResult: vi.fn().mockResolvedValue({
        text: 'Text-only fallback output',
        providerPayload: null,
      }),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: 'No process template needed for provider-native fallback test.',
      }),
    };
    const service = new RunService(
      runRepository,
      taskService,
      artifactRepository,
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository,
      agentToolRegistry,
      runCheckpointRepository,
    );
    const task = await taskService.create({
      title: 'Provider native missing payload fallback',
      summary: 'Validate text-only fallback when no provider payload exists.',
    });

    const run = await service.trigger({
      taskId: task.id,
      type: 'agent',
      instructions: 'Fall back when native payload is unavailable.',
    });
    const detail = await service.getDetail(run.id);
    const agentSessions = detail?.agentSessions ?? [];
    const steps = detail?.steps ?? [];

    expect(run).toMatchObject({
      status: 'completed',
      output: 'Text-only fallback output',
      outputSource: 'ai',
    });
    expect(agentSessions).toHaveLength(1);
    expect(agentSessions[0]).toMatchObject({
      status: 'completed',
      capabilities: expect.objectContaining({
        structuredToolCalls: false,
        textOnlyPlanning: true,
      }),
      metadata: 'executor=local_agent\nloop=local_note\nsandboxCoding=disabled\nsandboxProvider=disabled\nsandboxPromotion=decision_required',
    });
    expect(steps.some((step) => step.title === 'Provider 原生工具调用影子观察')).toBe(false);
  });

  it('falls back inside the provider-native session when policy denies a task tool', async () => {
    const taskRepository = new TaskRepository();
    const waitingItemRepository = new WaitingItemRepository();
    const artifactRepository = new ArtifactRepository();
    const sourceContextRepository = new SourceContextRepository();
    const processTemplateRepository = new ProcessTemplateRepository();
    const taskProcessBindingRepository = new TaskProcessBindingRepository();
    const blockerRepository = new BlockerRepository();
    const taskDependencyRepository = new TaskDependencyRepository();
    const completionCriteriaRepository = new CompletionCriteriaRepository();
    const runRepository = new RunRepository();
    const runStepRepository = new RunStepRepository();
    const runCheckpointRepository = new RunCheckpointRepository();
    const decisionRepository = new DecisionRepository();
    const taskService = new TaskService(
      taskRepository,
      waitingItemRepository,
      artifactRepository,
      sourceContextRepository,
      processTemplateRepository,
      taskProcessBindingRepository,
      blockerRepository,
      taskDependencyRepository,
      completionCriteriaRepository,
    );
    const agentToolRegistry = new AgentToolRegistry(
      artifactRepository,
      runStepRepository,
      runCheckpointRepository,
      decisionRepository,
      () => workspaceRoot,
      taskService,
    );
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'openai-compatible',
        model: 'local-alpha-model',
        apiKey: 'test-key',
        featureFlags: {
          enableScheduler: false,
          enableProviderNativeToolCalls: true,
        },
      }),
    };
    const textExecutor = {
      execute: vi.fn(),
      executeWithResult: vi.fn().mockResolvedValue({
        text: 'Denied task mutation fallback output',
        providerPayload: {
          source: 'provider_response_body',
          provider: 'openai-compatible',
          model: 'local-alpha-model',
          rawSummary: 'choices=1; tool_calls=1',
          payload: {
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Denied task mutation fallback output',
                  tool_calls: [
                    {
                      id: 'call_denied_task_tool_1',
                      type: 'function',
                      function: {
                        name: 'taskplane__task__update_next_step',
                        arguments: JSON.stringify({
                          nextStep: 'This should not be persisted',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      }),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: 'No process template needed for provider-native policy fallback test.',
      }),
    };
    const service = new RunService(
      runRepository,
      taskService,
      artifactRepository,
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository,
      agentToolRegistry,
      runCheckpointRepository,
    );
    const task = await taskService.create({
      title: 'Provider native denied task tool',
      summary: 'Validate policy fallback for provider-native task tools.',
    });

    const run = await service.trigger({
      taskId: task.id,
      type: 'agent',
      instructions: 'Do not opt into task mutation tools.',
    });
    const detail = await service.getDetail(run.id);
    const taskDetail = await taskService.getDetail(task.id);
    const agentSessions = detail?.agentSessions ?? [];
    const steps = detail?.steps ?? [];
    const artifacts = await artifactRepository.listRecentForTask(task.id, 10);

    expect(run).toMatchObject({
      status: 'completed',
      output: 'Denied task mutation fallback output',
      outputSource: 'ai',
    });
    expect(taskDetail?.nextStep).toBe('审阅最新 agent 产物，并决定是否继续推进。');
    expect(taskDetail?.timeline.some((event) =>
      event.type === 'task.next_step_changed' &&
      event.payload.includes('This should not be persisted')
    )).toBe(false);
    expect(agentSessions[0]).toMatchObject({
      status: 'completed',
      capabilities: expect.objectContaining({
        structuredToolCalls: true,
        taskMutationTools: false,
      }),
    });
    expect(steps.some((step) =>
      step.kind === 'plan' &&
      step.title === '采用保守 fallback agent 步骤计划' &&
      step.input?.includes('task.update_next_step')
    )).toBe(true);
    expect(artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'note',
          title: 'Provider native denied task tool agent note',
          content: 'Denied task mutation fallback output',
        }),
      ]),
    );
  });

  it('falls back inside the provider-native session when workspace write or command tools are proposed', async () => {
    fs.writeFileSync(path.join(workspaceRoot, 'notes.md'), 'alpha\n');

    const taskRepository = new TaskRepository();
    const waitingItemRepository = new WaitingItemRepository();
    const artifactRepository = new ArtifactRepository();
    const sourceContextRepository = new SourceContextRepository();
    const processTemplateRepository = new ProcessTemplateRepository();
    const taskProcessBindingRepository = new TaskProcessBindingRepository();
    const blockerRepository = new BlockerRepository();
    const taskDependencyRepository = new TaskDependencyRepository();
    const completionCriteriaRepository = new CompletionCriteriaRepository();
    const runRepository = new RunRepository();
    const runStepRepository = new RunStepRepository();
    const runCheckpointRepository = new RunCheckpointRepository();
    const decisionRepository = new DecisionRepository();
    const taskService = new TaskService(
      taskRepository,
      waitingItemRepository,
      artifactRepository,
      sourceContextRepository,
      processTemplateRepository,
      taskProcessBindingRepository,
      blockerRepository,
      taskDependencyRepository,
      completionCriteriaRepository,
    );
    const agentToolRegistry = new AgentToolRegistry(
      artifactRepository,
      runStepRepository,
      runCheckpointRepository,
      decisionRepository,
      () => workspaceRoot,
      taskService,
    );
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'openai-compatible',
        model: 'local-alpha-model',
        apiKey: 'test-key',
        featureFlags: {
          enableScheduler: false,
          enableProviderNativeToolCalls: true,
        },
      }),
    };
    const textExecutor = {
      execute: vi.fn(),
      executeWithResult: vi.fn().mockResolvedValue({
        text: 'Denied workspace tool fallback output',
        providerPayload: {
          source: 'provider_response_body',
          provider: 'openai-compatible',
          model: 'local-alpha-model',
          rawSummary: 'choices=1; tool_calls=2',
          payload: {
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  content: 'Denied workspace tool fallback output',
                  tool_calls: [
                    {
                      id: 'call_denied_patch_1',
                      type: 'function',
                      function: {
                        name: 'taskplane__workspace__write_patch',
                        arguments: JSON.stringify({
                          summary: 'Update notes',
                          expectedFiles: ['notes.md'],
                          patch: [
                            '*** Begin Patch',
                            '*** Update File: notes.md',
                            '@@',
                            '-alpha',
                            '+beta',
                            '*** End Patch',
                          ].join('\n'),
                        }),
                      },
                    },
                    {
                      id: 'call_denied_command_1',
                      type: 'function',
                      function: {
                        name: 'taskplane__workspace__run_command',
                        arguments: JSON.stringify({
                          summary: 'Run tests',
                          script: 'test',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      }),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: false,
        selectedTemplates: [],
        reason: 'No process template needed for provider-native workspace policy fallback test.',
      }),
    };
    const service = new RunService(
      runRepository,
      taskService,
      artifactRepository,
      aiConfigService as never,
      textExecutor as never,
      processTemplateSelector as never,
      runStepRepository,
      agentToolRegistry,
      runCheckpointRepository,
    );
    const task = await taskService.create({
      title: 'Provider native denied workspace tools',
      summary: 'Validate policy fallback for provider-native workspace write and command tools.',
    });

    const run = await service.trigger({
      taskId: task.id,
      type: 'agent',
      instructions: 'Do not expose workspace write or command tools.',
    });
    const detail = await service.getDetail(run.id);
    const agentSessions = detail?.agentSessions ?? [];
    const steps = detail?.steps ?? [];
    const artifacts = await artifactRepository.listRecentForTask(task.id, 10);
    const checkpoints = await runCheckpointRepository.listForRun(run.id);

    expect(run).toMatchObject({
      status: 'completed',
      output: 'Denied workspace tool fallback output',
      outputSource: 'ai',
    });
    expect(fs.readFileSync(path.join(workspaceRoot, 'notes.md'), 'utf8')).toBe('alpha\n');
    expect(checkpoints).toEqual([]);
    expect(agentSessions[0]).toMatchObject({
      status: 'completed',
      capabilities: expect.objectContaining({
        structuredToolCalls: true,
        fileContext: false,
        taskMutationTools: false,
      }),
    });
    expect(steps.some((step) =>
      step.kind === 'plan' &&
      step.title === '采用保守 fallback agent 步骤计划' &&
      step.input?.includes('workspace.write_patch') &&
      step.input?.includes('workspace.run_command')
    )).toBe(true);
    expect(artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'note',
          title: 'Provider native denied workspace tools agent note',
          content: 'Denied workspace tool fallback output',
        }),
      ]),
    );
  });
});
