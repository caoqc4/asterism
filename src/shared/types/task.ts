import type { ArtifactRecord } from './artifact.js';
import type { BlockerRecord } from './blocker.js';
import type { CompletionCriteriaRecord } from './completion-criteria.js';
import type {
  AppliedProcessTemplateRecord,
  ProcessTemplateRecord,
} from './process-template.js';
import type { SourceContextRecord } from './source-context.js';
import type { TaskDependencyRecord } from './task-dependency.js';
import type { TaskFileRecord } from './task-file.js';
import type { WaitingItemRecord } from './waiting-item.js';

export type TaskState =
  | 'captured'
  | 'triaged'
  | 'planned'
  | 'running'
  | 'waiting_external'
  | 'completed'
  | 'archived';

export type TaskRiskLevel = 'none' | 'low' | 'medium' | 'high';

export type TaskRecord = {
  id: string;
  title: string;
  summary: string | null;
  state: TaskState;
  nextStep: string | null;
  waitingReason: string | null;
  riskLevel: TaskRiskLevel;
  riskNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskListItemRecord = TaskRecord & {
  activeWaitingItem: WaitingItemRecord | null;
  activeBlocker: BlockerRecord | null;
  activeDependency?: TaskDependencyRecord | null;
  dependencyReevaluation?: {
    dependencyId: string;
    upstreamTaskId: string;
    upstreamTaskTitle: string;
    status: 'upstream_ready' | 'upstream_unblocked';
    updatedAt: string;
  } | null;
};

export type ResumeLatestChangeRecord = {
  summary: string;
  action: {
    label: string | null;
    targetType: 'decision' | 'run' | 'source_context' | null;
    targetId: string | null;
  };
};

export type ResumeKeySourceSliceRecord = {
  sourceContextId: string | null;
  title: string;
  detail: string | null;
  priorityReason: string | null;
};

export type ResumeCurrentMethodSliceRecord = {
  templateId: string | null;
  title: string;
  detail: string | null;
  selectionReason: string | null;
};

export type TaskResumeCardRecord = {
  summary: string;
  currentState: string;
  latestChange: ResumeLatestChangeRecord;
  completionStatus: {
    total: number;
    satisfied: number;
    open: number;
    summary: string;
    satisfiedCriteriaHighlights?: string[];
    nextOpenCriterion?: string | null;
    nextOpenResponsibilitySummary?: string | null;
  };
  currentBlocker: {
    blockerId: string | null;
    title: string;
    detail: string | null;
    priorityReason?: string | null;
    ageLabel?: string | null;
    responsibilitySummary?: string | null;
  };
  currentDependency?: {
    dependencyId: string | null;
    title: string;
    detail: string | null;
    priorityReason?: string | null;
    ageLabel?: string | null;
    responsibilitySummary?: string | null;
  };
  keySource: ResumeKeySourceSliceRecord;
  currentMethod: ResumeCurrentMethodSliceRecord;
  nextSuggestedMove: string;
};

export type TaskDetailBase = TaskRecord & {
  activeWaitingItem: WaitingItemRecord | null;
  activeBlocker: BlockerRecord | null;
  activeDependency?: TaskDependencyRecord | null;
  dependencyReevaluation?: TaskListItemRecord['dependencyReevaluation'];
  artifacts: ArtifactRecord[];
  completionCriteria: CompletionCriteriaRecord[];
  sourceContexts: SourceContextRecord[];
  taskFiles?: TaskFileRecord[];
  processTemplates: AppliedProcessTemplateRecord[];
  availableProcessTemplates: ProcessTemplateRecord[];
  timeline: TimelineEventRecord[];
};

export type TaskDetail = TaskDetailBase & {
  resumeCard: TaskResumeCardRecord;
};

export type TimelineEventRecord = {
  id: string;
  taskId: string;
  type: string;
  payload: string | null;
  createdAt: string;
};

export type CreateTaskInput = {
  title: string;
  summary?: string;
};

export type UpdateTaskInput = {
  id: string;
  title?: string;
  summary?: string | null;
  nextStep?: string | null;
  waitingReason?: string | null;
  riskLevel?: TaskRiskLevel;
  riskNote?: string | null;
};

export type TransitionTaskInput = {
  id: string;
  nextState: TaskState;
  waitingReason?: string | null;
};

export type TaskCompletionCheckAction =
  | 'passed'
  | 'override_completed'
  | 'marked_waiting';

export type RecordTaskCompletionCheckInput = {
  taskId: string;
  action: TaskCompletionCheckAction;
  criteriaTotal: number;
  criteriaSatisfied: number;
  criteriaOpen: number;
  reason?: string | null;
  runVerificationTone?: 'pass' | 'warn' | 'fail' | 'pending' | null;
  runVerificationLabel?: string | null;
  runVerificationDetail?: string | null;
  source?: 'task_completion_modal' | 'lightweight_rule_engine' | 'ai_verifier';
  checkedAt?: string;
};
