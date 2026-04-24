export type RunType = 'draft' | 'summarize' | 'agent';

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed';
export type RunOutputSource = 'ai' | 'fallback' | 'system';
export type RunStepKind = 'plan' | 'model' | 'tool_call' | 'tool_result' | 'artifact' | 'decision' | 'checkpoint' | 'final';
export type RunStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

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
  steps?: RunStepRecord[];
};

export type CreateRunInput = {
  taskId: string;
  type: RunType;
  instructions?: string;
};
