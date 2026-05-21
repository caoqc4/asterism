import { describe, expect, it } from 'vitest';

import {
  buildApiRuntimeDecisionDraftInvocation,
  buildApiRuntimeDecompositionDraftInvocation,
  buildLocalTaskTypeReviewInvocation,
  buildProductHarnessDecisionDraftInvocation,
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
});
