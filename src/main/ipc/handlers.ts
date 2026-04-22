import electron from 'electron';

import type { PingResponse } from '../../shared/types/ipc.js';
import type { CreateDecisionInput, DecisionActionInput } from '../../shared/types/decision.js';
import type {
  ApplyProcessTemplateInput,
  CreateProcessTemplateInput,
  UpdateProcessTemplateInput,
} from '../../shared/types/process-template.js';
import type { CreateRunInput } from '../../shared/types/run.js';
import type { AiConfigInput } from '../../shared/types/settings.js';
import type { CreateSourceContextInput, UpdateSourceContextInput } from '../../shared/types/source-context.js';
import type {
  CreateTaskInput,
  TransitionTaskInput,
  UpdateTaskInput,
} from '../../shared/types/task.js';

import { getServices } from '../bootstrap/services.js';
import { emitAppEvent } from './event-bus.js';

const PING_CHANNEL = 'app:ping';
const { ipcMain } = electron;

export function registerIpcHandlers(): void {
  ipcMain.handle(PING_CHANNEL, async (): Promise<PingResponse> => {
    return {
      message: 'pong from main',
      timestamp: new Date().toISOString(),
    };
  });

  ipcMain.handle('settings:getAiConfigStatus', async () => {
    return getServices().aiConfigService.getStatus();
  });

  ipcMain.handle('settings:setAiConfig', async (_event, input: AiConfigInput) => {
    const nextStatus = await getServices().aiConfigService.setConfig(input);

    if (nextStatus.featureFlags.enableScheduler) {
      await getServices().schedulerService.start();
    } else {
      getServices().schedulerService.stop();
    }

    emitAppEvent('settings.changed');

    return nextStatus;
  });

  ipcMain.handle('task:list', async () => {
    return getServices().taskService.list();
  });

  ipcMain.handle('task:create', async (_event, input: CreateTaskInput) => {
    const created = await getServices().taskService.create(input);
    emitAppEvent('task.changed', created.id);
    return created;
  });

  ipcMain.handle('task:getDetail', async (_event, taskId: string) => {
    return getServices().taskService.getDetail(taskId);
  });

  ipcMain.handle('task:update', async (_event, input: UpdateTaskInput) => {
    const updated = await getServices().taskService.update(input);
    emitAppEvent('task.changed', updated.id);
    return updated;
  });

  ipcMain.handle('task:transition', async (_event, input: TransitionTaskInput) => {
    const updated = await getServices().taskService.transition(input);
    emitAppEvent('task.changed', updated.id);
    return updated;
  });

  ipcMain.handle('sourceContext:create', async (_event, input: CreateSourceContextInput) => {
    const created = await getServices().taskService.createSourceContext(input);
    emitAppEvent('task.changed', created.taskId);
    return created;
  });

  ipcMain.handle('sourceContext:update', async (_event, input: UpdateSourceContextInput) => {
    const updated = await getServices().taskService.updateSourceContext(input);
    emitAppEvent('task.changed', updated.taskId);
    return updated;
  });

  ipcMain.handle('sourceContext:archive', async (_event, id: string) => {
    const archived = await getServices().taskService.archiveSourceContext(id);
    emitAppEvent('task.changed', archived.taskId);
    return archived;
  });

  ipcMain.handle('processTemplate:create', async (_event, input: CreateProcessTemplateInput) => {
    return getServices().taskService.createProcessTemplate(input);
  });

  ipcMain.handle('processTemplate:update', async (_event, input: UpdateProcessTemplateInput) => {
    return getServices().taskService.updateProcessTemplate(input);
  });

  ipcMain.handle('processTemplate:archive', async (_event, id: string) => {
    return getServices().taskService.archiveProcessTemplate(id);
  });

  ipcMain.handle('processTemplate:apply', async (_event, input: ApplyProcessTemplateInput) => {
    const applied = await getServices().taskService.applyProcessTemplate(input);
    emitAppEvent('task.changed', applied.taskId);
    return applied;
  });

  ipcMain.handle('processTemplate:remove', async (_event, bindingId: string) => {
    const removed = await getServices().taskService.removeProcessTemplate(bindingId);
    emitAppEvent('task.changed', removed.taskId);
    return removed;
  });

  ipcMain.handle('decision:list', async () => {
    return getServices().decisionService.list();
  });

  ipcMain.handle('decision:create', async (_event, input: CreateDecisionInput) => {
    const created = await getServices().decisionService.create(input);
    emitAppEvent('decision.changed', created.id);
    emitAppEvent('task.changed', created.taskId);
    return created;
  });

  ipcMain.handle('decision:act', async (_event, input: DecisionActionInput) => {
    const updated = await getServices().decisionService.act(input);
    emitAppEvent('decision.changed', updated.id);
    emitAppEvent('task.changed', updated.taskId);
    return updated;
  });

  ipcMain.handle('brief:getHomeData', async () => {
    return getServices().homeBriefService.getHomeData();
  });

  ipcMain.handle('run:list', async () => {
    return getServices().runService.list();
  });

  ipcMain.handle('run:getDetail', async (_event, runId: string) => {
    return getServices().runService.getDetail(runId);
  });

  ipcMain.handle('run:trigger', async (_event, input: CreateRunInput) => {
    const created = await getServices().runService.trigger(input);
    emitAppEvent('run.changed', created.id);
    emitAppEvent('task.changed', created.taskId);
    emitAppEvent('brief.changed');
    return created;
  });
}
