import { describe, expect, it } from 'vitest';

import {
  effectiveParentTaskId,
  findNextOpenChildAfter,
  isTopLevelTask,
  orderedTaskChildren,
  type TaskHierarchyNode,
} from './task-hierarchy.js';

function node(partial: Partial<TaskHierarchyNode>): TaskHierarchyNode {
  return {
    id: partial.id ?? 'task_1',
    title: partial.title ?? '任务',
    type: partial.type ?? 'simple',
    state: partial.state ?? 'planned',
    status: partial.status ?? 'idle',
    parentTaskId: partial.parentTaskId ?? null,
    childTaskIds: partial.childTaskIds ?? [],
    updatedAtIso: partial.updatedAtIso ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('task hierarchy helpers', () => {
  it('treats legacy phase follow-up tasks as children of their named project parent', () => {
    const project = node({ id: 'project_1', title: '开发小程序', type: 'project' });
    const followup = node({ id: 'followup_1', title: '拆解下一步：开发小程序', type: 'simple' });

    expect(effectiveParentTaskId(followup, [project, followup])).toBe(project.id);
    expect(isTopLevelTask(followup, [project, followup])).toBe(false);
  });

  it('orders children by parent child ids before falling back to update time', () => {
    const project = node({ id: 'project_1', title: '开发小程序', type: 'project', childTaskIds: ['child_2', 'child_1'] });
    const first = node({ id: 'child_1', title: '需求分析', parentTaskId: project.id, updatedAtIso: '2026-01-01T01:00:00.000Z' });
    const second = node({ id: 'child_2', title: '实现开发', parentTaskId: project.id, updatedAtIso: '2026-01-01T02:00:00.000Z' });
    const third = node({ id: 'child_3', title: '验收', parentTaskId: project.id, updatedAtIso: '2026-01-01T00:30:00.000Z' });

    expect(orderedTaskChildren(project, [project, first, second, third]).map((task) => task.id)).toEqual([
      'child_2',
      'child_1',
      'child_3',
    ]);
  });

  it('recognizes parent-side child ids even before child-side parent ids are written', () => {
    const project = node({ id: 'project_1', title: '开发小程序', type: 'project', childTaskIds: ['child_1'] });
    const child = node({ id: 'child_1', title: '需求分析', parentTaskId: null });

    expect(orderedTaskChildren(project, [project, child]).map((task) => task.id)).toEqual(['child_1']);
  });

  it('finds the next open sibling after a completed child', () => {
    const project = node({ id: 'project_1', title: '上线项目', type: 'project', childTaskIds: ['child_1', 'child_2', 'child_3'] });
    const first = node({ id: 'child_1', title: '需求确认', parentTaskId: project.id, status: 'done', state: 'completed' });
    const second = node({ id: 'child_2', title: '界面设计', parentTaskId: project.id, status: 'idle', state: 'planned' });
    const third = node({ id: 'child_3', title: '发布', parentTaskId: project.id, status: 'done', state: 'archived' });

    expect(findNextOpenChildAfter(first, [project, first, second, third])).toMatchObject({
      nextTask: second,
      parentTask: project,
    });
  });
});
