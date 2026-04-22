import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exposeInMainWorldMock, invokeMock, onMock, removeListenerMock } = vi.hoisted(() => ({
  exposeInMainWorldMock: vi.fn(),
  invokeMock: vi.fn(),
  onMock: vi.fn(),
  removeListenerMock: vi.fn(),
}));

vi.mock('electron', () => ({
  default: {
    contextBridge: {
      exposeInMainWorld: exposeInMainWorldMock,
    },
    ipcRenderer: {
      invoke: invokeMock,
      on: onMock,
      removeListener: removeListenerMock,
    },
  },
}));

vi.mock('./ipc/event-bus.js', () => ({
  APP_EVENT_CHANNEL: 'app:event',
}));

import './preload.js';

function getExposedApi() {
  const match = exposeInMainWorldMock.mock.calls.find(([name]) => name === 'api');

  if (!match) {
    throw new Error('window.api was not exposed');
  }

  return match[1] as {
    ping: () => Promise<unknown>;
    getAiConfigStatus: () => Promise<unknown>;
    setAiConfig: (input: unknown) => Promise<unknown>;
    listTasks: () => Promise<unknown>;
    createTask: (input: unknown) => Promise<unknown>;
    getTaskDetail: (taskId: string) => Promise<unknown>;
    updateTask: (input: unknown) => Promise<unknown>;
    transitionTask: (input: unknown) => Promise<unknown>;
    createSourceContext: (input: unknown) => Promise<unknown>;
    updateSourceContext: (input: unknown) => Promise<unknown>;
    archiveSourceContext: (id: string) => Promise<unknown>;
    listDecisions: () => Promise<unknown>;
    createDecision: (input: unknown) => Promise<unknown>;
    actOnDecision: (input: unknown) => Promise<unknown>;
    getHomeBrief: () => Promise<unknown>;
    listRuns: () => Promise<unknown>;
    getRunDetail: (runId: string) => Promise<unknown>;
    triggerRun: (input: unknown) => Promise<unknown>;
    subscribeToEvents: (listener: (event: unknown) => void) => () => void;
  };
}

describe('preload bridge', () => {
  beforeEach(() => {
    invokeMock.mockClear();
    onMock.mockClear();
    removeListenerMock.mockClear();
  });

  it('exposes window.api through the context bridge', () => {
    expect(exposeInMainWorldMock).toHaveBeenCalledTimes(1);
    expect(exposeInMainWorldMock).toHaveBeenCalledWith('api', expect.any(Object));
  });

  it('maps invoke-based methods to the expected IPC channels', async () => {
    const api = getExposedApi();

    const aiInput = {
      provider: 'openai',
      model: 'gpt-5.4-mini',
      apiKey: 'sk-test',
      featureFlags: { enableScheduler: true },
    };
    const createTaskInput = { title: 'Ship preload tests' };
    const updateTaskInput = { id: 'task_1', title: 'Updated title' };
    const transitionTaskInput = { id: 'task_1', nextState: 'planned' };
    const createSourceContextInput = {
      taskId: 'task_1',
      title: 'PRD',
      kind: 'doc',
      uri: 'https://example.com/prd',
      note: 'Primary product doc',
    };
    const updateSourceContextInput = {
      id: 'source_context_1',
      note: 'Updated note',
    };
    const createDecisionInput = { taskId: 'task_1', title: 'Approve launch note' };
    const decisionActionInput = { id: 'decision_1', action: 'approve' };
    const createRunInput = { taskId: 'task_1', type: 'summarize', instructions: 'Summarize blockers' };

    await api.ping();
    await api.getAiConfigStatus();
    await api.setAiConfig(aiInput);
    await api.listTasks();
    await api.createTask(createTaskInput);
    await api.getTaskDetail('task_1');
    await api.updateTask(updateTaskInput);
    await api.transitionTask(transitionTaskInput);
    await api.createSourceContext(createSourceContextInput);
    await api.updateSourceContext(updateSourceContextInput);
    await api.archiveSourceContext('source_context_1');
    await api.listDecisions();
    await api.createDecision(createDecisionInput);
    await api.actOnDecision(decisionActionInput);
    await api.getHomeBrief();
    await api.listRuns();
    await api.getRunDetail('run_1');
    await api.triggerRun(createRunInput);

    expect(invokeMock.mock.calls).toEqual([
      ['app:ping'],
      ['settings:getAiConfigStatus'],
      ['settings:setAiConfig', aiInput],
      ['task:list'],
      ['task:create', createTaskInput],
      ['task:getDetail', 'task_1'],
      ['task:update', updateTaskInput],
      ['task:transition', transitionTaskInput],
      ['sourceContext:create', createSourceContextInput],
      ['sourceContext:update', updateSourceContextInput],
      ['sourceContext:archive', 'source_context_1'],
      ['decision:list'],
      ['decision:create', createDecisionInput],
      ['decision:act', decisionActionInput],
      ['brief:getHomeData'],
      ['run:list'],
      ['run:getDetail', 'run_1'],
      ['run:trigger', createRunInput],
    ]);
  });

  it('subscribes to app events and returns an unsubscribe function', () => {
    const api = getExposedApi();
    const listener = vi.fn();

    const unsubscribe = api.subscribeToEvents(listener);

    expect(onMock).toHaveBeenCalledTimes(1);
    expect(onMock).toHaveBeenCalledWith('app:event', expect.any(Function));

    const wrapped = onMock.mock.calls[0]?.[1];

    wrapped?.({}, { type: 'task.changed', entityId: 'task_1', at: '2026-01-01T00:00:00.000Z' });

    expect(listener).toHaveBeenCalledWith({
      type: 'task.changed',
      entityId: 'task_1',
      at: '2026-01-01T00:00:00.000Z',
    });

    unsubscribe();

    expect(removeListenerMock).toHaveBeenCalledWith('app:event', wrapped);
  });
});
