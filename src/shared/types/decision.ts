export type DecisionStatus = 'pending' | 'approved' | 'deferred' | 'cancelled';
export type DecisionSourceType = 'manual' | 'agent_checkpoint';

export type DecisionRecord = {
  id: string;
  taskId: string;
  title: string;
  status: DecisionStatus;
  sourceType?: DecisionSourceType | null;
  sourceId?: string | null;
  sourceLabel?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateDecisionInput = {
  taskId: string;
  title: string;
  sourceType?: DecisionSourceType | null;
  sourceId?: string | null;
  sourceLabel?: string | null;
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
