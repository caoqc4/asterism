export type WorkHabitSource = 'silent' | 'proposal' | 'sop' | 'manual';
export type WorkHabitScope = 'global' | 'task_type' | 'project';
export type WorkHabitStatus = 'pending' | 'confirmed' | 'disabled';

export type WorkHabitRecord = {
  id: string;
  rule: string;
  source: WorkHabitSource;
  scope: WorkHabitScope;
  scopeLabel: string;
  status: WorkHabitStatus;
  examples: string;
  createdAt: string;
  lastAppliedAt: string | null;
  applicationCount: number;
};

export type WorkHabitStorageSnapshot = {
  version: 3;
  storage: 'main_db';
  privacyBoundary: {
    locality: 'device_only';
    contains: string[];
    excludes: string[];
  };
  habits: WorkHabitRecord[];
};

export type WorkHabitConflict = {
  candidate: WorkHabitRecord;
  confirmed: WorkHabitRecord;
};

export type CreateManualWorkHabitInput = {
  rule: string;
  scope: WorkHabitScope;
  scopeLabel: string;
  examples?: string;
};

export type UpdateWorkHabitInput = {
  id: string;
  rule?: string;
  scopeLabel?: string;
  status?: WorkHabitStatus;
};

export type ResolveWorkHabitConflictInput = {
  candidateId: string;
  decision: 'accept_candidate' | 'keep_confirmed';
};

export type CompletionOverrideLearningSignalInput = {
  taskId: string;
  taskTitle: string;
  reason: string;
  runVerificationTone?: 'pass' | 'warn' | 'fail' | 'pending' | null;
  runVerificationLabel?: string | null;
  runVerificationDetail?: string | null;
};

export type SopTemplateHabitInput = {
  taskId: string;
  taskTitle: string;
  steps: string[];
};

export type ImportLegacyWorkHabitsInput = {
  habits: WorkHabitRecord[];
};
