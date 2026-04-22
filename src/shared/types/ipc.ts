export type PingResponse = {
  message: string;
  timestamp: string;
};

import type { HomeBriefData } from './brief.js';
import type { CreateDecisionInput, DecisionActionInput, DecisionRecord } from './decision.js';
import type { AppEvent } from './events.js';
import type {
  AppliedProcessTemplateRecord,
  ApplyProcessTemplateInput,
  CreateProcessTemplateInput,
  ProcessTemplateRecord,
  UpdateProcessTemplateInput,
} from './process-template.js';
import type { CreateRunInput, RunRecord } from './run.js';
import type { AiConfigInput, AiConfigStatus } from './settings.js';
import type {
  CreateSourceContextInput,
  SourceContextRecord,
  UpdateSourceContextInput,
} from './source-context.js';
import type {
  CreateTaskInput,
  TaskDetail,
  TaskRecord,
  TransitionTaskInput,
  UpdateTaskInput,
} from './task.js';

export type ElectronApi = {
  ping: () => Promise<PingResponse>;
  getAiConfigStatus: () => Promise<AiConfigStatus>;
  setAiConfig: (input: AiConfigInput) => Promise<AiConfigStatus>;
  listTasks: () => Promise<TaskRecord[]>;
  createTask: (input: CreateTaskInput) => Promise<TaskRecord>;
  getTaskDetail: (taskId: string) => Promise<TaskDetail | null>;
  updateTask: (input: UpdateTaskInput) => Promise<TaskRecord>;
  transitionTask: (input: TransitionTaskInput) => Promise<TaskRecord>;
  createSourceContext: (input: CreateSourceContextInput) => Promise<SourceContextRecord>;
  updateSourceContext: (input: UpdateSourceContextInput) => Promise<SourceContextRecord>;
  archiveSourceContext: (id: string) => Promise<SourceContextRecord>;
  createProcessTemplate: (input: CreateProcessTemplateInput) => Promise<ProcessTemplateRecord>;
  updateProcessTemplate: (input: UpdateProcessTemplateInput) => Promise<ProcessTemplateRecord>;
  archiveProcessTemplate: (id: string) => Promise<ProcessTemplateRecord>;
  applyProcessTemplate: (input: ApplyProcessTemplateInput) => Promise<AppliedProcessTemplateRecord>;
  removeProcessTemplate: (bindingId: string) => Promise<AppliedProcessTemplateRecord>;
  listDecisions: () => Promise<DecisionRecord[]>;
  createDecision: (input: CreateDecisionInput) => Promise<DecisionRecord>;
  actOnDecision: (input: DecisionActionInput) => Promise<DecisionRecord>;
  getHomeBrief: () => Promise<HomeBriefData>;
  listRuns: () => Promise<RunRecord[]>;
  getRunDetail: (runId: string) => Promise<RunRecord | null>;
  triggerRun: (input: CreateRunInput) => Promise<RunRecord>;
  subscribeToEvents: (listener: (event: AppEvent) => void) => () => void;
};
