import { describe, expect, it } from 'vitest';

import {
  buildLocalTaskTypeReviewInvocation,
  buildModelServiceDecompositionDraftInvocation,
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

  it('wraps model-service project decomposition drafts without turning them into writes', () => {
    const invocation = buildModelServiceDecompositionDraftInvocation({
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
      layer: 'model_service_fallback',
      runtime: {
        mode: 'model_service',
        label: '模型服务规划',
      },
      status: 'completed',
    });
    expect(invocation.draft.subtasks).toHaveLength(1);
    expect(invocation.summary).toContain('1 个项目子任务草稿');
  });
});
