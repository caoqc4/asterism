import { describe, expect, it } from 'vitest';

import {
  buildApiRuntimeChatAssistantInvocation,
  buildApiRuntimeDecisionDraftInvocation,
  buildApiRuntimeDecompositionDraftInvocation,
  buildLocalTaskTypeReviewInvocation,
  buildProductHarnessDecisionDraftInvocation,
  buildProductHarnessMemoryProposalInvocation,
  buildProductHarnessVerificationAssistInvocation,
} from './ai-runtime-invocation.js';

describe('ai runtime invocation contract', () => {
  it('wraps local task type review in the same invocation shape future runtimes can return', () => {
    const invocation = buildLocalTaskTypeReviewInvocation({
      taskId: 'task_project',
      taskTitle: '开发小程序',
      currentType: 'simple',
    });

    expect(invocation).toMatchObject({
      phase: 'task_type_review',
      layer: 'local_rule',
      runtime: {
        mode: 'local_rule',
        label: '本地结构化类型规则',
      },
      status: 'completed',
      proposal: {
        taskId: 'task_project',
        currentType: 'simple',
        suggestedType: 'project',
        source: 'local_rule',
      },
    });
    expect(invocation.summary).toContain('项目型');
  });

  it('wraps API-runtime project decomposition drafts without turning them into writes', () => {
    const invocation = buildApiRuntimeDecompositionDraftInvocation({
      draft: {
        parentGoal: '上线小程序',
        subtasks: [
          {
            title: '需求与范围确认',
            summary: '确认范围',
            acceptanceCriteria: '范围文档可验收',
            dependency: null,
            rationale: '独立边界清楚',
          },
        ],
        review: '粒度合适',
        nextStep: '请确认创建',
      },
    });

    expect(invocation).toMatchObject({
      phase: 'decomposition_draft',
      layer: 'api_runtime',
      runtime: {
        mode: 'api',
        label: 'Agent API Runtime 规划',
      },
      status: 'completed',
    });
    expect(invocation.draft.subtasks).toHaveLength(1);
    expect(invocation.summary).toContain('1 个项目子任务草稿');
  });

  it('wraps decision drafts with API-runtime provenance', () => {
    const invocation = buildApiRuntimeDecisionDraftInvocation({
      draft: {
        taskId: 'task_1',
        title: '是否上线',
        rationale: '需要拍板上线窗口。',
        suggestedScope: 'task',
        suggestedKind: 'direction_choice',
        suggestedSourceType: 'manual',
        source: 'ai',
        selectedTemplateIds: [],
        selectedTemplateTitles: [],
        selectionReason: '未使用模板。',
      },
      runtimeLabel: 'Agent API Runtime · openai / gpt-test',
    });

    expect(invocation).toMatchObject({
      phase: 'decision_draft',
      layer: 'api_runtime',
      runtime: {
        mode: 'api',
        label: 'Agent API Runtime · openai / gpt-test',
      },
      status: 'completed',
      draft: {
        source: 'ai',
        title: '是否上线',
      },
    });
  });

  it('wraps fallback decision drafts as product harness work', () => {
    const invocation = buildProductHarnessDecisionDraftInvocation({
      draft: {
        taskId: 'task_1',
        title: '本地草稿',
        rationale: 'AI 不可用时仍给用户一个可确认草稿。',
        suggestedScope: 'task',
        suggestedKind: 'direction_choice',
        suggestedSourceType: 'manual',
        source: 'fallback',
        selectedTemplateIds: [],
        selectedTemplateTitles: [],
        selectionReason: '未评估模板。',
      },
    });

    expect(invocation).toMatchObject({
      phase: 'decision_draft',
      layer: 'product_harness',
      runtime: {
        mode: 'product_harness',
        label: 'Taskplane 本地决策草稿',
      },
      status: 'skipped',
    });
  });

  it('wraps API-runtime chat assistant responses with phase provenance', () => {
    const globalInvocation = buildApiRuntimeChatAssistantInvocation({
      phase: 'global_assistant',
      runtimeLabel: 'Agent API Runtime · openai / gpt-test',
      text: '今天先看阻塞。',
    });
    const taskInvocation = buildApiRuntimeChatAssistantInvocation({
      phase: 'task_assistant',
      pilotDecision: {
        backend: 'agent_api',
        backendPlan: {
          backend: 'agent_api',
          maxTurns: 1,
          outputContract: 'pilot_decision_summary',
          reason: 'A short model-assisted Pilot judgment may resolve ambiguous routing before execution.',
          status: 'requested',
          triggers: ['multi_task_priority'],
        },
        confidence: 'model_assisted',
        executor: 'agent_api',
        messagePriority: 'follow_up',
        movement: 'execute',
        operationMode: 'bounded_decision_backend',
        priorityLane: 'steady',
        reason: 'Pilot selected execute via api_runtime.',
      },
      text: '下一步是补齐验收标准。',
    });

    expect(globalInvocation).toMatchObject({
      phase: 'global_assistant',
      layer: 'api_runtime',
      runtime: {
        mode: 'api',
        label: 'Agent API Runtime · openai / gpt-test',
      },
      status: 'completed',
      text: '今天先看阻塞。',
    });
    expect(taskInvocation.summary).toContain('任务上下文');
    expect(taskInvocation.pilotDecision?.backendPlan.outputContract).toBe('pilot_decision_summary');
  });

  it('wraps product-harness verification and memory proposal phases', () => {
    const verification = buildProductHarnessVerificationAssistInvocation({
      verification: {
        evaluator: 'taskplane.verifier.lightweight',
        verdict: 'pass',
        decision: 'accept_for_review',
        reason: 'Runtime produced evidence.',
        evidence: ['stdout=present'],
        missingEvidence: [],
        nextAction: 'review_memory_proposal',
        userConfirmationRequired: true,
        canMarkTaskComplete: false,
        shouldProposeTaskMemory: true,
        contract: {
          completionConditionCount: 1,
          completionConditions: ['回答用户请求'],
          objective: '检查实现路径',
          runId: 'run_1',
          runtimeLabel: 'Codex CLI',
          taskGoalStatus: 'active',
          taskId: 'task_1',
        },
      },
    });
    const memory = buildProductHarnessMemoryProposalInvocation({
      sourceRunId: 'run_1',
      targets: ['task_record'],
      userConfirmationRequired: true,
    });

    expect(verification).toMatchObject({
      phase: 'verification_assist',
      layer: 'product_harness',
      runtime: {
        mode: 'product_harness',
        label: 'Taskplane lightweight verifier',
      },
      status: 'completed',
    });
    expect(memory).toMatchObject({
      phase: 'memory_proposal',
      layer: 'product_harness',
      proposal: {
        sourceRunId: 'run_1',
        targets: ['task_record'],
        userConfirmationRequired: true,
      },
    });
  });
});
