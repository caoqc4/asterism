import { describe, expect, it, vi } from 'vitest';

const { generateObjectMock } = vi.hoisted(() => ({
  generateObjectMock: vi.fn(),
}));

vi.mock('ai', () => ({
  generateObject: generateObjectMock,
}));

import type { DecisionRecord } from '../../../shared/types/decision.js';
import type { AppliedProcessTemplateRecord } from '../../../shared/types/process-template.js';
import type { RunCheckpointRecord } from '../../../shared/types/run.js';
import type { SourceContextRecord } from '../../../shared/types/source-context.js';
import type { TaskDetail, TaskRecord } from '../../../shared/types/task.js';
import { DecisionService } from './decision-service.js';

function buildSourceContext(partial: Partial<SourceContextRecord>): SourceContextRecord {
  return {
    archivedAt: null,
    content: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    id: partial.id ?? 'source_context_1',
    isKey: partial.isKey ?? true,
    kind: partial.kind ?? 'note',
    note: partial.note ?? null,
    status: partial.status ?? 'active',
    taskId: 'task_1',
    title: partial.title ?? 'Source context',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    uri: null,
    ...partial,
  };
}

function buildTaskDetail(): TaskDetail {
  return {
    id: 'task_1',
    title: 'Task 1',
    summary: 'Summary',
    state: 'planned',
    nextStep: 'Move forward',
    waitingReason: null,
    activeWaitingItem: null,
    activeBlocker: null,
    riskLevel: 'none',
    riskNote: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    resumeCard: {
      summary: 'Resume summary',
      currentState: '状态：planned',
      latestChange: {
        summary: '最近没有新的生命周期变化。',
        action: {
          label: null,
          targetType: null,
          targetId: null,
        },
      },
      completionStatus: {
        total: 0,
        satisfied: 0,
        open: 0,
        summary: '尚未定义完成标准',
      },
      keySource: {
        sourceContextId: null,
        title: '暂无关键来源',
        detail: null,
        priorityReason: null,
      },
      currentMethod: {
        templateId: null,
        title: '暂无方法模板',
        detail: null,
        selectionReason: null,
      },
      currentBlocker: {
        blockerId: null,
        title: '暂无当前阻塞项',
        detail: null,
      },
      nextSuggestedMove: 'Move forward',
    },
    artifacts: [],
    completionCriteria: [],
    sourceContexts: [],
    processTemplates: [],
    availableProcessTemplates: [],
    timeline: [],
  };
}

function buildAppliedTemplate(
  partial: Partial<AppliedProcessTemplateRecord> = {},
): AppliedProcessTemplateRecord {
  return {
    id: partial.id ?? 'process_template_1',
    title: partial.title ?? 'Approval skill',
    summary: partial.summary ?? 'Structure approval requests clearly',
    content: partial.content ?? '1. Summarize the ask\n2. State why it matters',
    kind: partial.kind ?? 'skill',
    tags: partial.tags ?? ['approval'],
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    archivedAt: partial.archivedAt ?? null,
    bindingId: partial.bindingId ?? 'task_process_binding_1',
    taskId: partial.taskId ?? 'task_1',
    bindingStatus: partial.bindingStatus ?? 'active',
    bindingNote: partial.bindingNote ?? null,
    boundAt: partial.boundAt ?? '2026-01-01T00:00:00.000Z',
    bindingUpdatedAt: partial.bindingUpdatedAt ?? '2026-01-01T00:00:00.000Z',
    removedAt: partial.removedAt ?? null,
  };
}

function buildDecisionRecord(partial: Partial<DecisionRecord> = {}): DecisionRecord {
  const taskId = Object.prototype.hasOwnProperty.call(partial, 'taskId') ? partial.taskId! : 'task_1';
  return {
    id: partial.id ?? 'decision_1',
    taskId,
    title: partial.title ?? 'Need approval',
    status: partial.status ?? 'pending',
    scope: partial.scope ?? (partial.taskId === null ? 'global' : 'task'),
    kind: partial.kind ?? 'direction_choice',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildTaskRecord(state: TaskRecord['state']): TaskRecord {
  return {
    id: 'task_1',
    title: 'Task 1',
    summary: 'Summary',
    state,
    nextStep: 'Move forward',
    waitingReason: null,
    riskLevel: 'none',
    riskNote: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function buildBrowserControlledCheckpointPayload() {
  return {
    version: 1,
    kind: 'browser_controlled_interaction',
    descriptorId: 'browser.controlled_interaction',
    action: {
      action: 'click',
      currentUrl: 'http://localhost:5173/draft',
      targetLabel: 'Publish post',
    },
    currentUrl: 'http://localhost:5173/draft',
    decisionId: 'decision_1',
    decisionTitle: 'Need approval',
    origin: 'http://localhost:5173',
    policySnapshot: {
      allowCredentials: false,
      allowedActions: ['click'],
      allowedEvidenceKinds: ['screenshot', 'visible_text', 'page_summary'],
      allowedOrigins: ['http://localhost:5173'],
      isolatedProfile: true,
      maxActions: 8,
      networkPolicy: 'allowlisted',
      operatorStarted: true,
      outputLimitBytes: 128000,
      sensitiveFieldPolicy: 'block',
      sideEffectPolicy: 'checkpoint_required',
      timeoutMs: 60000,
    },
    screenshotArtifactId: 'artifact_screenshot_1',
    sideEffectClassification: 'possible_external_side_effect',
    visibleTextSummary: 'Draft publish page is visible.',
  };
}

function buildPatchPromotionCheckpoint(
  partial: Partial<RunCheckpointRecord> = {},
): RunCheckpointRecord {
  return {
    id: partial.id ?? 'run_checkpoint_patch_1',
    runId: partial.runId ?? 'run_1',
    stepId: partial.stepId ?? 'run_step_1',
    kind: partial.kind ?? 'patch_promotion',
    status: partial.status ?? 'open',
    payload: partial.payload ?? JSON.stringify({
      version: 1,
      kind: 'patch_promotion',
      artifactId: 'artifact_1',
      artifactSummary: 'Reviewable sandbox patch',
      sessionId: 'sandbox_session_1',
      descriptorId: 'workspace.staged_patch',
      decisionId: 'decision_1',
      decisionTitle: '确认提升 sandbox patch',
      expectedFiles: ['notes.md'],
      patchDigest: 'sha256:patch_digest',
      policySnapshot: {
        descriptorId: 'workspace.staged_patch',
        sessionKind: 'sandbox',
        credentialPolicy: 'none',
        networkPolicy: 'disabled',
        timeoutMs: 120_000,
        outputLimitBytes: 64_000,
      },
    }),
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    resolvedAt: partial.resolvedAt ?? null,
  };
}

describe('DecisionService', () => {
  it('drafts a decision with selected process templates', async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        title: 'Approve launch note',
        rationale: 'Current task needs explicit stakeholder approval before moving ahead.',
      },
    });
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn(),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue({
        ...buildTaskDetail(),
        riskLevel: 'high',
        riskNote: 'Need fast escalation',
        sourceContexts: [
          buildSourceContext({ id: 'source_old', title: '旧邮件', note: 'old', updatedAt: '2026-01-01T00:00:00.000Z' }),
          buildSourceContext({ id: 'source_inactive', title: '归档材料', status: 'archived', updatedAt: '2026-01-05T00:00:00.000Z' }),
          buildSourceContext({ id: 'source_ignore', title: '普通备注', isKey: false, updatedAt: '2026-01-06T00:00:00.000Z' }),
          buildSourceContext({ id: 'source_2', title: 'CEO 批注', note: 'ceo', updatedAt: '2026-01-02T00:00:00.000Z' }),
          buildSourceContext({ id: 'source_3', title: '法务意见', note: 'legal', updatedAt: '2026-01-03T00:00:00.000Z' }),
          buildSourceContext({ id: 'source_4', title: '财务复核', note: 'finance', updatedAt: '2026-01-04T00:00:00.000Z' }),
        ],
        processTemplates: [buildAppliedTemplate()],
        resumeCard: {
          ...buildTaskDetail().resumeCard,
          currentBlocker: {
            ...buildTaskDetail().resumeCard.currentBlocker,
            responsibilitySummary: '解除责任：法务团队确认',
          },
          completionStatus: {
            total: 1,
            satisfied: 0,
            open: 1,
            summary: '还差 1 条完成标准',
            nextOpenCriterion: 'Approve launch note',
            nextOpenResponsibilitySummary: '确认责任：客户确认',
          },
        },
      }),
      annotateDecisionApproved: vi.fn(),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateProcessTemplateSelected: vi.fn(),
      annotateProcessTemplateSkipped: vi.fn(),
    };
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockResolvedValue({
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-latest',
        apiKey: 'secret',
        featureFlags: { enableScheduler: true },
      }),
    };
    const processTemplateSelector = {
      select: vi.fn().mockResolvedValue({
        shouldUse: true,
        selectedTemplates: [buildAppliedTemplate()],
        reason: 'This task is waiting on stakeholder approval.',
      }),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      aiConfigService as never,
      processTemplateSelector as never,
    );

    const result = await service.draft({
      taskId: 'task_1',
      note: 'Need stakeholder sign-off',
    });

    expect(processTemplateSelector.select).toHaveBeenCalled();
    expect(taskService.annotateProcessTemplateSelected).toHaveBeenCalledWith(
      'task_1',
      'decision_draft',
      expect.stringContaining('decision_draft_'),
      ['process_template_1'],
      ['Approval skill'],
      'This task is waiting on stakeholder approval.',
    );
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('当前优先级语义：立即升级。组织输出时优先帮助用户升级处理高风险或长期阻塞事项。'),
      }),
    );
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('当前阻塞解除责任：法务团队确认'),
      }),
    );
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('当前完成确认责任：客户确认'),
      }),
    );
    const prompt = generateObjectMock.mock.calls[0]?.[0]?.prompt as string;
    expect(prompt).toContain('关键来源材料：');
    expect(prompt).toContain('- 财务复核 [note] | finance');
    expect(prompt).toContain('- 法务意见 [note] | legal');
    expect(prompt).toContain('- CEO 批注 [note] | ceo');
    expect(prompt).not.toContain('旧邮件');
    expect(prompt).not.toContain('归档材料');
    expect(prompt).not.toContain('普通备注');
    expect(result).toMatchObject({
      taskId: 'task_1',
      title: 'Approve launch note',
      suggestedScope: 'task',
      suggestedKind: 'direction_choice',
      suggestedSourceType: 'manual',
      source: 'ai',
      selectedTemplateIds: ['process_template_1'],
      selectedTemplateTitles: ['Approval skill'],
      selectionReason: 'This task is waiting on stakeholder approval.',
    });
  });

  it('falls back to a local draft when AI drafting is unavailable', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn(),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail()),
      annotateDecisionApproved: vi.fn(),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateProcessTemplateSelected: vi.fn(),
      annotateProcessTemplateSkipped: vi.fn(),
    };
    const aiConfigService = {
      resolveRuntimeConfig: vi.fn().mockRejectedValue(new Error('Missing API key')),
    };
    const processTemplateSelector = {
      select: vi.fn(),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      aiConfigService as never,
      processTemplateSelector as never,
    );

    const result = await service.draft({
      taskId: 'task_1',
      note: 'Need stakeholder sign-off',
    });

    expect(result).toMatchObject({
      taskId: 'task_1',
      title: 'Task 1：Need stakeholder sign-off',
      suggestedScope: 'task',
      suggestedKind: 'direction_choice',
      suggestedSourceType: 'manual',
      source: 'fallback',
    });
  });

  it('creates a decision when the task exists', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn().mockResolvedValue(buildDecisionRecord()),
      act: vi.fn(),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail()),
      annotateDecisionApproved: vi.fn(),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
    );

    const result = await service.create({
      taskId: 'task_1',
      title: 'Need approval',
    });

    expect(taskService.getDetail).toHaveBeenCalledWith('task_1');
    expect(decisionRepository.create).toHaveBeenCalledWith({
      taskId: 'task_1',
      title: 'Need approval',
      scope: 'task',
      kind: 'direction_choice',
      sourceType: 'manual',
      sourceId: null,
      sourceLabel: null,
      options: [],
      recommendation: null,
    });
    expect(result.id).toBe('decision_1');
  });

  it('rejects decision creation when the task does not exist', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn(),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(null),
      annotateDecisionApproved: vi.fn(),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
    );

    await expect(
      service.create({
        taskId: 'missing_task',
        title: 'Need approval',
      }),
    ).rejects.toThrow('Task not found: missing_task');
    expect(decisionRepository.create).not.toHaveBeenCalled();
  });

  it('creates a global decision without looking up a task', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn().mockResolvedValue(buildDecisionRecord({
        taskId: null,
        scope: 'external_access',
        kind: 'external_write',
      })),
      act: vi.fn(),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn(),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
    );

    const result = await service.create({
      taskId: null,
      title: 'Approve connector write',
      scope: 'external_access',
      kind: 'external_write',
    });

    expect(taskService.getDetail).not.toHaveBeenCalled();
    expect(decisionRepository.create).toHaveBeenCalledWith({
      taskId: null,
      title: 'Approve connector write',
      scope: 'external_access',
      kind: 'external_write',
      sourceType: 'manual',
      sourceId: null,
      sourceLabel: null,
      options: [],
      recommendation: null,
    });
    expect(result.taskId).toBeNull();
  });

  it('passes actions straight through to the repository', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'approved',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
    );

    const result = await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(decisionRepository.act).toHaveBeenCalledWith({
      id: 'decision_1',
      action: 'approve',
    });
    expect(taskService.annotateDecisionApproved).toHaveBeenCalledWith(
      'task_1',
      'Need approval',
      'decision_1',
    );
    expect(result.status).toBe('approved');
  });

  it('preflights task memory annotation before changing a task-bound decision', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      get: vi.fn().mockResolvedValue(buildDecisionRecord()),
      act: vi.fn(),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      preflightDecisionAnnotation: vi.fn().mockRejectedValue(new Error('任务记忆写入不可用')),
      annotateDecisionApproved: vi.fn(),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
    );

    await expect(service.act({
      id: 'decision_1',
      action: 'approve',
    })).rejects.toThrow('任务记忆写入不可用');

    expect(decisionRepository.get).toHaveBeenCalledWith('decision_1');
    expect(taskService.preflightDecisionAnnotation).toHaveBeenCalledWith('task_1', 'approve');
    expect(decisionRepository.act).not.toHaveBeenCalled();
    expect(taskService.annotateDecisionApproved).not.toHaveBeenCalled();
  });

  it('resumes an approved checkpoint decision through the pending tool', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'approved',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateRunCompleted: vi.fn(),
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue({
        id: 'run_checkpoint_1',
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'tool_permission',
        status: 'open',
        payload: JSON.stringify({
          agentSessionId: 'agent_session_paused_old_created',
          tool: 'artifact.create_note',
          input: { title: 'Agent note', content: 'Captured note' },
          decisionId: 'decision_1',
        }),
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      }),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
      listForRun: vi.fn().mockResolvedValue([
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          error: null,
          id: 'run_step_1',
          index: 1,
          input: 'Decision approved checkpoint',
          kind: 'checkpoint',
          output: 'Captured note',
          runId: 'run_1',
          status: 'completed',
          title: '确认已通过：Need approval',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    };
    const runRepository = {
      getDetail: vi.fn().mockResolvedValue({
        id: 'run_1',
        taskId: 'task_1',
        type: 'agent',
      }),
      updateResult: vi.fn().mockResolvedValue({
        createdAt: '2026-01-01T00:00:00.000Z',
        failureReason: null,
        id: 'run_1',
        instructions: 'Paused agent run',
        output: 'Captured note',
        outputSource: 'system',
        status: 'completed',
        taskId: 'task_1',
        type: 'agent',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    };
    const runVerificationRepository = {
      upsert: vi.fn(),
    };
    const agentToolRegistry = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        summary: '已创建本地 note 产物：Agent note',
        output: 'Captured note',
        artifactId: 'artifact_1',
      }),
    };
    const agentSessionStore = {
      listForRun: vi.fn().mockResolvedValue([
        {
          id: 'agent_session_paused_old_created',
          runId: 'run_1',
          mode: 'agent',
          status: 'paused',
          capabilities: {
            structuredToolCalls: false,
            textOnlyPlanning: true,
            streaming: false,
            fileContext: false,
            taskMutationTools: false,
            longRunningSessions: false,
          },
          metadata: 'executor=local_agent',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'agent_session_confirmation_new_created',
          runId: 'run_1',
          mode: 'agent',
          status: 'needs_confirmation',
          capabilities: {
            structuredToolCalls: false,
            textOnlyPlanning: true,
            streaming: false,
            fileContext: false,
            taskMutationTools: false,
            longRunningSessions: false,
          },
          metadata: 'executor=local_agent',
          createdAt: '2026-01-01T12:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'agent_session_running_newer',
          runId: 'run_1',
          mode: 'agent',
          status: 'running',
          capabilities: {
            structuredToolCalls: false,
            textOnlyPlanning: true,
            streaming: false,
            fileContext: false,
            taskMutationTools: false,
            longRunningSessions: false,
          },
          metadata: 'executor=local_agent',
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ]),
      updateStatus: vi.fn(),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      agentToolRegistry as never,
      null,
      null,
      undefined,
      null,
      agentSessionStore as never,
      runVerificationRepository as never,
    );

    await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(agentToolRegistry.execute).toHaveBeenCalledWith(
      'artifact.create_note',
      { title: 'Agent note', content: 'Captured note' },
      expect.objectContaining({
        runId: 'run_1',
        sessionId: 'agent_session_paused_old_created',
        taskId: 'task_1',
      }),
      expect.objectContaining({ confirmationRequiredRisks: [] }),
    );
    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith('run_checkpoint_1', 'resolved');
    expect(agentSessionStore.updateStatus).toHaveBeenCalledWith(
      'agent_session_paused_old_created',
      'completed',
    );
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'completed',
      'Captured note',
      'system',
    );
    expect(taskService.annotateRunCompleted).toHaveBeenCalledWith('task_1', 'agent', true, 'run_1');
    expect(runVerificationRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_1',
      targetType: 'run',
      targetId: 'run_1',
      source: 'lightweight_rule_engine',
    }));
  });

  it('blocks approved checkpoint resume when the target task cannot continue', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'approved',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue({
        ...buildTaskDetail('running'),
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
      }),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateRunCompleted: vi.fn(),
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue({
        id: 'run_checkpoint_1',
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'tool_permission',
        status: 'open',
        payload: JSON.stringify({
          version: 1,
          kind: 'tool_permission',
          tool: 'artifact.create_note',
          input: { title: 'Agent note', content: 'Captured note' },
          decisionId: 'decision_1',
        }),
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      }),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
      listForRun: vi.fn().mockResolvedValue([]),
    };
    const runRepository = {
      getDetail: vi.fn(),
      updateResult: vi.fn(),
    };
    const agentToolRegistry = {
      execute: vi.fn(),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      agentToolRegistry as never,
    );

    await expect(service.act({
      id: 'decision_1',
      action: 'approve',
    })).rejects.toThrow('仍有阻塞、依赖或等待状态');

    expect(agentToolRegistry.execute).not.toHaveBeenCalled();
    expect(runCheckpointRepository.updateStatus).not.toHaveBeenCalled();
    expect(runRepository.updateResult).not.toHaveBeenCalled();
  });

  it('blocks approved checkpoint resume when task memory guidance is still pending', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'approved',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail()),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue({
        id: 'run_checkpoint_1',
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'tool_permission',
        status: 'open',
        payload: JSON.stringify({
          agentSessionId: 'agent_session_paused_old_created',
          tool: 'artifact.create_note',
          input: { title: 'Agent note', content: 'Captured note' },
          decisionId: 'decision_1',
        }),
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      }),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
      listForRun: vi.fn().mockResolvedValue([{
        createdAt: '2026-01-01T00:01:00.000Z',
        error: null,
        id: 'run_step_memory',
        index: 1,
        input: null,
        kind: 'final',
        output: '- Task.md update recommended: next_step',
        runId: 'run_1',
        status: 'completed',
        title: '任务记忆建议',
        updatedAt: '2026-01-01T00:01:00.000Z',
      }]),
    };
    const runRepository = {
      getDetail: vi.fn(),
      updateResult: vi.fn(),
    };
    const agentToolRegistry = {
      execute: vi.fn(),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      agentToolRegistry as never,
    );

    await expect(service.act({
      id: 'decision_1',
      action: 'approve',
    })).rejects.toThrow('最新任务记忆建议仍缺少对应写入：Task.md。');

    expect(agentToolRegistry.execute).not.toHaveBeenCalled();
    expect(runCheckpointRepository.updateStatus).not.toHaveBeenCalled();
    expect(runStepRepository.create).not.toHaveBeenCalled();
  });

  it('records actionable evidence when an approved checkpoint tool cannot resume', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'approved',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateRunCompleted: vi.fn(),
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue({
        id: 'run_checkpoint_1',
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'tool_permission',
        status: 'open',
        payload: JSON.stringify({
          tool: 'workspace.experimental_tool',
          input: { note: 'Needs manual review' },
          decisionId: 'decision_1',
        }),
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      }),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const runRepository = {
      getDetail: vi.fn(),
      updateResult: vi.fn(),
    };
    const agentToolRegistry = {
      execute: vi.fn(),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      agentToolRegistry as never,
    );

    await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(agentToolRegistry.execute).not.toHaveBeenCalled();
    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith('run_checkpoint_1', 'resolved');
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_1',
      kind: 'checkpoint',
      status: 'completed',
      title: '确认已通过：Need approval',
      output: [
        '关联 Decision 已批准，但当前 checkpoint 无法自动续跑。',
        '工具：workspace.experimental_tool',
        'Checkpoint 类型：tool_permission',
        '原因：该工具不在当前自动续跑清单内。',
        '下一步：回到 Run 证据审查输入与结果，然后手动推进或重新运行。',
      ].join('\n'),
    }));
  });

  it('resumes approved task update checkpoints instead of treating them as unsupported', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord({
          title: '确认本地写入：task.update_next_step',
        }),
        status: 'approved',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateRunCompleted: vi.fn(),
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue({
        id: 'run_checkpoint_1',
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'tool_permission',
        status: 'open',
        payload: JSON.stringify({
          tool: 'task.update_next_step',
          input: { nextStep: 'Review next evidence' },
          decisionId: 'decision_1',
        }),
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      }),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const runRepository = {
      getDetail: vi.fn().mockResolvedValue({
        id: 'run_1',
        taskId: 'task_1',
        type: 'agent',
      }),
      updateResult: vi.fn(),
    };
    const agentToolRegistry = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        status: 'completed',
        summary: '已更新任务下一步：Review next evidence',
        output: 'Review next evidence',
      }),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      agentToolRegistry as never,
    );

    await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(agentToolRegistry.execute).toHaveBeenCalledWith(
      'task.update_next_step',
      { nextStep: 'Review next evidence' },
      expect.objectContaining({
        runId: 'run_1',
        taskId: 'task_1',
      }),
      expect.objectContaining({
        allowTaskMutationTools: true,
        confirmationRequiredRisks: [],
      }),
    );
    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith('run_checkpoint_1', 'resolved');
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_1',
      kind: 'checkpoint',
      status: 'completed',
      title: '确认已通过：确认本地写入：task.update_next_step',
      output: '已更新任务下一步：Review next evidence',
    }));
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'completed',
      'Review next evidence',
      'system',
    );
  });

  it('resumes approved decision draft checkpoints with task-mutation policy', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord({
          title: '确认本地写入：decision.draft',
        }),
        status: 'approved',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateRunCompleted: vi.fn(),
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue({
        id: 'run_checkpoint_1',
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'tool_permission',
        status: 'open',
        payload: JSON.stringify({
          tool: 'decision.draft',
          input: { note: 'Need a launch approval draft' },
          decisionId: 'decision_1',
        }),
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      }),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const runRepository = {
      getDetail: vi.fn().mockResolvedValue({
        id: 'run_1',
        taskId: 'task_1',
        type: 'agent',
      }),
      updateResult: vi.fn(),
    };
    const agentToolRegistry = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        status: 'completed',
        summary: '已草拟 Decision：Approve launch wording',
        output: 'Title: Approve launch wording',
      }),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      agentToolRegistry as never,
    );

    await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(agentToolRegistry.execute).toHaveBeenCalledWith(
      'decision.draft',
      { note: 'Need a launch approval draft' },
      expect.objectContaining({
        runId: 'run_1',
        taskId: 'task_1',
      }),
      expect.objectContaining({
        allowTaskMutationTools: true,
        confirmationRequiredRisks: [],
      }),
    );
    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith('run_checkpoint_1', 'resolved');
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'completed',
      'Title: Approve launch wording',
      'system',
    );
  });

  it('blocks approved checkpoint decisions bound to a missing agent session before executing tools', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'approved',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateRunCompleted: vi.fn(),
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue({
        id: 'run_checkpoint_1',
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'tool_permission',
        status: 'open',
        payload: JSON.stringify({
          agentSessionId: 'agent_session_missing',
          tool: 'artifact.create_note',
          input: { title: 'Agent note', content: 'Captured note' },
          decisionId: 'decision_1',
        }),
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      }),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const runRepository = {
      getDetail: vi.fn(),
      updateResult: vi.fn(),
    };
    const agentToolRegistry = {
      execute: vi.fn(),
    };
    const agentSessionStore = {
      listForRun: vi.fn().mockResolvedValue([]),
      updateStatus: vi.fn(),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      agentToolRegistry as never,
      null,
      null,
      undefined,
      null,
      agentSessionStore as never,
    );

    await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(agentToolRegistry.execute).not.toHaveBeenCalled();
    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith('run_checkpoint_1', 'cancelled');
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'checkpoint',
        status: 'failed',
        title: '确认后续跑阻塞：Need approval',
        error: 'Checkpoint agent session is not resumable for run: run_1 (agent_session_missing).',
      }),
    );
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'failed',
      'Checkpoint agent session is not resumable for run: run_1 (agent_session_missing).',
      'system',
      'Checkpoint agent session is not resumable for run: run_1 (agent_session_missing).',
    );
    expect(agentSessionStore.updateStatus).not.toHaveBeenCalled();
    expect(taskService.annotateRunCompleted).not.toHaveBeenCalled();
  });

  it('resumes an approved high-risk completion criterion checkpoint', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord({
          title: '确认本地写入：task.create_completion_criterion',
        }),
        status: 'approved',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateRunCompleted: vi.fn(),
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue({
        id: 'run_checkpoint_1',
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'tool_permission',
        status: 'open',
        payload: JSON.stringify({
          version: 1,
          kind: 'tool_permission',
          tool: 'task.create_completion_criterion',
          risk: 'local_write',
          input: { text: 'Owner must approve the launch claim' },
          decisionId: 'decision_1',
          decisionTitle: '确认本地写入：task.create_completion_criterion',
        }),
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      }),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const runRepository = {
      getDetail: vi.fn().mockResolvedValue({
        id: 'run_1',
        taskId: 'task_1',
        type: 'agent',
      }),
      updateResult: vi.fn(),
    };
    const agentToolRegistry = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        status: 'completed',
        summary: '已创建完成标准：Owner must approve the launch claim',
        output: 'Owner must approve the launch claim',
      }),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      agentToolRegistry as never,
    );

    await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(agentToolRegistry.execute).toHaveBeenCalledWith(
      'task.create_completion_criterion',
      { text: 'Owner must approve the launch claim' },
      expect.objectContaining({ runId: 'run_1', taskId: 'task_1' }),
      expect.objectContaining({
        allowTaskMutationTools: true,
        confirmationRequiredRisks: [],
      }),
    );
    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith('run_checkpoint_1', 'resolved');
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'completed',
      'Owner must approve the launch claim',
      'system',
    );
    expect(taskService.annotateRunCompleted).toHaveBeenCalledWith('task_1', 'agent', true, 'run_1');
  });

  it('resumes an approved workspace patch checkpoint with local file-write policy', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'approved',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateRunCompleted: vi.fn(),
    };
    const patchInput = {
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
      diffPreview: 'Files: notes.md',
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue({
        id: 'run_checkpoint_1',
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'tool_permission',
        status: 'open',
        payload: JSON.stringify({
          version: 1,
          kind: 'tool_permission',
          tool: 'workspace.write_patch',
          risk: 'local_write',
          input: patchInput,
          decisionId: 'decision_1',
          decisionTitle: '确认本地写入：workspace.write_patch',
        }),
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      }),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const runRepository = {
      getDetail: vi.fn().mockResolvedValue({
        id: 'run_1',
        taskId: 'task_1',
        type: 'agent',
      }),
      updateResult: vi.fn(),
    };
    const agentToolRegistry = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        summary: '已应用工作区 patch：notes.md',
        output: patchInput.patch,
      }),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      agentToolRegistry as never,
    );

    await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(agentToolRegistry.execute).toHaveBeenCalledWith(
      'workspace.write_patch',
      patchInput,
      expect.objectContaining({ runId: 'run_1', taskId: 'task_1' }),
      expect.objectContaining({
        allowLocalFileWrite: true,
        confirmationRequiredRisks: [],
      }),
    );
    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith('run_checkpoint_1', 'resolved');
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'completed',
      patchInput.patch,
      'system',
    );
  });

  it('resumes an approved workspace command checkpoint with local command policy', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        title: '确认本地命令：workspace.run_command',
        status: 'approved',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateRunCompleted: vi.fn(),
    };
    const commandInput = {
      summary: 'Run tests',
      script: 'test',
      args: [],
      timeoutMs: 120_000,
      commandPreview: 'Command: npm run test',
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue({
        id: 'run_checkpoint_1',
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'tool_permission',
        status: 'open',
        payload: JSON.stringify({
          version: 1,
          kind: 'tool_permission',
          tool: 'workspace.run_command',
          risk: 'local_command',
          input: commandInput,
          decisionId: 'decision_1',
          decisionTitle: '确认本地命令：workspace.run_command',
        }),
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      }),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const runRepository = {
      getDetail: vi.fn().mockResolvedValue({
        id: 'run_1',
        taskId: 'task_1',
        type: 'agent',
      }),
      updateResult: vi.fn(),
    };
    const agentToolRegistry = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        summary: '已运行工作区命令：npm run test',
        output: 'command-ok',
      }),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      agentToolRegistry as never,
    );

    await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(agentToolRegistry.execute).toHaveBeenCalledWith(
      'workspace.run_command',
      commandInput,
      expect.objectContaining({ runId: 'run_1', taskId: 'task_1' }),
      expect.objectContaining({
        allowLocalCommandRun: true,
        confirmationRequiredRisks: [],
      }),
    );
    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith('run_checkpoint_1', 'resolved');
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'completed',
      'command-ok',
      'system',
    );
  });

  it('resumes an approved browser controlled checkpoint through the local QA executor', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'approved',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateRunCompleted: vi.fn(),
    };
    const payload = buildBrowserControlledCheckpointPayload();
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue({
        id: 'run_checkpoint_1',
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'external_wait',
        status: 'open',
        payload: JSON.stringify(payload),
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      }),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const runRepository = {
      getDetail: vi.fn().mockResolvedValue({
        id: 'run_1',
        taskId: 'task_1',
        type: 'agent',
      }),
      updateResult: vi.fn(),
    };
    const browserControlledResumeExecutor = vi.fn().mockResolvedValue({
      artifacts: [
        {
          kind: 'screenshot',
          path: '/tmp/browser-controlled-resume.png',
          summary: 'Screenshot captured.',
          title: 'Browser screenshot',
        },
      ],
      status: 'completed',
      summary: 'Browser controlled resume local QA completed / oneAction=yes / modelExposure=hidden',
    });
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      null,
      null,
      null,
      () => false,
      browserControlledResumeExecutor,
    );

    await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(browserControlledResumeExecutor).toHaveBeenCalledWith({
      checkpointId: 'run_checkpoint_1',
      decision: expect.objectContaining({ id: 'decision_1', status: 'approved' }),
      payload: JSON.stringify(payload),
      runId: 'run_1',
    });
    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith('run_checkpoint_1', 'resolved');
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'checkpoint',
      status: 'completed',
      title: 'Browser resume completed：Need approval',
      output: [
        'Browser controlled resume local QA completed / oneAction=yes / modelExposure=hidden',
        'Artifacts: screenshot',
      ].join('\n'),
    }));
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'completed',
      'Browser controlled resume local QA completed / oneAction=yes / modelExposure=hidden',
      'system',
    );
    expect(taskService.annotateRunCompleted).toHaveBeenCalledWith('task_1', 'agent', true, 'run_1');
  });

  it('blocks approved browser controlled checkpoints for non-local origins', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'approved',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateRunCompleted: vi.fn(),
    };
    const payload = {
      ...buildBrowserControlledCheckpointPayload(),
      currentUrl: 'https://publisher.example.com/draft',
      origin: 'https://publisher.example.com',
      policySnapshot: {
        ...buildBrowserControlledCheckpointPayload().policySnapshot,
        allowedOrigins: ['https://publisher.example.com'],
      },
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue({
        id: 'run_checkpoint_1',
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'external_wait',
        status: 'open',
        payload: JSON.stringify(payload),
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      }),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const runRepository = {
      getDetail: vi.fn(),
      updateResult: vi.fn(),
    };
    const browserControlledResumeExecutor = vi.fn();
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      null,
      null,
      null,
      () => false,
      browserControlledResumeExecutor,
    );

    await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(browserControlledResumeExecutor).not.toHaveBeenCalled();
    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith('run_checkpoint_1', 'cancelled');
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'checkpoint',
      status: 'failed',
      title: 'Browser resume blocked：Need approval',
    }));
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'failed',
      'Browser controlled resume blocked: origin https://publisher.example.com is not a local QA origin.',
      'system',
      'Browser controlled resume blocked: origin https://publisher.example.com is not a local QA origin.',
    );
  });

  it('approves patch-promotion checkpoints without applying staged files automatically', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'approved',
        title: '确认提升 sandbox patch',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateRunCompleted: vi.fn(),
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue(buildPatchPromotionCheckpoint()),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const runRepository = {
      getDetail: vi.fn(),
      updateResult: vi.fn(),
    };
    const agentToolRegistry = {
      execute: vi.fn(),
    };
    const sandboxPatchPromotionPreflightService = {
      preflight: vi.fn().mockResolvedValue({
        status: 'ready',
        summary: 'Sandbox patch promotion preflight: ready / checkpoint=run_checkpoint_patch_1 / source=sandbox_session_1 / files=notes.md / no workspace files written',
      }),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      agentToolRegistry as never,
      sandboxPatchPromotionPreflightService as never,
    );

    await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(agentToolRegistry.execute).not.toHaveBeenCalled();
    expect(sandboxPatchPromotionPreflightService.preflight).toHaveBeenCalledWith('run_checkpoint_patch_1');
    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith(
      'run_checkpoint_patch_1',
      'resolved',
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'checkpoint',
        status: 'completed',
        title: '确认已通过：确认提升 sandbox patch',
        output: [
          'Sandbox patch promotion preflight: ready / checkpoint=run_checkpoint_patch_1 / source=sandbox_session_1 / files=notes.md / no workspace files written',
          'Workspace file application is still deferred; no workspace files were written.',
        ].join('\n'),
      }),
    );
    expect(runRepository.updateResult).not.toHaveBeenCalled();
  });

  it('records actionable evidence when patch-promotion preflight is unavailable', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'approved',
        title: '确认提升 sandbox patch',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateRunCompleted: vi.fn(),
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue(buildPatchPromotionCheckpoint()),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const runRepository = {
      getDetail: vi.fn(),
      updateResult: vi.fn(),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
    );

    await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith(
      'run_checkpoint_patch_1',
      'resolved',
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_1',
      kind: 'checkpoint',
      status: 'completed',
      title: '确认已通过：确认提升 sandbox patch',
      output: [
        '关联 Decision 已批准，但当前 checkpoint 无法自动续跑。',
        '工具：workspace.staged_patch',
        'Checkpoint 类型：patch_promotion',
        '原因：sandbox patch promotion 预检服务未接入。',
        '下一步：回到 Run 证据审查输入与结果，然后手动推进或重新运行。',
      ].join('\n'),
    }));
  });

  it('applies approved patch-promotion checkpoints only when the apply flag is enabled', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'approved',
        title: '确认提升 sandbox patch',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateRunCompleted: vi.fn(),
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue(buildPatchPromotionCheckpoint()),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const runRepository = {
      getDetail: vi.fn().mockResolvedValue({
        id: 'run_1',
        taskId: 'task_1',
        type: 'agent',
      }),
      updateResult: vi.fn(),
    };
    const sandboxPatchPromotionPreflightService = {
      preflight: vi.fn(),
    };
    const sandboxPatchPromotionApplyService = {
      apply: vi.fn().mockResolvedValue({
        auditSummary: 'Sandbox patch promotion applied / checkpoint=run_checkpoint_patch_1 / files=notes.md',
        promotion: {},
        status: 'applied',
        touchedFiles: ['notes.md'],
      }),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      null,
      sandboxPatchPromotionPreflightService as never,
      sandboxPatchPromotionApplyService as never,
      () => true,
    );

    await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(sandboxPatchPromotionPreflightService.preflight).not.toHaveBeenCalled();
    expect(sandboxPatchPromotionApplyService.apply).toHaveBeenCalledWith('run_checkpoint_patch_1');
    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith(
      'run_checkpoint_patch_1',
      'resolved',
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'checkpoint',
        output: [
          'Sandbox patch promotion applied / checkpoint=run_checkpoint_patch_1 / files=notes.md',
          'Touched files: notes.md',
        ].join('\n'),
        runId: 'run_1',
        status: 'completed',
        title: '提升已应用：确认提升 sandbox patch',
      }),
    );
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'completed',
      'Sandbox patch promotion applied / checkpoint=run_checkpoint_patch_1 / files=notes.md',
      'system',
    );
    expect(taskService.annotateRunCompleted).toHaveBeenCalledWith(
      'task_1',
      'agent',
      true,
      'run_1',
    );
  });

  it('blocks approved patch-promotion checkpoints when preflight evidence diverges', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'approved',
        title: '确认提升 sandbox patch',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn(),
      annotateRunCompleted: vi.fn(),
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue(buildPatchPromotionCheckpoint()),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const runRepository = {
      getDetail: vi.fn(),
      updateResult: vi.fn(),
    };
    const agentToolRegistry = {
      execute: vi.fn(),
    };
    const sandboxPatchPromotionPreflightService = {
      preflight: vi.fn().mockResolvedValue({
        blockedReasons: ['Patch promotion artifact digest does not match promotion record.'],
        status: 'blocked',
        summary: 'Sandbox patch promotion preflight blocked: Patch promotion artifact digest does not match promotion record.',
      }),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      agentToolRegistry as never,
      sandboxPatchPromotionPreflightService as never,
    );

    await service.act({
      id: 'decision_1',
      action: 'approve',
    });

    expect(agentToolRegistry.execute).not.toHaveBeenCalled();
    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith(
      'run_checkpoint_patch_1',
      'cancelled',
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Sandbox patch promotion preflight blocked: Patch promotion artifact digest does not match promotion record.',
        kind: 'checkpoint',
        output: [
          'Sandbox patch promotion preflight blocked: Patch promotion artifact digest does not match promotion record.',
          'No workspace files were written.',
        ].join('\n'),
        runId: 'run_1',
        status: 'failed',
        title: '提升预检阻塞：确认提升 sandbox patch',
      }),
    );
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'failed',
      'Sandbox patch promotion preflight blocked: Patch promotion artifact digest does not match promotion record.',
      'system',
      'Sandbox patch promotion preflight blocked: Patch promotion artifact digest does not match promotion record.',
    );
  });

  it('moves the task to waiting_external when a decision is deferred', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'deferred',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn(),
      annotateDecisionDeferred: vi.fn().mockResolvedValue(buildTaskRecord('waiting_external')),
      annotateDecisionCancelled: vi.fn(),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
    );

    const result = await service.act({
      id: 'decision_1',
      action: 'defer',
    });

    expect(taskService.annotateDecisionDeferred).toHaveBeenCalledWith(
      'task_1',
      'Need approval',
      'decision_1',
    );
    expect(result.status).toBe('deferred');
  });

  it('marks a checkpoint decision as non-resumable when deferred', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'deferred',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn(),
      annotateDecisionDeferred: vi.fn().mockResolvedValue(buildTaskRecord('waiting_external')),
      annotateDecisionCancelled: vi.fn(),
    };
    const runCheckpointRepository = {
      findOpenByDecisionId: vi.fn().mockResolvedValue({
        id: 'run_checkpoint_1',
        runId: 'run_1',
        stepId: 'run_step_1',
        kind: 'tool_permission',
        status: 'open',
        payload: JSON.stringify({ decisionId: 'decision_1' }),
        createdAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: null,
      }),
      updateStatus: vi.fn(),
    };
    const runStepRepository = {
      create: vi.fn(),
    };
    const runRepository = {
      getDetail: vi.fn(),
      updateResult: vi.fn(),
    };
    const agentSessionStore = {
      listForRun: vi.fn().mockResolvedValue([
        {
          id: 'agent_session_confirmation',
          runId: 'run_1',
          mode: 'agent',
          status: 'needs_confirmation',
          capabilities: {
            structuredToolCalls: false,
            textOnlyPlanning: true,
            streaming: false,
            fileContext: false,
            taskMutationTools: false,
            longRunningSessions: false,
          },
          metadata: 'executor=local_agent',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
      updateStatus: vi.fn(),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
      undefined,
      runCheckpointRepository as never,
      runStepRepository as never,
      runRepository as never,
      null,
      null,
      null,
      undefined,
      null,
      agentSessionStore as never,
    );

    await service.act({
      id: 'decision_1',
      action: 'defer',
    });

    expect(runCheckpointRepository.updateStatus).toHaveBeenCalledWith('run_checkpoint_1', 'cancelled');
    expect(agentSessionStore.updateStatus).toHaveBeenCalledWith(
      'agent_session_confirmation',
      'cancelled',
    );
    expect(runStepRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run_1',
        kind: 'checkpoint',
        status: 'skipped',
      }),
    );
    expect(runRepository.updateResult).toHaveBeenCalledWith(
      'run_1',
      'failed',
      '关联 Decision 已延后：Need approval',
      'system',
      '关联 Decision 已延后：Need approval',
    );
  });

  it('writes a task signal when a decision is cancelled', async () => {
    const decisionRepository = {
      list: vi.fn(),
      create: vi.fn(),
      act: vi.fn().mockResolvedValue({
        ...buildDecisionRecord(),
        status: 'cancelled',
      }),
    };
    const taskService = {
      getDetail: vi.fn().mockResolvedValue(buildTaskDetail('running')),
      annotateDecisionApproved: vi.fn(),
      annotateDecisionDeferred: vi.fn(),
      annotateDecisionCancelled: vi.fn().mockResolvedValue(buildTaskRecord('planned')),
    };
    const service = new DecisionService(
      decisionRepository as never,
      taskService as never,
      {} as never,
    );

    const result = await service.act({
      id: 'decision_1',
      action: 'cancel',
    });

    expect(taskService.annotateDecisionCancelled).toHaveBeenCalledWith(
      'task_1',
      'Need approval',
      'decision_1',
    );
    expect(result.status).toBe('cancelled');
  });
});
