import { describe, expect, it } from 'vitest';

import { evaluateRuntimeSubtaskDraft } from './runtime-subtask-evaluator.js';
import type { TaskHierarchyNode } from './task-hierarchy.js';

function task(partial: Partial<TaskHierarchyNode> & Pick<TaskHierarchyNode, 'id' | 'title'>): TaskHierarchyNode {
  return {
    type: 'simple',
    state: 'planned',
    childTaskIds: [],
    ...partial,
  };
}

describe('runtime subtask evaluator', () => {
  it('allows clear child task drafts for an empty project', () => {
    const parent = task({ id: 'project_1', title: '开发小程序', type: 'project' });

    expect(evaluateRuntimeSubtaskDraft({
      parentTask: parent,
      existingTasks: [parent],
      proposedSubtasks: [
        {
          title: '小程序需求分析与功能设计',
          summary: '明确小程序核心功能、用户需求、业务流程和非功能边界。',
          acceptanceCriteria: '需求范围、流程边界和验收口径被用户确认。',
          dependency: null,
          rationale: '这是后续设计和开发的独立输入。',
        },
        {
          title: '小程序界面设计与用户体验优化',
          summary: '完成主要页面结构、交互状态和视觉体验方案。',
          acceptanceCriteria: '页面方案可进入开发评审。',
          dependency: '小程序需求分析与功能设计',
          rationale: '这是一个可独立评审的大块交付。',
        },
      ],
    })).toMatchObject({
      allowed: true,
      errorCount: 0,
    });
  });

  it('blocks creating another decomposition when the project already has open children', () => {
    const parent = task({
      id: 'project_1',
      title: '开发小程序',
      type: 'project',
      childTaskIds: ['child_1'],
    });
    const child = task({
      id: 'child_1',
      title: '小程序需求分析与功能设计',
      parentTaskId: parent.id,
    });

    expect(evaluateRuntimeSubtaskDraft({
      parentTask: parent,
      existingTasks: [parent, child],
      proposedSubtasks: [
        {
          title: '小程序上线准备',
          summary: '完成上线前检查。',
          acceptanceCriteria: '上线清单被确认。',
          dependency: null,
          rationale: '上线准备可以独立推进。',
        },
      ],
    })).toMatchObject({
      allowed: false,
      errorCount: 1,
      issues: [expect.objectContaining({ code: 'parent_has_children' })],
    });
  });

  it('blocks generating another decomposition when legacy follow-up children already exist', () => {
    const parent = task({
      id: 'project_1',
      title: '开发小程序',
      type: 'project',
    });
    const legacyChild = task({
      id: 'followup_1',
      title: '拆解下一步：开发小程序',
    });

    expect(evaluateRuntimeSubtaskDraft({
      parentTask: parent,
      existingTasks: [parent, legacyChild],
      proposedSubtasks: [],
    })).toMatchObject({
      allowed: false,
      errorCount: 1,
      issues: [expect.objectContaining({ code: 'parent_has_children' })],
    });
  });

  it('blocks duplicate and generic phase-template subtasks', () => {
    const parent = task({ id: 'project_1', title: '开发小程序', type: 'project' });

    const result = evaluateRuntimeSubtaskDraft({
      parentTask: parent,
      existingTasks: [parent],
      proposedSubtasks: [
        {
          title: '拆解下一步：开发小程序',
          summary: '拆解下一步：开发小程序',
          acceptanceCriteria: '完成后能明确验收。',
          dependency: null,
          rationale: '后续任务。',
        },
        {
          title: '拆解下一步：开发小程序',
          summary: '继续拆解。',
          acceptanceCriteria: '验收通过。',
          dependency: null,
          rationale: '后续任务。',
        },
      ],
    });

    expect(result.allowed).toBe(false);
    expect(result.issues.map((item) => item.code)).toEqual(expect.arrayContaining([
      'duplicate_title',
      'generic_phase_template',
      'missing_acceptance',
      'too_close_to_parent',
    ]));
  });

  it('warns when a dependency cannot be matched', () => {
    const parent = task({ id: 'project_1', title: '发布项目', type: 'project' });

    expect(evaluateRuntimeSubtaskDraft({
      parentTask: parent,
      existingTasks: [parent],
      proposedSubtasks: [
        {
          title: '发布验收',
          summary: '完成发布前验收。',
          acceptanceCriteria: '验收结果和遗留风险被记录。',
          dependency: '外部安全审批',
          rationale: '发布验收可以独立推进。',
        },
      ],
    })).toMatchObject({
      allowed: true,
      warningCount: 1,
      issues: [expect.objectContaining({ code: 'unknown_dependency' })],
    });
  });
});
