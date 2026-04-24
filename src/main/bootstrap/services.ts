import { AppConfigService } from '../config/app-config-service.js';
import { initDatabase } from '../db/client.js';
import { BriefSnapshotRepository } from '../db/repositories/brief-snapshot-repository.js';
import { DecisionRepository } from '../db/repositories/decision-repository.js';
import { ArtifactRepository } from '../db/repositories/artifact-repository.js';
import { BlockerRepository } from '../db/repositories/blocker-repository.js';
import { CompletionCriteriaRepository } from '../db/repositories/completion-criteria-repository.js';
import { RunCheckpointRepository } from '../db/repositories/run-checkpoint-repository.js';
import { RunRepository } from '../db/repositories/run-repository.js';
import { RunStepRepository } from '../db/repositories/run-step-repository.js';
import { ProcessTemplateRepository } from '../db/repositories/process-template-repository.js';
import { SourceContextRepository } from '../db/repositories/source-context-repository.js';
import { TaskDependencyRepository } from '../db/repositories/task-dependency-repository.js';
import { TaskRepository } from '../db/repositories/task-repository.js';
import { TaskProcessBindingRepository } from '../db/repositories/task-process-binding-repository.js';
import { WaitingItemRepository } from '../db/repositories/waiting-item-repository.js';
import { HomeBriefService } from '../domain/brief/home-brief-service.js';
import { DecisionService } from '../domain/decision/decision-service.js';
import { AgentToolRegistry } from '../domain/run/agent-tool-registry.js';
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
const runStepRepository = new RunStepRepository();
const runCheckpointRepository = new RunCheckpointRepository();
const artifactRepository = new ArtifactRepository();
const blockerRepository = new BlockerRepository();
const completionCriteriaRepository = new CompletionCriteriaRepository();
const taskDependencyRepository = new TaskDependencyRepository();
const sourceContextRepository = new SourceContextRepository();
const processTemplateRepository = new ProcessTemplateRepository();
const taskProcessBindingRepository = new TaskProcessBindingRepository();
const briefSnapshotRepository = new BriefSnapshotRepository();
const waitingItemRepository = new WaitingItemRepository();
let schedulerService: SchedulerService | null = null;
const homeBriefService = new HomeBriefService(
  taskRepository,
  waitingItemRepository,
  blockerRepository,
  decisionRepository,
  runRepository,
  artifactRepository,
  sourceContextRepository,
  briefSnapshotRepository,
  () => schedulerService,
  taskProcessBindingRepository,
  taskDependencyRepository,
  completionCriteriaRepository,
);
const textExecutor = new TextExecutor();
const briefExecutor = new BriefExecutor();
const aiConfigService = new AiConfigService(appConfigService);
const agentToolRegistry = new AgentToolRegistry(
  artifactRepository,
  runStepRepository,
  runCheckpointRepository,
  decisionRepository,
);
const taskService = new TaskService(
  taskRepository,
  waitingItemRepository,
  artifactRepository,
  sourceContextRepository,
  processTemplateRepository,
  taskProcessBindingRepository,
  blockerRepository,
  taskDependencyRepository,
  completionCriteriaRepository,
);
schedulerService = new SchedulerService(
  appConfigService,
  homeBriefService,
  briefSnapshotRepository,
  runRepository,
  aiConfigService,
  briefExecutor,
);
const decisionService = new DecisionService(
  decisionRepository,
  taskService,
  aiConfigService,
);
const runService = new RunService(
  runRepository,
  taskService,
  artifactRepository,
  aiConfigService,
  textExecutor,
  undefined,
  runStepRepository,
  agentToolRegistry,
  runCheckpointRepository,
);

const services = {
  taskRepository,
  decisionRepository,
  runRepository,
  runStepRepository,
  runCheckpointRepository,
  briefSnapshotRepository,
  waitingItemRepository,
  blockerRepository,
  completionCriteriaRepository,
  taskDependencyRepository,
  artifactRepository,
  sourceContextRepository,
  processTemplateRepository,
  taskProcessBindingRepository,
  appConfigService,
  textExecutor,
  briefExecutor,
  agentToolRegistry,
  taskService,
  decisionService,
  runService,
  homeBriefService,
  aiConfigService,
  schedulerService,
};

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
