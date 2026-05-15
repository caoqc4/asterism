import { describe, expect, it } from 'vitest';

import { evaluateSourceFreshness } from './source-freshness-evaluator.js';

const now = '2026-05-15T00:00:00.000Z';

describe('source freshness evaluator', () => {
  it('excludes archived sources', () => {
    expect(evaluateSourceFreshness({
      now,
      status: 'archived',
      title: '旧材料',
      updatedAt: '2026-05-14T00:00:00.000Z',
    })).toMatchObject({
      decision: 'exclude',
      reason: 'archived',
    });
  });

  it('includes explicitly selected and current-run sources regardless of age', () => {
    expect(evaluateSourceFreshness({
      now,
      selected: true,
      title: '用户选中文件',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })).toMatchObject({
      decision: 'include',
      reason: 'explicitly_selected',
    });

    expect(evaluateSourceFreshness({
      currentRunId: 'run_1',
      now,
      runId: 'run_1',
      title: '当前执行摘要',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })).toMatchObject({
      decision: 'include',
      reason: 'current_run',
    });
  });

  it('keeps stable references and key sources available with explicit caution when stale', () => {
    expect(evaluateSourceFreshness({
      now,
      sourceRole: 'stable_reference',
      title: 'Agent 规范',
      updatedAt: '2025-01-01T00:00:00.000Z',
    })).toMatchObject({
      decision: 'include',
      reason: 'stable_reference',
    });

    expect(evaluateSourceFreshness({
      isKey: true,
      now,
      title: '关键来源',
      updatedAt: '2026-03-01T00:00:00.000Z',
    })).toMatchObject({
      decision: 'caution',
      reason: 'key_source',
      ageDays: 75,
    });
  });

  it('includes recent ordinary sources and excludes stale ordinary sources', () => {
    expect(evaluateSourceFreshness({
      now,
      title: '近期来源',
      updatedAt: '2026-05-10T00:00:00.000Z',
    })).toMatchObject({
      decision: 'include',
      reason: 'recent',
      ageDays: 5,
    });

    expect(evaluateSourceFreshness({
      now,
      title: '陈旧来源',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })).toMatchObject({
      decision: 'exclude',
      reason: 'stale',
    });
  });

  it('marks undated sources as caution instead of pretending they are fresh', () => {
    expect(evaluateSourceFreshness({ now, title: '无日期来源' })).toMatchObject({
      decision: 'caution',
      reason: 'undated',
      ageDays: null,
    });
  });
});
