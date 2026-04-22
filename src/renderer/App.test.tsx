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
import type { ArtifactRecord } from '@shared/types/artifact';
import type { WaitingItemRecord } from '@shared/types/waiting-item';
import { App } from './App';

function buildTaskRecord(partial: Partial<TaskRecord>): TaskRecord {
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

function buildTaskDetail(task: TaskRecord): TaskDetail {
  return {
    ...task,
    artifacts: [],
    timeline: [],
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
    activeWaitingItem: buildWaitingItem({
      taskId: 'task_waiting',
      reason: 'Waiting for reviewer confirmation',
    }),
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

  it('prefers active waiting items in waiting surfaces', async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByText('Waiting for reviewer confirmation');
    expect(
      screen.getByText('active waiting item · since 2026-01-01T00:00:00.000Z'),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /waiting task/i }));
    await screen.findByRole('heading', { name: 'Waiting task' });

    expect(screen.getAllByText('Waiting for reviewer confirmation').length).toBeGreaterThan(0);
    expect(
      screen.getByText('waiting item · active · since 2026-01-01T00:00:00.000Z'),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Current Waiting Item' })).toBeTruthy();
    expect(screen.getByText('Started at 2026-01-01T00:00:00.000Z')).toBeTruthy();
    expect(screen.getByText("Linked to the task's current waiting state.")).toBeTruthy();
  });

  it('offers a direct action to resolve the current waiting item', async () => {
    const user = userEvent.setup();

    const resolveWaitingApi: ElectronApi = {
      ...mockApi,
      transitionTask: vi.fn().mockResolvedValue(
        buildTaskRecord({
          ...waitingTask,
          state: 'planned',
          waitingReason: null,
          activeWaitingItem: null,
          updatedAt: '2026-01-02T00:00:00.000Z',
        }),
      ),
    };

    window.api = resolveWaitingApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /waiting task/i }));
    await screen.findByRole('heading', { name: 'Waiting task' });

    await user.click(screen.getByRole('button', { name: '解除等待' }));

    await waitFor(() => {
      expect(resolveWaitingApi.transitionTask).toHaveBeenCalledWith({
        id: waitingTask.id,
        nextState: 'planned',
        waitingReason: undefined,
      });
    });
  });

  it('shows recent artifacts on task detail', async () => {
    const user = userEvent.setup();

    const artifactTask = buildTaskRecord({
      id: 'task_artifact',
      title: 'Artifact task',
      state: 'running',
    });

    const artifactApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([artifactTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== artifactTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(artifactTask),
          artifacts: [
            buildArtifact({
              taskId: artifactTask.id,
              sourceId: 'run_artifact_1',
              title: 'draft output',
              content: 'Drafted message to the customer.',
            }),
          ],
        };
      }),
    };

    window.api = artifactApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /artifact task/i }));
    await screen.findByRole('heading', { name: 'Artifact task' });

    expect(screen.getByRole('heading', { name: 'Recent Artifacts' })).toBeTruthy();
    expect(screen.getByText('draft output')).toBeTruthy();
    expect(screen.getByText('source: run · run_artifact_1')).toBeTruthy();
    expect(screen.getByText('Drafted message to the customer.')).toBeTruthy();
  });

  it('prefills next step and run input from artifact timeline suggestions', async () => {
    const user = userEvent.setup();

    const artifactActionTask = buildTaskRecord({
      id: 'task_timeline_artifact_action',
      title: 'Timeline artifact task',
      state: 'running',
    });

    const artifact = buildArtifact({
      id: 'artifact_action_1',
      taskId: artifactActionTask.id,
      sourceId: 'run_artifact_action_1',
      title: 'draft output',
      content: 'Drafted message to the customer.',
    });

    const artifactActionApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([artifactActionTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== artifactActionTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(artifactActionTask),
          artifacts: [artifact],
          timeline: [
            {
              id: 'timeline_artifact_action',
              taskId: artifactActionTask.id,
              type: 'artifact.created',
              payload: JSON.stringify({
                artifactId: artifact.id,
                sourceType: 'run',
                sourceId: artifact.sourceId,
                kind: artifact.kind,
                title: artifact.title,
              }),
              createdAt: '2026-01-01T01:00:00.000Z',
            },
          ],
        };
      }),
    };

    window.api = artifactActionApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /timeline artifact task/i }));
    await screen.findByRole('heading', { name: 'Timeline artifact task' });

    await user.click(screen.getByRole('button', { name: '基于产物继续推进' }));

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '基于产物继续推进：draft output',
    );
    expect((screen.getByLabelText('附加要求') as HTMLTextAreaElement).value).toContain(
      'Drafted message to the customer.',
    );
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

  it('blocks saving a high-risk task without a risk note', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /waiting task/i }));
    await screen.findByRole('heading', { name: 'Waiting task' });

    await user.selectOptions(screen.getByLabelText('Risk Level'), 'high');
    const riskNoteInput = screen.getByLabelText('Risk Note');
    await user.clear(riskNoteInput);

    await user.click(screen.getByRole('button', { name: '保存详情' }));

    await waitFor(() => {
      expect(screen.getByText('将风险等级设为 high 前，请先填写风险说明。')).toBeTruthy();
    });

    expect(mockApi.updateTask).not.toHaveBeenCalled();
  });

  it('clears the visible risk note when lowering a high-risk task', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(await screen.findByRole('button', {
      name: /优先处理高风险任务：High risk task/i,
    }));
    await screen.findByRole('heading', { name: 'High risk task' });

    await user.selectOptions(screen.getByLabelText('Risk Level'), 'medium');

    await waitFor(() => {
      expect((screen.getByLabelText('Risk Note') as HTMLTextAreaElement).value).toBe('');
    });
  });

  it('shows failed run detail on the runs page', async () => {
    const user = userEvent.setup();

    const runDetailApi: ElectronApi = {
      ...mockApi,
      getRunDetail: vi.fn(async (runId: string) =>
        runs.find((run) => run.id === runId) ?? null,
      ),
    };

    window.api = runDetailApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /runs/i }));
    await screen.findByRole('heading', { name: '执行队列' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'draft / failed' })).toBeTruthy();
    });

    expect(runDetailApi.getRunDetail).toHaveBeenCalledWith('run_1');
    expect(screen.getByText('Executor exploded')).toBeTruthy();
    expect(screen.getByText('system')).toBeTruthy();
  });

  it('renders timeline events as readable summaries with badges', async () => {
    const user = userEvent.setup();

    const timelineTask = buildTaskRecord({
      id: 'task_timeline',
      title: 'Timeline task',
      state: 'running',
      riskLevel: 'high',
      riskNote: 'Dependency blocked',
    });

    const timelineApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([timelineTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== timelineTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(timelineTask),
          timeline: [
            {
              id: 'timeline_risk',
              taskId: timelineTask.id,
              type: 'task.risk_changed',
              payload: JSON.stringify({
                from: { level: 'medium', note: 'Review lagging' },
                to: { level: 'high', note: 'Dependency blocked' },
              }),
              createdAt: '2026-01-01T01:00:00.000Z',
            },
            {
              id: 'timeline_next',
              taskId: timelineTask.id,
              type: 'task.next_step_changed',
              payload: JSON.stringify({
                from: 'Check status',
                to: 'Escalate dependency owner',
              }),
              createdAt: '2026-01-01T00:30:00.000Z',
            },
            {
              id: 'timeline_waiting_item',
              taskId: timelineTask.id,
              type: 'waiting_item.created',
              payload: JSON.stringify({
                waitingItemId: 'waiting_1',
                reason: 'Waiting for vendor confirmation',
                status: 'active',
              }),
              createdAt: '2026-01-01T00:00:00.000Z',
            },
            {
              id: 'timeline_waiting_item_resolved',
              taskId: timelineTask.id,
              type: 'waiting_item.resolved',
              payload: JSON.stringify({
                waitingItemId: 'waiting_1',
                reason: 'Waiting for vendor confirmation',
                resolvedAt: '2026-01-01T02:00:00.000Z',
                nextState: 'planned',
              }),
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        };
      }),
    };

    window.api = timelineApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /timeline task/i }));
    await screen.findByRole('heading', { name: 'Timeline task' });

    expect(
      screen.getByText('风险从 medium（Review lagging）调整为 high（Dependency blocked）'),
    ).toBeTruthy();
    expect(
      screen.getByText('下一步从“Check status”调整为“Escalate dependency owner”'),
    ).toBeTruthy();
    expect(screen.getByText('创建等待项：Waiting for vendor confirmation')).toBeTruthy();
    expect(
      screen.getByText('解除等待项：Waiting for vendor confirmation，任务恢复到 planned'),
    ).toBeTruthy();
    expect(screen.getByText('风险')).toBeTruthy();
    expect(screen.getByText('下一步')).toBeTruthy();
    expect(screen.getAllByText('等待项').length).toBeGreaterThan(0);
  });

  it('shows a compact timeline preview with expand and collapse controls', async () => {
    const user = userEvent.setup();

    const timelineTask = buildTaskRecord({
      id: 'task_timeline_preview',
      title: 'Timeline preview task',
      state: 'running',
    });

    const timelineEvents = [
      {
        id: 'timeline_1',
        taskId: timelineTask.id,
        type: 'task.created',
        payload: JSON.stringify({ title: timelineTask.title }),
        createdAt: '2026-01-01T06:00:00.000Z',
      },
      {
        id: 'timeline_2',
        taskId: timelineTask.id,
        type: 'task.updated',
        payload: JSON.stringify({ summary: 'Updated summary' }),
        createdAt: '2026-01-01T05:00:00.000Z',
      },
      {
        id: 'timeline_3',
        taskId: timelineTask.id,
        type: 'task.next_step_changed',
        payload: JSON.stringify({ from: null, to: 'Prepare draft' }),
        createdAt: '2026-01-01T04:00:00.000Z',
      },
      {
        id: 'timeline_4',
        taskId: timelineTask.id,
        type: 'task.waiting_changed',
        payload: JSON.stringify({ from: null, to: 'Waiting for review' }),
        createdAt: '2026-01-01T03:00:00.000Z',
      },
      {
        id: 'timeline_5',
        taskId: timelineTask.id,
        type: 'task.risk_changed',
        payload: JSON.stringify({
          from: { level: 'low', note: null },
          to: { level: 'medium', note: 'Review may slip' },
        }),
        createdAt: '2026-01-01T02:00:00.000Z',
      },
      {
        id: 'timeline_6',
        taskId: timelineTask.id,
        type: 'task.transitioned',
        payload: JSON.stringify({ from: 'planned', to: 'running' }),
        createdAt: '2026-01-01T01:00:00.000Z',
      },
    ];

    const timelineApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([timelineTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== timelineTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(timelineTask),
          timeline: timelineEvents,
        };
      }),
    };

    window.api = timelineApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /timeline preview task/i }));
    await screen.findByRole('heading', { name: 'Timeline preview task' });

    expect(screen.getByRole('button', { name: '展开全部 (6)' })).toBeTruthy();
    expect(screen.queryByText('状态从 planned 变更为 running')).toBeNull();

    await user.click(screen.getByRole('button', { name: '展开全部 (6)' }));

    expect(screen.getByText('状态从 planned 变更为 running')).toBeTruthy();
    expect(screen.getByRole('button', { name: '收起旧事件' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '收起旧事件' }));

    await waitFor(() => {
      expect(screen.queryByText('状态从 planned 变更为 running')).toBeNull();
    });
  });

  it('prefills quick actions from failure timeline suggestions', async () => {
    const user = userEvent.setup();

    const actionTask = buildTaskRecord({
      id: 'task_timeline_action',
      title: 'Timeline action task',
      state: 'running',
    });

    const actionApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([actionTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== actionTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(actionTask),
          timeline: [
            {
              id: 'timeline_cancelled',
              taskId: actionTask.id,
              type: 'task.decision_cancelled',
              payload: JSON.stringify({
                decisionTitle: 'Approve budget path',
              }),
              createdAt: '2026-01-01T02:00:00.000Z',
            },
            {
              id: 'timeline_failed',
              taskId: actionTask.id,
              type: 'task.run_failed',
              payload: JSON.stringify({
                failureReason: 'Executor exploded',
              }),
              createdAt: '2026-01-01T01:00:00.000Z',
            },
          ],
        };
      }),
    };

    window.api = actionApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /timeline action task/i }));
    await screen.findByRole('heading', { name: 'Timeline action task' });

    await user.click(screen.getByRole('button', { name: '准备重试 Run' }));

    expect((screen.getByLabelText('附加要求') as HTMLTextAreaElement).value).toContain(
      'Executor exploded',
    );

    await user.click(screen.getByRole('button', { name: '生成新的 Decision' }));

    expect((screen.getByLabelText('决策标题') as HTMLInputElement).value).toBe(
      'Timeline action task 重新拍板',
    );
  });

  it('prefills next step from waiting timeline suggestions', async () => {
    const user = userEvent.setup();

    const waitingActionTask = buildTaskRecord({
      id: 'task_timeline_waiting_action',
      title: 'Timeline waiting task',
      state: 'waiting_external',
    });

    const waitingActionApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([waitingActionTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== waitingActionTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(waitingActionTask),
          timeline: [
            {
              id: 'timeline_waiting_action',
              taskId: waitingActionTask.id,
              type: 'task.waiting_changed',
              payload: JSON.stringify({
                from: null,
                to: 'Waiting for legal review',
              }),
              createdAt: '2026-01-01T01:00:00.000Z',
            },
          ],
        };
      }),
    };

    window.api = waitingActionApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /timeline waiting task/i }));
    await screen.findByRole('heading', { name: 'Timeline waiting task' });

    await user.click(screen.getByRole('button', { name: '补跟进动作' }));

    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '跟进并确认是否解除等待：Waiting for legal review',
    );
  });

  it('prefills risk recovery fields from risk timeline suggestions', async () => {
    const user = userEvent.setup();

    const riskActionTask = buildTaskRecord({
      id: 'task_timeline_risk_action',
      title: 'Timeline risk task',
      state: 'running',
      riskLevel: 'high',
    });

    const riskActionApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn().mockResolvedValue([riskActionTask]),
      getTaskDetail: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId !== riskActionTask.id) {
          return null;
        }

        return {
          ...buildTaskDetail(riskActionTask),
          timeline: [
            {
              id: 'timeline_risk_action',
              taskId: riskActionTask.id,
              type: 'task.risk_changed',
              payload: JSON.stringify({
                from: { level: 'medium', note: 'Review lagging' },
                to: { level: 'high', note: 'Dependency blocked' },
              }),
              createdAt: '2026-01-01T01:00:00.000Z',
            },
          ],
        };
      }),
    };

    window.api = riskActionApi;

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /timeline risk task/i }));
    await screen.findByRole('heading', { name: 'Timeline risk task' });

    await user.click(screen.getByRole('button', { name: '处理风险' }));

    expect((screen.getByLabelText('Risk Level') as HTMLSelectElement).value).toBe('high');
    expect((screen.getByLabelText('Risk Note') as HTMLTextAreaElement).value).toBe(
      'Dependency blocked',
    );
    expect((screen.getByLabelText('Next Step') as HTMLInputElement).value).toBe(
      '处理当前风险并确认是否需要降级：Dependency blocked',
    );
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

  it('saves settings and refreshes scheduler state across pages', async () => {
    const user = userEvent.setup();

    let currentAiStatus: AiConfigStatus = { ...aiStatus };
    let currentBriefData: HomeBriefData = {
      ...briefData,
      schedulerStatus: {
        enabled: false,
        running: false,
        lastBriefAt: null,
        lastRunSweepAt: null,
      },
    };
    let subscriber: ((event: { type: 'settings.changed'; at: string }) => void) | null = null;

    const eventingApi: ElectronApi = {
      ...mockApi,
      getAiConfigStatus: vi.fn(async () => currentAiStatus),
      getHomeBrief: vi.fn(async () => currentBriefData),
      subscribeToEvents: vi.fn().mockImplementation((callback) => {
        subscriber = callback;
        return () => {
          subscriber = null;
        };
      }),
      setAiConfig: vi.fn().mockImplementation(async (input) => {
        currentAiStatus = {
          configured: true,
          apiKeyStored: true,
          provider: input.provider,
          model: input.model,
          updatedAt: '2026-01-02T00:00:00.000Z',
          configPath: '/tmp/config.json',
          featureFlags: {
            enableScheduler: input.featureFlags.enableScheduler,
          },
        };

        currentBriefData = {
          ...currentBriefData,
          schedulerStatus: {
            enabled: input.featureFlags.enableScheduler,
            running: input.featureFlags.enableScheduler,
            lastBriefAt: null,
            lastRunSweepAt: null,
          },
        };

        subscriber?.({ type: 'settings.changed', at: '2026-01-02T00:00:00.000Z' });

        return currentAiStatus;
      }),
    };

    window.api = eventingApi;

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /settings/i }));
    await screen.findByRole('heading', { name: 'AI Provider 与本地密钥存储' });

    await user.selectOptions(screen.getByLabelText('Provider'), 'openai');
    const modelInput = screen.getByLabelText('Model');
    await user.clear(modelInput);
    await user.type(modelInput, 'gpt-5.4-mini');
    await user.type(screen.getByLabelText('API Key'), 'sk-test-key');
    await user.click(screen.getByLabelText('启用本地 scheduler'));
    await user.click(screen.getByRole('button', { name: '保存到 Main / Keychain' }));

    await waitFor(() => {
      expect(eventingApi.setAiConfig).toHaveBeenCalledWith({
        provider: 'openai',
        model: 'gpt-5.4-mini',
        apiKey: 'sk-test-key',
        featureFlags: {
          enableScheduler: true,
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/已配置 openai \/ gpt-5.4-mini/i)).toBeTruthy();
    });

    expect(screen.getByText(/Scheduler 开关：启用/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /home/i }));

    await waitFor(() => {
      expect(screen.getByText(/已配置 openai \/ gpt-5.4-mini/i)).toBeTruthy();
    });
  });

  it('refreshes home signals after a task transitions into waiting', async () => {
    const user = userEvent.setup();

    let currentTasks: TaskRecord[] = [waitingTask, riskTask];
    let currentTaskDetails: Record<string, TaskDetail> = {
      [waitingTask.id]: buildTaskDetail(waitingTask),
      [riskTask.id]: buildTaskDetail(riskTask),
    };
    let currentBriefData: HomeBriefData = {
      ...briefData,
      waitingTaskCount: 1,
      waitingTasks: [waitingTask],
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

    const eventingApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn(async () => currentTasks),
      getTaskDetail: vi.fn(async (taskId: string) => currentTaskDetails[taskId] ?? null),
      getHomeBrief: vi.fn(async () => currentBriefData),
      transitionTask: vi.fn().mockImplementation(async ({ id, nextState }) => {
        const updatedTask = buildTaskRecord({
          ...riskTask,
          id,
          state: nextState,
          waitingReason: 'Waiting on stakeholder approval',
          updatedAt: '2026-01-02T00:00:00.000Z',
        });

        currentTasks = currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
        currentTaskDetails = {
          ...currentTaskDetails,
          [updatedTask.id]: buildTaskDetail(updatedTask),
        };
        currentBriefData = {
          ...currentBriefData,
          waitingTaskCount: 2,
          waitingTasks: [waitingTask, updatedTask],
          recentTasks: [waitingTask, updatedTask],
          recommendedActions: [
            {
              id: `waiting:${updatedTask.id}`,
              label: `跟进等待中的任务：${updatedTask.title}`,
              reason: 'Waiting on stakeholder approval',
              taskId: updatedTask.id,
              priority: 'medium',
            },
          ],
        };

        return updatedTask;
      }),
    };

    window.api = eventingApi;

    render(<App />);

    expect(screen.queryByRole('button', { name: /跟进等待中的任务：High risk task/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /high risk task/i }));
    await screen.findByRole('heading', { name: 'High risk task' });
    await user.clear(screen.getByLabelText('Waiting Transition Reason'));
    await user.type(screen.getByLabelText('Waiting Transition Reason'), 'Waiting on stakeholder approval');
    await user.click(screen.getByRole('button', { name: '转到 waiting_external' }));

    await waitFor(() => {
      expect(eventingApi.transitionTask).toHaveBeenCalledWith({
        id: riskTask.id,
        nextState: 'waiting_external',
        waitingReason: 'Waiting on stakeholder approval',
      });
    });

    await user.click(screen.getByRole('button', { name: /home/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /跟进等待中的任务：High risk task/i }),
      ).toBeTruthy();
    });

    expect(screen.getAllByText('Waiting on stakeholder approval').length).toBeGreaterThan(0);
  });

  it('clears waiting signals after a task leaves waiting_external', async () => {
    const user = userEvent.setup();

    let currentTasks: TaskRecord[] = [waitingTask, riskTask];
    let currentTaskDetails: Record<string, TaskDetail> = {
      [waitingTask.id]: buildTaskDetail(waitingTask),
      [riskTask.id]: buildTaskDetail(riskTask),
    };
    let currentBriefData: HomeBriefData = {
      ...briefData,
      waitingTaskCount: 1,
      waitingTasks: [waitingTask],
      recommendedActions: [
        {
          id: `waiting:${waitingTask.id}`,
          label: `跟进等待中的任务：${waitingTask.title}`,
          reason: waitingTask.waitingReason ?? 'Waiting',
          taskId: waitingTask.id,
          priority: 'medium',
        },
      ],
    };

    const eventingApi: ElectronApi = {
      ...mockApi,
      listTasks: vi.fn(async () => currentTasks),
      getTaskDetail: vi.fn(async (taskId: string) => currentTaskDetails[taskId] ?? null),
      getHomeBrief: vi.fn(async () => currentBriefData),
      transitionTask: vi.fn().mockImplementation(async ({ id, nextState }) => {
        const updatedTask = buildTaskRecord({
          ...waitingTask,
          id,
          state: nextState,
          waitingReason: null,
          updatedAt: '2026-01-02T00:00:00.000Z',
        });

        currentTasks = currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task));
        currentTaskDetails = {
          ...currentTaskDetails,
          [updatedTask.id]: buildTaskDetail(updatedTask),
        };
        currentBriefData = {
          ...currentBriefData,
          waitingTaskCount: 0,
          waitingTasks: [],
          recentTasks: [updatedTask, riskTask],
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

        return updatedTask;
      }),
    };

    window.api = eventingApi;

    render(<App />);

    await screen.findByRole('button', { name: /跟进等待中的任务：Waiting task/i });
    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /waiting task/i }));
    await screen.findByRole('heading', { name: 'Waiting task' });
    await user.click(screen.getByRole('button', { name: '转到 planned' }));

    await waitFor(() => {
      expect(eventingApi.transitionTask).toHaveBeenCalledWith({
        id: waitingTask.id,
        nextState: 'planned',
        waitingReason: undefined,
      });
    });

    await user.click(screen.getByRole('button', { name: /home/i }));

    await waitFor(() => {
      expect(screen.getByText('当前没有等待中任务。')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /跟进等待中的任务：Waiting task/i })).toBeNull();
  });

  it('blocks waiting transitions in the UI until a waiting reason is provided', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: /tasks/i }));
    await user.click(await screen.findByRole('button', { name: /high risk task/i }));
    await screen.findByRole('heading', { name: 'High risk task' });

    await user.clear(screen.getByLabelText('Waiting Transition Reason'));
    await user.click(screen.getByRole('button', { name: '转到 waiting_external' }));

    expect(screen.getByText('转入 waiting_external 前，请先填写等待原因。')).toBeTruthy();
    expect(mockApi.transitionTask).not.toHaveBeenCalled();
  });
});
