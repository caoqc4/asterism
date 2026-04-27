export type PingResponse = {
  message: string;
  timestamp: string;
};

import type { HomeBriefData } from './brief.js';
import type {
  BlockerRecord,
  CreateBlockerInput,
  UpdateBlockerInput,
} from './blocker.js';
import type {
  CompletionCriteriaRecord,
  CreateCompletionCriteriaInput,
  UpdateCompletionCriteriaInput,
} from './completion-criteria.js';
import type {
  CreateTaskDependencyInput,
  TaskDependencyRecord,
  UpdateTaskDependencyInput,
} from './task-dependency.js';
import type {
  CreateDecisionInput,
  DecisionActionInput,
  DecisionDraftRecord,
  DecisionRecord,
  DraftDecisionInput,
} from './decision.js';
import type { AppEvent } from './events.js';
import type {
  AppliedProcessTemplateRecord,
  ApplyProcessTemplateInput,
  CreateProcessTemplateInput,
  ProcessTemplateRecord,
  UpdateProcessTemplateInput,
} from './process-template.js';
import type { OperatorStartedRunRequest } from './operator-started-run.js';
import type { CreateCodeAgentRunInput, CreateRunInput, RunDetailRecord, RunRecord } from './run.js';
import type { AiConfigInput, AiConfigStatus } from './settings.js';
import type { AgentSandboxBackendStatus } from '../agent-sandbox-provider.js';
import type {
  CreateSourceContextInput,
  SourceContextRecord,
  UpdateSourceContextInput,
} from './source-context.js';
import type {
  CreateTaskInput,
  TaskDetail,
  TaskListItemRecord,
  TaskRecord,
  TransitionTaskInput,
  UpdateTaskInput,
} from './task.js';

export type ElectronApi = {
  ping: () => Promise<PingResponse>;
  getAiConfigStatus: () => Promise<AiConfigStatus>;
  setAiConfig: (input: AiConfigInput) => Promise<AiConfigStatus>;
  probeSandboxBackend?: () => Promise<AgentSandboxBackendStatus>;
  listTasks: () => Promise<TaskListItemRecord[]>;
  createTask: (input: CreateTaskInput) => Promise<TaskListItemRecord>;
  getTaskDetail: (taskId: string) => Promise<TaskDetail | null>;
  updateTask: (input: UpdateTaskInput) => Promise<TaskListItemRecord>;
  transitionTask: (input: TransitionTaskInput) => Promise<TaskListItemRecord>;
  createBlocker: (input: CreateBlockerInput) => Promise<BlockerRecord>;
  updateBlocker: (input: UpdateBlockerInput) => Promise<BlockerRecord>;
  resolveBlocker: (id: string) => Promise<BlockerRecord>;
  createCompletionCriteria: (
    input: CreateCompletionCriteriaInput,
  ) => Promise<CompletionCriteriaRecord>;
  updateCompletionCriteria: (
    input: UpdateCompletionCriteriaInput,
  ) => Promise<CompletionCriteriaRecord>;
  satisfyCompletionCriteria: (id: string) => Promise<CompletionCriteriaRecord>;
  reopenCompletionCriteria: (id: string) => Promise<CompletionCriteriaRecord>;
  createTaskDependency: (input: CreateTaskDependencyInput) => Promise<TaskDependencyRecord>;
  updateTaskDependency: (input: UpdateTaskDependencyInput) => Promise<TaskDependencyRecord>;
  resolveTaskDependency: (id: string) => Promise<TaskDependencyRecord>;
  createSourceContext: (input: CreateSourceContextInput) => Promise<SourceContextRecord>;
  updateSourceContext: (input: UpdateSourceContextInput) => Promise<SourceContextRecord>;
  archiveSourceContext: (id: string) => Promise<SourceContextRecord>;
  createProcessTemplate: (input: CreateProcessTemplateInput) => Promise<ProcessTemplateRecord>;
  updateProcessTemplate: (input: UpdateProcessTemplateInput) => Promise<ProcessTemplateRecord>;
  archiveProcessTemplate: (id: string) => Promise<ProcessTemplateRecord>;
  applyProcessTemplate: (input: ApplyProcessTemplateInput) => Promise<AppliedProcessTemplateRecord>;
  removeProcessTemplate: (bindingId: string) => Promise<AppliedProcessTemplateRecord>;
  listDecisions: () => Promise<DecisionRecord[]>;
  draftDecision: (input: DraftDecisionInput) => Promise<DecisionDraftRecord>;
  createDecision: (input: CreateDecisionInput) => Promise<DecisionRecord>;
  actOnDecision: (input: DecisionActionInput) => Promise<DecisionRecord>;
  getHomeBrief: () => Promise<HomeBriefData>;
  listRuns: () => Promise<RunRecord[]>;
  getRunDetail: (runId: string) => Promise<RunDetailRecord | null>;
  triggerRun: (input: CreateRunInput) => Promise<RunRecord>;
  triggerCodeAgentRun?: (input: CreateCodeAgentRunInput) => Promise<RunRecord>;
  triggerOperatorStartedRun?: (input: OperatorStartedRunRequest) => Promise<RunRecord>;
  continuePausedRun: (runId: string) => Promise<RunRecord>;
  subscribeToEvents: (listener: (event: AppEvent) => void) => () => void;
};
