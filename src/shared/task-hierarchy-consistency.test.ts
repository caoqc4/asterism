import { describe, expect, it } from 'vitest';

import {
  buildTaskHierarchyRepairPlan,
  evaluateTaskHierarchyConsistency,
} from './task-hierarchy-consistency.js';
import type { TaskHierarchyNode } from './task-hierarchy.js';

function task(partial: Partial<TaskHierarchyNode> & { id: string; title?: string }): TaskHierarchyNode {
  return {
    id: partial.id,
    title: partial.title ?? partial.id,
    parentTaskId: partial.parentTaskId ?? null,
    childTaskIds: partial.childTaskIds ?? [],
    type: partial.type ?? null,
  };
}

describe('task hierarchy consistency', () => {
  it('passes when parent and child links agree', () => {
    expect(evaluateTaskHierarchyConsistency([
      task({ id: 'project_1', title: '开发小程序', childTaskIds: ['child_1'] }),
      task({ id: 'child_1', title: '需求分析', parentTaskId: 'project_1' }),
    ])).toMatchObject({
      consistent: true,
      issueCount: 0,
    });
  });

  it('detects parent-side child list issues', () => {
    const result = evaluateTaskHierarchyConsistency([
      task({ id: 'project_1', title: '开发小程序', childTaskIds: ['child_1', 'child_1', 'missing_child'] }),
      task({ id: 'child_1', title: '需求分析', parentTaskId: null }),
    ]);

    expect(result.consistent).toBe(false);
    expect(result.issues.map((item) => item.code)).toEqual([
      'missing_parent_backlink',
      'duplicate_child_id',
      'missing_child_record',
    ]);
  });

  it('detects child-side parent issues', () => {
    const result = evaluateTaskHierarchyConsistency([
      task({ id: 'project_1', title: '开发小程序', childTaskIds: [] }),
      task({ id: 'child_1', title: '需求分析', parentTaskId: 'project_1' }),
      task({ id: 'child_2', title: '实现开发', parentTaskId: 'missing_project' }),
    ]);

    expect(result.issues.map((item) => item.code)).toEqual([
      'missing_parent_child_link',
      'missing_parent_record',
    ]);
  });

  it('detects self links and children listed under multiple parents', () => {
    const result = evaluateTaskHierarchyConsistency([
      task({ id: 'project_1', childTaskIds: ['child_1'] }),
      task({ id: 'project_2', childTaskIds: ['child_1'] }),
      task({ id: 'child_1', parentTaskId: 'project_1' }),
      task({ id: 'loop', parentTaskId: 'loop', childTaskIds: ['loop'] }),
    ]);

    expect(result.issues.map((item) => item.code)).toEqual([
      'child_listed_under_multiple_parents',
      'missing_parent_backlink',
      'self_child',
      'self_child',
    ]);
  });

  it('plans a safe child parent repair when the parent already lists the child', () => {
    const result = buildTaskHierarchyRepairPlan([
      task({ id: 'project_1', title: '开发小程序', childTaskIds: ['child_1'] }),
      task({ id: 'child_1', title: '需求分析', parentTaskId: null }),
    ]);

    expect(result).toMatchObject({
      canAutoApplyAll: true,
      safeActionCount: 1,
      manualReviewCount: 0,
      actions: [
        {
          kind: 'set_child_parent',
          taskId: 'child_1',
          relatedTaskId: 'project_1',
          safeToApply: true,
        },
      ],
    });
  });

  it('plans a safe parent child-list repair when the child already points to the parent', () => {
    const result = buildTaskHierarchyRepairPlan([
      task({ id: 'project_1', title: '开发小程序', childTaskIds: [] }),
      task({ id: 'child_1', title: '需求分析', parentTaskId: 'project_1' }),
    ]);

    expect(result).toMatchObject({
      canAutoApplyAll: true,
      safeActionCount: 1,
      manualReviewCount: 0,
      actions: [
        {
          kind: 'add_parent_child_link',
          taskId: 'project_1',
          relatedTaskId: 'child_1',
          safeToApply: true,
        },
      ],
    });
  });

  it('requires manual review when a child already points to another parent', () => {
    const result = buildTaskHierarchyRepairPlan([
      task({ id: 'project_1', title: '开发小程序', childTaskIds: ['child_1'] }),
      task({ id: 'project_2', title: '运营计划', childTaskIds: ['child_1'] }),
      task({ id: 'child_1', title: '需求分析', parentTaskId: 'project_1' }),
    ]);

    expect(result.canAutoApplyAll).toBe(false);
    expect(result.manualReviewCount).toBe(2);
    expect(result.actions.map((item) => item.kind)).toEqual([
      'manual_review',
      'manual_review',
    ]);
  });
});
