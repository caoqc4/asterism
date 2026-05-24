import { describe, expect, it } from 'vitest';

import {
  evaluateRuntimeContextReadiness,
  formatRuntimeContextReadinessForStep,
} from './runtime-context-readiness.js';
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
