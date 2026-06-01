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
    getTaskHierarchyConsistency: () => Promise<unknown>;
    getTaskHierarchyManualReviewPolicy: () => Promise<unknown>;
    applySafeTaskHierarchyRepairs: () => Promise<unknown>;
    applyTaskHierarchyManualResolution: (input: unknown) => Promise<unknown>;
    createTask: (input: unknown) => Promise<unknown>;
    getTaskDetail: (taskId: string) => Promise<unknown>;
    updateTask: (input: unknown) => Promise<unknown>;
    transitionTask: (input: unknown) => Promise<unknown>;
    recordTaskCompletionCheck: (input: unknown) => Promise<unknown>;
    recordTaskTimelineEvent: (input: unknown) => Promise<unknown>;
    applyTaskplaneWriteback?: (input: unknown) => Promise<unknown>;
    getWorkHabitSnapshot: () => Promise<unknown>;
    importLegacyWorkHabits: (input: unknown) => Promise<unknown>;
    updateWorkHabit: (input: unknown) => Promise<unknown>;
    deleteWorkHabit: (id: string) => Promise<unknown>;
    createManualWorkHabit: (input: unknown) => Promise<unknown>;
    proposeWorkHabit: (input: unknown) => Promise<unknown>;
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
    createManualArtifact: (input: unknown) => Promise<unknown>;
    updateArtifact: (input: unknown) => Promise<unknown>;
    deleteArtifact: (id: string) => Promise<unknown>;
    previewPatchArtifactSandboxReview?: (input: unknown) => Promise<unknown>;
    runPatchArtifactSandboxReview?: (input: unknown) => Promise<unknown>;
    applySandboxPatchPromotion?: (input: unknown) => Promise<unknown>;
    listTaskFiles: (taskId: string) => Promise<unknown>;
    createTaskFile: (input: unknown) => Promise<unknown>;
    updateTaskFile: (input: unknown) => Promise<unknown>;
    deleteTaskFile: (id: string) => Promise<unknown>;
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
    createBusinessLineRecord?: (input: unknown) => Promise<unknown>;
    listRuns: () => Promise<unknown>;
    getRunDetail: (runId: string) => Promise<unknown>;
    triggerRun: (input: unknown) => Promise<unknown>;
    triggerAgentCliRun?: (input: unknown) => Promise<unknown>;
    cancelAgentCliRun?: (input: unknown) => Promise<unknown>;
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
    const taskplaneWritebackInput = {
      plan: {
        action: 'task.update_next_step',
        input: {
          id: 'task_1',
          nextStep: '整理页面信息架构。',
        },
        nextStep: '整理页面信息架构。',
        requiredApi: 'updateTask',
        successMessage: '已确认并更新下一步：整理页面信息架构。',
        timeline: {
          payload: {
            source: 'taskplane_write_intent',
          },
          type: 'panel.task_goal_updated',
        },
      },
      taskId: 'task_1',
    };
    const transitionTaskInput = { id: 'task_1', nextState: 'planned' };
    const completionCheckInput = {
      taskId: 'task_1',
      action: 'override_completed',
      criteriaTotal: 2,
      criteriaSatisfied: 1,
      criteriaOpen: 1,
    };
    const createBusinessLineRecordInput = {
      businessLineId: 'business_line_1',
      source: 'panel.context_refresh',
      summary: 'Business refresh digest',
      type: 'review',
    };
    const updateWorkHabitInput = { id: 'habit_1', status: 'confirmed' };
    const importLegacyWorkHabitsInput = { habits: [{ id: 'habit_1', rule: 'Run checks first' }] };
    const createManualWorkHabitInput = { rule: 'Run checks first', scope: 'global', scopeLabel: '全局' };
    const proposeWorkHabitInput = { rule: 'Review before sending', taskTitle: 'Weekly report' };
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
    const createManualArtifactInput = {
      taskId: 'task_1',
      title: 'notes.md',
      content: 'Manual note',
    };
    const updateArtifactInput = {
      id: 'artifact_1',
      title: 'notes-final.md',
    };
    const previewPatchArtifactSandboxReviewInput = {
      artifactId: 'artifact_patch_1',
      requestedChecks: ['test'],
    };
    const runPatchArtifactSandboxReviewInput = {
      artifactId: 'artifact_patch_1',
      operatorConfirmed: true,
      requestedChecks: ['test', 'lint'],
    };
    const applySandboxPatchPromotionInput = {
      checkpointId: 'run_checkpoint_patch_1',
      operatorConfirmed: true,
    };
    const createTaskFileInput = {
      taskId: 'task_1',
      name: 'notes.md',
      kind: 'file',
      content: 'Task note',
    };
    const updateTaskFileInput = {
      id: 'task_file_1',
      content: 'Updated task note',
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
    const createAgentCliRunInput = {
      operatorConfirmed: true,
      prompt: 'Inspect this task.',
      runtimeId: 'codex',
      taskId: 'task_1',
    };
    const nativeGoalAuditInput = {
      forwarded: false,
      objective: 'Run native goal.',
      operatorConfirmed: true,
      reason: 'Adapter native goal capability is disabled.',
      runtimeId: 'codex',
      runtimeLabel: 'Codex CLI',
      supportsNativeGoalMode: false,
      taskId: 'task_1',
    };
    const cancelAgentCliRunInput = {
      operatorConfirmed: true,
      runId: 'run_agent_cli_1',
    };
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
    const triggerScheduledEventAgentRunInput = {
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
    const hierarchyManualResolutionInput = {
      kind: 'set_unique_parent',
      taskId: 'child_1',
      targetParentTaskId: 'project_1',
    };

    await api.ping();
    await api.getAiConfigStatus();
    await api.setAiConfig(aiInput);
    await api.openAgentCliLogin?.({ runtimeId: 'codex' });
    await api.openAgentCliInstall?.({ runtimeId: 'claude' });
    await api.probeSandboxBackend();
    await api.connectGmailOAuth?.({ confirmed: true });
    await api.disconnectGmailOAuth?.({ confirmed: true });
    await api.previewExternalAccessSourceIngestion?.({ taskId: 'task_1' });
    await api.commitExternalAccessSourceIngestion?.({
      taskId: 'task_1',
      planIds: ['connector:gmail:message_1'],
      confirmed: true,
    });
    await api.listTasks();
    await api.getTaskHierarchyConsistency();
    await api.getTaskHierarchyManualReviewPolicy();
    await api.applySafeTaskHierarchyRepairs();
    await api.applyTaskHierarchyManualResolution(hierarchyManualResolutionInput);
    await api.createTask(createTaskInput);
    await api.getTaskDetail('task_1');
    await api.updateTask(updateTaskInput);
    await api.transitionTask(transitionTaskInput);
    await api.recordTaskCompletionCheck(completionCheckInput);
    await api.recordTaskTimelineEvent({ taskId: 'task_1', type: 'panel.context_refreshed', payload: { ok: true } });
    await api.applyTaskplaneWriteback?.(taskplaneWritebackInput);
    await api.getWorkHabitSnapshot();
    await api.importLegacyWorkHabits(importLegacyWorkHabitsInput);
    await api.updateWorkHabit(updateWorkHabitInput);
    await api.deleteWorkHabit('habit_1');
    await api.createManualWorkHabit(createManualWorkHabitInput);
    await api.proposeWorkHabit(proposeWorkHabitInput);
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
    await api.createManualArtifact(createManualArtifactInput);
    await api.updateArtifact(updateArtifactInput);
    await api.deleteArtifact('artifact_1');
    await api.previewPatchArtifactSandboxReview?.(previewPatchArtifactSandboxReviewInput);
    await api.runPatchArtifactSandboxReview?.(runPatchArtifactSandboxReviewInput);
    await api.applySandboxPatchPromotion?.(applySandboxPatchPromotionInput);
    await api.listTaskFiles('task_1');
    await api.createTaskFile(createTaskFileInput);
    await api.updateTaskFile(updateTaskFileInput);
    await api.deleteTaskFile('task_file_1');
    await api.createProcessTemplate(createProcessTemplateInput);
    await api.updateProcessTemplate(updateProcessTemplateInput);
    await api.archiveProcessTemplate('process_template_1');
    await api.applyProcessTemplate(applyProcessTemplateInput);
    await api.removeProcessTemplate('task_process_binding_1');
    await api.listDecisions();
    await api.listDecisionJudgments?.();
    await api.draftDecision(draftDecisionInput);
    await api.createDecision(createDecisionInput);
    await api.actOnDecision(decisionActionInput);
    await api.getHomeBrief();
    await api.createBusinessLineRecord?.(createBusinessLineRecordInput);
    await api.listRuns();
    await api.getRunDetail('run_1');
    await api.triggerRun(createRunInput);
    await api.triggerAgentCliRun?.(createAgentCliRunInput);
    await api.recordRuntimeNativeGoalRequest?.(nativeGoalAuditInput);
    await api.cancelAgentCliRun?.(cancelAgentCliRunInput);
    await api.triggerCodeAgentRun?.(createCodeAgentRunInput);
    await api.triggerOperatorStartedRun?.(operatorStartedRunInput);
    await api.triggerScheduledEventAgentRun?.(triggerScheduledEventAgentRunInput);
    await api.continuePausedRun('run_1');
    await api.chatWithAI?.(chatInput);
    await api.decomposeProject?.(decomposeProjectInput);

    expect(invokeMock.mock.calls).toEqual([
      ['app:ping'],
      ['settings:getAiConfigStatus'],
      ['settings:setAiConfig', aiInput],
      ['settings:openAgentCliLogin', { runtimeId: 'codex' }],
      ['settings:openAgentCliInstall', { runtimeId: 'claude' }],
      ['settings:probeSandboxBackend'],
      ['externalAccess:gmailOAuthConnect', { confirmed: true }],
      ['externalAccess:gmailOAuthDisconnect', { confirmed: true }],
      ['externalAccess:sourceIngestionPreview', { taskId: 'task_1' }],
      ['externalAccess:sourceIngestionCommit', {
        taskId: 'task_1',
        planIds: ['connector:gmail:message_1'],
        confirmed: true,
      }],
      ['task:list'],
      ['task:getHierarchyConsistency'],
      ['task:getHierarchyManualReviewPolicy'],
      ['task:applySafeHierarchyRepairs'],
      ['task:applyHierarchyManualResolution', hierarchyManualResolutionInput],
      ['task:create', createTaskInput],
      ['task:getDetail', 'task_1'],
      ['task:update', updateTaskInput],
      ['task:transition', transitionTaskInput],
      ['task:recordCompletionCheck', completionCheckInput],
      ['task:recordTimelineEvent', { taskId: 'task_1', type: 'panel.context_refreshed', payload: { ok: true } }],
      ['taskplaneWriteback:apply', taskplaneWritebackInput],
      ['workHabit:getSnapshot'],
      ['workHabit:importLegacy', importLegacyWorkHabitsInput],
      ['workHabit:update', updateWorkHabitInput],
      ['workHabit:delete', 'habit_1'],
      ['workHabit:createManual', createManualWorkHabitInput],
      ['workHabit:propose', proposeWorkHabitInput],
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
      ['artifact:createManual', createManualArtifactInput],
      ['artifact:update', updateArtifactInput],
      ['artifact:delete', 'artifact_1'],
      ['artifact:previewSandboxPatchReview', previewPatchArtifactSandboxReviewInput],
      ['artifact:runSandboxPatchReview', runPatchArtifactSandboxReviewInput],
      ['sandboxPatchPromotion:apply', applySandboxPatchPromotionInput],
      ['taskFile:list', 'task_1'],
      ['taskFile:create', createTaskFileInput],
      ['taskFile:update', updateTaskFileInput],
      ['taskFile:delete', 'task_file_1'],
      ['processTemplate:create', createProcessTemplateInput],
      ['processTemplate:update', updateProcessTemplateInput],
      ['processTemplate:archive', 'process_template_1'],
      ['processTemplate:apply', applyProcessTemplateInput],
      ['processTemplate:remove', 'task_process_binding_1'],
      ['decision:list'],
      ['decision:listJudgments'],
      ['decision:draft', draftDecisionInput],
      ['decision:create', createDecisionInput],
      ['decision:act', decisionActionInput],
      ['brief:getHomeData'],
      ['businessLine:createRecord', createBusinessLineRecordInput],
      ['run:list'],
      ['run:getDetail', 'run_1'],
      ['run:trigger', createRunInput],
      ['run:triggerAgentCli', createAgentCliRunInput],
      ['run:recordRuntimeNativeGoalRequest', nativeGoalAuditInput],
      ['run:cancelAgentCli', cancelAgentCliRunInput],
      ['run:triggerCodeAgent', createCodeAgentRunInput],
      ['run:triggerOperatorStarted', operatorStartedRunInput],
      ['scheduler:triggerScheduledEventAgentRun', triggerScheduledEventAgentRunInput],
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
