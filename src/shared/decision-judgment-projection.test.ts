import { describe, expect, it } from 'vitest';

import { projectDecisionJudgment, projectDecisionJudgments } from './decision-judgment-projection.js';
import type { DecisionRecord } from './types/decision.js';
import type { TaskListItemRecord } from './types/task.js';

function decision(partial: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: partial.id ?? 'decision_1',
    taskId: partial.taskId === undefined ? 'task_1' : partial.taskId,
    title: partial.title ?? '确认发布窗口',
    status: partial.status ?? 'pending',
    scope: partial.scope ?? 'task',
    kind: partial.kind ?? 'direction_choice',
    sourceType: partial.sourceType === undefined ? 'manual' : partial.sourceType,
    sourceId: partial.sourceId === undefined ? null : partial.sourceId,
    sourceLabel: partial.sourceLabel === undefined ? null : partial.sourceLabel,
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
      sourceTarget: {
        kind: 'agent_checkpoint',
        label: '工具确认',
        routeHint: 'resume_checkpoint',
        taskId: 'task_1',
      },
      sourceKindLabel: 'Agent 检查点',
      sourceActionLabel: '查看任务上下文',
      boundaryLabel: '批准后仅恢复当前检查点，不授予长期权限',
    });
    expect(projected.options.map((option) => option.label)).toEqual(['恢复执行', '暂停等待', '取消本次执行']);
    expect(projected.context.whyNow).toContain('执行检查点暂停');
  });

  it('projects patch-promotion checkpoints as workspace write approvals', () => {
    const projected = projectDecisionJudgment(decision({
      kind: 'agent_resume',
      sourceType: 'agent_checkpoint',
      sourceLabel: 'workspace.staged_patch',
      title: '确认提升 sandbox patch',
    }), task());

    expect(projected).toMatchObject({
      category: { key: 'risk', label: '工作区写入' },
      urgency: 'today',
      recommendation: '批准 reviewed patch',
      recommendationClarity: 'review',
      impactLabel: '工作区写入影响',
      reversibilityLabel: '需预检留痕',
      sourceKindLabel: 'Agent 检查点',
      boundaryLabel: '批准仅覆盖当前 reviewed patch；只有 apply flag 开启时才会写入匹配工作区文件',
    });
    expect(projected.context.whyNow).toContain('只有启用 apply flag 时，批准才会先预检再写入匹配文件');
    expect(projected.context.ifDeferred).toContain('工作区文件不会被写入');
    expect(projected.options).toEqual([
      {
        label: '批准 reviewed patch',
        desc: '批准仅覆盖当前 workspace.staged_patch；feature flag 开启时才会先做 promotion preflight，再写入匹配的工作区文件。',
        risk: '可能写入工作区',
      },
      {
        label: '暂停等待',
        desc: '暂缓处理，保留检查点；工作区保持不变，等补充审查后再决定。',
        risk: undefined,
      },
      {
        label: '取消本次执行',
        desc: '取消这次 patch promotion 请求，不把 sandbox patch 写入工作区。',
        risk: undefined,
      },
    ]);
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
      sourceTarget: {
        kind: 'external_access',
        label: 'Slack 发布',
        routeHint: 'review_source',
      },
      sourceKindLabel: '外部访问',
      sourceActionLabel: '查看来源任务',
      boundaryLabel: '批准后仅记录本次授权范围',
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
        impact: '影响发布节奏',
        reversibility: '可回退但需记录',
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
    expect(projected.recommendationReason).toBe('风险较低。');
    expect(projected.impactLabel).toBe('影响发布节奏');
    expect(projected.reversibilityLabel).toBe('可回退但需记录');
    expect(projected.options).toEqual([{
      label: '按 A 方案',
      desc: '使用 A 方案推进。',
      risk: undefined,
    }]);
  });

  it('preserves explicit source labels for task-bound manual decisions', () => {
    const projected = projectDecisionJudgment(decision({
      sourceLabel: '设计评审纪要',
    }), task({ title: '发布官网' }));

    expect(projected.sourceLabel).toBe('设计评审纪要');
    expect(projected.sourceTarget).toEqual({
      kind: 'task',
      id: 'task_1',
      label: '设计评审纪要',
      taskId: 'task_1',
      routeHint: 'open_task',
    });
  });

  it('adds grouped pending decision context by task', () => {
    const projected = projectDecisionJudgments([
      decision({ id: 'decision_1', taskId: 'task_1', title: '确认风险' }),
      decision({ id: 'decision_2', taskId: 'task_1', title: '确认恢复' }),
      decision({ id: 'decision_done', taskId: 'task_1', status: 'approved' }),
    ], new Map([['task_1', task({ id: 'task_1', title: '发布官网' })]]));

    expect(projected).toHaveLength(2);
    expect(projected[0]?.group).toMatchObject({
      key: 'task:task_1',
      label: '发布官网',
      pendingCount: 2,
      effectLabel: '待拍板阻断',
      decisionIds: ['decision_1', 'decision_2'],
    });
  });

  it('standardizes run and global source targets for future routing', () => {
    expect(projectDecisionJudgment(decision({
      sourceType: 'run',
      sourceId: 'run_1',
      sourceLabel: '最近一次执行',
    }), task()).sourceTarget).toEqual({
      kind: 'run',
      id: 'run_1',
      label: '最近一次执行',
      taskId: 'task_1',
      routeHint: 'open_run',
    });

    const globalProjection = projectDecisionJudgment(decision({
      taskId: null,
      scope: 'global',
      sourceType: null,
      sourceLabel: null,
      title: '确认全局策略',
    }), null);
    expect(globalProjection.sourceTarget).toEqual({
      kind: 'global',
      id: null,
      label: '全局拍板',
      taskId: null,
      routeHint: 'none',
    });
    expect(globalProjection.sourceKindLabel).toBe('全局事项');
    expect(globalProjection.sourceActionLabel).toBeNull();
  });
});
