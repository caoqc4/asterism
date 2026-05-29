import type { PilotDecisionSnapshot } from '../pilot-decision-contract.js';

export type PingResponse = {
  message: string;
  timestamp: string;
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChatInput = {
  messages: ChatMessage[];
  pilotDecision?: PilotDecisionSnapshot | null;
  taskId?: string | null;
  workHabits?: string[];
  selectedFile?: {
    path: string;
    kind: string;
    dirty?: boolean;
    contentPreview: string | null;
  } | null;
};

export type ChatResponse = {
  text: string;
  invocation?: {
    phase: 'global_assistant' | 'task_assistant';
    layer: 'api_runtime';
    runtime: {
      mode: 'api';
      label: string;
    };
    status: 'completed';
    summary: string;
    pilotDecision?: PilotDecisionSnapshot | null;
  };
};

export type ProjectDecompositionInput = {
  taskId: string;
  instructions?: string;
};

export type ProjectDecompositionInvocationSummary = {
  phase: 'decomposition_draft';
  layer: 'selected_runtime' | 'api_runtime';
  runtime: {
    mode: 'api' | 'codex' | 'claude';
    label: string;
    provider?: string | null;
  };
  status: 'completed' | 'failed' | 'skipped';
  summary: string;
};

export type ProjectSubtaskDraft = {
  title: string;
  summary: string;
  acceptanceCriteria: string;
  dependency: string | null;
  rationale: string;
};

export type ProjectDecompositionPromotionReadinessSummary = {
  ready: boolean;
  summary: string;
  satisfiedRequirements: string[];
  missingRequirements: string[];
};

export type ProjectDecompositionResult = {
  evidenceRunId?: string | null;
  parentGoal: string;
  subtasks: ProjectSubtaskDraft[];
  review: string;
  nextStep: string;
  invocation?: ProjectDecompositionInvocationSummary;
  promotionReadiness?: ProjectDecompositionPromotionReadinessSummary;
};

import type { TaskplaneWritebackApplyPlan } from '../taskplane-writeback-apply-plan.js';
import type { TaskplaneWritebackDispatchResult } from '../taskplane-writeback-dispatch.js';
import type { AgentScheduledEventTriggerPlan } from '../agent-orchestration.js';
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
import type { DecisionJudgmentProjection } from '../decision-judgment-projection.js';
import type { AppEvent } from './events.js';
import type {
  ArtifactRecord,
  CreateManualArtifactInput,
  UpdateArtifactInput,
} from './artifact.js';
import type {
  CreateTaskFileInput,
  TaskFileRecord,
  UpdateTaskFileInput,
} from './task-file.js';
import type {
  AppliedProcessTemplateRecord,
  ApplyProcessTemplateInput,
  CreateProcessTemplateInput,
  ProcessTemplateRecord,
  UpdateProcessTemplateInput,
} from './process-template.js';
import type { OperatorStartedRunRequest } from './operator-started-run.js';
import type {
  GmailOAuthConnectInput,
  GmailOAuthConnectResult,
  GmailOAuthDisconnectInput,
  GmailOAuthDisconnectResult,
} from './external-access-control.js';
import type {
  ExternalAccessSourceIngestionCommitInput,
  ExternalAccessSourceIngestionCommitResult,
  ExternalAccessSourceIngestionPreview,
  ExternalAccessSourceIngestionPreviewInput,
} from './external-access-source-ingestion.js';
import type {
  CancelAgentCliRunInput,
  CancelAgentCliRunResult,
  CodeAgentAllowedCheck,
  CreateAgentCliRunInput,
  CreateCodeAgentRunInput,
  CreateRunInput,
  RecordRuntimeNativeGoalRequestInput,
  RunDetailRecord,
  RunRecord,
} from './run.js';
import type { AiConfigInput, AiConfigStatus } from './settings.js';
import type { AgentSandboxBackendStatus } from '../agent-sandbox-provider.js';
import type { AgentCliRuntimeId } from '../agent-cli-runtime-status.js';
import type {
  CreateSourceContextInput,
  SourceContextRecord,
  UpdateSourceContextInput,
} from './source-context.js';
import type {
  ApplySandboxPatchPromotionInput,
  ApplySandboxPatchPromotionResult,
} from './sandbox-patch-promotion.js';
import type {
  CompletionOverrideLearningSignalInput,
  CreateManualWorkHabitInput,
  CreateWorkHabitProposalInput,
  ImportLegacyWorkHabitsInput,
  RecordWorkHabitApplicationsInput,
  ResolveWorkHabitConflictInput,
  SopTemplateHabitInput,
  UpdateWorkHabitInput,
  WorkHabitRecord,
  WorkHabitStorageSnapshot,
} from './work-habit.js';
import type {
  CreateTaskInput,
  RecordTaskCompletionCheckInput,
  RecordTaskTimelineEventInput,
  TaskDetail,
  TaskListItemRecord,
  TaskRecord,
  TransitionTaskInput,
  UpdateTaskInput,
} from './task.js';
import type {
  AppliedTaskHierarchyManualResolutionResult,
  AppliedTaskHierarchyRepairResult,
  ApplyTaskHierarchyManualResolutionInput,
  TaskHierarchyConsistencyEvaluation,
  TaskHierarchyManualReviewPolicy,
} from '../task-hierarchy-consistency.js';

export type ApplyTaskplaneWritebackInput = {
  plan: TaskplaneWritebackApplyPlan;
  taskId: string;
};

export type PreviewPatchArtifactSandboxReviewInput = {
  artifactId: string;
  requestedChecks?: CodeAgentAllowedCheck[];
};

export type RunPatchArtifactSandboxReviewInput = {
  artifactId: string;
  operatorConfirmed: boolean;
  requestedChecks?: CodeAgentAllowedCheck[];
};

export type TriggerScheduledEventAgentRunInput = {
  taskId: string;
};

export type TriggerScheduledEventAgentRunResult = {
  status: 'started' | 'blocked';
  plan: AgentScheduledEventTriggerPlan;
  run: RunRecord | null;
  terminalRunEvidenceStatus: 'not_started' | 'pending' | 'present';
  triggerRunEvidenceStatus: 'not_started' | 'pending_terminal_run_evidence' | 'ready_for_terminal_review';
  summary: string;
};

export type PatchArtifactSandboxReviewPreview =
  | {
      artifactId: string;
      reason: string;
      status: 'blocked';
      summary: string;
      noWorkspaceFilesWritten: true;
    }
  | {
      artifactId: string;
      changedFiles: string[];
      checks: CodeAgentAllowedCheck[];
      decisionTitle: string;
      idempotencyKey: string;
      noWorkspaceFilesWritten: true;
      sourceId: string;
      sourceKind: string;
      status: 'ready';
      summary: string;
      taskId: string;
      workspaceRoot: string;
    };

export type PatchArtifactSandboxReviewRunResult =
  | {
      artifactId: string;
      noWorkspaceFilesWritten: true;
      reason: string;
      runId: string | null;
      status: 'blocked';
      summary: string;
      taskId: string;
    }
  | {
      artifactId: string;
      noWorkspaceFilesWritten: true;
      reason: string;
      runId: string;
      status: 'failed';
      summary: string;
      taskId: string;
    }
  | {
      artifactId: string;
      checkpointId: string | null;
      decisionId: string | null;
      noWorkspaceFilesWritten: true;
      reviewedArtifactId: string;
      runId: string;
      status: 'completed';
      summary: string;
      taskId: string;
    };

export type ElectronApi = {
  ping: () => Promise<PingResponse>;
  getAiConfigStatus: () => Promise<AiConfigStatus>;
  setAiConfig: (input: AiConfigInput) => Promise<AiConfigStatus>;
  openAgentCliLogin?: (input: { runtimeId: AgentCliRuntimeId }) => Promise<{
    command: string;
    opened: boolean;
    runtimeId: AgentCliRuntimeId;
    summary: string;
  }>;
  openAgentCliInstall?: (input: { repair?: boolean; runtimeId: AgentCliRuntimeId }) => Promise<{
    command: string;
    opened: boolean;
    runtimeId: AgentCliRuntimeId;
    summary: string;
  }>;
  probeSandboxBackend?: () => Promise<AgentSandboxBackendStatus>;
  connectGmailOAuth?: (input: GmailOAuthConnectInput) => Promise<GmailOAuthConnectResult>;
  disconnectGmailOAuth?: (input: GmailOAuthDisconnectInput) => Promise<GmailOAuthDisconnectResult>;
  previewExternalAccessSourceIngestion?: (
    input: ExternalAccessSourceIngestionPreviewInput,
  ) => Promise<ExternalAccessSourceIngestionPreview>;
  commitExternalAccessSourceIngestion?: (
    input: ExternalAccessSourceIngestionCommitInput,
  ) => Promise<ExternalAccessSourceIngestionCommitResult>;
  listTasks: () => Promise<TaskListItemRecord[]>;
  getTaskHierarchyConsistency: () => Promise<TaskHierarchyConsistencyEvaluation>;
  getTaskHierarchyManualReviewPolicy: () => Promise<TaskHierarchyManualReviewPolicy>;
  applySafeTaskHierarchyRepairs: () => Promise<AppliedTaskHierarchyRepairResult>;
  applyTaskHierarchyManualResolution: (
    input: ApplyTaskHierarchyManualResolutionInput,
  ) => Promise<AppliedTaskHierarchyManualResolutionResult>;
  createTask: (input: CreateTaskInput) => Promise<TaskListItemRecord>;
  getTaskDetail: (taskId: string) => Promise<TaskDetail | null>;
  updateTask: (input: UpdateTaskInput) => Promise<TaskListItemRecord>;
  transitionTask: (input: TransitionTaskInput) => Promise<TaskListItemRecord>;
  recordTaskCompletionCheck: (input: RecordTaskCompletionCheckInput) => Promise<void>;
  recordTaskTimelineEvent: (input: RecordTaskTimelineEventInput) => Promise<void>;
  applyTaskplaneWriteback?: (
    input: ApplyTaskplaneWritebackInput,
  ) => Promise<TaskplaneWritebackDispatchResult>;
  getWorkHabitSnapshot: () => Promise<WorkHabitStorageSnapshot>;
  importLegacyWorkHabits: (input: ImportLegacyWorkHabitsInput) => Promise<WorkHabitStorageSnapshot>;
  updateWorkHabit: (input: UpdateWorkHabitInput) => Promise<WorkHabitRecord[]>;
  deleteWorkHabit: (id: string) => Promise<WorkHabitRecord[]>;
  createManualWorkHabit: (input: CreateManualWorkHabitInput) => Promise<WorkHabitRecord[]>;
  proposeWorkHabit: (input: CreateWorkHabitProposalInput) => Promise<WorkHabitRecord[]>;
  resolveWorkHabitConflict: (input: ResolveWorkHabitConflictInput) => Promise<WorkHabitRecord[]>;
  recordCompletionOverrideLearningSignal: (
    input: CompletionOverrideLearningSignalInput,
  ) => Promise<WorkHabitRecord[]>;
  recordSopTemplateHabit: (input: SopTemplateHabitInput) => Promise<WorkHabitRecord[]>;
  recordWorkHabitApplications: (input: RecordWorkHabitApplicationsInput) => Promise<WorkHabitRecord[]>;
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
  createManualArtifact: (input: CreateManualArtifactInput) => Promise<ArtifactRecord>;
  updateArtifact: (input: UpdateArtifactInput) => Promise<ArtifactRecord>;
  deleteArtifact: (id: string) => Promise<ArtifactRecord>;
  previewPatchArtifactSandboxReview?: (
    input: PreviewPatchArtifactSandboxReviewInput,
  ) => Promise<PatchArtifactSandboxReviewPreview>;
  runPatchArtifactSandboxReview?: (
    input: RunPatchArtifactSandboxReviewInput,
  ) => Promise<PatchArtifactSandboxReviewRunResult>;
  applySandboxPatchPromotion?: (
    input: ApplySandboxPatchPromotionInput,
  ) => Promise<ApplySandboxPatchPromotionResult>;
  listTaskFiles: (taskId: string) => Promise<TaskFileRecord[]>;
  createTaskFile: (input: CreateTaskFileInput) => Promise<TaskFileRecord>;
  updateTaskFile: (input: UpdateTaskFileInput) => Promise<TaskFileRecord>;
  deleteTaskFile: (id: string) => Promise<TaskFileRecord>;
  createProcessTemplate: (input: CreateProcessTemplateInput) => Promise<ProcessTemplateRecord>;
  updateProcessTemplate: (input: UpdateProcessTemplateInput) => Promise<ProcessTemplateRecord>;
  archiveProcessTemplate: (id: string) => Promise<ProcessTemplateRecord>;
  applyProcessTemplate: (input: ApplyProcessTemplateInput) => Promise<AppliedProcessTemplateRecord>;
  removeProcessTemplate: (bindingId: string) => Promise<AppliedProcessTemplateRecord>;
  listDecisions: () => Promise<DecisionRecord[]>;
  listDecisionJudgments?: () => Promise<DecisionJudgmentProjection[]>;
  draftDecision: (input: DraftDecisionInput) => Promise<DecisionDraftRecord>;
  createDecision: (input: CreateDecisionInput) => Promise<DecisionRecord>;
  actOnDecision: (input: DecisionActionInput) => Promise<DecisionRecord>;
  getHomeBrief: () => Promise<HomeBriefData>;
  listRuns: () => Promise<RunRecord[]>;
  getRunDetail: (runId: string) => Promise<RunDetailRecord | null>;
  triggerRun: (input: CreateRunInput) => Promise<RunRecord>;
  triggerAgentCliRun?: (input: CreateAgentCliRunInput) => Promise<RunRecord>;
  recordRuntimeNativeGoalRequest?: (input: RecordRuntimeNativeGoalRequestInput) => Promise<RunRecord>;
  cancelAgentCliRun?: (input: CancelAgentCliRunInput) => Promise<CancelAgentCliRunResult>;
  triggerCodeAgentRun?: (input: CreateCodeAgentRunInput) => Promise<RunRecord>;
  triggerOperatorStartedRun?: (input: OperatorStartedRunRequest) => Promise<RunRecord>;
  triggerScheduledEventAgentRun?: (
    input: TriggerScheduledEventAgentRunInput,
  ) => Promise<TriggerScheduledEventAgentRunResult>;
  continuePausedRun: (runId: string) => Promise<RunRecord>;
  subscribeToEvents: (listener: (event: AppEvent) => void) => () => void;
  chatWithAI?: (input: ChatInput) => Promise<ChatResponse>;
  decomposeProject?: (input: ProjectDecompositionInput) => Promise<ProjectDecompositionResult>;
};
