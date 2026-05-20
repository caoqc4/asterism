import { describe, expect, it } from 'vitest';

import {
  effectiveParentTaskId,
  findNextOpenChildAfter,
  isTopLevelTask,
  orderedChildrenForTask,
  orderedTaskChildren,
  type TaskHierarchyNode,
} from './task-hierarchy.js';

function node(partial: Partial<TaskHierarchyNode>): TaskHierarchyNode {
  const result: TaskHierarchyNode = {
    id: partial.id ?? 'task_1',
    title: partial.title ?? '任务',
    type: partial.type ?? 'simple',
    state: partial.state ?? 'planned',
    status: partial.status ?? 'idle',
    blockedByTaskId: partial.blockedByTaskId,
    childTaskIds: partial.childTaskIds ?? [],
    updatedAtIso: partial.updatedAtIso ?? '2026-01-01T00:00:00.000Z',
  };
  if (Object.prototype.hasOwnProperty.call(partial, 'parentTaskId')) {
    result.parentTaskId = partial.parentTaskId ?? null;
  }
  return result;
}

describe('task hierarchy helpers', () => {
  it('treats legacy phase follow-up tasks as children when a matching project parent exists', () => {
    const project = node({ id: 'project_1', title: '开发小程序', type: 'project' });
    const followup = node({ id: 'followup_1', title: '拆解下一步：开发小程序', type: 'simple' });

    expect(effectiveParentTaskId(followup, [project, followup])).toBe(project.id);
    expect(isTopLevelTask(followup, [project, followup])).toBe(false);
  });

  it('still infers a legacy parent when older records explicitly stored no parent', () => {
    const project = node({ id: 'project_1', title: '开发小程序', type: 'project', parentTaskId: null });
    const followup = node({
      id: 'followup_1',
      title: '拆解下一步：开发小程序',
      type: 'simple',
      parentTaskId: null,
    });

    expect(effectiveParentTaskId(followup, [project, followup])).toBe(project.id);
    expect(isTopLevelTask(followup, [project, followup])).toBe(false);
  });

  it('includes legacy phase follow-ups as project children in hierarchy projection', () => {
    const project = node({ id: 'project_1', title: '开发小程序', type: 'project', parentTaskId: null });
    const followup = node({
      id: 'followup_1',
      title: '拆解下一步：开发小程序',
      type: 'simple',
      parentTaskId: null,
    });

    expect(orderedTaskChildren(project, [project, followup])).toEqual([followup]);
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

    expect(effectiveParentTaskId(child, [project, child])).toBe(project.id);
    expect(isTopLevelTask(child, [project, child])).toBe(false);
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

  it('projects old dependency-chain project work under a matching top-level parent', () => {
    const project = node({ id: 'project_1', title: '开发小程序', type: 'simple' });
    const requirement = node({ id: 'child_1', title: '小程序需求分析与功能设计' });
    const development = node({
      id: 'child_2',
      title: '小程序前后端开发与联调',
      blockedByTaskId: requirement.id,
    });
    const testing = node({
      id: 'child_3',
      title: '小程序测试、安全加固与性能优化',
      blockedByTaskId: development.id,
    });

    expect(effectiveParentTaskId(requirement, [project, requirement, development, testing])).toBe(project.id);
    expect(effectiveParentTaskId(development, [project, requirement, development, testing])).toBe(project.id);
    expect(effectiveParentTaskId(testing, [project, requirement, development, testing])).toBe(project.id);
    expect(orderedChildrenForTask(project, [project, requirement, development, testing]).map((task) => task.id)).toEqual([
      'child_1',
      'child_2',
      'child_3',
    ]);
  });

  it('does not infer a project parent for an unrelated standalone task with a matching word', () => {
    const project = node({ id: 'project_1', title: '开发小程序', type: 'simple' });
    const standalone = node({ id: 'task_2', title: '小程序资料归档' });

    expect(effectiveParentTaskId(standalone, [project, standalone])).toBeNull();
    expect(isTopLevelTask(standalone, [project, standalone])).toBe(true);
  });
});
