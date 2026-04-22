export type RunType = 'draft' | 'summarize';

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed';
export type RunOutputSource = 'ai' | 'fallback' | 'system';

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

export type CreateRunInput = {
  taskId: string;
  type: RunType;
  instructions?: string;
};
