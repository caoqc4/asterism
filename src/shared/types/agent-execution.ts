import type { PriorityLane } from './brief.js';
import type { RunCheckpointKind, RunType } from './run.js';
import type { TaskRiskLevel, TaskState } from './task.js';

export type AgentRunMode = RunType;

export type AgentToolRisk =
  | 'safe_read'
  | 'local_command'
  | 'local_write'
  | 'external_read'
  | 'external_write'
  | 'sensitive';

export type AgentToolName =
  | 'artifact.create_note'
  | 'decision.draft'
  | 'source_context.create'
  | 'task.create_completion_criterion'
  | 'task.inspect_context'
  | 'task.inspect_timeline'
  | 'task.review_completion_evidence'
  | 'task.update_next_step'
  | 'workspace.read_file'
  | 'workspace.run_command'
  | 'workspace.search'
  | 'workspace.write_patch';

export type AgentPolicy = {
  maxSteps: number;
  maxWallTimeMs: number;
  allowNetwork: boolean;
  allowLocalWorkspaceRead: boolean;
  allowTaskMutationTools?: boolean;
  allowLocalCommandRun?: boolean;
  allowLocalFileWrite: boolean;
  confirmationRequiredRisks: AgentToolRisk[];
};

export type AgentWorkingContext = {
  task: {
    id: string;
    title: string;
    summary: string | null;
    state: TaskState;
    nextStep: string | null;
    riskLevel: TaskRiskLevel;
    riskNote: string | null;
  };
  priorityLane: PriorityLane;
  resumeSummary: string;
  completion: {
    total: number;
    satisfied: number;
    open: number;
    nextOpenCriterion: string | null;
  };
  blockers: Array<{
    title: string;
    detail: string | null;
    owner: string | null;
  }>;
  dependencies: Array<{
    title: string;
    detail: string | null;
  }>;
  sources: Array<{
    title: string;
    kind: string;
    isKey: boolean;
    note: string | null;
    contentPreview: string | null;
  }>;
  processTemplates: Array<{
    id: string;
    title: string;
    kind: string;
    summary: string | null;
  }>;
  recentTimeline: Array<{
    type: string;
    summary: string;
    createdAt: string;
  }>;
};

export type AgentRunRequest = {
  runId: string;
  taskId: string;
  sessionId?: string | null;
  goal: string;
  instructions?: string | null;
  mode: AgentRunMode;
  context: AgentWorkingContext;
  policy: AgentPolicy;
};

export type AgentRuntimeCapabilities = {
  structuredToolCalls: boolean;
  textOnlyPlanning: boolean;
  streaming: boolean;
  fileContext: boolean;
  taskMutationTools: boolean;
  longRunningSessions: boolean;
};

export type AgentSessionRequest = AgentRunRequest & {
  capabilities: AgentRuntimeCapabilities;
};

export type AgentRuntimeEventBase = {
  runId: string;
  sessionId?: string | null;
  createdAt?: string | null;
};

export type AgentSessionEvent =
  | (AgentRuntimeEventBase & {
      type: 'session.started';
      taskId: string;
      mode: AgentRunMode;
      capabilities: AgentRuntimeCapabilities;
    })
  | (AgentRuntimeEventBase & {
      type: 'plan.proposed';
      summary: string;
      source: 'model' | 'fallback' | 'provider_tool_call';
      detail?: string | null;
    })
  | (AgentRuntimeEventBase & { type: 'model.completed'; output: string; provider?: string | null; model?: string | null })
  | (AgentRuntimeEventBase & { type: 'tool.started'; tool: AgentToolName; input: unknown })
  | (AgentRuntimeEventBase & { type: 'tool.completed'; tool: AgentToolName; result: AgentToolResult })
  | (AgentRuntimeEventBase & { type: 'tool.failed'; tool: AgentToolName; error: string; result?: AgentToolResult | null })
  | (AgentRuntimeEventBase & {
      type: 'checkpoint.created';
      checkpointId: string;
      checkpointKind: 'resume' | 'confirmation' | 'tool_permission' | 'patch_promotion' | 'external_wait';
      reason: string;
      decisionId?: string | null;
      tool?: AgentToolName | null;
    })
  | (AgentRuntimeEventBase & { type: 'session.heartbeat'; summary: string })
  | (AgentRuntimeEventBase & { type: 'session.paused'; checkpointId: string; message: string })
  | (AgentRuntimeEventBase & { type: 'session.completed'; output: string })
  | (AgentRuntimeEventBase & { type: 'session.failed'; failureKind: string; message: string })
  | (AgentRuntimeEventBase & { type: 'session.interrupted'; reason: string })
  | (AgentRuntimeEventBase & { type: 'session.cancelled'; reason: string });

export type AgentSessionResult =
  | { status: 'completed'; output: string }
  | { status: 'failed'; failureKind: string; message: string }
  | { status: 'needs_confirmation'; checkpointId: string; message: string }
  | { status: 'paused'; checkpointId: string; message: string };

export type AgentSessionRecord = {
  id: string;
  runId: string;
  mode: AgentRunMode;
  status: 'running' | 'completed' | 'failed' | 'paused' | 'needs_confirmation' | 'cancelled';
  capabilities: AgentRuntimeCapabilities;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentStepProposal = {
  finalOutput?: string | null;
  steps: Array<{
    tool: AgentToolName;
    input?: Record<string, unknown>;
  }>;
};

export type ProviderToolCallPlan = {
  source: 'provider_tool_call';
  provider: string;
  model: string;
  proposal: AgentStepProposal;
  rawSummary: string;
  providerCallIds: string[];
  stopReason?: string | null;
};

export type ProviderToolCallNormalizationResult =
  | {
      status: 'normalized';
      plan: ProviderToolCallPlan;
    }
  | {
      status: 'failed';
      provider: string;
      model: string;
      error: string;
      rawSummary: string;
    };

export type ProviderToolCallShadowResult =
  | {
      status: 'skipped';
      provider: string;
      model: string;
      reason: string;
    }
  | {
      status: 'observed';
      provider: string;
      model: string;
      rawSummary: string;
      providerCallCount: number;
      stopReason: string | null;
    }
  | {
      status: 'failed';
      provider: string;
      model: string;
      error: string;
      rawSummary: string;
    };

export type AgentToolResult = {
  success: boolean;
  summary: string;
  output?: string | null;
  artifactId?: string | null;
  checkpointId?: string | null;
  checkpointKind?: RunCheckpointKind | null;
  checkpointEvent?: Extract<AgentSessionEvent, { type: 'checkpoint.created' }> | null;
  decisionId?: string | null;
  error?: string | null;
  status?: 'completed' | 'failed' | 'needs_confirmation';
};

export type AgentArtifactDraft = {
  title: string;
  kind: 'run_output' | 'note' | 'patch' | 'research';
  content: string;
};

export type AgentRunResult =
  | { status: 'completed'; output: string; artifacts: AgentArtifactDraft[] }
  | { status: 'failed'; failureKind: string; message: string }
  | { status: 'needs_confirmation'; checkpointId: string; message: string }
  | { status: 'paused'; checkpointId: string; message: string };
