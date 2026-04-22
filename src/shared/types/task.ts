export type TaskState =
  | 'captured'
  | 'triaged'
  | 'planned'
  | 'running'
  | 'waiting_external'
  | 'completed'
  | 'archived';

export type TaskRiskLevel = 'none' | 'low' | 'medium' | 'high';

export type TaskRecord = {
  id: string;
  title: string;
  summary: string | null;
  state: TaskState;
  nextStep: string | null;
  waitingReason: string | null;
  riskLevel: TaskRiskLevel;
  riskNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskDetail = TaskRecord & {
  timeline: TimelineEventRecord[];
};

export type TimelineEventRecord = {
  id: string;
  taskId: string;
  type: string;
  payload: string | null;
  createdAt: string;
};

export type CreateTaskInput = {
  title: string;
  summary?: string;
};

export type UpdateTaskInput = {
  id: string;
  title?: string;
  summary?: string | null;
  nextStep?: string | null;
  waitingReason?: string | null;
  riskLevel?: TaskRiskLevel;
  riskNote?: string | null;
};

export type TransitionTaskInput = {
  id: string;
  nextState: TaskState;
};
