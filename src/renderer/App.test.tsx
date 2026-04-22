// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { HomeBriefData } from '@shared/types/brief';
import type { ElectronApi } from '@shared/types/ipc';
import type { RunRecord } from '@shared/types/run';
import type { AiConfigStatus } from '@shared/types/settings';
import type { TaskDetail, TaskRecord } from '@shared/types/task';
import { App } from './App';

function buildTaskRecord(partial: Partial<TaskRecord>): TaskRecord {
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

function buildTaskDetail(task: TaskRecord): TaskDetail {
  return {
    ...task,
    timeline: [],
  };
}

function buildRunRecord(partial: Partial<RunRecord>): RunRecord {
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

describe('App UI flow', () => {
  const waitingTask = buildTaskRecord({
    id: 'task_waiting',
    title: 'Waiting task',
    state: 'waiting_external',
    waitingReason: 'Waiting for reply',
    nextStep: 'Follow up tomorrow',
  });
  const riskTask = buildTaskRecord({
    id: 'task_risk',
    title: 'High risk task',
    state: 'running',
    summary: 'Needs attention',
    nextStep: 'Escalate to owner',
    riskLevel: 'high',
    riskNote: 'Deadline slipping',
  });

  const taskDetails: Record<string, TaskDetail> = {
    [waitingTask.id]: buildTaskDetail(waitingTask),
    [riskTask.id]: buildTaskDetail(riskTask),
  };

  const aiStatus: AiConfigStatus = {
    configured: false,
    apiKeyStored: false,
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-latest',
    updatedAt: '2026-01-01T00:00:00.000Z',
    configPath: '/tmp/config.json',
    featureFlags: {
      enableScheduler: false,
    },
  };

  const briefData: HomeBriefData = {
    activeTaskCount: 2,
    pendingDecisionCount: 1,
    completedTaskCount: 0,
    recentRunCount: 1,
    waitingTaskCount: 1,
    highRiskTaskCount: 1,
    missingNextStepTaskCount: 0,
    recentTasks: [waitingTask, riskTask],
    waitingTasks: [waitingTask],
    highRiskTasks: [riskTask],
    missingNextStepTasks: [],
    pendingDecisions: [
      {
        id: 'decision_1',
        taskId: riskTask.id,
        title: 'Approve escalation path',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    recommendedActions: [
      {
        id: `risk:${riskTask.id}`,
        label: `优先处理高风险任务：${riskTask.title}`,
        reason: riskTask.riskNote ?? 'High risk',
        taskId: riskTask.id,
        priority: 'high',
      },
    ],
    recentBriefSnapshots: [],
    schedulerStatus: {
      enabled: false,
      running: false,
      lastBriefAt: null,
      lastRunSweepAt: null,
    },
  };

  const runs: RunRecord[] = [
    buildRunRecord({
      id: 'run_1',
      taskId: riskTask.id,
      type: 'draft',
      status: 'failed',
      outputSource: 'system',
      failureReason: 'Executor exploded',
    }),
  ];

  const mockApi: ElectronApi = {
    ping: vi.fn().mockResolvedValue({
      message: 'pong from main',
      timestamp: '2026-01-01T00:00:00.000Z',
    }),
    getAiConfigStatus: vi.fn().mockResolvedValue(aiStatus),
    setAiConfig: vi.fn(),
    listTasks: vi.fn().mockResolvedValue([waitingTask, riskTask]),
    createTask: vi.fn(),
    getTaskDetail: vi.fn(async (taskId: string) => taskDetails[taskId] ?? null),
    updateTask: vi.fn(),
    transitionTask: vi.fn(),
    listDecisions: vi.fn().mockResolvedValue(briefData.pendingDecisions),
    createDecision: vi.fn(),
    actOnDecision: vi.fn(),
    getHomeBrief: vi.fn().mockResolvedValue(briefData),
    listRuns: vi.fn().mockResolvedValue(runs),
    getRunDetail: vi.fn(),
    triggerRun: vi.fn(),
    subscribeToEvents: vi.fn().mockImplementation(() => () => {}),
  };

  beforeEach(() => {
    window.location.hash = '#home';
    window.api = mockApi;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.location.hash = '';
  });

  it('opens the related task when a recommended action is clicked', async () => {
    const user = userEvent.setup();

    render(<App />);

    const actionButton = await screen.findByRole('button', {
      name: /优先处理高风险任务：High risk task/i,
    });

    await user.click(actionButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'High risk task' })).toBeTruthy();
    });

    expect(window.location.hash).toBe('#tasks');
    expect(mockApi.getTaskDetail).toHaveBeenCalledWith(riskTask.id);
    expect((screen.getByLabelText('Risk Note') as HTMLTextAreaElement).value).toBe('Deadline slipping');
  });
});
