import type { AgentSessionRecord } from './agent-execution.js';
import type { ArtifactRecord } from './artifact.js';
import type { SandboxPatchPromotionRecord } from './sandbox-patch-promotion.js';
import type { RuntimeEventRecord, RuntimeReplayGroup } from '../runtime-event-record.js';
import type { TaskMemoryGuidanceState } from '../task-memory-guidance-state.js';
import type { TaskMemoryWriteProposal } from '../task-memory-write-proposal.js';
import type { AgentCliRuntimeId } from '../agent-cli-runtime-status.js';
import type { PilotDecisionSnapshot } from '../pilot-decision-contract.js';
import type { BusinessLinePostRunReviewOptions } from './business-line.js';

export type RunType = 'draft' | 'summarize' | 'agent';

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'needs_confirmation' | 'paused';
export type RunOutputSource = 'ai' | 'fallback' | 'system';
export type RunStepKind = 'plan' | 'model' | 'tool_call' | 'tool_result' | 'artifact' | 'decision' | 'checkpoint' | 'final';
export type RunStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type RunCheckpointKind = 'resume' | 'confirmation' | 'tool_permission' | 'patch_promotion' | 'external_wait';
export type RunCheckpointStatus = 'open' | 'resolved' | 'cancelled';
export type RunVerificationTargetType = 'run' | 'step';
export type RunVerificationTone = 'pass' | 'warn' | 'fail' | 'pending';
export type RunVerificationSource = 'lightweight_rule_engine' | 'ai_verifier';

export type RunRecord = {
  id: string;
  taskId: string;
  businessLineId?: string | null;
  type: RunType;
  status: RunStatus;
  instructions: string | null;
  output: string | null;
  outputSource: RunOutputSource | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RunStepRecord = {
  id: string;
  runId: string;
  index: number;
  kind: RunStepKind;
  status: RunStepStatus;
  title: string;
  input: string | null;
  output: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RunDetailRecord = RunRecord & {
  artifacts?: ArtifactRecord[];
  steps?: RunStepRecord[];
  checkpoints?: RunCheckpointRecord[];
  sandboxPatchPromotions?: SandboxPatchPromotionRecord[];
  agentSessions?: AgentSessionRecord[];
  verifications?: RunVerificationRecord[];
  runtimeEvents?: RuntimeEventRecord[];
  runtimeReplayGroups?: RuntimeReplayGroup[];
  businessLinePostRunReview?: BusinessLinePostRunReviewOptions | null;
  taskMemoryGuidance?: TaskMemoryGuidanceState;
  taskMemoryWriteProposals?: TaskMemoryWriteProposal[];
};

export type RunCheckpointRecord = {
  id: string;
  runId: string;
  stepId: string | null;
  kind: RunCheckpointKind;
  status: RunCheckpointStatus;
  payload: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type RunVerificationRecord = {
  id: string;
  runId: string;
  targetType: RunVerificationTargetType;
  targetId: string;
  tone: RunVerificationTone;
  label: string;
  detail: string;
  source: RunVerificationSource;
  createdAt: string;
  updatedAt: string;
};

export type RunRequestSurface =
  | 'right_panel_agent_execution'
  | 'right_panel_task_progress_intent'
  | 'ipc_run_trigger'
  | 'scheduled_event_agent_trigger'
  | 'readiness_smoke_operator_request';

export type CreateRunInput = {
  taskId: string;
  businessLineId?: string | null;
  type: RunType;
  instructions?: string;
  allowLocalWorkspaceRead?: boolean;
  allowTaskMutationTools?: boolean;
  pilotDecision?: PilotDecisionSnapshot | null;
  requestSurface?: RunRequestSurface;
};

export type CodeAgentAllowedCheck = 'test' | 'lint';

export type CreateCodeAgentRunInput = {
  taskId: string;
  patchIntent: string;
  artifactIds?: string[];
  contextFiles?: string[];
  includeArtifactContent?: boolean;
  sourceContextIds?: string[];
  includeSourceContextContent?: boolean;
  requestedChecks: CodeAgentAllowedCheck[];
  operatorConfirmed: boolean;
  useModelProducer?: boolean;
};

export type AgentCliRunSandboxMode = 'read-only';

export type CreateAgentCliRunInput = {
  taskId: string;
  businessLineId?: string | null;
  prompt: string;
  runtimeId?: AgentCliRuntimeId;
  sandboxMode?: AgentCliRunSandboxMode;
  operatorConfirmed: boolean;
  pilotDecision?: PilotDecisionSnapshot | null;
};

export type RecordRuntimeNativeGoalRequestInput = {
  taskId: string;
  runtimeId: AgentCliRuntimeId | 'selected';
  runtimeLabel: string;
  objective: string;
  supportsNativeGoalMode: boolean;
  forwarded: false;
  reason: string;
  operatorConfirmed: boolean;
};

export type CancelAgentCliRunInput = {
  runId: string;
  reason?: string;
  operatorConfirmed: boolean;
};

export type CancelAgentCliRunResult = {
  runId: string;
  cancelled: boolean;
  reason: string;
  summary: string;
};
