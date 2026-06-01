// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildTaskTypeProfile,
  buildProjectDecompositionGuidance,
  buildProjectDecompositionPrompt,
  buildTaskPlanningPrompt,
  clearTaskHierarchyAttributes,
  clearTaskHierarchyAttributesForPersistedTasks,
  inferTaskExecutionType,
  inferTaskTypeProfile,
  loadTaskAttributes,
  saveTaskAttributes,
} from './taskAttributes';

beforeEach(() => {
  window.localStorage.clear();
});

describe('buildProjectDecompositionPrompt', () => {
  it('keeps project decomposition counts flexible instead of hard-coding child tasks', () => {
    const prompt = buildProjectDecompositionPrompt('官网改版项目');

    expect(prompt).toContain('根据项目边界决定子任务数量');
    expect(prompt).not.toContain('Taskplane Agent Operating Principles');
    expect(prompt).not.toContain('## Task Creation Protocol');
    expect(prompt).not.toContain('Subtasks remain drafts until the user confirms creation.');
    expect(prompt).toContain('不要为凑数量拆任务');
    expect(prompt).toContain('复杂子任务应升级为项目型');
    expect(prompt).not.toContain('给出 3-7 个子任务');
  });

  it('shares decomposition guidance without forcing a display output format', () => {
    const guidance = buildProjectDecompositionGuidance('官网改版项目');

    expect(guidance).toContain('先拆一版');
    expect(guidance).toContain('再自检查');
    expect(guidance).toContain('最多两层');
    expect(guidance).not.toContain('输出格式');
  });
});

describe('buildTaskPlanningPrompt', () => {
  it('keeps shared planning prompts while tailoring entry labels by surface', () => {
    const captureProject = buildTaskPlanningPrompt('官网改版项目', 'project');
    const panelProject = buildTaskPlanningPrompt('官网改版项目', 'project', 'panel');
    const scheduled = buildTaskPlanningPrompt('经营周报', 'scheduled', 'panel');
    const routine = buildTaskPlanningPrompt('知识库整理', 'routine', 'panel');

    expect(captureProject.label).toBe('让 AI 拆解并检查');
    expect(panelProject.label).toBe('拆解项目结构');
    expect(captureProject.prompt).toBe(panelProject.prompt);
    expect(scheduled.label).toBe('确认周期与节奏');
    expect(scheduled.prompt).toContain('周期');
    expect(scheduled.prompt).toContain('第一次执行前');
    expect(routine.label).toBe('规划常设维护');
    expect(routine.prompt).toContain('长期存在的目的');
  });
});

describe('inferTaskExecutionType', () => {
  it('treats software development goals as project work', () => {
    expect(inferTaskExecutionType('开发小程序')).toBe('project');
    expect(inferTaskExecutionType('开发一个内部应用')).toBe('project');
  });

  it('treats ongoing knowledge and operations work as routine tasks', () => {
    expect(inferTaskExecutionType('知识库整理')).toBe('routine');
    expect(inferTaskExecutionType('日常笔记管理')).toBe('routine');
  });
});

describe('task type profiles', () => {
  it('keeps one primary type while allowing composite facets', () => {
    const profile = buildTaskTypeProfile('routine', ['scheduled', 'event'], {
      owner: 'system',
      visibility: 'hidden',
    });

    expect(profile).toEqual({
      primaryType: 'routine',
      facets: ['routine', 'scheduled', 'event'],
      owner: 'system',
      visibility: 'hidden',
    });
  });

  it('infers news tracking as routine work with scheduled and event-triggered facets', () => {
    const profile = inferTaskTypeProfile('每日监控新闻资讯更新');

    expect(profile.primaryType).toBe('routine');
    expect(profile.facets).toEqual(['routine', 'scheduled', 'event']);
  });
});

describe('task attribute hierarchy compatibility', () => {
  it('does not write empty hierarchy fields unless hierarchy is explicitly patched', () => {
    const attrs = saveTaskAttributes('task_1', {
      type: 'project',
      typeConfirmed: true,
      commitment: '今晚前推进',
    });

    expect(attrs.parentTaskId).toBeUndefined();
    expect(attrs.childTaskIds).toBeUndefined();
    expect(loadTaskAttributes().task_1).not.toHaveProperty('parentTaskId');
    expect(loadTaskAttributes().task_1).not.toHaveProperty('childTaskIds');
  });

  it('preserves explicit legacy hierarchy fields until the cleanup helper clears them', () => {
    saveTaskAttributes('project_1', {
      type: 'project',
      typeConfirmed: true,
      childTaskIds: ['child_1'],
    });
    saveTaskAttributes('child_1', {
      type: 'simple',
      typeConfirmed: true,
      parentTaskId: 'project_1',
    });

    const before = loadTaskAttributes();
    expect(before.project_1?.childTaskIds).toEqual(['child_1']);
    expect(before.child_1?.parentTaskId).toBe('project_1');

    const result = clearTaskHierarchyAttributes(['project_1', 'child_1']);

    expect(result.clearedTaskIds).toEqual(['project_1', 'child_1']);
    const after = loadTaskAttributes();
    expect(after.project_1).not.toHaveProperty('childTaskIds');
    expect(after.project_1?.type).toBe('project');
    expect(after.child_1).not.toHaveProperty('parentTaskId');
    expect(after.child_1?.type).toBe('simple');
  });

  it('clears legacy hierarchy fields only for records with persisted hierarchy authority', () => {
    saveTaskAttributes('persisted_project', {
      type: 'project',
      typeConfirmed: true,
      childTaskIds: ['child_1'],
    });
    saveTaskAttributes('legacy_only', {
      type: 'project',
      typeConfirmed: true,
      childTaskIds: ['legacy_child'],
    });

    const result = clearTaskHierarchyAttributesForPersistedTasks([
      { id: 'persisted_project', parentTaskId: null, childTaskIds: ['child_1'] },
      { id: 'legacy_only' },
    ]);

    expect(result.clearedTaskIds).toEqual(['persisted_project']);
    const after = loadTaskAttributes();
    expect(after.persisted_project).not.toHaveProperty('childTaskIds');
    expect(after.legacy_only?.childTaskIds).toEqual(['legacy_child']);
  });
});
