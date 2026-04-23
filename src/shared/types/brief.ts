import type { ArtifactRecord } from './artifact.js';
import type { BlockerRecord } from './blocker.js';
import type { BriefSnapshotRecord } from './brief-snapshot.js';
import type { ProcessTemplateKind } from './process-template.js';
import type { SchedulerStatus } from './scheduler.js';
import type { DecisionRecord } from './decision.js';
import type { TaskDependencyRecord } from './task-dependency.js';
import type {
  ResumeCurrentMethodSliceRecord,
  ResumeKeySourceSliceRecord,
  ResumeLatestChangeRecord,
  TaskRecord,
  TaskRiskLevel,
} from './task.js';
import type { WaitingItemRecord } from './waiting-item.js';

export type RecommendedActionIntent = {
  type:
    | 'open_task'
    | 'focus_next_step'
    | 'focus_waiting_follow_up'
    | 'focus_risk_review'
    | 'continue_from_artifact'
    | 'focus_source_context';
  focusArea?: 'detail' | 'quick-actions';
  prefillNextStep?: string | null;
  prefillRunInstructions?: string | null;
  prefillRiskLevel?: TaskRiskLevel | null;
  prefillRiskNote?: string | null;
  sourceContextId?: string | null;
};

export type RecommendedAction = {
  id: string;
  label: string;
  reason: string;
  taskId: string | null;
  priority: 'high' | 'medium' | 'low';
  lane?: PriorityLane;
  intent?: RecommendedActionIntent;
};

export type PriorityLane =
  | 'escalate_now'
  | 'unblock_or_decide'
  | 'continue_or_review'
  | 'clarify'
  | 'steady';

export type HomeActivityRecord = {
  id: string;
  sourceType: 'decision' | 'run' | 'blocker' | 'task' | 'dependency';
  sourceId: string;
  lane?: PriorityLane;
  relatedSourceContextId?: string | null;
  relatedTaskId?: string | null;
  taskId: string;
  taskTitle: string;
  title: string;
  status: string;
  updatedAt: string;
};

export type HomeSourceContextRecord = {
  id: string;
  taskId: string;
  taskTitle: string;
  title: string;
  kind: string;
  isKey: boolean;
  uri: string | null;
  note: string | null;
  updatedAt: string;
};

export type HomeTaskResumePreviewRecord = {
  taskId: string;
  taskTitle: string;
  lane?: PriorityLane;
  completionStatus?: {
    total: number;
    satisfied: number;
    open: number;
  };
  currentState: string;
  latestChange: ResumeLatestChangeRecord;
  currentBlocker?: {
    title: string | null;
    priorityReason: string | null;
    ageLabel?: string | null;
  };
  currentDependency?: {
    title: string | null;
    priorityReason: string | null;
    ageLabel?: string | null;
  };
  keySource: {
    sourceContextId: string | null;
    title: string | null;
    priorityReason: string | null;
  };
  currentMethod: {
    title: string | null;
    selectionReason: string | null;
  };
  nextSuggestedMove: string;
  contextActionLabel: string;
  contextActionIntent: RecommendedActionIntent;
};

export type HomeTaskSliceRecord = Pick<
  TaskRecord,
  'id' | 'title' | 'summary' | 'state' | 'nextStep' | 'waitingReason' | 'riskLevel' | 'riskNote'
> & {
  activeWaitingItem?: WaitingItemRecord | null;
  activeBlocker?: BlockerRecord | null;
  activeDependency?: TaskDependencyRecord | null;
  completionProgress?: {
    total: number;
    satisfied: number;
    open: number;
    satisfiedCriteriaHighlights?: string[];
  };
  closeoutEvidence?: {
    sourceType: 'decision' | 'run';
    sourceId: string;
    title: string;
    status: 'approved' | 'completed';
  } | null;
};

export type BriefProcessTemplateCandidate = {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  kind: ProcessTemplateKind;
  tags: string[];
  taskIds: string[];
  taskTitles: string[];
  notes: string[];
};

export type HomeBriefData = {
  activeTaskCount: number;
  pendingDecisionCount: number;
  completedTaskCount: number;
  recentRunCount: number;
  waitingTaskCount: number;
  blockerTaskCount: number;
  dependencyTaskCount?: number;
  escalationTaskCount: number;
  highRiskTaskCount: number;
  missingNextStepTaskCount: number;
  completionReadyTaskCount?: number;
  nearCompletionTaskCount?: number;
  recentTasks: HomeTaskSliceRecord[];
  waitingTasks: HomeTaskSliceRecord[];
  blockerTasks: HomeTaskSliceRecord[];
  dependencyTasks?: HomeTaskSliceRecord[];
  escalationTasks: HomeTaskSliceRecord[];
  highRiskTasks: HomeTaskSliceRecord[];
  missingNextStepTasks: HomeTaskSliceRecord[];
  completionReadyTasks?: HomeTaskSliceRecord[];
  nearCompletionTasks?: HomeTaskSliceRecord[];
  pendingDecisions: DecisionRecord[];
  recommendedActions: RecommendedAction[];
  recentArtifacts: ArtifactRecord[];
  recentSourceContexts: HomeSourceContextRecord[];
  recentTaskResumes: HomeTaskResumePreviewRecord[];
  recentActivity: HomeActivityRecord[];
  recentBriefSnapshots: BriefSnapshotRecord[];
  schedulerStatus: SchedulerStatus;
  processTemplateCandidates?: BriefProcessTemplateCandidate[];
  priorityLane?: PriorityLane;
  priorityHeadline?: string;
  priorityLede?: string;
};
