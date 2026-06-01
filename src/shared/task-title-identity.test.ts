import { describe, expect, it } from 'vitest';

import {
  isLikelyDuplicateTaskTitle,
  taskTitleIdentity,
} from './task-title-identity.js';

describe('task title identity', () => {
  it('detects duplicate task titles when wording adds generic modifiers', () => {
    expect(isLikelyDuplicateTaskTitle('开发小程序', '开发一个微信小程序')).toBe(true);
    expect(isLikelyDuplicateTaskTitle('小程序需求分析与功能设计', '微信小程序需求与功能分析设计')).toBe(true);
  });

  it('keeps related tasks distinct when the action boundary differs', () => {
    expect(isLikelyDuplicateTaskTitle('小程序开发', '小程序测试')).toBe(false);
    expect(isLikelyDuplicateTaskTitle('小程序前端开发', '小程序后端开发')).toBe(false);
  });

  it('exposes a small action and object identity for diagnostics', () => {
    expect(taskTitleIdentity('开发一个微信小程序')).toMatchObject({
      actionCategory: 'development',
      objectKey: '小程序',
    });
  });
});
