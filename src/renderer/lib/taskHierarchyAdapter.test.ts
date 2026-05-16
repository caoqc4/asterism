// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import type { TaskListItemRecord } from '@shared/types/task';
import { saveTaskAttributes } from './taskAttributes';
import {
  authoritativeChildTaskIds,
  authoritativeParentTaskId,
  authoritativeTaskFacets,
  authoritativeTaskType,
  orderedChildRecordsForTask,
} from './taskHierarchyAdapter';

const now = '2026-01-01T00:00:00.000Z';

function task(partial: Partial<TaskListItemRecord>): TaskListItemRecord {
  return {
    id: partial.id ?? 'task_1',
    title: partial.title ?? '任务',
    summary: partial.summary ?? null,
    state: partial.state ?? 'planned',
    nextStep: partial.nextStep ?? null,
    waitingReason: partial.waitingReason ?? null,
    riskLevel: partial.riskLevel ?? 'none',
    riskNote: partial.riskNote ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    taskType: partial.taskType,
    taskFacets: partial.taskFacets,
    parentTaskId: partial.parentTaskId,
    childTaskIds: partial.childTaskIds,
    activeWaitingItem: partial.activeWaitingItem ?? null,
    activeBlocker: partial.activeBlocker ?? null,
    activeDependency: partial.activeDependency ?? null,
    dependencyReevaluation: partial.dependencyReevaluation ?? null,
  };
}

describe('task hierarchy adapter', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('orders child records from renderer task attributes through the shared hierarchy rules', () => {
    const parent = task({ id: 'project_1', title: '开发小程序' });
    const first = task({ id: 'child_1', title: '需求分析', updatedAt: '2026-01-01T01:00:00.000Z' });
    const second = task({ id: 'child_2', title: '实现开发', updatedAt: '2026-01-01T02:00:00.000Z' });
    const third = task({ id: 'child_3', title: '验收', updatedAt: '2026-01-01T00:30:00.000Z' });

    saveTaskAttributes(parent.id, {
      type: 'project',
      typeConfirmed: true,
      childTaskIds: [second.id, first.id],
    });
    saveTaskAttributes(third.id, {
      type: 'simple',
      typeConfirmed: true,
      parentTaskId: parent.id,
    });

    expect(orderedChildRecordsForTask(parent, [parent, first, second, third]).map((item) => item.id)).toEqual([
      second.id,
      first.id,
      third.id,
    ]);
  });

  it('keeps persisted hierarchy fields authoritative over stale renderer attributes', () => {
    const record = task({
      id: 'task_1',
      taskType: 'simple',
      taskFacets: ['simple'],
      parentTaskId: null,
      childTaskIds: [],
    });
    saveTaskAttributes(record.id, {
      type: 'project',
      facets: ['project'],
      typeConfirmed: true,
      parentTaskId: 'stale_parent',
      childTaskIds: ['stale_child'],
    });
    const attrs = saveTaskAttributes(record.id, {});

    expect(authoritativeTaskType(record, attrs)).toBe('simple');
    expect(authoritativeTaskFacets(record, attrs)).toEqual(['simple']);
    expect(authoritativeParentTaskId(record, attrs)).toBeNull();
    expect(authoritativeChildTaskIds(record, attrs)).toEqual([]);
  });

  it('does not let stale renderer child ids override explicit persisted hierarchy', () => {
    const parent = task({
      id: 'project_1',
      title: '开发小程序',
      taskType: 'project',
      parentTaskId: null,
      childTaskIds: [],
    });
    const followup = task({
      id: 'followup_1',
      title: '拆解下一步：开发小程序',
      taskType: 'simple',
      parentTaskId: null,
      childTaskIds: [],
    });
    saveTaskAttributes(parent.id, {
      type: 'project',
      typeConfirmed: true,
      childTaskIds: [followup.id],
    });
    saveTaskAttributes(followup.id, {
      type: 'simple',
      typeConfirmed: true,
      parentTaskId: parent.id,
    });

    expect(orderedChildRecordsForTask(parent, [parent, followup]).map((item) => item.id)).toEqual([]);
  });

  it('uses renderer attributes only when persisted hierarchy fields are absent', () => {
    const record = task({ id: 'legacy_task' });
    saveTaskAttributes(record.id, {
      type: 'project',
      facets: ['project'],
      typeConfirmed: true,
      parentTaskId: 'legacy_parent',
      childTaskIds: ['legacy_child'],
    });
    const attrs = saveTaskAttributes(record.id, {});

    expect(authoritativeTaskType(record, attrs)).toBe('project');
    expect(authoritativeTaskFacets(record, attrs)).toEqual(['project']);
    expect(authoritativeParentTaskId(record, attrs)).toBe('legacy_parent');
    expect(authoritativeChildTaskIds(record, attrs)).toEqual(['legacy_child']);
  });
});
