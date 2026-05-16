import { describe, expect, it } from 'vitest';

import { projectDecisionJudgment } from './decision-judgment-projection.js';
import type { DecisionRecord } from './types/decision.js';
import type { TaskListItemRecord } from './types/task.js';

function decision(partial: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: partial.id ?? 'decision_1',
    taskId: partial.taskId ?? 'task_1',
    title: partial.title ?? '确认发布窗口',
    status: partial.status ?? 'pending',
    scope: partial.scope ?? 'task',
    kind: partial.kind ?? 'direction_choice',
    sourceType: partial.sourceType ?? 'manual',
    sourceId: partial.sourceId ?? null,
    sourceLabel: partial.sourceLabel ?? null,
    context: partial.context ?? null,
    options: partial.options,
    recommendation: partial.recommendation ?? null,
    createdAt: partial.createdAt ?? '2026-05-14T08:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-05-14T09:00:00.000Z',
  };
}

function task(partial: Partial<TaskListItemRecord> = {}): TaskListItemRecord {
  return {
    id: partial.id ?? 'task_1',
    title: partial.title ?? '发布官网',
    summary: partial.summary ?? '准备发布',
    state: partial.state ?? 'planned',
    riskLevel: partial.riskLevel ?? 'none',
    riskNote: partial.riskNote ?? null,
    nextStep: partial.nextStep ?? '确认发布时间',
    waitingReason: partial.waitingReason ?? null,
    activeBlocker: partial.activeBlocker ?? null,
    activeDependency: partial.activeDependency ?? null,
    activeWaitingItem: partial.activeWaitingItem ?? null,
    createdAt: partial.createdAt ?? '2026-05-14T08:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-05-14T09:00:00.000Z',
  };
}

describe('decision judgment projection', () => {
  it('projects agent checkpoint decisions as today items with resume options', () => {
    const projected = projectDecisionJudgment(decision({
      kind: 'agent_resume',
      sourceType: 'agent_checkpoint',
      sourceLabel: '工具确认',
    }), task());

    expect(projected).toMatchObject({
      category: { key: 'agent', label: 'Agent 暂停' },
      urgency: 'today',
      recommendation: '恢复执行',
      recommendationClarity: 'review',
      impactLabel: '高影响',
    });
    expect(projected.options.map((option) => option.label)).toEqual(['恢复执行', '暂停等待', '取消本次执行']);
    expect(projected.context.whyNow).toContain('执行检查点暂停');
  });

  it('projects risky decisions with risk impact and source labels', () => {
    const projected = projectDecisionJudgment(decision({
      kind: 'external_write',
      scope: 'external_access',
      sourceLabel: 'Slack 发布',
      title: '是否发送外部通知',
    }), task({ riskLevel: 'high' }));

    expect(projected).toMatchObject({
      category: { key: 'risk', label: '外部写入' },
      sourceLabel: 'Slack 发布',
      impactLabel: '高影响',
      reversibilityLabel: '需留痕',
    });
    expect(projected.context.ifDeferred).toContain('高风险动作不会继续执行');
  });

  it('uses explicit decision context and options when provided', () => {
    const projected = projectDecisionJudgment(decision({
      context: {
        whyNow: '必须在发布前确认。',
        ifDeferred: '发布保持暂停。',
      },
      options: [{
        id: 'approve',
        label: '按 A 方案',
        description: '使用 A 方案推进。',
      }],
      recommendation: {
        optionId: 'approve',
        label: '按 A 方案',
        reason: '风险较低。',
      },
    }), task());

    expect(projected.context).toEqual({
      whyNow: '必须在发布前确认。',
      ifDeferred: '发布保持暂停。',
    });
    expect(projected.recommendation).toBe('按 A 方案');
    expect(projected.options).toEqual([{
      label: '按 A 方案',
      desc: '使用 A 方案推进。',
      risk: undefined,
    }]);
  });
});
