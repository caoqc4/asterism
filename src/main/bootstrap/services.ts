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
import { RunVerificationRepository } from '../db/repositories/run-verification-repository.js';
import { SandboxPatchPromotionRepository } from '../db/repositories/sandbox-patch-promotion-repository.js';
import { ProcessTemplateRepository } from '../db/repositories/process-template-repository.js';
import { SourceContextRepository } from '../db/repositories/source-context-repository.js';
import { TaskFileRepository } from '../db/repositories/task-file-repository.js';
import { TaskDependencyRepository } from '../db/repositories/task-dependency-repository.js';
import { TaskRepository } from '../db/repositories/task-repository.js';
import { TaskProcessBindingRepository } from '../db/repositories/task-process-binding-repository.js';
import { WaitingItemRepository } from '../db/repositories/waiting-item-repository.js';
import { WorkHabitRepository } from '../db/repositories/work-habit-repository.js';
import { HomeBriefService } from '../domain/brief/home-brief-service.js';
import { WorkHabitService } from '../domain/context/work-habit-service.js';
import { DecisionService } from '../domain/decision/decision-service.js';
import { ExternalAccessSourceIngestionService } from '../domain/external-access/external-access-source-ingestion-service.js';
import { createExternalAccessStatusService } from '../domain/external-access/external-access-status-service.js';
import { createCapabilityProductSurfaceStatusService } from '../domain/capability/capability-product-surface-status-service.js';
import { AgentCliRunService } from '../domain/agent-cli/agent-cli-run-service.js';
import { AgentSessionStore } from '../domain/run/agent-session-store.js';
import { AgentToolRegistry } from '../domain/run/agent-tool-registry.js';
import { BrowserEvidencePersister } from '../domain/run/browser-evidence-persister.js';
import { runBrowserControlledLocalQaForOperatorStartedRun } from '../domain/run/browser-controlled-interaction-smoke-executor.js';
import { runBrowserControlledResumeForApprovedDecision } from '../domain/run/browser-controlled-interaction-resume-executor.js';
import { runBrowserEvidenceSmokeForOperatorStartedRun } from '../domain/run/browser-evidence-smoke-executor.js';
import { CodeAgentRunService } from '../domain/run/code-agent-run-service.js';
import { OperatorStartedRunService } from '../domain/run/operator-started-run-service.js';
import { RunService } from '../domain/run/run-service.js';
import { SandboxPatchPromotionApplyService } from '../domain/run/sandbox-patch-promotion-apply-service.js';
import { SandboxPatchPromotionPreflightService } from '../domain/run/sandbox-patch-promotion-preflight-service.js';
import { PatchArtifactSandboxReviewRunService } from '../domain/run/patch-artifact-sandbox-review-run-service.js';
import { TaskService } from '../domain/task/task-service.js';
import { TaskplaneWritebackDispatchService } from '../domain/writeback/taskplane-writeback-dispatch-service.js';
import { BriefExecutor } from '../executors/brief-executor.js';
import { TextExecutor } from '../executors/text-executor.js';
import { AiConfigService } from '../keychain/ai-config-service.js';
import { emitAppEvent } from '../ipc/event-bus.js';
import { SchedulerService } from '../scheduler/scheduler-service.js';

let initialized = false;
const appConfigService = new AppConfigService();
const taskRepository = new TaskRepository();
const decisionRepository = new DecisionRepository();
const runRepository = new RunRepository();
const runStepRepository = new RunStepRepository();
const runVerificationRepository = new RunVerificationRepository();
const runCheckpointRepository = new RunCheckpointRepository();
const sandboxPatchPromotionRepository = new SandboxPatchPromotionRepository();
const artifactRepository = new ArtifactRepository();
const blockerRepository = new BlockerRepository();
const completionCriteriaRepository = new CompletionCriteriaRepository();
const taskDependencyRepository = new TaskDependencyRepository();
const sourceContextRepository = new SourceContextRepository();
const taskFileRepository = new TaskFileRepository();
const processTemplateRepository = new ProcessTemplateRepository();
const taskProcessBindingRepository = new TaskProcessBindingRepository();
const briefSnapshotRepository = new BriefSnapshotRepository();
const waitingItemRepository = new WaitingItemRepository();
const workHabitRepository = new WorkHabitRepository();
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
  runVerificationRepository,
);
const textExecutor = new TextExecutor();
const briefExecutor = new BriefExecutor();
const agentSessionStore = new AgentSessionStore();
const externalAccessStatusService = createExternalAccessStatusService();
const capabilityProductSurfaceStatusService = createCapabilityProductSurfaceStatusService();
const aiConfigService = new AiConfigService(
  appConfigService,
  externalAccessStatusService,
  capabilityProductSurfaceStatusService,
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
  taskFileRepository,
  decisionRepository,
);
const externalAccessSourceIngestionService = new ExternalAccessSourceIngestionService(
  externalAccessStatusService,
  taskService,
  taskService,
);
const agentToolRegistry = new AgentToolRegistry(
  artifactRepository,
  runStepRepository,
  runCheckpointRepository,
  decisionRepository,
  () => appConfigService.read().workspaceRoot ?? process.cwd(),
  taskService,
);
const sandboxPatchPromotionPreflightService = new SandboxPatchPromotionPreflightService(
  sandboxPatchPromotionRepository,
  runCheckpointRepository,
  artifactRepository,
  decisionRepository,
);
const sandboxPatchPromotionApplyService = new SandboxPatchPromotionApplyService(
  sandboxPatchPromotionPreflightService,
  sandboxPatchPromotionRepository,
  () => appConfigService.read().workspaceRoot ?? process.cwd(),
);
const decisionService = new DecisionService(
  decisionRepository,
  taskService,
  aiConfigService,
  undefined,
  runCheckpointRepository,
  runStepRepository,
  runRepository,
  agentToolRegistry,
  sandboxPatchPromotionPreflightService,
  sandboxPatchPromotionApplyService,
  () => Boolean(appConfigService.read().featureFlags.enableSandboxPatchPromotionApply),
  runBrowserControlledResumeForApprovedDecision,
  agentSessionStore,
  runVerificationRepository,
);
agentToolRegistry.setDecisionDraftService(decisionService);
const taskplaneWritebackDispatchService = new TaskplaneWritebackDispatchService(
  taskService,
  decisionService,
  taskFileRepository,
  artifactRepository,
);
const workHabitService = new WorkHabitService(workHabitRepository);
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
  agentSessionStore,
  runVerificationRepository,
  undefined,
  workHabitService,
  sandboxPatchPromotionRepository,
);
const browserEvidencePersister = new BrowserEvidencePersister(
  artifactRepository,
  runStepRepository,
);
const operatorStartedRunService = new OperatorStartedRunService(
  runRepository,
  taskService,
  runStepRepository,
  browserEvidencePersister,
  runBrowserEvidenceSmokeForOperatorStartedRun,
  runBrowserControlledLocalQaForOperatorStartedRun,
  runVerificationRepository,
);
const agentCliRunService = new AgentCliRunService(
  taskService,
  aiConfigService,
  runRepository,
  runStepRepository,
  undefined,
  runVerificationRepository,
  undefined,
  (run) => {
    emitAppEvent('run.changed', run.id);
    emitAppEvent('task.changed', run.taskId);
    emitAppEvent('brief.changed');
  },
);
const codeAgentRunService = new CodeAgentRunService(
  taskService,
  aiConfigService,
  runRepository,
  runStepRepository,
  artifactRepository,
  runCheckpointRepository,
  decisionRepository,
  sandboxPatchPromotionRepository,
  undefined,
  runVerificationRepository,
);
schedulerService = new SchedulerService(
  appConfigService,
  homeBriefService,
  briefSnapshotRepository,
  runRepository,
  aiConfigService,
  briefExecutor,
  undefined,
  {
    triggerCodeAgentRun: async (input) => {
      const run = await codeAgentRunService.trigger(input);
      emitAppEvent('run.changed', run.id);
      emitAppEvent('task.changed', run.taskId);
      emitAppEvent('brief.changed');
      return run;
    },
  },
);
const patchArtifactSandboxReviewRunService = new PatchArtifactSandboxReviewRunService(
  artifactRepository,
  aiConfigService,
  runRepository,
  runStepRepository,
  runCheckpointRepository,
  decisionRepository,
  sandboxPatchPromotionRepository,
);

const services = {
  taskRepository,
  decisionRepository,
  runRepository,
  runStepRepository,
  runVerificationRepository,
  runCheckpointRepository,
  sandboxPatchPromotionRepository,
  briefSnapshotRepository,
  waitingItemRepository,
  workHabitRepository,
  blockerRepository,
  completionCriteriaRepository,
  taskDependencyRepository,
  artifactRepository,
  sourceContextRepository,
  taskFileRepository,
  processTemplateRepository,
  taskProcessBindingRepository,
  appConfigService,
  textExecutor,
  briefExecutor,
  agentToolRegistry,
  sandboxPatchPromotionPreflightService,
  sandboxPatchPromotionApplyService,
  taskService,
  decisionService,
  taskplaneWritebackDispatchService,
  runService,
  operatorStartedRunService,
  agentCliRunService,
  codeAgentRunService,
  patchArtifactSandboxReviewRunService,
  workHabitService,
  browserEvidencePersister,
  homeBriefService,
  aiConfigService,
  externalAccessStatusService,
  externalAccessSourceIngestionService,
  capabilityProductSurfaceStatusService,
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
