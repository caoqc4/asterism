import { describe, expect, it } from 'vitest';

import { evaluateSourceMaterialQuality } from './source-material-quality-evaluator.js';

describe('source material quality evaluator', () => {
  it('excludes archived and duplicate sources', () => {
    expect(evaluateSourceMaterialQuality({
      status: 'archived',
      title: '旧材料',
      uri: 'https://example.com/old',
    })).toMatchObject({
      decision: 'exclude',
      reason: 'archived',
    });

    expect(evaluateSourceMaterialQuality({
      isDuplicate: true,
      title: '重复来源',
      uri: 'https://example.com/source',
    })).toMatchObject({
      decision: 'exclude',
      reason: 'duplicate',
      duplicate: true,
    });
  });

  it('cautions on sensitive or untraceable material', () => {
    expect(evaluateSourceMaterialQuality({
      title: '部署 token',
      content: 'API_KEY=secret-value',
      uri: 'https://example.com/private',
    })).toMatchObject({
      decision: 'caution',
      reason: 'sensitive',
      sensitive: true,
    });

    expect(evaluateSourceMaterialQuality({
      title: '口头备注',
      kind: 'note',
      content: '客户好像改了想法',
    })).toMatchObject({
      decision: 'caution',
      reason: 'missing_trace',
      traceable: false,
    });
  });

  it('keeps stable and key traceable sources available', () => {
    expect(evaluateSourceMaterialQuality({
      title: 'Agent 规范',
      sourceRole: 'stable_reference',
    })).toMatchObject({
      decision: 'include',
      reason: 'stable_reference',
      credibility: 'verified',
      traceable: true,
    });

    expect(evaluateSourceMaterialQuality({
      title: '用户确认的设计稿',
      isKey: true,
      uri: 'https://example.com/design',
    })).toMatchObject({
      decision: 'include',
      reason: 'key_source',
    });
  });

  it('cautions on low credibility even when traceable', () => {
    expect(evaluateSourceMaterialQuality({
      title: '未经确认的论坛摘录',
      uri: 'https://forum.example.com/thread',
      credibility: 'low',
    })).toMatchObject({
      decision: 'caution',
      reason: 'low_credibility',
    });
  });
});
