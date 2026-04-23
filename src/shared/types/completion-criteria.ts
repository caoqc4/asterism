export type CompletionCriteriaStatus = 'open' | 'satisfied';

export type CompletionCriteriaRecord = {
  id: string;
  taskId: string;
  text: string;
  status: CompletionCriteriaStatus;
  createdAt: string;
  updatedAt: string;
  satisfiedAt: string | null;
};

export type CreateCompletionCriteriaInput = {
  taskId: string;
  text: string;
};

export type UpdateCompletionCriteriaInput = {
  id: string;
  text: string;
};
