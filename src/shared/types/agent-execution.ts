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

export type AgentToolName = 'artifact.create_note' | 'task.inspect_context';

export type AgentPolicy = {
  maxSteps: number;
  maxWallTimeMs: number;
  allowNetwork: boolean;
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
