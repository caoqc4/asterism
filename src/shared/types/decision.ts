export type DecisionStatus = 'pending' | 'approved' | 'deferred' | 'cancelled';

export type DecisionRecord = {
  id: string;
  taskId: string;
  title: string;
  status: DecisionStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateDecisionInput = {
  taskId: string;
  title: string;
};

export type DraftDecisionInput = {
  taskId: string;
  note?: string | null;
};

export type DecisionDraftRecord = {
  taskId: string;
  title: string;
  rationale: string;
  source: 'ai' | 'fallback';
  selectedTemplateIds: string[];
  selectedTemplateTitles: string[];
  selectionReason: string;
};

export type DecisionActionInput = {
  id: string;
  action: 'approve' | 'defer' | 'cancel';
};
