export type ProcessTemplateKind = 'skill' | 'workflow' | 'sop' | 'checklist';

export type ProcessTemplateStatus = 'active' | 'archived';

export type TaskProcessBindingStatus = 'active' | 'removed';

export type ProcessTemplateRecord = {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  kind: ProcessTemplateKind;
  tags: string[];
  status: ProcessTemplateStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type AppliedProcessTemplateRecord = ProcessTemplateRecord & {
  bindingId: string;
  taskId: string;
  bindingStatus: TaskProcessBindingStatus;
  bindingNote: string | null;
  boundAt: string;
  bindingUpdatedAt: string;
  removedAt: string | null;
};

export type CreateProcessTemplateInput = {
  title: string;
  summary?: string | null;
  content: string;
  kind: ProcessTemplateKind;
  tags?: string[];
};

export type UpdateProcessTemplateInput = {
  id: string;
  title?: string;
  summary?: string | null;
  content?: string;
  kind?: ProcessTemplateKind;
  tags?: string[];
};

export type ApplyProcessTemplateInput = {
  taskId: string;
  templateId: string;
  note?: string | null;
};
