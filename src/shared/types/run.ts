import type { AgentSessionRecord } from './agent-execution.js';
import type { ArtifactRecord } from './artifact.js';
import type { RuntimeEventRecord, RuntimeReplayGroup } from '../runtime-event-record.js';

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
  agentSessions?: AgentSessionRecord[];
  verifications?: RunVerificationRecord[];
  runtimeEvents?: RuntimeEventRecord[];
  runtimeReplayGroups?: RuntimeReplayGroup[];
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

export type CreateRunInput = {
  taskId: string;
  type: RunType;
  instructions?: string;
  allowLocalWorkspaceRead?: boolean;
  allowTaskMutationTools?: boolean;
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
