export type TaskDependencyStatus = 'active' | 'resolved';

export type TaskDependencyRecord = {
  id: string;
  taskId: string;
  blockedByTaskId: string;
  blockedByTaskTitle: string | null;
  reason: string | null;
  status: TaskDependencyStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type CreateTaskDependencyInput = {
  taskId: string;
  blockedByTaskId: string;
  reason?: string | null;
};

export type UpdateTaskDependencyInput = {
  id: string;
  blockedByTaskId?: string;
  reason?: string | null;
};
