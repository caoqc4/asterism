// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { HomeBriefData } from '@shared/types/brief';
import type { DecisionRecord } from '@shared/types/decision';
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

  const createdDecision = {
    id: 'decision_created',
    taskId: riskTask.id,
    title: 'Escalate budget approval now',
    status: 'pending' as const,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };

  const createdRun = buildRunRecord({
    id: 'run_created',
    taskId: riskTask.id,
    type: 'summarize',
    status: 'pending',
    instructions: 'Summarize blockers before escalation',
    updatedAt: '2026-01-02T00:00:00.000Z',
  });

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
    createDecision: vi.fn().mockResolvedValue(createdDecision),
    actOnDecision: vi.fn(),
    getHomeBrief: vi.fn().mockResolvedValue(briefData),
    listRuns: vi.fn().mockResolvedValue(runs),
    getRunDetail: vi.fn(),
    triggerRun: vi.fn().mockResolvedValue(createdRun),
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

  it('submits a quick decision from task detail', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /high risk task/i }));
    await screen.findByRole('heading', { name: 'High risk task' });

    const decisionTitleInput = screen.getByLabelText('决策标题');
    await user.clear(decisionTitleInput);
    await user.type(decisionTitleInput, 'Escalate budget approval now');

    await user.click(screen.getByRole('button', { name: '提交 Decision' }));

    await waitFor(() => {
      expect(mockApi.createDecision).toHaveBeenCalledWith({
        taskId: riskTask.id,
        title: 'Escalate budget approval now',
      });
    });
  });

  it('submits a quick run from task detail', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /high risk task/i }));
    await screen.findByRole('heading', { name: 'High risk task' });

    await user.selectOptions(screen.getByLabelText('Run 类型'), 'summarize');

    const instructionsInput = screen.getByLabelText('附加要求');
    await user.clear(instructionsInput);
    await user.type(instructionsInput, 'Summarize blockers before escalation');

    await user.click(screen.getByRole('button', { name: '触发 Run' }));

    await waitFor(() => {
      expect(mockApi.triggerRun).toHaveBeenCalledWith({
        taskId: riskTask.id,
        type: 'summarize',
        instructions: 'Summarize blockers before escalation',
      });
    });
  });

  it('reflects cancelled decisions in task signals after a refresh event', async () => {
    const user = userEvent.setup();

    let currentTasks: TaskRecord[] = [waitingTask, riskTask];
    let currentTaskDetails: Record<string, TaskDetail> = {
      [waitingTask.id]: buildTaskDetail(waitingTask),
      [riskTask.id]: buildTaskDetail(riskTask),
    };
    let currentDecisions: DecisionRecord[] = [...briefData.pendingDecisions];
    let currentBriefData: HomeBriefData = {
      ...briefData,
      pendingDecisions: [...briefData.pendingDecisions],
    };
    let subscriber: ((event: { type: 'task.changed' | 'decision.changed'; at: string }) => void) | null =
      null;

    const eventingApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn(async () => currentTasks),
      getTaskDetail: vi.fn(async (taskId: string) => currentTaskDetails[taskId] ?? null),
      listDecisions: vi.fn(async () => currentDecisions),
      getHomeBrief: vi.fn(async () => currentBriefData),
      subscribeToEvents: vi.fn().mockImplementation((callback) => {
        subscriber = callback;
        return () => {
          subscriber = null;
        };
      }),
      actOnDecision: vi.fn().mockImplementation(async ({ id, action }) => {
        const updatedDecision: DecisionRecord = {
          ...currentDecisions.find((decision) => decision.id === id)!,
          status: action === 'cancel' ? 'cancelled' : 'pending',
          updatedAt: '2026-01-02T00:00:00.000Z',
        };

        currentDecisions = currentDecisions.map((decision) =>
          decision.id === id ? updatedDecision : decision,
        );

        const updatedTask = buildTaskRecord({
          ...riskTask,
          nextStep: '确认该任务是否还需要继续推进，或改走无需拍板的路径。',
          riskLevel: 'high',
          riskNote: `相关决策已取消：${updatedDecision.title}`,
          updatedAt: '2026-01-02T00:00:00.000Z',
        });

        currentTasks = currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
        currentTaskDetails = {
          ...currentTaskDetails,
          [updatedTask.id]: buildTaskDetail(updatedTask),
        };
        currentBriefData = {
          ...currentBriefData,
          pendingDecisionCount: 0,
          pendingDecisions: [],
          highRiskTasks: [updatedTask],
          recentTasks: [waitingTask, updatedTask],
        };

        subscriber?.({ type: 'decision.changed', at: '2026-01-02T00:00:00.000Z' });
        subscriber?.({ type: 'task.changed', at: '2026-01-02T00:00:00.000Z' });

        return updatedDecision;
      }),
    };

    window.api = eventingApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /decisions/i }));
    await screen.findByRole('heading', { name: '待拍板事项' });

    await user.click(screen.getByRole('button', { name: '取消' }));

    await waitFor(() => {
      expect(eventingApi.actOnDecision).toHaveBeenCalledWith({
        id: 'decision_1',
        action: 'cancel',
      });
    });

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /high risk task/i }));

    await waitFor(() => {
      expect((screen.getByLabelText('Risk Note') as HTMLTextAreaElement).value).toBe(
        '相关决策已取消：Approve escalation path',
      );
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '确认该任务是否还需要继续推进，或改走无需拍板的路径。',
    );
  });

  it('reflects failed runs in task signals after a refresh event', async () => {
    const user = userEvent.setup();

    let currentTasks: TaskRecord[] = [waitingTask, riskTask];
    let currentTaskDetails: Record<string, TaskDetail> = {
      [waitingTask.id]: buildTaskDetail(waitingTask),
      [riskTask.id]: buildTaskDetail(riskTask),
    };
    let currentRuns: RunRecord[] = [...runs];
    let currentBriefData: HomeBriefData = {
      ...briefData,
      recentRunCount: runs.length,
    };
    let subscriber:
      | ((event: {
          type: 'run.changed' | 'task.changed' | 'brief.changed';
          at: string;
        }) => void)
      | null = null;

    const eventingApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn(async () => currentTasks),
      getTaskDetail: vi.fn(async (taskId: string) => currentTaskDetails[taskId] ?? null),
      listRuns: vi.fn(async () => currentRuns),
      getHomeBrief: vi.fn(async () => currentBriefData),
      subscribeToEvents: vi.fn().mockImplementation((callback) => {
        subscriber = callback;
        return () => {
          subscriber = null;
        };
      }),
      triggerRun: vi.fn().mockImplementation(async (input) => {
        const failedRun = buildRunRecord({
          id: 'run_failed',
          taskId: input.taskId,
          type: input.type,
          status: 'failed',
          instructions: input.instructions ?? null,
          output: 'Missing API key',
          outputSource: 'system',
          failureReason: 'Missing API key',
          updatedAt: '2026-01-02T00:00:00.000Z',
        });

        currentRuns = [failedRun, ...currentRuns];

        const updatedTask = buildTaskRecord({
          ...riskTask,
          nextStep: '检查失败原因，修正输入或上下文后再决定是否重试。',
          riskLevel: 'high',
          riskNote: 'Missing API key',
          updatedAt: '2026-01-02T00:00:00.000Z',
        });

        currentTasks = currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
        currentTaskDetails = {
          ...currentTaskDetails,
          [updatedTask.id]: buildTaskDetail(updatedTask),
        };
        currentBriefData = {
          ...currentBriefData,
          highRiskTasks: [updatedTask],
          recentTasks: [waitingTask, updatedTask],
          recentRunCount: currentRuns.length,
        };

        subscriber?.({ type: 'run.changed', at: '2026-01-02T00:00:00.000Z' });
        subscriber?.({ type: 'task.changed', at: '2026-01-02T00:00:00.000Z' });
        subscriber?.({ type: 'brief.changed', at: '2026-01-02T00:00:00.000Z' });

        return failedRun;
      }),
    };

    window.api = eventingApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /high risk task/i }));
    await screen.findByRole('heading', { name: 'High risk task' });

    await user.selectOptions(screen.getByLabelText('Run 类型'), 'summarize');

    const instructionsInput = screen.getByLabelText('附加要求');
    await user.clear(instructionsInput);
    await user.type(instructionsInput, 'Summarize blockers with current config');

    await user.click(screen.getByRole('button', { name: '触发 Run' }));

    await waitFor(() => {
      expect(eventingApi.triggerRun).toHaveBeenCalledWith({
        taskId: riskTask.id,
        type: 'summarize',
        instructions: 'Summarize blockers with current config',
      });
    });

    await waitFor(() => {
      expect((screen.getByLabelText('Risk Note') as HTMLTextAreaElement).value).toBe(
        'Missing API key',
      );
    });

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '检查失败原因，修正输入或上下文后再决定是否重试。',
    );
  });

  it('refreshes home brief after a decision action changes the dashboard state', async () => {
    const user = userEvent.setup();

    let currentTasks: TaskRecord[] = [waitingTask, riskTask];
    let currentDecisions: DecisionRecord[] = [...briefData.pendingDecisions];
    let currentBriefData: HomeBriefData = {
      ...briefData,
      pendingDecisions: [...briefData.pendingDecisions],
      recommendedActions: [
        {
          id: `decision:decision_1`,
          label: '尽快拍板：Approve escalation path',
          reason: '该决策仍处于 pending，可能阻塞相关任务推进。',
          taskId: riskTask.id,
          priority: 'high',
        },
        ...briefData.recommendedActions,
      ],
    };
    let subscriber:
      | ((event: {
          type: 'decision.changed' | 'task.changed';
          at: string;
        }) => void)
      | null = null;

    const eventingApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn(async () => currentTasks),
      listDecisions: vi.fn(async () => currentDecisions),
      getHomeBrief: vi.fn(async () => currentBriefData),
      subscribeToEvents: vi.fn().mockImplementation((callback) => {
        subscriber = callback;
        return () => {
          subscriber = null;
        };
      }),
      actOnDecision: vi.fn().mockImplementation(async ({ id, action }) => {
        const updatedDecision: DecisionRecord = {
          ...currentDecisions.find((decision) => decision.id === id)!,
          status: action === 'cancel' ? 'cancelled' : 'pending',
          updatedAt: '2026-01-02T00:00:00.000Z',
        };

        currentDecisions = currentDecisions.map((decision) =>
          decision.id === id ? updatedDecision : decision,
        );
        currentBriefData = {
          ...currentBriefData,
          pendingDecisionCount: 0,
          pendingDecisions: [],
          recommendedActions: briefData.recommendedActions,
        };

        subscriber?.({ type: 'decision.changed', at: '2026-01-02T00:00:00.000Z' });
        subscriber?.({ type: 'task.changed', at: '2026-01-02T00:00:00.000Z' });

        return updatedDecision;
      }),
    };

    window.api = eventingApi;

    render(<App />);

    await screen.findByRole('button', { name: /尽快拍板：Approve escalation path/i });
    expect(screen.getByText('Approve escalation path')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /decisions/i }));
    await screen.findByRole('heading', { name: '待拍板事项' });
    await user.click(screen.getByRole('button', { name: '取消' }));

    await waitFor(() => {
      expect(eventingApi.actOnDecision).toHaveBeenCalledWith({
        id: 'decision_1',
        action: 'cancel',
      });
    });

    await user.click(screen.getByRole('button', { name: /home/i }));

    await waitFor(() => {
      expect(screen.getByText('当前没有待拍板事项。')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /尽快拍板：Approve escalation path/i })).toBeNull();
  });

  it('refreshes home brief after a failed run changes risk and recommendations', async () => {
    const user = userEvent.setup();

    let currentTasks: TaskRecord[] = [waitingTask, riskTask];
    let currentRuns: RunRecord[] = [...runs];
    let currentBriefData: HomeBriefData = {
      ...briefData,
      recentRunCount: currentRuns.length,
      recommendedActions: [
        {
          id: `risk:${riskTask.id}`,
          label: `优先处理高风险任务：${riskTask.title}`,
          reason: 'Deadline slipping',
          taskId: riskTask.id,
          priority: 'high',
        },
      ],
    };
    let subscriber:
      | ((event: {
          type: 'run.changed' | 'task.changed' | 'brief.changed';
          at: string;
        }) => void)
      | null = null;

    const eventingApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn(async () => currentTasks),
      listRuns: vi.fn(async () => currentRuns),
      getHomeBrief: vi.fn(async () => currentBriefData),
      subscribeToEvents: vi.fn().mockImplementation((callback) => {
        subscriber = callback;
        return () => {
          subscriber = null;
        };
      }),
      triggerRun: vi.fn().mockImplementation(async (input) => {
        const failedRun = buildRunRecord({
          id: 'run_failed_home',
          taskId: input.taskId,
          type: input.type,
          status: 'failed',
          instructions: input.instructions ?? null,
          output: 'Missing API key',
          outputSource: 'system',
          failureReason: 'Missing API key',
          updatedAt: '2026-01-02T00:00:00.000Z',
        });

        currentRuns = [failedRun, ...currentRuns];

        const updatedTask = buildTaskRecord({
          ...riskTask,
          nextStep: '检查失败原因，修正输入或上下文后再决定是否重试。',
          riskLevel: 'high',
          riskNote: 'Missing API key',
          updatedAt: '2026-01-02T00:00:00.000Z',
        });

        currentTasks = currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
        currentBriefData = {
          ...currentBriefData,
          recentRunCount: currentRuns.length,
          highRiskTasks: [updatedTask],
          recentTasks: [waitingTask, updatedTask],
          recommendedActions: [
            {
              id: `risk:${updatedTask.id}`,
              label: `优先处理高风险任务：${updatedTask.title}`,
              reason: 'Missing API key',
              taskId: updatedTask.id,
              priority: 'high',
            },
          ],
        };

        subscriber?.({ type: 'run.changed', at: '2026-01-02T00:00:00.000Z' });
        subscriber?.({ type: 'task.changed', at: '2026-01-02T00:00:00.000Z' });
        subscriber?.({ type: 'brief.changed', at: '2026-01-02T00:00:00.000Z' });

        return failedRun;
      }),
    };

    window.api = eventingApi;

    render(<App />);

    await screen.findByRole('button', { name: /优先处理高风险任务：High risk task/i });
    expect(screen.getAllByText('Deadline slipping').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /high risk task/i }));
    await screen.findByRole('heading', { name: 'High risk task' });

    await user.selectOptions(screen.getByLabelText('Run 类型'), 'summarize');
    const instructionsInput = screen.getByLabelText('附加要求');
    await user.clear(instructionsInput);
    await user.type(instructionsInput, 'Retry with missing key state');
    await user.click(screen.getByRole('button', { name: '触发 Run' }));

    await waitFor(() => {
      expect(eventingApi.triggerRun).toHaveBeenCalledWith({
        taskId: riskTask.id,
        type: 'summarize',
        instructions: 'Retry with missing key state',
      });
    });

    await user.click(screen.getByRole('button', { name: /home/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Missing API key').length).toBeGreaterThan(0);
    });

    expect(screen.queryAllByText('Deadline slipping').length).toBe(0);
  });
});
