import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exposeInMainWorldMock, invokeMock, onMock, removeListenerMock } = vi.hoisted(() => ({
  exposeInMainWorldMock: vi.fn(),
  invokeMock: vi.fn(),
  onMock: vi.fn(),
  removeListenerMock: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: exposeInMainWorldMock,
  },
  ipcRenderer: {
    invoke: invokeMock,
    on: onMock,
    removeListener: removeListenerMock,
  },
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
    probeSandboxBackend: () => Promise<unknown>;
    listTasks: () => Promise<unknown>;
    createTask: (input: unknown) => Promise<unknown>;
    getTaskDetail: (taskId: string) => Promise<unknown>;
    updateTask: (input: unknown) => Promise<unknown>;
    transitionTask: (input: unknown) => Promise<unknown>;
    recordTaskCompletionCheck: (input: unknown) => Promise<unknown>;
    getWorkHabitSnapshot: () => Promise<unknown>;
    importLegacyWorkHabits: (input: unknown) => Promise<unknown>;
    updateWorkHabit: (input: unknown) => Promise<unknown>;
    deleteWorkHabit: (id: string) => Promise<unknown>;
    createManualWorkHabit: (input: unknown) => Promise<unknown>;
    resolveWorkHabitConflict: (input: unknown) => Promise<unknown>;
    recordCompletionOverrideLearningSignal: (input: unknown) => Promise<unknown>;
    recordSopTemplateHabit: (input: unknown) => Promise<unknown>;
    recordWorkHabitApplications: (input: unknown) => Promise<unknown>;
    createBlocker: (input: unknown) => Promise<unknown>;
    updateBlocker: (input: unknown) => Promise<unknown>;
    resolveBlocker: (id: string) => Promise<unknown>;
    createCompletionCriteria: (input: unknown) => Promise<unknown>;
    updateCompletionCriteria: (input: unknown) => Promise<unknown>;
    satisfyCompletionCriteria: (id: string) => Promise<unknown>;
    reopenCompletionCriteria: (id: string) => Promise<unknown>;
    createSourceContext: (input: unknown) => Promise<unknown>;
    updateSourceContext: (input: unknown) => Promise<unknown>;
    archiveSourceContext: (id: string) => Promise<unknown>;
    createProcessTemplate: (input: unknown) => Promise<unknown>;
    updateProcessTemplate: (input: unknown) => Promise<unknown>;
    archiveProcessTemplate: (id: string) => Promise<unknown>;
    applyProcessTemplate: (input: unknown) => Promise<unknown>;
    removeProcessTemplate: (bindingId: string) => Promise<unknown>;
    listDecisions: () => Promise<unknown>;
    draftDecision: (input: unknown) => Promise<unknown>;
    createDecision: (input: unknown) => Promise<unknown>;
    actOnDecision: (input: unknown) => Promise<unknown>;
    getHomeBrief: () => Promise<unknown>;
    listRuns: () => Promise<unknown>;
    getRunDetail: (runId: string) => Promise<unknown>;
    triggerRun: (input: unknown) => Promise<unknown>;
    triggerCodeAgentRun?: (input: unknown) => Promise<unknown>;
    triggerOperatorStartedRun?: (input: unknown) => Promise<unknown>;
    continuePausedRun: (runId: string) => Promise<unknown>;
    chatWithAI?: (input: unknown) => Promise<unknown>;
    decomposeProject?: (input: unknown) => Promise<unknown>;
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
      baseUrl: 'https://relay.example.com/v1',
      apiKey: 'sk-test',
      featureFlags: { enableScheduler: true },
    };
    const createTaskInput = { title: 'Ship preload tests' };
    const updateTaskInput = { id: 'task_1', title: 'Updated title' };
    const transitionTaskInput = { id: 'task_1', nextState: 'planned' };
    const completionCheckInput = {
      taskId: 'task_1',
      action: 'override_completed',
      criteriaTotal: 2,
      criteriaSatisfied: 1,
      criteriaOpen: 1,
    };
    const updateWorkHabitInput = { id: 'habit_1', status: 'confirmed' };
    const importLegacyWorkHabitsInput = { habits: [{ id: 'habit_1', rule: 'Run checks first' }] };
    const createManualWorkHabitInput = { rule: 'Run checks first', scope: 'global', scopeLabel: '全局' };
    const resolveWorkHabitConflictInput = { candidateId: 'habit_1', decision: 'accept_candidate' };
    const completionOverrideInput = { taskId: 'task_1', taskTitle: 'Task', reason: 'Enough evidence' };
    const sopHabitInput = { taskId: 'task_1', taskTitle: 'Task', steps: ['Draft', 'Review'] };
    const recordHabitApplicationsInput = { habitIds: ['habit_1'] };
    const createBlockerInput = {
      taskId: 'task_1',
      title: 'Legal approval pending',
      kind: 'approval',
      detail: 'Need sign-off before launch',
    };
    const updateBlockerInput = {
      id: 'blocker_1',
      owner: 'Legal',
    };
    const createCompletionCriteriaInput = {
      taskId: 'task_1',
      text: 'Stakeholder approved final brief',
    };
    const updateCompletionCriteriaInput = {
      id: 'criteria_1',
      text: 'Final brief approved by stakeholder',
    };
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
    const createProcessTemplateInput = {
      title: 'Outreach skill',
      kind: 'skill',
      content: 'Use the outreach flow',
      tags: ['outreach'],
    };
    const updateProcessTemplateInput = {
      id: 'process_template_1',
      summary: 'Updated summary',
    };
    const applyProcessTemplateInput = {
      taskId: 'task_1',
      templateId: 'process_template_1',
    };
    const createDecisionInput = { taskId: 'task_1', title: 'Approve launch note' };
    const draftDecisionInput = { taskId: 'task_1', note: 'Need stakeholder sign-off' };
    const decisionActionInput = { id: 'decision_1', action: 'approve' };
    const createRunInput = { taskId: 'task_1', type: 'summarize', instructions: 'Summarize blockers' };
    const operatorStartedRunInput = {
      descriptorId: 'browser.readonly_evidence',
      kind: 'browser_evidence_smoke',
      modelExposure: 'hidden',
      operatorConfirmed: true,
      policy: {
        credentialPolicy: 'explicit_config',
        descriptorId: 'browser.readonly_evidence',
        networkPolicy: 'allowlisted',
        outputLimitBytes: 64_000,
        sessionKind: 'browser',
        timeoutMs: 120_000,
      },
      providerCallAllowed: false,
      reason: 'Capture browser evidence.',
      schedulerAllowed: false,
      taskId: 'task_1',
    };
    const createCodeAgentRunInput = {
      operatorConfirmed: true,
      patchIntent: 'Prepare a staged notes patch.',
      requestedChecks: ['test'],
      taskId: 'task_1',
    };
    const chatInput = { messages: [{ role: 'user', content: 'Next?' }], taskId: 'task_1' };
    const decomposeProjectInput = { taskId: 'task_1' };

    await api.ping();
    await api.getAiConfigStatus();
    await api.setAiConfig(aiInput);
    await api.probeSandboxBackend();
    await api.listTasks();
    await api.createTask(createTaskInput);
    await api.getTaskDetail('task_1');
    await api.updateTask(updateTaskInput);
    await api.transitionTask(transitionTaskInput);
    await api.recordTaskCompletionCheck(completionCheckInput);
    await api.getWorkHabitSnapshot();
    await api.importLegacyWorkHabits(importLegacyWorkHabitsInput);
    await api.updateWorkHabit(updateWorkHabitInput);
    await api.deleteWorkHabit('habit_1');
    await api.createManualWorkHabit(createManualWorkHabitInput);
    await api.resolveWorkHabitConflict(resolveWorkHabitConflictInput);
    await api.recordCompletionOverrideLearningSignal(completionOverrideInput);
    await api.recordSopTemplateHabit(sopHabitInput);
    await api.recordWorkHabitApplications(recordHabitApplicationsInput);
    await api.createBlocker(createBlockerInput);
    await api.updateBlocker(updateBlockerInput);
    await api.resolveBlocker('blocker_1');
    await api.createCompletionCriteria(createCompletionCriteriaInput);
    await api.updateCompletionCriteria(updateCompletionCriteriaInput);
    await api.satisfyCompletionCriteria('criteria_1');
    await api.reopenCompletionCriteria('criteria_1');
    await api.createSourceContext(createSourceContextInput);
    await api.updateSourceContext(updateSourceContextInput);
    await api.archiveSourceContext('source_context_1');
    await api.createProcessTemplate(createProcessTemplateInput);
    await api.updateProcessTemplate(updateProcessTemplateInput);
    await api.archiveProcessTemplate('process_template_1');
    await api.applyProcessTemplate(applyProcessTemplateInput);
    await api.removeProcessTemplate('task_process_binding_1');
    await api.listDecisions();
    await api.draftDecision(draftDecisionInput);
    await api.createDecision(createDecisionInput);
    await api.actOnDecision(decisionActionInput);
    await api.getHomeBrief();
    await api.listRuns();
    await api.getRunDetail('run_1');
    await api.triggerRun(createRunInput);
    await api.triggerCodeAgentRun?.(createCodeAgentRunInput);
    await api.triggerOperatorStartedRun?.(operatorStartedRunInput);
    await api.continuePausedRun('run_1');
    await api.chatWithAI?.(chatInput);
    await api.decomposeProject?.(decomposeProjectInput);

    expect(invokeMock.mock.calls).toEqual([
      ['app:ping'],
      ['settings:getAiConfigStatus'],
      ['settings:setAiConfig', aiInput],
      ['settings:probeSandboxBackend'],
      ['task:list'],
      ['task:create', createTaskInput],
      ['task:getDetail', 'task_1'],
      ['task:update', updateTaskInput],
      ['task:transition', transitionTaskInput],
      ['task:recordCompletionCheck', completionCheckInput],
      ['workHabit:getSnapshot'],
      ['workHabit:importLegacy', importLegacyWorkHabitsInput],
      ['workHabit:update', updateWorkHabitInput],
      ['workHabit:delete', 'habit_1'],
      ['workHabit:createManual', createManualWorkHabitInput],
      ['workHabit:resolveConflict', resolveWorkHabitConflictInput],
      ['workHabit:recordCompletionOverride', completionOverrideInput],
      ['workHabit:recordSopTemplate', sopHabitInput],
      ['workHabit:recordApplications', recordHabitApplicationsInput],
      ['blocker:create', createBlockerInput],
      ['blocker:update', updateBlockerInput],
      ['blocker:resolve', 'blocker_1'],
      ['completionCriteria:create', createCompletionCriteriaInput],
      ['completionCriteria:update', updateCompletionCriteriaInput],
      ['completionCriteria:satisfy', 'criteria_1'],
      ['completionCriteria:reopen', 'criteria_1'],
      ['sourceContext:create', createSourceContextInput],
      ['sourceContext:update', updateSourceContextInput],
      ['sourceContext:archive', 'source_context_1'],
      ['processTemplate:create', createProcessTemplateInput],
      ['processTemplate:update', updateProcessTemplateInput],
      ['processTemplate:archive', 'process_template_1'],
      ['processTemplate:apply', applyProcessTemplateInput],
      ['processTemplate:remove', 'task_process_binding_1'],
      ['decision:list'],
      ['decision:draft', draftDecisionInput],
      ['decision:create', createDecisionInput],
      ['decision:act', decisionActionInput],
      ['brief:getHomeData'],
      ['run:list'],
      ['run:getDetail', 'run_1'],
      ['run:trigger', createRunInput],
      ['run:triggerCodeAgent', createCodeAgentRunInput],
      ['run:triggerOperatorStarted', operatorStartedRunInput],
      ['run:continuePaused', 'run_1'],
      ['ai:chat', chatInput],
      ['ai:decomposeProject', decomposeProjectInput],
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
