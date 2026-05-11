import { describe, expect, it } from 'vitest';

import {
  buildProjectDecompositionGuidance,
  buildProjectDecompositionPrompt,
  buildTaskPlanningPrompt,
  inferTaskExecutionType,
} from './taskAttributes';

describe('buildProjectDecompositionPrompt', () => {
  it('keeps project decomposition counts flexible instead of hard-coding child tasks', () => {
    const prompt = buildProjectDecompositionPrompt('官网改版项目');

    expect(prompt).toContain('根据项目边界决定子任务数量');
    expect(prompt).toContain('Taskplane Agent Operating Principles');
    expect(prompt).toContain('## Task Creation Protocol');
    expect(prompt).toContain('Subtasks remain drafts until the user confirms creation.');
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

    expect(captureProject.label).toBe('让 AI 拆解并检查');
    expect(panelProject.label).toBe('拆解项目结构');
    expect(captureProject.prompt).toBe(panelProject.prompt);
    expect(scheduled.label).toBe('确认周期与节奏');
    expect(scheduled.prompt).toContain('周期');
    expect(scheduled.prompt).toContain('第一次执行前');
  });
});

describe('inferTaskExecutionType', () => {
  it('treats software development goals as project work', () => {
    expect(inferTaskExecutionType('开发小程序')).toBe('project');
    expect(inferTaskExecutionType('开发一个内部应用')).toBe('project');
  });
});
