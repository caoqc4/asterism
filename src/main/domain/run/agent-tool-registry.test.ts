import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { AgentPolicy, AgentWorkingContext } from '../../../shared/types/agent-execution.js';
import type { RunStepKind, RunStepStatus } from '../../../shared/types/run.js';
import { makeTempDir } from '../../test-utils.js';
import { AgentToolRegistry } from './agent-tool-registry.js';

function buildWorkingContext(): AgentWorkingContext {
  return {
    task: {
      id: 'task_1',
      title: 'Inspect agent context',
      summary: 'Context summary',
      state: 'running',
      nextStep: 'Review the context',
      riskLevel: 'medium',
      riskNote: 'Needs attention',
    },
    priorityLane: 'continue_or_review',
    resumeSummary: 'Ready to continue with context inspection.',
    completion: {
      total: 2,
      satisfied: 1,
      open: 1,
      nextOpenCriterion: 'Confirm output quality',
    },
    blockers: [{ title: 'Legal review', detail: null, owner: 'Legal' }],
    dependencies: [{ title: 'Upstream research', detail: 'Waiting for notes' }],
    sources: [
      {
        title: 'Key brief',
        kind: 'note',
        isKey: true,
        note: 'Most important source',
        contentPreview: 'Brief content',
      },
    ],
    processTemplates: [
      {
        id: 'process_template_1',
        title: 'Review checklist',
        kind: 'checklist',
        summary: 'Review output quality',
      },
    ],
    recentTimeline: [
      {
        type: 'task.next_step_changed',
        summary: '下一步调整为 Review the context',
        createdAt: '2026-01-01T01:00:00.000Z',
        dateGroup: '2026-01-01',
        objectFamily: '任务字段',
        priorityGroup: '解释事件',
      },
    ],
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
      input?: string | null;
      output?: string | null;
      error?: string | null;
    }) => {
      stepCount += 1;
      return {
        id: `run_step_${stepCount}`,
        runId: input.runId,
        index: stepCount,
        kind: input.kind,
        status: input.status ?? 'completed',
        title: input.title,
        input: input.input ?? null,
        output: input.output ?? null,
        error: input.error ?? null,
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
      index: 1,
      kind: 'tool_call',
      status: input.status,
      title: '调用工具：artifact.create_note',
      input: null,
      output: input.output ?? null,
      error: input.error ?? null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
  };
}

function buildRunCheckpointRepositoryMock() {
  return {
    create: vi.fn().mockImplementation(async (input: { payload?: string | null }) => ({
      id: 'run_checkpoint_1',
      runId: 'run_1',
      stepId: 'run_step_1',
      kind: 'tool_permission',
      status: 'open',
      payload: input.payload ?? null,
      createdAt: '2026-01-01T00:00:00.000Z',
      resolvedAt: null,
    })),
    updatePayload: vi.fn().mockImplementation(async (_id: string, payload: string | null) => ({
      id: 'run_checkpoint_1',
      runId: 'run_1',
      stepId: 'run_step_1',
      kind: 'tool_permission',
      status: 'open',
      payload,
      createdAt: '2026-01-01T00:00:00.000Z',
      resolvedAt: null,
    })),
  };
}

function buildDecisionRepositoryMock() {
  return {
    create: vi.fn().mockResolvedValue({
      id: 'decision_1',
      taskId: 'task_1',
      title: '确认本地写入：artifact.create_note',
      status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
  };
}

describe('AgentToolRegistry', () => {
  it('lists read-only context inspection before write tools', () => {
    const registry = new AgentToolRegistry({} as never, buildRunStepRepositoryMock() as never);

    expect(registry.list()).toEqual([
      expect.objectContaining({
        name: 'task.inspect_context',
        risk: 'safe_read',
        requiresConfirmation: false,
      }),
      expect.objectContaining({
        name: 'task.inspect_timeline',
        risk: 'safe_read',
        requiresConfirmation: false,
      }),
      expect.objectContaining({
        name: 'task.review_completion_evidence',
        risk: 'safe_read',
        requiresConfirmation: false,
      }),
      expect.objectContaining({
        name: 'task.update_next_step',
        risk: 'local_write',
        requiresConfirmation: false,
      }),
      expect.objectContaining({
        name: 'task.create_completion_criterion',
        risk: 'local_write',
        requiresConfirmation: false,
      }),
      expect.objectContaining({
        name: 'artifact.create_note',
        risk: 'local_write',
      }),
      expect.objectContaining({
        name: 'decision.draft',
        risk: 'local_write',
        requiresConfirmation: false,
      }),
      expect.objectContaining({
        name: 'source_context.create',
        risk: 'local_write',
        requiresConfirmation: false,
      }),
      expect.objectContaining({
        name: 'workspace.search',
        risk: 'safe_read',
        requiresConfirmation: false,
      }),
      expect.objectContaining({
        name: 'workspace.read_file',
        risk: 'safe_read',
        requiresConfirmation: false,
      }),
      expect.objectContaining({
        name: 'workspace.run_command',
        risk: 'local_command',
        requiresConfirmation: true,
      }),
      expect.objectContaining({
        name: 'workspace.write_patch',
        risk: 'local_write',
        requiresConfirmation: true,
      }),
    ]);
  });

  it('inspects the current working context as a read-only tool', async () => {
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry({} as never, runStepRepository as never);

    const result = await registry.execute(
      'task.inspect_context',
      {},
      {
        runId: 'run_1',
        taskId: 'task_1',
        workingContext: buildWorkingContext(),
      },
    );

    expect(result).toMatchObject({
      success: true,
      status: 'completed',
      summary: '已读取当前任务上下文摘要。',
    });
    expect(result.output).toContain('任务：Inspect agent context');
    expect(result.output).toContain('关键来源：Key brief');
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({ status: 'completed' }),
    );
    expect(runStepRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'tool_result', status: 'completed' }),
    );
  });

  it('inspects recent timeline events as a read-only tool', async () => {
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry({} as never, runStepRepository as never);

    const result = await registry.execute(
      'task.inspect_timeline',
      {},
      {
        runId: 'run_1',
        taskId: 'task_1',
        workingContext: buildWorkingContext(),
      },
    );

    expect(result).toMatchObject({
      success: true,
      status: 'completed',
      summary: '已读取当前任务最近时间线。',
    });
    expect(result.output).toContain('task.next_step_changed');
    expect(result.output).toContain('2026-01-01 / 任务字段 / 解释事件');
    expect(result.output).toContain('下一步调整为 Review the context');
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('reviews completion evidence without mutating task closeout state', async () => {
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry({} as never, runStepRepository as never);

    const result = await registry.execute(
      'task.review_completion_evidence',
      {},
      {
        runId: 'run_1',
        taskId: 'task_1',
        workingContext: {
          ...buildWorkingContext(),
          blockers: [],
          dependencies: [],
          recentTimeline: [
            {
              type: 'task.decision_approved',
              summary: '已批准最终收尾依据。',
              createdAt: '2026-01-01T02:00:00.000Z',
              dateGroup: '2026-01-01',
              objectFamily: '决策',
              priorityGroup: '关键事件',
            },
            {
              type: 'task.next_step_changed',
              summary: '下一步调整为 Review the context',
              createdAt: '2026-01-01T01:00:00.000Z',
              dateGroup: '2026-01-01',
              objectFamily: '任务字段',
              priorityGroup: '解释事件',
            },
          ],
        },
      },
    );

    expect(result).toMatchObject({
      success: true,
      status: 'completed',
      summary: '已审查完成证据；未修改完成标准或任务状态。',
    });
    expect(result.output).toContain('完成证据审查：只读结果，不会满足完成标准或完成任务。');
    expect(result.output).toContain('仍需补证据或人工确认：Confirm output quality');
    expect(result.output).toContain('task.decision_approved');
    expect(result.output).toContain('2026-01-01 / 决策 / 关键事件');
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({
        status: 'completed',
        output: '已审查完成证据；未修改完成标准或任务状态。',
      }),
    );
  });

  it('updates the current task next step through TaskService', async () => {
    const taskService = {
      update: vi.fn().mockResolvedValue({
        id: 'task_1',
        title: 'Inspect agent context',
        summary: null,
        state: 'running',
        nextStep: 'Review the agent output with the owner',
        waitingReason: null,
        riskLevel: 'none',
        riskNote: null,
        activeWaitingItem: null,
        activeBlocker: null,
        activeDependency: null,
        dependencyReevaluation: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:01:00.000Z',
      }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry(
      {} as never,
      runStepRepository as never,
      undefined,
      null,
      undefined,
      taskService as never,
    );

    const result = await registry.execute(
      'task.update_next_step',
      { nextStep: ' Review the agent output with the owner ' },
      { runId: 'run_1', taskId: 'task_1' },
    );

    expect(result).toMatchObject({
      success: true,
      status: 'completed',
      summary: '已更新任务下一步：Review the agent output with the owner',
      output: 'Review the agent output with the owner',
    });
    expect(taskService.update).toHaveBeenCalledWith({
      id: 'task_1',
      nextStep: 'Review the agent output with the owner',
    });
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({
        status: 'completed',
        output: '已更新任务下一步：Review the agent output with the owner',
      }),
    );
    expect(runStepRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'tool_result',
        status: 'completed',
        output: 'Review the agent output with the owner',
      }),
    );
  });

  it('records task next-step validation failures as tool result failures', async () => {
    const taskService = {
      update: vi.fn(),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry(
      {} as never,
      runStepRepository as never,
      undefined,
      null,
      undefined,
      taskService as never,
    );

    const result = await registry.execute(
      'task.update_next_step',
      { nextStep: '   ' },
      { runId: 'run_1', taskId: 'task_1' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('task.update_next_step requires nextStep.');
    expect(taskService.update).not.toHaveBeenCalled();
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({
        status: 'failed',
        error: 'task.update_next_step requires nextStep.',
      }),
    );
  });

  it('drafts a decision through DecisionService without creating a formal Decision', async () => {
    const decisionDraftService = {
      draft: vi.fn().mockResolvedValue({
        taskId: 'task_1',
        title: 'Approve launch wording',
        rationale: 'Need a formal sign-off before publishing.',
        source: 'fallback',
        selectedTemplateIds: [],
        selectedTemplateTitles: [],
        selectionReason: 'No template selected.',
      }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry(
      {} as never,
      runStepRepository as never,
    );
    registry.setDecisionDraftService(decisionDraftService);

    const result = await registry.execute(
      'decision.draft',
      { note: ' Need launch wording approval ' },
      { runId: 'run_1', taskId: 'task_1' },
    );

    expect(result).toMatchObject({
      success: true,
      status: 'completed',
      summary: '已草拟 Decision：Approve launch wording',
    });
    expect(result.output).toContain('Title: Approve launch wording');
    expect(result.output).toContain('Source: fallback');
    expect(decisionDraftService.draft).toHaveBeenCalledWith({
      taskId: 'task_1',
      note: 'Need launch wording approval',
    });
    expect(runStepRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'tool_result',
        status: 'completed',
        output: expect.stringContaining('Rationale: Need a formal sign-off before publishing.'),
      }),
    );
  });

  it('records decision draft service failures as tool result failures', async () => {
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry(
      {} as never,
      runStepRepository as never,
    );

    const result = await registry.execute(
      'decision.draft',
      { note: 'Need approval' },
      { runId: 'run_1', taskId: 'task_1' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('decision.draft requires DecisionService.');
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({
        status: 'failed',
        error: 'decision.draft requires DecisionService.',
      }),
    );
  });

  it('creates a source context item through TaskService', async () => {
    const taskService = {
      update: vi.fn(),
      createCompletionCriteria: vi.fn(),
      createSourceContext: vi.fn().mockResolvedValue({
        id: 'source_context_1',
        taskId: 'task_1',
        title: 'Owner notes',
        kind: 'note',
        isKey: true,
        uri: null,
        content: 'Owner wants a shorter draft',
        note: 'Use this as the next source',
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
      }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry(
      {} as never,
      runStepRepository as never,
      undefined,
      null,
      undefined,
      taskService as never,
    );

    const result = await registry.execute(
      'source_context.create',
      {
        title: ' Owner notes ',
        isKey: true,
        content: 'Owner wants a shorter draft',
        note: 'Use this as the next source',
      },
      { runId: 'run_1', taskId: 'task_1' },
    );

    expect(result).toMatchObject({
      success: true,
      status: 'completed',
      summary: '已创建来源上下文：Owner notes',
      output: 'Use this as the next source',
    });
    expect(taskService.createSourceContext).toHaveBeenCalledWith({
      taskId: 'task_1',
      title: 'Owner notes',
      kind: 'note',
      isKey: true,
      uri: undefined,
      content: 'Owner wants a shorter draft',
      note: 'Use this as the next source',
    });
    expect(runStepRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'tool_result',
        status: 'completed',
        output: 'Use this as the next source',
      }),
    );
  });

  it('records source context validation failures as tool result failures', async () => {
    const taskService = {
      update: vi.fn(),
      createCompletionCriteria: vi.fn(),
      createSourceContext: vi.fn(),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry(
      {} as never,
      runStepRepository as never,
      undefined,
      null,
      undefined,
      taskService as never,
    );

    const result = await registry.execute(
      'source_context.create',
      { title: 'Source', kind: 'unsupported' },
      { runId: 'run_1', taskId: 'task_1' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('source_context.create received unsupported kind: unsupported');
    expect(taskService.createSourceContext).not.toHaveBeenCalled();
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({
        status: 'failed',
        error: 'source_context.create received unsupported kind: unsupported',
      }),
    );
  });

  it('creates a completion criterion through TaskService', async () => {
    const taskService = {
      update: vi.fn(),
      createCompletionCriteria: vi.fn().mockResolvedValue({
        id: 'criteria_1',
        taskId: 'task_1',
        text: 'Owner has reviewed the final draft',
        verificationResponsibility: null,
        verificationResponsibilityLabel: null,
        status: 'open',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        satisfiedAt: null,
      }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry(
      {} as never,
      runStepRepository as never,
      undefined,
      null,
      undefined,
      taskService as never,
    );

    const result = await registry.execute(
      'task.create_completion_criterion',
      { text: ' Owner has reviewed the final draft ' },
      { runId: 'run_1', taskId: 'task_1' },
    );

    expect(result).toMatchObject({
      success: true,
      status: 'completed',
      summary: '已创建完成标准：Owner has reviewed the final draft',
      output: 'Owner has reviewed the final draft',
    });
    expect(taskService.createCompletionCriteria).toHaveBeenCalledWith({
      taskId: 'task_1',
      text: 'Owner has reviewed the final draft',
    });
    expect(runStepRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'tool_result',
        status: 'completed',
        output: 'Owner has reviewed the final draft',
      }),
    );
  });

  it('creates a confirmation checkpoint before adding completion criteria on high-risk tasks', async () => {
    const taskService = {
      update: vi.fn(),
      createCompletionCriteria: vi.fn(),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const runCheckpointRepository = buildRunCheckpointRepositoryMock();
    const decisionRepository = buildDecisionRepositoryMock();
    const registry = new AgentToolRegistry(
      {} as never,
      runStepRepository as never,
      runCheckpointRepository as never,
      decisionRepository as never,
      undefined,
      taskService as never,
    );
    const workingContext = buildWorkingContext();

    const result = await registry.execute(
      'task.create_completion_criterion',
      { text: ' Owner must approve the launch claim ' },
      {
        runId: 'run_1',
        taskId: 'task_1',
        workingContext: {
          ...workingContext,
          task: {
            ...workingContext.task,
            riskLevel: 'high',
          },
        },
      },
      {
        maxSteps: 8,
        maxWallTimeMs: 120_000,
        allowNetwork: false,
        allowLocalWorkspaceRead: false,
        allowLocalFileWrite: false,
        confirmationRequiredRisks: [],
      },
    );

    expect(result).toMatchObject({
      success: false,
      status: 'needs_confirmation',
      checkpointId: 'run_checkpoint_1',
      checkpointKind: 'tool_permission',
      decisionId: 'decision_1',
    });
    expect(taskService.createCompletionCriteria).not.toHaveBeenCalled();
    expect(decisionRepository.create).toHaveBeenCalledWith({
      taskId: 'task_1',
      title: '确认本地写入：task.create_completion_criterion',
      sourceType: 'agent_checkpoint',
      sourceId: 'run_checkpoint_1',
      sourceLabel: 'task.create_completion_criterion',
    });
    const payload = JSON.parse(runCheckpointRepository.updatePayload.mock.calls[0][1]);
    expect(payload).toMatchObject({
      version: 1,
      kind: 'tool_permission',
      tool: 'task.create_completion_criterion',
      risk: 'local_write',
      input: { text: 'Owner must approve the launch claim' },
      decisionId: 'decision_1',
      decisionTitle: '确认本地写入：task.create_completion_criterion',
    });
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({
        status: 'skipped',
        output: expect.stringContaining('需要确认后才能继续'),
      }),
    );
    expect(runStepRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: 'checkpoint',
        status: 'pending',
        title: '等待确认：task.create_completion_criterion',
      }),
    );
  });

  it('records completion criterion validation failures as tool result failures', async () => {
    const taskService = {
      update: vi.fn(),
      createCompletionCriteria: vi.fn(),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry(
      {} as never,
      runStepRepository as never,
      undefined,
      null,
      undefined,
      taskService as never,
    );

    const result = await registry.execute(
      'task.create_completion_criterion',
      { text: '   ' },
      { runId: 'run_1', taskId: 'task_1' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('task.create_completion_criterion requires text.');
    expect(taskService.createCompletionCriteria).not.toHaveBeenCalled();
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({
        status: 'failed',
        error: 'task.create_completion_criterion requires text.',
      }),
    );
  });

  it('creates a note artifact and writes tool call/result steps', async () => {
    const artifactRepository = {
      createNoteFromRun: vi.fn().mockResolvedValue({
        id: 'artifact_1',
        title: 'Agent note',
        content: 'Captured note',
      }),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry(
      artifactRepository as never,
      runStepRepository as never,
    );

    const result = await registry.execute(
      'artifact.create_note',
      { title: 'Agent note', content: 'Captured note' },
      { runId: 'run_1', taskId: 'task_1' },
    );

    expect(result).toMatchObject({
      success: true,
      artifactId: 'artifact_1',
      output: 'Captured note',
    });
    expect(artifactRepository.createNoteFromRun).toHaveBeenCalledWith({
      taskId: 'task_1',
      runId: 'run_1',
      title: 'Agent note',
      content: 'Captured note',
    });
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: 'tool_call', status: 'running' }),
    );
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({ status: 'completed' }),
    );
    expect(runStepRepository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: 'tool_result', status: 'completed' }),
    );
  });

  it('records failed tool validation as tool result failure', async () => {
    const artifactRepository = {
      createNoteFromRun: vi.fn(),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry(
      artifactRepository as never,
      runStepRepository as never,
    );

    const result = await registry.execute(
      'artifact.create_note',
      { title: '', content: '' },
      { runId: 'run_1', taskId: 'task_1' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('artifact.create_note requires a title.');
    expect(artifactRepository.createNoteFromRun).not.toHaveBeenCalled();
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({
        status: 'failed',
        error: 'artifact.create_note requires a title.',
      }),
    );
    expect(runStepRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'tool_result', status: 'failed' }),
    );
  });

  it('creates a checkpoint instead of executing when policy requires confirmation', async () => {
    const artifactRepository = {
      createNoteFromRun: vi.fn(),
    };
    const runStepRepository = buildRunStepRepositoryMock();
    const runCheckpointRepository = buildRunCheckpointRepositoryMock();
    const decisionRepository = buildDecisionRepositoryMock();
    const registry = new AgentToolRegistry(
      artifactRepository as never,
      runStepRepository as never,
      runCheckpointRepository as never,
      decisionRepository as never,
    );

    const result = await registry.execute(
      'artifact.create_note',
      { title: 'Agent note', content: 'Captured note' },
      { runId: 'run_1', taskId: 'task_1' },
      {
        maxSteps: 8,
        maxWallTimeMs: 120_000,
        allowNetwork: false,
        allowLocalWorkspaceRead: false,
        allowLocalFileWrite: false,
        confirmationRequiredRisks: ['local_write'],
      },
    );

    expect(result).toMatchObject({
      success: false,
      status: 'needs_confirmation',
      checkpointId: 'run_checkpoint_1',
      checkpointKind: 'tool_permission',
      decisionId: 'decision_1',
    });
    expect(artifactRepository.createNoteFromRun).not.toHaveBeenCalled();
    expect(decisionRepository.create).toHaveBeenCalledWith({
      taskId: 'task_1',
      title: '确认本地写入：artifact.create_note',
      sourceType: 'agent_checkpoint',
      sourceId: 'run_checkpoint_1',
      sourceLabel: 'artifact.create_note',
    });
    expect(runCheckpointRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'tool_permission',
      }),
    );
    expect(runCheckpointRepository.updatePayload).toHaveBeenCalledWith(
      'run_checkpoint_1',
      expect.stringContaining('"decisionId":"decision_1"'),
    );
    expect(runStepRepository.update).toHaveBeenCalledWith(
      'run_step_1',
      expect.objectContaining({
        status: 'skipped',
        output: '工具 artifact.create_note 需要确认后才能继续，已创建 Decision：确认本地写入：artifact.create_note。',
      }),
    );
    expect(runStepRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'checkpoint', status: 'pending' }),
    );
  });

  it('searches and reads workspace files only when workspace read policy is enabled', async () => {
    const tempRoot = makeTempDir('taskplane-agent-workspace-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'alpha\nneedle line\n');
      fs.mkdirSync(path.join(tempRoot, 'src'));
      fs.writeFileSync(path.join(tempRoot, 'src', 'app.ts'), 'const value = "needle";\n');

      const runStepRepository = buildRunStepRepositoryMock();
      const registry = new AgentToolRegistry(
        {} as never,
        runStepRepository as never,
        undefined,
        null,
        () => tempRoot,
      );
      const policy: AgentPolicy = {
        maxSteps: 8,
        maxWallTimeMs: 120_000,
        allowNetwork: false,
        allowLocalWorkspaceRead: true,
        allowLocalFileWrite: false,
        confirmationRequiredRisks: ['local_write', 'external_write', 'sensitive'],
      };

      const searchResult = await registry.execute(
        'workspace.search',
        { query: 'needle', maxResults: 2 },
        { runId: 'run_1', taskId: 'task_1' },
        policy,
      );
      const readResult = await registry.execute(
        'workspace.read_file',
        { path: 'notes.md' },
        { runId: 'run_1', taskId: 'task_1' },
        policy,
      );

      expect(searchResult).toMatchObject({
        success: true,
        status: 'completed',
        summary: '工作区搜索找到 2 条结果。',
      });
      expect(searchResult.output).toContain('notes.md: needle line');
      expect(searchResult.output).toContain('src/app.ts: const value = "needle";');
      expect(readResult).toMatchObject({
        success: true,
        status: 'completed',
        output: 'alpha\nneedle line\n',
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks workspace reads by default and prevents path escape', async () => {
    const tempRoot = makeTempDir('taskplane-agent-workspace-blocked-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'safe content');
      const runStepRepository = buildRunStepRepositoryMock();
      const registry = new AgentToolRegistry(
        {} as never,
        runStepRepository as never,
        undefined,
        null,
        () => tempRoot,
      );

      const blocked = await registry.execute(
        'workspace.read_file',
        { path: 'notes.md' },
        { runId: 'run_1', taskId: 'task_1' },
      );
      const escaped = await registry.execute(
        'workspace.read_file',
        { path: '../outside.md' },
        { runId: 'run_1', taskId: 'task_1' },
        {
          maxSteps: 8,
          maxWallTimeMs: 120_000,
          allowNetwork: false,
          allowLocalWorkspaceRead: true,
          allowLocalFileWrite: false,
          confirmationRequiredRisks: ['local_write', 'external_write', 'sensitive'],
        },
      );

      expect(blocked.success).toBe(false);
      expect(blocked.error).toBe('workspace.read_file requires allowLocalWorkspaceRead policy.');
      expect(escaped.success).toBe(false);
      expect(escaped.error).toBe('Workspace path must stay inside the configured workspace root.');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('resolves the workspace root again for each workspace tool call', async () => {
    const firstRoot = makeTempDir('taskplane-agent-workspace-first-');
    const secondRoot = makeTempDir('taskplane-agent-workspace-second-');
    let currentRoot = firstRoot;

    try {
      fs.writeFileSync(path.join(firstRoot, 'notes.md'), 'first workspace note');
      fs.writeFileSync(path.join(secondRoot, 'notes.md'), 'second workspace note');

      const runStepRepository = buildRunStepRepositoryMock();
      const registry = new AgentToolRegistry(
        {} as never,
        runStepRepository as never,
        undefined,
        null,
        () => currentRoot,
      );
      const policy: AgentPolicy = {
        maxSteps: 8,
        maxWallTimeMs: 120_000,
        allowNetwork: false,
        allowLocalWorkspaceRead: true,
        allowLocalFileWrite: false,
        confirmationRequiredRisks: ['local_write', 'external_write', 'sensitive'],
      };

      const firstRead = await registry.execute(
        'workspace.read_file',
        { path: 'notes.md' },
        { runId: 'run_1', taskId: 'task_1' },
        policy,
      );
      currentRoot = secondRoot;
      const secondRead = await registry.execute(
        'workspace.read_file',
        { path: 'notes.md' },
        { runId: 'run_1', taskId: 'task_1' },
        policy,
      );

      expect(firstRead).toMatchObject({
        success: true,
        output: 'first workspace note',
      });
      expect(secondRead).toMatchObject({
        success: true,
        output: 'second workspace note',
      });
    } finally {
      fs.rmSync(firstRoot, { recursive: true, force: true });
      fs.rmSync(secondRoot, { recursive: true, force: true });
    }
  });

  it('requires local file-write policy before checkpointing workspace patches', async () => {
    const tempRoot = makeTempDir('taskplane-agent-workspace-patch-policy-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'alpha\n');
      const runStepRepository = buildRunStepRepositoryMock();
      const runCheckpointRepository = buildRunCheckpointRepositoryMock();
      const decisionRepository = buildDecisionRepositoryMock();
      const registry = new AgentToolRegistry(
        {} as never,
        runStepRepository as never,
        runCheckpointRepository as never,
        decisionRepository as never,
        () => tempRoot,
      );

      const result = await registry.execute(
        'workspace.write_patch',
        {
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
        },
        { runId: 'run_1', taskId: 'task_1' },
        {
          maxSteps: 8,
          maxWallTimeMs: 120_000,
          allowNetwork: false,
          allowLocalWorkspaceRead: false,
          allowLocalFileWrite: false,
          confirmationRequiredRisks: ['local_write'],
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('workspace.write_patch requires allowLocalFileWrite policy.');
      expect(fs.readFileSync(path.join(tempRoot, 'notes.md'), 'utf8')).toBe('alpha\n');
      expect(runCheckpointRepository.create).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('requires local command policy before checkpointing workspace commands', async () => {
    const tempRoot = makeTempDir('taskplane-agent-workspace-command-policy-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
        scripts: {
          test: 'node -e "console.log(1)"',
        },
      }));
      const runStepRepository = buildRunStepRepositoryMock();
      const runCheckpointRepository = buildRunCheckpointRepositoryMock();
      const decisionRepository = buildDecisionRepositoryMock();
      const registry = new AgentToolRegistry(
        {} as never,
        runStepRepository as never,
        runCheckpointRepository as never,
        decisionRepository as never,
        () => tempRoot,
      );

      const result = await registry.execute(
        'workspace.run_command',
        {
          summary: 'Run tests',
          script: 'test',
        },
        { runId: 'run_1', taskId: 'task_1' },
        {
          maxSteps: 8,
          maxWallTimeMs: 120_000,
          allowNetwork: false,
          allowLocalWorkspaceRead: false,
          allowLocalFileWrite: false,
          allowLocalCommandRun: false,
          confirmationRequiredRisks: ['local_command'],
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('workspace.run_command requires allowLocalCommandRun policy.');
      expect(runCheckpointRepository.create).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('creates a confirmation checkpoint before running workspace commands', async () => {
    const tempRoot = makeTempDir('taskplane-agent-workspace-command-confirm-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
        scripts: {
          test: 'node -e "console.log(\\"should-not-run\\")"',
        },
      }));
      const runStepRepository = buildRunStepRepositoryMock();
      const runCheckpointRepository = buildRunCheckpointRepositoryMock();
      const decisionRepository = buildDecisionRepositoryMock();
      const registry = new AgentToolRegistry(
        {} as never,
        runStepRepository as never,
        runCheckpointRepository as never,
        decisionRepository as never,
        () => tempRoot,
      );

      const result = await registry.execute(
        'workspace.run_command',
        {
          summary: 'Run tests',
          script: 'test',
          args: ['--watch=false'],
        },
        { runId: 'run_1', taskId: 'task_1' },
        {
          maxSteps: 8,
          maxWallTimeMs: 120_000,
          allowNetwork: false,
          allowLocalWorkspaceRead: false,
          allowLocalFileWrite: false,
          allowLocalCommandRun: true,
          confirmationRequiredRisks: ['local_command'],
        },
      );

      expect(result).toMatchObject({
        success: false,
        status: 'needs_confirmation',
        checkpointId: 'run_checkpoint_1',
        checkpointKind: 'tool_permission',
        decisionId: 'decision_1',
      });
      expect(runCheckpointRepository.updatePayload).toHaveBeenCalledWith(
        'run_checkpoint_1',
        expect.stringContaining('"commandPreview"'),
      );
      expect(runStepRepository.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: 'checkpoint',
          status: 'pending',
          input: expect.stringContaining('Command: npm run test -- --watch=false'),
        }),
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects missing workspace package scripts before creating command checkpoints', async () => {
    const tempRoot = makeTempDir('taskplane-agent-workspace-command-missing-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
        scripts: {
          lint: 'node -e "console.log(1)"',
        },
      }));
      const runStepRepository = buildRunStepRepositoryMock();
      const runCheckpointRepository = buildRunCheckpointRepositoryMock();
      const registry = new AgentToolRegistry(
        {} as never,
        runStepRepository as never,
        runCheckpointRepository as never,
        null,
        () => tempRoot,
      );

      const result = await registry.execute(
        'workspace.run_command',
        {
          summary: 'Run tests',
          script: 'test',
        },
        { runId: 'run_1', taskId: 'task_1' },
        {
          maxSteps: 8,
          maxWallTimeMs: 120_000,
          allowNetwork: false,
          allowLocalWorkspaceRead: false,
          allowLocalFileWrite: false,
          allowLocalCommandRun: true,
          confirmationRequiredRisks: ['local_command'],
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('workspace.run_command script not found in package.json: test');
      expect(runCheckpointRepository.create).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects workspace commands when the workspace root has no package file', async () => {
    const tempRoot = makeTempDir('taskplane-agent-workspace-command-no-package-');

    try {
      const runStepRepository = buildRunStepRepositoryMock();
      const runCheckpointRepository = buildRunCheckpointRepositoryMock();
      const registry = new AgentToolRegistry(
        {} as never,
        runStepRepository as never,
        runCheckpointRepository as never,
        null,
        () => tempRoot,
      );

      const result = await registry.execute(
        'workspace.run_command',
        {
          summary: 'Run tests',
          script: 'test',
        },
        { runId: 'run_1', taskId: 'task_1' },
        {
          maxSteps: 8,
          maxWallTimeMs: 120_000,
          allowNetwork: false,
          allowLocalWorkspaceRead: false,
          allowLocalFileWrite: false,
          allowLocalCommandRun: true,
          confirmationRequiredRisks: ['local_command'],
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('workspace.run_command requires package.json in the workspace root.');
      expect(runCheckpointRepository.create).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('runs an approved allowlisted workspace command inside the configured root', async () => {
    const tempRoot = makeTempDir('taskplane-agent-workspace-command-run-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
        scripts: {
          test: 'node -e "console.log(\\"command-ok\\")"',
        },
      }));
      const runStepRepository = buildRunStepRepositoryMock();
      const registry = new AgentToolRegistry(
        {} as never,
        runStepRepository as never,
        undefined,
        null,
        () => tempRoot,
      );

      const result = await registry.execute(
        'workspace.run_command',
        {
          summary: 'Run tests',
          script: 'test',
        },
        { runId: 'run_1', taskId: 'task_1' },
        {
          maxSteps: 8,
          maxWallTimeMs: 120_000,
          allowNetwork: false,
          allowLocalWorkspaceRead: false,
          allowLocalFileWrite: false,
          allowLocalCommandRun: true,
          confirmationRequiredRisks: [],
        },
      );

      expect(result).toMatchObject({
        success: true,
        status: 'completed',
        summary: '已运行工作区命令：npm run test',
      });
      expect(result.output).toContain('command-ok');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('fails workspace commands that exceed the configured timeout', async () => {
    const tempRoot = makeTempDir('taskplane-agent-workspace-command-timeout-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({
        scripts: {
          test: 'node -e "setTimeout(() => console.log(\\"late\\"), 5000)"',
        },
      }));
      const runStepRepository = buildRunStepRepositoryMock();
      const registry = new AgentToolRegistry(
        {} as never,
        runStepRepository as never,
        undefined,
        null,
        () => tempRoot,
      );

      const result = await registry.execute(
        'workspace.run_command',
        {
          summary: 'Run slow test',
          script: 'test',
          timeoutMs: 1,
        },
        { runId: 'run_1', taskId: 'task_1' },
        {
          maxSteps: 8,
          maxWallTimeMs: 120_000,
          allowNetwork: false,
          allowLocalWorkspaceRead: false,
          allowLocalFileWrite: false,
          allowLocalCommandRun: true,
          confirmationRequiredRisks: [],
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('workspace.run_command timed out after 1000ms.');
      expect(runStepRepository.update).toHaveBeenCalledWith(
        'run_step_1',
        expect.objectContaining({
          status: 'failed',
          error: 'workspace.run_command timed out after 1000ms.',
        }),
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects workspace commands outside the allowlist', async () => {
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry({} as never, runStepRepository as never);

    const result = await registry.execute(
      'workspace.run_command',
      {
        summary: 'Install dependencies',
        script: 'install',
      },
      { runId: 'run_1', taskId: 'task_1' },
      {
        maxSteps: 8,
        maxWallTimeMs: 120_000,
        allowNetwork: false,
        allowLocalWorkspaceRead: false,
        allowLocalFileWrite: false,
        allowLocalCommandRun: true,
        confirmationRequiredRisks: [],
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('workspace.run_command script is not allowed: install');
  });

  it('keeps broad verification scripts outside the first command allowlist', async () => {
    const runStepRepository = buildRunStepRepositoryMock();
    const registry = new AgentToolRegistry({} as never, runStepRepository as never);

    const result = await registry.execute(
      'workspace.run_command',
      {
        summary: 'Run full verification',
        script: 'verify',
      },
      { runId: 'run_1', taskId: 'task_1' },
      {
        maxSteps: 8,
        maxWallTimeMs: 120_000,
        allowNetwork: false,
        allowLocalWorkspaceRead: false,
        allowLocalFileWrite: false,
        allowLocalCommandRun: true,
        confirmationRequiredRisks: [],
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('workspace.run_command script is not allowed: verify');
  });

  it('creates a confirmation checkpoint with a diff preview before applying workspace patches', async () => {
    const tempRoot = makeTempDir('taskplane-agent-workspace-patch-confirm-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'alpha\n');
      const runStepRepository = buildRunStepRepositoryMock();
      const runCheckpointRepository = buildRunCheckpointRepositoryMock();
      const decisionRepository = buildDecisionRepositoryMock();
      const registry = new AgentToolRegistry(
        {} as never,
        runStepRepository as never,
        runCheckpointRepository as never,
        decisionRepository as never,
        () => tempRoot,
      );

      const result = await registry.execute(
        'workspace.write_patch',
        {
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
        },
        { runId: 'run_1', taskId: 'task_1' },
        {
          maxSteps: 8,
          maxWallTimeMs: 120_000,
          allowNetwork: false,
          allowLocalWorkspaceRead: false,
          allowLocalFileWrite: true,
          confirmationRequiredRisks: ['local_write'],
        },
      );

      expect(result).toMatchObject({
        success: false,
        status: 'needs_confirmation',
        checkpointId: 'run_checkpoint_1',
      });
      expect(fs.readFileSync(path.join(tempRoot, 'notes.md'), 'utf8')).toBe('alpha\n');
      expect(runCheckpointRepository.updatePayload).toHaveBeenCalledWith(
        'run_checkpoint_1',
        expect.stringContaining('"diffPreview"'),
      );
      expect(runStepRepository.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: 'checkpoint',
          status: 'pending',
          input: expect.stringContaining('Files: notes.md'),
        }),
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('applies an approved workspace patch inside the configured root', async () => {
    const tempRoot = makeTempDir('taskplane-agent-workspace-patch-apply-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'alpha\n');
      const runStepRepository = buildRunStepRepositoryMock();
      const registry = new AgentToolRegistry(
        {} as never,
        runStepRepository as never,
        undefined,
        null,
        () => tempRoot,
      );

      const result = await registry.execute(
        'workspace.write_patch',
        {
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
        },
        { runId: 'run_1', taskId: 'task_1' },
        {
          maxSteps: 8,
          maxWallTimeMs: 120_000,
          allowNetwork: false,
          allowLocalWorkspaceRead: false,
          allowLocalFileWrite: true,
          confirmationRequiredRisks: [],
        },
      );

      expect(result).toMatchObject({
        success: true,
        status: 'completed',
        summary: '已应用工作区 patch：notes.md',
      });
      expect(fs.readFileSync(path.join(tempRoot, 'notes.md'), 'utf8')).toBe('beta\n');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('preserves patch boundary whitespace when applying an approved workspace patch', async () => {
    const tempRoot = makeTempDir('taskplane-agent-workspace-patch-whitespace-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'alpha\n\n');
      const runStepRepository = buildRunStepRepositoryMock();
      const registry = new AgentToolRegistry(
        {} as never,
        runStepRepository as never,
        undefined,
        null,
        () => tempRoot,
      );
      const patch = [
        '*** Begin Patch',
        '*** Update File: notes.md',
        '@@',
        '-alpha',
        '-',
        '+beta',
        '+',
        '+done',
        '*** End Patch',
        '',
      ].join('\n');

      const result = await registry.execute(
        'workspace.write_patch',
        {
          summary: 'Update notes',
          expectedFiles: ['notes.md'],
          patch,
        },
        { runId: 'run_1', taskId: 'task_1' },
        {
          maxSteps: 8,
          maxWallTimeMs: 120_000,
          allowNetwork: false,
          allowLocalWorkspaceRead: false,
          allowLocalFileWrite: true,
          confirmationRequiredRisks: [],
        },
      );

      expect(result).toMatchObject({
        success: true,
        status: 'completed',
        output: patch,
      });
      expect(fs.readFileSync(path.join(tempRoot, 'notes.md'), 'utf8')).toBe('beta\n\ndone\n');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects workspace patches that touch files outside expectedFiles', async () => {
    const tempRoot = makeTempDir('taskplane-agent-workspace-patch-unexpected-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'alpha\n');
      const runStepRepository = buildRunStepRepositoryMock();
      const registry = new AgentToolRegistry(
        {} as never,
        runStepRepository as never,
        undefined,
        null,
        () => tempRoot,
      );

      const result = await registry.execute(
        'workspace.write_patch',
        {
          summary: 'Update other file',
          expectedFiles: ['notes.md'],
          patch: [
            '*** Begin Patch',
            '*** Add File: other.md',
            '+outside expected files',
            '*** End Patch',
          ].join('\n'),
        },
        { runId: 'run_1', taskId: 'task_1' },
        {
          maxSteps: 8,
          maxWallTimeMs: 120_000,
          allowNetwork: false,
          allowLocalWorkspaceRead: false,
          allowLocalFileWrite: true,
          confirmationRequiredRisks: [],
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('workspace.write_patch touched unexpected file: other.md');
      expect(fs.readFileSync(path.join(tempRoot, 'notes.md'), 'utf8')).toBe('alpha\n');
      expect(fs.existsSync(path.join(tempRoot, 'other.md'))).toBe(false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects workspace patches that escape the configured root', async () => {
    const tempRoot = makeTempDir('taskplane-agent-workspace-patch-escape-');
    const outsideFileName = `${path.basename(tempRoot)}-outside.md`;
    const escapedRelativePath = `../${outsideFileName}`;
    const outsidePath = path.resolve(tempRoot, escapedRelativePath);

    try {
      fs.writeFileSync(path.join(tempRoot, 'notes.md'), 'alpha\n');
      fs.writeFileSync(outsidePath, 'outside\n');
      const runStepRepository = buildRunStepRepositoryMock();
      const registry = new AgentToolRegistry(
        {} as never,
        runStepRepository as never,
        undefined,
        null,
        () => tempRoot,
      );

      const result = await registry.execute(
        'workspace.write_patch',
        {
          summary: 'Escape workspace',
          expectedFiles: [escapedRelativePath],
          patch: [
            '*** Begin Patch',
            `*** Update File: ${escapedRelativePath}`,
            '@@',
            '-outside',
            '+escaped',
            '*** End Patch',
          ].join('\n'),
        },
        { runId: 'run_1', taskId: 'task_1' },
        {
          maxSteps: 8,
          maxWallTimeMs: 120_000,
          allowNetwork: false,
          allowLocalWorkspaceRead: false,
          allowLocalFileWrite: true,
          confirmationRequiredRisks: [],
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Workspace path must stay inside the configured workspace root.');
      expect(fs.readFileSync(path.join(tempRoot, 'notes.md'), 'utf8')).toBe('alpha\n');
      expect(fs.readFileSync(outsidePath, 'utf8')).toBe('outside\n');
    } finally {
      fs.rmSync(outsidePath, { force: true });
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not partially apply a workspace patch when a later hunk fails', async () => {
    const tempRoot = makeTempDir('taskplane-agent-workspace-patch-atomic-');

    try {
      fs.writeFileSync(path.join(tempRoot, 'first.md'), 'alpha\n');
      fs.writeFileSync(path.join(tempRoot, 'second.md'), 'gamma\n');
      const runStepRepository = buildRunStepRepositoryMock();
      const registry = new AgentToolRegistry(
        {} as never,
        runStepRepository as never,
        undefined,
        null,
        () => tempRoot,
      );

      const result = await registry.execute(
        'workspace.write_patch',
        {
          summary: 'Update two files',
          expectedFiles: ['first.md', 'second.md'],
          patch: [
            '*** Begin Patch',
            '*** Update File: first.md',
            '@@',
            '-alpha',
            '+beta',
            '*** Update File: second.md',
            '@@',
            '-missing',
            '+delta',
            '*** End Patch',
          ].join('\n'),
        },
        { runId: 'run_1', taskId: 'task_1' },
        {
          maxSteps: 8,
          maxWallTimeMs: 120_000,
          allowNetwork: false,
          allowLocalWorkspaceRead: false,
          allowLocalFileWrite: true,
          confirmationRequiredRisks: [],
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('workspace.write_patch could not match update hunk in second.md.');
      expect(fs.readFileSync(path.join(tempRoot, 'first.md'), 'utf8')).toBe('alpha\n');
      expect(fs.readFileSync(path.join(tempRoot, 'second.md'), 'utf8')).toBe('gamma\n');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
