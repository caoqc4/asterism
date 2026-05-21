import { describe, expect, it } from 'vitest';

import {
  buildTaskTypeProfile,
  inferTaskExecutionType,
  inferTaskTypeProfile,
} from './task-type-profile.js';

describe('task type profile', () => {
  it('treats software development goals as project work', () => {
    expect(inferTaskExecutionType('开发小程序')).toBe('project');
    expect(inferTaskExecutionType('开发一个内部应用')).toBe('project');
  });

  it('treats ongoing knowledge and operations work as routine tasks', () => {
    expect(inferTaskExecutionType('知识库整理')).toBe('routine');
    expect(inferTaskExecutionType('日常笔记管理')).toBe('routine');
  });

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
