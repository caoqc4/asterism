import { describe, expect, it } from 'vitest';

import { evaluateTaskAdvancement } from './task-advancement-orchestrator.js';
import type { TaskDetail } from './types/task.js';

describe('evaluateTaskAdvancement', () => {
  it('routes child task tutorial gaps to native research instead of another preference question', () => {
    const evaluation = evaluateTaskAdvancement({
      entrypoint: 'child_advance',
      hasTaskContext: true,
      isChildTask: true,
      prompt: '做一个 Codex 的基础教程网站，面向 Agent 初学者，偏基础教程和案例展示。',
      runtime: { agentCliReady: true },
      task: buildTask({
        nextStep: '明确网站目标和范围。',
        summary: 'Codex 基础教程网站，面向 Agent 初学者。',
        title: '明确网站目标与范围',
      }),
    });

    expect(evaluation).toMatchObject({
      movement: 'research',
      promptMode: 'child_task_advance',
      route: 'agent_cli',
      shouldStartRuntime: true,
    });
    expect(evaluation.contextReadiness?.decision).toBe('self_research');
    expect(evaluation.requiredGates).toContain('context_readiness');
  });

  it('executes child tasks when key source context already exists', () => {
    const evaluation = evaluateTaskAdvancement({
      entrypoint: 'child_advance',
      hasTaskContext: true,
      isChildTask: true,
      prompt: '偏基础教程和案例展示，继续推进。',
      runtime: { agentCliReady: true },
      task: buildTask({
        nextStep: '形成首版目标、范围和下一步。',
        sourceContexts: [{
          archivedAt: null,
          batchId: null,
          capturedAt: '2026-05-24T00:00:00.000Z',
          containsSensitiveData: false,
          content: 'Official docs summary.',
          createdAt: '2026-05-24T00:00:00.000Z',
          credibility: 'verified',
          id: 'source_1',
          isDuplicate: false,
          isKey: true,
          kind: 'note',
          note: null,
          sourceRole: 'digest',
          status: 'active',
          taskId: 'task_1',
          title: 'Codex docs summary',
          updatedAt: '2026-05-24T00:00:00.000Z',
          uri: null,
        }],
        summary: 'Codex 基础教程网站，面向 Agent 初学者。',
        title: '明确网站目标与范围',
      }),
    });

    expect(evaluation).toMatchObject({
      movement: 'execute',
      promptMode: 'child_task_advance',
      route: 'agent_cli',
      shouldStartRuntime: true,
    });
    expect(evaluation.contextReadiness?.decision).toBe('ready');
  });

  it('keeps declined web research out of task advancement research routing', () => {
    const evaluation = evaluateTaskAdvancement({
      entrypoint: 'child_advance',
      hasTaskContext: true,
      isChildTask: true,
      prompt: '不需要联网，按已有 Source Context 总结当前价格。',
      runtime: { agentCliReady: true },
      task: buildTask({
        nextStep: '确认目前 OpenAI API 价格和限制。',
        summary: '需要整理最新模型价格。',
        title: '确认当前模型价格',
      }),
    });

    expect(evaluation.movement).not.toBe('research');
    expect(evaluation.contextReadiness?.decision).not.toBe('self_research');
    expect(evaluation.contextReadiness?.shouldSelfResearch).toBe(false);
    expect(evaluation.requiredGates).toContain('context_readiness');
  });

  it('keeps user-owned boundaries local instead of launching a runtime', () => {
    const evaluation = evaluateTaskAdvancement({
      entrypoint: 'right_panel_chat',
      hasTaskContext: true,
      prompt: '是否允许直接部署到生产环境？',
      runtime: { agentCliReady: true },
      task: buildTask(),
    });

    expect(evaluation).toMatchObject({
      movement: 'ask',
      route: 'local_rule',
      shouldStartRuntime: false,
    });
    expect(evaluation.userMessage).toContain('拍板');
  });

  it('routes broad project requests to reversible decomposition drafts', () => {
    const evaluation = evaluateTaskAdvancement({
      entrypoint: 'project_decompose',
      hasTaskContext: true,
      prompt: '拆解官网改版项目。',
      runtime: { apiRuntimeReady: true },
      task: buildTask({
        childTaskIds: [],
        title: '官网改版项目',
      }),
    });

    expect(evaluation).toMatchObject({
      confirmationRequired: true,
      movement: 'decompose',
      promptMode: 'decomposition_draft',
      route: 'api_runtime',
      shouldStartRuntime: true,
    });
    expect(evaluation.requiredGates).toContain('subtask_draft');
  });

  it('uses the selected native Agent CLI for decomposition drafts when available', () => {
    const evaluation = evaluateTaskAdvancement({
      entrypoint: 'project_decompose',
      hasTaskContext: true,
      prompt: '拆解官网改版项目。',
      runtime: { agentCliReady: true, apiRuntimeReady: true },
      task: buildTask({
        childTaskIds: [],
        title: '官网改版项目',
      }),
    });

    expect(evaluation).toMatchObject({
      confirmationRequired: true,
      movement: 'decompose',
      promptMode: 'decomposition_draft',
      route: 'agent_cli',
      shouldStartRuntime: true,
    });
  });

  it('does not force decomposition without an explicit decomposition movement', () => {
    const evaluation = evaluateTaskAdvancement({
      entrypoint: 'right_panel_chat',
      hasTaskContext: true,
      prompt: '继续推进。',
      runtime: { agentCliReady: true },
      task: buildTask({
        title: '官网改版项目',
      }),
    });

    expect(evaluation.promptMode).toBe('plain_user');
    expect(evaluation.movement).not.toBe('decompose');
    expect(evaluation.route).toBe('agent_cli');
  });

  it('uses intake routing for global actionable text', () => {
    const evaluation = evaluateTaskAdvancement({
      entrypoint: 'right_panel_chat',
      prompt: '帮我整理一个发布清单。',
      runtime: { agentCliReady: true },
    });

    expect(evaluation.movement).toBe('shape');
    expect(evaluation.route).toBe('proposal_only');
    expect(evaluation.shouldStartRuntime).toBe(false);
    expect(evaluation.intake?.outcome).toBe('create_task');
  });

  it('routes context refresh as a local handoff with memory gates', () => {
    const evaluation = evaluateTaskAdvancement({
      entrypoint: 'context_refresh',
      hasTaskContext: true,
      prompt: '先保全并刷新当前任务会话。',
      task: buildTask(),
    });

    expect(evaluation).toMatchObject({
      confirmationRequired: true,
      movement: 'handoff',
      promptMode: 'context_refresh',
      route: 'local_rule',
      shouldStartRuntime: false,
    });
    expect(evaluation.requiredGates).toContain('runtime_handoff');
    expect(evaluation.requiredGates).toContain('task_memory_coverage');
  });

  it('routes phase closeout as local verification before handoff', () => {
    const evaluation = evaluateTaskAdvancement({
      entrypoint: 'phase_closeout',
      hasTaskContext: true,
      prompt: '阶段收尾。',
      task: buildTask(),
    });

    expect(evaluation).toMatchObject({
      confirmationRequired: true,
      movement: 'verify',
      route: 'local_rule',
      shouldStartRuntime: false,
    });
    expect(evaluation.requiredGates).toContain('task_completion');
    expect(evaluation.requiredGates).toContain('post_step');
  });

  it('routes task completion checks as local verification with operator confirmation', () => {
    const evaluation = evaluateTaskAdvancement({
      entrypoint: 'task_completion_check',
      hasTaskContext: true,
      prompt: '确认任务完成。',
      task: buildTask(),
    });

    expect(evaluation).toMatchObject({
      confirmationRequired: true,
      movement: 'verify',
      route: 'local_rule',
      shouldStartRuntime: false,
    });
    expect(evaluation.requiredGates).toContain('task_completion');
    expect(evaluation.requiredGates).toContain('operator_confirmation');
  });

  it('routes selected task verification as a local project verification check', () => {
    const evaluation = evaluateTaskAdvancement({
      entrypoint: 'selected_task_verification',
      hasTaskContext: true,
      prompt: '检查当前项目任务状态。',
      task: buildTask({
        childTaskIds: ['child_1'],
        title: '官网改版项目',
      }),
    });

    expect(evaluation).toMatchObject({
      confirmationRequired: false,
      movement: 'verify',
      route: 'local_rule',
      shouldStartRuntime: false,
    });
    expect(evaluation.requiredGates).toContain('project_verification');
  });

  it('routes writeback dispatch as a local persistence movement', () => {
    const evaluation = evaluateTaskAdvancement({
      entrypoint: 'writeback_dispatch',
      hasTaskContext: true,
      prompt: 'writeback:task.update_next_step',
      task: buildTask(),
    });

    expect(evaluation).toMatchObject({
      confirmationRequired: true,
      movement: 'persist',
      route: 'local_rule',
      shouldStartRuntime: false,
    });
    expect(evaluation.requiredGates).toContain('task_mutation');
    expect(evaluation.requiredGates).toContain('operator_confirmation');
  });
});

function buildTask(partial: Partial<TaskDetail> = {}): TaskDetail {
  return {
    activeBlocker: null,
    activeWaitingItem: null,
    artifacts: [],
    availableProcessTemplates: [],
    childTaskIds: [],
    completionCriteria: [],
    createdAt: '2026-05-24T00:00:00.000Z',
    decisions: [],
    id: 'task_1',
    nextStep: 'Review implementation path.',
    parentTaskId: null,
    processTemplates: [],
    resumeCard: {
      completionStatus: {
        open: 0,
        satisfied: 0,
        summary: 'No criteria.',
        total: 0,
      },
      currentBlocker: { blockerId: null, detail: null, title: 'None' },
      currentMethod: { detail: null, selectionReason: null, templateId: null, title: 'None' },
      currentState: 'planned',
      keySource: { detail: null, priorityReason: null, sourceContextId: null, title: 'None' },
      latestChange: { action: { label: null, targetId: null, targetType: null }, summary: 'No change' },
      nextSuggestedMove: 'Review implementation path.',
      summary: 'Task resume summary.',
    },
    riskLevel: 'none',
    riskNote: null,
    sourceContexts: [],
    state: 'planned',
    summary: 'Task summary.',
    taskFiles: [],
    timeline: [],
    title: 'Task 1',
    updatedAt: '2026-05-24T00:00:00.000Z',
    waitingReason: null,
    ...partial,
  };
}
