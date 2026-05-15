import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

import { APP_EVENT_CHANNEL } from '../shared/events/channel.js';
import type { ElectronApi } from '../shared/types/ipc.js';

const api: ElectronApi = {
  ping: () => ipcRenderer.invoke('app:ping'),
  getAiConfigStatus: () => ipcRenderer.invoke('settings:getAiConfigStatus'),
  setAiConfig: (input) => ipcRenderer.invoke('settings:setAiConfig', input),
  probeSandboxBackend: () => ipcRenderer.invoke('settings:probeSandboxBackend'),
  listTasks: () => ipcRenderer.invoke('task:list'),
  createTask: (input) => ipcRenderer.invoke('task:create', input),
  getTaskDetail: (taskId) => ipcRenderer.invoke('task:getDetail', taskId),
  updateTask: (input) => ipcRenderer.invoke('task:update', input),
  transitionTask: (input) => ipcRenderer.invoke('task:transition', input),
  recordTaskCompletionCheck: (input) => ipcRenderer.invoke('task:recordCompletionCheck', input),
  recordTaskTimelineEvent: (input) => ipcRenderer.invoke('task:recordTimelineEvent', input),
  getWorkHabitSnapshot: () => ipcRenderer.invoke('workHabit:getSnapshot'),
  importLegacyWorkHabits: (input) => ipcRenderer.invoke('workHabit:importLegacy', input),
  updateWorkHabit: (input) => ipcRenderer.invoke('workHabit:update', input),
  deleteWorkHabit: (id) => ipcRenderer.invoke('workHabit:delete', id),
  createManualWorkHabit: (input) => ipcRenderer.invoke('workHabit:createManual', input),
  proposeWorkHabit: (input) => ipcRenderer.invoke('workHabit:propose', input),
  resolveWorkHabitConflict: (input) => ipcRenderer.invoke('workHabit:resolveConflict', input),
  recordCompletionOverrideLearningSignal: (input) => ipcRenderer.invoke('workHabit:recordCompletionOverride', input),
  recordSopTemplateHabit: (input) => ipcRenderer.invoke('workHabit:recordSopTemplate', input),
  recordWorkHabitApplications: (input) => ipcRenderer.invoke('workHabit:recordApplications', input),
  createBlocker: (input) => ipcRenderer.invoke('blocker:create', input),
  updateBlocker: (input) => ipcRenderer.invoke('blocker:update', input),
  resolveBlocker: (id) => ipcRenderer.invoke('blocker:resolve', id),
  createCompletionCriteria: (input) => ipcRenderer.invoke('completionCriteria:create', input),
  updateCompletionCriteria: (input) => ipcRenderer.invoke('completionCriteria:update', input),
  satisfyCompletionCriteria: (id) => ipcRenderer.invoke('completionCriteria:satisfy', id),
  reopenCompletionCriteria: (id) => ipcRenderer.invoke('completionCriteria:reopen', id),
  createTaskDependency: (input) => ipcRenderer.invoke('taskDependency:create', input),
  updateTaskDependency: (input) => ipcRenderer.invoke('taskDependency:update', input),
  resolveTaskDependency: (id) => ipcRenderer.invoke('taskDependency:resolve', id),
  createSourceContext: (input) => ipcRenderer.invoke('sourceContext:create', input),
  updateSourceContext: (input) => ipcRenderer.invoke('sourceContext:update', input),
  archiveSourceContext: (id) => ipcRenderer.invoke('sourceContext:archive', id),
  createManualArtifact: (input) => ipcRenderer.invoke('artifact:createManual', input),
  updateArtifact: (input) => ipcRenderer.invoke('artifact:update', input),
  deleteArtifact: (id) => ipcRenderer.invoke('artifact:delete', id),
  listTaskFiles: (taskId) => ipcRenderer.invoke('taskFile:list', taskId),
  createTaskFile: (input) => ipcRenderer.invoke('taskFile:create', input),
  updateTaskFile: (input) => ipcRenderer.invoke('taskFile:update', input),
  deleteTaskFile: (id) => ipcRenderer.invoke('taskFile:delete', id),
  createProcessTemplate: (input) => ipcRenderer.invoke('processTemplate:create', input),
  updateProcessTemplate: (input) => ipcRenderer.invoke('processTemplate:update', input),
  archiveProcessTemplate: (id) => ipcRenderer.invoke('processTemplate:archive', id),
  applyProcessTemplate: (input) => ipcRenderer.invoke('processTemplate:apply', input),
  removeProcessTemplate: (bindingId) => ipcRenderer.invoke('processTemplate:remove', bindingId),
  listDecisions: () => ipcRenderer.invoke('decision:list'),
  draftDecision: (input) => ipcRenderer.invoke('decision:draft', input),
  createDecision: (input) => ipcRenderer.invoke('decision:create', input),
  actOnDecision: (input) => ipcRenderer.invoke('decision:act', input),
  getHomeBrief: () => ipcRenderer.invoke('brief:getHomeData'),
  listRuns: () => ipcRenderer.invoke('run:list'),
  getRunDetail: (runId) => ipcRenderer.invoke('run:getDetail', runId),
  triggerRun: (input) => ipcRenderer.invoke('run:trigger', input),
  triggerCodeAgentRun: (input) => ipcRenderer.invoke('run:triggerCodeAgent', input),
  triggerOperatorStartedRun: (input) => ipcRenderer.invoke('run:triggerOperatorStarted', input),
  continuePausedRun: (runId) => ipcRenderer.invoke('run:continuePaused', runId),
  chatWithAI: (input) => ipcRenderer.invoke('ai:chat', input),
  decomposeProject: (input) => ipcRenderer.invoke('ai:decomposeProject', input),
  subscribeToEvents: (listener) => {
    const wrapped = (_event: IpcRendererEvent, payload: Parameters<typeof listener>[0]) => {
      listener(payload);
    };

    ipcRenderer.on(APP_EVENT_CHANNEL, wrapped);

    return () => {
      ipcRenderer.removeListener(APP_EVENT_CHANNEL, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
