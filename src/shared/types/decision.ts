export type DecisionStatus = 'pending' | 'approved' | 'deferred' | 'cancelled';
export type DecisionSourceType =
  | 'manual'
  | 'agent_checkpoint'
  | 'run'
  | 'tool'
  | 'external_access'
  | 'workspace'
  | 'system';

export type DecisionScope =
  | 'task'
  | 'run'
  | 'business_line'
  | 'agent'
  | 'external_access'
  | 'workspace'
  | 'system'
  | 'global';

export type DecisionKind =
  | 'direction_choice'
  | 'risk_approval'
  | 'external_write'
  | 'agent_resume'
  | 'completion_acceptance'
  | 'information_request'
  | 'policy_change';

export type DecisionContext = {
  whyNow?: string | null;
  ifDeferred?: string | null;
  impact?: string | null;
  reversibility?: string | null;
};

export type DecisionOption = {
  id?: string | null;
  label: string;
  description?: string | null;
  risk?: string | null;
};

export type DecisionRecommendation = {
  optionId?: string | null;
  label: string;
  reason?: string | null;
};

export type DecisionRecord = {
  id: string;
  taskId: string | null;
  businessLineId?: string | null;
  title: string;
  status: DecisionStatus;
  scope: DecisionScope;
  kind: DecisionKind;
  sourceType?: DecisionSourceType | null;
  sourceId?: string | null;
  sourceLabel?: string | null;
  context?: DecisionContext | null;
  options?: DecisionOption[];
  recommendation?: DecisionRecommendation | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateDecisionInput = {
  taskId?: string | null;
  businessLineId?: string | null;
  title: string;
  scope?: DecisionScope;
  kind?: DecisionKind;
  sourceType?: DecisionSourceType | null;
  sourceId?: string | null;
  sourceLabel?: string | null;
  context?: DecisionContext | null;
  options?: DecisionOption[];
  recommendation?: DecisionRecommendation | null;
};

export type DraftDecisionInput = {
  taskId: string;
  note?: string | null;
};

export type DecisionDraftInvocationSummary = {
  phase: 'decision_draft';
  layer: 'api_runtime' | 'product_harness';
  runtime: {
    mode: 'api' | 'product_harness';
    label: string;
  };
  status: 'completed' | 'failed' | 'skipped';
  summary: string;
};

export type DecisionDraftRecord = {
  taskId: string;
  title: string;
  rationale: string;
  suggestedScope: DecisionScope;
  suggestedKind: DecisionKind;
  suggestedSourceType: DecisionSourceType;
  source: 'ai' | 'fallback';
  selectedTemplateIds: string[];
  selectedTemplateTitles: string[];
  selectionReason: string;
  invocation?: DecisionDraftInvocationSummary;
};

export type DecisionActionInput = {
  id: string;
  action: 'approve' | 'defer' | 'cancel';
};
