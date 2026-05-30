import { describe, expect, it } from 'vitest';

import {
  evaluateRuntimeContextReadiness,
  formatRuntimeContextReadinessForStep,
} from './runtime-context-readiness.js';
import { classifyRunScope } from './run-scope.js';
import type { TaskDetail } from './types/task.js';

describe('evaluateRuntimeContextReadiness', () => {
  it('blocks when required context assembly is missing', () => {
    const evaluation = evaluateRuntimeContextReadiness({
      contextAssembly: {
        activeSurface: 'task',
        canExecuteTaskWork: false,
        missingRequired: ['task_md'],
        requirements: [],
        summary: 'Runtime context assembly missing required inputs: task_md.',
      },
      prompt: 'Start the run.',
      task: buildReadinessTask(),
    });

    expect(evaluation).toMatchObject({
      decision: 'blocked',
      movement: 'pause',
      recommendedMode: 'runtime_blocked',
      shouldAskUser: false,
    });
    expect(formatRuntimeContextReadinessForStep(evaluation)).toContain('missing=task_md');
  });

  it('prefers self research before asking for public product or tutorial information', () => {
    const evaluation = evaluateRuntimeContextReadiness({
      prompt: '做一个 Codex 的基础教程网站，面向 Agent 初学者，偏基础教程和案例展示。',
      task: buildReadinessTask({
        nextStep: '明确网站目标和范围。',
        summary: 'Codex 基础教程网站，面向 Agent 初学者。',
        title: '明确网站目标与范围',
      }),
    });

    expect(evaluation).toMatchObject({
      decision: 'self_research',
      movement: 'research',
      recommendedMode: 'native_research',
      shouldSelfResearch: true,
    });
    expect(evaluation.shouldAskUser).toBe(false);
  });

  it('does not route local workspace search as external self research', () => {
    const evaluation = evaluateRuntimeContextReadiness({
      prompt: '请搜索本地工作区里的 TaskAdvancementOrchestrator。',
      task: buildReadinessTask({
        nextStep: '检查本地实现。',
        summary: '需要查看当前仓库里的任务推进代码。',
        title: '检查本地任务推进代码',
      }),
    });

    expect(evaluation.decision).not.toBe('self_research');
    expect(evaluation.movement).not.toBe('research');
    expect(evaluation.recommendedMode).not.toBe('native_research');
    expect(evaluation.shouldSelfResearch).toBe(false);
  });

  it('honors explicit research opt-outs before self research readiness', () => {
    const evaluation = evaluateRuntimeContextReadiness({
      prompt: '不需要联网，按已有 Source Context 总结当前价格。',
      task: buildReadinessTask({
        nextStep: '确认目前 OpenAI API 价格和限制。',
        summary: '需要整理最新模型价格。',
        title: '确认当前模型价格',
      }),
    });

    expect(evaluation.decision).not.toBe('self_research');
    expect(evaluation.movement).not.toBe('research');
    expect(evaluation.recommendedMode).not.toBe('native_research');
    expect(evaluation.shouldSelfResearch).toBe(false);
  });

  it('treats product/tutorial context with sources as ready instead of asking weak preferences', () => {
    const evaluation = evaluateRuntimeContextReadiness({
      prompt: '偏基础教程和案例展示，继续推进。',
      task: buildReadinessTask({
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
      decision: 'ready',
      movement: 'execute',
      recommendedMode: 'read_only_execute',
      shouldAskUser: false,
    });
  });

  it('does not treat low-credibility source context as sufficient evidence', () => {
    const evaluation = evaluateRuntimeContextReadiness({
      prompt: '做一个 Codex 的基础教程网站，参考官方文档和案例。',
      task: buildReadinessTask({
        nextStep: '明确网站目标和范围。',
        sourceContexts: [{
          archivedAt: null,
          batchId: null,
          capturedAt: '2026-05-24T00:00:00.000Z',
          containsSensitiveData: false,
          content: 'Unverified scraped summary.',
          createdAt: '2026-05-24T00:00:00.000Z',
          credibility: 'low',
          id: 'source_low_cred',
          isDuplicate: false,
          isKey: true,
          kind: 'note',
          note: null,
          sourceRole: 'digest',
          status: 'active',
          taskId: 'task_1',
          title: 'Low credibility summary',
          updatedAt: '2026-05-24T00:00:00.000Z',
          uri: null,
        }],
        summary: 'Codex 基础教程网站，面向 Agent 初学者。',
        title: '明确网站目标与范围',
      }),
    });

    expect(evaluation).toMatchObject({
      decision: 'self_research',
      movement: 'research',
      recommendedMode: 'native_research',
      shouldSelfResearch: true,
    });
    expect(evaluation.missing).toContain('source_evidence');
  });

  it('refreshes stale source context for fresh external requests', () => {
    const evaluation = evaluateRuntimeContextReadiness({
      now: '2026-05-26T00:00:00.000Z',
      prompt: '确认当前模型价格。',
      task: buildReadinessTask({
        nextStep: '确认当前模型价格。',
        sourceContexts: [{
          archivedAt: null,
          batchId: null,
          capturedAt: '2026-03-01T00:00:00.000Z',
          containsSensitiveData: false,
          content: 'Old pricing summary.',
          createdAt: '2026-03-01T00:00:00.000Z',
          credibility: 'verified',
          id: 'source_old_pricing',
          isDuplicate: false,
          isKey: true,
          kind: 'note',
          note: null,
          sourceRole: 'digest',
          status: 'active',
          taskId: 'task_1',
          title: 'Old pricing summary',
          updatedAt: '2026-03-01T00:00:00.000Z',
          uri: null,
        }],
        summary: '需要整理模型价格。',
        title: '确认当前模型价格',
      }),
    });

    expect(evaluation).toMatchObject({
      decision: 'self_research',
      movement: 'research',
      recommendedMode: 'native_research',
      shouldSelfResearch: true,
    });
    expect(evaluation.missing).toContain('fresh_source_evidence');
  });

  it('uses recent source context for fresh external requests', () => {
    const evaluation = evaluateRuntimeContextReadiness({
      now: '2026-05-26T00:00:00.000Z',
      prompt: '确认当前模型价格。',
      task: buildReadinessTask({
        nextStep: '确认当前模型价格。',
        sourceContexts: [{
          archivedAt: null,
          batchId: null,
          capturedAt: '2026-05-24T00:00:00.000Z',
          containsSensitiveData: false,
          content: 'Recent pricing summary.',
          createdAt: '2026-05-24T00:00:00.000Z',
          credibility: 'verified',
          id: 'source_recent_pricing',
          isDuplicate: false,
          isKey: true,
          kind: 'note',
          note: null,
          sourceRole: 'digest',
          status: 'active',
          taskId: 'task_1',
          title: 'Recent pricing summary',
          updatedAt: '2026-05-24T00:00:00.000Z',
          uri: null,
        }],
        summary: '需要整理模型价格。',
        title: '确认当前模型价格',
      }),
    });

    expect(evaluation).toMatchObject({
      decision: 'ready',
      movement: 'execute',
      recommendedMode: 'read_only_execute',
      shouldSelfResearch: false,
    });
  });

  it('falls back to updated source timestamps when capturedAt is invalid', () => {
    const evaluation = evaluateRuntimeContextReadiness({
      now: '2026-05-26T00:00:00.000Z',
      prompt: '确认当前模型价格。',
      task: buildReadinessTask({
        nextStep: '确认当前模型价格。',
        sourceContexts: [{
          archivedAt: null,
          batchId: null,
          capturedAt: 'not-a-date',
          containsSensitiveData: false,
          content: 'Recent pricing summary.',
          createdAt: '2026-05-20T00:00:00.000Z',
          credibility: 'verified',
          id: 'source_recent_pricing_updated',
          isDuplicate: false,
          isKey: true,
          kind: 'note',
          note: null,
          sourceRole: 'digest',
          status: 'active',
          taskId: 'task_1',
          title: 'Recent pricing summary',
          updatedAt: '2026-05-24T00:00:00.000Z',
          uri: null,
        }],
        summary: '需要整理模型价格。',
        title: '确认当前模型价格',
      }),
    });

    expect(evaluation).toMatchObject({
      decision: 'ready',
      movement: 'execute',
      recommendedMode: 'read_only_execute',
      shouldSelfResearch: false,
    });
  });

  it('does not trust future-dated source context as fresh evidence', () => {
    const evaluation = evaluateRuntimeContextReadiness({
      now: '2026-05-26T00:00:00.000Z',
      prompt: '确认当前模型价格。',
      task: buildReadinessTask({
        nextStep: '确认当前模型价格。',
        sourceContexts: [{
          archivedAt: null,
          batchId: null,
          capturedAt: '2026-06-01T00:00:00.000Z',
          containsSensitiveData: false,
          content: 'Future-dated pricing summary.',
          createdAt: '2026-06-01T00:00:00.000Z',
          credibility: 'verified',
          id: 'source_future_pricing',
          isDuplicate: false,
          isKey: true,
          kind: 'note',
          note: null,
          sourceRole: 'digest',
          status: 'active',
          taskId: 'task_1',
          title: 'Future-dated pricing summary',
          updatedAt: '2026-06-01T00:00:00.000Z',
          uri: null,
        }],
        summary: '需要整理模型价格。',
        title: '确认当前模型价格',
      }),
    });

    expect(evaluation).toMatchObject({
      decision: 'self_research',
      movement: 'research',
      recommendedMode: 'native_research',
      shouldSelfResearch: true,
    });
    expect(evaluation.missing).toContain('fresh_source_evidence');
  });

  it('uses plan-first for code or repository changes that need verification planning', () => {
    const evaluation = evaluateRuntimeContextReadiness({
      prompt: '实现前后端 API 接入并跑测试。',
      task: buildReadinessTask({
        completionCriteria: [],
        nextStep: '开始代码实现。',
        summary: '代码实现任务。',
        title: '实现网站代码',
      }),
    });

    expect(evaluation).toMatchObject({
      decision: 'plan_first',
      movement: 'plan',
      recommendedMode: 'native_plan',
      shouldUsePlanMode: true,
    });
    expect(evaluation.missing).toContain('acceptance_or_verification_plan');
  });

  it('asks the user only for user-owned boundaries', () => {
    const evaluation = evaluateRuntimeContextReadiness({
      prompt: '是否允许直接部署到生产环境？',
      task: buildReadinessTask(),
    });

    expect(evaluation).toMatchObject({
      decision: 'ask_user',
      movement: 'ask',
      recommendedMode: 'manual_decision',
      shouldAskUser: true,
    });
  });

  it('does not treat legal or contract references as approval requests by themselves', () => {
    const evaluation = evaluateRuntimeContextReadiness({
      prompt: '这轮需要保留董事会材料上下文：现金流页、CEO 批注、法务意见、截止时间、交付范围和风险说明。',
      task: buildReadinessTask({
        nextStep: '整理反馈并启动下一轮修改。',
        riskLevel: 'high',
        riskNote: '今晚前需要给 CFO 过目。',
        sourceContexts: [{
          archivedAt: null,
          batchId: null,
          capturedAt: '2026-05-24T00:00:00.000Z',
          containsSensitiveData: false,
          content: '董事会材料来源摘要。',
          createdAt: '2026-05-24T00:00:00.000Z',
          credibility: 'verified',
          id: 'source_legal',
          isDuplicate: false,
          isKey: true,
          kind: 'note',
          note: null,
          sourceRole: 'digest',
          status: 'active',
          taskId: 'task_1',
          title: '法务意见摘要',
          updatedAt: '2026-05-24T00:00:00.000Z',
          uri: null,
        }],
        summary: '需要按最新反馈更新董事会材料。',
        title: '董事会材料修订',
      }),
    });

    expect(evaluation).toMatchObject({
      decision: 'ready',
      movement: 'execute',
      shouldAskUser: false,
    });
  });

  it('does not block handoff prompts just because a project title contains launch wording', () => {
    const evaluation = evaluateRuntimeContextReadiness({
      prompt: [
        '刚刚已完成「1 需求确认」。',
        '它属于项目「上线项目」。',
        '现在请切换到下一项任务「2 界面设计」。',
        '请先读取并重建这个任务的上下文。',
      ].join('\n'),
      task: buildReadinessTask({
        nextStep: '确认界面设计第一步。',
        summary: '项目第二项子任务。',
        title: '2 界面设计',
      }),
    });

    expect(evaluation).toMatchObject({
      decision: 'ready',
      movement: 'execute',
      shouldAskUser: false,
    });
  });

  it('surfaces business line run scope, context pack, and task execution memory evidence', () => {
    const runScope = classifyRunScope({
      businessLineId: 'business_line_product',
      taskId: 'task_1',
    });
    const evaluation = evaluateRuntimeContextReadiness({
      prompt: 'Continue this Next Action.',
      runScope,
      task: buildReadinessTask(),
    });

    expect(evaluation.runScope).toMatchObject({
      kind: 'next_action_execution',
      businessLineContextPack: 'included',
      taskExecutionMemory: 'included',
    });
    expect(formatRuntimeContextReadinessForStep(evaluation)).toContain('runScope=next_action_execution');
    expect(formatRuntimeContextReadinessForStep(evaluation)).toContain('businessLineContextPack=included');
    expect(formatRuntimeContextReadinessForStep(evaluation)).toContain('taskExecutionMemory=included');
  });

  it('classifies global chat and one-off non-durable action scopes separately', () => {
    expect(classifyRunScope({}).kind).toBe('global_chat');
    expect(classifyRunScope({ taskId: 'task_1' })).toMatchObject({
      kind: 'one_off_non_durable_action',
      businessLineContextPack: 'not_applicable',
      durableBusinessReview: 'not_applicable',
      taskExecutionMemory: 'included',
    });
  });
});

function buildReadinessTask(partial: Partial<TaskDetail> = {}): TaskDetail {
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
