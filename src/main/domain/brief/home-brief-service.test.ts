import { describe, expect, it, vi } from 'vitest';

import type { ArtifactRecord } from '../../../shared/types/artifact.js';
import type { DecisionRecord } from '../../../shared/types/decision.js';
import type { RunRecord } from '../../../shared/types/run.js';
import type { TaskRecord } from '../../../shared/types/task.js';
import type { WaitingItemRecord } from '../../../shared/types/waiting-item.js';
import { HomeBriefService } from './home-brief-service.js';

function buildTask(partial: Partial<TaskRecord>): TaskRecord {
  return {
    id: partial.id ?? 'task_1',
    title: partial.title ?? 'Task',
    summary: partial.summary ?? null,
    state: partial.state ?? 'planned',
    nextStep: partial.nextStep ?? null,
    waitingReason: partial.waitingReason ?? null,
    activeWaitingItem: partial.activeWaitingItem ?? null,
    riskLevel: partial.riskLevel ?? 'none',
    riskNote: partial.riskNote ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function buildWaitingItem(partial: Partial<WaitingItemRecord>): WaitingItemRecord {
  return {
    id: partial.id ?? 'waiting_1',
    taskId: partial.taskId ?? 'task_1',
    reason: partial.reason ?? 'Waiting',
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    resolvedAt: partial.resolvedAt ?? null,
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

function buildArtifact(partial: Partial<ArtifactRecord>): ArtifactRecord {
  return {
    id: partial.id ?? 'artifact_1',
    taskId: partial.taskId ?? 'task_1',
    sourceType: partial.sourceType ?? 'run',
    sourceId: partial.sourceId ?? 'run_1',
    kind: partial.kind ?? 'run_output',
    title: partial.title ?? 'draft output',
    content: partial.content ?? 'Generated output',
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
        getActiveForTask: vi.fn().mockImplementation(async (taskId: string) =>
          taskId === 'task_waiting'
            ? buildWaitingItem({
                taskId,
                reason: 'Waiting for reviewer confirmation',
              })
            : null,
        ),
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
        listRecent: vi.fn().mockResolvedValue([
          buildArtifact({
            taskId: 'task_risk',
            sourceId: 'run_2',
            content: 'Escalation draft',
          }),
        ]),
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
      'artifact:artifact_1',
    ]);
    expect(homeData.waitingTasks[0]?.activeWaitingItem?.reason).toBe(
      'Waiting for reviewer confirmation',
    );
    expect(homeData.recentArtifacts[0]?.content).toBe('Escalation draft');
    expect(homeData.recommendedActions.find((action) => action.id === 'waiting:task_waiting')?.reason).toBe(
      'Waiting for reviewer confirmation',
    );
    expect(homeData.recommendedActions.find((action) => action.id === 'risk:task_risk')?.intent).toEqual({
      type: 'focus_risk_review',
      focusArea: 'detail',
      prefillNextStep: '处理当前风险并确认是否需要降级：Deadline slipping',
      prefillRiskLevel: 'high',
      prefillRiskNote: 'Deadline slipping',
    });
    expect(homeData.recommendedActions.find((action) => action.id === 'artifact:artifact_1')?.intent).toEqual({
      type: 'continue_from_artifact',
      focusArea: 'detail',
      prefillNextStep: '基于产物继续推进：draft output',
      prefillRunInstructions: '请基于这份已有产物继续扩展、改写或整理：Escalation draft',
    });
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
        getActiveForTask: vi.fn().mockResolvedValue(null),
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
        intent: {
          type: 'open_task',
        },
      },
    ]);
  });

  it('does not recommend artifact follow-up when the artifact belongs to an inactive task', async () => {
    const service = new HomeBriefService(
      {
        list: vi.fn().mockResolvedValue([
          buildTask({
            id: 'task_done',
            title: 'Done task',
            state: 'completed',
          }),
        ]),
      } as never,
      {
        getActiveForTask: vi.fn().mockResolvedValue(null),
      } as never,
      {
        list: vi.fn().mockResolvedValue([]),
      } as never,
      {
        list: vi.fn().mockResolvedValue([]),
      } as never,
      {
        listRecent: vi.fn().mockResolvedValue([
          buildArtifact({
            taskId: 'task_done',
            title: 'completed draft',
          }),
        ]),
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
        intent: {
          type: 'open_task',
        },
      },
    ]);
  });
});
