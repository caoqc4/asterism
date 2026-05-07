import { describe, expect, it } from 'vitest';

import { buildProjectDecompositionGuidance, buildProjectDecompositionPrompt } from './taskAttributes';

describe('buildProjectDecompositionPrompt', () => {
  it('keeps project decomposition counts flexible instead of hard-coding child tasks', () => {
    const prompt = buildProjectDecompositionPrompt('官网改版项目');

    expect(prompt).toContain('根据项目边界决定子任务数量');
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
