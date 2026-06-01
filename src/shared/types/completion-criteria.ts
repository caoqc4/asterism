import type { ResponsibilityKind } from './responsibility.js';

export type CompletionCriteriaStatus = 'open' | 'satisfied';

export type CompletionCriteriaRecord = {
  id: string;
  taskId: string;
  text: string;
  verificationResponsibility: ResponsibilityKind | null;
  verificationResponsibilityLabel: string | null;
  status: CompletionCriteriaStatus;
  createdAt: string;
  updatedAt: string;
  satisfiedAt: string | null;
};

export type CreateCompletionCriteriaInput = {
  taskId: string;
  text: string;
  verificationResponsibility?: ResponsibilityKind | null;
  verificationResponsibilityLabel?: string | null;
};

export type UpdateCompletionCriteriaInput = {
  id: string;
  text: string;
  verificationResponsibility?: ResponsibilityKind | null;
  verificationResponsibilityLabel?: string | null;
};
