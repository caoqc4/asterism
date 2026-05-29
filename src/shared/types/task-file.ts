export type TaskFileKind = 'file' | 'folder';

export type TaskFileRecord = {
  id: string;
  taskId: string;
  businessLineId?: string | null;
  name: string;
  path: string;
  kind: TaskFileKind;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateTaskFileInput = {
  taskId: string;
  businessLineId?: string | null;
  name: string;
  path?: string;
  kind: TaskFileKind;
  content?: string;
};

export type UpdateTaskFileInput = {
  id: string;
  name?: string;
  path?: string;
  content?: string;
};
