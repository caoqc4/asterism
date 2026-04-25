import type { PriorityLane } from './brief.js';
import type { RunType } from './run.js';
import type { TaskRiskLevel, TaskState } from './task.js';

export type AgentRunMode = RunType;

export type AgentToolRisk =
  | 'safe_read'
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
  | 'task.update_next_step'
  | 'workspace.read_file'
  | 'workspace.search'
  | 'workspace.write_patch';

export type AgentPolicy = {
  maxSteps: number;
  maxWallTimeMs: number;
  allowNetwork: boolean;
  allowLocalWorkspaceRead: boolean;
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
  longRunningSessions: boolean;
};

export type AgentSessionRequest = AgentRunRequest & {
  capabilities: AgentRuntimeCapabilities;
};

export type AgentSessionEvent =
  | { type: 'plan'; summary: string }
  | { type: 'model'; output: string }
  | { type: 'tool_call'; tool: AgentToolName; input: unknown }
  | { type: 'tool_result'; tool: AgentToolName; result: AgentToolResult }
  | { type: 'checkpoint'; checkpointId: string; reason: string }
  | { type: 'final'; output: string };

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

export type AgentToolResult = {
  success: boolean;
  summary: string;
  output?: string | null;
  artifactId?: string | null;
  checkpointId?: string | null;
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
