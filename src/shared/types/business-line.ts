import type { DecisionRecord } from './decision.js';
import type { DecisionStatus } from './decision.js';
import type { SourceContextRecord } from './source-context.js';
import type { TaskListItemRecord, TaskRecord, TaskRiskLevel } from './task.js';

export type BusinessLineKind = 'software_product' | 'project' | 'routine' | 'general';

export type BusinessLineCreationTemplate = 'web_product' | 'custom';

export type BusinessLineRecordType =
  | 'signal'
  | 'hypothesis'
  | 'decision'
  | 'action'
  | 'artifact'
  | 'result'
  | 'review'
  | 'rule';

export type BusinessLineSkillRevisionStatus = 'proposed' | 'active' | 'rejected' | 'disabled' | 'superseded';

export type BusinessLineSkillRevisionApprovalSourceType = 'operator' | 'decision' | 'rollback';

export type BusinessLineSkillRevisionProvenance = {
  sourceType: 'business_line_review' | 'template' | 'inherited' | 'manual';
  sourceReviewId?: string | null;
  sourceReviewSummary?: string | null;
  sourceActionId?: string | null;
};

export type BusinessLineRecordProvenanceSource =
  | 'business_line_record'
  | 'source_context'
  | 'artifact'
  | 'task_file'
  | 'decision'
  | 'review';

export type BusinessLineRecordProvenance = {
  sourceType: BusinessLineRecordProvenanceSource;
  sourceId: string;
  sourceLabel: string;
  taskId?: string | null;
  runId?: string | null;
  uri?: string | null;
};

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
  futureContextReason?: string | null;
  provenance?: BusinessLineRecordProvenance | null;
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
  contentDiff?: string | null;
  changeReason: string;
  sourceReviewId: string;
  provenance?: BusinessLineSkillRevisionProvenance | null;
  approvedBy: string | null;
  approvalSourceType?: BusinessLineSkillRevisionApprovalSourceType | null;
  approvalSourceId?: string | null;
  status: BusinessLineSkillRevisionStatus;
  effectiveAt: string | null;
  rollbackTargetRevisionId: string | null;
  supersededByRevisionId?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  disabledBy?: string | null;
  disabledAt?: string | null;
  reviewAfterAt?: string | null;
  expiresAt?: string | null;
  requiresDecision?: boolean;
  approvalDecisionId?: string | null;
  approvalDecisionStatus?: DecisionStatus | null;
  isExpired?: boolean;
  needsReview?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BusinessLineTodaySuggestion = {
  id: string;
  type: 'progress' | 'record_gap' | 'improvement';
  businessLineId: string;
  businessLineTitle: string;
  whyNow: string;
  expectedImpact: string;
  effort: {
    level: 'low' | 'medium' | 'high';
    note: string | null;
  };
  confidence: number;
  nextStep: string;
  sourceRecords: string[];
  sourceRecordIds: string[];
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
  template?: BusinessLineCreationTemplate;
  desiredOutcome?: string | null;
  continuousInformation?: string | null;
  aiWorkAndConfirmation?: string | null;
  sourceBusinessLineId?: string | null;
  initialStructure?: string[];
  initialRecords?: string[];
  reviewPrompts?: string[];
  proposedSops?: string[];
  initialNextActions?: string[];
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
  reviewAfterAt?: string | null;
  expiresAt?: string | null;
};

export type AcceptBusinessLineSkillRevisionInput = {
  revisionId: string;
  approvedBy?: string | null;
};

export type RejectBusinessLineSkillRevisionInput = {
  revisionId: string;
  rejectedBy?: string | null;
};

export type DisableBusinessLineSkillRevisionInput = {
  revisionId: string;
  disabledBy?: string | null;
};

export type RollbackBusinessLineSkillRevisionInput = {
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
