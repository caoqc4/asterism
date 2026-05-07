import { describe, expect, it } from 'vitest';

import { buildProjectDecompositionPrompt } from './taskAttributes';

describe('buildProjectDecompositionPrompt', () => {
  it('keeps project decomposition counts flexible instead of hard-coding child tasks', () => {
    const prompt = buildProjectDecompositionPrompt('官网改版项目');

    expect(prompt).toContain('根据项目边界决定子任务数量');
    expect(prompt).toContain('不要为凑数量拆任务');
    expect(prompt).not.toContain('给出 3-7 个子任务');
  });
});
