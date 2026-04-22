import { AppConfigService } from '../config/app-config-service.js';
import { initDatabase } from '../db/client.js';
import { BriefSnapshotRepository } from '../db/repositories/brief-snapshot-repository.js';
import { DecisionRepository } from '../db/repositories/decision-repository.js';
import { RunRepository } from '../db/repositories/run-repository.js';
import { TaskRepository } from '../db/repositories/task-repository.js';
import { WaitingItemRepository } from '../db/repositories/waiting-item-repository.js';
import { HomeBriefService } from '../domain/brief/home-brief-service.js';
import { DecisionService } from '../domain/decision/decision-service.js';
import { RunService } from '../domain/run/run-service.js';
import { TaskService } from '../domain/task/task-service.js';
import { BriefExecutor } from '../executors/brief-executor.js';
import { TextExecutor } from '../executors/text-executor.js';
import { AiConfigService } from '../keychain/ai-config-service.js';
import { SchedulerService } from '../scheduler/scheduler-service.js';

let initialized = false;
const appConfigService = new AppConfigService();
const taskRepository = new TaskRepository();
const decisionRepository = new DecisionRepository();
const runRepository = new RunRepository();
const briefSnapshotRepository = new BriefSnapshotRepository();
const waitingItemRepository = new WaitingItemRepository();
let schedulerService: SchedulerService | null = null;
const homeBriefService = new HomeBriefService(
  taskRepository,
  waitingItemRepository,
  decisionRepository,
  runRepository,
  briefSnapshotRepository,
  () => schedulerService,
);
const textExecutor = new TextExecutor();
const briefExecutor = new BriefExecutor();
const aiConfigService = new AiConfigService(appConfigService);
schedulerService = new SchedulerService(
  appConfigService,
  homeBriefService,
  briefSnapshotRepository,
  runRepository,
  aiConfigService,
  briefExecutor,
);

const services = {
  taskRepository,
  decisionRepository,
  runRepository,
  briefSnapshotRepository,
  waitingItemRepository,
  appConfigService,
  textExecutor,
  briefExecutor,
  taskService: new TaskService(taskRepository, waitingItemRepository),
  decisionService: null as unknown as DecisionService,
  runService: null as unknown as RunService,
  homeBriefService,
  aiConfigService,
  schedulerService,
};

services.decisionService = new DecisionService(decisionRepository, services.taskService);
services.runService = new RunService(
  runRepository,
  services.taskService,
  aiConfigService,
  textExecutor,
);

export function initServices() {
  if (!initialized) {
    initDatabase();
    appConfigService.read();
    initialized = true;
  }

  return services;
}

export function getServices() {
  return initServices();
}
