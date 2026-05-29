import type { DecisionRecord } from './decision.js';
import type { DecisionStatus } from './decision.js';
import type { SourceContextRecord } from './source-context.js';
import type { TaskListItemRecord, TaskRecord, TaskRiskLevel } from './task.js';

export type BusinessLineKind = 'software_product' | 'project' | 'routine' | 'general';

export type BusinessLineRecordType =
  | 'signal'
  | 'hypothesis'
  | 'decision'
  | 'action'
  | 'artifact'
  | 'result'
  | 'review'
  | 'rule';

export type BusinessLineSkillRevisionStatus = 'proposed' | 'active' | 'disabled' | 'superseded';

export type BusinessLine = {
  id: string;
  title: string;
  summary: string | null;
  goal: string | null;
  kind: BusinessLineKind;
  legacyTaskId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BusinessLineRecord = {
  id: string;
  type: BusinessLineRecordType;
  businessLineId: string;
  source: string;
  summary: string;
  confidence: number;
  linkedActionId: string | null;
  linkedDecisionId: string | null;
  shouldAffectFutureContext: boolean;
  createdAt: string;
};

export type BusinessLineActionStatus = 'active' | 'completed' | 'archived';

export type BusinessLineActionLink = {
  id: string;
  businessLineId: string;
  taskId: string;
  sourceReviewId: string | null;
  sourceRecordId: string | null;
  status: BusinessLineActionStatus;
  createdAt: string;
  updatedAt: string;
};

export type BusinessLineReview = {
  id: string;
  businessLineId: string;
  sourceActionId: string | null;
  resultSummary: string;
  evidenceItems: string[];
  hypothesisChange: string | null;
  skillUpdateSuggestions: string[];
  nextActionSuggestions: string[];
  confidence: number;
  requiresDecision: boolean;
  createdAt: string;
};

export type BusinessLineSkillRevision = {
  id: string;
  skillId: string;
  businessLineId: string;
  scopePath: string;
  previousContent: string | null;
  nextContent: string;
  changeReason: string;
  sourceReviewId: string;
  approvedBy: string | null;
  status: BusinessLineSkillRevisionStatus;
  effectiveAt: string | null;
  rollbackTargetRevisionId: string | null;
  requiresDecision?: boolean;
  approvalDecisionId?: string | null;
  approvalDecisionStatus?: DecisionStatus | null;
  createdAt: string;
  updatedAt: string;
};

export type BusinessLineTodaySuggestion = {
  id: string;
  type: 'progress' | 'record_gap' | 'improvement';
  businessLineId: string;
  businessLineTitle: string;
  whyNow: string;
  nextStep: string;
  sourceRecords: string[];
  risk: {
    level: TaskRiskLevel;
    note: string | null;
  };
  requiresDecision: boolean;
  taskId: string | null;
};

export type BusinessLineContextPack = {
  businessSummary: string | null;
  currentGoal: string | null;
  recentChanges: string[];
  activeDecisions: DecisionRecord[];
  openNextActions: TaskListItemRecord[];
  latestRecords: BusinessLineRecord[];
  acceptedSkills: BusinessLineSkillRevision[];
  knownConstraints: string[];
  permissionBoundaries: string[];
  missingContext: string[];
};

export type BusinessLineWorkspace = {
  businessLine: BusinessLine;
  overview: {
    nextSuggestion: BusinessLineTodaySuggestion | null;
    recentChanges: string[];
    blockedDecisions: DecisionRecord[];
    missingContext: string[];
    latestResult: BusinessLineRecord | null;
    latestImprovement: BusinessLineSkillRevision | null;
  };
  records: BusinessLineRecord[];
  sourceRecords: SourceContextRecord[];
  nextActions: TaskListItemRecord[];
  learning: {
    reviews: BusinessLineReview[];
    skillRevisions: BusinessLineSkillRevision[];
    acceptedSkills: BusinessLineSkillRevision[];
  };
  contextPack: BusinessLineContextPack;
};

export type CreateBusinessLineInput = {
  title: string;
  summary?: string | null;
  goal?: string | null;
  kind?: BusinessLineKind;
  legacyTaskId?: string | null;
};

export type RecordBusinessLineReviewInput = {
  businessLineId: string;
  sourceActionId?: string | null;
  resultSummary: string;
  evidenceItems?: string[];
  hypothesisChange?: string | null;
  skillUpdateSuggestions?: string[];
  nextActionSuggestions?: string[];
  confidence?: number;
  requiresDecision?: boolean;
};

export type AcceptBusinessLineSkillRevisionInput = {
  revisionId: string;
  approvedBy?: string | null;
};

export type BusinessLineListItem = BusinessLine & {
  nextActionCount: number;
  latestRecordSummary: string | null;
  activeSkillCount: number;
};

export function businessLineIdForLegacyTask(taskId: string): string {
  return `business_line:${taskId}`;
}

export function inferBusinessLineKindFromTask(task: Pick<TaskRecord, 'taskType' | 'taskFacets'>): BusinessLineKind {
  const facets = task.taskFacets ?? [];
  if (task.taskType === 'routine' || facets.includes('routine')) return 'routine';
  if (task.taskType === 'project' || facets.includes('project')) return 'project';
  return 'general';
}
