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

export type DecisionActionInput = {
  id: string;
  action: 'approve' | 'defer' | 'cancel';
};
