import { describe, expect, it, vi } from 'vitest';

import type { DecisionRecord } from '../../../shared/types/decision.js';
import type { RunRecord } from '../../../shared/types/run.js';
import type { TaskRecord } from '../../../shared/types/task.js';
import { HomeBriefService } from './home-brief-service.js';

function buildTask(partial: Partial<TaskRecord>): TaskRecord {
  return {
    id: partial.id ?? 'task_1',
    title: partial.title ?? 'Task',
    summary: partial.summary ?? null,
    state: partial.state ?? 'planned',
    nextStep: partial.nextStep ?? null,
    waitingReason: partial.waitingReason ?? null,
    riskLevel: partial.riskLevel ?? 'none',
    riskNote: partial.riskNote ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildDecision(partial: Partial<DecisionRecord>): DecisionRecord {
  return {
    id: partial.id ?? 'decision_1',
    taskId: partial.taskId ?? 'task_1',
    title: partial.title ?? 'Decision',
    status: partial.status ?? 'pending',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildRun(partial: Partial<RunRecord>): RunRecord {
  return {
    id: partial.id ?? 'run_1',
    taskId: partial.taskId ?? 'task_1',
    type: partial.type ?? 'draft',
    status: partial.status ?? 'completed',
    instructions: partial.instructions ?? null,
    output: partial.output ?? null,
    outputSource: partial.outputSource ?? null,
    failureReason: partial.failureReason ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('HomeBriefService', () => {
  it('aggregates waiting, high-risk, and missing-next-step task signals', async () => {
    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_waiting',
            title: 'Waiting task',
            state: 'waiting_external',
            waitingReason: 'Waiting for reply',
            nextStep: 'Follow up on Friday',
          }),
          buildTask({
            id: 'task_risk',
            title: 'High risk task',
            state: 'running',
            riskLevel: 'high',
            riskNote: 'Deadline slipping',
            nextStep: 'Escalate today',
          }),
          buildTask({
            id: 'task_missing',
            title: 'Missing next step',
            state: 'planned',
            nextStep: null,
          }),
          buildTask({
            id: 'task_done',
            title: 'Done task',
            state: 'completed',
          }),
        ]),
      } as never,
      {
        list: vi.fn().mockResolvedValue([
          buildDecision({ status: 'pending' }),
          buildDecision({ id: 'decision_2', status: 'approved' }),
        ]),
      } as never,
      {
        list: vi.fn().mockResolvedValue([buildRun({}), buildRun({ id: 'run_2' })]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([]),
      } as never,
      () => null,
    );

    const homeData = await service.getHomeData();

    expect(homeData.activeTaskCount).toBe(3);
    expect(homeData.completedTaskCount).toBe(1);
    expect(homeData.pendingDecisionCount).toBe(1);
    expect(homeData.recentRunCount).toBe(2);
    expect(homeData.waitingTaskCount).toBe(1);
    expect(homeData.highRiskTaskCount).toBe(1);
    expect(homeData.missingNextStepTaskCount).toBe(1);
    expect(homeData.waitingTasks.map((task) => task.id)).toEqual(['task_waiting']);
    expect(homeData.highRiskTasks.map((task) => task.id)).toEqual(['task_risk']);
    expect(homeData.missingNextStepTasks.map((task) => task.id)).toEqual(['task_missing']);
    expect(homeData.recommendedActions.map((action) => action.id)).toEqual([
      'risk:task_risk',
      'decision:decision_1',
      'waiting:task_waiting',
      'next-step:task_missing',
    ]);
  });

  it('returns a steady-state recommendation when there is no urgent work', async () => {
    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_done',
            title: 'Done task',
            state: 'completed',
            nextStep: 'Archive it',
          }),
        ]),
      } as never,
      {
        list: vi.fn().mockResolvedValue([]),
      } as never,
      {
        list: vi.fn().mockResolvedValue([]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([]),
      } as never,
      () => null,
    );

    const homeData = await service.getHomeData();

    expect(homeData.recommendedActions).toEqual([
      {
        id: 'steady-state',
        label: '当前无需额外干预',
        reason: '暂时没有高风险、等待阻塞或缺少下一步的活跃任务。',
        taskId: null,
        priority: 'low',
      },
    ]);
  });
});
